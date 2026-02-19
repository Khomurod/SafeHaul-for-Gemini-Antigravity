/**
 * Quick script to check if Valentin Joseph's CDL files exist in Firestore/Storage
 */
const admin = require('firebase-admin');
const path = require('path');

// Initialize with service account
const serviceAccountPath = path.join(__dirname, '..', 'functions', 'serviceAccountKey.json');
try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'truckerapp-system.appspot.com'
    });
} catch (e) {
    // Try default if service account not found
    admin.initializeApp({
        storageBucket: 'truckerapp-system.appspot.com'
    });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function checkValentinCDL() {
    console.log('🔍 Searching for Valentin Joseph across all companies...\n');

    // Search across all companies' applications
    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const appsSnap = await db.collection('companies').doc(companyId).collection('applications').get();

        for (const appDoc of appsSnap.docs) {
            const data = appDoc.data();
            const firstName = (data.firstName || '').toLowerCase();
            const lastName = (data.lastName || '').toLowerCase();

            if (firstName.includes('valentin') || lastName.includes('joseph')) {
                console.log(`✅ FOUND: ${data.firstName} ${data.lastName}`);
                console.log(`   Company ID: ${companyId}`);
                console.log(`   Application ID: ${appDoc.id}`);
                console.log(`   Driver/User ID: ${data.driverId || data.userId || 'N/A'}`);
                console.log(`   Status: ${data.status}`);
                console.log('');

                // Check CDL fields in Firestore
                const cdlFront = data['cdl-front'];
                const cdlBack = data['cdl-back'];

                console.log('📋 CDL Front field in Firestore:');
                if (cdlFront) {
                    console.log(`   Type: ${typeof cdlFront}`);
                    if (typeof cdlFront === 'object') {
                        console.log(`   Keys: ${Object.keys(cdlFront).join(', ')}`);
                        console.log(`   name: ${cdlFront.name || 'N/A'}`);
                        console.log(`   url: ${cdlFront.url ? cdlFront.url.substring(0, 80) + '...' : 'N/A'}`);
                        console.log(`   storagePath: ${cdlFront.storagePath || 'N/A'}`);
                    } else {
                        console.log(`   Value: ${String(cdlFront).substring(0, 100)}`);
                    }
                } else {
                    console.log('   ❌ NOT FOUND (field is null/undefined)');
                }

                console.log('');
                console.log('📋 CDL Back field in Firestore:');
                if (cdlBack) {
                    console.log(`   Type: ${typeof cdlBack}`);
                    if (typeof cdlBack === 'object') {
                        console.log(`   Keys: ${Object.keys(cdlBack).join(', ')}`);
                        console.log(`   name: ${cdlBack.name || 'N/A'}`);
                        console.log(`   url: ${cdlBack.url ? cdlBack.url.substring(0, 80) + '...' : 'N/A'}`);
                        console.log(`   storagePath: ${cdlBack.storagePath || 'N/A'}`);
                    } else {
                        console.log(`   Value: ${String(cdlBack).substring(0, 100)}`);
                    }
                } else {
                    console.log('   ❌ NOT FOUND (field is null/undefined)');
                }

                // Check Storage if we have paths
                console.log('');
                console.log('🗂️  Checking Firebase Storage...');

                const userId = data.driverId || data.userId || appDoc.id;
                const prefix = `companies/${companyId}/applications/${userId}/`;

                try {
                    const [files] = await bucket.getFiles({ prefix: prefix, maxResults: 20 });
                    if (files.length > 0) {
                        console.log(`   Found ${files.length} files under ${prefix}:`);
                        files.forEach(f => {
                            console.log(`   📄 ${f.name}`);
                        });
                    } else {
                        console.log(`   ❌ No files found under: ${prefix}`);

                        // Also check with appId as folder
                        const prefix2 = `companies/${companyId}/applications/${appDoc.id}/`;
                        const [files2] = await bucket.getFiles({ prefix: prefix2, maxResults: 20 });
                        if (files2.length > 0) {
                            console.log(`   Found ${files2.length} files under ${prefix2}:`);
                            files2.forEach(f => {
                                console.log(`   📄 ${f.name}`);
                            });
                        } else {
                            console.log(`   ❌ No files found under: ${prefix2} either`);
                        }
                    }
                } catch (storageErr) {
                    console.log(`   ⚠️ Storage error: ${storageErr.message}`);
                }

                // Also list other file fields
                console.log('');
                console.log('📋 Other file-related fields in Firestore:');
                const fileKeys = ['medical-card-upload', 'ssc-upload', 'twic-card-upload', 'uploadedDocuments'];
                fileKeys.forEach(key => {
                    const val = data[key];
                    if (val) {
                        console.log(`   ${key}: ${typeof val === 'object' ? JSON.stringify(Object.keys(val)) : String(val).substring(0, 60)}`);
                    }
                });

                console.log('\n' + '='.repeat(60) + '\n');
            }
        }
    }

    // Also check leads collection
    const leadsSnap = await db.collection('leads').get();
    for (const leadDoc of leadsSnap.docs) {
        const data = leadDoc.data();
        const firstName = (data.firstName || '').toLowerCase();
        const lastName = (data.lastName || '').toLowerCase();
        if (firstName.includes('valentin') || lastName.includes('joseph')) {
            console.log(`📋 Also found in LEADS collection: ${data.firstName} ${data.lastName} (ID: ${leadDoc.id})`);
        }
    }

    console.log('\n✅ Check complete.');
    process.exit(0);
}

checkValentinCDL().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
