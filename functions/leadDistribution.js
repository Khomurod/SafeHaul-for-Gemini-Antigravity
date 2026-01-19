const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db } = require("./firebaseAdmin");

// Note: Lazy loading dependencies inside functions to prevent global scope crashes
// const Sentry = require("@sentry/node"); 
// const leadLogic = require("./leadLogic");

const RUNTIME_OPTS = {
    timeoutSeconds: 540,
    memory: '256MiB',
    maxInstances: 1,
    concurrency: 1,
    cors: true,
    secrets: ['DISTRIBUTION_WORKER_URL'] // Only for distribution functions
};

// Separate config for verification/analytics functions (NO secrets required)
const VERIFY_OPTS = {
    timeoutSeconds: 300,
    memory: '256MiB',
    maxInstances: 2,
    concurrency: 1,
    cors: true
    // No secrets - these functions don't need DISTRIBUTION_WORKER_URL
};

// --- 1. PLANNING PHASE (6:00 AM Central Time) - RECALL + SHUFFLE ---
exports.planLeadDistribution = onSchedule({
    schedule: "0 6 * * *",
    timeZone: "America/Chicago",
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (event) => {
    const Sentry = require("@sentry/node");
    const { recallAllLeads, shuffleLeadPool } = require("./leadLogic");
    try {
        console.log("CLEAN SLATE: Running scheduled PLANNING phase (6:00 AM CT)...");

        // Phase 1: RECALL - Return all leads to pool
        const recallResult = await recallAllLeads();
        console.log("Recall result:", recallResult);

        // Phase 2: SHUFFLE - Clear locks and randomize
        const shuffleResult = await shuffleLeadPool();
        console.log("Shuffle result:", shuffleResult);

    } catch (error) {
        console.error("Planning failed:", error);
        Sentry.captureException(error);
    }
});

// --- 2. EXECUTION PHASE (7:00 AM Central Time) - DISTRIBUTE + VERIFY ---
exports.runLeadDistribution = onSchedule({
    schedule: "0 7 * * *",
    timeZone: "America/Chicago",
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (event) => {
    const Sentry = require("@sentry/node");
    const { distributeLeadsSequential, verifyDistribution } = require("./leadLogic");
    try {
        console.log("CLEAN SLATE: Running scheduled EXECUTION phase (7:00 AM CT)...");

        // Phase 3: DISTRIBUTE - Sequential assignment
        const distributeResult = await distributeLeadsSequential();
        console.log("Distribute result:", distributeResult);

        // Phase 4: VERIFY - Confirm accuracy
        const verifyResult = await verifyDistribution();
        console.log("Verify result:", verifyResult);

    } catch (error) {
        console.error("Execution failed:", error);
        Sentry.captureException(error);
    }
});

// --- 3. MANUAL BUTTON (Force New Round - All Phases) ---
exports.distributeDailyLeads = onCall(RUNTIME_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }

    const { runCleanSlateDistribution } = require("./leadLogic");
    const Sentry = require("@sentry/node");

    try {
        console.log("CLEAN SLATE: Super Admin forcing manual distribution...");
        const result = await runCleanSlateDistribution();
        return result;
    } catch (error) {
        Sentry.captureException(error);
        throw new HttpsError("internal", error.message);
    }
});

// --- 3. CLEANUP TOOL ---
// --- 3. CLEANUP TOOL ---
exports.cleanupBadLeads = onCall(RUNTIME_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }
    const { runCleanup } = require("./leadLogic");
    const Sentry = require("@sentry/node");

    try {
        const result = await runCleanup();
        return result;
    } catch (error) {
        Sentry.captureException(error); // Report to Sentry
        throw new HttpsError("internal", error.message);
    }
});

// --- 4. LEAD OUTCOME HANDLER ---
// --- 4. LEAD OUTCOME HANDLER ---
exports.handleLeadOutcome = onCall(RUNTIME_OPTS, async (request) => {
    // Auth check inside logic
    const { processLeadOutcome } = require("./leadLogic");
    const Sentry = require("@sentry/node");

    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { leadId, companyId, outcome } = request.data;
    const userRole = request.auth.token.roles?.[companyId];
    const isSuper = request.auth.token.roles?.globalRole === 'super_admin';

    if (!isSuper && !userRole) {
        throw new HttpsError("permission-denied", "You do not have access to this company.");
    }

    try {
        const result = await processLeadOutcome(request.data);
        return result;
    } catch (error) {
        Sentry.captureException(error); // Report to Sentry
        return { success: false, error: error.message };
    }
});

// --- 5. ANALYTICS (REMOVED) ---
// generateDailyAnalytics was imported but never existed in leadLogic.js
// This scheduled job has been removed to prevent runtime errors

// --- 6. DRIVER INTEREST ---
// --- 6. DRIVER INTEREST ---
exports.confirmDriverInterest = onCall(RUNTIME_OPTS, async (request) => {
    const { confirmDriverInterest } = require("./leadLogic");
    const Sentry = require("@sentry/node");

    try {
        const result = await confirmDriverInterest(request.data);
        return result;
    } catch (error) {
        Sentry.captureException(error); // Report to Sentry
        throw new HttpsError("internal", error.message);
    }
});

// --- 7. MIGRATION TOOL ---
// --- 7. MIGRATION TOOL ---
exports.migrateDriversToLeads = onCall(RUNTIME_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }
    const { populateLeadsFromDrivers } = require("./leadLogic");

    try {
        const result = await populateLeadsFromDrivers();
        return result;
    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});

// --- 8. LEAD SUPPLY & DEMAND ANALYZER (NEW) ---
exports.getLeadSupplyAnalytics = onCall(VERIFY_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }

    try {
        const now = admin.firestore.Timestamp.now();

        // 1. ANALYZE DEMAND (Company Quotas)
        const companiesSnap = await db.collection("companies").where("isActive", "==", true).get();
        let totalDailyDemand = 0;
        let activeCompanies = 0;

        companiesSnap.forEach(doc => {
            const d = doc.data();
            const quota = d.dailyLeadQuota || (d.planType === 'paid' ? 200 : 50);
            totalDailyDemand += quota;
            activeCompanies++;
        });

        // 2. ANALYZE SUPPLY (Global Pool) - FIXED: Avoid double-counting
        const totalGlobalSnap = await db.collection("leads").count().get();
        const totalGlobal = totalGlobalSnap.data().count;

        // Fresh leads (never assigned) - unavailableUntil IS NULL
        const freshSnap = await db.collection("leads")
            .where("unavailableUntil", "==", null)
            .count().get();
        const freshCount = freshSnap.data().count;

        // Expired locks - unavailableUntil exists AND <= now
        // Note: Firestore doesn't support querying for "not null AND <= now" directly,
        // so we get all locked and filter client-side (approximate for now)
        const lockedSnap = await db.collection("leads")
            .where("unavailableUntil", ">", now)
            .count().get();
        const currentlyLocked = lockedSnap.data().count;

        // Available = Total - Currently Locked
        const availableSupply = totalGlobal - currentlyLocked;

        // 3. ANALYZE DISTRIBUTION (In Circulation)
        const distributedSnap = await db.collectionGroup("leads")
            .where("isPlatformLead", "==", true)
            .count().get();

        const privateSnap = await db.collectionGroup("leads")
            .where("isPlatformLead", "==", false)
            .count().get();

        const inCirculation = distributedSnap.data().count;

        // 4. HEALTH CHECK - Compare available supply vs ACTUAL need
        // Actual need = Total quota - Already in circulation
        const actualNeed = Math.max(0, totalDailyDemand - inCirculation);
        const gap = availableSupply - actualNeed;

        console.log(`Analytics: Total=${totalGlobal}, Available=${availableSupply}, InCirc=${inCirculation}, Quota=${totalDailyDemand}, ActualNeed=${actualNeed}, Gap=${gap}`);

        return {
            demand: {
                companiesCount: activeCompanies,
                totalDailyQuota: totalDailyDemand
            },
            supply: {
                totalInPool: totalGlobal,
                availableNow: availableSupply,
                locked: currentlyLocked
            },
            distribution: {
                totalDistributedInCirculation: inCirculation,
                totalPrivateUploads: privateSnap.data().count
            },
            health: {
                status: gap >= 0 ? 'surplus' : 'deficit',
                gap: Math.abs(gap)
            }
        };

    } catch (error) {
        console.error("Analytics Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// --- 9. VERIFY DISTRIBUTION DELIVERY ---
// Runs after distribution to verify each company received their leads
exports.verifyDistributionDelivery = onCall(VERIFY_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }

    // Use standard Date object - Firestore supports this for queries
    // const { Timestamp } = require("firebase-admin/firestore"); // Removing potentially crashing import

    try {
        console.log("Starting verification..."); // DEBUG LOG
        const today = new Date();
        const dateId = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const startTs = startOfDay; // Firestore accepts Date objects in queries

        // Get all active companies
        console.log("Fetching active companies..."); // DEBUG LOG
        const companiesSnap = await db.collection("companies").where("isActive", "==", true).get();
        console.log(`Found ${companiesSnap.size} companies.`); // DEBUG LOG

        const results = [];
        let successful = 0;
        let partial = 0;
        let failed = 0;

        for (const companyDoc of companiesSnap.docs) {
            const companyId = companyDoc.id;
            const company = companyDoc.data();

            try {
                // Determine expected quota
                const isPaid = company.planType?.toLowerCase() === 'paid';
                let expectedQuota = isPaid ? 200 : 50;
                if (company.dailyLeadQuota && company.dailyLeadQuota > expectedQuota) {
                    expectedQuota = company.dailyLeadQuota;
                }

                // Count leads distributed today
                // Note: Requires composite index on Leads [isPlatformLead ASC, distributedAt DESC]
                const leadsSnap = await db.collection("companies")
                    .doc(companyId)
                    .collection("leads")
                    .where("isPlatformLead", "==", true)
                    .where("distributedAt", ">=", startTs)
                    .count().get();

                const receivedCount = leadsSnap.data().count;

                // Determine status
                let status = 'verified';
                let error = null;

                if (receivedCount === 0) {
                    status = 'failed';
                    error = 'No leads distributed today';
                    failed++;
                } else if (receivedCount < expectedQuota * 0.8) { // Less than 80% of quota
                    status = 'partial';
                    error = `Only received ${receivedCount}/${expectedQuota} leads (below 80% threshold)`;
                    partial++;
                } else {
                    successful++;
                }

                results.push({
                    id: companyId,
                    name: company.companyName || 'Unknown',
                    plan: isPaid ? 'Paid' : 'Free',
                    quota: expectedQuota,
                    received: receivedCount,
                    status,
                    error
                });
            } catch (err) {
                console.error(`Verification failed for company ${companyId}:`, err);
                failed++;
                results.push({
                    id: companyId,
                    name: company.companyName || 'Unknown',
                    plan: company.planType || 'Unknown',
                    quota: 0,
                    received: 0,
                    status: 'failed',
                    error: err.message // Capture specific error
                });
            }
        }

        // Save report to Firestore
        const reportData = {
            date: dateId,
            triggeredAt: admin.firestore.Timestamp.now(),
            completedAt: admin.firestore.Timestamp.now(),
            summary: {
                totalCompanies: companiesSnap.size,
                successful,
                partial,
                failed
            },
            companies: results
        };

        await db.collection("distribution_reports").doc(dateId).set(reportData, { merge: true });

        return {
            success: true,
            message: `Verification complete: ${successful} successful, ${partial} partial, ${failed} failed`,
            report: reportData
        };

    } catch (error) {
        console.error("Verification Error:", error);
        // Sentry.captureException(error); // Comment out potential crasher
        throw new HttpsError("internal", error.message);
    }
});

// --- 10. GET DISTRIBUTION REPORTS ---
exports.getDistributionReports = onCall(VERIFY_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }

    try {
        const { limit: queryLimit = 10 } = request.data || {};

        const reportsSnap = await db.collection("distribution_reports")
            .orderBy("date", "desc")
            .limit(Number(queryLimit))
            .get();

        const reports = reportsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return { success: true, reports };

    } catch (error) {
        console.error("Get Reports Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// --- 11. RETRY FAILED DISTRIBUTIONS ---
exports.retryFailedDistributions = onCall(VERIFY_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }

    const { reportId, companyIds } = request.data;
    if (!reportId || !companyIds || !Array.isArray(companyIds)) {
        throw new HttpsError("invalid-argument", "reportId and companyIds array required.");
    }

    try {
        const results = [];
        const { dealLeadsToCompany } = require("./leadLogic"); // Already localized!

        for (const companyId of companyIds) {
            const companySnap = await db.collection("companies").doc(companyId).get();
            if (!companySnap.exists) {
                results.push({ companyId, status: 'failed', error: 'Company not found' });
                continue;
            }

            const company = { id: companySnap.id, ...companySnap.data() };
            const isPaid = company.planType?.toLowerCase() === 'paid';
            let quota = isPaid ? 200 : 50;
            if (company.dailyLeadQuota && company.dailyLeadQuota > quota) {
                quota = company.dailyLeadQuota;
            }

            try {
                const result = await dealLeadsToCompany(company, quota, false);
                results.push({ companyId, status: 'success', result });
            } catch (err) {
                results.push({ companyId, status: 'failed', error: err.message });
            }
        }

        return { success: true, results };

    } catch (error) {
        console.error("Retry Error:", error);
        Sentry.captureException(error);
        throw new HttpsError("internal", error.message);
    }
});

// --- DIAGNOSTIC: Analyze Database Structure ---
exports.analyzeDatabase = onCall(VERIFY_OPTS, async (request) => {
    if (!request.auth || request.auth.token.roles?.globalRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Super Admin only.");
    }

    console.log("ANALYZING FIRESTORE DATABASE STRUCTURE...");
    const analysis = {
        globalLeads: {},
        companies: [],
        sampleData: {}
    };

    // 1. Analyze Global Leads Pool
    const leadsCountSnap = await db.collection("leads").count().get();
    analysis.globalLeads.total = leadsCountSnap.data().count;

    const sample100 = await db.collection("leads").limit(100).get();
    let hasFirstName = 0, hasLastName = 0, hasFullName = 0, hasPhone = 0, hasEmail = 0;
    let emptyNames = 0, badNames = 0;

    sample100.docs.forEach(doc => {
        const d = doc.data();
        if (d.firstName) hasFirstName++;
        if (d.lastName) hasLastName++;
        if (d.fullName) hasFullName++;
        if (d.phone) hasPhone++;
        if (d.email) hasEmail++;

        const fn = (d.firstName || '').toLowerCase();
        const ln = (d.lastName || '').toLowerCase();
        if (!fn && !ln) emptyNames++;
        if (fn.includes('unknown') || ln.includes('unknown') || fn === 'driver') badNames++;
    });

    analysis.globalLeads.fieldAnalysis = {
        hasFirstName,
        hasLastName,
        hasFullName,
        hasPhone,
        hasEmail,
        emptyNames,
        badNames,
        sampleSize: sample100.size
    };

    // Sample lead structure
    if (!sample100.empty) {
        analysis.sampleData.globalLead = sample100.docs[0].data();
    }

    // 2. Analyze Companies
    const companiesSnap = await db.collection("companies").get();
    let activeCount = 0, inactiveCount = 0;

    for (const doc of companiesSnap.docs) {
        const d = doc.data();
        const isActive = d.isActive !== false;
        if (isActive) activeCount++;
        else inactiveCount++;

        const platformLeadsCount = (await doc.ref.collection("leads")
            .where("isPlatformLead", "==", true).count().get()).data().count;

        analysis.companies.push({
            id: doc.id,
            name: d.companyName,
            planType: d.planType || 'free',
            isActive,
            platformLeads: platformLeadsCount,
            quota: (d.planType === 'paid' ? 200 : 50)
        });
    }

    analysis.companySummary = {
        total: companiesSnap.size,
        active: activeCount,
        inactive: inactiveCount
    };

    // 3. Sample distributed lead
    const companyWithLeads = analysis.companies.find(c => c.platformLeads > 0);
    if (companyWithLeads) {
        const distLeadSnap = await db.collection("companies")
            .doc(companyWithLeads.id)
            .collection("leads")
            .where("isPlatformLead", "==", true)
            .limit(1).get();

        if (!distLeadSnap.empty) {
            analysis.sampleData.distributedLead = distLeadSnap.docs[0].data();
        }
    }

    // 4. Drivers collection (source)
    const driversCount = (await db.collection("drivers").count().get()).data().count;
    analysis.driversCount = driversCount;

    const driverSnap = await db.collection("drivers").limit(1).get();
    if (!driverSnap.empty) {
        analysis.sampleData.driver = driverSnap.docs[0].data();
    }

    // 5. System settings
    const settingsSnap = await db.collection("system_settings").doc("distribution").get();
    analysis.systemSettings = settingsSnap.exists ? settingsSnap.data() : null;

    console.log("ANALYSIS COMPLETE");
    return analysis;
});

// --- HTTP DIAGNOSTIC ENDPOINT (for curl/gcloud testing) ---
exports.analyzeDatabaseHttp = onRequest({
    timeoutSeconds: 120,
    memory: '256MiB',
    cors: true
}, async (req, res) => {
    console.log("ANALYZING FIRESTORE DATABASE STRUCTURE...");
    const analysis = {
        globalLeads: {},
        companies: [],
        sampleData: {}
    };

    try {
        // 1. Analyze Global Leads Pool
        const leadsCountSnap = await db.collection("leads").count().get();
        analysis.globalLeads.total = leadsCountSnap.data().count;

        // Analyze a larger sample for name distribution
        const sampleSize = 500;
        const sampleSnap = await db.collection("leads").limit(sampleSize).get();

        let notSpecifiedCount = 0;
        let unknownCount = 0;
        let validNameCount = 0;
        const nameFrequency = {};

        sampleSnap.docs.forEach(doc => {
            const d = doc.data();
            const fn = (d.firstName || '').trim();
            const ln = (d.lastName || '').trim();
            const fullName = `${fn} ${ln}`.toLowerCase();

            if (fn === 'Not Specified' || ln === 'Not Specified') notSpecifiedCount++;
            else if (fullName.includes('unknown') || fullName.includes('driver') || fullName === ' ') unknownCount++;
            else validNameCount++;

            // Track frequency
            const key = `${fn} ${ln}`;
            nameFrequency[key] = (nameFrequency[key] || 0) + 1;
        });

        // Get top 5 most common names
        const topNames = Object.entries(nameFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count, percentage: Math.round((count / sampleSize) * 100) + '%' }));

        analysis.globalLeads.qualityInfo = {
            sampleSize,
            notSpecifiedCount,
            notSpecifiedPercentage: Math.round((notSpecifiedCount / sampleSize) * 100) + '%',
            unknownCount,
            validNameCount,
            estimatedRealLeads: Math.round((validNameCount / sampleSize) * leadsCountSnap.data().count),
            topNames
        };

        // Sample lead structure
        if (!sampleSnap.empty) {
            const sampleDoc = sampleSnap.docs[0].data();
            analysis.sampleData.globalLeadFields = Object.keys(sampleDoc);
            analysis.sampleData.globalLead = {
                firstName: sampleDoc.firstName,
                lastName: sampleDoc.lastName,
                fullName: sampleDoc.fullName,
                phone: sampleDoc.phone ? "(has phone)" : null,
                email: sampleDoc.email ? "(has email)" : null
            };
        }

        // 2. Analyze Companies
        const companiesSnap = await db.collection("companies").get();
        let activeCount = 0, inactiveCount = 0;

        for (const doc of companiesSnap.docs) {
            const d = doc.data();
            const isActive = d.isActive !== false;
            if (isActive) activeCount++;
            else inactiveCount++;

            const platformLeadsCount = (await doc.ref.collection("leads")
                .where("isPlatformLead", "==", true).count().get()).data().count;

            analysis.companies.push({
                id: doc.id,
                name: d.companyName,
                planType: d.planType || 'free',
                isActive,
                platformLeads: platformLeadsCount,
                quota: (d.planType === 'paid' ? 200 : 50)
            });
        }

        analysis.companySummary = {
            total: companiesSnap.size,
            active: activeCount,
            inactive: inactiveCount
        };

        // 3. Sample distributed lead
        const companyWithLeads = analysis.companies.find(c => c.platformLeads > 0);
        if (companyWithLeads) {
            const distLeadSnap = await db.collection("companies")
                .doc(companyWithLeads.id)
                .collection("leads")
                .where("isPlatformLead", "==", true)
                .limit(1).get();

            if (!distLeadSnap.empty) {
                const distDoc = distLeadSnap.docs[0].data();
                analysis.sampleData.distributedLeadFields = Object.keys(distDoc);
                analysis.sampleData.distributedLead = {
                    fullName: distDoc.fullName,
                    phone: distDoc.phone ? "(has phone)" : null,
                    email: distDoc.email ? "(has email)" : null,
                    isPlatformLead: distDoc.isPlatformLead,
                    originalLeadId: distDoc.originalLeadId
                };
            }
        }

        // 4. Drivers collection (source)
        const driversCount = (await db.collection("drivers").count().get()).data().count;
        analysis.driversCount = driversCount;

        const driverSnap = await db.collection("drivers").limit(1).get();
        if (!driverSnap.empty) {
            const driverDoc = driverSnap.docs[0].data();
            analysis.sampleData.driverFields = Object.keys(driverDoc);
            if (driverDoc.personalInfo) {
                analysis.sampleData.personalInfoFields = Object.keys(driverDoc.personalInfo);
            }
        }

        // 5. System settings
        const settingsSnap = await db.collection("system_settings").doc("distribution").get();
        analysis.systemSettings = settingsSnap.exists ? settingsSnap.data() : null;

        console.log("ANALYSIS COMPLETE", JSON.stringify(analysis, null, 2));
        res.json(analysis);

    } catch (error) {
        console.error("Analysis error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- FIX DISTRIBUTION: Complete reset and redistribute ---
exports.fixDistributionHttp = onRequest({ 
    timeoutSeconds: 540, 
    memory: '1GiB',
    cors: true 
}, async (req, res) => {
    console.log("=== STARTING COMPLETE DISTRIBUTION FIX (v2.0 - Frontend Compatible) ===");
    const results = {
        step1_resetPool: {},
        step2_cleanCompanies: {},
        step3_distribute: {}
    };

    try {
        // STEP 1: Reset ALL global leads (clear visitedCompanyIds and unavailableUntil)
        console.log("STEP 1: Resetting global leads pool...");
        const leadsSnap = await db.collection("leads").get();
        let resetCount = 0;
        let batch = db.batch();
        let batchSize = 0;

        for (const doc of leadsSnap.docs) {
            batch.update(doc.ref, {
                visitedCompanyIds: [],
                unavailableUntil: null,
                lastAssignedTo: null
            });
            resetCount++;
            batchSize++;

            if (batchSize >= 400) {
                await batch.commit();
                batch = db.batch();
                batchSize = 0;
            }
        }
        if (batchSize > 0) await batch.commit();

        results.step1_resetPool = {
            success: true,
            leadsReset: resetCount
        };
        console.log(`STEP 1 COMPLETE: Reset ${resetCount} leads`);

        // STEP 2: Delete ALL platform leads from company subcollections
        console.log("STEP 2: Cleaning company subcollections...");
        const companiesSnap = await db.collection("companies").get();
        let totalDeleted = 0;

        for (const companyDoc of companiesSnap.docs) {
            const platformLeadsSnap = await companyDoc.ref
                .collection("leads")
                .where("isPlatformLead", "==", true)
                .get();

            if (platformLeadsSnap.empty) continue;

            let cBatch = db.batch();
            let cSize = 0;

            for (const leadDoc of platformLeadsSnap.docs) {
                cBatch.delete(leadDoc.ref);
                cSize++;
                totalDeleted++;

                if (cSize >= 400) {
                    await cBatch.commit();
                    cBatch = db.batch();
                    cSize = 0;
                }
            }
            if (cSize > 0) await cBatch.commit();
        }

        results.step2_cleanCompanies = {
            success: true,
            leadsDeleted: totalDeleted
        };
        console.log(`STEP 2 COMPLETE: Deleted ${totalDeleted} platform leads from companies`);

        // STEP 3: Fresh distribution with FRONTEND COMPATIBLE FIELD MAPPING
        console.log("STEP 3: Running fresh distribution...");
        
        // Get active companies
        const activeCompanies = companiesSnap.docs
            .filter(d => d.data().isActive !== false)
            .map(d => ({ id: d.id, ...d.data() }));

        // Get all leads fresh
        const freshLeadsSnap = await db.collection("leads").get();
        const allLeads = freshLeadsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ref: doc.ref, 
            data: doc.data() 
        }));

        // Shuffle leads
        for (let i = allLeads.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allLeads[i], allLeads[j]] = [allLeads[j], allLeads[i]];
        }

        console.log(`Processing ${activeCompanies.length} companies, ${allLeads.length} leads available`);

        const assignedLeadIds = new Set();
        const nowTs = admin.firestore.Timestamp.now();
        const companyResults = [];

        // Helper to clean names
        const cleanName = (val) => {
            if (!val) return "";
            const s = String(val).trim();
            const lower = s.toLowerCase();
            if (["not specified", "unknown", "driver", "n/a", "null", "undefined"].includes(lower)) return "";
            return s;
        };

        for (const company of activeCompanies) {
            const isPaid = company.planType?.toLowerCase() === 'paid';
            const quota = isPaid ? 200 : 50;

            let assigned = 0;
            let dBatch = db.batch();
            let dSize = 0;

            for (const lead of allLeads) {
                if (assignedLeadIds.has(lead.id)) continue;
                if (assigned >= quota) break;

                // VALIDATION
                const rawPhone = lead.data.phone || '';
                const rawEmail = lead.data.email || '';
                
                const fn = cleanName(lead.data.firstName);
                const ln = cleanName(lead.data.lastName);
                
                // Check contact existence
                const hasContact = rawPhone.length > 5 || (rawEmail.includes('@') && rawEmail.length > 5);

                // SKIP GARBAGE: If no name AND no contact, skip it
                if (!fn && !ln && !hasContact) continue;

                // Construct Best Name
                let bestName = `${fn} ${ln}`.trim();
                
                // Fallback Name if empty but has contact
                if (!bestName) {
                    if (rawEmail) bestName = rawEmail.split('@')[0]; // Try email username
                    else bestName = "SafeHaul Driver"; // Generic fallback
                }

                if (bestName.toLowerCase() === "not specified not specified") bestName = "SafeHaul Driver";

                // SPLIT FOR FRONTEND (Crucial Fix)
                // The frontend reads firstName and lastName, so we MUST populate them
                const nameParts = bestName.split(' ');
                const finalFirstName = nameParts[0] || "SafeHaul";
                const finalLastName = nameParts.slice(1).join(' ') || "Driver";

                const companyLeadRef = db.collection("companies")
                    .doc(company.id)
                    .collection("leads")
                    .doc();

                dBatch.set(companyLeadRef, {
                    fullName: bestName,
                    firstName: finalFirstName, // REQUIRED by frontend
                    lastName: finalLastName,   // REQUIRED by frontend
                    phone: rawPhone,
                    email: rawEmail,
                    driverType: lead.data.driverType || "Driver",
                    experience: lead.data.experience || "N/A",
                    city: lead.data.city || "",
                    state: lead.data.state || "",
                    source: "SafeHaul Network",
                    sharedHistory: [],
                    isPlatformLead: true,
                    distributedAt: nowTs,
                    originalLeadId: lead.id,
                    status: "New Lead",
                    assignedTo: null
                });

                dBatch.update(lead.ref, {
                    unavailableUntil: admin.firestore.Timestamp.fromDate(
                        new Date(Date.now() + 24 * 60 * 60 * 1000)
                    ),
                    lastAssignedTo: company.id,
                    visitedCompanyIds: admin.firestore.FieldValue.arrayUnion(company.id)
                });

                assignedLeadIds.add(lead.id);
                assigned++;
                dSize += 2;

                if (dSize >= 400) {
                    await dBatch.commit();
                    dBatch = db.batch();
                    dSize = 0;
                }
            }
            if (dSize > 0) await dBatch.commit();

            companyResults.push({
                name: company.companyName,
                quota: quota,
                assigned: assigned,
                fulfillment: Math.round((assigned / quota) * 100) + '%'
            });

            console.log(`  ${company.companyName}: ${assigned}/${quota} (${Math.round((assigned/quota)*100)}%)`);
        }

        results.step3_distribute = {
            success: true,
            companiesProcessed: companyResults.length,
            totalAssigned: assignedLeadIds.size,
            companies: companyResults
        };

        console.log("=== DISTRIBUTION FIX COMPLETE ===");
        res.json({
            success: true,
            message: "Distribution fix complete!",
            results
        });

    } catch (error) {
        console.error("Fix error:", error);
        res.status(500).json({ error: error.message, partialResults: results });
    }
});

// --- CREATE TEST ACCESS: Generate Admin/User for Verification ---
exports.createTestAccessHttp = onRequest({ cors: true }, async (req, res) => {
    try {
        const users = [
            {
                email: "antigravity_super@test.com",
                password: "password123",
                role: "super_admin",
                name: "Antigravity Super"
            },
            {
                email: "antigravity_raystar@test.com",
                password: "password123",
                role: "company_admin",
                companyId: "iHexmEEmD8ygvL6qZ5Zd", // Ray Star LLC
                name: "Antigravity RayStar"
            }
        ];

        const results = [];

        for (const u of users) {
             let userRecord;
             try {
                 userRecord = await admin.auth().getUserByEmail(u.email);
                 // Update if exists
                 await admin.auth().updateUser(userRecord.uid, { password: u.password });
                 results.push(`Updated existing user: ${u.email}`);
             } catch (e) {
                 if (e.code === 'auth/user-not-found') {
                     userRecord = await admin.auth().createUser({
                         email: u.email,
                         password: u.password,
                         displayName: u.name
                     });
                     results.push(`Created new user: ${u.email}`);
                 } else {
                     throw e;
                 }
             }

             // Set Custom Claims
             await admin.auth().setCustomUserClaims(userRecord.uid, { 
                 role: u.role, 
                 companyId: u.companyId || null 
             });

             // Create/Update Firestore User Document
             await db.collection("users").doc(userRecord.uid).set({
                 email: u.email,
                 role: u.role,
                 firstName: u.name.split(' ')[0],
                 lastName: u.name.split(' ')[1],
                 companyId: u.companyId || null,
                 createdAt: admin.firestore.FieldValue.serverTimestamp()
             }, { merge: true });
        }

        res.json({ success: true, messages: results });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});