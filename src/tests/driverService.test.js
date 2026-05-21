import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => {
  const querySpy = vi.fn((...args) => ({ __type: 'query', args }));
  const getDocsSpy = vi.fn();
  const collectionGroupSpy = vi.fn((_db, group) => ({ __type: 'collectionGroup', group }));
  const whereSpy = vi.fn((field, op, value) => ({ __type: 'where', field, op, value }));
  const orderBySpy = vi.fn((field, direction) => ({ __type: 'orderBy', field, direction }));
  return { querySpy, getDocsSpy, collectionGroupSpy, whereSpy, orderBySpy };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  const m = firestoreMocks;
  return {
    ...actual,
    query: m.querySpy,
    getDocs: m.getDocsSpy,
    collectionGroup: m.collectionGroupSpy,
    where: m.whereSpy,
    orderBy: m.orderBySpy,
  };
});

vi.mock('@lib/firebase', () => ({
  db: {},
  storage: {},
}));

vi.mock('@sentry/react', () => ({
  default: {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  },
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const { querySpy, getDocsSpy, collectionGroupSpy, whereSpy, orderBySpy } = firestoreMocks;

describe('getDriverApplicationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] when applicantKey is missing', async () => {
    const { getDriverApplicationHistory } = await import('@features/driver-app/services/driverService');
    await expect(getDriverApplicationHistory('')).resolves.toEqual([]);
    expect(getDocsSpy).not.toHaveBeenCalled();
  });

  it('builds applicantKey/submittedAt query and returns mapped records', async () => {
    const docA = {
      id: 'appA',
      data: () => ({ applicantKey: 'abc123', submittedAt: { seconds: 10 }, status: 'New Application' }),
      ref: { parent: { parent: { id: 'company-1' } } },
    };
    const docB = {
      id: 'appB',
      data: () => ({ applicantKey: 'abc123', submittedAt: { seconds: 5 }, status: 'Offer Accepted' }),
      ref: { parent: { parent: { id: 'company-2' } } },
    };
    getDocsSpy.mockResolvedValue({ docs: [docA, docB] });

    const { getDriverApplicationHistory } = await import('@features/driver-app/services/driverService');
    const result = await getDriverApplicationHistory('abc123');

    expect(collectionGroupSpy).toHaveBeenCalledWith(expect.any(Object), 'applications');
    expect(whereSpy).toHaveBeenCalledWith('applicantKey', '==', 'abc123');
    expect(orderBySpy).toHaveBeenCalledWith('submittedAt', 'desc');
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(getDocsSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({ id: 'appA', companyId: 'company-1', applicantKey: 'abc123' }),
      expect.objectContaining({ id: 'appB', companyId: 'company-2', applicantKey: 'abc123' }),
    ]);
  });
});
