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
    return fullHash.substring(0, 20);
}

function generateApplicationId(applicantKey) {
    const nowPart = Date.now().toString(36);
    const randPart = crypto.randomBytes(3).toString('hex');
    return `${applicantKey}_${nowPart}_${randPart}`;
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
        const hasAppCheck = !!context.app;
        if (!hasAppCheck && !process.env.FUNCTIONS_EMULATOR) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'The function must be called from an App Check verified app.'
            );
        }

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

        const applicantKey = generateApplicantKey(companyId, email, phone);
        const applicationId = generateApplicationId(applicantKey);
        const confirmationNumber = generateConfirmationNumber();

        const now = FieldValue.serverTimestamp();
        const applicationDoc = sanitizeData({
            ...normalizedFormData,
            applicantId: applicationId,
            applicationId: applicationId,
            driverId: applicationId,
            userId: applicationId,
            applicantKey,
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
                appCheckVerified: hasAppCheck,
            },
        });

        applicationDoc.submittedAt = now;
        applicationDoc.createdAt = now;

        try {
            const docRef = db
                .collection('companies')
                .doc(companyId)
                .collection('applications')
                .doc(applicationId);

            await docRef.create(applicationDoc);

            console.log(`[submitGuestApplication] Wrote application ${applicationId} for company ${companyId}`);

            return {
                success: true,
                applicationId,
                confirmationNumber,
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
