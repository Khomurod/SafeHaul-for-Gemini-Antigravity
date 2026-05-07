import { describe, expect, it } from 'vitest';
import {
  PDF_VIEWPORT_WIDTH_DEFAULT,
  PDF_VIEWPORT_WIDTH_MIN,
  PDF_VIEWPORT_WIDTH_MAX,
  adjustPdfViewportWidth,
  clampPdfViewportWidth,
  zoomPercentLabel,
  DELTA_PIXEL,
  DELTA_LINE,
} from './envelopePdfZoom';

describe('envelopePdfZoom', () => {
  it('clampPdfViewportWidth enforces bounds', () => {
    expect(clampPdfViewportWidth(50)).toBe(PDF_VIEWPORT_WIDTH_MIN);
    expect(clampPdfViewportWidth(5000)).toBe(PDF_VIEWPORT_WIDTH_MAX);
    expect(clampPdfViewportWidth(701.4)).toBe(701);
  });

  it('adjustPdfViewportWidth shrinks on positive deltaY (scroll down)', () => {
    const next = adjustPdfViewportWidth(700, 100, DELTA_PIXEL);
    expect(next).toBeLessThan(700);
    expect(next).toBeGreaterThanOrEqual(PDF_VIEWPORT_WIDTH_MIN);
  });

  it('adjustPdfViewportWidth grows on negative deltaY (scroll up)', () => {
    const next = adjustPdfViewportWidth(700, -100, DELTA_PIXEL);
    expect(next).toBeGreaterThan(700);
    expect(next).toBeLessThanOrEqual(PDF_VIEWPORT_WIDTH_MAX);
  });

  it('respects line delta mode with larger steps', () => {
    const px = adjustPdfViewportWidth(700, 3, DELTA_PIXEL);
    const ln = adjustPdfViewportWidth(700, 3, DELTA_LINE);
    expect(Math.abs(700 - ln)).toBeGreaterThan(Math.abs(700 - px));
  });

  it('zoomPercentLabel rounds against default width', () => {
    expect(zoomPercentLabel(PDF_VIEWPORT_WIDTH_DEFAULT)).toBe(100);
    expect(zoomPercentLabel(350)).toBe(50);
  });
});
