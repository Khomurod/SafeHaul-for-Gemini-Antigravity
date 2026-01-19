// Diagnostic Script - Run with: node analyzeDistribution.js
// This will analyze the actual Firestore database structure

const { admin, db } = require('./firebaseAdmin');

async function analyzeDatabase() {
    console.log("=".repeat(80));
    console.log("FIRESTORE DATABASE STRUCTURE ANALYSIS");
    console.log("=".repeat(80));

    // 1. ANALYZE GLOBAL LEADS COLLECTION
    console.log("\n\n📁 COLLECTION: leads (GLOBAL POOL)");
    console.log("-".repeat(60));

    const leadsSnap = await db.collection("leads").limit(5).get();
    const leadsCountSnap = await db.collection("leads").count().get();
    console.log(`Total leads in pool: ${leadsCountSnap.data().count}`);

    if (!leadsSnap.empty) {
        console.log("\n🔍 Sample Lead Document Fields:");
        const sampleLead = leadsSnap.docs[0].data();
        console.log("Document ID:", leadsSnap.docs[0].id);
        Object.keys(sampleLead).forEach(key => {
            const value = sampleLead[key];
            const type = typeof value;
            let display = value;
            if (value && value.toDate) display = '[Timestamp]';
            if (Array.isArray(value)) display = `[Array: ${value.length} items]`;
            console.log(`  - ${key}: ${display} (${type})`);
        });

        // Check for firstName vs fullName
        console.log("\n📊 Field Analysis (first 100 leads):");
        const sample100 = await db.collection("leads").limit(100).get();
        let hasFirstName = 0, hasLastName = 0, hasFullName = 0, hasPhone = 0, hasEmail = 0;
        let emptyNames = 0, unknownNames = 0;

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
            if (fn.includes('unknown') || ln.includes('unknown') || fn.includes('driver')) unknownNames++;
        });

        console.log(`  - Has firstName: ${hasFirstName}/100`);
        console.log(`  - Has lastName: ${hasLastName}/100`);
        console.log(`  - Has fullName: ${hasFullName}/100`);
        console.log(`  - Has phone: ${hasPhone}/100`);
        console.log(`  - Has email: ${hasEmail}/100`);
        console.log(`  - Empty names: ${emptyNames}/100`);
        console.log(`  - Unknown/bad names: ${unknownNames}/100`);
    }

    // 2. ANALYZE COMPANIES COLLECTION
    console.log("\n\n📁 COLLECTION: companies");
    console.log("-".repeat(60));

    const companiesSnap = await db.collection("companies").get();
    console.log(`Total companies: ${companiesSnap.size}`);

    let activeCount = 0, inactiveCount = 0;
    const companySummary = [];

    for (const doc of companiesSnap.docs) {
        const d = doc.data();
        if (d.isActive === false) inactiveCount++;
        else activeCount++;

        // Count leads in subcollection
        const leadsCountSnap = await doc.ref.collection("leads").count().get();
        const platformLeadsCountSnap = await doc.ref.collection("leads").where("isPlatformLead", "==", true).count().get();

        companySummary.push({
            id: doc.id,
            name: d.companyName || doc.id,
            planType: d.planType || 'unknown',
            isActive: d.isActive !== false,
            totalLeads: leadsCountSnap.data().count,
            platformLeads: platformLeadsCountSnap.data().count
        });
    }

    console.log(`Active: ${activeCount}, Inactive: ${inactiveCount}`);
    console.log("\n📊 Companies with Lead Counts:");
    companySummary.sort((a, b) => b.platformLeads - a.platformLeads);
    companySummary.forEach(c => {
        const status = c.isActive ? '✅' : '❌';
        console.log(`  ${status} ${c.name} (${c.planType}): ${c.platformLeads} platform / ${c.totalLeads} total`);
    });

    // 3. ANALYZE COMPANY LEADS SUBCOLLECTION STRUCTURE
    console.log("\n\n📁 SUBCOLLECTION: companies/{id}/leads");
    console.log("-".repeat(60));

    const companyWithLeads = companySummary.find(c => c.platformLeads > 0);
    if (companyWithLeads) {
        const companyDoc = companiesSnap.docs.find(d => d.id === companyWithLeads.id);
        const platformLeadsSnap = await companyDoc.ref.collection("leads").where("isPlatformLead", "==", true).limit(5).get();

        if (!platformLeadsSnap.empty) {
            console.log(`\n🔍 Sample Distributed Lead (from ${companyWithLeads.name}):`);
            const sampleDistLead = platformLeadsSnap.docs[0].data();
            Object.keys(sampleDistLead).forEach(key => {
                const value = sampleDistLead[key];
                const type = typeof value;
                let display = value;
                if (value && value.toDate) display = '[Timestamp]';
                if (Array.isArray(value)) display = `[Array: ${value.length} items]`;
                console.log(`  - ${key}: ${display} (${type})`);
            });

            // Check for bad data in company leads
            console.log("\n📊 Quality Check (all platform leads in this company):");
            const allPlatformLeads = await companyDoc.ref.collection("leads").where("isPlatformLead", "==", true).get();
            let badNames = 0, noContact = 0;
            allPlatformLeads.docs.forEach(doc => {
                const d = doc.data();
                const fn = (d.fullName || '').toLowerCase();
                if (fn.includes('unknown') || fn.includes('not specified') || fn === '') badNames++;
                if (!d.phone && !d.email) noContact++;
            });
            console.log(`  - Bad names (unknown/not specified): ${badNames}/${allPlatformLeads.size}`);
            console.log(`  - No contact info: ${noContact}/${allPlatformLeads.size}`);
        }
    }

    // 4. ANALYZE DRIVERS COLLECTION
    console.log("\n\n📁 COLLECTION: drivers");
    console.log("-".repeat(60));

    const driversCountSnap = await db.collection("drivers").count().get();
    console.log(`Total drivers: ${driversCountSnap.data().count}`);

    const driversSnap = await db.collection("drivers").limit(3).get();
    if (!driversSnap.empty) {
        console.log("\n🔍 Sample Driver Structure:");
        const sampleDriver = driversSnap.docs[0].data();

        if (sampleDriver.personalInfo) {
            console.log("  📋 personalInfo:");
            Object.keys(sampleDriver.personalInfo).forEach(key => {
                const val = sampleDriver.personalInfo[key];
                console.log(`    - ${key}: ${val || '(empty)'}`);
            });
        }

        if (sampleDriver.driverProfile) {
            console.log("  📋 driverProfile:");
            Object.keys(sampleDriver.driverProfile).forEach(key => {
                const val = sampleDriver.driverProfile[key];
                if (typeof val !== 'object') {
                    console.log(`    - ${key}: ${val || '(empty)'}`);
                }
            });
        }
    }

    // 5. SYSTEM SETTINGS
    console.log("\n\n📁 system_settings/distribution");
    console.log("-".repeat(60));

    const settingsSnap = await db.collection("system_settings").doc("distribution").get();
    if (settingsSnap.exists) {
        const settings = settingsSnap.data();
        Object.keys(settings).forEach(key => {
            console.log(`  - ${key}: ${settings[key]}`);
        });
    } else {
        console.log("  (Document does not exist)");
    }

    // 6. SUMMARY
    console.log("\n\n" + "=".repeat(80));
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));

    const totalQuota = companySummary.reduce((sum, c) => {
        if (!c.isActive) return sum;
        const quota = c.planType === 'paid' ? 200 : 50;
        return sum + quota;
    }, 0);

    const totalDistributed = companySummary.reduce((sum, c) => sum + c.platformLeads, 0);

    console.log(`\nTotal leads in global pool: ${leadsCountSnap.data().count}`);
    console.log(`Total companies: ${companiesSnap.size} (${activeCount} active, ${inactiveCount} inactive)`);
    console.log(`Total quota needed: ${totalQuota} leads`);
    console.log(`Total currently distributed: ${totalDistributed} leads`);
    console.log(`Gap: ${leadsCountSnap.data().count - (totalQuota - totalDistributed)} leads available for next distribution`);

    console.log("\n" + "=".repeat(80));

    process.exit(0);
}

analyzeDatabase().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
