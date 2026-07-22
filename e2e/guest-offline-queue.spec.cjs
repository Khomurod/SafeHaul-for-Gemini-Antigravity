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

test.describe('guest offline queue submit', () => {
  test.describe.configure({ timeout: 90_000 });

  test('shows queued message when forced queue mode on final submit', async ({ page, context }) => {
    await page.goto('/apply/e2e-company?e2eForceQueue=1');
    await expect(page.locator('#step-title')).toHaveText('Step 1 of 9: Personal Information', {
      timeout: 30_000,
    });

    await fillStep1(page, 'queue');
    await fillStep2(page);
    await fillStep3RequiredFields(page);
    await page.setInputFiles('input[name="cdl-front"]', pdfFile('cdl-front.pdf'));
    await page.setInputFiles('input[name="cdl-back"]', pdfFile('cdl-back.pdf'));
    await page.setInputFiles('input[name="medical-card-upload"]', pdfFile('med-card.pdf'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await completeRemainingSteps(page);
    await applySignature(page);

    await context.setOffline(true);
    await submitApplication(page);
    await expect(page.getByText('Application Saved')).toBeVisible({ timeout: 15_000 });
  });
});
