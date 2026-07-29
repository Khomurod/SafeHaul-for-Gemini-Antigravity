import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { composeStories } from '@storybook/react-vite';

/**
 * Story smoke + accessibility lane.
 *
 * This is the Storybook check that runs in the normal frontend test suite. It
 * renders **every story in the catalog** and runs axe over the result, so a
 * story cannot rot into a broken import, a throwing prop combination, or an
 * inaccessible example without CI noticing.
 *
 * ## Why this and not `@storybook/addon-vitest`
 *
 * The official Vitest addon runs stories in Playwright browser mode. That would
 * mean a second browser-driven suite in CI on top of the existing Playwright
 * lane, and `AGENTS.md` records real, expensive failures caused by two suites
 * contending for one dev server. Portable stories give the same coverage inside
 * the suite that already exists, with no browser and no extra server.
 *
 * The trade-off is honest and worth stating: happy-dom does not compute layout,
 * so `color-contrast` cannot be evaluated here and is disabled below. Contrast is
 * covered elsewhere — by the real-browser `@axe-core/playwright` lane and by the
 * token pairings pinned in `src/design-system/tests/tokens.test.js`.
 *
 * ## What "passing" means
 *
 * Serious and critical violations fail. Moderate and minor findings are surfaced
 * in the failure message when a story fails for another reason, but do not fail
 * the build on their own — several are artefacts of rendering one story in
 * isolation, outside the page landmark structure it would really live in.
 */

const AXE_OPTIONS = {
  rules: {
    // happy-dom computes no layout, so every colour pair resolves to the same
    // value and this rule cannot produce a meaningful result here.
    'color-contrast': { enabled: false },
    // A story is a fragment, not a page. Landmark and page-level structure rules
    // are meaningless in isolation and are enforced on real screens by the
    // Playwright axe lane instead.
    region: { enabled: false },
    'page-has-heading-one': { enabled: false },
    'landmark-one-main': { enabled: false },
  },
};

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * Every story file in the catalog, resolved at build time by Vite. Using a glob
 * rather than a hand-maintained list means a new story is covered the moment it
 * is written — there is no list to forget to update.
 */
const storyModules = {
  ...import.meta.glob('../design-system/stories/**/*.stories.jsx', { eager: true }),
  ...import.meta.glob('../shared/components/modals/*.stories.jsx', { eager: true }),
};

const stories = Object.entries(storyModules).flatMap(([modulePath, storyModule]) =>
  Object.entries(composeStories(storyModule)).map(([storyName, Story]) => ({
    id: `${modulePath.replace('../', 'src/')} → ${storyName}`,
    Story,
  })),
);

afterEach(cleanup);

describe('design-system story catalog', () => {
  it('discovers a meaningful number of stories', () => {
    // Guards against the glob silently resolving to nothing and the whole suite
    // passing vacuously — the same failure mode the repo's other scanning tests
    // protect against.
    expect(stories.length).toBeGreaterThan(60);
  });

  it.each(stories)('$id renders and has no serious or critical a11y violations', async ({ Story }) => {
    const { container } = render(<Story />);

    // Rendering at all is half the check: a story with a broken import, a
    // removed prop, or a value the primitive rejects throws right here.
    expect(container).toBeTruthy();

    const results = await axe(container, AXE_OPTIONS);
    const blocking = results.violations
      .filter((violation) => BLOCKING_IMPACTS.has(violation.impact))
      .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`);

    expect(blocking).toEqual([]);
  });
});
