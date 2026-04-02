/**
 * getSigningLink.js — ADV-1 FIX: Secure callable function to retrieve
 * the full signing link (including token) for company team members.
 *
 * Since BUG-2 moved the accessToken to a secrets subcollection that clients
 * can't read, this function provides an authenticated way for team members
 * to retrieve the full link from the History view.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db } = require("./firebaseAdmin");

exports.getSigningLink = onCall({ cors: true }, async (request) => {
    // 1. Require authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const { companyId, requestId } = request.data;
    if (!companyId || !requestId) {
        throw new HttpsError('invalid-argument', 'Missing companyId or requestId.');
    }

    // 2. Verify the caller is a team member of this company
    const memberSnap = await db.collection('companies').doc(companyId)
        .collection('team').doc(request.auth.uid).get();

    if (!memberSnap.exists) {
        throw new HttpsError('permission-denied', 'You are not a member of this company.');
    }

    // 3. Read the signing request to verify it exists and is still active
    const reqSnap = await db.collection('companies').doc(companyId)
        .collection('signing_requests').doc(requestId).get();

    if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Signing request not found.');
    }

    const reqData = reqSnap.data();
    if (reqData.status === 'signed') {
        throw new HttpsError('failed-precondition', 'This document has already been signed.');
    }

    // 4. Read the token from secrets subcollection (Admin SDK bypasses rules)
    const secretSnap = await db.collection('companies').doc(companyId)
        .collection('signing_requests').doc(requestId)
        .collection('secrets').doc('token').get();

    // ADV-4: Fallback to parent doc for pre-migration requests
    const accessToken = secretSnap.exists
        ? secretSnap.data().accessToken
        : (reqData.accessToken || null);

    if (!accessToken) {
        throw new HttpsError('not-found', 'No active signing token found. The link may have been used or expired.');
    }

    // 5. Build and return the full link
    const baseUrl = process.env.APP_BASE_URL || 'https://app.safehaul.io';
    const signingLink = `${baseUrl}/sign/${companyId}/${requestId}?token=${accessToken}`;

    return { signingLink };
});
