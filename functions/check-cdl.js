/**
 * Quick script to check if Valentin Joseph's CDL files exist in Firestore/Storage
 * Run from functions/ directory: node check-cdl.js
 */
const admin = require('firebase-admin');
const { db } = require('./firebaseAdmin');

const bucket = admin.storage().bucket('truckerapp-system.firebasestorage.app');

async function checkValentinCDL() {
    console.log('Searching for Valentin Joseph across all companies...\n');

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const appsSnap = await db.collection('companies').doc(companyId).collection('applications').get();

        for (const appDoc of appsSnap.docs) {
            const data = appDoc.data();
            const firstName = (data.firstName || '').toLowerCase();
            const lastName = (data.lastName || '').toLowerCase();

            if (firstName.includes('valentin') || lastName.includes('joseph')) {
                console.log(`FOUND: ${data.firstName} ${data.lastName}`);
                console.log(`   Company ID: ${companyId}`);
                console.log(`   Application ID: ${appDoc.id}`);
                console.log(`   Driver/User ID: ${data.driverId || data.userId || 'N/A'}`);
                console.log(`   Status: ${data.status}`);
                console.log('');

                // Check CDL fields in Firestore
                const cdlFront = data['cdl-front'];
                const cdlBack = data['cdl-back'];

                console.log('CDL Front field in Firestore:');
                if (cdlFront) {
                    console.log(`   Type: ${typeof cdlFront}`);
                    if (typeof cdlFront === 'object') {
                        console.log(`   Keys: ${Object.keys(cdlFront).join(', ')}`);
                        console.log(`   name: ${cdlFront.name || 'N/A'}`);
                        console.log(`   url: ${cdlFront.url ? cdlFront.url.substring(0, 100) + '...' : 'N/A'}`);
                        console.log(`   storagePath: ${cdlFront.storagePath || 'N/A'}`);
                    } else {
                        console.log(`   Value: ${String(cdlFront).substring(0, 100)}`);
                    }
                } else {
                    console.log('   NOT FOUND (field is null/undefined)');
                }

                console.log('');
                console.log('CDL Back field in Firestore:');
                if (cdlBack) {
                    console.log(`   Type: ${typeof cdlBack}`);
                    if (typeof cdlBack === 'object') {
                        console.log(`   Keys: ${Object.keys(cdlBack).join(', ')}`);
                        console.log(`   name: ${cdlBack.name || 'N/A'}`);
                        console.log(`   url: ${cdlBack.url ? cdlBack.url.substring(0, 100) + '...' : 'N/A'}`);
                        console.log(`   storagePath: ${cdlBack.storagePath || 'N/A'}`);
                    } else {
                        console.log(`   Value: ${String(cdlBack).substring(0, 100)}`);
                    }
                } else {
                    console.log('   NOT FOUND (field is null/undefined)');
                }

                // Check Storage
                console.log('');
                console.log('Checking Firebase Storage...');

                const userId = data.driverId || data.userId || appDoc.id;
                const prefixes = [
                    `companies/${companyId}/applications/${userId}/`,
                    `companies/${companyId}/applications/${appDoc.id}/`
                ];

                for (const prefix of prefixes) {
                    try {
                        const [files] = await bucket.getFiles({ prefix: prefix, maxResults: 20 });
                        if (files.length > 0) {
                            console.log(`   Found ${files.length} files under ${prefix}:`);
                            files.forEach(f => console.log(`     - ${f.name}`));
                        } else {
                            console.log(`   No files found under: ${prefix}`);
                        }
                    } catch (storageErr) {
                        console.log(`   Storage error for ${prefix}: ${storageErr.message}`);
                    }
                }

                // Other file fields
                console.log('');
                console.log('Other file-related fields:');
                ['medical-card-upload', 'ssc-upload', 'twic-card-upload', 'uploadedDocuments'].forEach(key => {
                    const val = data[key];
                    if (val) {
                        console.log(`   ${key}: ${typeof val === 'object' ? JSON.stringify(Object.keys(val)) : String(val).substring(0, 60)}`);
                    }
                });

                console.log('\n' + '='.repeat(60) + '\n');
            }
        }
    }

    console.log('Check complete.');
    process.exit(0);
}

checkValentinCDL().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
