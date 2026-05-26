const { test, expect } = require('@playwright/test');

test.describe('PEV portal response UX', () => {
  test.describe.configure({ timeout: 60_000 });

  test('public employer can complete verification response in E2E mock mode', async ({ page }) => {
    await page.goto('/verify/e2e-token-1?e2eVerify=mock');

    await expect(page.getByRole('heading', { name: /Previous Employment Verification/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/E2E Driver/i)).toBeVisible();

    await page.getByRole('button', { name: /Submit Verification Response/i }).click();
    await expect(page.getByText(/Please fix the following errors/i)).toBeVisible();

    await page.getByText('No / No Record Found').click();
    await page.getByPlaceholder('e.g., John Smith').fill('Alex Employer');
    await page.getByPlaceholder('e.g., Safety Director, HR Manager').fill('HR Director');
    await page.getByPlaceholder('(555) 123-4567').fill('555-111-2222');
    await page.getByRole('button', { name: /Use Test Signature/i }).click();

    await page.getByRole('button', { name: /Submit Verification Response/i }).click();
    await expect(page.getByText(/Verification Submitted Successfully/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/A PDF record has been generated/i)).toBeVisible();
  });
});
