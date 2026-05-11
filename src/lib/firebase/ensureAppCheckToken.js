import { getToken } from 'firebase/app-check';
import { appCheckService } from './config.js';

/**
 * Exchange / refresh App Check so the next Firebase Storage requests include App Check attestation.
 * Guest uploads require `request.appcheck` in storage.rules; without it, writes return `storage/unauthorized`.
 */
export async function ensureAppCheckTokenBeforeStorage() {
  if (!appCheckService) {
    return { ok: false, error: new Error('App Check not initialized (missing site key or localhost without debug token)') };
  }
  try {
    await getToken(appCheckService, false);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}
