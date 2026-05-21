const { test, expect } = require('@playwright/test');
const {
  fillStep1,
  fillStep2,
  fillStep3RequiredFields,
  pdfFile,
  completeRemainingSteps,
  applySignature,
  submitApplication,
} = require('./helpers/wizardHelpers.cjs');

test.describe('guest post-application E-Doc', () => {
  test.describe.configure({ timeout: 90_000 });

  test('opens signing room from post-submit template button', async ({ page }) => {
    await page.goto('/apply/e2e-company');
    await fillStep1(page, 'post');
    await fillStep2(page);
    await fillStep3RequiredFields(page);
    await page.setInputFiles('input[name="cdl-front"]', pdfFile('cdl-front.pdf'));
    await page.setInputFiles('input[name="cdl-back"]', pdfFile('cdl-back.pdf'));
    await page.setInputFiles('input[name="medical-card-upload"]', pdfFile('med-card.pdf'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await completeRemainingSteps(page);
    await applySignature(page);
    await submitApplication(page);

    await expect(page.getByText('Application Submitted!')).toBeVisible();
    await page.getByRole('button', { name: /Post-Application Form/i }).click();

    await expect(page).toHaveURL(/\/sign\/e2e-company\/e2e-post-app-req\?token=/);
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /I Agree - Proceed to Sign/i }).click();
    await page.getByRole('button', { name: /Finish & Submit/i }).click();
    await expect(page.getByText('Document Signed!')).toBeVisible({ timeout: 15_000 });
  });
});
