import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from '@lib/firebase';

/**
 * Driver offer responses — extracted verbatim from driverService.js.
 * The status written here must be one of the offer statuses whitelisted for
 * driver self-updates in firestore.rules ('Offer Accepted' / 'Offer Declined').
 */
export async function respondToOffer(companyId, applicationId, response, signatureData = null) {
    if (!companyId || !applicationId) throw new Error("Missing ID");
    if (!companyId) throw new Error("Company ID is required.");
    const docRef = doc(db, "companies", companyId, "applications", applicationId);

    const updatePayload = {
        status: response,
        [`offerDetails.response`]: response,
        [`offerDetails.respondedAt`]: new Date().toISOString(),
        offerResponseDate: serverTimestamp()
    };

    if (signatureData) {
        updatePayload[`offerDetails.signature`] = signatureData;
    }

    await updateDoc(docRef, updatePayload);
    return true;
}
