const { test, expect } = require('@playwright/test');

const pdfFile = (name) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8'),
});

async function fillStep1(page, suffix = '') {
  await page.fill('#first-name', `Test${suffix}`);
  await page.fill('#last-name', 'Driver');
  await page.fill('#ssn', '123-45-6789');
  await page.fill('#dob', '1990-01-01');
  await page.fill('#phone', '5555551234');
  await page.fill('#email', `test${suffix || 'guest'}@example.com`);
  await page.fill('#street', '123 Main St');
  await page.fill('#city', 'Austin');
  await page.selectOption('#state', 'Texas');
  await page.fill('#zip', '78701');
  await page.click('label[for="residence-3-years-yes"]');
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function fillStep2(page) {
  await page.click('label[for="legal-work-yes"]');
  await page.click('label[for="english-fluency-yes"]');
  await page.click('label[for="drug-test-positive-no"]');
  await page.click('label[for="dot-return-to-duty-yes"]');
  await page.click('label[for="experience-years-1"]');
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function fillStep3RequiredFields(page) {
  await page.selectOption('#cdl-state', 'Texas');
  await page.getByLabel('Class A').click();
  await page.fill('#cdl-number', 'TX1234567');
  await page.fill('#cdl-expiration', '2030-12-31');
  await page.click('label[for="has-other-licenses-no"]');
  await page.click('label[for="has-twic-no"]');
}

async function completeRemainingSteps(page) {
  await page.click('label[for="consent-mvr-yes"]');
  await page.click('label[for="revoked-licenses-no"]');
  await page.click('label[for="driving-convictions-no"]');
  await page.click('label[for="drug-alcohol-convictions-no"]');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Continue' }).click(); // Step 5
  await page.getByRole('button', { name: 'Continue' }).click(); // Step 6

  await page.click('label[for="has-felony-no"]');
  await page.getByRole('button', { name: 'Continue' }).click(); // Step 7

  await page.getByRole('button', { name: 'Confirm & Proceed' }).click(); // Step 8
}

async function applySignature(page) {
  await page.getByRole('button', { name: 'Use Test Signature' }).click();
  await expect(page.getByText('Signature Saved & Locked')).toBeVisible();
}

test('guest applicant can complete full submission with CDL and med card uploads', async ({ page }) => {
  await page.goto('/apply/e2e-company');
  await expect(page.locator('#step-title')).toHaveText('Step 1 of 9: Personal Information');

  await fillStep1(page, 'full');
  await fillStep2(page);
  await fillStep3RequiredFields(page);

  await page.setInputFiles('input[name="cdl-front"]', pdfFile('cdl-front.pdf'));
  await page.setInputFiles('input[name="cdl-back"]', pdfFile('cdl-back.pdf'));
  await page.setInputFiles('input[name="medical-card-upload"]', pdfFile('med-card.pdf'));
  await expect(page.getByText('Uploaded Successfully')).toHaveCount(3);

  await page.getByRole('button', { name: 'Continue' }).click();
  await completeRemainingSteps(page);
  await applySignature(page);

  await page.check('#final-certification');
  await page.getByRole('button', { name: 'Submit Full Application' }).click();

  await expect(page.getByText('Application Submitted!')).toBeVisible();
  await expect(page.getByText('Confirmation Number')).toBeVisible();
});

test('guest upload shows permission error when upload guard denies access', async ({ page }) => {
  await page.goto('/apply/e2e-company?e2eUpload=deny');
  await expect(page.locator('#step-title')).toHaveText('Step 1 of 9: Personal Information');

  await fillStep1(page, 'deny');
  await fillStep2(page);
  await fillStep3RequiredFields(page);

  await page.setInputFiles('input[name="cdl-front"]', pdfFile('blocked-cdl-front.pdf'));

  await expect(page.getByText('E2E upload blocked by mock permission guard.')).toBeVisible();
  await expect(page.getByRole('alert').getByText('Upload failed. Please try again.')).toBeVisible();
});
