/**
 * getSignedPevUrl.js
 * ==================
 * Generates a time-limited signed download URL for PEV result PDFs stored in Cloud Storage.
 *
 * The PEV-BRK-3 fix correctly changed the backend to store permanent Cloud Storage paths
 * instead of expiring signed URLs. This companion function generates fresh signed URLs
 * on demand when a company admin clicks "View Result" in the PEV tab.
 *
 * Security:
 *  - Requires authentication
 *  - Validates that the caller belongs to the company that owns the file
 *  - Path must start with `companies/` and contain `pev_results/` or `pev_signatures/`
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db, storage } = require("./firebaseAdmin");
const { logger } = require("firebase-functions");

exports.getSignedPevUrl = onCall({ cors: true }, async (request) => {
    // 1. Auth check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Login required.');
    }

    const { storagePath } = request.data || {};

    if (!storagePath || typeof storagePath !== 'string') {
        throw new HttpsError('invalid-argument', 'Missing or invalid storagePath.');
    }

    // 2. Security: Validate the path structure
    //    Must be: companies/{companyId}/.../(pev_results|pev_signatures)/...
    const pathParts = storagePath.split('/');
    if (pathParts[0] !== 'companies' || pathParts.length < 4) {
        throw new HttpsError('invalid-argument', 'Invalid storage path format.');
    }

    const companyId = pathParts[1];

    // Ensure the path is for PEV-related files only
    const isPevPath = storagePath.includes('/pev_results/') || storagePath.includes('/pev_signatures/');
    if (!isPevPath) {
        throw new HttpsError('invalid-argument', 'This endpoint only serves PEV result files.');
    }

    // 3. Security: Verify caller belongs to the company
    try {
        const userRecord = await admin.auth().getUser(request.auth.uid);
        const claims = userRecord.customClaims || {};
        const hasCompanyRole = claims.roles && claims.roles[companyId];
        const globalRole = claims.globalRole || claims.roles?.globalRole;
        const isSuperAdmin = globalRole === 'super_admin';

        if (!hasCompanyRole && !isSuperAdmin) {
            // Fallback: check team subcollection
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
        if (authErr?.code === 'permission-denied' || authErr?.code === 'functions/permission-denied') throw authErr;
        logger.warn('[getSignedPevUrl] Auth check failed:', authErr?.message || authErr);
        throw new HttpsError('internal', 'Unable to verify company access.');
    }

    // 4. Generate signed URL (1 hour expiry — enough time to view/download)
    try {
        const bucket = storage.bucket();
        const file = bucket.file(storagePath);

        // Verify file exists
        const [exists] = await file.exists();
        if (!exists) {
            throw new HttpsError('not-found', 'The requested file does not exist in storage.');
        }

        const [signedUrl] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });

        logger.info(`[getSignedPevUrl] Generated signed URL for: ${storagePath}`);
        return { success: true, url: signedUrl };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[getSignedPevUrl] Error generating signed URL:', error);
        throw new HttpsError('internal', 'Failed to generate download URL.');
    }
});
