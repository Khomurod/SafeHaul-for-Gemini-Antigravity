// functions/shared/publicProfileSync.js
//
// Keeps `public_profiles/{companyId}` converged on the current projection.
//
// WHY THIS EXISTS
// ---------------
// `syncPublicProfile` is an onWrite trigger: it refreshes a company's public
// profile when that company document is written, and never otherwise. So when
// the projection itself changes — new allowlisted keys, a different default —
// every profile written before the change stays as it was. A company that
// configured `addressHistory`, `employmentHistory`, `mvrConsent` or
// `referralSource` before the allowlist was widened would carry an old profile,
// and its public apply page would keep ignoring those settings, until somebody
// happened to edit the company again. Nothing in the deploy path fixed that: the
// only repair was a super-admin callable that no deployment ran.
//
// This module is the reconciler. It walks the companies collection — the source
// of truth — compares each company's profile `dtoVersion` against the current
// one, and rewrites only what is stale. A scheduled function calls it, so the
// fleet converges without anyone remembering to press a button.
//
// PROPERTIES
//   * Idempotent. Once converged, a pass reads and writes nothing.
//   * Repeatable. Interrupted halfway, the next pass resumes from the start and
//     skips everything already current.
//   * Bounded. `maxCompanies` caps a single pass; whatever is left is picked up
//     next time.
//   * Complete. It iterates COMPANIES, not profiles. A query for profiles whose
//     `dtoVersion` differs would silently miss every legacy profile, because
//     Firestore never returns documents that lack the queried field — which is
//     exactly the population that needs repair.

const { PUBLIC_PROFILE_DTO_VERSION, buildPublicProfileDto } = require('./publicProfileDto');

/** Companies read per page. Firestore's `getAll` and batch limits are both 500. */
const DEFAULT_PAGE_SIZE = 200;

/** Ceiling for one pass, so a scheduled run cannot exceed its timeout. */
const DEFAULT_MAX_COMPANIES = 5000;

/**
 * Reconcile every company's public profile with the current projection.
 *
 * @param {object} opts
 * @param {object} opts.db              Firestore (Admin SDK).
 * @param {*} opts.serverTimestamp      `FieldValue.serverTimestamp()`.
 * @param {*} [opts.deleteSentinel]     `FieldValue.delete()` — see buildPublicProfileDto.
 * @param {boolean} [opts.force]        Rewrite even profiles already current.
 * @param {number} [opts.pageSize]
 * @param {number} [opts.maxCompanies]
 * @param {string} [opts.logLabel]
 * @returns {Promise<{scanned:number, synced:number, upToDate:number, truncated:boolean}>}
 */
async function reconcilePublicProfiles({
    db,
    serverTimestamp,
    deleteSentinel,
    force = false,
    pageSize = DEFAULT_PAGE_SIZE,
    maxCompanies = DEFAULT_MAX_COMPANIES,
    logLabel = 'reconcilePublicProfiles',
} = {}) {
    if (!db) throw new Error('reconcilePublicProfiles requires a Firestore instance');

    const companies = db.collection('companies');
    const profiles = db.collection('public_profiles');

    let scanned = 0;
    let synced = 0;
    let upToDate = 0;
    let cursor = null;
    let truncated = false;

    for (;;) {
        if (scanned >= maxCompanies) {
            truncated = true;
            break;
        }

        // Default collection ordering is by document id, so `startAfter(doc)`
        // paginates deterministically without needing a composite index.
        const remaining = Math.min(pageSize, maxCompanies - scanned);
        let query = companies.limit(remaining);
        if (cursor) query = companies.startAfter(cursor).limit(remaining);

        const page = await query.get();
        if (page.empty) break;

        // One read for the whole page's existing profiles, rather than one per
        // company. `getAll` returns missing documents as non-existent snapshots.
        const existing = await db.getAll(...page.docs.map((doc) => profiles.doc(doc.id)));
        const currentVersionById = new Map(
            existing.map((snap) => [snap.id, snap.exists ? snap.data()?.dtoVersion : undefined]),
        );

        const batch = db.batch();
        let pending = 0;

        for (const doc of page.docs) {
            scanned += 1;
            if (!force && currentVersionById.get(doc.id) === PUBLIC_PROFILE_DTO_VERSION) {
                upToDate += 1;
                continue;
            }
            batch.set(
                profiles.doc(doc.id),
                buildPublicProfileDto(doc.data(), serverTimestamp, { deleteSentinel }),
                { merge: true },
            );
            pending += 1;
            synced += 1;
        }

        if (pending > 0) await batch.commit();

        cursor = page.docs[page.docs.length - 1];
        if (page.size < remaining) break;
    }

    if (synced > 0 || truncated) {
        console.log(
            `[${logLabel}] Scanned ${scanned} companies: ${synced} public profiles resynced, `
            + `${upToDate} already at projection v${PUBLIC_PROFILE_DTO_VERSION}`
            + (truncated ? ` (stopped at the ${maxCompanies}-company ceiling; the next pass continues)` : ''),
        );
    }

    return { scanned, synced, upToDate, truncated };
}

module.exports = {
    DEFAULT_MAX_COMPANIES,
    DEFAULT_PAGE_SIZE,
    reconcilePublicProfiles,
};
