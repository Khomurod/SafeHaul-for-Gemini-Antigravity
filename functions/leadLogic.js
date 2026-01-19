// functions/leadLogic.js
const { admin, db, auth } = require("./firebaseAdmin");
const { CloudTasksClient } = require("@google-cloud/tasks");

// --- CLOUD TASKS CONFIG ---
// Dynamic Project ID: Uses environment variable set by Firebase/GCP at runtime
const PROJECT_ID = process.env.GCLOUD_PROJECT
    || (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : null)
    || "truckerapp-system"; // Fallback for local emulator only

const LOCATION = "us-central1";
const QUEUE_NAME = "lead-distribution-queue";
const tasksClient = new CloudTasksClient();

// Worker URL must be set after first deployment (V2 functions use Cloud Run URLs)
// Set via: firebase functions:secrets:set DISTRIBUTION_WORKER_URL
// Or in .env: DISTRIBUTION_WORKER_URL=https://processcompanydistribution-xxx-uc.a.run.app
const WORKER_URL = process.env.DISTRIBUTION_WORKER_URL;

// --- CONSTANTS (PRESERVED - defaults, can be overridden by system_settings) ---
let QUOTA_FREE = 50;
let QUOTA_PAID = 200;
const EXPIRY_SHORT_MS = 24 * 60 * 60 * 1000; // 24 Hours
const EXPIRY_LONG_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days
const POOL_COOL_OFF_DAYS = 7;
const POOL_INTEREST_LOCK_DAYS = 7;
const POOL_HIRED_LOCK_DAYS = 60;

const ENGAGED_STATUSES = [
    "Contacted", "Application Started", "Offer Sent", "Offer Accepted", "Interview Scheduled", "Hired", "Approved"
];
const TERMINAL_STATUSES = [
    "Wrong Number", "Not Interested", "Rejected", "Disqualified", "Hired Elsewhere"
];

// --- HELPER: Fetch System Settings from Firestore ---
async function getSystemSettings() {
    try {
        const settingsSnap = await db.collection("system_settings").doc("distribution").get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data();
            return {
                quotaPaid: data.quota_paid || 200,
                quotaFree: data.quota_free || 50,
                maintenanceMode: data.maintenance_mode || false
            };
        }
    } catch (e) {
        console.warn("Could not fetch system_settings, using defaults:", e.message);
    }
    return { quotaPaid: 200, quotaFree: 50, maintenanceMode: false };
}

// --- 1. THE DEALER ENGINE V4 (Cloud Tasks Parallel) ---
async function runLeadDistribution(forceRotate = false) {
    console.log(`Starting 'THE DEALER' Engine V4 PARALLEL (Force Rotate: ${forceRotate})...`);

    try {
        // 1. Check for maintenance mode
        const settings = await getSystemSettings();
        if (settings.maintenanceMode) {
            console.log("Maintenance mode is ON. Skipping distribution.");
            return { success: false, message: "Maintenance mode is enabled." };
        }

        // Update quotas from settings
        QUOTA_FREE = settings.quotaFree;
        QUOTA_PAID = settings.quotaPaid;

        // 2. Get all active companies
        const companiesSnap = await db.collection("companies").where("isActive", "==", true).get();
        if (companiesSnap.empty) {
            return { success: false, message: "No active companies found." };
        }

        const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`Found ${companies.length} active companies. Creating Cloud Tasks...`);

        // 3. Create a Cloud Task for EACH company (parallel execution)
        const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

        // CRITICAL: Validate worker URL is configured
        if (!WORKER_URL) {
            console.error("FATAL: DISTRIBUTION_WORKER_URL environment variable is not set.");
            console.error("After deploying processCompanyDistribution, set this env var to the Cloud Run URL.");
            return {
                success: false,
                message: "Configuration Error: DISTRIBUTION_WORKER_URL is not set. Deploy worker first, then configure the URL."
            };
        }

        const taskPromises = companies.map(async (company) => {
            const isPaid = company.planType?.toLowerCase() === 'paid';
            let quota = isPaid ? QUOTA_PAID : QUOTA_FREE;
            if (company.dailyLeadQuota && company.dailyLeadQuota > quota) {
                quota = company.dailyLeadQuota;
            }

            const payload = {
                companyId: company.id,
                quotaOverride: quota,
                forceRotate: forceRotate
            };

            const task = {
                httpRequest: {
                    httpMethod: "POST",
                    url: WORKER_URL,
                    headers: { "Content-Type": "application/json" },
                    body: Buffer.from(JSON.stringify(payload)).toString("base64"),
                    // OIDC token for Cloud Run authentication (required for v2 functions)
                    oidcToken: {
                        serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
                        audience: WORKER_URL
                    }
                }
            };

            try {
                const [response] = await tasksClient.createTask({ parent: queuePath, task });
                return { company: company.companyName, taskName: response.name, status: "queued" };
            } catch (err) {
                console.error(`Failed to queue task for ${company.companyName}:`, err.message);
                return { company: company.companyName, error: err.message, status: "failed" };
            }
        });

        const results = await Promise.all(taskPromises);
        const queued = results.filter(r => r.status === "queued").length;
        const failed = results.filter(r => r.status === "failed").length;

        console.log(`Cloud Tasks created: ${queued} queued, ${failed} failed`);
        return {
            success: true,
            message: `Dealer V4 Complete: ${queued} tasks queued, ${failed} failed`,
            details: results
        };

    } catch (globalError) {
        console.error("FATAL DISTRIBUTION ERROR:", globalError);
        throw globalError;
    }
}

// --- 2. SIMPLIFIED DEALER LOGIC (QUOTA-CAPPED) ---
async function dealLeadsToCompany(company, planLimit, forceRotate) {
    const companyId = company.id;
    const now = new Date();
    const nowTs = admin.firestore.Timestamp.now();

    // Call cleanup with quota parameter - returns exact slots available
    const slotsAvailable = await processCompanyCleanup(companyId, planLimit, now, forceRotate);

    if (slotsAvailable <= 0) {
        return `${company.companyName}: Full (${planLimit - slotsAvailable}/${planLimit})`;
    }

    // Fetch candidates - 2x buffer for better success rate
    const buffer = Math.ceil(slotsAvailable * 2);
    let candidates = [];

    // Get fresh leads first
    const freshSnap = await db.collection("leads").where("unavailableUntil", "==", null).limit(buffer).get();
    freshSnap.forEach(doc => candidates.push(doc));

    // If not enough fresh, get expired locks
    if (candidates.length < buffer) {
        const remaining = buffer - candidates.length;
        const expiredSnap = await db.collection("leads").where("unavailableUntil", "<=", nowTs).limit(remaining).get();
        expiredSnap.forEach(doc => candidates.push(doc));
    }

    // Randomize
    candidates = candidates.sort(() => Math.random() - 0.5);

    //  Assign leads with STRICT quota enforcement
    let added = 0;
    for (const leadDoc of candidates) {
        // HARD CAP: Stop exactly at slots available
        if (added >= slotsAvailable) break;

        const success = await assignLeadTransaction(companyId, leadDoc, nowTs);
        if (success) added++;
    }

    const finalCount = (planLimit - slotsAvailable) + added;
    return `${company.companyName}: Added ${added}/${slotsAvailable} slots (Total: ${finalCount}/${planLimit})`;
}

// --- 3. TRANSACTIONAL ASSIGNMENT ---
async function assignLeadTransaction(companyId, leadDocRef, nowTs) {
    try {
        await db.runTransaction(async (t) => {
            const freshDoc = await t.get(leadDocRef.ref);
            if (!freshDoc.exists) throw new Error("GHOST_LEAD");
            const data = freshDoc.data();
            if (data.unavailableUntil && data.unavailableUntil.toMillis() > Date.now()) {
                throw new Error("ALREADY_LOCKED");
            }
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const companyLeadRef = db.collection("companies").doc(companyId).collection("leads").doc(freshDoc.id);
            const payload = {
                firstName: data.firstName || 'Unknown',
                lastName: data.lastName || 'Driver',
                email: data.email || '',
                phone: data.phone || '',
                normalizedPhone: data.normalizedPhone || '',
                driverType: data.driverType || 'Unspecified',
                experience: data.experience || 'N/A',
                city: data.city || '',
                state: data.state || '',
                source: data.source || 'SafeHaul Network',
                sharedHistory: data.sharedHistory || [],
                isPlatformLead: true,
                distributedAt: nowTs,
                originalLeadId: freshDoc.id,
                status: "New Lead",
                assignedTo: null
            };
            t.set(companyLeadRef, payload);
            t.update(leadDocRef.ref, {
                unavailableUntil: admin.firestore.Timestamp.fromDate(tomorrow),
                lastAssignedTo: companyId,
                visitedCompanyIds: admin.firestore.FieldValue.arrayUnion(companyId)
            });
        });
        return true;
    } catch (e) { return false; }
}

// --- 4. STRICT QUOTA ENFORCEMENT CLEANUP ---
async function processCompanyCleanup(companyId, quota, now, forceRotate) {
    const companyLeadsRef = db.collection("companies").doc(companyId).collection("leads");
    const currentLeadsSnap = await companyLeadsRef.where("isPlatformLead", "==", true).get();

    // 1. Categorize all leads
    const leads = [];
    for (const docSnap of currentLeadsSnap.docs) {
        const data = docSnap.data();
        const status = data.status || "New Lead";
        const isEngaged = ENGAGED_STATUSES.includes(status) && status !== "New Lead" && status !== "Attempted";
        const isTerminal = TERMINAL_STATUSES.includes(status);

        leads.push({
            ref: docSnap.ref,
            data,
            isEngaged,
            isTerminal,
            distributedAt: data.distributedAt?.toDate() || new Date(0),
            originalLeadId: data.originalLeadId
        });
    }

    // 2. Sort by priority: engaged first, then by newest
    leads.sort((a, b) => {
        // Terminal leads go to back (will be deleted)
        if (a.isTerminal !== b.isTerminal) return a.isTerminal ? 1 : -1;
        // Engaged leads stay (higher priority)
        if (a.isEngaged !== b.isEngaged) return b.isEngaged ? 1 : -1;
        // Sort by newest first
        return b.distributedAt - a.distributedAt;
    });

    // 3. Determine what to keep and what to delete
    let toKeep = [];
    let toDelete = [];

    if (forceRotate) {
        // FORCE ROTATE: Keep ONLY engaged leads, delete everything else
        toKeep = leads.filter(lead => lead.isEngaged && !lead.isTerminal);
        toDelete = leads.filter(lead => !lead.isEngaged || lead.isTerminal);
    } else {
        // NORMAL: Keep up to quota (priority order), delete rest
        toKeep = leads.filter(lead => !lead.isTerminal).slice(0, quota);
        toDelete = leads.filter(lead => !lead.isTerminal).slice(quota);
        // Always delete terminal leads
        toDelete.push(...leads.filter(lead => lead.isTerminal));
    }

    // 4. Execute deletions in batches
    let batch = db.batch();
    let batchSize = 0;

    for (const lead of toDelete) {
        // Harvest notes before deleting
        await harvestNotesBeforeDelete({ ref: lead.ref, data: () => lead.data }, lead.data);

        // Delete from company collection
        batch.delete(lead.ref);
        batchSize++;

        // Unlock in global pool (if not terminal)
        if (lead.originalLeadId && !lead.isTerminal) {
            const globalRef = db.collection("leads").doc(lead.originalLeadId);
            const globalSnap = await globalRef.get();
            if (globalSnap.exists) {
                batch.update(globalRef, { unavailableUntil: null, lastAssignedTo: null });
            }
        }

        // Commit batch every 400 operations
        if (batchSize >= 400) {
            await batch.commit();
            batch = db.batch();
            batchSize = 0;
        }
    }

    // Commit remaining
    if (batchSize > 0) await batch.commit();

    // 5. Return exact number of slots available
    const slotsAvailable = quota - toKeep.length;
    console.log(`Cleanup for company ${companyId}: Kept ${toKeep.length}/${quota}, Deleted ${toDelete.length}, Slots: ${slotsAvailable}`);

    return slotsAvailable;
}

// --- 5. UPDATED ENTRY POINTS (FIXED FOR CALLABLES) ---

async function confirmDriverInterest(data) {
    const { leadId, companyIdOrSlug, recruiterId } = data;
    if (!leadId || !companyIdOrSlug) return { success: false, error: "Missing parameters." };

    const companyQuery = await db.collection("companies").where("appSlug", "==", companyIdOrSlug).limit(1).get();
    let companyId = companyQuery.empty ? companyIdOrSlug : companyQuery.docs[0].id;

    const leadSnap = await db.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) return { success: false, error: "Lead not found." };

    const lockTs = admin.firestore.Timestamp.fromDate(new Date(Date.now() + POOL_INTEREST_LOCK_DAYS * 24 * 60 * 60 * 1000));

    // ISOLATION FIX: Do not copy previous operational history (from other companies)
    const rawData = leadSnap.data();
    const safePayload = { ...rawData };

    // Whitelist / Blacklist Logic
    const OPERATIONAL_FIELDS = [
        'lastContactedAt', 'lastContactedBy',
        'lastCallOutcome', 'lastOutcome', 'lastOutcomeBy',
        'lastCall', 'status', 'assignedTo', 'convertedAt',
        'subStatus', 'internalNotes', 'lastAssignedTo'
    ];

    OPERATIONAL_FIELDS.forEach(field => delete safePayload[field]);

    const batch = db.batch();
    let assignedTo = null;

    // Resolve Recruiter (if any)
    if (recruiterId) {
        const linkSnap = await db.collection("recruiter_links").doc(recruiterId).get();
        if (linkSnap.exists) {
            assignedTo = linkSnap.data().userId;
        } else {
            // Assume it might be a direct UID
            assignedTo = recruiterId;
        }
    }

    batch.set(db.collection("companies").doc(companyId).collection("applications").doc(leadId), {
        ...safePayload,
        status: "New Application",
        source: "Driver Interest Link",
        isPlatformLead: true,
        originalLeadId: leadId,
        recruiterCode: recruiterId || null,
        assignedTo: assignedTo, // <--- SET ASSIGNED TO
        submittedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    batch.update(db.collection("leads").doc(leadId), {
        unavailableUntil: lockTs,
        lastAssignedTo: companyId,
        poolStatus: "engaged_interest"
    });

    await batch.commit();
    return { success: true };
}

async function processLeadOutcome(data) {
    const { leadId, companyId, outcome } = data;
    if (!leadId) return { error: "No Lead ID" };

    const leadRef = db.collection("leads").doc(leadId);
    let lockUntil = new Date();
    let reason = "pool_recycle";

    if (outcome === 'hired_elsewhere' || outcome === 'hired' || outcome === 'Approved') {
        lockUntil.setDate(lockUntil.getDate() + POOL_HIRED_LOCK_DAYS);
        reason = "hired";
    } else {
        lockUntil.setDate(lockUntil.getDate() + POOL_COOL_OFF_DAYS);
        reason = "rejected";
    }

    await leadRef.update({
        unavailableUntil: admin.firestore.Timestamp.fromDate(lockUntil),
        lastOutcome: outcome,
        lastOutcomeBy: companyId,
        poolStatus: reason
    });
    return { success: true };
}

// --- 6. COMPREHENSIVE CLEANUP ---

async function runCleanup() {
    console.log("CLEANUP: Starting comprehensive cleanup...");
    let globalDeleted = 0;
    let companyLeadsDeleted = 0;
    let companyDeleted = 0;

    // 1. Cleanup Global Leads Pool
    console.log("CLEANUP: Phase 1 - Global leads pool...");
    const leadsSnap = await db.collection("leads").get();
    let batch = db.batch();
    let bSize = 0;

    for (const doc of leadsSnap.docs) {
        const d = doc.data();
        const firstName = (d.firstName || '').toLowerCase().trim();
        const lastName = (d.lastName || '').toLowerCase().trim();
        const fullName = (d.fullName || '').toLowerCase().trim();
        const phone = (d.phone || '').trim();
        const email = (d.email || '').trim();

        let shouldDelete = false;

        // Delete if no contact info
        if (!phone && !email) shouldDelete = true;

        // Delete if bad names
        const badNames = ['unknown', 'test', 'fake', 'not specified', 'driver', 'n/a', 'na', 'null', 'undefined'];
        if (badNames.includes(firstName) || badNames.includes(lastName)) shouldDelete = true;
        if (firstName.includes('test') || lastName.includes('test')) shouldDelete = true;
        if (firstName === '' && lastName === '' && fullName === '') shouldDelete = true;

        if (shouldDelete) {
            batch.delete(doc.ref);
            bSize++;
            globalDeleted++;
        }

        if (bSize >= 400) {
            await batch.commit();
            batch = db.batch();
            bSize = 0;
        }
    }
    if (bSize > 0) await batch.commit();
    console.log(`CLEANUP: Deleted ${globalDeleted} bad leads from global pool`);

    // 2. Cleanup Company Subcollection Leads
    console.log("CLEANUP: Phase 2 - Company subcollection leads...");
    const companiesSnap = await db.collection("companies").get();

    for (const companyDoc of companiesSnap.docs) {
        const companyLeadsSnap = await companyDoc.ref
            .collection("leads")
            .where("isPlatformLead", "==", true)
            .get();

        let cBatch = db.batch();
        let cSize = 0;

        for (const leadDoc of companyLeadsSnap.docs) {
            const d = leadDoc.data();
            const fullName = (d.fullName || '').toLowerCase().trim();
            const phone = (d.phone || '').trim();
            const email = (d.email || '').trim();

            let shouldDelete = false;

            // Delete if no contact info
            if (!phone && !email) shouldDelete = true;

            // Delete if bad names
            const badPatterns = ['unknown', 'test', 'not specified', 'n/a', 'undefined'];
            if (badPatterns.some(p => fullName.includes(p))) shouldDelete = true;
            if (fullName === '' || fullName === ' ') shouldDelete = true;

            if (shouldDelete) {
                cBatch.delete(leadDoc.ref);
                cSize++;
                companyLeadsDeleted++;

                // Also unlock in global pool
                if (d.originalLeadId) {
                    const globalRef = db.collection("leads").doc(d.originalLeadId);
                    cBatch.update(globalRef, { unavailableUntil: null }).catch(() => { });
                }
            }

            if (cSize >= 400) {
                await cBatch.commit();
                cBatch = db.batch();
                cSize = 0;
            }
        }
        if (cSize > 0) await cBatch.commit();
    }
    console.log(`CLEANUP: Deleted ${companyLeadsDeleted} bad leads from company subcollections`);

    // 3. Cleanup Invalid Companies
    console.log("CLEANUP: Phase 3 - Invalid companies...");
    let compBatch = db.batch();
    let compSize = 0;

    for (const doc of companiesSnap.docs) {
        const d = doc.data();
        if (!d.companyName || !d.createdAt) {
            compBatch.delete(doc.ref);
            compSize++;
            companyDeleted++;
        }
        if (compSize >= 400) {
            await compBatch.commit();
            compBatch = db.batch();
            compSize = 0;
        }
    }
    if (compSize > 0) await compBatch.commit();
    console.log(`CLEANUP: Deleted ${companyDeleted} invalid companies`);

    const result = {
        success: true,
        globalLeadsDeleted: globalDeleted,
        companyLeadsDeleted: companyLeadsDeleted,
        companiesDeleted: companyDeleted,
        message: `Cleanup Complete. Deleted ${globalDeleted} global leads, ${companyLeadsDeleted} company leads, ${companyDeleted} companies.`
    };

    console.log("CLEANUP COMPLETE:", result);
    return result;
}

async function populateLeadsFromDrivers() {
    let deletedUsers = 0;
    const usersSnap = await db.collection("users").where("role", "==", "driver").get();
    for (const userDoc of usersSnap.docs) {
        try {
            const authRecord = await auth.getUser(userDoc.id);
            if (!authRecord.metadata.lastSignInTime) {
                await auth.deleteUser(userDoc.id);
                await userDoc.ref.delete();
                deletedUsers++;
            }
        } catch (e) {
            if (e.code === 'auth/user-not-found') { await userDoc.ref.delete(); deletedUsers++; }
        }
    }

    const driversSnap = await db.collection("drivers").get();
    let batch = db.batch();
    let added = 0;
    for (const doc of driversSnap.docs) {
        const d = doc.data();
        const leadRef = db.collection("leads").doc(doc.id);
        batch.set(leadRef, {
            firstName: d.personalInfo?.firstName || 'Unknown',
            lastName: d.personalInfo?.lastName || 'Driver',
            email: d.personalInfo?.email || '',
            phone: d.personalInfo?.phone || '',
            driverType: d.driverProfile?.type || 'Unspecified',
            city: d.personalInfo?.city || '',
            state: d.personalInfo?.state || '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        added++;
    }
    await batch.commit();
    return { success: true, details: `Deleted ${deletedUsers} fake users. Migrated ${added} drivers.` };
}

async function harvestNotesBeforeDelete(docSnap, data) {
    try {
        const notesSnap = await docSnap.ref.collection("internal_notes").get();
        const notesToShare = [];
        notesSnap.forEach(noteDoc => {
            const n = noteDoc.data();
            notesToShare.push({ text: n.text, date: n.createdAt, source: "Previous Recruiter" });
        });
        const originalId = data.originalLeadId || docSnap.id;
        if (originalId && notesToShare.length > 0) {
            await db.collection("leads").doc(originalId).update({
                sharedHistory: admin.firestore.FieldValue.arrayUnion(...notesToShare)
            }).catch(() => { });
        }
    } catch (e) { }
}


// ============================================
// CLEAN SLATE DISTRIBUTION MODEL
// ============================================

/**
 * PHASE 1: RECALL
 * Returns ALL platform leads from company subcollections back to global pool
 */
async function recallAllLeads() {
    console.log("CLEAN SLATE: Starting RECALL phase...");

    const companiesSnap = await db.collection("companies").get();
    let totalRecalled = 0;
    let totalCompanies = 0;

    for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const companyName = companyDoc.data().companyName || companyId;

        // Get all platform leads in this company
        const leadsSnap = await db.collection("companies")
            .doc(companyId)
            .collection("leads")
            .where("isPlatformLead", "==", true)
            .get();

        if (leadsSnap.empty) continue;

        totalCompanies++;
        let batch = db.batch();
        let batchSize = 0;

        for (const leadDoc of leadsSnap.docs) {
            const data = leadDoc.data();

            // Harvest notes before deletion
            await harvestNotesBeforeDelete(leadDoc, data);

            // Delete from company subcollection
            batch.delete(leadDoc.ref);
            batchSize++;

            // Unlock in global pool
            if (data.originalLeadId) {
                const globalRef = db.collection("leads").doc(data.originalLeadId);
                batch.update(globalRef, {
                    unavailableUntil: null,
                    lastAssignedTo: null
                });
            }

            totalRecalled++;

            // Commit batch every 400 operations
            if (batchSize >= 400) {
                await batch.commit();
                batch = db.batch();
                batchSize = 0;
            }
        }

        // Commit remaining
        if (batchSize > 0) await batch.commit();

        console.log(`  Recalled ${leadsSnap.size} leads from ${companyName}`);
    }

    console.log(`RECALL COMPLETE: ${totalRecalled} leads returned to pool from ${totalCompanies} companies`);
    return { recalled: totalRecalled, companies: totalCompanies };
}

/**
 * PHASE 2: SHUFFLE
 * Marks all leads as available and assigns random order
 */
async function shuffleLeadPool() {
    console.log("CLEAN SLATE: Starting SHUFFLE phase...");

    // Get all leads
    const leadsSnap = await db.collection("leads").get();
    let batch = db.batch();
    let batchSize = 0;
    let shuffled = 0;

    for (const leadDoc of leadsSnap.docs) {
        // Clear any locks
        batch.update(leadDoc.ref, {
            unavailableUntil: null,
            lastAssignedTo: null
        });

        batchSize++;
        shuffled++;

        if (batchSize >= 400) {
            await batch.commit();
            batch = db.batch();
            batchSize = 0;
        }
    }

    if (batchSize > 0) await batch.commit();

    console.log(`SHUFFLE COMPLETE: ${shuffled} leads ready for distribution`);
    return { shuffled };
}

/**
 * PHASE 3: DISTRIBUTE (Sequential)
 * Assigns EXACTLY quota leads to each company, one at a time
 */
async function distributeLeadsSequential() {
    console.log("CLEAN SLATE: Starting DISTRIBUTE phase (Sequential)...");

    const settings = await getSystemSettings();
    const QUOTA_FREE = settings.quotaFree;
    const QUOTA_PAID = settings.quotaPaid;

    // Get all active companies
    const companiesSnap = await db.collection("companies")
        .where("isActive", "==", true)
        .get();

    if (companiesSnap.empty) {
        console.log("No active companies found.");
        return { success: false, message: "No active companies" };
    }

    const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Found ${companies.length} active companies. Processing sequentially...`);

    // Get ALL available leads upfront
    const leadsSnap = await db.collection("leads").get();
    const allLeads = leadsSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));

    // Shuffle leads (Fisher-Yates)
    for (let i = allLeads.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allLeads[i], allLeads[j]] = [allLeads[j], allLeads[i]];
    }

    console.log(`Pool has ${allLeads.length} leads available`);

    // Track assigned leads to prevent double-assignment
    const assignedLeadIds = new Set();
    const nowTs = admin.firestore.Timestamp.now();
    const results = [];

    // Process each company SEQUENTIALLY
    for (const company of companies) {
        const isPaid = company.planType?.toLowerCase() === 'paid';
        let quota = isPaid ? QUOTA_PAID : QUOTA_FREE;
        if (company.dailyLeadQuota && company.dailyLeadQuota > quota) {
            quota = company.dailyLeadQuota;
        }

        let assigned = 0;
        let batch = db.batch();
        let batchSize = 0;

        for (const lead of allLeads) {
            // Skip if already assigned to another company
            if (assignedLeadIds.has(lead.id)) continue;

            // Stop when quota reached
            if (assigned >= quota) break;

            // Check if company was previously assigned this lead (fairness)
            const visitedCompanies = lead.data.visitedCompanyIds || [];
            if (visitedCompanies.includes(company.id)) continue;

            // VALIDATION: Skip leads without contact info
            const phone = (lead.data.phone || '').trim();
            const email = (lead.data.email || '').trim();
            if (!phone && !email) continue;

            // VALIDATION: Skip leads with bad names
            const firstName = (lead.data.firstName || '').trim();
            const lastName = (lead.data.lastName || '').trim();
            const combinedName = `${firstName} ${lastName}`.toLowerCase().trim();
            const badPatterns = ['unknown', 'test', 'fake', 'not specified', 'n/a', 'driver'];
            if (badPatterns.some(p => combinedName.includes(p))) continue;
            if (firstName === '' && lastName === '') continue;

            // Assign to company
            const companyLeadRef = db.collection("companies")
                .doc(company.id)
                .collection("leads")
                .doc();

            // FIX: Combine firstName + lastName into fullName
            const fullName = `${firstName} ${lastName}`.trim() || "Unknown";

            const payload = {
                fullName: fullName,
                phone: phone,
                email: email,
                driverType: lead.data.driverType || "Unspecified",
                experience: lead.data.experience || "N/A",
                city: lead.data.city || "",
                state: lead.data.state || "",
                source: lead.data.source || "SafeHaul Network",
                sharedHistory: lead.data.sharedHistory || [],
                isPlatformLead: true,
                distributedAt: nowTs,
                originalLeadId: lead.id,
                status: "New Lead",
                assignedTo: null
            };

            batch.set(companyLeadRef, payload);

            // Update global lead
            batch.update(lead.ref, {
                unavailableUntil: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 24 * 60 * 60 * 1000)
                ),
                lastAssignedTo: company.id,
                visitedCompanyIds: admin.firestore.FieldValue.arrayUnion(company.id)
            });

            assignedLeadIds.add(lead.id);
            assigned++;
            batchSize += 2;

            if (batchSize >= 400) {
                await batch.commit();
                batch = db.batch();
                batchSize = 0;
            }
        }

        if (batchSize > 0) await batch.commit();

        const result = {
            company: company.companyName,
            companyId: company.id,
            quota,
            assigned,
            status: assigned === quota ? 'full' : assigned > 0 ? 'partial' : 'failed'
        };

        results.push(result);
        console.log(`  ${company.companyName}: ${assigned}/${quota} (${result.status})`);
    }

    const summary = {
        totalCompanies: companies.length,
        full: results.filter(r => r.status === 'full').length,
        partial: results.filter(r => r.status === 'partial').length,
        failed: results.filter(r => r.status === 'failed').length,
        totalAssigned: results.reduce((sum, r) => sum + r.assigned, 0)
    };

    console.log(`DISTRIBUTE COMPLETE: ${summary.full} full, ${summary.partial} partial, ${summary.failed} failed`);

    return { success: true, summary, details: results };
}

/**
 * PHASE 4: VERIFY
 * Confirms distribution accuracy
 */
async function verifyDistribution() {
    console.log("CLEAN SLATE: Starting VERIFY phase...");

    const settings = await getSystemSettings();
    const QUOTA_FREE = settings.quotaFree;
    const QUOTA_PAID = settings.quotaPaid;

    const companiesSnap = await db.collection("companies")
        .where("isActive", "==", true)
        .get();

    const results = [];

    for (const companyDoc of companiesSnap.docs) {
        const company = companyDoc.data();
        const isPaid = company.planType?.toLowerCase() === 'paid';
        let quota = isPaid ? QUOTA_PAID : QUOTA_FREE;
        if (company.dailyLeadQuota && company.dailyLeadQuota > quota) {
            quota = company.dailyLeadQuota;
        }

        // Count platform leads
        const leadsSnap = await db.collection("companies")
            .doc(companyDoc.id)
            .collection("leads")
            .where("isPlatformLead", "==", true)
            .count().get();

        const count = leadsSnap.data().count;
        const fulfillment = Math.round((count / quota) * 100);

        results.push({
            company: company.companyName,
            quota,
            received: count,
            fulfillment: `${fulfillment}%`,
            status: count === quota ? 'exact' : count > quota ? 'OVER' : 'under'
        });
    }

    console.log("VERIFY COMPLETE:");
    results.forEach(r => console.log(`  ${r.company}: ${r.received}/${r.quota} = ${r.fulfillment} [${r.status}]`));

    return { results };
}

/**
 * MASTER ORCHESTRATOR: Run entire Clean Slate distribution
 */
async function runCleanSlateDistribution() {
    console.log("========================================");
    console.log("CLEAN SLATE DISTRIBUTION - STARTING");
    console.log("========================================");

    const startTime = Date.now();

    try {
        // Check maintenance mode
        const settings = await getSystemSettings();
        if (settings.maintenanceMode) {
            return { success: false, message: "Maintenance mode is enabled." };
        }

        // Phase 1: RECALL
        const recallResult = await recallAllLeads();

        // Phase 2: SHUFFLE (already done in recallAllLeads unlock)
        // await shuffleLeadPool();

        // Phase 3: DISTRIBUTE
        const distributeResult = await distributeLeadsSequential();

        // Phase 4: VERIFY
        const verifyResult = await verifyDistribution();

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log("========================================");
        console.log(`CLEAN SLATE COMPLETE in ${duration}s`);
        console.log("========================================");

        return {
            success: true,
            duration: `${duration}s`,
            recall: recallResult,
            distribution: distributeResult.summary,
            verification: verifyResult.results,
            message: `Distribution complete: ${distributeResult.summary.full} companies at full quota`
        };

    } catch (error) {
        console.error("CLEAN SLATE ERROR:", error);
        throw error;
    }
}


module.exports = {
    runLeadDistribution,
    dealLeadsToCompany,  // Exported for worker
    populateLeadsFromDrivers,
    runCleanup,
    processLeadOutcome,
    confirmDriverInterest,
    // NEW: Clean Slate functions
    recallAllLeads,
    shuffleLeadPool,
    distributeLeadsSequential,
    verifyDistribution,
    runCleanSlateDistribution,
};
