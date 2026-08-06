/**
 * Guest application submission via callable function.
 * Uses Admin SDK writes, so Firestore client rules do not block guest intake.
 */

const functions = require('firebase-functions/v1');
const { db } = require('./firebaseAdmin');
const { assertCompanyAcceptingIntake } = require('./shared/companyTenant');
const { assertRequiredUploads, buildApplicationDoc } = require('./shared/buildApplicationDoc');
const { upsertApplicationDoc } = require('./shared/upsertApplicationDoc');
const { buildApplicationDefinition } = require('./shared/applicationDefinition');
const { buildSubmissionSnapshot } = require('./shared/submissionSnapshot');
const { writeSubmissionSnapshot } = require('./shared/writeSubmissionSnapshot');

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
        // Questions as the DRIVER saw them. The public apply page renders from
        // public_profiles, so that projection — not the company document — is the
        // faithful record of what was asked. Falls back to the company document
        // only when no public profile exists.
        let customQuestions = Array.isArray(companyData.customQuestions) ? companyData.customQuestions : [];

        try {
            const publicSnap = await db.collection('public_profiles').doc(companyId).get();
            if (publicSnap.exists) {
                const publicData = publicSnap.data() || {};
                companyName = publicData.companyName || companyName;
                applicationConfig = publicData.applicationConfig ?? applicationConfig;
                if (Array.isArray(publicData.customQuestions)) {
                    customQuestions = publicData.customQuestions;
                }
            }
        } catch (err) {
            console.error('[submitGuestApplication] Public profile lookup error:', err);
        }

        assertRequiredUploads(applicationConfig, normalizedFormData);

        const {
            applicantKeyFull,
            applicationId,
            confirmationNumber,
            applicationDoc,
            now,
        } = buildApplicationDoc({
            companyId,
            companyName,
            email,
            phone,
            signature,
            formData: normalizedFormData,
        });

        try {
            const result = await upsertApplicationDoc({
                db,
                companyId,
                applicationId,
                applicantKeyFull,
                applicationDoc,
                now,
                logLabel: 'submitGuestApplication',
            });
            // Freeze exactly what this driver saw, answered, accepted and signed.
            //
            // Built AFTER the upsert so it records the final application id (the
            // upsert can suffix it on hash collision). Company identity details
            // (address, DOT/MC) come from the company document because the public
            // profile deliberately does not expose them, while the questions and
            // config come from the public projection the driver actually rendered.
            //
            // Best-effort: a snapshot failure must not lose an application the
            // driver has already submitted. It is logged loudly, and Stage 8's
            // reconstruction job can rebuild what is recoverable.
            let submissionSnapshot = null;
            try {
                const definition = buildApplicationDefinition({
                    company: {
                        ...companyData,
                        companyName,
                        applicationConfig,
                        customQuestions,
                    },
                });

                const snapshot = buildSubmissionSnapshot({
                    definition,
                    formData: normalizedFormData,
                    acceptances: normalizedFormData.agreementAcceptances,
                    signature: {
                        image: signature,
                        type: normalizedFormData.signatureType || 'drawn',
                        capturedAt: new Date().toISOString(),
                    },
                    submittedAt: new Date().toISOString(),
                });

                submissionSnapshot = await writeSubmissionSnapshot({
                    db,
                    companyId,
                    applicationId: result.applicationId,
                    snapshot,
                    ownerIds: {
                        applicantId: result.applicationId,
                        driverId: result.applicationId,
                    },
                    logLabel: 'submitGuestApplication',
                });
            } catch (snapshotError) {
                console.error(
                    '[submitGuestApplication] Submission snapshot failed for application '
                    + `${result.applicationId} (company ${companyId}):`,
                    snapshotError
                );
            }

            return {
                ...result,
                confirmationNumber: result.confirmationNumber || confirmationNumber,
                snapshotId: submissionSnapshot ? submissionSnapshot.snapshotId : null,
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
