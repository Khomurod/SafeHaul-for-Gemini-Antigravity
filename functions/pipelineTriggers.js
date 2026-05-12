// functions/pipelineTriggers.js
// Firestore onWrite trigger for the hiring pipeline tracker.
// Handles: CST timestamp formatting, audit trail, statusChangedAt stamping,
// AND syncing hiringStage back into the linked applications/leads document so
// the Company Admin candidates list and Hired counter stay in lockstep.

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { db } = require("./firebaseAdmin");

// --- Helper: Format current time to CST display string ---
// Returns: "Mon, 10:45 AM"
function formatCSTDisplay(date) {
    const options = {
        timeZone: 'America/Chicago',
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    };
    return new Intl.DateTimeFormat('en-US', options).format(date);
}

// --- Helper: Format current date to CST date string ---
// Returns: "02/17/2026"
function formatCSTDate(date) {
    const options = {
        timeZone: 'America/Chicago',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
    };
    return new Intl.DateTimeFormat('en-US', options).format(date);
}

// --- SERVER-MANAGED FIELDS (used for loop prevention) ---
// H2 FIX: Added 'comments' and 'lastCheckedDisplay' — the trigger writes to these fields,
// so they must be in the skip-set to prevent unnecessary re-invocations.
const SERVER_MANAGED_FIELDS = new Set([
    'lastCheckedDisplay',
    'lastModifiedAt',
    'statusChangedAt',
    'comments', // H2 FIX: Audit trail comments are server-written
]);

// Map pipeline hiringStage -> ATS status used on applications/leads docs.
// Anything outside this map is left untouched on the source record.
const STAGE_TO_STATUS = {
    in_process: 'In Process',
    on_hold: 'Hold',
    hired: 'Hired',
    rejected: 'Rejected',
};

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

/**
 * Resolve which application or lead document a pipeline entry refers to.
 *
 * Resolution order:
 *  1. Explicit `linkedAppId` + `linkedAppCollection` fields written by the
 *     "Add to Pipeline" button on the candidates list / dossier.
 *  2. Best-effort phone-number match against `applications` first, then
 *     `leads` (backwards-compat for entries created via the bare
 *     "Add Driver" button on the pipeline sheet).
 */
async function findSourceDoc(companyId, entry) {
    // P2 HARDENING: Always prefer the explicit link. The dossier "Add to
    // Pipeline" button writes `linkedAppId` + `linkedAppCollection`, which is
    // unambiguous. We ONLY fall back to phone lookup for legacy/manual rows.
    if (entry.linkedAppId && entry.linkedAppCollection) {
        const ref = db
            .collection('companies').doc(companyId)
            .collection(entry.linkedAppCollection).doc(entry.linkedAppId);
        const snap = await ref.get();
        if (snap.exists) return ref;
        // Explicit link but doc is gone — do NOT silently fall back to phone
        // matching, that could mirror a status onto the wrong driver.
        console.warn(
            `[Pipeline] linkedAppId ${entry.linkedAppId} (${entry.linkedAppCollection}) is missing. Refusing to mirror status to a guessed doc.`
        );
        return null;
    }

    const normalized = normalizePhone(entry.phoneNumber);
    if (!normalized) return null;

    // P2 HARDENING: Resolve via phone, but require an UNAMBIGUOUS match.
    // We pull limit(2) — if a second doc shares the phone, we abort the
    // mirror rather than risk overwriting the wrong driver's status. The
    // recruiter can promote the row to a linked entry via the dossier button.
    for (const col of ['applications', 'leads']) {
        const snap = await db
            .collection('companies').doc(companyId)
            .collection(col)
            .where('phoneNormalized', '==', normalized)
            .limit(2)
            .get();
        if (snap.size === 1) return snap.docs[0].ref;
        if (snap.size > 1) {
            console.warn(
                `[Pipeline] Ambiguous phone match (${snap.size}+ ${col} share ${normalized}). Skipping mirror.`
            );
            return null;
        }

        // Fallback: some legacy records only stored raw `phone`
        const snap2 = await db
            .collection('companies').doc(companyId)
            .collection(col)
            .where('phone', '==', entry.phoneNumber)
            .limit(2)
            .get();
        if (snap2.size === 1) return snap2.docs[0].ref;
        if (snap2.size > 1) {
            console.warn(
                `[Pipeline] Ambiguous legacy phone match (${snap2.size}+ ${col} share ${entry.phoneNumber}). Skipping mirror.`
            );
            return null;
        }
    }
    return null;
}

// --- MAIN TRIGGER ---
exports.onPipelineEntryWrite = onDocumentWritten(
    {
        document: 'companies/{companyId}/pipeline_entries/{entryId}',
        region: 'us-central1',
    },
    async (event) => {
        const { FieldValue } = require("firebase-admin/firestore");
        const companyId = event.params.companyId;

        // Skip deletes — no after data
        if (!event.data?.after?.exists) {
            console.log('[Pipeline] Document deleted, skipping.');
            return null;
        }

        const afterData = event.data.after.data();
        const beforeData = event.data.before?.exists ? event.data.before.data() : null;

        // --- LOOP PREVENTION ---
        // If this is an update (not a create), check if the only changed fields
        // are server-managed fields. If so, this is our own write echoing back.
        if (beforeData) {
            const changedFields = [];
            for (const key of Object.keys(afterData)) {
                if (key === 'lastModifiedAt' || key === 'statusChangedAt') {
                    // Timestamps — compare via toMillis if available
                    const bVal = beforeData[key]?.toMillis?.() || 0;
                    const aVal = afterData[key]?.toMillis?.() || 0;
                    if (bVal !== aVal) changedFields.push(key);
                } else if (beforeData[key] !== afterData[key]) {
                    changedFields.push(key);
                }
            }

            // If the only changes are server-managed fields, skip
            if (changedFields.length > 0 && changedFields.every(f => SERVER_MANAGED_FIELDS.has(f))) {
                console.log('[Pipeline] Only server-managed fields changed, skipping to prevent loop.');
                return null;
            }
        }

        // --- DETECT CHANGES ---
        const hiringStageChanged = !beforeData || beforeData.hiringStage !== afterData.hiringStage;
        const commentsChanged = !beforeData || beforeData.comments !== afterData.comments;

        // If neither hiringStage nor comments changed, nothing to do
        if (!hiringStageChanged && !commentsChanged) {
            console.log('[Pipeline] No relevant field changes detected.');
            return null;
        }

        const now = new Date();
        const updatePayload = {};

        // 1. STATUS TIMESTAMPING — update statusChangedAt when hiringStage changes
        if (hiringStageChanged) {
            updatePayload.statusChangedAt = FieldValue.serverTimestamp();
            console.log(`[Pipeline] hiringStage changed: ${beforeData?.hiringStage || 'NEW'} → ${afterData.hiringStage}`);
        }

        // 2. AUDIT TRAIL — append system comment when hired or rejected
        if (hiringStageChanged && (afterData.hiringStage === 'hired' || afterData.hiringStage === 'rejected')) {
            const dateCST = formatCSTDate(now);
            const auditNote = ` [System]: Driver is ${afterData.hiringStage} on ${dateCST}.`;
            const existingComments = afterData.comments || '';
            updatePayload.comments = existingComments
                ? `${existingComments}\n${auditNote}`
                : auditNote;
            console.log(`[Pipeline] Audit trail appended: ${auditNote}`);
        }

        // 3. CST TIMESTAMP DISPLAY — update lastCheckedDisplay when hiringStage or comments change
        if (hiringStageChanged || commentsChanged) {
            updatePayload.lastCheckedDisplay = formatCSTDisplay(now);
            updatePayload.lastModifiedAt = FieldValue.serverTimestamp();
            console.log(`[Pipeline] lastCheckedDisplay updated: ${updatePayload.lastCheckedDisplay}`);
        }

        // --- WRITE ---
        if (Object.keys(updatePayload).length > 0) {
            try {
                await event.data.after.ref.update(updatePayload);
                console.log(`[Pipeline] Successfully updated entry ${event.params.entryId}`);
            } catch (error) {
                console.error(`[Pipeline] Failed to update entry ${event.params.entryId}:`, error);
            }
        }

        // --- SYNC SOURCE APPLICATION / LEAD STATUS ---
        // When the recruiter moves a row to Hired / Rejected / Hold / In Process,
        // mirror that onto the originating applications/leads doc so the
        // Company Admin candidates list, Hired counter, and ATS stay consistent.
        if (hiringStageChanged) {
            const targetStatus = STAGE_TO_STATUS[afterData.hiringStage];
            if (targetStatus) {
                try {
                    const sourceRef = await findSourceDoc(companyId, afterData);
                    if (sourceRef) {
                        await sourceRef.set(
                            {
                                status: targetStatus,
                                statusEnteredAt: FieldValue.serverTimestamp(),
                                lastSyncedFromPipelineAt: FieldValue.serverTimestamp(),
                                pipelineEntryId: event.params.entryId,
                            },
                            { merge: true }
                        );
                        console.log(
                            `[Pipeline] Mirrored stage ${afterData.hiringStage} -> status "${targetStatus}" on ${sourceRef.path}`
                        );
                    } else {
                        console.log(
                            `[Pipeline] No source doc found for entry ${event.params.entryId} (phone="${afterData.phoneNumber}"). Skipping mirror.`
                        );
                    }
                } catch (err) {
                    console.error(`[Pipeline] Source-doc mirror failed:`, err);
                }
            }
        }

        return null;
    }
);
