const crypto = require('crypto');
const { validateInitData } = require('../../telegram/validateInitData');

function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('validateInitData', () => {
  it('validates Telegram WebApp HMAC and user match', () => {
    const initData = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'q1',
      user: JSON.stringify({ id: 123, first_name: 'Ada' }),
    }, 'bot-token');

    const result = validateInitData(initData, 'bot-token', { telegramUserId: '123' });
    expect(result.valid).toBe(true);
    expect(result.user.id).toBe(123);
  });

  it('rejects invalid hash, stale auth date, and user mismatch', () => {
    const valid = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 123 }),
    }, 'bot-token');
    expect(validateInitData(valid.replace(/.$/, '0'), 'bot-token').valid).toBe(false);

    const stale = signInitData({
      auth_date: '1',
      user: JSON.stringify({ id: 123 }),
    }, 'bot-token');
    expect(validateInitData(stale, 'bot-token').reason).toBe('stale_auth_date');
    expect(validateInitData(valid, 'bot-token', { telegramUserId: '999' }).reason).toBe('user_mismatch');
  });

  it('skips validation when bot token is empty', () => {
    expect(validateInitData('', '').valid).toBe(true);
  });
});
