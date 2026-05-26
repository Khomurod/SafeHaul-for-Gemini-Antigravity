const { test, expect } = require('@playwright/test');

test.describe('E-Doc recruiter send flow', () => {
  test.describe.configure({ timeout: 60_000 });

  test('company admin sends template and lands in signer handoff route', async ({ page }) => {
    await page.goto('/company/e-docs?e2eAuth=company_admin&e2eEdoc=mock');

    await expect(page.getByText(/Documents Center/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Templates/i }).click();

    await expect(page.getByText('E2E Test Document')).toBeVisible();
    await page.getByRole('button', { name: /^Use$/i }).click();

    await expect(page.getByRole('heading', { name: /Send Document/i })).toBeVisible();
    await page.getByPlaceholder('Recipient name *').fill('Taylor Recruiter');
    await page.getByPlaceholder('Email address').fill('taylor@example.com');
    await page.getByRole('button', { name: /Send Document/i }).click();

    await expect(page).toHaveURL(/\/sign\/e2e-company\/e2e-edoc-send-req\?token=.*e2eSign=mock/);
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 20_000 });
  });
});
