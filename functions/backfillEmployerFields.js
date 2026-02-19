/**
 * Backfill Employer Fields — Cloud Function
 * 
 * One-time migration to rename old employer field names to schema-compliant names.
 * Renames: name → companyName, street → address, reason → reasonForLeaving
 * Preserves original fields alongside new ones for backward compatibility.
 * 
 * Idempotent — safe to run multiple times.
 * 
 * @module backfillEmployerFields
 */

const functions = require('firebase-functions/v1');
const { db } = require('./firebaseAdmin');

exports.backfillEmployerFields = functions
    .runWith({ memory: '512MB', timeoutSeconds: 540 })
    .https.onCall(async (data, context) => {
        // Only super admins should be able to run this
        // But we'll check auth at minimum
        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'Must be authenticated to run backfill.'
            );
        }

        console.log('[backfillEmployerFields] Starting employer field migration...');

        let totalDocs = 0;
        let updatedDocs = 0;
        let skippedDocs = 0;
        let errorDocs = 0;

        try {
            // Get all companies
            const companiesSnap = await db.collection('companies').get();
            console.log(`[backfillEmployerFields] Found ${companiesSnap.size} companies`);

            for (const companyDoc of companiesSnap.docs) {
                const companyId = companyDoc.id;

                // Get all applications for this company
                const appsSnap = await db
                    .collection('companies')
                    .doc(companyId)
                    .collection('applications')
                    .get();

                if (appsSnap.empty) continue;

                // Process in batches of 400 (Firestore max is 500 per batch)
                let batch = db.batch();
                let batchCount = 0;

                for (const appDoc of appsSnap.docs) {
                    totalDocs++;
                    const appData = appDoc.data();
                    const employers = appData.employers;

                    // Skip if no employers array
                    if (!Array.isArray(employers) || employers.length === 0) {
                        skippedDocs++;
                        continue;
                    }

                    // Check if any employer needs migration
                    let needsMigration = false;
                    const migratedEmployers = employers.map(emp => {
                        const updated = { ...emp };

                        // name → companyName (only if companyName doesn't already exist)
                        if (emp.name && !emp.companyName) {
                            updated.companyName = emp.name;
                            needsMigration = true;
                        }

                        // street → address (only if address doesn't already exist)
                        if (emp.street && !emp.address) {
                            updated.address = emp.street;
                            needsMigration = true;
                        }

                        // reason → reasonForLeaving (only if reasonForLeaving doesn't already exist)
                        if (emp.reason && !emp.reasonForLeaving) {
                            updated.reasonForLeaving = emp.reason;
                            needsMigration = true;
                        }

                        return updated;
                    });

                    if (!needsMigration) {
                        skippedDocs++;
                        continue;
                    }

                    try {
                        batch.update(appDoc.ref, { employers: migratedEmployers });
                        batchCount++;
                        updatedDocs++;

                        // Commit batch when it reaches 400
                        if (batchCount >= 400) {
                            await batch.commit();
                            console.log(`[backfillEmployerFields] Committed batch of ${batchCount} for company ${companyId}`);
                            batch = db.batch();
                            batchCount = 0;
                        }
                    } catch (err) {
                        console.error(`[backfillEmployerFields] Error updating ${appDoc.ref.path}:`, err);
                        errorDocs++;
                    }
                }

                // Commit remaining batch for this company
                if (batchCount > 0) {
                    await batch.commit();
                    console.log(`[backfillEmployerFields] Committed final batch of ${batchCount} for company ${companyId}`);
                }
            }

            const message = `Backfill complete! Processed ${totalDocs} applications: ${updatedDocs} updated, ${skippedDocs} skipped (already correct), ${errorDocs} errors.`;
            console.log(`[backfillEmployerFields] ${message}`);

            return {
                success: true,
                message,
                stats: { totalDocs, updatedDocs, skippedDocs, errorDocs }
            };

        } catch (error) {
            console.error('[backfillEmployerFields] Fatal error:', error);
            throw new functions.https.HttpsError(
                'internal',
                `Backfill failed: ${error.message}. Processed ${updatedDocs}/${totalDocs} before failure.`
            );
        }
    });
