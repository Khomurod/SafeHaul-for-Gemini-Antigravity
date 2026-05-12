jest.mock('firebase-functions/v1', () => {
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const https = { HttpsError, onCall: (fn) => fn };
  return { https, runWith: () => ({ https }) };
});

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ __srv: true }) },
}));

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn().mockResolvedValue({ exists: false, data: () => null });

jest.mock('../../firebaseAdmin', () => ({
  db: {
    collection: jest.fn((col) => {
      if (col === 'public_profiles') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ exists: false }),
          })),
        };
      }
      if (col === 'companies') {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ set: mockSet, get: mockGet })),
            })),
          })),
        };
      }
      return { doc: jest.fn() };
    }),
  },
}));

jest.mock('../../shared/companyTenant', () => ({
  assertCompanyAcceptingIntake: jest.fn().mockResolvedValue({
    companyName: 'Tenant Co',
    applicationConfig: {
      cdlUpload: { hidden: false, required: false },
      medCardUpload: { hidden: false, required: false },
    },
  }),
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

const { submitGuestApplication } = require('../../guestApplication');
const companyTenant = require('../../shared/companyTenant');

describe('submitGuestApplication', () => {
  const emulatorBackup = process.env.FUNCTIONS_EMULATOR;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({ exists: false, data: () => null });
    delete process.env.FUNCTIONS_EMULATOR;
  });

  afterAll(() => {
    process.env.FUNCTIONS_EMULATOR = emulatorBackup;
  });

  const validPayload = {
    companyId: 'co1',
    email: 'a@b.com',
    phone: '5551234567',
    signature: 'data:image/png;base64,AAA',
    formData: {
      'cdl-front': { url: 'x' },
      'cdl-back': { url: 'y' },
      'medical-card-upload': { url: 'z' },
    },
  };

  const ctxBase = {
    app: { token: 'appcheck' },
    rawRequest: { ip: '203.0.113.1' },
  };

  it('allows submission when App Check is missing', async () => {
    const res = await submitGuestApplication(validPayload, { ...ctxBase, app: undefined });
    expect(res.success).toBe(true);
    expect(companyTenant.assertCompanyAcceptingIntake).toHaveBeenCalledWith(expect.anything(), 'co1');
  });

  it('calls assertCompanyAcceptingIntake before writing', async () => {
    await submitGuestApplication(validPayload, { ...ctxBase, app: undefined });
    expect(companyTenant.assertCompanyAcceptingIntake).toHaveBeenCalledWith(expect.anything(), 'co1');
    expect(mockSet).toHaveBeenCalled();
  });

  it('writes a deterministic 20-char applicationId using set+merge', async () => {
    const res = await submitGuestApplication(validPayload, ctxBase);
    expect(res.success).toBe(true);
    expect(res.applicationId).toMatch(/^[a-z0-9]{20}$/);
    expect(res.confirmationNumber).toMatch(/^SAF-/);
    expect(res.deduplicated).toBe(false);
    expect(mockSet).toHaveBeenCalledTimes(1);
    // set called with { merge: true }
    expect(mockSet.mock.calls[0][1]).toEqual({ merge: true });
  });

  it('upserts (deduplicates) when the same identity submits twice', async () => {
    // First submission: doc does NOT exist
    mockGet.mockResolvedValueOnce({ exists: false, data: () => null });
    const first = await submitGuestApplication(validPayload, ctxBase);

    // Second submission: doc DOES exist with original confirmation/timestamps
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        confirmationNumber: first.confirmationNumber,
        submittedAt: 'orig-ts',
        createdAt: 'orig-ts',
        status: 'New Application',
      }),
    });
    const second = await submitGuestApplication(validPayload, ctxBase);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // Same deterministic ID
    expect(first.applicationId).toBe(second.applicationId);
    // Same confirmation surfaced both times (server preserves original)
    expect(second.confirmationNumber).toBe(first.confirmationNumber);
    expect(second.deduplicated).toBe(true);
    // Both writes use set+merge (never .create())
    expect(mockSet).toHaveBeenCalledTimes(2);
    for (const call of mockSet.mock.calls) {
      expect(call[1]).toEqual({ merge: true });
    }
  });

  it('never clobbers a progressed status on a retry', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        confirmationNumber: 'SAF-2026-AAAAA',
        submittedAt: 'orig-ts',
        createdAt: 'orig-ts',
        status: 'Hired',
      }),
    });

    await submitGuestApplication(validPayload, ctxBase);
    const writtenDoc = mockSet.mock.calls[0][0];
    expect(writtenDoc.status).toBeUndefined();
  });
});
