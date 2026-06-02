jest.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
  onCall: (_opts, fn) => fn,
}));

jest.mock('firebase-functions/v1', () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ __srv: true }) },
}));

jest.mock('../../firebaseAdmin', () => ({
  db: {},
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../shared/upsertApplicationDoc', () => ({
  upsertApplicationDoc: jest.fn().mockResolvedValue({
    success: true,
    applicationId: 'app1',
    confirmationNumber: 'SAF-2026-ABCDE',
    deduplicated: false,
  }),
}));

jest.mock('../../telegram/botApi', () => ({
  getBotToken: jest.fn(() => ''),
  sendMessage: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../../telegram/sessionService', () => ({
  getSession: jest.fn(),
  isSessionExpired: jest.fn(() => false),
  updateSession: jest.fn(),
  completeSession: jest.fn().mockResolvedValue({}),
}));

const sessionService = require('../../telegram/sessionService');
const { upsertApplicationDoc } = require('../../shared/upsertApplicationDoc');
const {
  completeTelegramApplication,
  consentAccepted,
  getTelegramSessionStatus,
  validateSignature,
} = require('../../telegram/application');

const signature = 'data:image/png;base64,' + 'A'.repeat(120);

function baseSession(overrides = {}) {
  return {
        sessionId: 'sess1234567890123',
    telegramChatId: 'chat1',
    telegramUserId: '123',
    companyId: 'co1',
    companyName: 'Tenant Co',
    appSlug: 'tenant',
    recruiterCode: null,
    status: 'awaiting_signature',
    applicationConfig: {
      cdlUpload: { hidden: false, required: false },
      medCardUpload: { hidden: false, required: false },
    },
    formData: {
      firstName: 'Ada',
      lastName: 'Driver',
      email: 'ada@example.com',
      phone: '5551234567',
      employers: [{ companyName: 'Carrier', phone: '5551234567' }],
      'final-certification': 'agreed',
      'agree-electronic': 'agreed',
      'agree-background-check': 'agreed',
      'agree-psp': 'agreed',
    },
    ...overrides,
  };
}

describe('completeTelegramApplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionService.getSession.mockResolvedValue(baseSession());
  });

  it('returns minimal session status without formData', async () => {
    const result = await getTelegramSessionStatus({ data: { sessionToken: 'sess1234567890123' } });
    expect(result).toEqual(expect.objectContaining({
      status: 'awaiting_signature',
      companyName: 'Tenant Co',
      appSlug: 'tenant',
      consentAccepted: true,
      expired: false,
    }));
    expect(result.formData).toBeUndefined();
  });

  it('validates consent and signature helpers', () => {
    expect(consentAccepted(baseSession().formData)).toBe(true);
    expect(validateSignature(signature)).toBe(true);
    expect(validateSignature('data:image/png;base64,A')).toBe(false);
  });

  it('submits via shared upsert with Telegram source metadata', async () => {
    const result = await completeTelegramApplication({
      data: { sessionToken: 'sess1234567890123', signature },
      rawRequest: { ip: '1.2.3.4' },
    });

    expect(result.success).toBe(true);
    expect(upsertApplicationDoc).toHaveBeenCalled();
    const applicationDoc = upsertApplicationDoc.mock.calls[0][0].applicationDoc;
    expect(applicationDoc.sourceType).toBe('Telegram Bot');
    expect(applicationDoc.sourceSlug).toBe('tenant');
    expect(applicationDoc.lifecycle.clientVersion).toBe('telegram-1.0');
    expect(applicationDoc.signatureType).toBe('drawn');
    expect(applicationDoc.signatureDate).toBeTruthy();
    expect(sessionService.completeSession).toHaveBeenCalledWith('sess1234567890123', expect.objectContaining({
      applicationId: 'app1',
      confirmationNumber: 'SAF-2026-ABCDE',
    }));
  });

  it('rejects expired or unsigned sessions', async () => {
    sessionService.isSessionExpired.mockReturnValueOnce(true);
    await expect(completeTelegramApplication({
      data: { sessionToken: 'sess1234567890123', signature },
      rawRequest: { ip: '1.2.3.4' },
    })).rejects.toMatchObject({ code: 'failed-precondition' });

    sessionService.isSessionExpired.mockReturnValue(false);
    await expect(completeTelegramApplication({
      data: { sessionToken: 'sess1234567890123', signature: 'bad' },
      rawRequest: { ip: '1.2.3.4' },
    })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
