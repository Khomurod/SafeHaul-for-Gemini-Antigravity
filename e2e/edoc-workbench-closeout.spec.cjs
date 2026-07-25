// E2E coverage for the PDF workbench close-out: named zoom controls, keyboard
// field placement, and the properties rail that used to be clipped off-screen
// below ~600px. Uses the e2eEdoc mock and an inline artificial PDF; nothing is
// sent and no real document or recipient data is involved.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const URL = '/company/e-docs?e2eAuth=company_admin&e2eEdoc=mock';

function pdfFile(name) {
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj',
    'trailer<</Root 1 0 R>>',
  ].join('\n');
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(pdf, 'utf8') };
}

async function openWorkbench(page) {
  await page.goto(URL);
  await expect(page.getByText(/Documents Center/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Send One-off/ }).click();
  await expect(page.getByRole('heading', { name: 'New Envelope' })).toBeVisible({ timeout: 15_000 });
  await page.setInputFiles('#pdf-upload', pdfFile('artificial-agreement.pdf'));
  await expect(page.getByRole('group', { name: 'PDF zoom' })).toBeVisible({ timeout: 20_000 });
}

async function placeField(page, paletteField = 'Text') {
  await page.getByRole('button', { name: `Add ${paletteField} field`, exact: true }).click();
  await expect(page.locator('[data-page-num="1"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.resize-handle').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('E-Doc workbench close-out', () => {
  test.describe.configure({ timeout: 90_000 });

  test('names every zoom control and announces the level', async ({ page }) => {
    await openWorkbench(page);
    const group = page.getByRole('group', { name: 'PDF zoom' });

    await expect(group.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(group.getByRole('button', { name: /^Reset zoom to 100 percent/ })).toBeVisible();
    await expect(group.getByRole('status')).toHaveText(/Zoom \d+ percent/);
  });

  test('zooms out, in and back to the default from the keyboard', async ({ page }) => {
    await openWorkbench(page);
    const group = page.getByRole('group', { name: 'PDF zoom' });
    const reset = group.getByRole('button', { name: /^Reset zoom to 100 percent/ });

    await expect(reset).toHaveText('100%');

    await group.getByRole('button', { name: 'Zoom out' }).click();
    await expect(reset).not.toHaveText('100%');

    await group.getByRole('button', { name: 'Zoom in' }).click();
    await expect(reset).toHaveText('100%');

    // Reset is reachable and operable without a pointer.
    await group.getByRole('button', { name: 'Zoom out' }).click();
    await reset.focus();
    await expect(reset).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(reset).toHaveText('100%');
  });

  test('moves a placed field with the keyboard alone', async ({ page }) => {
    await openWorkbench(page);
    await placeField(page);

    const field = page.getByRole('group', { name: /text field on page 1$/ });
    await field.focus();
    await expect(field).toBeFocused();
    // Focusing selects the field, which opens the properties rail and re-centres
    // the workbench. Measure only after that relayout, or the screen x moves for
    // a reason that has nothing to do with the key press.
    await expect(page.getByRole('group', { name: 'Field properties' })).toBeVisible();
    await page.waitForTimeout(400);

    const before = await field.boundingBox();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const after = await field.boundingBox();
    expect(after.x).toBeGreaterThan(before.x);

    // Shift moves further per press than a bare arrow.
    const beforeShift = await field.boundingBox();
    await page.keyboard.press('Shift+ArrowDown');
    const afterShift = await field.boundingBox();
    expect(afterShift.y - beforeShift.y).toBeGreaterThan(after.x - before.x);
  });

  test('resizes a placed field with Alt and an arrow key', async ({ page }) => {
    await openWorkbench(page);
    await placeField(page);

    const field = page.getByRole('group', { name: /text field on page 1$/ });
    await field.focus();
    await expect(page.getByRole('group', { name: 'Field properties' })).toBeVisible();
    await page.waitForTimeout(400);
    const before = await field.boundingBox();
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    const after = await field.boundingBox();
    expect(after.width).toBeGreaterThan(before.width);
  });

  test('keeps the properties rail usable at 412px, where it used to be clipped', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openWorkbench(page);
    await placeField(page);
    // addField places without selecting, so select the field to open the rail.
    await page.getByRole('group', { name: /text field on page 1$/ }).focus();

    const rail = page.getByRole('group', { name: 'Field properties' });
    await expect(rail).toBeVisible();
    await expect(rail.getByLabel('Field Label')).toBeVisible();

    const box = await rail.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

    // And it can be dismissed, since the canvas behind it is covered.
    await rail.getByRole('button', { name: 'Close field properties' }).click();
    await expect(page.getByRole('group', { name: 'Field properties' })).toBeHidden();
  });

  test('keeps the desktop rail inline rather than overlaying the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page);
    await placeField(page);
    await page.getByRole('group', { name: /text field on page 1$/ }).focus();

    const rail = page.getByRole('group', { name: 'Field properties' });
    await expect(rail).toBeVisible();
    // The mobile-only dismiss control is not part of the desktop layout.
    await expect(rail.getByRole('button', { name: 'Close field properties' })).toBeHidden();

    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  });

  test('has no serious/critical or contrast violations in the workbench', async ({ page }) => {
    await openWorkbench(page);
    await placeField(page);

    const { violations } = await new AxeBuilder({ page })
      .include('[role="group"][aria-label="PDF zoom"]')
      .include('[data-page-num="1"]')
      .analyze();
    const serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
    expect(serious).toEqual([]);
    expect(violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
  });
});
