import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeApplicationDoc, APPLICATION_CREATE_ONLY_FIELDS } from './applicationWrite';

const { getDocMock, setDocMock, claimCallableMock } = vi.hoisted(() => ({
    getDocMock: vi.fn(),
    setDocMock: vi.fn(),
    claimCallableMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    getDoc: (...a) => getDocMock(...a),
    setDoc: (...a) => setDocMock(...a),
    serverTimestamp: () => '__ServerTS__',
}));

vi.mock('firebase/functions', () => ({
    httpsCallable: (_functions, name) => {
        if (name !== 'claimGuestApplication') throw new Error(`unexpected callable ${name}`);
        return claimCallableMock;
    },
}));

vi.mock('@lib/firebase', () => ({
    functions: {},
}));

function permissionDenied() {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    return err;
}

const REF = { path: 'companies/co1/applications/app1' };
const basePayload = {
    companyId: 'co1',
    applicantId: 'app1',
    driverId: 'driver-1',
    phone: '111',
    status: 'New Application',
    confirmationNumber: 'ABC123',
    createdAt: '2026-01-01T00:00:00.000Z',
    submittedAt: '2026-01-01T00:00:00.000Z',
};

describe('mergeApplicationDoc (FUNC-005)', () => {
    beforeEach(() => {
        getDocMock.mockReset();
        setDocMock.mockReset().mockResolvedValue();
    });

    it('CREATE: writes full payload with server createdAt/submittedAt/updatedAt', async () => {
        getDocMock.mockResolvedValue({ exists: () => false });

        const res = await mergeApplicationDoc(REF, { ...basePayload });

        expect(res).toEqual({ isNew: true });
        const [ref, payload, opts] = setDocMock.mock.calls[0];
        expect(ref).toBe(REF);
        expect(opts).toEqual({ merge: true });
        // Create-only fields kept on first create.
        expect(payload.status).toBe('New Application');
        expect(payload.confirmationNumber).toBe('ABC123');
        expect(payload.createdAt).toBe('__ServerTS__');
        expect(payload.submittedAt).toBe('__ServerTS__');
        expect(payload.updatedAt).toBe('__ServerTS__');
        expect(payload.phone).toBe('111');
    });

    it('UPDATE: drops createdAt/status/confirmationNumber, keeps edited + timestamps', async () => {
        getDocMock.mockResolvedValue({ exists: () => true });

        const res = await mergeApplicationDoc(REF, { ...basePayload, phone: '222' });

        expect(res).toEqual({ isNew: false });
        const [, payload] = setDocMock.mock.calls[0];
        for (const f of APPLICATION_CREATE_ONLY_FIELDS) {
            expect(payload).not.toHaveProperty(f);
        }
        // Edited allow-listed field + server timestamps survive.
        expect(payload.phone).toBe('222');
        expect(payload.submittedAt).toBe('__ServerTS__');
        expect(payload.updatedAt).toBe('__ServerTS__');
        // Identity fields (unchanged values) are still present but harmless.
        expect(payload.companyId).toBe('co1');
    });

    it('lists exactly the create-only fields it protects', () => {
        expect(APPLICATION_CREATE_ONLY_FIELDS).toEqual(['createdAt', 'confirmationNumber', 'status']);
    });

    describe('guest-claim fallback (P1 fix)', () => {
        beforeEach(() => {
            claimCallableMock.mockReset().mockResolvedValue({ data: { success: true, claimed: true } });
        });

        it('falls back to claimGuestApplication when the READ is permission-denied', async () => {
            getDocMock.mockRejectedValue(permissionDenied());

            const res = await mergeApplicationDoc(REF, { ...basePayload });

            expect(res).toEqual({ isNew: false, claimed: true });
            expect(setDocMock).not.toHaveBeenCalled();
            expect(claimCallableMock).toHaveBeenCalledTimes(1);
            const arg = claimCallableMock.mock.calls[0][0];
            expect(arg.companyId).toBe('co1');
            expect(arg.applicationId).toBe('app1');
            // Create-only fields are stripped before sending to the server.
            for (const f of APPLICATION_CREATE_ONLY_FIELDS) {
                expect(arg.formData).not.toHaveProperty(f);
            }
            expect(arg.formData.phone).toBe('111');
        });

        it('falls back to claimGuestApplication when the UPDATE write is permission-denied', async () => {
            getDocMock.mockResolvedValue({ exists: () => true });
            setDocMock.mockRejectedValue(permissionDenied());

            const res = await mergeApplicationDoc(REF, { ...basePayload });

            expect(res).toEqual({ isNew: false, claimed: true });
            expect(claimCallableMock).toHaveBeenCalledTimes(1);
        });

        it('does NOT fall back on a denied CREATE (doc did not exist)', async () => {
            getDocMock.mockResolvedValue({ exists: () => false });
            setDocMock.mockRejectedValue(permissionDenied());

            await expect(mergeApplicationDoc(REF, { ...basePayload })).rejects.toThrow(/permission/i);
            expect(claimCallableMock).not.toHaveBeenCalled();
        });

        it('rethrows non-permission read errors without calling the fallback', async () => {
            const netErr = new Error('unavailable');
            netErr.code = 'unavailable';
            getDocMock.mockRejectedValue(netErr);

            await expect(mergeApplicationDoc(REF, { ...basePayload })).rejects.toThrow('unavailable');
            expect(claimCallableMock).not.toHaveBeenCalled();
        });

        it('propagates callable failure so retries/queueing still engage', async () => {
            getDocMock.mockRejectedValue(permissionDenied());
            claimCallableMock.mockRejectedValue(new Error('claim failed'));

            await expect(mergeApplicationDoc(REF, { ...basePayload })).rejects.toThrow('claim failed');
        });
    });
});
