const { test, expect } = require('@playwright/test');
const {
  fillStep1,
  fillStep2,
  fillStep3RequiredFields,
  pdfFile,
  completeRemainingSteps,
  applySignature,
} = require('./helpers/wizardHelpers.cjs');

test.describe('guest application submit guard', () => {
  test.describe.configure({ timeout: 90_000 });

  test('disables submit after first click in e2e mode', async ({ page }) => {
    await page.goto('/apply/e2e-company');
    await fillStep1(page, 'dbl');
    await fillStep2(page);
    await fillStep3RequiredFields(page);
    await page.setInputFiles('input[name="cdl-front"]', pdfFile('cdl-front.pdf'));
    await page.setInputFiles('input[name="cdl-back"]', pdfFile('cdl-back.pdf'));
    await page.setInputFiles('input[name="medical-card-upload"]', pdfFile('med-card.pdf'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await completeRemainingSteps(page);
    await applySignature(page);
    await page.check('#final-certification');

    const submitBtn = page.getByRole('button', { name: /Submit Full Application/i });
    await submitBtn.click({ clickCount: 3, delay: 50 });
    await expect(page.getByText('Application Submitted!')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Application Submitted!')).toHaveCount(1);
  });
});
