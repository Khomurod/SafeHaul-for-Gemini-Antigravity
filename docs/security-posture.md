# Security posture (guest and public flows)

## Firebase App Check — previously used, intentionally removed

SafeHaul does **not** currently use Firebase App Check (no `initializeAppCheck`, no
`enforceAppCheck` on callables, no `request.app` / `request.appcheck` in security
rules, no reCAPTCHA Enterprise env vars).

### Decision history and rationale (why it was removed)

App Check **was previously implemented** in SafeHaul. In production it **blocked or
disrupted legitimate document uploads** for a meaningful number of real drivers —
most visibly the **CDL** and **medical-card** uploads on the public driver
application. The result was **failed applications and driver frustration**: drivers
who could not attach their documents could not complete or submit an application.

Because the public application is the top of the recruiting funnel, **reliable driver
application submission is deliberately prioritized over strict App Check
enforcement**. App Check was therefore removed. The current guest-upload access model
is a **conscious, accepted business-and-security tradeoff**, not an oversight or a
regression.

### This is an accepted risk — not a defect

Automated audits and security reviews should **not** report the absence of App Check,
or the existence of unauthenticated guest uploads, as a **newly discovered bug,
vulnerability, or accidental oversight**. It may be listed as an **accepted,
documented risk** alongside the compensating controls below — but it must not be
presented as an error to be "fixed" by re-enabling App Check or blocking guest
uploads.

The compensating controls below **must remain in place**, and audits should verify
*those* instead: file-type (MIME) allowlist, size limit, storage path isolation,
per-company tenant/intake gating, rate limiting, no public Storage read, and the
Admin-SDK server submit path.

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

## When to revisit this decision

Re-open this decision **only** when one of the following is true:

- The **guest-upload architecture changes** (e.g. uploads move fully behind a
  server-minted signed-URL / token flow, off direct Storage-rule writes), or
- A **reliable App Check / bot-mitigation configuration becomes available that does
  not block legitimate drivers** from uploading CDL and medical-card documents
  (verified against real mobile-camera, HEIC, and large-scan upload paths).

Absent one of those, the absence of App Check is the **intended current design** and
should be left as-is. Any future change here must be validated end-to-end against the
public CDL and medical-card upload flow **before** enforcement is turned on, so the
original driver-upload failures are not reintroduced.

## Related files

- [`functions/storageSecure.js`](../functions/storageSecure.js) — upload path reservation
- [`functions/getSignedGuestUploadUrl.js`](../functions/getSignedGuestUploadUrl.js) — guest file preview URLs
- [`functions/guestApplication.js`](../functions/guestApplication.js) — guest submit
- [`src/storage.rules`](../src/storage.rules) — guest upload rules
- [`src/firestore.rules`](../src/firestore.rules) — fallback guest write rules

## Firebase Console (operations)

After deploy, ensure **App Check enforcement is Unenforced** (or disabled) for Storage, Cloud Functions, and Firestore so production traffic is not rejected for missing tokens.
