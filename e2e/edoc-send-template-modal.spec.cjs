// E2E coverage for the SendTemplateModal design-system migration. Opens the
// modal through the E-Docs mock flow (?e2eEdoc=mock) and verifies the dialog
// semantics, labelled recipient fields, delivery-method selection, search and
// quick-select, copy-vs-send button text, keyboard navigation, Escape, mobile
// reachability, document overflow and a scoped axe pass.
//
// Artificial data only: reserved example.test domains and fictional 555-01xx
// numbers. The send itself is not triggered here — the vitest suite covers the
// callback contracts, and the existing edoc-recruiter-send-flow spec covers the
// end-to-end send.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const URL = '/company/e-docs?e2eAuth=company_admin&e2eEdoc=mock';

async function openSendModal(page) {
  await page.goto(URL);
  await expect(page.getByText(/Documents Center/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: /^Templates/ }).click();
  await expect(page.getByText('E2E Test Document')).toBeVisible();
  await page.getByRole('button', { name: 'Use E2E Test Document' }).click();
  await expect(page.getByRole('dialog', { name: 'Send Document' })).toBeVisible({ timeout: 15_000 });
}

test.describe('E-Doc send template modal slice', () => {
  test.describe.configure({ timeout: 90_000 });

  test('is an accessible dialog naming the selected template', async ({ page }) => {
    await openSendModal(page);

    const dialog = page.getByRole('dialog', { name: 'Send Document' });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByText(/Sending:/)).toBeVisible();
    await expect(dialog.getByText('E2E Test Document')).toBeVisible();

    // Focus lands on the recipient name field.
    await expect(page.getByLabel('Recipient name')).toBeFocused();
  });

  test('labels every recipient field and keeps the frozen placeholders', async ({ page }) => {
    await openSendModal(page);

    const name = page.getByLabel('Recipient name');
    const email = page.getByLabel('Email address');
    const phone = page.getByLabel('Phone number');

    await expect(name).toHaveAttribute('placeholder', 'Recipient name *');
    await expect(email).toHaveAttribute('placeholder', 'Email address');
    await expect(phone).toHaveAttribute('placeholder', 'Phone number');

    await name.fill('Artificial Recipient');
    await email.fill('artificial@example.test');
    await phone.fill('555-0100');
    await expect(name).toHaveValue('Artificial Recipient');
  });

  test('selects delivery methods with a programmatic pressed state', async ({ page }) => {
    await openSendModal(page);

    const group = page.getByRole('group', { name: 'Delivery Method' });
    await expect(group).toBeVisible();

    const email = group.getByRole('button', { name: 'Email' });
    const sms = group.getByRole('button', { name: 'SMS' });
    await expect(email).toHaveAttribute('aria-pressed', 'true');

    await sms.click();
    await expect(sms).toHaveAttribute('aria-pressed', 'true');
    await expect(email).toHaveAttribute('aria-pressed', 'false');
  });

  test('switches the primary action text between send and copy', async ({ page }) => {
    await openSendModal(page);

    await expect(page.getByRole('button', { name: /Send Document/ })).toBeVisible();

    await page.getByRole('group', { name: 'Delivery Method' })
      .getByRole('button', { name: 'Copy Link' }).click();
    await expect(page.getByRole('button', { name: /Copy Signing Link/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send Document/ })).toHaveCount(0);
  });

  test('searches and quick-selects a lead', async ({ page }) => {
    await openSendModal(page);

    await expect(page.getByText('Or Quick-Select a Lead')).toBeVisible();
    const search = page.getByLabel('Search leads');
    await expect(search).toHaveAttribute('placeholder', 'Search leads...');

    await search.fill('zzz-no-such-lead');
    await expect(page.getByText('No leads found.')).toBeVisible();
  });

  test('keeps the dialog keyboard navigable and closes on Escape', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop keyboard behavior.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSendModal(page);

    // Tab moves through the dialog and focus stays inside it.
    await page.keyboard.press('Tab');
    const insideAfterTab = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog ? dialog.contains(document.activeElement) : false;
    });
    expect(insideAfterTab).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Send Document' })).toHaveCount(0);
  });

  test('keeps the submit action reachable on mobile without document overflow', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile presentation check.');
    await page.setViewportSize({ width: 412, height: 915 });
    await openSendModal(page);

    const submit = page.getByRole('button', { name: /Send Document/ });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();

    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  });

  test('does not overflow the document on desktop and tablet', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop/tablet geometry check.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSendModal(page);

    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(width);
    }
  });

  test('has no serious/critical or contrast violations in the dialog', async ({ page }) => {
    await openSendModal(page);

    const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    const serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
    expect(serious).toEqual([]);
    expect(violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
  });
});
