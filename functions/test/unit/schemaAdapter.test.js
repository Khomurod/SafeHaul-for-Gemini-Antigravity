const {
  buildChatFields,
  getMergedSchema,
  requiresEmployer,
} = require('../../telegram/schemaAdapter');

describe('telegram schemaAdapter', () => {
  it('merges hide/override rules and keeps DOT-required fields visible', () => {
    const merged = getMergedSchema({
      version: '1',
      sections: [{
        id: 's1',
        fields: [
          { key: 'firstName', label: 'First', dotRequired: true, canCompanyHide: true },
          { key: 'referralSource', label: 'Referral', canCompanyHide: true },
          { key: 'lastName', label: 'Last', canCompanyModify: true },
        ],
      }],
    }, {
      hiddenFields: ['firstName', 'referralSource'],
      fieldOverrides: { lastName: { label: 'Legal last name' } },
    });

    expect(merged.fields.find((f) => f.key === 'firstName')).toBeTruthy();
    expect(merged.fields.find((f) => f.key === 'referralSource')).toBeFalsy();
    expect(merged.fields.find((f) => f.key === 'lastName').label).toBe('Legal last name');
  });

  it('orders MVP chat fields and appends required uploads', () => {
    const fields = buildChatFields({ fields: [] }, {
      cdlUpload: { hidden: false, required: true },
      medCardUpload: { hidden: false, required: true },
    });
    expect(fields[0].key).toBe('firstName');
    expect(fields.map((f) => f.key)).toContain('cdl-front');
    expect(fields.map((f) => f.key)).toContain('cdl-back');
    expect(fields.map((f) => f.key)).toContain('medical-card-upload');
  });

  it('requires employer unless company hides or disables employment history', () => {
    expect(requiresEmployer({})).toBe(true);
    expect(requiresEmployer({ employmentHistory: { hidden: true, required: true } })).toBe(false);
    expect(requiresEmployer({ employmentHistory: { hidden: false, required: false } })).toBe(false);
  });
});
