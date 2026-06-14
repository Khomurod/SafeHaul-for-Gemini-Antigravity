// A1 FIX coverage: the Telegram webhook must FAIL CLOSED when the secret is unset,
// and must constant-time compare the secret token otherwise.

// Ensure a secret is present at module-load time so the startup guard stays quiet.
process.env.TELEGRAM_WEBHOOK_SECRET = 'startup-secret';

jest.mock('firebase-functions/v2/https', () => ({
  // Return the handler so we can invoke it directly in tests.
  onRequest: (_opts, fn) => fn,
}));

jest.mock('../../telegram/botApi', () => ({
  hasBotToken: jest.fn(() => false),
}));

jest.mock('../../telegram/conversationEngine', () => ({
  processUpdate: jest.fn().mockResolvedValue(undefined),
}));

const { hasBotToken } = require('../../telegram/botApi');
const { processUpdate } = require('../../telegram/conversationEngine');
const { telegramWebhook } = require('../../telegram/webhook');

function makeReq({ method = 'POST', header = '', query = {}, body = {} } = {}) {
  return {
    method,
    body,
    query,
    get: (name) => (String(name).toLowerCase() === 'x-telegram-bot-api-secret-token' ? header : undefined),
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('telegramWebhook secret enforcement (A1)', () => {
  const ORIGINAL = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'super-secret-token';
    hasBotToken.mockReturnValue(false);
  });

  afterAll(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = ORIGINAL;
  });

  it('rejects non-POST methods with 405', async () => {
    const res = makeRes();
    await telegramWebhook(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('FAILS CLOSED with 403 when the secret is unset (the core fix)', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const res = makeRes();
    await telegramWebhook(makeReq({ header: 'anything' }), res);
    expect(res.statusCode).toBe(403);
    expect(processUpdate).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED with 403 when the secret is an empty string', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = '   ';
    const res = makeRes();
    await telegramWebhook(makeReq({ header: '' }), res);
    expect(res.statusCode).toBe(403);
    expect(processUpdate).not.toHaveBeenCalled();
  });

  it('rejects a mismatched secret header with 403', async () => {
    const res = makeRes();
    await telegramWebhook(makeReq({ header: 'wrong-token' }), res);
    expect(res.statusCode).toBe(403);
    expect(processUpdate).not.toHaveBeenCalled();
  });

  it('accepts a matching secret via header (token not configured → 200 ack)', async () => {
    const res = makeRes();
    await telegramWebhook(makeReq({ header: 'super-secret-token' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('TOKEN_NOT_CONFIGURED');
  });

  it('accepts a matching secret via query string', async () => {
    const res = makeRes();
    await telegramWebhook(makeReq({ header: '', query: { secret: 'super-secret-token' } }), res);
    expect(res.statusCode).toBe(200);
  });

  it('processes the update when secret matches and bot token is configured', async () => {
    hasBotToken.mockReturnValue(true);
    const res = makeRes();
    await telegramWebhook(makeReq({ header: 'super-secret-token', body: { update_id: 1 } }), res);
    expect(processUpdate).toHaveBeenCalledWith({ update_id: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK');
  });
});
