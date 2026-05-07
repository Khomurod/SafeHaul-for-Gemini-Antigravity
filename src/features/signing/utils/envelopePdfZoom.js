/** Default PDF preview width in px (matches legacy EnvelopeCreator behavior). */
export const PDF_VIEWPORT_WIDTH_DEFAULT = 700;

export const PDF_VIEWPORT_WIDTH_MIN = 320;

export const PDF_VIEWPORT_WIDTH_MAX = 1400;

/** WheelEvent.deltaMode values */
export const DELTA_PIXEL = 0;
export const DELTA_LINE = 1;
export const DELTA_PAGE = 2;

export function clampPdfViewportWidth(width) {
  const n = Number(width);
  if (Number.isNaN(n)) return PDF_VIEWPORT_WIDTH_DEFAULT;
  return Math.min(PDF_VIEWPORT_WIDTH_MAX, Math.max(PDF_VIEWPORT_WIDTH_MIN, Math.round(n)));
}

/**
 * Ctrl/⌘ + wheel: map delta to next viewport width.
 * Positive deltaY (scroll down) → shrink preview (like browser zoom out).
 */
export function adjustPdfViewportWidth(current, deltaY, deltaMode = DELTA_PIXEL) {
  let factor = -0.65;
  if (deltaMode === DELTA_LINE) factor *= 14;
  if (deltaMode === DELTA_PAGE) factor *= 100;
  return clampPdfViewportWidth(current + Number(deltaY) * factor);
}

export function zoomPercentLabel(width, base = PDF_VIEWPORT_WIDTH_DEFAULT) {
  const b = base || PDF_VIEWPORT_WIDTH_DEFAULT;
  return Math.round((clampPdfViewportWidth(width) / b) * 100);
}
