const { onRequest } = require("firebase-functions/v2/https");
const { admin, db } = require("../../firebaseAdmin");
const nodemailer = require("nodemailer");
const { enqueueWorker } = require("../services/queueService");
const { isBlacklisted } = require("../../blacklist");
const SMSAdapterFactory = require("../../integrations/factory");
const { decrypt } = require("../../integrations/encryption");

const delay = ms => new Promise(res => setTimeout(res, ms));

exports.processBulkBatch = onRequest({ timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
    // Validate Task Queue Token (OIDC) or simple payload check
    // In V2 onRequest, we can check req.body directly.
    const { companyId, sessionId } = req.body;

    if (!companyId || !sessionId) {
        return res.status(400).send("Missing companyId or sessionId");
    }

    try {
        const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc(sessionId);
        const sessionSnap = await sessionRef.get();

        if (!sessionSnap.exists) {
            return res.status(404).send("Session not found");
        }

        const sessionData = sessionSnap.data();
        const { status, targetIds, progress, config, leadSourceType } = sessionData;

        // 1. Status Check
        if (status !== 'active') {
            return res.status(200).send(`Session is ${status}. Stopping worker.`);
        }

        // 1. Claim Batch Transactionally
        let batchIds = [];
        let startPointer = 0;
        let endPointer = 0;

        try {
            const claimResult = await db.runTransaction(async (t) => {
                const doc = await t.get(sessionRef);
                if (!doc.exists) throw new Error("Session not found");

                const data = doc.data();
                // Re-check status inside transaction
                if (data.status !== 'active') return null;

                const current = data.progress?.currentPointer || 0;
                const total = data.targetIds?.length || 0;

                if (current >= total) return { finished: true };

                const BATCH_SIZE = 50;
                const next = Math.min(current + BATCH_SIZE, total);

                // CLAIM: Advance the pointer immediately
                t.update(sessionRef, {
                    'progress.currentPointer': next,
                    lastUpdateAt: admin.firestore.FieldValue.serverTimestamp()
                });

                return {
                    start: current,
                    end: next,
                    allIds: data.targetIds,
                    sessionData: data // pass data out to avoid re-reading
                };
            });

            if (!claimResult) return res.status(200).send("Session not active (check logs).");
            if (claimResult.finished) {
                // Mark completed if not already?
                // Actually, if we are here, current >= total.
                await sessionRef.update({ status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() });
                return res.status(200).send("Session already completed.");
            }

            batchIds = claimResult.allIds.slice(claimResult.start, claimResult.end);
            startPointer = claimResult.start;
            endPointer = claimResult.end;

            // Use the data we already fetched
            // sessionData variable in outer scope is not used much below, except for config/leadSourceType
            // Let's update the outer scope variables if needed or just use what we returned.
            // But we can't easily update 'const' variables from outer scope if we don't change them to let.
            // The code below uses `sessionData` which was defined at line 28.
            // We should update `sessionData` to use the fresh one from transaction to be safe? 
            // Actually, line 28 `sessionData` is from `sessionSnap` before transaction.
            // That's fine for `config` and `leadSourceType` (immutable mostly).
            // But `progress` is mutable.
            // However, we just used the transaction to determine the batch.
            // The rest of the logic relies on `batchIds`.

        } catch (e) {
            console.error("Batch Claim Transaction Failed:", e);
            throw e;
        }
        // console.log(`[Batch Worker] Processing ${batchIds.length} items (${currentPointer} - ${endPointer}) for session ${sessionId}`);

        // --- PRELOAD RESOURCES ---
        const companySnap = await db.collection('companies').doc(companyId).get();
        const companyName = companySnap.exists ? companySnap.data().name : "SafeHaul Company";

        // Setup Sender (SMS or Email)
        let adapter = null;
        let emailTransporter = null;
        let senderId = sessionData.createdBy;

        if (config.method === 'sms') {
            try {
                // Use factory to get appropriate adapter (accounts for per-line credentials/JWTs)
                adapter = await SMSAdapterFactory.getAdapterForUser(companyId, senderId);
            } catch (e) {
                console.error("Failed to load SMS Adapter:", e);
                // Fail the whole batch? Or just default?
                // If we can't send, we should fail.
            }
        } else if (config.method === 'email') {
            // Setup Nodemailer
            try {
                const emailSettingsDoc = await db.collection('companies').doc(companyId).collection('integrations').doc('email_settings').get();
                if (emailSettingsDoc.exists) {
                    const emailSettings = emailSettingsDoc.data();
                    let mailPass = emailSettings.password;

                    try {
                        if (mailPass && mailPass.includes(':')) { // Simple heuristic
                            const decrypted = decrypt(mailPass);
                            if (decrypted) mailPass = decrypted;
                        }
                    } catch (decErr) {/* ignore */ }

                    emailTransporter = nodemailer.createTransport({
                        service: 'gmail', // Simplification, should support others based on config
                        auth: { user: emailSettings.email, pass: mailPass }
                    });
                }
            } catch (e) { console.error("Failed to load Email Transporter:", e); }
        }

        // --- SEQUENTIAL LOOP ---
        let batchSuccessCount = 0;
        let batchFailCount = 0;

        for (const leadId of batchIds) {
            const loopStart = Date.now();
            let success = false;
            let errorMsg = null;
            let recipientName = "Unknown";
            let recipientIdentity = "N/A";

            try {
                // Idempotency Check
                const logRef = sessionRef.collection('logs').doc(leadId);
                const logSnap = await logRef.get();
                if (logSnap.exists) {
                    continue; // Already processed
                }

                // 1. Fetch Data
                let leadData = {};
                let leadDocRef = null;

                if (leadSourceType === 'import') {
                    const tSnap = await sessionRef.collection('targets').doc(leadId).get();
                    if (tSnap.exists) leadData = tSnap.data();
                    else errorMsg = "Imported target data missing";
                } else {
                    if (leadSourceType === 'global') {
                        leadDocRef = db.collection('leads').doc(leadId);
                    } else if (leadSourceType === 'leads') {
                        leadDocRef = db.collection('companies').doc(companyId).collection('leads').doc(leadId);
                    } else {
                        leadDocRef = db.collection('companies').doc(companyId).collection('applications').doc(leadId);
                    }
                    const lSnap = await leadDocRef.get();
                    if (lSnap.exists) leadData = lSnap.data();
                    else errorMsg = "CRM lead data missing";
                }

                if (!errorMsg) {
                    recipientName = `${leadData.firstName || 'Driver'} ${leadData.lastName || ''}`.trim();
                    const phone = leadData.phone || leadData.phoneNumber;

                    // 2. Blacklist Check
                    const blacklisted = await isBlacklisted(companyId, phone);

                    if (blacklisted) {
                        errorMsg = "Number is blacklisted (Opt-out)";
                        success = false;
                    } else if (config.method === 'sms') {
                        if (!adapter) throw new Error("SMS Configuration Invalid");
                        recipientIdentity = phone || "No Phone";

                        if (recipientIdentity !== "No Phone") {
                            const finalMsg = config.message
                                .replace(/\[Driver Name\]/g, leadData.firstName || 'Driver')
                                .replace(/\[Company Name\]/g, companyName)
                                .replace(/\[Recruiter Name\]/g, config.recruiterName || 'your recruiter');

                            await adapter.sendSMS(recipientIdentity, finalMsg, senderId);
                            success = true;
                        } else {
                            errorMsg = "No valid phone number";
                        }
                    } else if (config.method === 'email') {
                        if (!emailTransporter) throw new Error("Email Settings Invalid");
                        recipientIdentity = leadData.email || "No Email";

                        if (recipientIdentity !== "No Email") {
                            const finalBody = config.message
                                .replace(/\[Driver Name\]/g, leadData.firstName || 'Driver')
                                .replace(/\[Company Name\]/g, companyName)
                                .replace(/\[Recruiter Name\]/g, config.recruiterName || 'your recruiter');

                            await emailTransporter.sendMail({
                                from: `"${companyName}" <${emailTransporter.transporter.options.auth.user}>`,
                                to: recipientIdentity,
                                subject: config.subject || `Update from ${companyName}`,
                                text: finalBody,
                                html: `<p>${finalBody.replace(/\n/g, '<br>')}</p>`
                            });
                            success = true;
                        } else {
                            errorMsg = "No valid email";
                        }
                    }
                }

            } catch (err) {
                errorMsg = err.message || "Unknown error";
                success = false;
            }

            // 3. Log Result
            try {
                await sessionRef.collection('logs').doc(leadId).set({
                    leadId,
                    recipientName,
                    recipientIdentity,
                    status: success ? 'delivered' : 'failed',
                    error: errorMsg,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isSuccess: success
                });
            } catch (e) { /* ignore */ }

            if (success) batchSuccessCount++;
            else batchFailCount++;

            // 4. Update Progress (Optimized: Can be done once per batch, but doing granularly ensures live feedback)
            // We'll update the session progress incrementally in memory and write once at end?
            // "Real-Time Progress Update" was in the loops.
            // To be safe against crashes, we should update session progress periodically.
            // But doing it every item is heavy.
            // Let's stick to updating ONLY at the end of the batch, OR catching errors.
            // Wait, previous code updated EVERY item. That's heavy on Firestore.
            // We will aggregate and update at the end of function.

            // 4.5 Update Lead Timestamp (Smart Exclusion)
            if (success && leadDocRef) {
                leadDocRef.update({
                    lastBulkMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastContactedAt: admin.firestore.FieldValue.serverTimestamp()
                }).catch(() => { });
            }

            // 5. Safety Delay (3s requirement)
            const elapsed = Date.now() - loopStart;
            const waitTime = Math.max(3000 - elapsed, 100);
            await delay(waitTime);
        }

        // --- END BATCH UPDATE ---
        const freshSnap = await sessionRef.get(); // Check specific fields? No, just get.
        if (!freshSnap.exists || ['cancelled', 'paused'].includes(freshSnap.data().status)) {
            return res.status(200).send("Session stopped mid-batch.");
        }

        const isKnownLast = (endPointer >= targetIds.length);

        // Atomic Increment for stats (safer than relying on in-memory counters for total)
        // Atomic Increment for stats
        // Note: currentPointer was already updated in the transaction at the start.
        await sessionRef.update({
            // status: isKnownLast ? 'completed' : 'active', // Handled by next worker check or above?
            // Actually, if we claimed the last batch, next worker check will mark complete.
            // But we can mark complete here if we know endPointer == total.
            status: isKnownLast ? 'completed' : 'active',
            'progress.processedCount': admin.firestore.FieldValue.increment(batchIds.length),
            'progress.successCount': admin.firestore.FieldValue.increment(batchSuccessCount),
            'progress.failedCount': admin.firestore.FieldValue.increment(batchFailCount),
            lastUpdateAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(isKnownLast ? { completedAt: admin.firestore.FieldValue.serverTimestamp() } : {})
        });

        // Loop next batch
        if (!isKnownLast) {
            await enqueueWorker(companyId, sessionId, 1);
        }

        res.status(200).send(`Processed batch of ${batchIds.length}. Success: ${batchSuccessCount}, Fail: ${batchFailCount}`);

    } catch (error) {
        console.error("[processBulkBatch] Critical Error:", error);
        res.status(500).send(error.message);
    }
});
