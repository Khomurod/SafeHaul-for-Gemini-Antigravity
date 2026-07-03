import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

  it('lets any company team member save/edit E-Docs templates, but only admins delete', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'company-a'), { companyName: 'Co A' });
      // Seed a template to exercise update + delete paths.
      await setDoc(doc(adminDb, 'companies', 'company-a', 'templates', 'tmpl-seed'), {
        companyId: 'company-a', title: 'Seed', fields: [],
      });
    });

    const hrDb = testEnv.authenticatedContext('hr-a', {
      roles: { 'company-a': 'hr_user' },
    }).firestore();
    const recruiterDb = testEnv.authenticatedContext('rec-a', {
      roles: { 'company-a': 'recruiter' },
    }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-a', {
      roles: { 'company-a': 'company_admin' },
    }).firestore();
    const crossTenantDb = testEnv.authenticatedContext('admin-b', {
      roles: { 'company-b': 'company_admin' },
    }).firestore();

    // hr_user can CREATE (this is the E-Docs "Save Template" regression).
    await assertSucceeds(
      setDoc(doc(hrDb, 'companies', 'company-a', 'templates', 'tmpl-hr'), {
        companyId: 'company-a', title: 'Offer Letter', fields: [],
      }),
    );
    // recruiter can UPDATE.
    await assertSucceeds(
      updateDoc(doc(recruiterDb, 'companies', 'company-a', 'templates', 'tmpl-seed'), {
        title: 'Seed (edited)',
      }),
    );
    // hr_user / recruiter CANNOT delete (admin-only, mirrors signing_requests).
    await assertFails(
      deleteDoc(doc(hrDb, 'companies', 'company-a', 'templates', 'tmpl-seed')),
    );
    // company_admin CAN delete.
    await assertSucceeds(
      deleteDoc(doc(adminDb, 'companies', 'company-a', 'templates', 'tmpl-hr')),
    );
    // Cross-tenant write is still blocked.
    await assertFails(
      setDoc(doc(crossTenantDb, 'companies', 'company-a', 'templates', 'tmpl-evil'), {
        companyId: 'company-a', title: 'Evil', fields: [],
      }),
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

  // ===================================================================
  // SEC-002: cross-company driver / staff profile reads
  // ===================================================================

  it('SEC-002: staff read a driver profile ONLY when they share a company', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'drivers', 'driver-a'), {
        personalInfo: { firstName: 'Ann' }, companyIds: ['company-a'],
      });
      await setDoc(doc(adminDb, 'drivers', 'driver-b'), {
        personalInfo: { firstName: 'Bob' }, companyIds: ['company-b'],
      });
      // Legacy profile with no companyIds field (pre-backfill) must NOT be readable by staff.
      await setDoc(doc(adminDb, 'drivers', 'driver-legacy'), {
        personalInfo: { firstName: 'Old' },
      });
    });

    const recruiterA = testEnv.authenticatedContext('rec-a', {
      roles: { 'company-a': 'recruiter' },
      companyTeamIds: ['company-a'],
    }).firestore();

    // (1) connected to company-a -> allowed
    await assertSucceeds(getDoc(doc(recruiterA, 'drivers', 'driver-a')));
    // (2) company-b only -> DENIED
    await assertFails(getDoc(doc(recruiterA, 'drivers', 'driver-b')));
    // legacy / no companyIds -> DENIED until backfilled
    await assertFails(getDoc(doc(recruiterA, 'drivers', 'driver-legacy')));
  });

  it('SEC-002: driver reads own profile; super admin reads any profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'drivers', 'driver-b'), {
        personalInfo: { firstName: 'Bob' }, companyIds: ['company-b'],
      });
    });
    const ownerDb = testEnv.authenticatedContext('driver-b').firestore();
    const superDb = testEnv.authenticatedContext('super-1', { globalRole: 'super_admin' }).firestore();

    // (4) owner reads own profile
    await assertSucceeds(getDoc(doc(ownerDb, 'drivers', 'driver-b')));
    // (5) super admin reads any profile
    await assertSucceeds(getDoc(doc(superDb, 'drivers', 'driver-b')));
  });

  it('SEC-002: staff read a teammate user ONLY when they share a company', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'user-a'), { name: 'A', email: 'a@x.com', companyIds: ['company-a'] });
      await setDoc(doc(adminDb, 'users', 'user-b'), { name: 'B', email: 'b@x.com', companyIds: ['company-b'] });
    });

    const recruiterA = testEnv.authenticatedContext('rec-a', {
      roles: { 'company-a': 'recruiter' },
      companyTeamIds: ['company-a'],
    }).firestore();

    // teammate in same company -> allowed
    await assertSucceeds(getDoc(doc(recruiterA, 'users', 'user-a')));
    // (3) company-B-only staff user -> DENIED
    await assertFails(getDoc(doc(recruiterA, 'users', 'user-b')));
  });

  it('SEC-002: user reads own profile but cannot self-edit companyIds', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'user-a'), { name: 'A', email: 'a@x.com', companyIds: ['company-a'] });
    });
    const ownerDb = testEnv.authenticatedContext('user-a', { roles: {} }).firestore();

    await assertSucceeds(getDoc(doc(ownerDb, 'users', 'user-a')));
    await assertSucceeds(updateDoc(doc(ownerDb, 'users', 'user-a'), { name: 'A renamed' }));
    // Privilege field: a user must NOT grant themselves cross-company visibility.
    await assertFails(updateDoc(doc(ownerDb, 'users', 'user-a'), { companyIds: ['company-a', 'company-b'] }));
  });

  it('SEC-002: staff cannot dump all users, but a same-company documentId-in query works', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'user-a1'), { name: 'A1', companyIds: ['company-a'] });
      await setDoc(doc(adminDb, 'users', 'user-a2'), { name: 'A2', companyIds: ['company-a'] });
      await setDoc(doc(adminDb, 'users', 'user-b1'), { name: 'B1', companyIds: ['company-b'] });
    });

    const recruiterA = testEnv.authenticatedContext('rec-a', {
      roles: { 'company-a': 'recruiter' },
      companyTeamIds: ['company-a'],
    }).firestore();

    // Full-collection enumeration (would leak other tenants) -> DENIED
    await assertFails(getDocs(collection(recruiterA, 'users')));
    // Constrained teammate lookup over same-company member ids -> allowed
    await assertSucceeds(
      getDocs(query(collection(recruiterA, 'users'), where(documentId(), 'in', ['user-a1', 'user-a2']))),
    );
  });

  it('SEC-002: same-company staff can still read application docs (detail view unaffected)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'company-a', 'applications', 'app1'), {
        companyId: 'company-a', applicantId: 'driver-a', driverId: 'driver-a',
        firstName: 'Ann', status: 'New Application',
      });
    });
    const recruiterA = testEnv.authenticatedContext('rec-a', {
      roles: { 'company-a': 'recruiter' },
      companyTeamIds: ['company-a'],
    }).firestore();
    // (6) application detail view for same-company staff still works
    await assertSucceeds(getDoc(doc(recruiterA, 'companies', 'company-a', 'applications', 'app1')));
  });

  // ===================================================================
  // FUNC-005: logged-in driver re-submit / edit of their own application
  // ===================================================================

  const driverCtx = () =>
    testEnv.authenticatedContext('driver-1', { email: 'd@x.com', email_verified: true }).firestore();

  async function seedDriverApp(extra = {}) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'companies', 'co1', 'applications', 'driver-1'), {
        companyId: 'co1',
        applicantId: 'driver-1',
        driverId: 'driver-1',
        status: 'New Application',
        firstName: 'Al',
        phone: '111',
        createdAt: 'orig-created-at',
        ...extra,
      });
    });
  }

  it('FUNC-005 (1): first-time driver submission (deterministic id) succeeds', async () => {
    // Full create payload — create branch has no field allow-list.
    await assertSucceeds(
      setDoc(doc(driverCtx(), 'companies', 'co1', 'applications', 'driver-1'), {
        companyId: 'co1',
        applicantId: 'driver-1',
        driverId: 'driver-1',
        status: 'New Application',
        firstName: 'Al',
        confirmationNumber: 'ABC123',
        createdAt: 'first-write',
      }),
    );
  });

  it('FUNC-005 (2,3,8): re-submit/edit with create-only fields dropped succeeds and preserves recruiter status', async () => {
    // Recruiter has already advanced the pipeline + left a note.
    await seedDriverApp({ status: 'In Process' });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'companies', 'co1', 'applications', 'driver-1', 'internal_notes', 'n1'),
        { text: 'called driver' },
      );
    });

    const driverDb = driverCtx();
    // Client-shaped re-submit: allow-listed fields only (NO status/createdAt/confirmationNumber).
    await assertSucceeds(
      updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'driver-1'), {
        phone: '222',
        signatureType: 'drawn',
        lifecycle: { status: 'pending' },
      }),
    );
    // (8) driver still cannot touch recruiter-owned internal notes.
    await assertFails(
      setDoc(doc(driverDb, 'companies', 'co1', 'applications', 'driver-1', 'internal_notes', 'n2'), { text: 'x' }),
    );
  });

  it('FUNC-005: driver cannot rewrite createdAt on update (why the client strips it)', async () => {
    await seedDriverApp();
    await assertFails(
      updateDoc(doc(driverCtx(), 'companies', 'co1', 'applications', 'driver-1'), { createdAt: 'tampered' }),
    );
  });

  it('FUNC-005 (4,5,6,7): driver cannot change companyId / assignedRecruiterId / status=Hired, nor delete', async () => {
    await seedDriverApp();
    const driverDb = driverCtx();
    // (4) companyId immutable
    await assertFails(
      updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'driver-1'), { companyId: 'co2' }),
    );
    // (5) recruiter assignment is not a driver-writable field
    await assertFails(
      updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'driver-1'), { assignedRecruiterId: 'rec-x' }),
    );
    // (6) cannot self-hire
    await assertFails(
      updateDoc(doc(driverDb, 'companies', 'co1', 'applications', 'driver-1'), { status: 'Hired' }),
    );
    // (7) cannot delete their application
    await assertFails(deleteDoc(doc(driverDb, 'companies', 'co1', 'applications', 'driver-1')));
  });

  // ===================================================================
  // SEC-003: recruiter links belong to exactly one company
  // ===================================================================

  it('SEC-003: company staff create/update ONLY their own company recruiter links', async () => {
    // Seed an existing link owned by company-b.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'recruiter_links', 'CODEB'), {
        userId: 'rec-b', companyId: 'company-b',
      });
      await setDoc(doc(adminDb, 'recruiter_links', 'CODEA'), {
        userId: 'rec-a', companyId: 'company-a',
      });
    });

    const staffA = testEnv.authenticatedContext('rec-a', {
      roles: { 'company-a': 'recruiter' },
    }).firestore();

    // (1) create a link for their OWN company -> allowed
    await assertSucceeds(
      setDoc(doc(staffA, 'recruiter_links', 'NEWA'), { userId: 'rec-a', companyId: 'company-a' }),
    );
    // (2) update their OWN company link -> allowed
    await assertSucceeds(
      updateDoc(doc(staffA, 'recruiter_links', 'CODEA'), { userId: 'rec-a2' }),
    );
    // (3) overwrite ANOTHER company's link -> DENIED
    await assertFails(
      updateDoc(doc(staffA, 'recruiter_links', 'CODEB'), { userId: 'rec-a' }),
    );
    // create for another company -> DENIED
    await assertFails(
      setDoc(doc(staffA, 'recruiter_links', 'NEWB'), { userId: 'rec-a', companyId: 'company-b' }),
    );
    // (4) change companyId on their own link -> DENIED (companyId immutable)
    await assertFails(
      updateDoc(doc(staffA, 'recruiter_links', 'CODEA'), { companyId: 'company-b' }),
    );
  });

  it('SEC-003: anyone (incl. unauthenticated guest) can resolve a recruiter link by reading it', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'recruiter_links', 'CODEA'), {
        userId: 'rec-a', companyId: 'company-a',
      });
    });
    // (5) public/guest resolve still works
    const guestDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(guestDb, 'recruiter_links', 'CODEA')));
  });
});
