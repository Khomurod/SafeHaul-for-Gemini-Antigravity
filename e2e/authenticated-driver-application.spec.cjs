const { test, expect } = require('@playwright/test');
const {
  pdfFile,
  fillStep1,
  fillStep2,
  fillStep3RequiredFields,
  completeRemainingSteps,
  applySignature,
  submitApplication,
} = require('./helpers/wizardHelpers.cjs');

test.describe('authenticated driver application', () => {
  test.describe.configure({ timeout: 90_000 });

  test('driver completes application at /driver/apply with E2E auth', async ({ page }) => {
    await page.goto('/driver/apply/e2e-company?e2eAuth=driver');
    await expect(page.locator('#step-title')).toHaveText('Step 1 of 9: Personal Information', {
      timeout: 30_000,
    });

    await fillStep1(page, 'auth');
    await fillStep2(page);
    await fillStep3RequiredFields(page);

    await page.setInputFiles('input[name="cdl-front"]', pdfFile('cdl-front.pdf'));
    await page.setInputFiles('input[name="cdl-back"]', pdfFile('cdl-back.pdf'));
    await page.setInputFiles('input[name="medical-card-upload"]', pdfFile('med-card.pdf'));
    await expect.poll(async () => page.getByText('Uploaded Successfully').count()).toBeGreaterThanOrEqual(3);

    await page.getByRole('button', { name: 'Continue' }).click();
    await completeRemainingSteps(page);
    await applySignature(page);
    await submitApplication(page);

    await expect(page.getByText('Application Submitted!')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/driver\/dashboard/, { timeout: 15_000 });
  });

  test('draft recovery modal appears after reload when draft exists in E2E', async ({ page }) => {
    await page.goto('/driver/apply/e2e-company?e2eAuth=driver');
    await fillStep1(page, 'draft');
    await page.waitForTimeout(600);

    await page.reload();
    await expect(page.getByText(/Welcome Back/i)).toBeVisible({ timeout: 15_000 });
  });
});
