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

function sameBox(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Read the field's box once it has stopped changing between consecutive reads. */
async function settledBox(field, page) {
  let previous = await field.boundingBox();
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(50);
    const current = await field.boundingBox();
    if (sameBox(current, previous)) return current;
    previous = current;
  }
  return previous;
}

/**
 * Press a key, wait for the field's geometry to actually change, then return the
 * settled box.
 *
 * Reading `boundingBox()` straight after `keyboard.press` is a race: the handler
 * updates state, React re-renders and react-draggable applies the transform, all
 * asynchronously. A single read can land before any of that and report the old
 * position — which is how this test reported "Expected: > 386, Received: 386",
 * a zero-pixel move, on 1 of 4 local repeats even after the clamp fix.
 *
 * Waiting for a change also makes "the field did not move" a clear timeout
 * against a stated expectation rather than an arithmetic surprise.
 */
async function pressAndMeasure(field, page, key, previousBox) {
  await page.keyboard.press(key);
  await expect(async () => {
    expect(sameBox(await field.boundingBox(), previousBox)).toBe(false);
  }).toPass({ timeout: 10_000 });
  return settledBox(field, page);
}

/**
 * Select a placed field and pin it to the page's top-left corner.
 *
 * Both keyboard-geometry assertions need a starting position with room to grow.
 * The move handler clamps to `Math.max(0, …)` on the way up and left, and to
 * `Math.min(100 - width, …)` on the way down and right — so a field the palette
 * happened to drop against the bottom or right edge moves by *zero* when pressed
 * that way. That is exactly how the move test failed in CI: three attempts
 * measured deltas of 1.51 px, 1.49 px and finally 0 px, against a "baseline" that
 * itself drifted from 5.86 px to 1.22 px between attempts.
 *
 * Pressing up/left more times than the page has percentage steps lands the field
 * at exactly x=0, y=0 regardless of where it started, which makes every
 * subsequent down/right press unclamped and the measurement meaningful.
 */
async function selectAndPinToOrigin(page) {
  const field = page.getByRole('group', { name: /text field on page 1$/ });
  await field.focus();
  await expect(field).toBeFocused();
  // Focusing selects the field, which opens the properties rail and re-centres
  // the workbench. Measure only after that relayout, or the screen position
  // moves for a reason that has nothing to do with a key press.
  await expect(page.getByRole('group', { name: 'Field properties' })).toBeVisible();

  for (let i = 0; i < 101; i += 1) {
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
  }

  // Wait for the pinned position to stop changing rather than sleeping a fixed
  // interval — react-draggable applies the transform asynchronously.
  await settledBox(field, page);

  // A page rendered too small makes a 1% step sub-pixel and the comparison
  // meaningless, so assert the canvas is a usable size before measuring.
  const pageBox = await page.locator('[data-page-num="1"]').first().boundingBox();
  expect(pageBox.width).toBeGreaterThan(200);
  expect(pageBox.height).toBeGreaterThan(200);

  return field;
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
    const field = await selectAndPinToOrigin(page);

    const origin = await settledBox(field, page);
    const afterRight = await pressAndMeasure(field, page, 'ArrowRight', origin);
    expect(afterRight.x).toBeGreaterThan(origin.x);

    // Shift moves further per press than a bare arrow (5% versus 1%). Both
    // measurements are one press on the *same* axis: the earlier revision
    // compared a single Shift+ArrowDown against two ArrowRight presses, so it
    // was weighing a y-delta against an unrelated x-delta and calling the
    // difference a step size.
    const afterBareDown = await pressAndMeasure(field, page, 'ArrowDown', afterRight);
    const bareStep = afterBareDown.y - afterRight.y;
    expect(bareStep).toBeGreaterThan(0);

    const afterShiftDown = await pressAndMeasure(field, page, 'Shift+ArrowDown', afterBareDown);
    expect(afterShiftDown.y - afterBareDown.y).toBeGreaterThan(bareStep);
  });

  test('resizes a placed field with Alt and an arrow key', async ({ page }) => {
    await openWorkbench(page);
    await placeField(page);

    // Pinned for the same reason as the move test: Alt+ArrowRight grows width
    // through `Math.min(100 - field.x, …)`, so a field sitting near the right
    // edge cannot grow and the assertion would compare a width to itself.
    const field = await selectAndPinToOrigin(page);

    const before = await settledBox(field, page);
    const after = await pressAndMeasure(field, page, 'Alt+ArrowRight', before);
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
