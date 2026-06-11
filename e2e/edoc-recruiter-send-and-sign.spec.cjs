const { test, expect } = require('@playwright/test');

test.describe('E-Doc recruiter send and public sign', () => {
  test.describe.configure({ timeout: 60_000 });

  test('company admin can open E-Docs workspace', async ({ page }) => {
    await page.goto('/company/e-docs?e2eAuth=company_admin');
    await expect(page.getByText(/E-Docs|Documents/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test('public signer completes mock signing room', async ({ page }) => {
    await page.goto('/sign/e2e-company/e2e-request?token=e2e-token&e2eSign=mock');
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /I Agree - Proceed to Sign/i }).click();
    await page.getByRole('button', { name: /Finish & Submit/i }).click();
    await expect(page.getByText('Document Signed!')).toBeVisible({ timeout: 15_000 });
  });

  test('mobile viewport routes to the guided card flow and submits', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/sign/e2e-company/e2e-request?token=e2e-token&e2eSign=mock');
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /I Agree - Proceed to Sign/i }).click();

    // On phones the public signing room renders the field-by-field guided flow
    // instead of stacking percent-positioned overlays on top of the PDF.
    await expect(page.getByText(/Step\s+1\s+of/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-field-id="check1"]')).toHaveCount(0);

    // E2E mock pre-fills every required field; tap through the cards until
    // the bottom action bar swaps Next for the submit button on the last field.
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: /^Next$/ }).click();
    }
    await page.getByRole('button', { name: /Finish & Submit/i }).click();
    await expect(page.getByText('Document Signed!')).toBeVisible({ timeout: 15_000 });
  });
});
