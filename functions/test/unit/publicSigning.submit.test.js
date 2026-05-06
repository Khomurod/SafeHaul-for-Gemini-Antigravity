jest.mock('firebase-functions/v2/https', () => ({
  onCall: jest.fn((optsOrFn, maybeFn) => (typeof maybeFn === 'function' ? maybeFn : optsOrFn)),
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('../../firebaseAdmin', () => {
  const mockRunTransaction = jest.fn();
  const docRefStub = {
    update: jest.fn().mockResolvedValue(undefined),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        delete: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  };
  return {
    admin: {
      firestore: {
        FieldValue: { serverTimestamp: jest.fn(() => ({ __ts: true })) },
      },
    },
    db: {
      runTransaction: (...args) => mockRunTransaction(...args),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => docRefStub),
          })),
        })),
      })),
    },
    storage: {
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({ save: jest.fn().mockResolvedValue(undefined) })),
      })),
    },
    mockRunTransaction,
    docRefStub,
  };
});

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

const { submitPublicEnvelope } = require('../../publicSigning');
const firebaseAdmin = require('../../firebaseAdmin');

describe('submitPublicEnvelope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseAdmin.mockRunTransaction.mockReset();
    firebaseAdmin.docRefStub.update.mockResolvedValue(undefined);
  });

  function mockTxnEnvelope({ expired, token = 'secret-token' } = {}) {
    const expiresAt = expired
      ? { toMillis: () => Date.now() - 60000 }
      : { toMillis: () => Date.now() + 60000 };
    firebaseAdmin.mockRunTransaction.mockImplementation(async (cb) => {
      let call = 0;
      const txn = {
        get: jest.fn(async () => {
          call += 1;
          if (call === 1) {
            return {
              exists: true,
              data: () => ({
                status: 'sent',
                expiresAt,
              }),
            };
          }
          return {
            exists: true,
            data: () => ({ accessToken: token }),
          };
        }),
        update: jest.fn(),
      };
      return cb(txn);
    });
  }

  const baseReq = {
    data: {
      companyId: 'c1',
      requestId: 'r1',
      accessToken: 'secret-token',
      fieldValues: {},
      auditData: {},
    },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  };

  it('rejects expired envelopes inside the transaction', async () => {
    mockTxnEnvelope({ expired: true });
    await expect(submitPublicEnvelope(baseReq)).rejects.toMatchObject({
      code: 'deadline-exceeded',
    });
  });

  it('passes expiry check when expiresAt is in the future', async () => {
    mockTxnEnvelope({ expired: false });

    const res = await submitPublicEnvelope(baseReq);
    expect(res.success).toBe(true);
    expect(firebaseAdmin.docRefStub.update).toHaveBeenCalled();
  });
});
