const { normalizePhone } = require('../../shared/normalizePhone');

describe('normalizePhone (shared)', () => {
  it('normalizes 10-digit US to +1 E.164', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  it('normalizes 11-digit US with leading 1', () => {
    expect(normalizePhone('1-555-123-4567')).toBe('+15551234567');
  });

  it('returns null for empty or invalid input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});
