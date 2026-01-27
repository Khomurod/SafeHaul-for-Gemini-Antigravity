const functions = require("firebase-functions");
const { admin, db } = require("./firebaseAdmin");
const SMSAdapterFactory = require("./integrations/factory");
const { CloudTasksClient } = require("@google-cloud/tasks");
const nodemailer = require('nodemailer');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'truckerapp-system';


const LOCATION = 'us-central1';
const QUEUE_NAME = "bulk-actions-queue";
const tasksClient = new CloudTasksClient();

/**
 * 1. Initialize a Bulk Messaging Session
 * Handles filtering and identifying target IDs across 3 sources.
 */
exports.initBulkSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');

    const { companyId, filters, messageConfig, scheduledFor } = data;
    const userId = context.auth.uid;

    if (!companyId || !filters || !messageConfig) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId, filters, or messageConfig.');
    }

    try {
        // --- 0. FETCH RECRUITER & COMPANY NAMES (Phase 7) ---
        let recruiterName = "Recruiter";
        let companyName = "SafeHaul";

        const userSnap = await db.collection('users').doc(userId).get();
        if (userSnap.exists) recruiterName = userSnap.data().name || recruiterName;

        const companySnap = await db.collection('companies').doc(companyId).get();
        if (companySnap.exists) companyName = companySnap.data().companyName || companyName;
        let targetIds = [];

        // --- 1. RESOLVE SOURCE ---
        // source: 'applications' (Direct), 'leads' (Assigned SafeHaul), 'global' (SafeHaul Pool)
        let baseRef;
        if (filters.leadType === 'global') {
            baseRef = db.collection('leads');
        } else if (filters.leadType === 'leads') {
            // Assigned SafeHaul Leads (distributed by dealer)
            baseRef = db.collection('companies').doc(companyId).collection('leads').where('isPlatformLead', '==', true);
        } else {
            // Direct Company Applications
            baseRef = db.collection('companies').doc(companyId).collection('applications');
        }

        let q = baseRef;

        // --- 2. APPLY FILTERS ---
        // Status Filter
        if (filters.status && filters.status.length > 0 && filters.status !== 'all') {
            // Support for single status or multi-status array calling
            if (Array.isArray(filters.status)) {
                q = q.where('status', 'in', filters.status);
            } else {
                q = q.where('status', '==', filters.status);
            }
        }

        // Recruiter Filter
        if (filters.recruiterId === 'my_leads') {
            q = q.where('assignedTo', '==', userId);
        } else if (filters.recruiterId && filters.recruiterId !== 'all') {
            q = q.where('assignedTo', '==', filters.recruiterId);
        }

        // Created Date Range Filters
        if (filters.createdAfter) {
            const date = new Date(filters.createdAfter);
            q = q.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date));
        }
        if (filters.createdBefore) {
            const date = new Date(filters.createdBefore);
            q = q.where('createdAt', '<=', admin.firestore.Timestamp.fromDate(date));
        }

        // Note: 'notContactedSince' requires a field on the document or a separate query. 
        // For efficiency in this implementation, we will assume a 'lastContactedAt' field exists if filtered.
        if (filters.notContactedSince) {
            const days = parseInt(filters.notContactedSince);
            const date = new Date();
            date.setDate(date.getDate() - days);
            q = q.where('lastContactedAt', '<=', admin.firestore.Timestamp.fromDate(date));
        }

        // Last Call Outcome Filter (Phase 6 & 8)
        if (filters.lastCallOutcome && filters.lastCallOutcome !== 'all') {
            if (filters.leadType === 'global') {
                // Map Label -> ID for Global Pool
                const outcomeMap = {
                    "Connected / Interested": "interested",
                    "Connected / Scheduled Callback": "callback",
                    "Connected / Not Qualified": "not_qualified",
                    "Connected / Not Interested": "not_interested",
                    "Connected / Hired Elsewhere": "hired_elsewhere",
                    "Left Voicemail": "voicemail",
                    "No Answer": "no_answer",
                    "Wrong Number": "wrong_number"
                };
                const outcomeId = outcomeMap[filters.lastCallOutcome];
                if (outcomeId) {
                    q = q.where('lastOutcome', '==', outcomeId);
                } else {
                    // Fallback to literal if mapping fails
                    q = q.where('lastOutcome', '==', filters.lastCallOutcome);
                }
            } else {
                q = q.where('lastCallOutcome', '==', filters.lastCallOutcome);
            }
        }

        // --- 3. EXECUTE QUERY ---
        const limitCount = Math.min(filters.limit || 50, 200); // Increased cap for advanced users
        const snapshot = await q.limit(limitCount).get();
        targetIds = snapshot.docs.map(doc => doc.id);

        // Filter: Exclude Session IDs
        // This must be done in memory after fetching or by fetching the previous sessions first.
        // Memory filter is easiest for < 500 items. 
        if (filters.excludeSessionIds && filters.excludeSessionIds.length > 0) {
            // Fetch target IDs from those sessions? Expensive.
            // Better: 'excludeLeadsFromSessions' -> fetch attempts? 
            // For now, let's skip complex exclusion logic to avoid read spikes unless explicitly requested with optimized schema.
            // A simple implementation if we have a list of leadIds to exclude:
            if (filters.excludedLeadIds && Array.isArray(filters.excludedLeadIds)) {
                targetIds = targetIds.filter(id => !filters.excludedLeadIds.includes(id));
            }
        }

        if (targetIds.length === 0) {
            return { success: false, message: "No drivers found for these criteria." };
        }

        // --- 4. CREATE SESSION ---
        const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc();

        let initialStatus = 'queued';
        let scheduleTime = 0; // 0 means immediate

        if (scheduledFor) {
            const scheduleDate = new Date(scheduledFor);
            const now = new Date();
            if (scheduleDate > now) {
                initialStatus = 'scheduled';
                scheduleTime = (scheduleDate.getTime() - now.getTime()) / 1000;
            }
        }

        const sessionData = {
            id: sessionRef.id,
            status: initialStatus,
            creatorId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            scheduledFor: scheduledFor ? admin.firestore.Timestamp.fromDate(new Date(scheduledFor)) : null,
            config: {
                ...messageConfig,
                filters: filters,
                recruiterName,
                companyName
            },
            progress: {
                totalCount: targetIds.length,
                processedCount: 0,
                successCount: 0,
                failedCount: 0
            },
            targetIds: targetIds,
            currentPointer: 0,
            leadSourceType: filters.leadType // 'applications' | 'leads' | 'global'
        };

        await sessionRef.set(sessionData);

        // --- 5. START WORKER ---
        await enqueueWorker(companyId, sessionRef.id, scheduleTime);

        return {
            success: true,
            sessionId: sessionRef.id,
            targetCount: targetIds.length,
            status: initialStatus
        };

    } catch (error) {
        console.error("[initBulkSession] Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * 2. Pause a Bulk Session
 */
exports.pauseBulkSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, sessionId } = data;
    const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc(sessionId);
    await sessionRef.update({ status: 'paused' });
    return { success: true };
});

/**
 * 3. Resume a Bulk Session
 */
exports.resumeBulkSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, sessionId } = data;
    const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc(sessionId);

    await db.runTransaction(async (t) => {
        const doc = await t.get(sessionRef);
        if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Session not found');
        const s = doc.data();
        if (s.status === 'active') return; // Already active
        t.update(sessionRef, { status: 'active' });
    });

    // Re-ignite the worker
    await enqueueWorker(companyId, sessionId, 0);
    return { success: true };
});

/**
 * 4. Cancel a Bulk Session
 */
exports.cancelBulkSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, sessionId } = data;
    const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc(sessionId);
    await sessionRef.update({ status: 'cancelled' });
    return { success: true };
});

/**
 * 5. Retry Failed Attempts
 * Creates a new session with only the failed IDs from a previous session.
 */
exports.retryFailedAttempts = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, originalSessionId, newMessageConfig } = data;
    const userId = context.auth.uid;

    try {
        // 1. Fetch failed attempts
        const attemptsSnapshot = await db.collection('companies').doc(companyId)
            .collection('bulk_sessions').doc(originalSessionId)
            .collection('attempts')
            .where('status', '==', 'failed')
            .get();

        const failedLeadIds = [...new Set(attemptsSnapshot.docs.map(d => d.data().leadId))];

        if (failedLeadIds.length === 0) {
            return { success: false, message: "No failed attempts found to retry." };
        }

        // 2. Fetch original config if not provided
        let configToUse = newMessageConfig;
        if (!configToUse) {
            const originalSessionSnap = await db.collection('companies').doc(companyId)
                .collection('bulk_sessions').doc(originalSessionId)
                .get();
            configToUse = originalSessionSnap.data().config;
        }

        // 3. Create NEW Session
        const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc();
        const sessionData = {
            id: sessionRef.id,
            status: 'queued',
            creatorId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            config: configToUse,
            progress: {
                totalCount: failedLeadIds.length,
                processedCount: 0,
                successCount: 0,
                failedCount: 0
            },
            targetIds: failedLeadIds,
            currentPointer: 0,
            leadSourceType: 'retry',
            originalSessionId: originalSessionId
        };

        await sessionRef.set(sessionData);

        // 4. Start Worker
        await enqueueWorker(companyId, sessionRef.id, 0);

        return { success: true, sessionId: sessionRef.id, targetCount: failedLeadIds.length };

    } catch (error) {
        console.error("Retry Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});


/**
 * 2. Recursive Worker (Cloud Tasks Target)
 * Processes leads sequentially with carrier-compliant delays.
 */
exports.processBulkBatch = functions.https.onRequest(async (req, res) => {

    // Security check
    if (!req.headers["x-appengine-queuename"] && !process.env.FUNCTIONS_EMULATOR) {
        return res.status(403).send("Forbidden");
    }

    const { companyId, sessionId } = req.body;
    if (!companyId || !sessionId) return res.status(400).send("Missing parameters");

    const sessionRef = db.collection('companies').doc(companyId).collection('bulk_sessions').doc(sessionId);

    try {
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) return res.status(404).send("Session not found");

        const session = sessionSnap.data();
        if (session.status === 'paused' || session.status === 'completed') {
            return res.status(200).send("Session is not active.");
        }

        const { targetIds, currentPointer, config, progress, leadSourceType } = session;

        // Completion check
        if (currentPointer >= targetIds.length) {
            await sessionRef.update({
                status: 'completed',
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.status(200).send("Campaign Complete");
        }

        // --- 1. IDENTIFY TARGET ---
        const leadId = targetIds[currentPointer];
        let success = false;
        let errorMsg = null;
        let recipientName = "Unknown";
        let recipientIdentity = "N/A";

        try {
            let leadDocRef;
            if (leadSourceType === 'global') {
                leadDocRef = db.collection('leads').doc(leadId);
            } else if (leadSourceType === 'leads') {
                leadDocRef = db.collection('companies').doc(companyId).collection('leads').doc(leadId);
            } else {
                leadDocRef = db.collection('companies').doc(companyId).collection('applications').doc(leadId);
            }

            const leadSnap = await leadDocRef.get();
            if (leadSnap.exists) {
                const leadData = leadSnap.data();
                recipientName = `${leadData.firstName || 'Driver'} ${leadData.lastName || ''}`.trim();

                // --- 2. TRANSMIT ---
                if (config.method === 'sms') {
                    recipientIdentity = leadData.phone || leadData.phoneNumber || "No Phone";
                    if (recipientIdentity !== "No Phone") {
                        const adapter = await SMSAdapterFactory.getAdapterForUser(companyId, session.creatorId);

                        // --- VARIABLE INJECTION (Phase 7) ---
                        // Use regex with 'g' for global replacement
                        const finalMsg = config.message
                            .replace(/\[Driver Name\]/g, leadData.firstName || 'Driver')
                            .replace(/\[Company Name\]/g, config.companyName || 'our company')
                            .replace(/\[Recruiter Name\]/g, config.recruiterName || 'your recruiter');

                        await adapter.sendSMS(recipientIdentity, finalMsg, session.creatorId);
                        success = true;
                    } else {
                        errorMsg = "No valid phone number found.";
                    }
                } else if (config.method === 'email') {
                    recipientIdentity = leadData.email || "No Email";
                    if (recipientIdentity !== "No Email") {
                        // Fetch Company Email Settings
                        const companySnap = await db.collection('companies').doc(companyId).get();
                        const emailSettings = companySnap.data()?.emailSettings;

                        if (emailSettings?.email && emailSettings?.appPassword) {
                            const transporter = nodemailer.createTransport({
                                service: 'gmail',
                                auth: { user: emailSettings.email, pass: emailSettings.appPassword }
                            });

                            // --- VARIABLE INJECTION (Phase 7) ---
                            // Use regex with 'g' for global replacement
                            const finalBody = config.message
                                .replace(/\[Driver Name\]/g, leadData.firstName || 'Driver')
                                .replace(/\[Company Name\]/g, config.companyName || 'our company')
                                .replace(/\[Recruiter Name\]/g, config.recruiterName || 'your recruiter');

                            await transporter.sendMail({
                                from: `"${config.companyName || 'SafeHaul'}" <${emailSettings.email}>`,
                                to: recipientIdentity,
                                subject: config.subject || `Update from ${config.companyName || 'SafeHaul'}`,
                                text: finalBody,
                                html: `<p>${finalBody.replace(/\n/g, '<br>')}</p>`
                            });
                            success = true;
                        } else {
                            errorMsg = "Company email settings not configured.";
                        }
                    } else {
                        errorMsg = "No valid email address found.";
                    }
                }
            } else {
                errorMsg = "Lead document missing during execution.";
            }
        } catch (err) {
            console.error(`[Session ${sessionId}] Error processing lead ${leadId}:`, err.message);
            errorMsg = err.message;
        }

        // --- 3. LOG ATTEMPT ---
        await sessionRef.collection('attempts').add({
            leadId,
            recipientName,
            recipientIdentity,
            status: success ? 'delivered' : 'failed',
            error: errorMsg,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // --- 4. UPDATE PROGRESS ---
        const isLast = (currentPointer + 1 >= targetIds.length);
        await sessionRef.update({
            currentPointer: currentPointer + 1,
            'progress.processedCount': admin.firestore.FieldValue.increment(1),
            'progress.successCount': success ? admin.firestore.FieldValue.increment(1) : progress.successCount,
            'progress.failedCount': success ? progress.failedCount : admin.firestore.FieldValue.increment(1),
            status: isLast ? 'completed' : 'active',
            lastUpdateAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // --- 5. SCHEDULE NEXT (Strict 15s for Carrier compliance if SMS) ---
        if (!isLast) {
            const delay = config.method === 'sms' ? (config.interval || 15) : 3; // Email can go faster
            await enqueueWorker(companyId, sessionId, delay);
        }

        res.status(200).send("OK");

    } catch (error) {
        console.error("[processBulkBatch] Critical Error:", error);
        res.status(500).send(error.message);
    }
});

async function enqueueWorker(companyId, sessionId, delaySeconds) {
    const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);
    const url = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/processBulkBatch`;
    const payload = { companyId, sessionId };
    const task = {
        httpRequest: {
            httpMethod: "POST",
            url,
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(JSON.stringify(payload)).toString("base64")
        }
    };
    if (delaySeconds > 0) {
        task.scheduleTime = { seconds: Date.now() / 1000 + delaySeconds };
    }
    await tasksClient.createTask({ parent: queuePath, task });
}


