// P2 audit fix: SEGMENT_RULES previously matched lowercase 'applied'/'new'
// statuses that no real document ever carries (real vocabulary:
// 'New Application', 'New Lead', 'Attempted', ... and lastCallOutcome stores
// the label 'No Answer'). GHOSTED and NEW_LEADS therefore never populated.
// These tests pin the rules to the REAL status vocabulary.

const { SEGMENT_RULES } = require('../../segments');

function ts(date) {
  return { toDate: () => date };
}

describe('SEGMENT_RULES vocabulary', () => {
  describe('GHOSTED', () => {
    it('matches a new application with a No Answer outcome (real stored values)', () => {
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'New Application', lastCallOutcome: 'No Answer' }),
      ).toBe(true);
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'Attempted', lastCallOutcome: 'No Answer' }),
      ).toBe(true);
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'Contact Attempt 2', lastCallOutcome: 'No Answer' }),
      ).toBe(true);
    });

    it('accepts the legacy no_answer id form', () => {
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'New', lastCallOutcome: 'no_answer' }),
      ).toBe(true);
    });

    it('does not match progressed or connected records', () => {
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'In Process', lastCallOutcome: 'No Answer' }),
      ).toBe(false);
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'Hired', lastCallOutcome: 'No Answer' }),
      ).toBe(false);
      expect(
        SEGMENT_RULES.GHOSTED.check({ status: 'New Application', lastCallOutcome: 'Connected / Interested' }),
      ).toBe(false);
    });
  });

  describe('NEW_LEADS', () => {
    const recent = ts(new Date(Date.now() - 60 * 60 * 1000)); // 1h ago
    const old = ts(new Date(Date.now() - 72 * 60 * 60 * 1000)); // 72h ago

    it('matches records created within 48h carrying a real "new" status', () => {
      expect(SEGMENT_RULES.NEW_LEADS.check({ createdAt: recent, status: 'New Application' })).toBe(true);
      expect(SEGMENT_RULES.NEW_LEADS.check({ createdAt: recent, status: 'New Lead' })).toBe(true);
      expect(SEGMENT_RULES.NEW_LEADS.check({ createdAt: recent, status: 'New' })).toBe(true);
    });

    it('does not match old or progressed records', () => {
      expect(SEGMENT_RULES.NEW_LEADS.check({ createdAt: old, status: 'New Application' })).toBe(false);
      expect(SEGMENT_RULES.NEW_LEADS.check({ createdAt: recent, status: 'In Process' })).toBe(false);
    });
  });

  describe('INACTIVE_30_DAYS', () => {
    it('matches never-contacted and stale records, not recent contacts', () => {
      expect(SEGMENT_RULES.INACTIVE_30_DAYS.check({})).toBe(true);
      expect(
        SEGMENT_RULES.INACTIVE_30_DAYS.check({
          lastContactedAt: ts(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)),
        }),
      ).toBe(true);
      expect(
        SEGMENT_RULES.INACTIVE_30_DAYS.check({
          lastContactedAt: ts(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
        }),
      ).toBe(false);
    });
  });
});
