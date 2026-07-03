import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => {
  const setDocSpy = vi.fn().mockResolvedValue(undefined);
  const docSpy = vi.fn(() => ({ __ref: true }));
  // FUNC-005: mergeApplicationDoc reads the doc first to decide create vs update.
  // exists:false => create path (keeps status/createdAt/confirmationNumber).
  const getDocSpy = vi.fn().mockResolvedValue({ exists: () => false });
  return { setDocSpy, docSpy, getDocSpy };
});

vi.mock('firebase/firestore', () => ({
  doc: firestoreMocks.docSpy,
  setDoc: firestoreMocks.setDocSpy,
  getDoc: firestoreMocks.getDocSpy,
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock('@lib/firebase', () => ({
  db: {},
  storage: {},
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@lib/submissionQueue', () => ({
  initQueue: vi.fn().mockResolvedValue(undefined),
  enqueueSubmission: vi.fn(),
  dequeueSubmission: vi.fn(),
  isSupported: vi.fn(() => false),
}));

vi.mock('@lib/applicationId', () => ({
  generateApplicationId: vi.fn(async () => 'abc123def456ghi78901'),
  generateConfirmationNumber: vi.fn(() => 'SAF-2026-TEST01'),
}));

vi.mock('@lib/runtime/e2eMode', () => ({
  isE2ETestMode: false,
  getE2EQueryParam: vi.fn(() => ''),
}));

const { setDocSpy } = firestoreMocks;

describe('driverService application submit and upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDocSpy.mockResolvedValue(undefined);
  });

  it('uploadApplicationFile rejects oversized files', async () => {
    const { uploadApplicationFile } = await import('@features/driver-app/services/driverService');
    const bigFile = { size: 21 * 1024 * 1024, type: 'application/pdf', name: 'big.pdf' };
    await expect(uploadApplicationFile('co1', 'uid1', 'cdl-front', bigFile)).rejects.toThrow(
      /20MB/i,
    );
  });

  it('uploadApplicationFile rejects invalid MIME types', async () => {
    const { uploadApplicationFile } = await import('@features/driver-app/services/driverService');
    const badFile = { size: 1000, type: 'application/zip', name: 'archive.zip' };
    await expect(uploadApplicationFile('co1', 'uid1', 'cdl-front', badFile)).rejects.toThrow(
      /Invalid file type/i,
    );
  });

  it('submitDriverApplication merges into deterministic application doc', async () => {
    const { submitDriverApplication } = await import('@features/driver-app/services/driverService');
    const user = { uid: 'driver-uid-1', email: 'driver@example.com' };
    const formData = {
      email: 'driver@example.com',
      phone: '5555551234',
      firstName: 'Test',
      lastName: 'Driver',
      signature: 'data:image/png;base64,abc',
    };

    const first = await submitDriverApplication(user, formData, 'co1', null);
    const second = await submitDriverApplication(user, formData, 'co1', null);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.applicationId).toBe(second.applicationId);
    expect(setDocSpy).toHaveBeenCalledTimes(2);
    expect(setDocSpy.mock.calls[0][2]).toEqual({ merge: true });
    expect(setDocSpy.mock.calls[0][1]).toMatchObject({
      applicantId: 'abc123def456ghi78901',
      companyId: 'co1',
      status: 'New Application',
    });
  });
});
