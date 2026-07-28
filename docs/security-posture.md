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

## Accepted gap: a direct Storage upload can bypass the backend helper

The controls above are the intended, best-effort path. The SafeHaul app calls the
`getSignedUploadUrl` backend helper (`functions/storageSecure.js`), which
**rate-limits per IP** (`checkRateLimit`) and **checks the company is accepting
intake** (`assertCompanyAcceptingIntake`) before returning an approved storage path.
A well-behaved client always goes through that helper.

However, the **actual file write** is a Firebase Storage SDK `uploadBytes` call
authorized by the **Storage rules** — not by a server-minted token.
`src/storage.rules` permits an **unauthenticated** `create` under
`companies/{companyId}/{applications|autofill}/guest_uploads/**` for any file that
passes the MIME-type and 20 MB size checks. A client that calls `uploadBytes`
**directly**, skipping `getSignedUploadUrl`, therefore **bypasses the backend rate
limit and the intake gate**; only the Storage-rule checks (file type, size, path
shape) apply on that direct path.

**This gap is understood and currently accepted** — it is the same
business/security tradeoff described above. App Check, the control that would close
it, blocked legitimate CDL and medical-card uploads, so it was removed, and reliable
driver submission is prioritized over closing this bypass.

- The current direct guest-upload behavior **must not be blocked or tightened**.
  Doing so risks re-introducing the exact upload failures that prevented drivers
  from submitting.
- Future audits may cite this **only as a documented, accepted risk** — never as an
  accidental defect or oversight.
- It should be **reconsidered only when a reliable replacement** can protect the
  direct-upload path (e.g. server-minted signed upload URLs, or an App Check /
  bot-mitigation configuration) **without blocking legitimate drivers** — verified
  against real mobile-camera, HEIC, and large-scan uploads before any enforcement.

## What is not a finding

- Absence of `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` or App Check debug tokens
- Guest Storage writes without `request.app`
- Unauthenticated callables for guest upload path, signed read URL, and application submit (with rate limits and validation)
- A direct Storage `uploadBytes` bypassing the `getSignedUploadUrl` rate limit / intake gate — see "Accepted gap" above (documented accepted risk, not a defect)

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

## AI document analysis (AI Field Assistant)

`analyzeEdocFieldPlacement` sends rendered E-Doc page images to a third-party
vision provider. It is a **separate callable from the public CDL parser**
(`parseCdlWithGroq`) on purpose — the CDL path is reachable by unauthenticated
guests mid-application, and this one must not be.

Controls enforced in [`functions/edocFieldPlacement.js`](../functions/edocFieldPlacement.js):

- **Authentication** — `request.auth.uid` is required.
- **Tenancy** — `assertCompanyAccessForRequest` (the same strict RBAC check
  `getSigningLink` uses), plus an E-Docs feature check
  (`companies/{id}.features.eDocs !== false`).
- **Rate limits** — per user (12 / 60s) *and* per company (60 / 300s), both
  `fail-closed`, because each call spends money at a third party.
- **Payload ceilings** — at most 5 pages per request, ~2 MB per page image and
  ~7 MB total; only `data:image/(png|jpeg|webp);base64` inputs are accepted.
- **No arbitrary Storage access** — the client sends images it rendered itself.
  The callable takes no Storage path and reads no file.
- **No Firestore write** — the only datastore access is the company feature
  read (and the shared rate-limit counters).
- **No signing tokens** — none are accepted as input or returned. `scanId` is an
  opaque client correlation id, capped at 64 characters.
- **Server-side key only** — `GROQ_API_KEY` never reaches the browser; the model
  pin is its own variable, `GROQ_DOCUMENT_VISION_MODEL`, so document analysis and
  CDL OCR can move independently.
- **Output validation** — every suggestion is checked against the supported
  signer field types and prefill bindings, its page must be one that was
  scanned, and its coordinates must be finite, in 0–100 %, and large enough to
  use. Anything else is dropped.

Privacy:

- Rendered page images exist only in browser memory for the duration of one scan
  and are never written to Storage, IndexedDB or localStorage.
- Nothing logs PDF content, base64 images, recipient details, signatures, tokens,
  or the provider's response text — only counts, ids and HTTP status codes.
- The UI discloses, in plain language and before the scan starts, that page
  images are sent to the configured AI provider.
- **We do not claim provider Zero Data Retention.** No ZDR configuration has
  been verified in this project's production account, so no such claim is made in
  the product or in these docs.

## Related files

- [`functions/edocFieldPlacement.js`](../functions/edocFieldPlacement.js) — AI Field Assistant callable
- [`functions/shared/documentVisionProvider.js`](../functions/shared/documentVisionProvider.js) — provider-neutral vision boundary
- [`functions/storageSecure.js`](../functions/storageSecure.js) — upload path reservation
- [`functions/getSignedGuestUploadUrl.js`](../functions/getSignedGuestUploadUrl.js) — guest file preview URLs
- [`functions/guestApplication.js`](../functions/guestApplication.js) — guest submit
- [`src/storage.rules`](../src/storage.rules) — guest upload rules
- [`src/firestore.rules`](../src/firestore.rules) — fallback guest write rules

## Firebase Console (operations)

After deploy, ensure **App Check enforcement is Unenforced** (or disabled) for Storage, Cloud Functions, and Firestore so production traffic is not rejected for missing tokens.
