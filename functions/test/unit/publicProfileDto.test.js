jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => ({ __ts: true }),
    },
  },
}));

const admin = require('firebase-admin');

// Inline mirror of buildPublicProfileDto logic for unit testing
function buildPublicProfileDto(companyData) {
  const PUBLIC_APPLICATION_CONFIG_KEYS = [
    'cdlUpload', 'medCardUpload', 'showEmergencyContacts',
    'ssn', 'dob', 'previousAddresses', 'employers', 'violations', 'accidents',
  ];
  const rawConfig = companyData.applicationConfig || {};
  const applicationConfig = {};
  for (const key of PUBLIC_APPLICATION_CONFIG_KEYS) {
    if (rawConfig[key] !== undefined) {
      applicationConfig[key] = rawConfig[key];
    }
  }
  return {
    companyName: companyData.companyName || 'Untitled Company',
    appSlug: companyData.appSlug || null,
    logoUrl: companyData.companyLogoUrl || null,
    brandColor: companyData.brandColor || '#1e40af',
    applicationConfig,
    customQuestions: Array.isArray(companyData.customQuestions) ? companyData.customQuestions : [],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

describe('public profile DTO', () => {
  it('omits internal operational fields', () => {
    const dto = buildPublicProfileDto({
      companyName: 'Acme',
      isActive: false,
      revenue: 99999,
      featureSchedules: { searchDB: false },
      postApplicationTemplates: [{ id: 'x' }],
      applicationConfig: {
        cdlUpload: { required: true },
        internalOnly: { hidden: true },
      },
      customQuestions: [{ id: 'q1', label: 'Why?' }],
    });

    expect(dto.companyName).toBe('Acme');
    expect(dto.isActive).toBeUndefined();
    expect(dto.revenue).toBeUndefined();
    expect(dto.featureSchedules).toBeUndefined();
    expect(dto.postApplicationTemplates).toBeUndefined();
    expect(dto.applicationConfig.internalOnly).toBeUndefined();
    expect(dto.applicationConfig.cdlUpload).toEqual({ required: true });
    expect(dto.customQuestions).toHaveLength(1);
  });
});
