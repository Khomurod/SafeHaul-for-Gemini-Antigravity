import { getToken } from 'firebase/app-check';
import { appCheckService } from './config.js';

/**
 * Exchange / refresh App Check so the next Firebase Storage requests include App Check attestation.
 * Guest uploads require `request.appcheck` in storage.rules; without it, writes return `storage/unauthorized`.
 *
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function ensureAppCheckTokenBeforeStorage({ forceRefresh = false } = {}) {
  if (!appCheckService) {
    return {
      ok: false,
      missingInitialization: true,
      error: new Error(
        'App Check not initialized (missing site key or localhost without debug token)',
      ),
    };
  }
  try {
    await getToken(appCheckService, forceRefresh);
    return { ok: true, missingInitialization: false };
  } catch (e) {
    return { ok: false, missingInitialization: false, error: e };
  }
}
