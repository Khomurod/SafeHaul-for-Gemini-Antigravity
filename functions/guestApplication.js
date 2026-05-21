/**
 * Guest application submission via callable function.
 * Uses Admin SDK writes, so Firestore client rules do not block guest intake.
 */

const functions = require('firebase-functions/v1');
const { db } = require('./firebaseAdmin');
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { assertCompanyAcceptingIntake } = require('./shared/companyTenant');

function generateApplicantKey(companyId, email, phone) {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const normalizedPhone = (phone || '').replace(/\D/g, '').trim();
    const input = `${companyId}:${normalizedEmail}:${normalizedPhone}`;
    const fullHash = crypto.createHash('sha256').update(input).digest('hex');
    return {
        applicantKey: fullHash.substring(0, 20),
        applicantKeyFull: fullHash,
    };
}

/**
 * The application ID is now identical to the applicant key — a fully
 * deterministic 20-char SHA-256 prefix. Same applicant + same company =>
 * same doc ID. Combined with `set(..., { merge: true })` below, this makes
 * resubmits / offline-queue retries naturally idempotent.
 */
function generateApplicationId(applicantKey) {
    return applicantKey;
}

function generateConfirmationNumber() {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let random = '';
    for (let i = 0; i < 5; i++) {
        random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `SAF-${year}-${random}`;
}

function sanitizeData(data) {
    if (data === undefined) return null;
    if (data === null) return null;
    if (data instanceof Date) return data.toISOString();
    if (Array.isArray(data)) return data.map(sanitizeData);
    if (typeof data === 'object') {
        const sanitized = {};
        for (const key of Object.keys(data)) {
            sanitized[key] = sanitizeData(data[key]);
        }
        return sanitized;
    }
    return data;
}

function getFieldConfig(applicationConfig, fieldId, defaultRequired = true) {
    const config = applicationConfig?.[fieldId];
    return {
        hidden: Boolean(config?.hidden),
        required: config !== undefined ? Boolean(config.required) : defaultRequired
    };
}

function hasUploadedFile(value) {
    if (!value) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'object') {
        return Boolean(value.url || value.storagePath || value.name);
    }
    return false;
}

exports.submitGuestApplication = functions
    .runWith({ memory: '256MB', timeoutSeconds: 30 })
    .https.onCall(async (data, context) => {
        const { checkRateLimit } = require('./shared/rateLimiter');
        const clientIp = context.rawRequest?.ip || 'unknown';
        const allowed = await checkRateLimit(`guest_submit_${clientIp}`, 5, 60, 'closed');
        if (!allowed) {
            throw new functions.https.HttpsError(
                'resource-exhausted',
                'Too many submissions. Please try again in a minute.'
            );
        }

        const { companyId, email, phone, signature, formData: rawFormData } = data || {};
        const normalizedFormData = rawFormData && typeof rawFormData === 'object' ? rawFormData : {};

        if (!companyId || typeof companyId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid companyId.');
        }

        if (data?.companyId && data.companyId !== companyId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'companyId in payload must match submission target.'
            );
        }

        if (normalizedFormData.companyId && normalizedFormData.companyId !== companyId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'companyId in payload must match submission target.'
            );
        }

        if (!email && !phone) {
            throw new functions.https.HttpsError('invalid-argument', 'At least one of email or phone is required.');
        }

        if (!signature) {
            throw new functions.https.HttpsError('invalid-argument', 'Signature is required.');
        }

        const companyData = await assertCompanyAcceptingIntake(db, companyId);
        let companyName = companyData.companyName || 'Unknown Company';
        let applicationConfig = companyData.applicationConfig || null;

        try {
            const publicSnap = await db.collection('public_profiles').doc(companyId).get();
            if (publicSnap.exists) {
                const publicData = publicSnap.data() || {};
                companyName = publicData.companyName || companyName;
                applicationConfig = publicData.applicationConfig ?? applicationConfig;
            }
        } catch (err) {
            console.error('[submitGuestApplication] Public profile lookup error:', err);
        }

        const cdlUploadConfig = getFieldConfig(applicationConfig, 'cdlUpload', true);
        const medCardConfig = getFieldConfig(applicationConfig, 'medCardUpload', true);
        const missingRequiredUploads = [];

        if (!cdlUploadConfig.hidden && cdlUploadConfig.required) {
            if (!hasUploadedFile(normalizedFormData['cdl-front'])) missingRequiredUploads.push('CDL Front');
            if (!hasUploadedFile(normalizedFormData['cdl-back'])) missingRequiredUploads.push('CDL Back');
        }

        if (!medCardConfig.hidden && medCardConfig.required && !hasUploadedFile(normalizedFormData['medical-card-upload'])) {
            missingRequiredUploads.push('Medical Card');
        }

        if (missingRequiredUploads.length > 0) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                `Missing required uploaded documents: ${missingRequiredUploads.join(', ')}.`
            );
        }

        const { applicantKey, applicantKeyFull } = generateApplicantKey(companyId, email, phone);
        let applicationId = generateApplicationId(applicantKey);
        const confirmationNumber = generateConfirmationNumber();

        const now = FieldValue.serverTimestamp();
        const applicationDoc = sanitizeData({
            ...normalizedFormData,
            applicantId: applicationId,
            applicationId: applicationId,
            driverId: applicationId,
            userId: applicationId,
            applicantKey,
            applicantKeyFull,
            confirmationNumber,
            email: (email || '').toLowerCase().trim(),
            phone: phone || '',
            signature,
            signatureType: normalizedFormData.signatureType || 'drawn',
            companyId,
            companyName,
            status: 'New Application',
            sourceType: normalizedFormData.sourceType || 'Public Application',
            sourceSlug: normalizedFormData.sourceSlug || null,
            recruiterCode: normalizedFormData.recruiterCode || null,
            employers: Array.isArray(normalizedFormData.employers) ? normalizedFormData.employers : [],
            violations: Array.isArray(normalizedFormData.violations) ? normalizedFormData.violations : [],
            accidents: Array.isArray(normalizedFormData.accidents) ? normalizedFormData.accidents : [],
            schools: Array.isArray(normalizedFormData.schools) ? normalizedFormData.schools : [],
            military: Array.isArray(normalizedFormData.military) ? normalizedFormData.military : [],
            lifecycle: {
                status: 'submitted',
                submittedAt: new Date().toISOString(),
                clientVersion: normalizedFormData?.lifecycle?.clientVersion || '2.0-bulletproof',
                isGuest: true,
                processedViaFunction: true,
            },
        });

        applicationDoc.updatedAt = now;

        try {
            const docRef = db
                .collection('companies')
                .doc(companyId)
                .collection('applications')
                .doc(applicationId);

            // Idempotent upsert. If a previous attempt already wrote this doc
            // (e.g. offline queue retry, double-tap on Submit), we merge so we
            // never produce a duplicate Firestore document.
            const existing = await docRef.get();
            if (existing.exists) {
                const prev = existing.data() || {};
                if (prev.applicantKeyFull && prev.applicantKeyFull !== applicantKeyFull) {
                    let suffix = 2;
                    let candidateId = `${applicationId}_${suffix}`;
                    while (suffix < 100) {
                        const collisionSnap = await db
                            .collection('companies')
                            .doc(companyId)
                            .collection('applications')
                            .doc(candidateId)
                            .get();
                        if (!collisionSnap.exists) break;
                        const collisionData = collisionSnap.data() || {};
                        if (!collisionData.applicantKeyFull || collisionData.applicantKeyFull === applicantKeyFull) break;
                        suffix += 1;
                        candidateId = `${applicationId}_${suffix}`;
                    }
                    console.error(
                        `[submitGuestApplication] Hash collision for ${applicationId}, using ${candidateId}`
                    );
                    applicationId = candidateId;
                    applicationDoc.applicationId = applicationId;
                    applicationDoc.applicantId = applicationId;
                    applicationDoc.driverId = applicationId;
                    applicationDoc.userId = applicationId;
                }
            }

            const finalDocRef = db
                .collection('companies')
                .doc(companyId)
                .collection('applications')
                .doc(applicationId);

            const existingFinal = await finalDocRef.get();
            if (!existingFinal.exists) {
                applicationDoc.submittedAt = now;
                applicationDoc.createdAt = now;
            } else {
                // Preserve the original confirmation/timestamps so the driver
                // keeps seeing the same SAF-XXXX-XXXXX they saw the first time.
                const prev = existingFinal.data() || {};
                if (prev.confirmationNumber) {
                    applicationDoc.confirmationNumber = prev.confirmationNumber;
                }
                if (prev.submittedAt) applicationDoc.submittedAt = prev.submittedAt;
                if (prev.createdAt) applicationDoc.createdAt = prev.createdAt;
                // Never clobber a status that's already been progressed by a recruiter.
                if (prev.status && prev.status !== 'New Application') {
                    delete applicationDoc.status;
                }
                // P2 HARDENING: Preserve lifecycle progression (onboardingStatus,
                // recruiter-set lifecycle.status, originalSubmittedAt, etc.) but
                // still record that a re-submit happened. Without this, an
                // offline-queue retry one hour after the recruiter advanced the
                // applicant would silently reset lifecycle.status back to
                // 'submitted' and re-fire downstream triggers.
                if (prev.lifecycle && typeof prev.lifecycle === 'object') {
                    applicationDoc.lifecycle = {
                        ...prev.lifecycle,
                        ...applicationDoc.lifecycle,
                        status: prev.lifecycle.status || applicationDoc.lifecycle.status,
                        submittedAt: prev.lifecycle.submittedAt || applicationDoc.lifecycle.submittedAt,
                        lastResubmittedAt: new Date().toISOString(),
                    };
                }
            }

            await finalDocRef.set(applicationDoc, { merge: true });

            console.log(`[submitGuestApplication] Upserted application ${applicationId} for company ${companyId} (existed=${existingFinal.exists})`);

            return {
                success: true,
                applicationId,
                confirmationNumber: applicationDoc.confirmationNumber || confirmationNumber,
                deduplicated: existingFinal.exists,
            };
        } catch (writeError) {
            if (writeError instanceof functions.https.HttpsError) {
                throw writeError;
            }
            console.error('[submitGuestApplication] Firestore write failed:', writeError);
            throw new functions.https.HttpsError(
                'internal',
                'Failed to save application. Please try again.'
            );
        }
    });
