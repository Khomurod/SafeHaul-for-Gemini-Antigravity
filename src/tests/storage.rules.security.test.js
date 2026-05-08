import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getMetadata, getStorage, ref, uploadString } from 'firebase/storage';

const projectId = 'safehaul-storage-rules-test';
const bucket = `${projectId}.appspot.com`;
const storageRules = readFileSync(resolve(process.cwd(), 'src/storage.rules'), 'utf8');

let testEnv;

describe('storage.rules multi-tenant isolation', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      storage: { rules: storageRules },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminStorage = getStorage(context.app, `gs://${bucket}`);
      await uploadString(
        ref(adminStorage, 'companies/co1/applications/driverB/cdl-front/license.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } }
      );
      await uploadString(
        ref(adminStorage, 'companies/co1/leads/app123/dq_files/medical.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } }
      );
    });
  });

  it('allows Driver A to write own file but blocks reads to Driver B file', async () => {
    const driverA = testEnv.authenticatedContext('driverA').app;
    const storageA = getStorage(driverA, `gs://${bucket}`);

    await assertSucceeds(
      uploadString(
        ref(storageA, 'companies/co1/applications/driverA/cdl-front/new-license.pdf'),
        'driver-a-file',
        'raw',
        { contentType: 'application/pdf' }
      )
    );

    await assertFails(getMetadata(ref(storageA, 'companies/co1/applications/driverB/cdl-front/license.pdf')));
  });

  it('allows co1 admin and blocks cross-tenant admin on co1 files', async () => {
    const adminCo1 = testEnv.authenticatedContext('admin-co1', {
      roles: { co1: 'company_admin' },
    }).app;
    const adminCo2 = testEnv.authenticatedContext('admin-co2', {
      roles: { co2: 'company_admin' },
    }).app;

    const storageCo1 = getStorage(adminCo1, `gs://${bucket}`);
    const storageCo2 = getStorage(adminCo2, `gs://${bucket}`);

    await assertSucceeds(getMetadata(ref(storageCo1, 'companies/co1/applications/driverB/cdl-front/license.pdf')));
    await assertFails(getMetadata(ref(storageCo2, 'companies/co1/applications/driverB/cdl-front/license.pdf')));
  });

  it('allows metadata owner access for non-driver-keyed paths', async () => {
    const driverB = testEnv.authenticatedContext('driverB').app;
    const driverA = testEnv.authenticatedContext('driverA').app;
    const storageB = getStorage(driverB, `gs://${bucket}`);
    const storageA = getStorage(driverA, `gs://${bucket}`);

    await assertSucceeds(getMetadata(ref(storageB, 'companies/co1/leads/app123/dq_files/medical.pdf')));
    await assertFails(getMetadata(ref(storageA, 'companies/co1/leads/app123/dq_files/medical.pdf')));
  });
});

