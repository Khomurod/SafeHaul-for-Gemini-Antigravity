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

  test('mobile viewport field overlays respect percent width not 44px minimum', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/sign/e2e-company/e2e-request?token=e2e-token&e2eSign=mock');
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /I Agree - Proceed to Sign/i }).click();

    const checkboxOverlay = page.locator('[data-field-id="check1"]');
    await expect(checkboxOverlay).toBeVisible({ timeout: 10_000 });

    const box = await checkboxOverlay.boundingBox();
    const pageBox = await page.locator('.inline-block').first().boundingBox();
    expect(box).toBeTruthy();
    expect(pageBox).toBeTruthy();

    const widthRatio = box.width / pageBox.width;
    expect(widthRatio).toBeLessThan(0.08);
    expect(widthRatio).toBeGreaterThan(0.02);
  });
});
