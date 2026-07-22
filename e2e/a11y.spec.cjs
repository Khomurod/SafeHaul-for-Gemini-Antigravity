// E3: automated accessibility gate on the mobile-primary critical journeys
// (signing, guest intake, auth). Asserts no serious/critical axe violations —
// the real-browser complement to the vitest-axe component gate (which can't
// compute layout-dependent rules like colour-contrast).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

/** Return the ids (with impact) of serious/critical axe violations on the page. */
async function seriousViolations(page) {
    const { violations } = await new AxeBuilder({ page })
        // Scan the rendered document; tag-filtering kept default (WCAG 2.x A/AA).
        .analyze();
    return violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
}

// Tagged @a11y so CI can run it as a dedicated, initially NON-BLOCKING lane
// (continue-on-error) and exclude it from the deploy-gating e2e run until it is
// confirmed green in CI — this spec can't be run in the sandbox (browser download
// blocked), so it must not block deploys on unverified, possibly pre-existing
// violations. Flip to blocking once green.
test.describe('@a11y mobile-critical journeys (no serious/critical violations)', () => {
    test('guest intake landing', async ({ page }) => {
        await page.goto('/apply/e2e-company');
        await page.waitForLoadState('networkidle');
        expect(await seriousViolations(page)).toEqual([]);
    });

    test('public signing room', async ({ page }) => {
        await page.goto('/sign/e2e-company/e2e-request?token=e2e-token&e2eSign=mock');
        await page.getByRole('button', { name: /I Agree - Proceed to Sign/i }).click();
        await expect(page.locator('[data-signing-page="1"]')).toBeVisible({ timeout: 10_000 });
        expect(await seriousViolations(page)).toEqual([]);
    });
});
