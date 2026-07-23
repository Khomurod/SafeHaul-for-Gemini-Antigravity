import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../../tailwind.config.js';

const tokenRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tokens');
const tokenSource = ['foundation.css', 'semantic.css']
  .map((file) => fs.readFileSync(path.join(tokenRoot, file), 'utf8'))
  .join('\n');

function customProperties(source) {
  return new Map(
    [...source.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)]
      .map((match) => [match[1], match[2].trim()]),
  );
}

const tokens = customProperties(tokenSource);

function resolveToken(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token reference: ${name}`);
  seen.add(name);
  const value = tokens.get(name);
  const reference = value?.match(/^var\(--([\w-]+)\)$/);
  return reference ? resolveToken(reference[1], seen) : value;
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens', () => {
  it('keeps supported interface type at 12px or larger', () => {
    const sizes = [...tokens.entries()]
      .filter(([name]) => name.startsWith('ds-font-size-'))
      .map(([, value]) => Number.parseFloat(value));

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it.each([
    ['content', 'surface'],
    ['content-secondary', 'surface'],
    ['content-muted', 'surface'],
    ['content-inverse', 'action-primary'],
    ['content-inverse', 'action-danger'],
    ['status-info-fg', 'status-info-bg'],
    ['status-accent-fg', 'status-accent-bg'],
    ['status-success-fg', 'status-success-bg'],
    ['status-warning-fg', 'status-warning-bg'],
    ['status-danger-fg', 'status-danger-bg'],
    ['status-neutral-fg', 'status-neutral-bg'],
  ])('%s on %s meets WCAG AA normal-text contrast', (foreground, background) => {
    const ratio = contrast(
      resolveToken(`ds-color-${foreground}`),
      resolveToken(`ds-color-${background}`),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('exposes the semantic contract through namespaced Tailwind utilities', () => {
    const colors = tailwindConfig.theme.extend.colors;
    expect(colors['ds-canvas']).toBe('var(--ds-color-canvas)');
    expect(colors['ds-content']).toBe('var(--ds-color-content)');
    expect(colors['ds-action-primary']).toBe('var(--ds-color-action-primary)');
    expect(tailwindConfig.theme.extend.spacing['ds-4']).toBe('var(--ds-space-4)');
    expect(tailwindConfig.theme.extend.fontSize['ds-body'][0]).toBe('var(--ds-font-size-body)');
  });
});
