import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv;

const projectId = 'safehaul-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'src/firestore.rules'), 'utf8');
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const hasFirestoreEmulator = firestoreEmulatorHost.includes(':');
const describeFirestore = hasFirestoreEmulator ? describe : describe.skip;

async function clearFirestore() {
  await testEnv.clearFirestore();
}

describeFirestore('firestore.rules security regressions', () => {
  beforeAll(async () => {
    const [host, portStr] = firestoreEmulatorHost.split(':');
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules, host, port: Number(portStr) },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  it('blocks driver privilege escalation fields but allows safe profile fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'co1', 'applications', 'app1'), {
        companyId: 'co1',
        applicantId: 'driver-1',
        driverId: 'driver-1',
        status: 'New Application',
        phone: '1111111111',
        firstName: 'Alice',
      });
    });

    const driverDb = testEnv.authenticatedContext('driver-1', {
      email: 'driver@example.com',
      email_verified: true,
    }).firestore();

    await assertSucceeds(updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'app1'), {
      phone: '2222222222',
      signatureType: 'drawn',
    }));

    await assertFails(updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'app1'), {
      status: 'Hired',
      backgroundCheckPassed: true,
    }));
  });

  it('prevents cross-tenant membership hijacking on update', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'memberships', 'mem1'), {
        userId: 'target-user',
        companyId: 'company-b',
        role: 'recruiter',
      });
    });

    const rogueAdminDb = testEnv.authenticatedContext('admin-a', {
      roles: { 'company-a': 'company_admin' },
    }).firestore();

    await assertFails(updateDoc(doc(rogueAdminDb, 'memberships', 'mem1'), {
      companyId: 'company-a',
      role: 'company_admin',
    }));
  });

  it('reads dq_files only via in-document owner markers', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'co1', 'applications', 'app1', 'dq_files', 'f1'), {
        fileName: 'med-card.pdf',
        ownerUserIds: ['driver-1'],
      });
      await setDoc(doc(adminDb, 'companies', 'co1', 'applications', 'app2', 'dq_files', 'f2'), {
        fileName: 'cdl.pdf',
        ownerUserIds: ['driver-2'],
      });
    });

    const ownerDb = testEnv.authenticatedContext('driver-1').firestore();
    const otherDb = testEnv.authenticatedContext('driver-3').firestore();

    await assertSucceeds(getDoc(doc(ownerDb, 'companies', 'co1', 'applications', 'app1', 'dq_files', 'f1')));
    await assertFails(getDoc(doc(otherDb, 'companies', 'co1', 'applications', 'app2', 'dq_files', 'f2')));
  });

  it('allows company admin ATS status + assignee writes on applications', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'co1', 'applications', 'app1'), {
        companyId: 'co1',
        applicantId: 'driver-1',
        driverId: 'driver-1',
        status: 'New Application',
        phone: '1111111111',
        firstName: 'Alice',
      });
    });

    const companyAdminDb = testEnv.authenticatedContext('admin-1', {
      roles: { co1: 'company_admin' },
    }).firestore();

    await assertSucceeds(
      updateDoc(doc(companyAdminDb, 'companies', 'co1', 'applications', 'app1'), {
        status: 'Contact Attempt 1',
        assignedTo: 'admin-1',
        assignedToName: 'Admin One',
      }),
    );

    await assertFails(
      updateDoc(doc(companyAdminDb, 'companies', 'co1', 'applications', 'app1'), {
        status: 'Invalid Fake Status',
      }),
    );
  });

  it('blocks drivers from manipulating ATS assignment fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'co1', 'applications', 'app1'), {
        companyId: 'co1',
        applicantId: 'driver-1',
        driverId: 'driver-1',
        status: 'New Application',
        phone: '1111111111',
      });
    });

    const driverDb = testEnv.authenticatedContext('driver-1', {
      email: 'driver@example.com',
      email_verified: true,
    }).firestore();

    await assertFails(
      updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'app1'), {
        assignedTo: 'admin-1',
        assignedToName: 'Admin',
      }),
    );

    await assertFails(
      updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'app1'), {
        status: 'Hired',
      }),
    );
  });

  it('blocks lead create with mismatched companyId in document body', async () => {
    const adminDb = testEnv.authenticatedContext('admin-a', {
      roles: { 'company-a': 'company_admin' },
    }).firestore();

    await assertFails(
      setDoc(doc(adminDb, 'companies', 'company-a', 'leads', 'lead1'), {
        companyId: 'company-b',
        firstName: 'Cross',
        lastName: 'Tenant',
        status: 'New Lead',
      }),
    );
  });

  it('allows company team to create signing_requests and secrets token', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'company-a'), { companyName: 'Co A' });
    });

    const adminDb = testEnv.authenticatedContext('admin-a', {
      roles: { 'company-a': 'company_admin' },
    }).firestore();

    await assertSucceeds(
      setDoc(doc(adminDb, 'companies', 'company-a', 'signing_requests', 'req1'), {
        companyId: 'company-a',
        status: 'sent',
        recipientName: 'Signer',
        title: 'Test Doc',
      }),
    );

    await assertSucceeds(
      setDoc(doc(adminDb, 'companies', 'company-a', 'signing_requests', 'req1', 'secrets', 'token'), {
        accessToken: 'secret-token-value',
      }),
    );
  });

  it('blocks client read of signing request secrets token', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'company-a', 'signing_requests', 'req1', 'secrets', 'token'), {
        accessToken: 'secret-token-value',
      });
    });

    const adminDb = testEnv.authenticatedContext('admin-a', {
      roles: { 'company-a': 'company_admin' },
    }).firestore();

    await assertFails(
      getDoc(doc(adminDb, 'companies', 'company-a', 'signing_requests', 'req1', 'secrets', 'token')),
    );
  });

  it('blocks all client access to telegram_sessions', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'telegram_sessions', 'sess1'), {
        telegramChatId: '123',
        companyId: 'co1',
        status: 'active',
      });
    });

    const guestDb = testEnv.unauthenticatedContext().firestore();
    const driverDb = testEnv.authenticatedContext('driver-1').firestore();
    const companyAdminDb = testEnv.authenticatedContext('admin-1', {
      roles: { co1: 'company_admin' },
    }).firestore();
    const superDb = testEnv.authenticatedContext('super-1', {
      globalRole: 'super_admin',
    }).firestore();

    await assertFails(getDoc(doc(guestDb, 'telegram_sessions', 'sess1')));
    await assertFails(getDoc(doc(driverDb, 'telegram_sessions', 'sess1')));
    await assertFails(getDoc(doc(companyAdminDb, 'telegram_sessions', 'sess1')));
    await assertFails(getDoc(doc(superDb, 'telegram_sessions', 'sess1')));
    await assertFails(setDoc(doc(companyAdminDb, 'telegram_sessions', 'sess2'), { status: 'active' }));
  });

  it('blocks driver from updating another users signing request', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'company-a', 'signing_requests', 'req1'), {
        companyId: 'company-a',
        status: 'sent',
        recipientId: 'driver-b',
        recipientName: 'Driver B',
      });
    });

    const driverADb = testEnv.authenticatedContext('driver-a', { roles: {} }).firestore();

    await assertFails(
      updateDoc(doc(driverADb, 'companies', 'company-a', 'signing_requests', 'req1'), {
        status: 'signed',
        signatureData: { signed: true },
      }),
    );
  });

  it('blocks all client access to server-only ledgers (A6)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'rate_limits', 'k1'), { count: 1 });
      await setDoc(doc(adminDb, 'processing_status', 'app_co1_app1'), { processedAt: 1 });
      await setDoc(doc(adminDb, 'integrations_index', 'idx1'), { companyId: 'co1' });
    });

    const superDb = testEnv.authenticatedContext('super-1', {
      globalRole: 'super_admin',
    }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-1', {
      roles: { co1: 'company_admin' },
    }).firestore();

    for (const db of [superDb, adminDb]) {
      await assertFails(getDoc(doc(db, 'rate_limits', 'k1')));
      await assertFails(getDoc(doc(db, 'processing_status', 'app_co1_app1')));
      await assertFails(getDoc(doc(db, 'integrations_index', 'idx1')));
    }

    await assertFails(setDoc(doc(adminDb, 'rate_limits', 'k2'), { count: 9 }));
    await assertFails(setDoc(doc(adminDb, 'processing_status', 'x'), { processedAt: 2 }));
    await assertFails(setDoc(doc(adminDb, 'integrations_index', 'y'), { companyId: 'co1' }));
  });

  it('blocks lead update that changes companyId', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'company-a', 'leads', 'lead1'), {
        companyId: 'company-a',
        firstName: 'Alice',
        status: 'New Lead',
      });
    });

    const adminDb = testEnv.authenticatedContext('admin-a', {
      roles: { 'company-a': 'company_admin' },
    }).firestore();

    await assertFails(
      updateDoc(doc(adminDb, 'companies', 'company-a', 'leads', 'lead1'), {
        companyId: 'company-b',
      }),
    );
  });
});
