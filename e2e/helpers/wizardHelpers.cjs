const { expect } = require('@playwright/test');

const pdfFile = (name) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8'),
});

async function fillDateTriplet(page, prefix, { month, day, year }) {
  await page.locator(`#${prefix}-year`).waitFor({ state: 'visible', timeout: 15_000 });
  await page.selectOption(`#${prefix}-year`, String(year));
  await page.selectOption(`#${prefix}-month`, String(month));
  await page.selectOption(`#${prefix}-day`, String(day));
  await expect(page.locator(`#${prefix}-year`)).toHaveValue(String(year));
}

async function fillStep1(page, suffix = '') {
  await page.fill('#first-name', `Test${suffix}`);
  await page.fill('#last-name', 'Driver');
  await page.fill('#ssn', '123-45-6789');
  await fillDateTriplet(page, 'dob', { month: 1, day: 1, year: 1990 });
  await page.fill('#phone', '5555551234');
  await page.fill('#email', `test${suffix || 'guest'}@example.com`);
  await page.fill('#street', '123 Main St');
  await page.fill('#city', 'Austin');
  await page.selectOption('#state', 'Texas');
  await page.fill('#zip', '78701');
  await page.click('label[for="sms-consent-yes"]');
  await page.click('label[for="residence-3-years-yes"]');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#step-title')).toContainText('Qualification', { timeout: 30_000 });
}

async function fillStep2(page) {
  await page.locator('label[for="legal-work-yes"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.click('label[for="legal-work-yes"]');
  await page.click('label[for="english-fluency-yes"]');
  await page.click('label[for="drug-test-positive-no"]');
  await page.click('label[for="dot-return-to-duty-yes"]');
  await page.click('label[for="experience-years-1"]');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#step-title')).toContainText('License', { timeout: 30_000 });
}

async function fillStep3RequiredFields(page) {
  await page.locator('#cdl-state').waitFor({ state: 'visible', timeout: 15_000 });
  await page.selectOption('#cdl-state', 'Texas');
  await page.getByLabel('Class A').click();
  await page.fill('#cdl-number', 'TX1234567');
  await fillDateTriplet(page, 'cdl-expiration', { month: 12, day: 31, year: 2030 });
  await page.click('label[for="has-other-licenses-no"]');
  await page.click('label[for="has-twic-no"]');
}

async function completeRemainingSteps(page) {
  await page.click('label[for="consent-mvr-yes"]');
  await page.click('label[for="revoked-licenses-no"]');
  await page.click('label[for="driving-convictions-no"]');
  await page.click('label[for="drug-alcohol-convictions-no"]');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.click('label[for="has-felony-no"]');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Confirm & Proceed' }).click();
}

async function applySignature(page) {
  for (const id of ['agree-electronic', 'agree-background-check']) {
    const box = page.locator(`#${id}`);
    if ((await box.count()) > 0) {
      await box.check();
    }
  }
  await page.getByRole('button', { name: 'Use Test Signature' }).click();
  await expect(page.getByText('Signature Saved & Locked')).toBeVisible();
}

async function submitApplication(page) {
  await page.check('#final-certification');
  await page.getByRole('button', { name: 'Submit Full Application' }).click();
}

module.exports = {
  pdfFile,
  fillDateTriplet,
  fillStep1,
  fillStep2,
  fillStep3RequiredFields,
  completeRemainingSteps,
  applySignature,
  submitApplication,
};
