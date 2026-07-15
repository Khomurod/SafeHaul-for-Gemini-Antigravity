import { doc } from "firebase/firestore";
import { db, storage } from '@lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as Sentry from '@sentry/react';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';
import { mergeApplicationDoc } from '@lib/applicationWrite';

// Queue and ID generation for bulletproof submissions
import {
    initQueue,
    enqueueSubmission,
    dequeueSubmission,
    isSupported as isQueueSupported
} from '@lib/submissionQueue';
import {
    generateApplicationId,
    generateConfirmationNumber
} from '@lib/applicationId';
import { buildApplicationSearchFields } from '@shared/utils/searchNormalization';

/**
 * Authenticated driver application upload + submit.
 * Extracted verbatim from driverService.js — createdAt/create-safe-merge,
 * queue-first offline delivery, and Firestore paths are unchanged.
 */

// --- Application Logic ---
export async function uploadApplicationFile(companyId, userId, fieldName, file) {
    if (!file) return null;

    if (isE2ETestMode) {
        return {
            name: file.name,
            url: `https://e2e.local/${fieldName}/${file.name}`,
            storagePath: `companies/${companyId}/applications/${userId}/${fieldName}/e2e_${file.name}`,
            uploadedAt: new Date().toISOString(),
        };
    }

    // 1. Size Check (20MB)
    if (file.size > 20 * 1024 * 1024) {
        throw new Error("File exceeds 20MB limit.");
    }

    // SEC-6: MIME type allowlist — only accept PDFs and common image formats.
    const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        throw new Error("Invalid file type. Only PDF, JPEG, PNG, and WEBP files are allowed.");
    }

    if (!companyId) throw new Error("Company ID is required.");
    const basePath = `companies/${companyId}/applications/${userId}`;

    // Fix: Sanitize filename to prevent path issues + Truncate
    let cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    if (cleanName.length > 64) {
        const parts = cleanName.split('.');
        const ext = parts.pop();
        const base = parts.join('.').substring(0, 64 - ext.length - 1);
        cleanName = `${base}.${ext}`;
    }

    const storagePath = `${basePath}/${fieldName}/${Date.now()}_${cleanName}`;
    const fileRef = ref(storage, storagePath);

    // RETRY LOGIC (3 attempts)
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(fileRef);

            return {
                name: file.name,
                url: downloadURL,
                storagePath: storagePath,
                uploadedAt: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Upload attempt ${attempt} failed:`, error);
            lastError = error;
            // Wait 1s before retry
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
        }
    }

    throw new Error(`Upload failed after 3 attempts: ${lastError?.message}`);
}

// Helper to remove undefined values (Firestore rejects them)
function sanitizeData(data) {
    if (data === undefined) return null;
    if (data === null) return null;
    if (data instanceof Date) return data;
    if (Array.isArray(data)) return data.map(sanitizeData);
    if (typeof data === 'object') {
        const sanitized = {};
        for (const key in data) {
            sanitized[key] = sanitizeData(data[key]);
        }
        return sanitized;
    }
    return data;
}

/**
 * Submit a driver application with guaranteed delivery
 *
 * Uses a queue-first pattern:
 * 1. Generate deterministic application ID
 * 2. Queue the submission locally (IndexedDB)
 * 3. Attempt to submit to Firestore with retries
 * 4. Only dequeue on confirmed success
 * 5. If all retries fail, data remains in queue for later retry
 *
 * @param {Object} currentUser - Firebase auth user
 * @param {Object} formData - Complete form data
 * @param {string} activeCompanyId - Target company ID
 * @param {Object} job - Optional job posting info
 * @returns {Promise<{success: boolean, applicationId: string, confirmationNumber: string, queueId?: string, queued?: boolean, error?: string}>}
 */
export async function submitDriverApplication(currentUser, formData, activeCompanyId, job) {
    const email = formData.email || currentUser?.email || '';
    const phone = formData.phone || '';
    if (!activeCompanyId) throw new Error('Company ID is required. Global lead pool is discontinued.');

    if (isE2ETestMode) {
        const applicationId = await generateApplicationId(activeCompanyId, email, phone).catch(
            () => currentUser.uid,
        );
        const confirmationNumber = generateConfirmationNumber();
        if (getE2EQueryParam('e2eForceQueue', '') === '1') {
            return {
                success: false,
                queued: true,
                applicationId,
                confirmationNumber,
                queueId: 'e2e-queue-1',
                error: 'Submission failed but your application is saved. It will be automatically submitted when connection is restored.',
            };
        }
        return { success: true, applicationId, confirmationNumber };
    }
    const companyId = activeCompanyId;

    // Sentry breadcrumb for debugging
    Sentry.addBreadcrumb({
        category: 'submission',
        message: 'Application submission started',
        data: { companyId, hasEmail: !!email, hasPhone: !!phone },
        level: 'info',
    });

    // 1. Generate deterministic application ID (prevents duplicates on retry)
    let applicationId;
    try {
        applicationId = await generateApplicationId(companyId, email, phone);
    } catch (idError) {
        // Fallback to user UID if ID generation fails
        console.warn('[submitDriverApplication] ID generation failed, using UID:', idError);
        applicationId = currentUser.uid;
    }

    // 2. Generate confirmation number for user
    const confirmationNumber = generateConfirmationNumber();
    const applicantKey = typeof applicationId === 'string' ? applicationId.split('_')[0] : applicationId;

    // 3. Prepare the final payload
    const finalData = sanitizeData({
        ...formData,
        signature: formData.signature,
        signatureType: formData.signatureType || 'drawn',
        userId: currentUser.uid,
        driverId: currentUser.uid,
        applicantId: applicationId, // REQUIRED: Must match doc ID for Firestore rules deterministic ID check
        applicantKey,
        email: email,
        phone: phone,
        status: 'New Application',
        sourceType: 'Company App',
        companyId: companyId,
        companyName: job?.companyName || formData.companyName || null,
        // Job specific data
        jobId: job?.id || null,
        jobTitle: job?.title || null,
        // Normalize array fields (AF6 fix — ensure consistent data structures)
        employers: Array.isArray(formData.employers) ? formData.employers : [],
        violations: Array.isArray(formData.violations) ? formData.violations : [],
        accidents: Array.isArray(formData.accidents) ? formData.accidents : [],
        schools: Array.isArray(formData.schools) ? formData.schools : [],
        military: Array.isArray(formData.military) ? formData.military : [],
        previousAddresses: Array.isArray(formData.previousAddresses) ? formData.previousAddresses : [],
        // New: Bulletproof tracking fields
        applicationId: applicationId,
        confirmationNumber: confirmationNumber,
        lifecycle: {
            status: 'pending',
            submittedAt: new Date().toISOString(),
            clientVersion: '2.0-bulletproof',
        },
        // Persisted normalized search fields (single source: shared/utils/searchNormalization).
        ...buildApplicationSearchFields({
            firstName: formData.firstName,
            lastName: formData.lastName,
            email,
            phone,
            confirmationNumber,
            applicationId,
        }),
    });

    // P0-5 FIX: Use ISO string for queue (IndexedDB can't serialize FieldValue sentinels).
    // serverTimestamp() will be applied right before Firestore write.
    const nowISO = new Date().toISOString();
    finalData.submittedAt = nowISO;
    finalData.createdAt = nowISO;

    // 4. Queue first (if supported) for guaranteed delivery
    let queueId = null;
    if (isQueueSupported()) {
        try {
            await initQueue();
            queueId = await enqueueSubmission(finalData, companyId, {
                type: 'authenticated',
                userId: currentUser.uid,
            });
            console.log(`[submitDriverApplication] Queued submission ${queueId}`);
            Sentry.addBreadcrumb({
                category: 'submission',
                message: 'Submission queued',
                data: { queueId, applicationId },
                level: 'info',
            });
        } catch (queueError) {
            // Queue failure is not fatal - continue with direct submission
            console.warn('[submitDriverApplication] Queue failed, proceeding directly:', queueError);
            Sentry.captureMessage('Submission queue unavailable', 'warning');
        }
    }

    // 5. Attempt submission with retry logic (3 attempts)
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            // Determine document reference
            let docRef;
            docRef = doc(db, "companies", activeCompanyId, "applications", applicationId);

            // FUNC-005 FIX: create-safe merge. On first create the full payload is
            // written (createdAt stamped). On any retry/edit/re-submit the create-only
            // fields (createdAt/status/confirmationNumber) are dropped so the driver
            // self-update rules don't reject the write and recruiter status/notes are
            // preserved. submittedAt/updatedAt are always stamped server-side.
            // BUG-3: merge:true keeps everything the company team added after intake.
            await mergeApplicationDoc(docRef, finalData);

            // Success! Dequeue if we queued earlier
            if (queueId) {
                try {
                    await dequeueSubmission(queueId);
                    console.log(`[submitDriverApplication] Dequeued ${queueId} after success`);
                } catch (dequeueError) {
                    // Non-fatal - queue entry will be cleaned up on next process
                    console.warn('[submitDriverApplication] Dequeue failed:', dequeueError);
                }
            }

            Sentry.addBreadcrumb({
                category: 'submission',
                message: 'Application submitted successfully',
                data: { applicationId, confirmationNumber, attempts: attempt },
                level: 'info',
            });

            return {
                success: true,
                applicationId,
                confirmationNumber,
                queueId,
            };

        } catch (error) {
            console.warn(`[submitDriverApplication] Attempt ${attempt} failed:`, error);
            lastError = error;

            Sentry.addBreadcrumb({
                category: 'submission',
                message: `Attempt ${attempt} failed`,
                data: { error: error.message },
                level: 'warning',
            });

            if (attempt < 3) {
                // Exponential backoff: 1s, 2s, 4s
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            }
        }
    }

    // All attempts failed
    Sentry.captureException(lastError, {
        tags: { flow: 'driver_application', stage: 'submission_failed' },
        extra: { applicationId, companyId, queueId, attempts: 3 },
    });

    // If we have a queue ID, the data is safe - return partial success
    if (queueId) {
        console.log(`[submitDriverApplication] All attempts failed, but data is queued: ${queueId}`);
        return {
            success: false,
            queued: true,
            applicationId,
            confirmationNumber,
            queueId,
            error: 'Submission failed but your application is saved. It will be automatically submitted when connection is restored.',
        };
    }

    throw new Error(`Submission failed after 3 attempts: ${lastError?.message}`);
}
