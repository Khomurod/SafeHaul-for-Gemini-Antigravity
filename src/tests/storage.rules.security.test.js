import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getMetadata, ref, uploadString } from 'firebase/storage';

const projectId = 'safehaul-storage-rules-test';
const bucket = `${projectId}.appspot.com`;
const storageRules = readFileSync(resolve(process.cwd(), 'src/storage.rules'), 'utf8');
const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
const hasStorageEmulator = storageEmulatorHost.includes(':');
const describeStorage = hasStorageEmulator ? describe : describe.skip;

let testEnv;

function companyAdminClaims(companyId) {
  return {
    roles: { [companyId]: 'company_admin' },
    companyId,
    companyRole: 'company_admin',
  };
}

describeStorage('storage.rules multi-tenant isolation', () => {
  beforeAll(async () => {
    const [host, portStr] = storageEmulatorHost.split(':');
    testEnv = await initializeTestEnvironment({
      projectId,
      storage: { rules: storageRules, host, port: Number(portStr) },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminStorage = context.storage(`gs://${bucket}`);
      await uploadString(
        ref(adminStorage, 'companies/co1/applications/driverB/cdl-front/license.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } }
      );
      await uploadString(
        ref(adminStorage, 'companies/co2/applications/driverC/cdl-front/license.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverC', companyId: 'co2' } }
      );
      await uploadString(
        ref(adminStorage, 'companies/co1/leads/app123/dq_files/medical.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } }
      );
      await uploadString(
        ref(adminStorage, 'companies/co1/leads/app123/general_documents/notes.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } }
      );
      await uploadString(
        ref(adminStorage, 'companies/co1/applications/app123/pev_results/PEV_report.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } }
      );
      await uploadString(
        ref(adminStorage, 'companies/co1/autofill/guest_uploads/seed.jpg'),
        'seed-image',
        'raw',
        { contentType: 'image/jpeg' }
      );
      await uploadString(
        ref(adminStorage, 'secure_documents/co1/templates/seed.pdf'),
        'seed-pdf',
        'raw',
        { contentType: 'application/pdf' }
      );
    });
  });

  it('allows Driver A to write own file but blocks reads to Driver B file', async () => {
    const storageA = testEnv.authenticatedContext('driverA').storage(`gs://${bucket}`);

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
    const storageCo1 = testEnv.authenticatedContext('admin-co1', {
      ...companyAdminClaims('co1'),
    }).storage(`gs://${bucket}`);
    const storageCo2 = testEnv.authenticatedContext('admin-co2', {
      ...companyAdminClaims('co2'),
    }).storage(`gs://${bucket}`);

    await assertSucceeds(getMetadata(ref(storageCo1, 'companies/co1/applications/driverB/cdl-front/license.pdf')));
    await assertFails(getMetadata(ref(storageCo2, 'companies/co1/applications/driverB/cdl-front/license.pdf')));
  });

  it('allows metadata owner access for non-driver-keyed paths', async () => {
    const storageB = testEnv.authenticatedContext('driverB').storage(`gs://${bucket}`);
    const storageA = testEnv.authenticatedContext('driverA').storage(`gs://${bucket}`);
    const storageAdmin = testEnv.authenticatedContext('admin-co1', {
      ...companyAdminClaims('co1'),
    }).storage(`gs://${bucket}`);

    await assertSucceeds(getMetadata(ref(storageB, 'companies/co1/leads/app123/dq_files/medical.pdf')));
    await assertFails(getMetadata(ref(storageA, 'companies/co1/leads/app123/dq_files/medical.pdf')));
    await assertSucceeds(getMetadata(ref(storageAdmin, 'companies/co1/leads/app123/dq_files/medical.pdf')));
  });

  it('allows unauthenticated guest write without App Check to guest_uploads', async () => {
    const guestStorage = testEnv.unauthenticatedContext().storage(`gs://${bucket}`);

    await assertSucceeds(
      uploadString(
        ref(guestStorage, 'companies/co1/autofill/guest_uploads/scan.jpg'),
        'fake-image-content',
        'raw',
        { contentType: 'image/jpeg' }
      )
    );
  });

  it('blocks unauthenticated read of guest_uploads', async () => {
    const guestStorage = testEnv.unauthenticatedContext().storage(`gs://${bucket}`);

    await assertFails(
      getMetadata(ref(guestStorage, 'companies/co1/applications/guest_uploads/secret.pdf'))
    );
  });

  it('allows company admin read/write on secure_documents templates', async () => {
    const storageCo1 = testEnv.authenticatedContext('admin-co1', {
      ...companyAdminClaims('co1'),
    }).storage(`gs://${bucket}`);

    await assertSucceeds(
      uploadString(
        ref(storageCo1, 'secure_documents/co1/templates/offer-letter.pdf'),
        'template-pdf',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
    await assertSucceeds(getMetadata(ref(storageCo1, 'secure_documents/co1/templates/offer-letter.pdf')));
  });

  it('blocks unauthenticated read of secure_documents', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminStorage = context.storage(`gs://${bucket}`);
      await uploadString(
        ref(adminStorage, 'secure_documents/co1/templates/seed.pdf'),
        'seed',
        'raw',
        { contentType: 'application/pdf' },
      );
    });

    const guestStorage = testEnv.unauthenticatedContext().storage(`gs://${bucket}`);

    await assertFails(getMetadata(ref(guestStorage, 'secure_documents/co1/templates/seed.pdf')));
  });

  it('blocks unauthenticated guest write outside guest_uploads', async () => {
    const guestStorage = testEnv.unauthenticatedContext().storage(`gs://${bucket}`);

    await assertFails(
      uploadString(
        ref(guestStorage, 'companies/co1/applications/driverA/cdl-front/blocked.jpg'),
        'fake-image-content',
        'raw',
        { contentType: 'image/jpeg' }
      )
    );
  });

  it('allows same-company admin read/write/delete on application files', async () => {
    const storageCo1 = testEnv.authenticatedContext('admin-co1', {
      ...companyAdminClaims('co1'),
    }).storage(`gs://${bucket}`);

    await assertSucceeds(
      getMetadata(ref(storageCo1, 'companies/co1/applications/driverB/cdl-front/license.pdf'))
    );
    await assertSucceeds(
      uploadString(
        ref(storageCo1, 'companies/co1/applications/driverB/cdl-front/admin-upload.pdf'),
        'admin-upload',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
  });

  it('blocks cross-tenant admin write on foreign company application files', async () => {
    const storageCo2 = testEnv.authenticatedContext('admin-co2', {
      ...companyAdminClaims('co2'),
    }).storage(`gs://${bucket}`);

    await assertFails(
      uploadString(
        ref(storageCo2, 'companies/co1/applications/driverB/cdl-front/cross-tenant.pdf'),
        'cross-tenant',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
  });

  it('blocks non-owner drivers from reading another company application files', async () => {
    const storageDriverA = testEnv.authenticatedContext('driverA').storage(`gs://${bucket}`);
    await assertFails(
      getMetadata(ref(storageDriverA, 'companies/co2/applications/driverC/cdl-front/license.pdf'))
    );
  });

  it('allows owner metadata read and blocks non-owner on lead dq_files', async () => {
    const storageOwner = testEnv.authenticatedContext('driverB').storage(`gs://${bucket}`);
    const storageOther = testEnv.authenticatedContext('driverA').storage(`gs://${bucket}`);

    await assertSucceeds(getMetadata(ref(storageOwner, 'companies/co1/leads/app123/dq_files/medical.pdf')));
    await assertFails(getMetadata(ref(storageOther, 'companies/co1/leads/app123/dq_files/medical.pdf')));
  });

  it('allows company admin access to pev_results and blocks non-admin drivers', async () => {
    const storageAdmin = testEnv.authenticatedContext('admin-co1', {
      ...companyAdminClaims('co1'),
    }).storage(`gs://${bucket}`);
    const storageDriverA = testEnv.authenticatedContext('driverA').storage(`gs://${bucket}`);

    await assertSucceeds(
      getMetadata(ref(storageAdmin, 'companies/co1/applications/app123/pev_results/PEV_report.pdf'))
    );
    await assertFails(
      getMetadata(ref(storageDriverA, 'companies/co1/applications/app123/pev_results/PEV_report.pdf'))
    );
  });

  it('allows metadata owner read for non-dq file categories', async () => {
    const storageOwner = testEnv.authenticatedContext('driverB').storage(`gs://${bucket}`);
    await assertSucceeds(
      getMetadata(ref(storageOwner, 'companies/co1/leads/app123/general_documents/notes.pdf'))
    );
  });
});

