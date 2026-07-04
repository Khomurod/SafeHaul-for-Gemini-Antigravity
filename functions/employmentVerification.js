/**
 * Employment Verification Cloud Functions
 * =========================================
 * Implements FMCSA 49 CFR §391.23 compliant Previous Employment Verification (PEV)
 * with a secure, tokenized public response portal.
 *
 * Architecture:
 *  - Company admin triggers PEV → generates a unique token → stores verification_requests doc
 *  - Email is sent with a "Complete Verification Online" button linking to /verify/:token
 *  - Previous employer clicks link → lands on public React form (no login)
 *  - Form submission calls submitVerificationResponse → stores response, generates PDF, notifies carrier
 *  - Scheduled function sends automated reminders at 5/10/15/20/30 day intervals
 *
 * Supporting modules (extracted for readability, behavior unchanged):
 *  - ./employmentVerification/emailTemplates.js — email HTML builders
 *  - ./employmentVerification/pdf.js            — DQ-file PDF generation
 *  - ./employmentVerification/notifications.js  — reminder + carrier notification senders
 */

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db, storage } = require("./firebaseAdmin");
const { sendDynamicEmail } = require("./emailService");
const { checkRateLimit } = require("./shared/rateLimiter");
const { assertCompanyAccessForRequest } = require("./shared/companyAccess");
const { v4: uuidv4 } = require("uuid");
const { logger } = require("firebase-functions");
const { buildVerificationEmailHTML } = require("./employmentVerification/emailTemplates");
const { generateVerificationPDF } = require("./employmentVerification/pdf");
const {
    sendReminderEmail,
    notifyCarrierVerificationComplete,
    notifyCarrierNoResponse,
} = require("./employmentVerification/notifications");

/**
 * RFC 5321/5322 compatible email validation.
 * More robust than a simple /^[^\s@]+@[^\s@]+\.[^\s@]+$/ regex.
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    // Max 254 chars per RFC 5321
    if (email.length > 254) return false;
    // Split into local@domain
    const atIndex = email.lastIndexOf('@');
    if (atIndex < 1) return false; // no @ or empty local part
    const local = email.substring(0, atIndex);
    const domain = email.substring(atIndex + 1);
    // local part max 64 chars
    if (local.length > 64 || domain.length < 3) return false;
    // Domain must contain a dot and no consecutive dots
    if (!domain.includes('.') || domain.includes('..')) return false;
    // Full pattern check (RFC 5322 simplified)
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}


// ============================================================
// 1. SEND VERIFICATION REQUEST (Called from PEVTab)
// ============================================================
exports.sendVerificationRequest = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const {
        companyId,
        applicationId,
        collectionName = 'applications',
        employerIndex,
        employerName,
        employerEmail,
        applicantName,
        employmentStartDate,
        employmentEndDate,
        deliveryMethod = 'email'
    } = request.data || {};

    // Validate required fields
    if (!companyId || !applicationId || employerIndex === undefined || !applicantName) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    if (deliveryMethod === 'email' && !employerEmail) {
        throw new HttpsError('invalid-argument', 'Employer email is required for email delivery.');
    }

    // PEV-SEC-2 FIX: Whitelist collectionName to prevent path injection attacks.
    const ALLOWED_COLLECTIONS = ['applications', 'leads'];
    if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
        throw new HttpsError('invalid-argument', `Invalid collection: ${collectionName}`);
    }

    // PEV-VAL-2 FIX: Validate employer email format server-side using RFC 5322 compatible check.
    if (deliveryMethod === 'email' && employerEmail && !isValidEmail(employerEmail)) {
        throw new HttpsError('invalid-argument', 'Invalid employer email address format.');
    }

    // PEV-VAL-3 FIX: Validate employerIndex is a non-negative integer.
    const empIndex = Number(employerIndex);
    if (!Number.isInteger(empIndex) || empIndex < 0) {
        throw new HttpsError('invalid-argument', 'employerIndex must be a non-negative integer.');
    }

    // PEV-SEC-1 FIX: Verify the caller actually belongs to the specified company.
    await assertCompanyAccessForRequest(request, companyId, 'PEV/sendVerificationRequest');

    try {
        // Get company name
        const companyDoc = await db.collection('companies').doc(companyId).get();
        if (!companyDoc.exists) throw new HttpsError('not-found', 'Company not found.');
        const companyData = companyDoc.data();
        const companyName = companyData.companyName || companyData.name || 'Prospective Employer';

        // Generate unique token
        const token = uuidv4();
        const now = admin.firestore.Timestamp.now();
        const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + (30 * 24 * 60 * 60 * 1000)); // 30 days
        const deadlineDate = new Date(expiresAt.toMillis()).toISOString().split('T')[0];

        // Determine base URL
        const baseUrl = companyData.appUrl || 'https://app.safehaul.io';

        // Create verification request document
        const verificationData = {
            token,
            companyId,
            applicationId,
            collectionName,
            employerIndex: Number(employerIndex),
            employerName: employerName || 'Former Employer',
            employerEmail: employerEmail || null,
            applicantName,
            employmentStartDate: employmentStartDate || 'N/A',
            employmentEndDate: employmentEndDate || 'N/A',
            companyName,
            deliveryMethod,
            status: 'sent',
            createdAt: now,
            expiresAt,
            openedAt: null,
            completedAt: null,
            reminderCount: 0,
            lastReminderAt: null,
            createdBy: request.auth.uid,
        };

        // Store in verification_requests collection (global, indexed by token)
        const verificationRef = db.collection('verification_requests').doc(token);
        await verificationRef.set(verificationData);

        // Send email if delivery method is email
        let emailResult = { success: true, message: 'Manual delivery - no email sent.' };
        if (deliveryMethod === 'email' && employerEmail) {
            const emailHTML = buildVerificationEmailHTML({
                applicantName,
                employerName: employerName || 'Former Employer',
                companyName,
                employmentDates: `${employmentStartDate || 'N/A'} to ${employmentEndDate || 'N/A'}`,
                token,
                baseUrl,
                deadlineDate,
            });

            const subject = `Previous Employment Verification Request – ${applicantName}`;
            emailResult = await sendDynamicEmail(companyId, employerEmail, subject, emailHTML);
        }

        logger.info(`[PEV] Verification request created. Token: ${token}, Applicant: ${applicantName}, Employer: ${employerName}`);

        return {
            success: true,
            token,
            emailResult,
            verificationUrl: `${baseUrl}/verify/${token}`,
        };

    } catch (error) {
        logger.error('[PEV] Error sending verification request:', error);
        throw new HttpsError('internal', `Failed to send verification request: ${error.message}`);
    }
});


// ============================================================
// 2. GET VERIFICATION (Public endpoint — token-based access)
// ============================================================
exports.getVerificationRequest = onCall({ cors: true }, async (request) => {
    const { token } = request.data || {};
    if (!token) throw new HttpsError('invalid-argument', 'Missing verification token.');

    // Rate limit: 20 reads per minute per token
    const isAllowed = await checkRateLimit(`pev_read_${token}`, 20, 60, 'closed');
    if (!isAllowed) throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment.');

    try {
        const docRef = db.collection('verification_requests').doc(token);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            throw new HttpsError('not-found', 'Verification request not found. The link may be invalid.');
        }

        const data = docSnap.data();

        // Check expiration
        if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
            throw new HttpsError('deadline-exceeded', 'This verification request has expired. Please contact the requesting company.');
        }

        // Check if already completed
        if (data.status === 'completed') {
            return {
                status: 'completed',
                completedAt: data.completedAt?.toDate()?.toISOString() || null,
                message: 'This verification has already been completed. Thank you.',
            };
        }

        // Track open (mark as opened if first time)
        if (['sent', 'pending', 'reminder_sent'].includes(data.status)) {
            await docRef.update({
                status: 'opened',
                openedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Return sanitized data (never expose internal IDs)
        return {
            status: 'pending',
            applicantName: data.applicantName,
            employerName: data.employerName,
            companyName: data.companyName,
            employmentStartDate: data.employmentStartDate,
            employmentEndDate: data.employmentEndDate,
            createdAt: data.createdAt?.toDate()?.toISOString() || null,
            expiresAt: data.expiresAt?.toDate()?.toISOString() || null,
        };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[PEV] Error fetching verification:', error);
        throw new HttpsError('internal', 'Failed to load verification request.');
    }
});


// ============================================================
// 3. SUBMIT VERIFICATION RESPONSE (Public endpoint — token-based)
// ============================================================
exports.submitVerificationResponse = onCall({ cors: true, memory: '1GiB', timeoutSeconds: 120 }, async (request) => {
    const { token, response: formResponse } = request.data || {};

    if (!token || !formResponse) {
        throw new HttpsError('invalid-argument', 'Missing token or response data.');
    }

    // Rate limit: 5 submissions per 10 min per token
    const isAllowed = await checkRateLimit(`pev_submit_${token}`, 5, 600, 'closed');
    if (!isAllowed) throw new HttpsError('resource-exhausted', 'Too many submission attempts. Please wait.');

    try {
        const docRef = db.collection('verification_requests').doc(token);
        // PEV-INT-1 FIX: Use a Firestore transaction to atomically check + claim the submission.
        // A non-atomic read-then-write allows two concurrent submissions to both pass the
        // 'completed' check, with the second overwriting a legitimate response.
        let verificationData = null;
        try {
            await db.runTransaction(async (txn) => {
                const snap = await txn.get(docRef);
                if (!snap.exists) throw new HttpsError('not-found', 'Verification request not found.');
                const data = snap.data();

                if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
                    throw new HttpsError('deadline-exceeded', 'This verification request has expired.');
                }
                if (data.status === 'completed') {
                    throw new HttpsError('already-exists', 'This verification has already been completed.');
                }

                // Claim the slot atomically — prevents double-submission race
                txn.update(docRef, { status: 'processing', claimedAt: admin.firestore.FieldValue.serverTimestamp() });
                verificationData = data;
            });
        } catch (txnErr) {
            if (txnErr instanceof HttpsError) throw txnErr;
            throw new HttpsError('internal', 'Failed to process verification request.');
        }

        if (!verificationData) throw new HttpsError('internal', 'Verification data unavailable.');

        // Validate required respondent fields (after transaction so we don't hold a lock during validation)
        if (!formResponse.respondentName || !formResponse.respondentTitle || !formResponse.respondentPhone) {
            throw new HttpsError('invalid-argument', 'Respondent name, title, and phone are required.');
        }

        // PEV-VAL-1 FIX: Server-side length limits to prevent oversized PDF / memory exhaustion
        if (formResponse.violationDetails && formResponse.violationDetails.length > 2000) {
            throw new HttpsError('invalid-argument', 'Violation details cannot exceed 2000 characters.');
        }
        if (formResponse.accidentDetails && formResponse.accidentDetails.length > 2000) {
            throw new HttpsError('invalid-argument', 'Accident details cannot exceed 2000 characters.');
        }
        if (formResponse.additionalComments && formResponse.additionalComments.length > 2000) {
            throw new HttpsError('invalid-argument', 'Additional comments cannot exceed 2000 characters.');
        }

        const now = admin.firestore.Timestamp.now();

        // Build response document
        const responseData = {
            verificationToken: token,
            submittedAt: now,

            // Section 1: Employment Confirmation
            wasEmployed: formResponse.wasEmployed ?? null,
            confirmedStartDate: formResponse.confirmedStartDate || null,
            confirmedEndDate: formResponse.confirmedEndDate || null,
            positionHeld: formResponse.positionHeld || null,
            reasonForLeaving: formResponse.reasonForLeaving || null,
            eligibleForRehire: formResponse.eligibleForRehire ?? null,

            // Section 2: Safety & Compliance (FMCSA Required)
            subjectToFmcsrs: formResponse.subjectToFmcsrs ?? null,
            subjectToDotTesting: formResponse.subjectToDotTesting ?? null,
            hadDrugAlcoholViolations: formResponse.hadDrugAlcoholViolations ?? null,
            violationDetails: formResponse.violationDetails || null,
            completedReturnToDuty: formResponse.completedReturnToDuty || null,
            hadAccidents: formResponse.hadAccidents ?? null,
            accidentDetails: formResponse.accidentDetails || null,

            // Section 3: Additional Info
            additionalComments: formResponse.additionalComments || null,

            // Section 4: Respondent Verification
            respondentName: formResponse.respondentName,
            respondentTitle: formResponse.respondentTitle,
            respondentPhone: formResponse.respondentPhone,
            respondentEmail: formResponse.respondentEmail || null,

            // Audit trail
            ipAddress: request.rawRequest?.ip || 'unknown',
            userAgent: request.rawRequest?.headers?.['user-agent'] || 'unknown',
        };

        // Handle signature data (base64 image → Cloud Storage)
        let signaturePath = null;
        if (formResponse.signatureData && formResponse.signatureData.startsWith('data:image')) {
            const base64Data = formResponse.signatureData.split(';base64,').pop();
            const buffer = Buffer.from(base64Data, 'base64');
            signaturePath = `companies/${verificationData.companyId}/pev_signatures/${token}.png`;

            const bucket = storage.bucket();
            await bucket.file(signaturePath).save(buffer, {
                metadata: { contentType: 'image/png' },
            });
            responseData.signaturePath = signaturePath;
        }

        // Store the response in a subcollection
        await docRef.collection('responses').doc('submission').set(responseData);

        // Update verification request status
        await docRef.update({
            status: 'completed',
            completedAt: now,
        });

        // Generate PDF for DQ file
        let pdfPath = null;
        try {
            // PEV-BRK-3: generateVerificationPDF now returns the permanent pdfPath, not a signed URL
            pdfPath = await generateVerificationPDF(verificationData, responseData, token);
        } catch (pdfError) {
            logger.error('[PEV] PDF generation failed (non-blocking):', pdfError);
        }

        // Update the employer's verification status in the application document
        try {
            const appRef = db.collection('companies')
                .doc(verificationData.companyId)
                .collection(verificationData.collectionName || 'applications')
                .doc(verificationData.applicationId);

            const appSnap = await appRef.get();
            if (appSnap.exists) {
                const appData = appSnap.data();
                const employers = [...(appData.employers || [])];
                const idx = verificationData.employerIndex;

                if (employers[idx]) {
                    if (!employers[idx].verification) {
                        employers[idx].verification = { history: [] };
                    }
                    employers[idx].verification.status = 'Completed';
                    employers[idx].verification.completedAt = new Date().toISOString();
                    employers[idx].verification.resultUrl = pdfPath || null;
                    // PEV-SEC-3 FIX: Do NOT store the raw verification token in the application document.
                    // The application doc is readable by all company team members; storing the token
                    // here would allow any team member to reuse it to re-submit or tamper with the
                    // verification response. Reference the verification by the respondent name only.
                    employers[idx].verification.respondentName = formResponse.respondentName;
                    employers[idx].verification.history = employers[idx].verification.history || [];
                    employers[idx].verification.history.push({
                        action: 'Completed via Portal',
                        respondent: formResponse.respondentName,
                        timestamp: new Date().toISOString(),
                        url: pdfPath || null,
                    });

                    await appRef.update({ employers });
                }
            }
        } catch (updateError) {
            logger.error('[PEV] Failed to update application (non-blocking):', updateError);
        }

        // Notify the requesting company
        try {
            await notifyCarrierVerificationComplete(verificationData, formResponse);
        } catch (notifyError) {
            logger.error('[PEV] Failed to notify carrier (non-blocking):', notifyError);
        }

        logger.info(`[PEV] Verification completed. Token: ${token}, Respondent: ${formResponse.respondentName}`);

        return {
            success: true,
            message: 'Verification response submitted successfully. Thank you for your cooperation.',
        };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error('[PEV] Error submitting response:', error);
        throw new HttpsError('internal', 'Failed to submit verification response.');
    }
});


// ============================================================
// 4. TRACKING PIXEL (HTTP endpoint for email open tracking)
// ============================================================
exports.trackVerificationOpen = onRequest({ cors: true }, async (req, res) => {
    // PEV-BRK-1 FIX: Extract token from query parameter `?t=TOKEN`, not from the URL path.
    // `req.path.split('/').pop()` returns "track-open", not the token.
    const token = req.query.t;

    if (token && token.length > 10) {
        try {
            const docRef = db.collection('verification_requests').doc(token);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                const data = docSnap.data();
                if (['sent', 'pending'].includes(data.status)) {
                    await docRef.update({
                        status: 'opened',
                        openedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }
        } catch (e) {
            // Silent fail — tracking is non-critical
            logger.warn('[PEV] Tracking pixel error:', e.message);
        }
    }

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(pixel);
});


// ============================================================
// 5. AUTOMATED REMINDERS (Scheduled — runs every 24 hours)
// ============================================================
exports.processVerificationReminders = onSchedule("every 24 hours", async () => {
    logger.info('[PEV Reminders] Starting reminder processing...');

    try {
        // Query all non-completed verification requests
        const snapshot = await db.collection('verification_requests')
            .where('status', 'in', ['sent', 'opened', 'reminder_sent'])
            .get();

        if (snapshot.empty) {
            logger.info('[PEV Reminders] No pending verifications found.');
            return;
        }

        let remindersProcessed = 0;
        let marked30Day = 0;

        for (const doc of snapshot.docs) {
            const v = doc.data();
            const daysSinceSent = Math.floor((Date.now() - v.createdAt.toMillis()) / (1000 * 60 * 60 * 24));
            const token = doc.id;

            // Determine base URL
            let baseUrl = 'https://app.safehaul.io';
            try {
                const companyDoc = await db.collection('companies').doc(v.companyId).get();
                if (companyDoc.exists) {
                    baseUrl = companyDoc.data().appUrl || baseUrl;
                }
            } catch (e) { /* use default */ }

            const deadlineDate = v.expiresAt ? new Date(v.expiresAt.toMillis()).toISOString().split('T')[0] : 'N/A';
            const emailParams = {
                applicantName: v.applicantName,
                employerName: v.employerName,
                companyName: v.companyName,
                employmentDates: `${v.employmentStartDate} to ${v.employmentEndDate}`,
                token,
                baseUrl,
                deadlineDate,
            };

            try {
                if (daysSinceSent >= 30) {
                    // Mark as no_response — document good-faith effort
                    await doc.ref.update({
                        status: 'no_response',
                        markedNoResponseAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // Update application record
                    await updateApplicationVerificationStatus(v, 'No Response (Good Faith Documented)');

                    // Notify carrier
                    await notifyCarrierNoResponse(v);

                    marked30Day++;
                    continue;
                }

                if (daysSinceSent >= 20 && v.reminderCount < 3 && v.employerEmail) {
                    await sendReminderEmail(v.companyId, v.employerEmail, emailParams, 'final_notice', v.applicantName);
                    await doc.ref.update({ reminderCount: 3, lastReminderAt: admin.firestore.FieldValue.serverTimestamp(), status: 'reminder_sent' });
                    remindersProcessed++;
                } else if (daysSinceSent >= 15 && v.reminderCount < 2 && v.employerEmail) {
                    await sendReminderEmail(v.companyId, v.employerEmail, emailParams, 'second_reminder', v.applicantName);
                    await doc.ref.update({ reminderCount: 2, lastReminderAt: admin.firestore.FieldValue.serverTimestamp(), status: 'reminder_sent' });
                    remindersProcessed++;
                } else if (daysSinceSent >= 5 && v.reminderCount < 1 && v.employerEmail) {
                    await sendReminderEmail(v.companyId, v.employerEmail, emailParams, 'first_reminder', v.applicantName);
                    await doc.ref.update({ reminderCount: 1, lastReminderAt: admin.firestore.FieldValue.serverTimestamp(), status: 'reminder_sent' });
                    remindersProcessed++;
                }
            } catch (reminderError) {
                logger.error(`[PEV Reminders] Error processing token ${token}:`, reminderError.message);
            }
        }

        logger.info(`[PEV Reminders] Complete. Reminders sent: ${remindersProcessed}, Marked no-response: ${marked30Day}`);

    } catch (error) {
        logger.error('[PEV Reminders] Fatal error:', error);
    }
});


// ============================================================
// HELPER: Update application verification status
// ============================================================
async function updateApplicationVerificationStatus(verificationData, statusText) {
    try {
        const appRef = db.collection('companies')
            .doc(verificationData.companyId)
            .collection(verificationData.collectionName || 'applications')
            .doc(verificationData.applicationId);

        const appSnap = await appRef.get();
        if (!appSnap.exists) return;

        const appData = appSnap.data();
        const employers = [...(appData.employers || [])];
        const idx = verificationData.employerIndex;

        if (employers[idx]) {
            if (!employers[idx].verification) {
                employers[idx].verification = { history: [] };
            }
            employers[idx].verification.status = statusText;
            employers[idx].verification.history = employers[idx].verification.history || [];
            employers[idx].verification.history.push({
                action: statusText,
                timestamp: new Date().toISOString(),
            });

            await appRef.update({ employers });
        }
    } catch (e) {
        logger.error('[PEV] Failed to update app verification status:', e.message);
    }
}
