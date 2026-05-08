#!/usr/bin/env node
/**
 * Optional live check against Transportation.gov (uses VITE_SOCRATA_APP_TOKEN or SOCRATA_APP_TOKEN).
 * Does not print the token. Usage:
 *   set VITE_SOCRATA_APP_TOKEN=... && node scripts/smoke-fmcsa-socrata.mjs
 */
import {
  buildFmcsaEmployerSearchUrl,
  fetchFmcsaEmployerSuggestions,
} from '../src/shared/services/fmcsaEmployerSocrata.js';

const token =
  process.env.VITE_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN || '';

if (!token) {
  console.error('Missing VITE_SOCRATA_APP_TOKEN (or SOCRATA_APP_TOKEN).');
  process.exit(1);
}

const url = buildFmcsaEmployerSearchUrl('SW');
if (!url) {
  console.error('buildFmcsaEmployerSearchUrl failed for prefix SW');
  process.exit(1);
}

try {
  const rows = await fetchFmcsaEmployerSuggestions('SW', { appToken: token });
  const n = rows?.length ?? 0;
  console.log(`OK: ${n} row(s) for prefix "SW"`);
  if (n > 0) {
    const r = rows[0];
    console.log('Sample:', r.legal_name, '| USDOT', r.dot_number);
  }
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e.message || e);
  process.exit(1);
}
