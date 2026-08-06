// Guards the automatic migration half of the public-profile projection.
//
// The defect this exists for: widening the projection's allowlist does not touch
// profiles written before the change, because `syncPublicProfile` only fires on a
// subsequent company write. Companies that had already configured
// `addressHistory` / `employmentHistory` / `mvrConsent` / `referralSource` kept a
// profile that omitted them, so their public apply pages kept ignoring settings
// the company had explicitly saved.

const {
    PUBLIC_PROFILE_DTO_VERSION,
    buildPublicProfileDto,
} = require('../../shared/publicProfileDto');
const { reconcilePublicProfiles } = require('../../shared/publicProfileSync');

const TIMESTAMP = '__server_timestamp__';
const DELETE = { __delete: true };

/**
 * A Firestore double covering exactly what the reconciler uses: default
 * document-id ordering, `startAfter`, `limit`, `getAll` and batched `set` with
 * merge. Deliberately narrow — an unimplemented call throws rather than passing
 * against a fiction.
 */
function createDb(seed = {}) {
    const docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
    const reads = { getAll: 0, pages: 0 };
    const writes = [];

    const mergeInto = (target, value) => {
        const next = { ...target };
        for (const [key, inner] of Object.entries(value)) {
            if (inner === DELETE) {
                delete next[key];
            } else if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
                next[key] = mergeInto(next[key] && typeof next[key] === 'object' ? next[key] : {}, inner);
            } else {
                next[key] = inner;
            }
        }
        return next;
    };

    const snapshotFor = (path) => ({
        id: path.split('/').pop(),
        exists: docs.has(path),
        data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
    });

    const docRef = (path) => ({ path, id: path.split('/').pop() });

    const childrenOf = (prefix) => [...docs.keys()]
        .filter((p) => p.startsWith(`${prefix}/`) && p.slice(prefix.length + 1).split('/').length === 1)
        // Document-id order, which is Firestore's default for a bare collection query.
        .sort();

    function makeQuery(collectionPath, { after = null, max = Infinity } = {}) {
        return {
            limit: (count) => makeQuery(collectionPath, { after, max: count }),
            startAfter: (cursorDoc) => makeQuery(collectionPath, { after: cursorDoc.id, max }),
            get: async () => {
                reads.pages += 1;
                let ids = childrenOf(collectionPath);
                if (after) ids = ids.filter((p) => p.split('/').pop() > after);
                const selected = ids.slice(0, max).map(snapshotFor);
                return { empty: selected.length === 0, size: selected.length, docs: selected };
            },
        };
    }

    return {
        __docs: docs,
        __reads: reads,
        __writes: writes,
        collection: (name) => ({
            doc: (id) => docRef(`${name}/${id}`),
            ...makeQuery(name),
        }),
        getAll: async (...refs) => {
            reads.getAll += 1;
            return refs.map((ref) => snapshotFor(ref.path));
        },
        batch: () => {
            const staged = [];
            return {
                set: (ref, data, options) => staged.push({ ref, data, options }),
                commit: async () => {
                    for (const { ref, data, options } of staged) {
                        const base = options && options.merge ? (docs.get(ref.path) || {}) : {};
                        docs.set(ref.path, mergeInto(base, data));
                        writes.push(ref.path);
                    }
                },
            };
        },
    };
}

const run = (db, overrides = {}) => reconcilePublicProfiles({
    db,
    serverTimestamp: TIMESTAMP,
    deleteSentinel: DELETE,
    ...overrides,
});

describe('public profile reconciler', () => {
    it('rewrites a profile that predates the widened allowlist', async () => {
        const db = createDb({
            'companies/acme': {
                companyName: 'Acme',
                applicationConfig: {
                    addressHistory: { hidden: true, required: false },
                    employmentHistory: { hidden: false, required: true },
                },
            },
            // Written before the allowlist carried those two keys.
            'public_profiles/acme': {
                companyName: 'Acme',
                applicationConfig: { cdlUpload: { required: true } },
            },
        });

        const result = await run(db);

        expect(result).toMatchObject({ scanned: 1, synced: 1, upToDate: 0, truncated: false });
        const profile = db.__docs.get('public_profiles/acme');
        expect(profile.applicationConfig.addressHistory).toEqual({ hidden: true, required: false });
        expect(profile.applicationConfig.employmentHistory).toEqual({ hidden: false, required: true });
        expect(profile.dtoVersion).toBe(PUBLIC_PROFILE_DTO_VERSION);
    });

    it('creates a profile for a company that has none', async () => {
        const db = createDb({ 'companies/newco': { companyName: 'New Co' } });

        const result = await run(db);

        expect(result.synced).toBe(1);
        expect(db.__docs.get('public_profiles/newco').companyName).toBe('New Co');
    });

    it('leaves an already-current profile completely alone', async () => {
        const company = { companyName: 'Acme', applicationConfig: { ssn: { required: true } } };
        const db = createDb({
            'companies/acme': company,
            'public_profiles/acme': buildPublicProfileDto(company, TIMESTAMP),
        });

        const result = await run(db);

        expect(result).toMatchObject({ scanned: 1, synced: 0, upToDate: 1 });
        expect(db.__writes).toEqual([]);
    });

    it('is idempotent: a second pass writes nothing', async () => {
        const db = createDb({
            'companies/acme': { companyName: 'Acme' },
            'companies/beta': { companyName: 'Beta' },
        });

        await run(db);
        const writesAfterFirst = db.__writes.length;
        const second = await run(db);

        expect(writesAfterFirst).toBe(2);
        expect(second).toMatchObject({ synced: 0, upToDate: 2 });
        expect(db.__writes).toHaveLength(writesAfterFirst);
    });

    it('removes an allowlisted gate the company has un-set, which a bare merge would strand', async () => {
        const db = createDb({
            // The company no longer configures emergencyContacts at all.
            'companies/acme': { companyName: 'Acme', applicationConfig: { ssn: { required: true } } },
            'public_profiles/acme': {
                companyName: 'Acme',
                applicationConfig: {
                    ssn: { required: true },
                    emergencyContacts: { hidden: false, required: true },
                },
            },
        });

        await run(db);

        const config = db.__docs.get('public_profiles/acme').applicationConfig;
        expect(config.emergencyContacts).toBeUndefined();
        expect(config.ssn).toEqual({ required: true });
    });

    it('paginates across more companies than one page holds', async () => {
        const seed = {};
        for (let i = 0; i < 7; i += 1) {
            seed[`companies/c${i}`] = { companyName: `Company ${i}` };
        }
        const db = createDb(seed);

        const result = await run(db, { pageSize: 3 });

        expect(result).toMatchObject({ scanned: 7, synced: 7, truncated: false });
        for (let i = 0; i < 7; i += 1) {
            expect(db.__docs.get(`public_profiles/c${i}`).companyName).toBe(`Company ${i}`);
        }
    });

    it('stops at the ceiling and reports it, so the next pass continues', async () => {
        const seed = {};
        for (let i = 0; i < 5; i += 1) seed[`companies/c${i}`] = { companyName: `Company ${i}` };
        const db = createDb(seed);

        const result = await run(db, { pageSize: 2, maxCompanies: 3 });

        expect(result).toMatchObject({ scanned: 3, synced: 3, truncated: true });
    });

    it('force rewrites profiles that are already current', async () => {
        const company = { companyName: 'Acme' };
        const db = createDb({
            'companies/acme': company,
            'public_profiles/acme': buildPublicProfileDto(company, TIMESTAMP),
        });

        const result = await run(db, { force: true });

        expect(result).toMatchObject({ synced: 1, upToDate: 0 });
        expect(db.__writes).toEqual(['public_profiles/acme']);
    });

    it('never copies anything outside the projection onto the public surface', async () => {
        const db = createDb({
            'companies/acme': {
                companyName: 'Acme',
                ownerSsn: '123-45-6789',
                internalNotes: 'do not share',
                applicationConfig: { ssn: { required: true }, internalOnly: { hidden: true } },
            },
        });

        await run(db);

        const profile = db.__docs.get('public_profiles/acme');
        expect(JSON.stringify(profile)).not.toMatch(/123-45-6789|do not share/);
        expect(profile.applicationConfig.internalOnly).toBeUndefined();
    });

    it('requires a Firestore instance rather than silently doing nothing', async () => {
        await expect(reconcilePublicProfiles({})).rejects.toThrow(/requires a Firestore instance/);
    });
});
