const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("../../firebaseAdmin");

/**
 * SECURITY HELPER: Assert User is Company Admin/Member
 * Prevents IDOR attacks where a user manages another company's data.
 *
 * @param {string} userId  - Firebase Auth UID
 * @param {string} companyId - Target company
 * @param {object} [token]   - Optional decoded Firebase ID token (request.auth.token).
 *                             When provided, custom claims are checked first (fast path),
 *                             which avoids trusting mutable Firestore documents for auth.
 */
const assertCompanyAdmin = async (userId, companyId, token = null) => {
    if (!userId || !companyId) throw new HttpsError('invalid-argument', 'Missing authentication context.');

    // 0. Fast path: custom claims (immutable, server-set, cannot be self-edited).
    //    Token shape can be either flat (token.globalRole) or nested (token.roles.globalRole)
    //    depending on when the claim was last refreshed.  Both are checked here.
    if (token) {
        const globalRole = token.globalRole || (token.roles && token.roles.globalRole);
        if (globalRole === 'super_admin') return;

        const companyRole = token.roles && token.roles[companyId];
        if (companyRole && ['company_admin', 'hr_user', 'recruiter'].includes(companyRole)) return;
    }

    // 1. Check Team Membership (Subcollection - Legacy)
    const memberSnap = await db.collection('companies').doc(companyId).collection('team').doc(userId).get();
    if (memberSnap.exists) return; // Success

    // 1b. Check Global Memberships Collection (New System)
    try {
        const memSnapshot = await db.collection('memberships')
            .where('userId', '==', userId)
            .where('companyId', '==', companyId)
            .limit(1)
            .get();
        if (!memSnapshot.empty) return; // Success
    } catch (err) {
        console.warn(`[Auth Warning] Failed to check memberships for ${userId}: ${err.message}`);
    }

    // 2. Check Company Document Fields (Owner/Creator).
    //    These fields are written exclusively by server-side Cloud Functions / Admin SDK
    //    (e.g. company creation, ownership transfer), not by user-controlled writes.
    //    Firestore rules for /companies/{id} allow only company_admin or super_admin to
    //    update the document, so these fields cannot be self-assigned by ordinary users.
    const companySnap = await db.collection('companies').doc(companyId).get();
    if (companySnap.exists) {
        const data = companySnap.data();
        if (data.ownerId === userId) return;
        if (data.createdBy === userId) return;
        if (data.adminId === userId) return;
    }

    // 3. Super Admin Bypass — use only the Admin SDK user record; do NOT trust the
    //    mutable users/{uid} document for role checks (SH-003 fix).
    try {
        const userRecord = await admin.auth().getUser(userId);
        const claims = userRecord.customClaims || {};
        const claimRole = claims.globalRole || (claims.roles && claims.roles.globalRole);
        if (claimRole === 'super_admin') return;
    } catch (e) {
        console.warn(`[Auth Debug] Failed to fetch custom claims for ${userId}: ${e.message}`);
    }

    throw new HttpsError('permission-denied', 'You do not have administrative access to this company.');
};

module.exports = { assertCompanyAdmin };
