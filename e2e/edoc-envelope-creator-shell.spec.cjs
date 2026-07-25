// E2E coverage for the EnvelopeCreator *shell* migration (sub-slice A): the top
// bar heading matrix, the creator-mode toggle, Cancel and the save action.
//
// The creator is opened from the Documents Center header, which needs no PDF, so
// this spec never touches upload, PDF rendering, field coordinates, zoom or
// drag/drop — those belong to later sub-slices and are deliberately not
// exercised here. No document is saved: the save action is only inspected, never
// activated, so no Firestore/Storage write is attempted.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const URL = '/company/e-docs?e2eAuth=company_admin&e2eEdoc=mock';

async function openCreator(page, action) {
  await page.goto(URL);
  await expect(page.getByText(/Documents Center/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: action }).click();
}

test.describe('E-Doc envelope creator shell slice', () => {
  test.describe.configure({ timeout: 90_000 });

  test('opens in one-off mode with the frozen heading and save label', async ({ page }) => {
    await openCreator(page, /Send One-off/);

    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Send Document' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('opens in template mode with the frozen heading', async ({ page }) => {
    await openCreator(page, /Create Template/);

    await expect(page.getByRole('heading', { name: 'Create Template' })).toBeVisible({ timeout: 15_000 });
    const group = page.getByRole('group', { name: 'Creator mode' });
    await expect(group.getByRole('button', { name: 'Save Template' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('switches creator mode with a programmatic pressed state', async ({ page }) => {
    await openCreator(page, /Send One-off/);
    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });

    const group = page.getByRole('group', { name: 'Creator mode' });
    const oneOff = group.getByRole('button', { name: 'One-off Send' });
    const template = group.getByRole('button', { name: 'Save Template' });

    await expect(oneOff).toHaveAttribute('aria-pressed', 'true');
    await template.click();
    await expect(template).toHaveAttribute('aria-pressed', 'true');
    await expect(oneOff).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { name: 'Create Template' })).toBeVisible();

    await oneOff.click();
    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible();
  });

  test('cancel returns to the Documents Center', async ({ page }) => {
    await openCreator(page, /Send One-off/);
    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Documents Center/i)).toBeVisible();
  });

  test('keeps the top bar keyboard reachable with visible focus', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop keyboard behavior.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCreator(page, /Send One-off/);
    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });

    const cancel = page.getByRole('button', { name: 'Cancel' });
    await cancel.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();

    const focus = await cancel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { boxShadow: s.boxShadow, outline: s.outlineStyle };
    });
    expect(focus.boxShadow !== 'none' || focus.outline !== 'none').toBe(true);
  });

  test('does not overflow the document at desktop/tablet/mobile', async ({ page }, testInfo) => {
    const widths = testInfo.project.name.startsWith('mobile') ? [412] : [1440, 1024];
    await page.setViewportSize({ width: widths[0], height: widths[0] === 412 ? 915 : 900 });
    await openCreator(page, /Send One-off/);
    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });

    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 900 });
      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
    }
  });

  test('has no serious/critical or contrast violations in the top bar', async ({ page }) => {
    await openCreator(page, /Send One-off/);
    await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });

    // Scoped to the migrated shell top bar. The sidebar, PDF workbench and
    // properties rail are later sub-slices and still carry legacy markup.
    const { violations } = await new AxeBuilder({ page }).include('.z-20').analyze();
    const serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
    expect(serious).toEqual([]);
    expect(violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
  });
});
