import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The Playwright config is a CommonJS module that reads process.env at load time,
// so we (re)require it with a fresh module cache per case to exercise both the
// "override set" and "override unset" branches.
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(here, '../../playwright.config.cjs');

// Every Chromium-engine project must honor PW_CHROMIUM_EXECUTABLE; the others
// (Firefox / WebKit / mobile Safari) must not be touched by it.
const CHROMIUM_PROJECTS = ['chromium', 'mobile-chrome'];
const NON_CHROMIUM_PROJECTS = ['firefox', 'webkit', 'mobile-safari'];

function loadConfig(executablePath) {
  const previous = process.env.PW_CHROMIUM_EXECUTABLE;
  if (executablePath === undefined) {
    delete process.env.PW_CHROMIUM_EXECUTABLE;
  } else {
    process.env.PW_CHROMIUM_EXECUTABLE = executablePath;
  }
  delete require.cache[require.resolve(CONFIG_PATH)];
  try {
    return require(CONFIG_PATH);
  } finally {
    if (previous === undefined) {
      delete process.env.PW_CHROMIUM_EXECUTABLE;
    } else {
      process.env.PW_CHROMIUM_EXECUTABLE = previous;
    }
    delete require.cache[require.resolve(CONFIG_PATH)];
  }
}

const projectsByName = (config) =>
  Object.fromEntries((config.projects || []).map((p) => [p.name, p]));

const execPathOf = (project) => project?.use?.launchOptions?.executablePath;

describe('playwright.config.cjs — PW_CHROMIUM_EXECUTABLE override', () => {
  it('exposes the expected browser projects', () => {
    const byName = projectsByName(loadConfig(undefined));
    for (const name of [...CHROMIUM_PROJECTS, ...NON_CHROMIUM_PROJECTS]) {
      expect(byName[name], `missing project: ${name}`).toBeTruthy();
    }
  });

  it('applies the executable override to EVERY Chromium-based project when set', () => {
    const OVERRIDE = '/opt/system-chromium/chrome';
    const byName = projectsByName(loadConfig(OVERRIDE));
    for (const name of CHROMIUM_PROJECTS) {
      expect(execPathOf(byName[name]), `${name} should use the override`).toBe(OVERRIDE);
    }
  });

  it('does NOT apply the override to Firefox / WebKit / mobile Safari', () => {
    const byName = projectsByName(loadConfig('/opt/system-chromium/chrome'));
    for (const name of NON_CHROMIUM_PROJECTS) {
      expect(execPathOf(byName[name]), `${name} must not be overridden`).toBeUndefined();
    }
  });

  it('adds no launch override for any project when PW_CHROMIUM_EXECUTABLE is unset', () => {
    const byName = projectsByName(loadConfig(undefined));
    for (const name of [...CHROMIUM_PROJECTS, ...NON_CHROMIUM_PROJECTS]) {
      expect(execPathOf(byName[name]), `${name} should have no override when unset`).toBeUndefined();
    }
  });
});
