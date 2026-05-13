jest.mock('firebase-functions/v2/https', () => ({
  onCall: jest.fn((optsOrFn, maybeFn) => (typeof maybeFn === 'function' ? maybeFn : optsOrFn)),
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockRequestRef = {
  id: 'req_123',
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({ id: 'token_doc' })),
  })),
};

const mockApplicationGet = jest.fn();
const mockTemplateGet = jest.fn();
const mockPublicProfileGet = jest.fn();

jest.mock('../../firebaseAdmin', () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => ({ __ts: true })),
      },
      Timestamp: {
        fromMillis: jest.fn((n) => ({ __millis: n })),
      },
    },
  },
  db: {
    collection: jest.fn((name) => {
      if (name === 'public_profiles') {
        return {
          doc: jest.fn(() => ({
            get: mockPublicProfileGet,
          })),
        };
      }
      if (name === 'companies') {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((sub) => {
              if (sub === 'applications') {
                return { doc: jest.fn(() => ({ get: mockApplicationGet })) };
              }
              if (sub === 'templates') {
                return { doc: jest.fn(() => ({ get: mockTemplateGet })) };
              }
              if (sub === 'signing_requests') {
                return { doc: jest.fn(() => mockRequestRef) };
              }
              return { doc: jest.fn() };
            }),
          })),
        };
      }
      return { doc: jest.fn() };
    }),
    batch: jest.fn(() => ({
      set: (...args) => mockBatchSet(...args),
      commit: (...args) => mockBatchCommit(...args),
    })),
  },
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../shared/companyTenant', () => ({
  assertCompanyAcceptingIntake: jest.fn().mockResolvedValue({ companyName: 'Demo Co', isActive: true }),
}));

const { createPostApplicationSigningRequest } = require('../../postApplicationEdocs');
const { checkRateLimit } = require('../../shared/rateLimiter');
const { assertCompanyAcceptingIntake } = require('../../shared/companyTenant');

describe('createPostApplicationSigningRequest', () => {
  const baseReq = {
    data: {
      companyId: 'co1',
      applicationId: 'app1',
      confirmationNumber: 'SAF-2026-ABCDE',
      templateId: 'tpl1',
      appBaseUrl: 'https://truckerapp-system.web.app',
    },
    rawRequest: { ip: '203.0.113.10' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPublicProfileGet.mockResolvedValue({
      exists: true,
      data: () => ({
        companyName: 'Demo Logistics',
        postApplicationTemplates: [{ templateId: 'tpl1', title: 'W-9', enabled: true }],
      }),
    });
    mockApplicationGet.mockResolvedValue({
      exists: true,
      data: () => ({
        confirmationNumber: 'SAF-2026-ABCDE',
        firstName: 'Anthony',
        lastName: 'Collins',
        email: 'driver@example.com',
        phone: '5551112222',
        street: '2221 MEADECROFT RD',
        city: 'CHARLOTTE',
        state: 'NC',
        zip: '28214',
      }),
    });
    mockTemplateGet.mockResolvedValue({
      exists: true,
      data: () => ({
        title: 'W-9 Form',
        storagePath: 'secure_documents/co1/templates/w9.pdf',
        fields: [
          { id: 'f1', type: 'text', required: true, defaultValue: '{{first_name}} {Last_name}' },
          { id: 'f2', type: 'text', required: true, bindingKey: 'email', defaultValue: '' },
          { id: 'sig', type: 'signature', required: true, defaultValue: '' },
        ],
      }),
    });
  });

  it('creates a signing request with resolved placeholders', async () => {
    const res = await createPostApplicationSigningRequest(baseReq);

    expect(res.success).toBe(true);
    expect(res.requestId).toBe('req_123');
    expect(res.accessToken).toBeTruthy();
    expect(mockBatchSet).toHaveBeenCalledTimes(2);

    const firstSetPayload = mockBatchSet.mock.calls[0][1];
    expect(firstSetPayload.title).toBe('W-9 Form');
    expect(firstSetPayload.source).toBe('post_application_success');
    expect(firstSetPayload.fields.find((f) => f.id === 'f1').defaultValue).toBe('Anthony Collins');
    expect(firstSetPayload.fields.find((f) => f.id === 'f2').defaultValue).toBe('driver@example.com');
    expect(checkRateLimit).toHaveBeenCalled();
    expect(assertCompanyAcceptingIntake).toHaveBeenCalledWith(expect.anything(), 'co1');
  });

  it('rejects when rate limit blocks request', async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });

  it('rejects when application record is missing', async () => {
    mockApplicationGet.mockResolvedValueOnce({ exists: false, data: () => null });
    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('rejects when confirmation number does not match application', async () => {
    mockApplicationGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ confirmationNumber: 'SAF-2026-ZZZZZ' }),
    });
    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when template document does not exist', async () => {
    mockTemplateGet.mockResolvedValueOnce({ exists: false, data: () => null });
    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('rejects when template storagePath is missing', async () => {
    mockTemplateGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ title: 'Broken Template', fields: [] }),
    });
    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('supports legacy string list in postApplicationTemplates config', async () => {
    mockPublicProfileGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        postApplicationTemplates: ['tpl1'],
      }),
    });
    const res = await createPostApplicationSigningRequest(baseReq);
    expect(res.success).toBe(true);
  });

  it('marks locked fields readOnly when value is prefilled', async () => {
    mockTemplateGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        title: 'DD Form',
        storagePath: 'secure_documents/co1/templates/dd.pdf',
        fields: [
          {
            id: 'full_name',
            type: 'text',
            required: true,
            prefillPolicy: 'locked',
            bindingKey: 'full_name',
            defaultValue: '',
          },
        ],
      }),
    });
    await createPostApplicationSigningRequest(baseReq);
    const firstSetPayload = mockBatchSet.mock.calls[0][1];
    expect(firstSetPayload.fields[0].defaultValue).toBe('Anthony Collins');
    expect(firstSetPayload.fields[0].readOnly).toBe(true);
  });

  it('rejects templates that are not enabled on public profile', async () => {
    mockPublicProfileGet.mockResolvedValue({
      exists: true,
      data: () => ({
        postApplicationTemplates: [{ templateId: 'other_template', enabled: true }],
      }),
    });

    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects locked required fields with missing prefill', async () => {
    mockTemplateGet.mockResolvedValue({
      exists: true,
      data: () => ({
        title: 'Direct Deposit',
        storagePath: 'secure_documents/co1/templates/dd.pdf',
        fields: [
          {
            id: 'acct_name',
            type: 'text',
            required: true,
            prefillPolicy: 'locked',
            bindingKey: 'bank_account_name',
            defaultValue: '',
          },
        ],
      }),
    });

    await expect(createPostApplicationSigningRequest(baseReq)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects invalid arguments before any writes', async () => {
    await expect(
      createPostApplicationSigningRequest({
        ...baseReq,
        data: { ...baseReq.data, companyId: '' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockBatchSet).not.toHaveBeenCalled();
  });
});

