jest.mock('../../firebaseAdmin', () => ({
  db: {},
  storage: {},
}));

jest.mock('../../shared/companyTenant', () => ({
  assertCompanyAcceptingIntake: jest.fn(),
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../telegram/botApi', () => ({
  sendMessage: jest.fn().mockResolvedValue({ ok: true }),
  answerCallbackQuery: jest.fn().mockResolvedValue({ ok: true }),
  getFile: jest.fn(),
  downloadFile: jest.fn(),
}));

jest.mock('../../telegram/sessionService', () => ({
  findActiveSessionByChatId: jest.fn(),
  updateSession: jest.fn(),
  cancelSession: jest.fn(),
  isSessionExpired: jest.fn(() => false),
}));

const sessionService = require('../../telegram/sessionService');
const botApi = require('../../telegram/botApi');
const { parseStartPayload, processUpdate, validateFieldValue } = require('../../telegram/conversationEngine');

describe('telegram conversationEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses apply slug and recruiter code from /start payload', () => {
    expect(parseStartPayload('/start apply_acme')).toEqual({ slug: 'acme', recruiterCode: null });
    expect(parseStartPayload('/start apply_acme_r_rec123')).toEqual({ slug: 'acme', recruiterCode: 'rec123' });
  });

  it('validates email, phone, and date answers', () => {
    expect(validateFieldValue({ type: 'email', required: true }, 'bad').ok).toBe(false);
    expect(validateFieldValue({ type: 'tel', required: true }, '555-123-4567').ok).toBe(true);
    expect(validateFieldValue({ type: 'date', required: true }, '06/02/2026').value).toBe('2026-06-02');
  });

  it('keeps user on violations yes branch and documents web continuation', async () => {
    sessionService.findActiveSessionByChatId.mockResolvedValue({
      sessionId: 'sess1',
      telegramChatId: 'chat1',
      cursor: { phase: 'fields', fieldIndex: 0 },
      formData: {},
      schemaSnapshot: {
        chatFields: [{ key: 'has-violations', label: 'Violations?', type: 'radio', options: [{ label: 'Yes', value: 'yes' }] }],
      },
    });

    await processUpdate({
      callback_query: {
        id: 'cb1',
        data: 'answer:yes',
        message: { chat: { id: 'chat1' } },
      },
    });

    expect(sessionService.updateSession).not.toHaveBeenCalled();
    expect(botApi.sendMessage.mock.calls[0][1]).toMatch(/cannot collect detail rows/i);
  });

  it('accepts consent and moves session to awaiting signature', async () => {
    const session = {
      sessionId: 'sess1',
      telegramChatId: 'chat1',
      cursor: { phase: 'consent' },
      formData: {},
      schemaSnapshot: { chatFields: [] },
    };
    sessionService.findActiveSessionByChatId.mockResolvedValue(session);
    sessionService.updateSession.mockResolvedValue({
      ...session,
      status: 'awaiting_signature',
      formData: {
        'final-certification': 'agreed',
        'agree-electronic': 'agreed',
        'agree-background-check': 'agreed',
        'agree-psp': 'agreed',
      },
      cursor: { phase: 'signature' },
    });

    await processUpdate({
      callback_query: {
        id: 'cb1',
        data: 'consent:accept',
        message: { chat: { id: 'chat1' } },
      },
    });

    expect(sessionService.updateSession).toHaveBeenCalledWith('sess1', expect.objectContaining({
      status: 'awaiting_signature',
    }));
    expect(botApi.sendMessage.mock.calls.at(-1)[1]).toMatch(/signature/i);
  });
});
