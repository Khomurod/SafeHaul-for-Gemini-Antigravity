'use strict';

const {
  computeApplicationRollupDeltas,
  computeLeadRollupDeltas,
} = require('../../dashboardStatsRollup');

function snap(exists, data) {
  return {
    exists,
    data: () => data,
  };
}

describe('dashboardStatsRollup deltas', () => {
  test('application create increments apps and hired when already hired', () => {
    const d = computeApplicationRollupDeltas(snap(false, null), snap(true, { status: 'Hired' }));
    expect(d).toEqual({ applicationsTotal: 1, hiredTotal: 1 });
  });

  test('application create not hired', () => {
    const d = computeApplicationRollupDeltas(snap(false, null), snap(true, { status: 'New Application' }));
    expect(d).toEqual({ applicationsTotal: 1, hiredTotal: 0 });
  });

  test('application delete removes hired', () => {
    const d = computeApplicationRollupDeltas(snap(true, { status: 'Approved' }), snap(false, null));
    expect(d).toEqual({ applicationsTotal: -1, hiredTotal: -1 });
  });

  test('application status to hired bumps hired only', () => {
    const d = computeApplicationRollupDeltas(
      snap(true, { status: 'In Process' }),
      snap(true, { status: 'Hired' }),
    );
    expect(d).toEqual({ applicationsTotal: 0, hiredTotal: 1 });
  });

  test('application irrelevant update returns null', () => {
    const d = computeApplicationRollupDeltas(
      snap(true, { status: 'New Application', firstName: 'A' }),
      snap(true, { status: 'New Application', firstName: 'B' }),
    );
    expect(d).toBeNull();
  });

  test('lead create and delete', () => {
    expect(computeLeadRollupDeltas(snap(false, null), snap(true, {}))).toEqual({ leadsTotal: 1 });
    expect(computeLeadRollupDeltas(snap(true, {}), snap(false, null))).toEqual({ leadsTotal: -1 });
    expect(computeLeadRollupDeltas(snap(true, { a: 1 }), snap(true, { a: 2 }))).toBeNull();
  });
});

describe('applyDashboardIncrements idempotency', () => {
  const { applyDashboardIncrements } = require('../../dashboardStatsRollup');

  // In-memory fake Firestore: tracks processed_events markers and counts
  // how many times the dashboard doc receives an increment write.
  function makeFakeDb() {
    const markers = new Set();
    const dashboardWrites = [];

    const dashboardRef = {
      collection: (name) => {
        expect(name).toBe('processed_events');
        return {
          doc: (eventId) => ({ __marker: true, eventId }),
        };
      },
      set: (payload, opts) => {
        dashboardWrites.push({ payload, opts, via: 'direct' });
      },
    };

    const database = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => dashboardRef,
          }),
        }),
      }),
      runTransaction: async (fn) => {
        const transaction = {
          get: async (ref) => ({ exists: markers.has(ref.eventId) }),
          set: (ref, payload, opts) => {
            if (ref.__marker) {
              markers.add(ref.eventId);
            } else {
              dashboardWrites.push({ payload, opts, via: 'txn' });
            }
          },
        };
        return fn(transaction);
      },
    };

    return { database, markers, dashboardWrites };
  }

  test('applies increments once and skips duplicate event deliveries', async () => {
    const { database, dashboardWrites } = makeFakeDb();
    const deltas = { applicationsTotal: 1, hiredTotal: 0 };

    await applyDashboardIncrements('company-1', deltas, 'event-abc', database);
    await applyDashboardIncrements('company-1', deltas, 'event-abc', database); // retry

    expect(dashboardWrites).toHaveLength(1);
    expect(dashboardWrites[0].via).toBe('txn');
    expect(dashboardWrites[0].payload.applicationsTotal).toBeDefined();
  });

  test('distinct events each apply', async () => {
    const { database, dashboardWrites } = makeFakeDb();
    await applyDashboardIncrements('company-1', { leadsTotal: 1 }, 'event-1', database);
    await applyDashboardIncrements('company-1', { leadsTotal: 1 }, 'event-2', database);
    expect(dashboardWrites).toHaveLength(2);
  });

  test('falls back to a direct write when eventId is missing', async () => {
    const { database, dashboardWrites } = makeFakeDb();
    await applyDashboardIncrements('company-1', { leadsTotal: 1 }, undefined, database);
    expect(dashboardWrites).toHaveLength(1);
    expect(dashboardWrites[0].via).toBe('direct');
  });

  test('no-op deltas write nothing', async () => {
    const { database, dashboardWrites } = makeFakeDb();
    await applyDashboardIncrements('company-1', { applicationsTotal: 0, hiredTotal: 0 }, 'e', database);
    expect(dashboardWrites).toHaveLength(0);
  });
});
