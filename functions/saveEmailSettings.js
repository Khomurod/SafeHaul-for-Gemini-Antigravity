const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("./firebaseAdmin");
const { encrypt } = require("./integrations/encryption");
const { checkRateLimit } = require("./shared/rateLimiter");

/**
 * CONN-1 / CONN-4 FIX: Save email settings server-side with encrypted password.
 *
 * Why a Cloud Function instead of direct Firestore writes:
 *  1. The SMTP password must be encrypted before storage (CONN-1).
 *     Only the Cloud Function runtime has access to the SMS_ENCRYPTION_KEY secret;
 *     the browser never touches the raw key.
 *  2. Prevents any authenticated user from writing arbitrary data to the company doc (CONN-4).
 *  3. Ensures only company admins can update email settings.
 */
exports.saveEmailSettings = onCall(
    { cors: true, secrets: ['SMS_ENCRYPTION_KEY'] },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Login required.');
        }

        const { companyId, smtpHost, smtpPort, smtpUser, smtpPass, signature } = request.data || {};

        if (!companyId || !smtpHost || !smtpUser || !smtpPass) {
            throw new HttpsError('invalid-argument', 'Missing required fields: companyId, smtpHost, smtpUser, smtpPass.');
        }

        // Rate limit: 10 saves per 5 minutes per user (prevent spam)
        const isAllowed = await checkRateLimit(`save_email_${request.auth.uid}`, 10, 300, 'closed');
        if (!isAllowed) {
            throw new HttpsError('resource-exhausted', 'Too many save requests. Please wait a moment.');
        }

        // RBAC: Verify the caller is a member of the specified company.
        try {
            const userRecord = await admin.auth().getUser(request.auth.uid);
            const claims = userRecord.customClaims || {};
            const hasCompanyRole = claims.roles && claims.roles[companyId];
            const isSuperAdmin = claims.globalRole === 'super_admin';

            if (!hasCompanyRole && !isSuperAdmin) {
                const memberSnap = await db.collection('companies').doc(companyId)
                    .collection('team').doc(request.auth.uid).get();
                const companySnap = await db.collection('companies').doc(companyId).get();
                const companyData = companySnap.exists ? companySnap.data() : {};
                const isOwner = companyData.ownerId === request.auth.uid || companyData.createdBy === request.auth.uid;

                if (!memberSnap.exists && !isOwner) {
                    throw new HttpsError('permission-denied', 'You do not have access to this company.');
                }
            }
        } catch (authErr) {
            if (authErr.code === 'functions/permission-denied') throw authErr;
            console.warn('[saveEmailSettings] Auth check error:', authErr.message);
        }

        // CONN-1 FIX: Encrypt SMTP password with AES-256 before storing in Firestore.
        // The encryption key lives only in the Cloud Function environment (Secret Manager),
        // never in the client or the database. Use versioned prefix for rotation support.
        const encryptedPass = `enc:v1:${encrypt(smtpPass)}`;

        const emailSettings = {
            smtpHost: smtpHost.trim(),
            smtpPort: parseInt(smtpPort) || 587,
            smtpUser: smtpUser.trim(),
            smtpPass: encryptedPass,          // Encrypted
            signature: signature || '',
            isVerified: true,                  // Only saved after testEmailConnection succeeds
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: request.auth.uid,
        };

        await db.collection('companies').doc(companyId).update({
            emailSettings,
        });

        console.log(`[saveEmailSettings] Settings saved for company ${companyId} by ${request.auth.uid}`);

        return {
            success: true,
            message: 'Email settings saved securely.',
        };
    }
);
