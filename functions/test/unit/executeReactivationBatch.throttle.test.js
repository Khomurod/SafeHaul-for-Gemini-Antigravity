// A3 FIX coverage: executeReactivationBatch must throttle repeated campaigns (fail-closed),
// and the throttle must run after RBAC and after the per-call size cap.

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts, fn) => fn,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

const mockSendSMS = jest.fn().mockResolvedValue({ ok: true });
jest.mock('../../integrations/factory', () => ({
  getAdapter: jest.fn(),
  getAdapterForUser: jest.fn().mockResolvedValue({ sendSMS: mockSendSMS, config: {} }),
  getAdapterForNumber: jest.fn(),
}));

jest.mock('../../shared/companyAccess', () => ({
  assertCompanyAdminStrict: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(() => ({ collection: jest.fn() })), {
    FieldValue: { serverTimestamp: jest.fn(() => 'ts') },
  }),
}));

const { checkRateLimit } = require('../../shared/rateLimiter');
const { assertCompanyAdminStrict } = require('../../shared/companyAccess');
const { executeReactivationBatch } = require('../../integrations/services/smsService');

const baseRequest = () => ({
  auth: { uid: 'admin1' },
  data: { companyId: 'co1', leadIds: ['l1', 'l2'], messageText: 'Hello [Driver Name]' },
});

describe('executeReactivationBatch throttle (A3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkRateLimit.mockResolvedValue(true);
    assertCompanyAdminStrict.mockResolvedValue(undefined);
  });

  it('throttles with resource-exhausted when the campaign limit is exceeded', async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    await expect(executeReactivationBatch(baseRequest())).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it('uses a per-company-per-user key with closed fail behavior', async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    await executeReactivationBatch(baseRequest()).catch(() => {});
    expect(checkRateLimit).toHaveBeenCalledWith('reactivation_batch_co1_admin1', 5, 300, 'closed');
  });

  it('only throttles after RBAC passes', async () => {
    assertCompanyAdminStrict.mockRejectedValueOnce(new Error('denied'));
    await executeReactivationBatch(baseRequest()).catch(() => {});
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('rejects oversized batches before throttling (existing cap preserved)', async () => {
    const req = baseRequest();
    req.data.leadIds = Array.from({ length: 51 }, (_, i) => `l${i}`);
    await expect(executeReactivationBatch(req)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(assertCompanyAdminStrict).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await expect(executeReactivationBatch({ data: { companyId: 'co1', leadIds: ['l1'] } }))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
