/**
 * claimGuestApplication.js
 * ========================
 * Server-side merge path for an authenticated driver re-submitting an
 * application that was originally created through the GUEST flow.
 *
 * Why this exists (P1 audit fix):
 * Guest applications are keyed by the deterministic SHA-256 hash of
 * (companyId, email, phone) and store that hash in applicantId/driverId/
 * userId (see shared/buildApplicationDoc.js). When the same person later
 * applies while LOGGED IN, the client computes the same doc ID and issues a
 * merge update — but the Firestore driver self-update rule only allows
 * updates when resource.data.applicantId/driverId equals the caller's uid.
 * For a guest-created doc those fields hold the hash, so the write is
 * permission-denied and the submission gets stuck in the offline queue
 * forever. Rules are intentionally NOT loosened; this callable performs the
 * merge with the Admin SDK after proving ownership server-side.
 *
 * Trust model (no weaker than existing surfaces):
 * - MERGE (write form data): caller must prove knowledge of the exact
 *   email+phone that key the record — the recomputed applicant hash must
 *   match the target document. This is the same trust bar as the public
 *   submitGuestApplication callable, which already lets anyone with that
 *   email+phone merge into the same record without auth.
 * - CLAIM (link driverId/userId to the caller's account, which grants the
 *   driver dashboard read access): additionally requires a VERIFIED auth
 *   email equal to the application's email — the same bar as the
 *   isEmailOwner() read rule in firestore.rules.
 *
 * Field safety: because the Admin SDK bypasses rules, the merge is filtered
 * through an explicit allowlist mirroring applicationDriverSelfUpdateAllowedKeys
 * in firestore.rules (plus benign presentation metadata). Recruiter-owned
 * fields (status, assignedTo, internal notes, createdAt, confirmationNumber)
 * can never be touched through this path.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('./firebaseAdmin');
const { checkRateLimit } = require('./shared/rateLimiter');
const { generateApplicantKey } = require('./shared/buildApplicationDoc');

// Mirror of applicationDriverSelfUpdateAllowedKeys in firestore.rules, minus
// 'status' (create-only/recruiter-owned on this path) — plus the benign
// presentation metadata the authenticated submit payload carries.
const DRIVER_MERGE_ALLOWED_KEYS = new Set([
    // Profile/contact fields
    'firstName', 'lastName', 'middleName', 'email', 'phone', 'dob',
    'address', 'city', 'state', 'zip', 'licenseNumber', 'cdlState', 'cdlClass', 'cdlExpiration',
    'experience', 'experience-years',
    // Structured self-reported sections
    'employers', 'violations', 'accidents', 'schools', 'military', 'previousAddresses',
    // Driver-submitted uploads and signatures
    'cdl-front', 'cdl-back', 'medical-card-upload', 'twic-card-upload', 'mvr-upload',
    'mvr-consent-upload', 'drug-test-consent-upload', 'ssc-upload',
    'signature', 'signatureType',
    // Non-privileged presentation metadata
    'sourceType', 'sourceSlug',
    // Lifecycle + timestamps related to self-submission
    'lifecycle',
    // Benign job/company presentation fields from the authenticated wizard
    'jobId', 'jobTitle', 'companyName',
]);

function filterToAllowedKeys(formData) {
    const filtered = {};
    for (const [key, value] of Object.entries(formData || {})) {
        if (DRIVER_MERGE_ALLOWED_KEYS.has(key) && value !== undefined) {
            filtered[key] = value;
        }
    }
    return filtered;
}

function normalizeEmail(email) {
    return (email || '').toLowerCase().trim();
}

exports.claimGuestApplication = onCall(
    { cors: true, region: 'us-central1' },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'You must be signed in to submit an application.');
        }
        const uid = request.auth.uid;

        const allowed = await checkRateLimit(`claim_app_${uid}`, 10, 60, 'closed');
        if (!allowed) {
            throw new HttpsError('resource-exhausted', 'Too many submission attempts. Please wait a moment and try again.');
        }

        const { companyId, applicationId, formData } = request.data || {};
        if (!companyId || typeof companyId !== 'string') {
            throw new HttpsError('invalid-argument', 'Missing or invalid companyId.');
        }
        if (!applicationId || typeof applicationId !== 'string') {
            throw new HttpsError('invalid-argument', 'Missing or invalid applicationId.');
        }
        if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
            throw new HttpsError('invalid-argument', 'Missing or invalid formData.');
        }

        const appRef = db.collection('companies').doc(companyId).collection('applications').doc(applicationId);
        const snap = await appRef.get();
        if (!snap.exists) {
            // Nothing to claim — the client's direct create path handles new docs.
            throw new HttpsError('not-found', 'Application not found.');
        }
        const existing = snap.data();

        if (existing.companyId && existing.companyId !== companyId) {
            throw new HttpsError('failed-precondition', 'Application does not belong to this company.');
        }

        // --- Ownership proof ---
        const alreadyOwned =
            existing.driverId === uid ||
            existing.applicantId === uid ||
            existing.userId === uid;

        // Hash proof: the submitted email+phone must key exactly this record.
        // (Same trust bar as the public guest merge path.)
        const { applicantKey } = generateApplicantKey(
            companyId,
            formData.email || '',
            formData.phone || '',
        );
        const docBaseId = applicationId.split('_')[0];
        const hashMatches = applicantKey === docBaseId;

        if (!alreadyOwned && !hashMatches) {
            throw new HttpsError(
                'permission-denied',
                'This application was submitted with different contact details. ' +
                'Please use the same email and phone number as your original application.',
            );
        }

        // Claim (grant dashboard read by linking the account) only with a
        // verified email that matches the application — mirrors isEmailOwner().
        const tokenEmail = normalizeEmail(request.auth.token.email);
        const emailVerified = request.auth.token.email_verified === true;
        const docEmail = normalizeEmail(existing.email);
        const canClaim = alreadyOwned || (emailVerified && tokenEmail && tokenEmail === docEmail);

        // --- Build the merge payload (create-safe: never touch recruiter-owned fields) ---
        const payload = filterToAllowedKeys(formData);
        payload.submittedAt = FieldValue.serverTimestamp();
        payload.updatedAt = FieldValue.serverTimestamp();
        payload.lifecycle = {
            ...(typeof payload.lifecycle === 'object' && payload.lifecycle !== null ? payload.lifecycle : {}),
            mergedViaClaim: true,
            claimProcessedAt: new Date().toISOString(),
        };

        let claimed = false;
        if (canClaim && existing.driverId !== uid) {
            payload.driverId = uid;
            payload.userId = uid;
            claimed = true;
        }

        await appRef.set(payload, { merge: true });

        console.log(
            `[claimGuestApplication] Merged application ${applicationId} for company ${companyId} ` +
            `(uid=${uid}, claimed=${claimed}, alreadyOwned=${alreadyOwned})`,
        );

        return {
            success: true,
            applicationId,
            claimed: claimed || alreadyOwned || existing.driverId === uid,
        };
    },
);
