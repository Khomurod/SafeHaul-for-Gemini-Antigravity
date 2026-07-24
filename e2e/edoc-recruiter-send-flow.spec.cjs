const { test, expect } = require('@playwright/test');

test.describe('E-Doc recruiter send flow', () => {
  test.describe.configure({ timeout: 60_000 });

  test('company admin sends template and lands in signer handoff route', async ({ page }) => {
    await page.goto('/company/e-docs?e2eAuth=company_admin&e2eEdoc=mock');

    await expect(page.getByText(/Documents Center/i)).toBeVisible({ timeout: 20_000 });
    // The Documents Center views are an ARIA tab interface, and each template's
    // actions carry the template title so they are uniquely addressable. The
    // send flow itself is unchanged — only these selectors moved.
    await page.getByRole('tab', { name: /^Templates/ }).click();

    await expect(page.getByText('E2E Test Document')).toBeVisible();
    await page.getByRole('button', { name: 'Use E2E Test Document' }).click();

    await expect(page.getByRole('heading', { name: /Send Document/i })).toBeVisible();
    await page.getByPlaceholder('Recipient name *').fill('Taylor Recruiter');
    await page.getByPlaceholder('Email address').fill('taylor@example.com');
    await page.getByRole('button', { name: /Send Document/i }).click();

    await expect(page).toHaveURL(/\/sign\/e2e-company\/e2e-edoc-send-req\?token=.*e2eSign=mock/);
    await expect(page.getByText('E2E Test Document')).toBeVisible({ timeout: 20_000 });
  });
});
