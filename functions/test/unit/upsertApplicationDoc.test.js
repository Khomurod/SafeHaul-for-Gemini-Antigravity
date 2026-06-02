const { upsertApplicationDoc } = require('../../shared/upsertApplicationDoc');

function createDbMock(existingQueue) {
  const set = jest.fn().mockResolvedValue(undefined);
  const get = jest.fn(() => Promise.resolve(existingQueue.shift() || { exists: false, data: () => null }));
  const appDoc = jest.fn(() => ({ get, set }));
  const appCollection = jest.fn(() => ({ doc: appDoc }));
  const companyDoc = jest.fn(() => ({ collection: appCollection }));
  const collection = jest.fn(() => ({ doc: companyDoc }));
  return {
    db: { collection },
    set,
    get,
  };
}

describe('upsertApplicationDoc', () => {
  it('preserves progressed status and lifecycle on retry', async () => {
    const existing = {
      exists: true,
      data: () => ({
        confirmationNumber: 'SAF-2026-ORIG1',
        submittedAt: 'submitted',
        createdAt: 'created',
        status: 'Hired',
        lifecycle: { status: 'complete', submittedAt: 'submitted' },
      }),
    };
    const { db, set } = createDbMock([existing, existing]);
    const applicationDoc = {
      applicationId: 'app1',
      applicantId: 'app1',
      status: 'New Application',
      confirmationNumber: 'SAF-2026-NEW11',
      lifecycle: { status: 'submitted', submittedAt: 'new' },
    };

    const result = await upsertApplicationDoc({
      db,
      companyId: 'co1',
      applicationId: 'app1',
      applicantKeyFull: 'full',
      applicationDoc,
      now: { __srv: true },
      logLabel: 'test',
    });

    expect(result.deduplicated).toBe(true);
    expect(result.confirmationNumber).toBe('SAF-2026-ORIG1');
    expect(set.mock.calls[0][0].status).toBeUndefined();
    expect(set.mock.calls[0][0].lifecycle.status).toBe('complete');
    expect(set.mock.calls[0][1]).toEqual({ merge: true });
  });

  it('uses a suffixed id on applicantKeyFull collision', async () => {
    const { db, set } = createDbMock([
      { exists: true, data: () => ({ applicantKeyFull: 'other' }) },
      { exists: false, data: () => null },
      { exists: false, data: () => null },
    ]);
    const applicationDoc = {
      applicationId: 'app1',
      applicantId: 'app1',
      driverId: 'app1',
      userId: 'app1',
      confirmationNumber: 'SAF-2026-NEW11',
    };
    const result = await upsertApplicationDoc({
      db,
      companyId: 'co1',
      applicationId: 'app1',
      applicantKeyFull: 'full',
      applicationDoc,
      now: { __srv: true },
      logLabel: 'test',
    });

    expect(result.applicationId).toBe('app1_2');
    expect(set.mock.calls[0][0].applicationId).toBe('app1_2');
  });
});
