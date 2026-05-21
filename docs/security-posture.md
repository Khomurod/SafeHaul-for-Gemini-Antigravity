# Security posture (guest and public flows)

## Firebase App Check — intentionally not used

SafeHaul **does not use Firebase App Check** (no `initializeAppCheck`, no `enforceAppCheck` on callables, no `request.app` / `request.appcheck` in security rules, no reCAPTCHA Enterprise env vars).

This is a **product and architecture choice**, not an oversight. Automated audits and security reviews should **not** report missing App Check as a bug, error, or vulnerability.

## Guest and public intake controls

| Control | Implementation |
|---------|----------------|
| IP rate limits | `checkRateLimit` on `getSignedUploadUrl`, `getSignedGuestUploadUrl`, `submitGuestApplication` |
| Tenant / intake gate | `assertCompanyAcceptingIntake` before upload path reservation, signed read URLs, and submit |
| MIME allowlist | `getSignedUploadUrl` (`storageSecure.js`) |
| Path isolation | Storage writes only under `companies/{id}/{applications\|autofill}/guest_uploads/` |
| No public Storage read | Storage rules: guest `create` only; `read` for company admins; guests use callable signed URLs |
| Short-lived preview URLs | `getSignedGuestUploadUrl` — 15-minute signed read URLs, path-validated |
| Primary submit path | `submitGuestApplication` via Admin SDK (Firestore client rules are fallback only) |

## What is not a finding

- Absence of `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` or App Check debug tokens
- Guest Storage writes without `request.app`
- Unauthenticated callables for guest upload path, signed read URL, and application submit (with rate limits and validation)

## Tradeoff

Without App Check, automated clients can invoke public callables. Mitigations are rate limiting, strict path validation, and no broad Storage read access. Re-enabling App Check would be a deliberate product change requiring client, rules, functions, and Console alignment.

## Related files

- [`functions/storageSecure.js`](../functions/storageSecure.js) — upload path reservation
- [`functions/getSignedGuestUploadUrl.js`](../functions/getSignedGuestUploadUrl.js) — guest file preview URLs
- [`functions/guestApplication.js`](../functions/guestApplication.js) — guest submit
- [`src/storage.rules`](../src/storage.rules) — guest upload rules
- [`src/firestore.rules`](../src/firestore.rules) — fallback guest write rules

## Firebase Console (operations)

After deploy, ensure **App Check enforcement is Unenforced** (or disabled) for Storage, Cloud Functions, and Firestore so production traffic is not rejected for missing tokens.
