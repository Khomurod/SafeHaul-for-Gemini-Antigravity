// E2E coverage for the migrated Super Admin data/ops views behind the navigation
// rail (`e2e/super-admin-shell.spec.cjs` covers the shell itself).
//
// Under `VITE_E2E_TEST_MODE=1` the app points Firestore at a closed local port,
// so every view reaches its *settled* empty/error state rather than hanging.
// That is deliberately the state asserted here: it is the one reachable without
// a backend, and it is exactly the state the migration had to make announced,
// accessible and non-overflowing. Row-level behaviour (populated tables,
// toggles, dialogs, callable payloads) is covered by the focused unit suites,
// which can supply data deterministically.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const SUPER_ADMIN_URL = '/super-admin?e2eAuth=super_admin';

/** Views reachable from the rail, with a stable landmark to wait on. */
const VIEWS = [
  { nav: 'Dashboard', expect: (page) => page.getByRole('heading', { name: 'Dashboard', level: 2 }) },
  { nav: 'Companies', expect: (page) => page.getByRole('heading', { name: 'Manage Companies' }) },
  { nav: 'Users', expect: (page) => page.getByRole('heading', { name: 'Manage All Users' }) },
  { nav: 'Unified Driver DB', expect: (page) => page.getByRole('heading', { name: 'Unified Driver Database' }) },
  { nav: 'Global Features', expect: (page) => page.getByRole('heading', { name: 'Company Feature Overrides' }) },
  { nav: 'SMS Integrations', expect: (page) => page.getByRole('heading', { name: 'SMS Integrations Hub' }) },
  { nav: 'Stats Backfill', expect: (page) => page.getByRole('heading', { name: 'Performance Stats Backfill' }) },
];

async function openShell(page) {
  await page.goto(SUPER_ADMIN_URL);
  await expect(page.getByRole('heading', { name: 'Super Admin', level: 1 })).toBeVisible({ timeout: 20_000 });
}

async function gotoView(page, navLabel) {
  const nav = page.getByRole('navigation', { name: 'Super Admin sections' });
  await nav.getByRole('button', { name: navLabel }).click();
}

async function expectNoHorizontalOverflow(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('Super Admin views', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const view of VIEWS) {
    test(`${view.nav} renders its settled state`, async ({ page }) => {
      await openShell(page);
      await gotoView(page, view.nav);
      await expect(view.expect(page)).toBeVisible({ timeout: 20_000 });
    });

    test(`${view.nav} has no serious or critical accessibility violations`, async ({ page }) => {
      await openShell(page);
      await gotoView(page, view.nav);
      await expect(view.expect(page)).toBeVisible({ timeout: 20_000 });

      const { violations } = await new AxeBuilder({ page }).include('main').analyze();
      const severe = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} [${v.impact}]`);
      expect(severe, `${view.nav} axe`).toEqual([]);
    });
  }

  test('every migrated view keeps exactly one h1 (the masthead)', async ({ page }) => {
    await openShell(page);
    for (const view of VIEWS) {
      await gotoView(page, view.nav);
      await expect(view.expect(page)).toBeVisible({ timeout: 20_000 });
      expect(await page.getByRole('heading', { level: 1 }).count(), `${view.nav} h1 count`).toBe(1);
    }
  });

  test('the Stats Backfill platform-wide run is confirmed before it fires', async ({ page }) => {
    let nativeDialogs = 0;
    page.on('dialog', async (d) => { nativeDialogs += 1; await d.dismiss(); });

    await openShell(page);
    await gotoView(page, 'Stats Backfill');
    await expect(page.getByRole('heading', { name: 'Performance Stats Backfill' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Run All Companies/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus must land inside, and Escape must dismiss without running anything.
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    expect(nativeDialogs, 'a native confirm/alert was used').toBe(0);
  });

  test('the Analytics tab strip is keyboard operable', async ({ page }) => {
    await openShell(page);
    await gotoView(page, 'Analytics');

    const tablist = page.getByRole('tablist', { name: 'Analytics views' });
    // Analytics needs its own hook to settle; skip cleanly if it never renders
    // in the offline environment rather than asserting something unreachable.
    const appeared = await tablist.isVisible().catch(() => false);
    test.skip(!appeared, 'Analytics requires data that is unreachable offline.');

    await page.getByRole('tab', { name: 'Activity Overview' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Company Performance' })).toHaveAttribute('aria-selected', 'true');
  });

  for (const { label, width, height } of [
    { label: '1440', width: 1440, height: 900 },
    { label: '1024', width: 1024, height: 768 },
    { label: '412', width: 412, height: 915 },
  ]) {
    test(`all migrated views fit ${label} px without document overflow`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith('mobile'), 'Explicit viewport sweep runs on the desktop lane.');
      await page.setViewportSize({ width, height });
      await openShell(page);

      for (const view of VIEWS) {
        await gotoView(page, view.nav);
        await expect(view.expect(page)).toBeVisible({ timeout: 20_000 });
        await expectNoHorizontalOverflow(page, `${label} ${view.nav}`);
      }
    });
  }

  test('all migrated views stay usable on a mobile device lane', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile device lane.');
    await openShell(page);

    for (const view of VIEWS) {
      await gotoView(page, view.nav);
      await expect(view.expect(page)).toBeVisible({ timeout: 20_000 });
      await expectNoHorizontalOverflow(page, `mobile ${view.nav}`);
    }
  });
});
