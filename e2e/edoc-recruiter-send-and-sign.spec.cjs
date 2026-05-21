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
});
