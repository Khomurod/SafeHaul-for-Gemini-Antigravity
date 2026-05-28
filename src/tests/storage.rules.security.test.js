import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getMetadata, listAll, ref, uploadString } from 'firebase/storage';

const projectId = 'safehaul-storage-rules-test';
const bucket = `${projectId}.appspot.com`;
const storageRules = readFileSync(resolve(process.cwd(), 'src/storage.rules'), 'utf8');
const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
const hasStorageEmulator = storageEmulatorHost.includes(':');
const describeStorage = hasStorageEmulator ? describe : describe.skip;

let testEnv;
let runCounter = 0;
let paths;

function teamClaims(companyId, role = 'company_admin') {
  return {
    roles: { [companyId]: role },
    companyId,
    companyRole: role,
  };
}

function superAdminClaims() {
  return {
    globalRole: 'super_admin',
    roles: { globalRole: 'super_admin' },
  };
}

function authedStorage(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).storage(`gs://${bucket}`);
}

function guestStorage() {
  return testEnv.unauthenticatedContext().storage(`gs://${bucket}`);
}

function testPath(runId, relativePath) {
  return `security_rules_runs/${runId}/${relativePath}`;
}

function buildSeedPaths(runId) {
  return {
    co1DriverBLicense: testPath(runId, 'companies/co1/applications/driverB/cdl-front/license.pdf'),
    co1DriverBLeadDq: testPath(runId, 'companies/co1/leads/app123/dq_files/medical.pdf'),
    co1DriverBLeadGeneral: testPath(runId, 'companies/co1/leads/app123/general_documents/notes.pdf'),
    co1PevResult: testPath(runId, 'companies/co1/applications/app123/pev_results/PEV_report.pdf'),
    co1GuestSeed: testPath(runId, 'companies/co1/autofill/guest_uploads/seed.jpg'),
    co2DriverCLicense: testPath(runId, 'companies/co2/applications/driverC/cdl-front/license.pdf'),
    co1SecureTemplate: testPath(runId, 'secure_documents/co1/templates/seed.pdf'),
  };
}

async function deleteTree(folderRef) {
  const { items, prefixes } = await listAll(folderRef);
  await Promise.all(items.map((itemRef) => deleteObject(itemRef)));
  await Promise.all(prefixes.map((prefixRef) => deleteTree(prefixRef)));
}

async function clearTestBucket() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminStorage = context.storage(`gs://${bucket}`);
    await deleteTree(ref(adminStorage, ''));
  });
}

async function seedStorageData(seedPaths) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminStorage = context.storage(`gs://${bucket}`);
    await uploadString(
      ref(adminStorage, seedPaths.co1DriverBLicense),
      'seed-pdf',
      'raw',
      { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } },
    );
    await uploadString(
      ref(adminStorage, seedPaths.co1DriverBLeadDq),
      'seed-pdf',
      'raw',
      { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } },
    );
    await uploadString(
      ref(adminStorage, seedPaths.co1DriverBLeadGeneral),
      'seed-pdf',
      'raw',
      { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } },
    );
    await uploadString(
      ref(adminStorage, seedPaths.co1PevResult),
      'seed-pdf',
      'raw',
      { contentType: 'application/pdf', customMetadata: { driverId: 'driverB', companyId: 'co1' } },
    );
    await uploadString(
      ref(adminStorage, seedPaths.co1GuestSeed),
      'seed-image',
      'raw',
      { contentType: 'image/jpeg' },
    );
    await uploadString(
      ref(adminStorage, seedPaths.co2DriverCLicense),
      'seed-pdf',
      'raw',
      { contentType: 'application/pdf', customMetadata: { driverId: 'driverC', companyId: 'co2' } },
    );
    await uploadString(
      ref(adminStorage, seedPaths.co1SecureTemplate),
      'seed-pdf',
      'raw',
      { contentType: 'application/pdf' },
    );
  });
}

describeStorage('storage.rules security matrix (tenant isolation + permissive team model)', () => {
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
    runCounter += 1;
    paths = buildSeedPaths(runCounter);
    await clearTestBucket();
    await seedStorageData(paths);
  });

  it('allows guest upload in applications/autofill guest_uploads with valid file type', async () => {
    const guest = guestStorage();
    await assertSucceeds(
      uploadString(
        ref(guest, testPath(runCounter, 'companies/co1/applications/guest_uploads/upload-a.pdf')),
        'guest-pdf',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
    await assertSucceeds(
      uploadString(
        ref(guest, testPath(runCounter, 'companies/co1/autofill/guest_uploads/upload-b.jpg')),
        'guest-jpg',
        'raw',
        { contentType: 'image/jpeg' },
      ),
    );
  });

  it('blocks guest upload outside guest_uploads', async () => {
    const guest = guestStorage();
    await assertFails(
      uploadString(
        ref(guest, testPath(runCounter, 'companies/co1/applications/driverA/cdl-front/blocked.jpg')),
        'blocked',
        'raw',
        { contentType: 'image/jpeg' },
      ),
    );
  });

  it('blocks guest upload with invalid content type even inside guest_uploads', async () => {
    const guest = guestStorage();
    await assertFails(
      uploadString(
        ref(guest, testPath(runCounter, 'companies/co1/autofill/guest_uploads/invalid.txt')),
        'text',
        'raw',
        { contentType: 'text/plain' },
      ),
    );
  });

  it('keeps guest direct reads blocked for guest_uploads and secure_documents', async () => {
    const guest = guestStorage();
    await assertFails(getMetadata(ref(guest, paths.co1GuestSeed)));
    await assertFails(getMetadata(ref(guest, paths.co1SecureTemplate)));
  });

  it('allows driver to read/write/delete only inside own driver-keyed application path', async () => {
    const driverA = authedStorage('driverA');
    const ownPath = testPath(runCounter, 'companies/co1/applications/driverA/cdl-front/new-license.pdf');

    await assertSucceeds(
      uploadString(
        ref(driverA, ownPath),
        'driver-a-file',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
    await assertSucceeds(getMetadata(ref(driverA, ownPath)));
    await assertSucceeds(deleteObject(ref(driverA, ownPath)));
  });

  it('blocks driver from reading another driver file and cross-tenant file', async () => {
    const driverA = authedStorage('driverA');
    await assertFails(getMetadata(ref(driverA, paths.co1DriverBLicense)));
    await assertFails(getMetadata(ref(driverA, paths.co2DriverCLicense)));
  });

  it('blocks non-team drivers from non-driver-keyed company files (leads + pev)', async () => {
    const driverA = authedStorage('driverA');
    await assertFails(getMetadata(ref(driverA, paths.co1DriverBLeadDq)));
    await assertFails(getMetadata(ref(driverA, paths.co1DriverBLeadGeneral)));
    await assertFails(getMetadata(ref(driverA, paths.co1PevResult)));
  });

  it('allows company_admin same-company read/write/delete and blocks cross-tenant access', async () => {
    const co1Admin = authedStorage('admin-co1', teamClaims('co1', 'company_admin'));
    const co2Admin = authedStorage('admin-co2', teamClaims('co2', 'company_admin'));
    const adminUpload = testPath(runCounter, 'companies/co1/applications/driverB/cdl-front/admin-upload.pdf');

    await assertSucceeds(getMetadata(ref(co1Admin, paths.co1DriverBLicense)));
    await assertSucceeds(
      uploadString(
        ref(co1Admin, adminUpload),
        'admin-upload',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
    await assertSucceeds(deleteObject(ref(co1Admin, adminUpload)));

    await assertFails(getMetadata(ref(co2Admin, paths.co1DriverBLicense)));
    await assertFails(
      uploadString(
        ref(co2Admin, testPath(runCounter, 'companies/co1/applications/driverB/cdl-front/cross-tenant.pdf')),
        'cross-tenant',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
  });

  it('allows hr_user and recruiter same-company access, but blocks cross-tenant', async () => {
    const co1Hr = authedStorage('hr-co1', teamClaims('co1', 'hr_user'));
    const co1Recruiter = authedStorage('rec-co1', teamClaims('co1', 'recruiter'));
    const co2Hr = authedStorage('hr-co2', teamClaims('co2', 'hr_user'));

    await assertSucceeds(getMetadata(ref(co1Hr, paths.co1DriverBLicense)));
    await assertSucceeds(getMetadata(ref(co1Recruiter, paths.co1DriverBLeadDq)));
    await assertFails(getMetadata(ref(co2Hr, paths.co1DriverBLicense)));
  });

  it('allows team access to non-driver-keyed paths (leads + pev_results)', async () => {
    const co1Admin = authedStorage('admin-co1', teamClaims('co1', 'company_admin'));
    await assertSucceeds(getMetadata(ref(co1Admin, paths.co1DriverBLeadDq)));
    await assertSucceeds(getMetadata(ref(co1Admin, paths.co1DriverBLeadGeneral)));
    await assertSucceeds(getMetadata(ref(co1Admin, paths.co1PevResult)));
  });

  it('keeps secure_documents private from guests while allowing company team access', async () => {
    const guest = guestStorage();
    const co1Admin = authedStorage('admin-co1', teamClaims('co1', 'company_admin'));
    const secureWrite = testPath(runCounter, 'secure_documents/co1/templates/offer-letter.pdf');

    await assertFails(getMetadata(ref(guest, paths.co1SecureTemplate)));
    await assertSucceeds(
      uploadString(
        ref(co1Admin, secureWrite),
        'template-pdf',
        'raw',
        { contentType: 'application/pdf' },
      ),
    );
    await assertSucceeds(getMetadata(ref(co1Admin, secureWrite)));
  });

  it('allows super_admin cross-tenant reads for operational support', async () => {
    const superAdmin = authedStorage('super-admin-1', superAdminClaims());
    await assertSucceeds(getMetadata(ref(superAdmin, paths.co1DriverBLicense)));
    await assertSucceeds(getMetadata(ref(superAdmin, paths.co2DriverCLicense)));
  });
});

