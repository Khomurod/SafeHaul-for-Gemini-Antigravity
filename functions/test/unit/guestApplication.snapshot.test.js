// Wiring test: submitting an application must freeze a submission snapshot, and
// a snapshot failure must never lose an application the driver already sent.
jest.mock('firebase-functions/v1', () => {
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const https = { HttpsError, onCall: (fn) => fn };
  return { https, runWith: () => ({ https }) };
});

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ __srv: true }) },
}));

// In-memory Firestore covering the full path the writer walks:
// companies/{id}/applications/{id}/submission/{seq}
const mockState = {
  applications: {},   // path -> data
  snapshots: {},      // path -> data
  publicProfile: null,
  createShouldFail: null,
};

function mockApplicationDoc(companyId, applicationId) {
  const appPath = `companies/${companyId}/applications/${applicationId}`;
  return {
    async set(data) { mockState.applications[appPath] = { ...(mockState.applications[appPath] || {}), ...data }; },
    async get() {
      return appPath in mockState.applications
        ? { exists: true, data: () => mockState.applications[appPath] }
        : { exists: false, data: () => null };
    },
    collection: (name) => ({
      doc: (seq) => {
        const path = `${appPath}/${name}/${seq}`;
        return {
          async create(data) {
            if (mockState.createShouldFail) throw mockState.createShouldFail;
            if (path in mockState.snapshots) {
              const err = new Error('6 ALREADY_EXISTS'); err.code = 6; throw err;
            }
            mockState.snapshots[path] = data;
          },
          async get() {
            return path in mockState.snapshots
              ? { exists: true, data: () => mockState.snapshots[path] }
              : { exists: false, data: () => undefined };
          },
        };
      },
    }),
  };
}

jest.mock('../../firebaseAdmin', () => ({
  db: {
    collection: (col) => {
      if (col === 'public_profiles') {
        return { doc: () => ({ get: async () => (mockState.publicProfile
          ? { exists: true, data: () => mockState.publicProfile }
          : { exists: false }) }) };
      }
      if (col === 'companies') {
        return { doc: (companyId) => ({
          collection: () => ({ doc: (applicationId) => mockApplicationDoc(companyId, applicationId) }),
        }) };
      }
      return { doc: () => ({}) };
    },
  },
}));

jest.mock('../../shared/companyTenant', () => ({
  assertCompanyAcceptingIntake: jest.fn().mockResolvedValue({
    companyName: 'Artificial Freight Co',
    dotNumber: '1234567',
    address: { street: '1 Test Way', city: 'Springfield', state: 'IL', zip: '62701' },
    contact: { email: 'hr@example.test', phone: '555-0100' },
    applicationConfig: {
      cdlUpload: { hidden: false, required: false },
      medCardUpload: { hidden: false, required: false },
    },
    customQuestions: [{ id: 'q-company', label: 'Company-doc question' }],
  }),
}));

jest.mock('../../shared/rateLimiter', () => ({ checkRateLimit: jest.fn().mockResolvedValue(true) }));

const { submitGuestApplication } = require('../../guestApplication');

const payload = (formData = {}) => ({
  companyId: 'co1',
  email: 'ann@example.test',
  phone: '5551234567',
  signature: 'data:image/png;base64,AAA',
  formData: { firstName: 'Ann', lastName: 'Adams', ...formData },
});
const ctx = { rawRequest: { ip: '203.0.113.1' } };

// The public profile REPLACES the company config, so a fixture that omits the
// upload gates would make CDL uploads required by default (correct behaviour,
// but not what these cases are exercising).
const NO_REQUIRED_UPLOADS = {
  cdlUpload: { hidden: false, required: false },
  medCardUpload: { hidden: false, required: false },
};

const storedSnapshots = () => Object.entries(mockState.snapshots);
const onlySnapshot = () => storedSnapshots()[0][1];

beforeEach(() => {
  jest.clearAllMocks();
  mockState.applications = {};
  mockState.snapshots = {};
  mockState.publicProfile = null;
  mockState.createShouldFail = null;
});

describe('submission freezes a snapshot', () => {
  it('writes the original snapshot as v1 and reports its id', async () => {
    const res = await submitGuestApplication(payload(), ctx);
    expect(res.success).toBe(true);
    expect(res.snapshotId).toBe('v1');
    expect(storedSnapshots()).toHaveLength(1);
    expect(storedSnapshots()[0][0]).toMatch(/\/submission\/v1$/);
  });

  it('stores it under the FINAL application id', async () => {
    const res = await submitGuestApplication(payload(), ctx);
    expect(storedSnapshots()[0][0]).toContain(`/applications/${res.applicationId}/`);
  });

  it('freezes the frozen marker, versions and company identity', async () => {
    await submitGuestApplication(payload(), ctx);
    const snap = onlySnapshot();
    expect(snap.frozen).toBe(true);
    expect(snap.definitionVersion).toMatch(/^[a-f0-9]{16}$/);
    expect(snap.agreementVersion).toBe('v1');
    // Company identity comes from the company document — the public profile
    // deliberately does not expose an address or DOT number.
    expect(snap.company.companyName).toBe('Artificial Freight Co');
    expect(snap.company.dotNumber).toBe('1234567');
    expect(snap.company.address.city).toBe('Springfield');
  });

  it('records the driver answers with real labels', async () => {
    await submitGuestApplication(payload(), ctx);
    const answers = onlySnapshot().sections.flatMap((s) => s.answers);
    const first = answers.find((a) => a.fieldId === 'firstName');
    expect(first.label).toBe('First Name');
    expect(first.displayValue).toBe('Ann');
  });

  it('captures all four agreements including the Clearinghouse consent', async () => {
    await submitGuestApplication(payload(), ctx);
    const ids = onlySnapshot().agreements.map((a) => a.id);
    expect(ids).toEqual(['electronicSignature', 'fcraDisclosure', 'pspDisclosure', 'clearinghouseConsent']);
  });

  it('attaches no signature to an agreement with no acceptance evidence', async () => {
    await submitGuestApplication(payload(), ctx);
    // This payload sends no agreementAcceptances at all.
    for (const agreement of onlySnapshot().agreements) {
      expect(agreement.accepted).toBe(false);
      expect(agreement.signature).toBeNull();
      // The wording presented is still recorded.
      expect(agreement.body).toContain('Artificial Freight Co');
    }
  });

  it('records per-agreement acceptance when the client supplies it', async () => {
    await submitGuestApplication(payload({
      agreementAcceptances: {
        electronicSignature: { accepted: true, acceptedAt: '2026-06-15T12:00:00.000Z' },
        fcraDisclosure: { accepted: true, acceptedAt: '2026-06-15T12:00:01.000Z' },
        pspDisclosure: { accepted: true, acceptedAt: '2026-06-15T12:00:02.000Z' },
        clearinghouseConsent: { accepted: true, acceptedAt: '2026-06-15T12:00:03.000Z' },
      },
    }), ctx);

    const agreements = onlySnapshot().agreements;
    expect(agreements.every((a) => a.accepted === true)).toBe(true);
    expect(agreements.every((a) => a.signature !== null)).toBe(true);
    expect(agreements[0].acceptedAt).toBe('2026-06-15T12:00:00.000Z');
  });

  it('stamps owner ids so the driver can read their own snapshot', async () => {
    const res = await submitGuestApplication(payload(), ctx);
    const snap = onlySnapshot();
    expect(snap.applicantId).toBe(res.applicationId);
    expect(snap.driverId).toBe(res.applicationId);
    expect(snap.companyId).toBe('co1');
  });

  it('records employment coverage as computed at submission', async () => {
    await submitGuestApplication(payload({
      employers: [{ startDate: '2020-01', endDate: 'Present', companyName: 'Prior Carrier' }],
    }), ctx);
    expect(onlySnapshot().employmentCoverage.isComplete).toBe(true);
  });

  it('marks the record as a live submission, not a reconstruction', async () => {
    await submitGuestApplication(payload(), ctx);
    expect(onlySnapshot().provenance).toEqual({ source: 'submission', notes: [] });
  });
});

describe('questions are captured as the driver saw them', () => {
  it('prefers the public profile questions, which is what the apply page renders', async () => {
    mockState.publicProfile = {
      companyName: 'Artificial Freight Co',
      applicationConfig: NO_REQUIRED_UPLOADS,
      customQuestions: [{ id: 'q-public', label: 'Public-profile question' }],
    };
    await submitGuestApplication(payload({ customAnswers: { 'q-public': 'Answered' } }), ctx);

    const custom = onlySnapshot().customAnswers;
    expect(custom.map((q) => q.questionId)).toEqual(['q-public']);
    expect(custom[0].label).toBe('Public-profile question');
    expect(custom[0].displayValue).toBe('Answered');
  });

  it('falls back to the company document when there is no public profile', async () => {
    await submitGuestApplication(payload({ customAnswers: { 'q-company': 'Yes' } }), ctx);
    expect(onlySnapshot().customAnswers[0].label).toBe('Company-doc question');
  });

  it('keeps an answer whose question is unknown, without using the id as wording', async () => {
    mockState.publicProfile = { companyName: 'Artificial Freight Co', applicationConfig: NO_REQUIRED_UPLOADS, customQuestions: [] };
    await submitGuestApplication(payload({ customAnswers: { 'deleted-uuid': 'Some answer' } }), ctx);

    const orphan = onlySnapshot().customAnswers.find((a) => a.questionId === 'deleted-uuid');
    expect(orphan.unknownQuestion).toBe(true);
    expect(orphan.label).toBeNull();
    expect(orphan.displayValue).toBe('Some answer');
  });
});

describe('a snapshot failure must not lose the application', () => {
  it('still succeeds, and reports no snapshot id, when the snapshot write fails', async () => {
    const err = new Error('7 PERMISSION_DENIED'); err.code = 7;
    mockState.createShouldFail = err;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await submitGuestApplication(payload(), ctx);

    // The application the driver submitted is saved either way.
    expect(res.success).toBe(true);
    expect(res.applicationId).toMatch(/^[a-z0-9]{20}$/);
    expect(res.snapshotId).toBeNull();
    expect(Object.keys(mockState.applications)).toHaveLength(1);
    // And the failure is logged loudly for the reconstruction job to pick up.
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Submission snapshot failed'),
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it('re-submission adds a sibling snapshot rather than overwriting the original', async () => {
    const first = await submitGuestApplication(payload({ firstName: 'Ann' }), ctx);
    const second = await submitGuestApplication(payload({ firstName: 'Ann' }), ctx);

    // Same applicant key -> same application, two submission records.
    expect(second.applicationId).toBe(first.applicationId);
    expect(first.snapshotId).toBe('v1');
    expect(second.snapshotId).toBe('v2');
    expect(storedSnapshots()).toHaveLength(2);
  });
});
