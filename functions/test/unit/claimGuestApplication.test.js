// P1 fix: authenticated driver re-submitting over a guest-created application.
// The callable must (a) prove ownership via the deterministic email+phone hash,
// (b) only link driverId/userId to the caller with a VERIFIED matching email,
// (c) never touch recruiter-owned fields (status/createdAt/confirmationNumber).

const crypto = require('crypto');

const mockStore = { docs: {}, sets: [] };

jest.mock('../../firebaseAdmin', () => ({
  db: {
    collection: (col) => ({
      doc: (companyId) => ({
        collection: (sub) => ({
          doc: (appId) => {
            const key = `${col}/${companyId}/${sub}/${appId}`;
            return {
              get: async () => {
                const data = mockStore.docs[key];
                return { exists: !!data, data: () => data };
              },
              set: async (payload, opts) => {
                mockStore.sets.push({ key, payload, opts });
              },
            };
          },
        }),
      }),
    }),
  },
}));

jest.mock('../../shared/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(true),
}));

const { claimGuestApplication } = require('../../claimGuestApplication');

function hashFor(companyId, email, phone) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const normalizedPhone = (phone || '').replace(/\D/g, '').trim();
  return crypto
    .createHash('sha256')
    .update(`${companyId}:${normalizedEmail}:${normalizedPhone}`)
    .digest('hex')
    .substring(0, 20);
}

const COMPANY = 'co-1';
const EMAIL = 'driver@example.com';
const PHONE = '(555) 123-4567';
const APP_ID = hashFor(COMPANY, EMAIL, PHONE);
const DOC_KEY = `companies/${COMPANY}/applications/${APP_ID}`;

function makeRequest({ uid = 'uid-1', email = EMAIL, emailVerified = true, data } = {}) {
  return {
    auth: { uid, token: { email, email_verified: emailVerified } },
    data: data || {
      companyId: COMPANY,
      applicationId: APP_ID,
      formData: { email: EMAIL, phone: PHONE, firstName: 'Jane', status: 'Hired', assignedTo: 'evil' },
    },
  };
}

function seedGuestDoc(extra = {}) {
  mockStore.docs[DOC_KEY] = {
    companyId: COMPANY,
    email: EMAIL,
    phone: PHONE,
    applicantId: APP_ID,
    driverId: APP_ID, // guest docs store the hash, not a uid
    userId: APP_ID,
    status: 'In Process',
    confirmationNumber: 'SAF-2026-AAAAA',
    ...extra,
  };
}

describe('claimGuestApplication', () => {
  beforeEach(() => {
    mockStore.docs = {};
    mockStore.sets = [];
  });

  it('rejects unauthenticated calls', async () => {
    await expect(claimGuestApplication.run({ auth: null, data: {} })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('claims a guest application when the verified email matches', async () => {
    seedGuestDoc();
    const res = await claimGuestApplication.run(makeRequest());

    expect(res).toEqual({ success: true, applicationId: APP_ID, claimed: true });
    expect(mockStore.sets).toHaveLength(1);
    const { payload, opts } = mockStore.sets[0];
    expect(opts).toEqual({ merge: true });
    expect(payload.driverId).toBe('uid-1');
    expect(payload.userId).toBe('uid-1');
    expect(payload.firstName).toBe('Jane');
    // Recruiter-owned / privileged fields are never merged from formData.
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('assignedTo');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('confirmationNumber');
    expect(payload).not.toHaveProperty('companyId');
  });

  it('merges WITHOUT claiming when the email is unverified (hash still proves write access)', async () => {
    seedGuestDoc();
    const res = await claimGuestApplication.run(makeRequest({ emailVerified: false }));

    expect(res.success).toBe(true);
    expect(res.claimed).toBe(false);
    const { payload } = mockStore.sets[0];
    expect(payload.firstName).toBe('Jane');
    // Identity fields untouched — no dashboard read granted without a verified email.
    expect(payload).not.toHaveProperty('driverId');
    expect(payload).not.toHaveProperty('userId');
  });

  it('denies when the submitted email+phone do not hash to the target doc', async () => {
    seedGuestDoc();
    const req = makeRequest({
      data: {
        companyId: COMPANY,
        applicationId: APP_ID,
        formData: { email: 'other@example.com', phone: '9998887777', firstName: 'X' },
      },
    });
    await expect(claimGuestApplication.run(req)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockStore.sets).toHaveLength(0);
  });

  it('allows the merge when the caller already owns the doc, even with a different hash', async () => {
    seedGuestDoc({ driverId: 'uid-1', userId: 'uid-1' });
    const req = makeRequest({
      data: {
        companyId: COMPANY,
        applicationId: APP_ID,
        formData: { email: 'newemail@example.com', phone: '2223334444', firstName: 'Jane' },
      },
    });
    const res = await claimGuestApplication.run(req);
    expect(res.success).toBe(true);
    expect(res.claimed).toBe(true);
  });

  it('returns not-found for a nonexistent application', async () => {
    await expect(claimGuestApplication.run(makeRequest())).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('validates input arguments', async () => {
    await expect(
      claimGuestApplication.run(makeRequest({ data: { applicationId: APP_ID, formData: {} } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      claimGuestApplication.run(makeRequest({ data: { companyId: COMPANY, formData: {} } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      claimGuestApplication.run(makeRequest({ data: { companyId: COMPANY, applicationId: APP_ID } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
