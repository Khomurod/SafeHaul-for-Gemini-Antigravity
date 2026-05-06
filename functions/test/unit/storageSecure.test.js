jest.mock('firebase-functions/v1', () => ({
  https: {
    onCall: (fn) => fn,
    HttpsError: class extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
}));

const mockGetSignedUrl = jest.fn().mockResolvedValue(['https://signed-write']);

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: 'bucket1',
      file: jest.fn(() => ({
        getSignedUrl: mockGetSignedUrl,
      })),
    })),
  })),
}));

jest.mock('../../firebaseAdmin', () => ({
  db: {},
}));

jest.mock('../../shared/companyTenant', () => ({
  assertCompanyAcceptingIntake: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const { assertCompanyAcceptingIntake } = require('../../shared/companyTenant');
const { getSignedUploadUrl } = require('../../storageSecure');

describe('getSignedUploadUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertCompanyAcceptingIntake.mockResolvedValue({});
    mockGetSignedUrl.mockResolvedValue(['https://signed-write']);
  });

  const authedCtx = {
    app: { token: 'appcheck' },
    auth: { uid: 'driver1' },
    rawRequest: { ip: '1.2.3.4' },
  };

  it('validates tenant before signing URL', async () => {
    const data = await getSignedUploadUrl(
      { companyId: 'co99', fileName: 'doc.pdf', fileType: 'application/pdf' },
      authedCtx
    );
    expect(assertCompanyAcceptingIntake).toHaveBeenCalledWith(expect.anything(), 'co99');
    expect(data.storagePath).toContain('companies/co99/applications/guest_uploads/');
    expect(data.url).toBe('https://signed-write');
  });

  it('does not generate URL when tenant check fails', async () => {
    const functions = require('firebase-functions/v1');
    assertCompanyAcceptingIntake.mockRejectedValueOnce(
      new functions.https.HttpsError('not-found', 'Company not found.')
    );
    await expect(
      getSignedUploadUrl({ companyId: 'missing', fileName: 'a.pdf', fileType: 'application/pdf' }, authedCtx)
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});
