/**
 * FMCSA carrier lookup via Transportation.gov Socrata SODA API.
 * @see https://data.transportation.gov/resource/az4n-8mr2
 */

export const FMCSA_EMPLOYER_SOCRATA_URL =
  'https://data.transportation.gov/resource/az4n-8mr2.json';

const MIN_PREFIX_LENGTH = 2;
const MAX_PREFIX_LENGTH = 80;

/**
 * Escape a value for use inside a SoQL single-quoted string literal.
 */
export function escapeSoqlStringLiteral(raw) {
  if (raw == null) return '';
  return String(raw).replace(/'/g, "''");
}

/**
 * Strip characters that are risky or useless inside SoQL string literals.
 */
export function sanitizeEmployerSearchPrefix(input) {
  const trimmed = String(input ?? '').trim().slice(0, MAX_PREFIX_LENGTH);
  return trimmed.replace(/[^\p{L}\p{N}\s\-'&.(),]/gu, '').trim();
}

/**
 * Build request URL with SoQL query params (properly URL-encoded).
 */
export function buildFmcsaEmployerSearchUrl(prefix) {
  const safe = escapeSoqlStringLiteral(sanitizeEmployerSearchPrefix(prefix));
  if (safe.length < MIN_PREFIX_LENGTH) {
    return null;
  }
  const params = new URLSearchParams();
  params.set('$select', 'dot_number,legal_name,phy_street,phy_city,phy_state');
  params.set('$where', `starts_with(upper(legal_name), upper('${safe}'))`);
  params.set('$limit', '5');
  return `${FMCSA_EMPLOYER_SOCRATA_URL}?${params.toString()}`;
}

/**
 * Map a Socrata row to employer step field values.
 * @param {object} row
 * @param {string[]} [statesAllowlist] — e.g. two-letter codes from useUtils().states
 */
export function mapFmcsaRowToEmployerFields(row, statesAllowlist = []) {
  const companyName = String(row?.legal_name ?? '').trim();
  const dotNumber =
    row?.dot_number === undefined || row?.dot_number === null
      ? ''
      : String(row.dot_number).trim();
  const address = String(row?.phy_street ?? '').trim();
  const city = String(row?.phy_city ?? '').trim();
  const rawState = String(row?.phy_state ?? '').trim().toUpperCase();
  let state = '';
  if (/^[A-Z]{2}$/.test(rawState)) {
    state = rawState;
  } else if (Array.isArray(statesAllowlist) && statesAllowlist.includes(rawState)) {
    state = rawState;
  }
  return { companyName, dotNumber, address, city, state };
}

/**
 * @param {string} prefix
 * @param {{ signal?: AbortSignal, appToken?: string }} [options]
 * @returns {Promise<Array<{ dot_number?: string|number, legal_name?: string, phy_street?: string, phy_city?: string, phy_state?: string }>>}
 */
export async function fetchFmcsaEmployerSuggestions(prefix, options = {}) {
  const { signal, appToken } = options;
  const url = buildFmcsaEmployerSearchUrl(prefix);
  if (!url || !appToken) {
    return [];
  }

  const headers = {
    Accept: 'application/json',
    'X-App-Token': appToken,
  };

  const res = await fetch(url, { method: 'GET', headers, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`FMCSA lookup failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
