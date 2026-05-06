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

const mockCreate = jest.fn().mockResolvedValue(undefined);

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
              doc: jest.fn(() => ({ create: mockCreate })),
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
    mockCreate.mockResolvedValue(undefined);
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

  it('rejects when App Check is missing outside emulator', async () => {
    await expect(submitGuestApplication(validPayload, { ...ctxBase, app: undefined })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(companyTenant.assertCompanyAcceptingIntake).not.toHaveBeenCalled();
  });

  it('calls assertCompanyAcceptingIntake before writing', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    await submitGuestApplication(validPayload, { ...ctxBase, app: undefined });
    expect(companyTenant.assertCompanyAcceptingIntake).toHaveBeenCalledWith(expect.anything(), 'co1');
    expect(mockCreate).toHaveBeenCalled();
  });

  it('succeeds with App Check and creates application doc', async () => {
    const res = await submitGuestApplication(validPayload, ctxBase);
    expect(res.success).toBe(true);
    expect(res.applicationId).toMatch(/^[a-f0-9]{20}$/);
    expect(res.confirmationNumber).toMatch(/^SAF-/);
    expect(mockCreate).toHaveBeenCalled();
  });
});
