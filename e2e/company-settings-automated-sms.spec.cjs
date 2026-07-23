const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const SETTINGS_URL = '/company/settings?e2eAuth=company_admin';

// The tab gates its whole render behind a Firestore read. In the offline E2E
// environment (placeholder project, no emulator) that read rejects with
// `unavailable` only after the SDK's offline-detection delay, which then clears
// the loading state and renders the form. That settle can take ~20s, so the
// wait for the loaded form is intentionally generous. This gating is the
// existing, preserved behavior — not introduced by the design-system migration.
const FORM_TIMEOUT = 90_000;

async function selectAutomatedSms(page) {
  await page.goto(SETTINGS_URL);
  await page.getByRole('button', { name: 'Automated SMS' }).click();
  await expect(page.getByTestId('automated-sms-settings')).toBeVisible();
}

async function openLoadedForm(page) {
  await selectAutomatedSms(page);
  await expect(page.getByRole('textbox', { name: 'Contact Attempt 1' }))
    .toBeVisible({ timeout: FORM_TIMEOUT });
}

test.describe('Company Settings Automated SMS compatibility slice', () => {
  test.describe.configure({ timeout: 120_000 });

  test('announces an accessible loading status while templates load', async ({ page }) => {
    await selectAutomatedSms(page);
    await expect(page.getByRole('status')).toContainText('Loading');
  });

  test('shows three labelled templates and the save action on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile'), 'Desktop presentation check.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLoadedForm(page);

    const region = page.getByRole('region', { name: 'Automated SMS' });
    await expect(region.getByRole('heading', { level: 2, name: 'Automated SMS' })).toBeVisible();

    const one = region.getByRole('textbox', { name: 'Contact Attempt 1' });
    const two = region.getByRole('textbox', { name: 'Contact Attempt 2' });
    const three = region.getByRole('textbox', { name: 'Contact Attempt 3' });
    await expect(one).toBeVisible();
    await expect(two).toBeVisible();
    await expect(three).toBeVisible();

    const save = region.getByRole('button', { name: 'Save templates' });
    await expect(save).toBeVisible();
    const saveHeight = await save.evaluate((el) => el.getBoundingClientRect().height);
    expect(saveHeight).toBeGreaterThanOrEqual(44);

    // Logical keyboard order: the three templates then the save action.
    await one.focus();
    await page.keyboard.press('Tab');
    await expect(two).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(three).toBeFocused();

    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test('keeps tablet layout free of document or nested horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile'), 'Tablet geometry check.');
    await page.setViewportSize({ width: 1024, height: 768 });
    await openLoadedForm(page);

    const geometry = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="company-settings-shell"]');
      const content = document.querySelector('#company-settings-content');
      const textareas = [...document.querySelectorAll(
        '[data-testid="automated-sms-settings"] .ds-form-control',
      )];
      const labels = [...document.querySelectorAll(
        '[data-testid="automated-sms-settings"] .ds-label',
      )];
      const nestedHorizontalScrollers = [...(shell?.querySelectorAll('*') || [])]
        .filter((element) => {
          const overflowX = getComputedStyle(element).overflowX;
          return ['auto', 'scroll'].includes(overflowX)
            && element.scrollWidth > element.clientWidth + 1;
        });

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        contentClientWidth: content?.clientWidth,
        contentScrollWidth: content?.scrollWidth,
        textareaCount: textareas.length,
        labelCount: labels.length,
        minimumTextareaHeight: Math.min(...textareas.map((t) => t.getBoundingClientRect().height)),
        allLabelsAlign: textareas.every((t, index) => (
          Math.abs(t.getBoundingClientRect().left - labels[index].getBoundingClientRect().left) < 1
        )),
        nestedHorizontalScrollerCount: nestedHorizontalScrollers.length,
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.contentScrollWidth).toBeLessThanOrEqual(geometry.contentClientWidth);
    expect(geometry.textareaCount).toBe(3);
    expect(geometry.labelCount).toBe(3);
    expect(geometry.minimumTextareaHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.allLabelsAlign).toBe(true);
    expect(geometry.nestedHorizontalScrollerCount).toBe(0);
  });

  test('uses a single-column mobile layout with wrapping and no overflow', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile presentation check.');
    await page.setViewportSize({ width: 412, height: 915 });
    await openLoadedForm(page);

    const geometry = await page.evaluate(() => {
      const section = document.querySelector('[data-testid="automated-sms-settings"]');
      const textareas = [...section.querySelectorAll('.ds-form-control')];
      const save = [...document.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Save templates');

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        sectionRight: Math.round(section.getBoundingClientRect().right),
        minimumTextareaWidth: Math.min(...textareas.map((t) => t.getBoundingClientRect().width)),
        minimumTextareaHeight: Math.min(...textareas.map((t) => t.getBoundingClientRect().height)),
        saveHeight: save ? save.getBoundingClientRect().height : 0,
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.sectionRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.minimumTextareaWidth).toBeGreaterThan(250);
    expect(geometry.minimumTextareaHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.saveHeight).toBeGreaterThanOrEqual(44);
  });

  test('has no serious or critical accessibility violations in the loaded form', async ({ page }) => {
    await openLoadedForm(page);

    const { violations } = await new AxeBuilder({ page })
      .include('#company-settings-content')
      .analyze();
    const severe = violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .flatMap((violation) => violation.nodes.map((node) => (
        `${violation.id} [${violation.impact}] ${node.target.join(' ')}: ${node.failureSummary}`
      )));

    expect(severe).toEqual([]);
  });
});
