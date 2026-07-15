import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';

/**
 * FUNC-005: fields that are set ONCE, at application creation.
 *
 * On a merge UPDATE of an existing application, an authenticated driver may only
 * change a narrow allow-list of fields (see `applicationDriverSelfUpdateAllowedKeys`
 * in firestore.rules). Re-sending these create-only fields on a retry, edit, or
 * offline-queue replay would either:
 *   - be REJECTED by the rules (`createdAt` is not in the driver allow-list), or
 *   - clobber recruiter-owned pipeline data (`status`), or
 *   - mint a brand-new `confirmationNumber` each time.
 *
 * So we write them only on first create and drop them on every update.
 */
export const APPLICATION_CREATE_ONLY_FIELDS = [
    'createdAt',
    'confirmationNumber',
    // Derived from confirmationNumber, so it shares its create-only lifecycle.
    'confirmationNumberNormalized',
    'status',
];

function isPermissionDenied(error) {
    return error?.code === 'permission-denied' ||
        // firebase/functions HttpsError surfaces as 'functions/permission-denied'
        error?.code === 'firestore/permission-denied' ||
        /permission[- ]denied|insufficient permissions/i.test(error?.message || '');
}

function parseApplicationPath(docRef) {
    // docRef.path = "companies/{companyId}/applications/{applicationId}"
    const parts = (docRef?.path || '').split('/');
    if (parts.length >= 4 && parts[0] === 'companies' && parts[2] === 'applications') {
        return { companyId: parts[1], applicationId: parts[3] };
    }
    return null;
}

/**
 * P1 FIX (guest → authenticated continuation): when the target application was
 * created through the GUEST flow, its applicantId/driverId hold the
 * deterministic hash — not the caller's uid — so BOTH the client read and the
 * client merge are (correctly) rejected by the Firestore rules. In that case
 * the merge is routed through the claimGuestApplication callable, which proves
 * ownership server-side (same email+phone hash; verified-email match to link
 * the account) and applies an allow-listed merge with the Admin SDK.
 *
 * @param {import('firebase/firestore').DocumentReference} docRef
 * @param {object} data
 * @returns {Promise<{ isNew: boolean, claimed?: boolean }>}
 */
async function claimViaCallable(docRef, data) {
    const pathInfo = parseApplicationPath(docRef);
    if (!pathInfo) return null;

    const formData = { ...data };
    for (const field of APPLICATION_CREATE_ONLY_FIELDS) {
        delete formData[field];
    }

    const claimFn = httpsCallable(functions, 'claimGuestApplication');
    const result = /** @type {{ data?: { claimed?: boolean } }} */ (await claimFn({
        companyId: pathInfo.companyId,
        applicationId: pathInfo.applicationId,
        formData,
    }));
    return { isNew: false, claimed: result?.data?.claimed === true };
}

/**
 * Create-safe merge write for a driver application.
 *
 * - CREATE (doc does not exist): full payload, including createdAt / status /
 *   confirmationNumber, with createdAt stamped as a server timestamp.
 * - UPDATE (doc exists): create-only fields are stripped so the write stays
 *   within the driver self-update allow-list and never overwrites recruiter
 *   status/notes. `merge: true` preserves everything the company team added.
 * - GUEST-CLAIM (doc exists but was created by the guest flow): the direct
 *   read/write is permission-denied; falls back to the claimGuestApplication
 *   callable (see above).
 *
 * `submittedAt` and `updatedAt` are always stamped (both are allow-listed).
 *
 * @param {import('firebase/firestore').DocumentReference} docRef
 * @param {object} data - the full application payload
 * @returns {Promise<{ isNew: boolean, claimed?: boolean }>}
 */
export async function mergeApplicationDoc(docRef, data) {
    let snap;
    try {
        snap = await getDoc(docRef);
    } catch (readError) {
        // A permission-denied READ of a specific doc ID means the doc exists but
        // is not readable by this user — the guest-created-application case.
        // (A nonexistent doc returns exists()=false, it does not throw.)
        if (isPermissionDenied(readError)) {
            const claimResult = await claimViaCallable(docRef, data);
            if (claimResult) return claimResult;
        }
        throw readError;
    }

    const isNew = !snap.exists();

    const payload = { ...data, submittedAt: serverTimestamp(), updatedAt: serverTimestamp() };

    if (isNew) {
        payload.createdAt = serverTimestamp();
    } else {
        for (const field of APPLICATION_CREATE_ONLY_FIELDS) {
            delete payload[field];
        }
    }

    try {
        await setDoc(docRef, payload, { merge: true });
    } catch (writeError) {
        // Existing doc + denied merge = the doc's identity fields don't match
        // this uid (guest-created). Route through the server-side claim path.
        if (!isNew && isPermissionDenied(writeError)) {
            const claimResult = await claimViaCallable(docRef, data);
            if (claimResult) return claimResult;
        }
        throw writeError;
    }
    return { isNew };
}
