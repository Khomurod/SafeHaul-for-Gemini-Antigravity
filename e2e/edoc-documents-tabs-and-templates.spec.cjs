// E2E coverage for the Documents Center tab interface and the Templates panel.
// The e2eEdoc=mock harness seeds one artificial template ("E2E Test Document"),
// so the template card and its actions can be exercised in a real browser
// without touching Firestore. No real template, recipient or signing data is
// loaded, and nothing here opens a send.
//
// The exact callbacks, ordering rules, required defaults and messages are
// covered by the vitest suites for DocumentsManager and TemplatesPanel.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const URL = '/company/e-docs?e2eAuth=company_admin&e2eEdoc=mock';

async function openDocuments(page) {
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Documents Center' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tablist', { name: 'Document Center views' })).toBeVisible();
}

function historyTab(page) {
  return page.getByRole('tab', { name: /^History/ });
}

function templatesTab(page) {
  return page.getByRole('tab', { name: /^Templates/ });
}

test.describe('E-Doc Documents Center tabs and templates', () => {
  test.describe.configure({ timeout: 90_000 });

  test('starts on History and switches panels through the tab interface', async ({ page }) => {
    await openDocuments(page);

    await expect(historyTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: /^Document history\./ })).toBeVisible();

    await templatesTab(page).click();
    await expect(templatesTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Post-Application Success Page Forms' })).toBeVisible();

    await historyTab(page).click();
    await expect(historyTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: /^Document history\./ })).toBeVisible();
  });

  test('drives the tabs from the keyboard with focus following selection', async ({ page }) => {
    await openDocuments(page);

    await historyTab(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(templatesTab(page)).toBeFocused();
    await expect(templatesTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toBeVisible();

    await page.keyboard.press('Home');
    await expect(historyTab(page)).toBeFocused();
    await expect(historyTab(page)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('End');
    await expect(templatesTab(page)).toBeFocused();
    await expect(templatesTab(page)).toHaveAttribute('aria-selected', 'true');
  });

  test('connects each tab to the rendered panel', async ({ page }) => {
    await openDocuments(page);
    const panel = page.getByRole('tabpanel');
    const panelId = await panel.getAttribute('id');

    await expect(historyTab(page)).toHaveAttribute('aria-controls', panelId);
    await expect(templatesTab(page)).toHaveAttribute('aria-controls', panelId);
    await expect(panel).toHaveAttribute('aria-labelledby', String(await historyTab(page).getAttribute('id')));
  });

  test('shows the template card actions without hover', async ({ page }) => {
    await openDocuments(page);
    await templatesTab(page).click();

    // The mock harness seeds exactly one artificial template.
    await expect(page.getByRole('button', { name: 'Delete E2E Test Document' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use E2E Test Document' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit E2E Test Document' })).toBeVisible();
    await expect(page.getByText('2 Fields')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Show on post-submit success page/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Forms/ })).toBeEnabled();
    await expect(page.getByText('No follow-up forms enabled yet.')).toBeVisible();
  });

  test('does not overflow the document at desktop/tablet/mobile', async ({ page }, testInfo) => {
    const widths = testInfo.project.name.startsWith('mobile') ? [412] : [1440, 1024];
    await page.setViewportSize({ width: widths[0], height: widths[0] === 412 ? 915 : 900 });
    await openDocuments(page);
    await templatesTab(page).click();
    await expect(page.getByRole('button', { name: 'Use E2E Test Document' })).toBeVisible();

    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 412 ? 915 : 900 });
      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
      // The tabs stay operable at every width.
      await expect(templatesTab(page)).toBeVisible();
      await expect(historyTab(page)).toBeVisible();
    }
  });

  test('has no serious/critical or contrast violations on either tab', async ({ page }) => {
    await openDocuments(page);

    const check = async () => {
      const { violations } = await new AxeBuilder({ page }).include('[role="tablist"]').include('[role="tabpanel"]').analyze();
      return violations;
    };

    let violations = await check();
    let serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
    expect(serious).toEqual([]);
    expect(violations.filter((v) => v.id === 'color-contrast')).toEqual([]);

    await templatesTab(page).click();
    await expect(page.getByRole('button', { name: 'Use E2E Test Document' })).toBeVisible();

    violations = await check();
    serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
    expect(serious).toEqual([]);
    expect(violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
  });
});
