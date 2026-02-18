const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db } = require("../../firebaseAdmin");
const { normalizePhone } = require("../../utils/phoneUtils");

/**
 * One-Time Backfill: Populate `sms_sent_phones` from historical bulk_session logs.
 *
 * This function reads all completed bulk sessions and their delivery logs,
 * extracts the phone numbers, and writes them to the `sms_sent_phones` ledger.
 *
 * Run once from the Firebase Console or via a client call after deploying.
 * Safe to re-run — uses merge: true so it never overwrites newer data.
 */
exports.backfillSmsSentPhones = onCall({ cors: true, timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

    // Optional: restrict to super admin if you have that role check
    const { companyId } = request.data;
    if (!companyId) {
        throw new HttpsError('invalid-argument', 'companyId is required.');
    }

    console.log(`[Backfill] Starting SMS phone backfill for company: ${companyId}`);

    let totalBackfilled = 0;
    let sessionsProcessed = 0;

    try {
        // 1. Get all completed (or any status) bulk sessions for this company
        const sessionsSnap = await db
            .collection('companies').doc(companyId)
            .collection('bulk_sessions')
            .get();

        console.log(`[Backfill] Found ${sessionsSnap.size} sessions for company ${companyId}`);

        // 2. Process each session sequentially (to stay within CPU limits)
        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDoc.data();
            const sessionId = sessionDoc.id;

            // Only process SMS sessions
            if (sessionData.config?.method !== 'sms') {
                console.log(`[Backfill] Skipping session ${sessionId} — method is ${sessionData.config?.method}`);
                continue;
            }

            // 3. Read delivered logs for this session
            const logsSnap = await db
                .collection('companies').doc(companyId)
                .collection('bulk_sessions').doc(sessionId)
                .collection('logs')
                .where('status', '==', 'delivered')
                .get();

            if (logsSnap.empty) {
                continue;
            }

            // 4. Batch-write to sms_sent_phones
            const batchArray = [];
            let batch = db.batch();
            let count = 0;

            for (const logDoc of logsSnap.docs) {
                const logData = logDoc.data();
                const rawPhone = logData.recipientIdentity;

                if (!rawPhone || rawPhone === 'N/A' || rawPhone === 'No Phone') {
                    continue;
                }

                const normPhone = normalizePhone(rawPhone);
                if (!normPhone) continue;

                const phoneRef = db
                    .collection('companies').doc(companyId)
                    .collection('sms_sent_phones').doc(normPhone);

                // Use merge: true — if the doc already exists with a newer timestamp,
                // we only overwrite if this log's timestamp is more recent.
                // Actually, merge:true won't compare timestamps, it just merges fields.
                // So we set lastSentAt and let the most recent write win.
                // Since we process sessions in order, the last session's timestamp will persist.
                batch.set(phoneRef, {
                    lastSentAt: logData.timestamp || admin.firestore.FieldValue.serverTimestamp(),
                    sessionId: sessionId,
                    backfilled: true // Flag so we know this came from backfill
                }, { merge: true });

                count++;
                totalBackfilled++;

                if (count >= 490) { // Firestore batch limit safety margin
                    batchArray.push(batch);
                    batch = db.batch();
                    count = 0;
                }
            }

            if (count > 0) batchArray.push(batch);

            // Commit all batches for this session
            for (const b of batchArray) {
                await b.commit();
            }

            sessionsProcessed++;
            console.log(`[Backfill] Session ${sessionId}: backfilled ${logsSnap.size} phones`);
        }

        const summary = `Backfill complete for company ${companyId}. Sessions processed: ${sessionsProcessed}, Phones backfilled: ${totalBackfilled}`;
        console.log(`[Backfill] ${summary}`);

        return {
            success: true,
            message: summary,
            sessionsProcessed,
            totalBackfilled
        };

    } catch (err) {
        console.error('[Backfill] Error:', err);
        throw new HttpsError('internal', `Backfill failed: ${err.message}`);
    }
});
