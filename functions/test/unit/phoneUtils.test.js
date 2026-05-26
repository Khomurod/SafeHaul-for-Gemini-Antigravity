const { normalizePhoneForKeychain, normalizePhone } = require('../../utils/phoneUtils');

describe('phoneUtils exports', () => {
  it('re-exports normalizePhone from shared module', () => {
    expect(typeof normalizePhone).toBe('function');
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });
});

describe('normalizePhoneForKeychain', () => {
  it('normalizes US numbers to E.164 with plus prefix', () => {
    expect(normalizePhoneForKeychain('(555) 123-4567')).toBe('+5551234567');
  });

  it('preserves leading plus and strips formatting', () => {
    expect(normalizePhoneForKeychain('+1 555 123 4567')).toBe('+15551234567');
  });

  it('throws on empty input', () => {
    expect(() => normalizePhoneForKeychain('')).toThrow('Invalid phone number');
  });
});
