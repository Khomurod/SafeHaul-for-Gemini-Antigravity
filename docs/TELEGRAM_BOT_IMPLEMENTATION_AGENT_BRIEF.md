# Agent Brief: Telegram Driver Application Channel

**Project:** SafeHaul (`SafeHaul-for-Gemini-Antigravity`)  
**Task:** Implement Telegram bot intake + signature Mini App, integrated with the existing guest application pipeline.  
**Do NOT configure live Telegram bot token yet** — use placeholders and safe no-op/stub behavior until secrets are added.

**Status:** Approved implementation plan (see changelog at bottom for amendments from plan review).

---

## 0. Prime directive

> **Learn the application deeply before writing code. Do not break any existing behavior.**

This is a production Firebase app (React 19 + Vite 7 + Cloud Functions). Every change must be additive, tested, and backward-compatible. If unsure, read more code before editing.

### Summary (what to build)

- Add Telegram as an **additive** intake channel without changing the web `/apply/:slug` flow or the `submitGuestApplication` **request/response contract**.
- **MVP scope:** collect core fields + **at least one employer** in Telegram; **consent via inline Accept/Decline** in chat; **signature only** in a minimal Mini App; then submit via shared guest pipeline.
- Baseline gates must pass before and after: `npm run lint`, `npm test -- --run`, `cd functions && npm test`, `node scripts/check-callable-contract.mjs`.

---

## Phase A — Mandatory discovery (do this first, no skipping)

Spend meaningful time understanding the codebase. Document findings briefly in your work log, then implement.

### A.1 Read these files end-to-end

| Area | Paths |
|------|--------|
| Product / architecture | `README.md`, `ARCHITECTURE.md`, `docs/firestore-data-model.md`, `docs/security-posture.md` |
| Guest apply flow | `src/features/driver-app/components/application/PublicApplyHandler.jsx`, `functions/guestApplication.js` |
| Wizard + schema | `DriverApplicationWizard.jsx`, `Stepper.jsx`, `applicationSchema.js`, `questionMerger.js`, `useApplicationSchema.js`, `globalSchemaSeed.js` |
| Employment validation | `Step6_Employment.jsx`, `src/shared/utils/employmentApplicationHelpers.js` (`employerRowHasVerifierContact`) |
| Signature / consent | `Step9_Consent.jsx`, `src/lib/signature.js`, `functions/driverSync.js` |
| Public signing (token pattern) | `SigningRoom.jsx`, `functions/publicSigning.js` |
| Webhook pattern | `functions/integrations/facebook.js` |
| RBAC / intake gates | `src/firestore.rules`, `functions/shared/companyTenant.js` |
| Rate limiting | `functions/shared/rateLimiter.js` |
| Uploads | `functions/storageSecure.js`, `functions/getSignedGuestUploadUrl.js`, `PublicApplyHandler.jsx` |
| Hosting | `firebase.json`, `vite.config.js` |
| CI contracts | `scripts/check-callable-contract.mjs`, `.github/workflows/main.yml` |
| Callable map | `docs/callable-frontend-map.md` |
| Feature flags | `docs/feature-flags.md`, `FeaturesView.jsx` |

### A.2 Run existing quality gates (baseline must pass)

Before and after your work:

```bash
npm run lint
npm test -- --run
cd functions && npm test
node scripts/check-callable-contract.mjs
```

On Windows, `npm.cmd` is acceptable. Record baseline pass/fail. **All must still pass when you finish** (plus new tests you add).

### A.3 Non-negotiable constraints

1. **Do not change** existing guest/web application behavior unless fixing a clear bug required for integration.
2. **Do not remove or rename** existing Cloud Function exports used by the SPA.
3. **Do not weaken** `src/firestore.rules` or `src/storage.rules`.
4. **Do not put secrets** in client `VITE_*` env vars. Telegram bot token stays server-only.
5. **Do not require** `TELEGRAM_BOT_TOKEN` at deploy time — webhook and bot send must **return HTTP 200** and no-op cleanly when token is empty (deploy-safe).
6. **Reuse field keys** from `applicationSchema.js` / merged schema (`firstName`, `employers`, `cdl-front`, etc.) — Mirror Law.
7. **Final Firestore application documents** must match shape expected by `submitGuestApplication`, `driverSync`, and recruiter dossier UI.
8. **Do not collect SSN or full DOB** in Telegram chat (MVP privacy).

---

## Phase B — Feature specification (what to build)

### B.1 User journey

1. Driver opens: `https://t.me/<BOT_USERNAME>?start=apply_<appSlug>` (or `apply_<slug>_r_<recruiterCode>`).
2. Driver sends `/start` (with or without payload).
3. Bot resolves `appSlug` → `companyId` (see **B.1.1**), verifies intake + feature flag.
4. Bot creates `telegram_sessions/{sessionId}` and asks questions **one at a time**.
5. Driver answers via text, inline keyboards, or photo/document for required uploads.
6. Bot runs **one consent step** with inline **Accept** / **Decline** (sets all consent fields; see **B.4**).
7. Bot sends inline **Web App** button → Mini App at `/telegram/sign?token=...` for **signature only**.
8. `completeTelegramApplication` writes application via shared upsert logic; bot sends confirmation (if token present).

**Out of scope for MVP:** post-application e-docs (`createPostApplicationSigningRequest`), CDL Groq autofill after upload (Phase 2).

### B.1.1 Slug resolution (server — mirror web)

1. Query `public_profiles` where `appSlug == slug` (`limit(1)`).
2. Fallback: `public_profiles/{slug}` doc id (legacy — see `PublicApplyHandler.jsx`).
3. `assertCompanyAcceptingIntake(companyId)` from `companyTenant.js`.
4. Read **`companies/{companyId}`** (not `public_profiles`) for `features.telegramApply === true`.

### B.2 Architecture (required)

```
Telegram → telegramWebhook (HTTP onRequest)
         → conversationEngine + sessionService (Firestore)
         → botApi.js — no-op when TELEGRAM_BOT_TOKEN empty

Mini App (/telegram/sign?token=...) → getTelegramSessionStatus (callable, load)
                                    → completeTelegramApplication (callable, submit)
         → buildApplicationDoc + upsertApplicationDoc (shared with guestApplication)
         → driverSync + existing triggers
```

**Host bot logic in** `functions/telegram/` (mirror `functions/integrations/facebook.js`).

**Do not** load `App.jsx`, router, or `DataProvider` in the Mini App.

### B.3 Public interfaces

#### Cloud Function exports (`functions/index.js`)

| Export | Type | Purpose |
|--------|------|---------|
| `telegramWebhook` | `onRequest` (v2) | Telegram updates; deploy-safe with empty token |
| `completeTelegramApplication` | `onCall` | Mini App signature submit |
| `getTelegramSessionStatus` | `onCall` | Mini App load state (required, not optional) |

Wire with direct `require('./telegram/...')` paths for incremental deploy.

#### Callable payloads

**`getTelegramSessionStatus({ sessionToken, initData? })`**

```javascript
// Return only what the Mini App needs — do NOT return full formData (PII).
{
  status: 'awaiting_signature' | 'active' | 'completed' | 'expired' | 'cancelled',
  companyName: string,
  appSlug: string,
  consentAccepted: boolean,  // all four consent keys === 'agreed'
  expired: boolean,
  error?: string
}
```

When `TELEGRAM_BOT_TOKEN` is set, require valid `initData` matching `session.telegramUserId` (except explicit E2E/test bypass per `e2eMode.js` patterns).

**`completeTelegramApplication({ sessionToken, signature, initData? })`**

```javascript
{ success: true, confirmationNumber: string, applicationId: string }
```

Rate-limit per session/IP (`checkRateLimit`). Reject missing/invalid signature (same rules as `driverSync`: data URL, min length).

#### Firestore

`telegram_sessions/{sessionId}` — **client deny all:**

```
match /telegram_sessions/{sessionId} {
  allow read, write: if false;
}
```

#### Environment (`functions/.env.example` only)

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
```

No token in GitHub Actions or `VITE_*` in this task.

#### Frontend / Hosting

| Artifact | Purpose |
|----------|---------|
| `telegram-sign.html` | Vite MPA entry |
| `src/telegram/main.jsx` | Bootstrap |
| `src/telegram/SignatureApp.jsx` | Signature-only UI |
| `firebase.json` rewrite | `/telegram/sign` → `/telegram-sign.html` **before** `**` → `/index.html` |
| `vite.config.js` | `rollupOptions.input`: `main` + `telegramSign` |

---

### B.4 MVP collected data (chat)

**Identity / contact / address:** `firstName`, `lastName`, `email`, `phone`, `street`, `city`, `state`, `zip`.

**License:** `cdlState`, `cdlClass`, `cdlNumber`, `cdlExpiration`.

**Gates:** `has-violations`, `has-accidents`, `military-service` (+ other simple required fields from merged schema when safe for chat).

**Violations / accidents “yes” branch (required — pick one, implement consistently):**

| Option | Behavior |
|--------|----------|
| **A (recommended MVP)** | If user answers **yes**, bot explains details must be completed on web (`/apply/:slug`) and does not proceed until they answer **no**, OR offers `/cancel` |
| **C (alternate)** | If **yes**, store empty `violations`/`accidents` arrays + `telegramMvpIncomplete: ['violations']` on session/formData for recruiter follow-up |

Do **not** leave `has-violations: 'yes'` with empty arrays without documentation.

**Employment:** When `applicationConfig.employmentHistory` is not hidden and required:

- Collect **at least one** row in `employers` array (not `employmentHistory` key — use **`employers`** per `PublicApplyHandler.jsx` / `Step6_Employment.jsx`).
- Employer shape must support verifier fields: `companyName`, `phone`, `companyEmail`, `supervisorPhone`, `supervisorEmail`, `startDate`, `endDate`, etc. (match `Step6_Employment` `initialEmployer`).
- Validate with logic equivalent to `employerRowHasVerifierContact()` — port to Functions (do not import frontend ESM from `src/`).
- Sub-flow: “Add another employer” / “Done” inline buttons.

**Uploads:** Require `cdl-front`, `cdl-back`, `medical-card-upload` only when company `applicationConfig` requires them (same helpers as `guestApplication.js` `getFieldConfig` / `hasUploadedFile`).

- Storage path: `companies/{companyId}/applications/guest_uploads/telegram_{sessionId}/{fieldKey}/{filename}`
- Metadata in `formData[fieldKey]`: **`{ name, url, storagePath }`** — same as `PublicApplyHandler.jsx`
- After Admin upload, generate signed read URL so `url` is populated (`hasUploadedFile` checks `url || storagePath || name`)

**Consent (chat only — not in Mini App):**

One inline **Accept** / **Decline** step after a short legal summary message (electronic records, background check, FMCSA PSP — do not use a bare “Accept” with no context).

On **Accept**, set all to `'agreed'`:

- `final-certification`
- `agree-electronic`
- `agree-background-check`
- `agree-psp` (required in web Step 9; include for dossier parity)

On **Decline**, cancel session (`status: 'cancelled'`).

**Signature (Mini App only):**

- Set `signature` (data URL), `signatureType: 'drawn'`, `signatureDate` (ISO string) — match `Step9_Consent.jsx`.
- Do not re-collect consent checkboxes in Mini App if already accepted in chat (`consentAccepted` from session).

**MVP omissions (document in code + changelog):**

- SSN, full DOB in chat
- Previous addresses / `residence-3-years` / 3-year address history
- Full 10-year employment (beyond ≥1 employer)
- Schools, unemployment arrays, full military history
- Violation/accident detail rows (unless Option B added later)
- Custom company questions (Phase 2)
- Post-submit e-docs, Groq CDL autofill (Phase 2)

---

### B.5 Shared guest application refactor (critical)

Extract from `functions/guestApplication.js` into **`functions/shared/`**:

#### `buildApplicationDoc.js`

- Deterministic ID generation (`generateApplicantKey`, `generateApplicationId`)
- Confirmation number format (`SAF-{year}-{random}`)
- `sanitizeData`, upload requirement checks, default arrays (`employers`, `violations`, `accidents`, …)
- `sourceType`, `sourceSlug`, `lifecycle`, `status: 'New Application'`, etc.

#### `upsertApplicationDoc.js`

- Collision suffix loop (`applicationId_2`, …)
- `{ merge: true }` write
- Preserve `confirmationNumber`, `submittedAt`, `createdAt` on resubmit
- Do not clobber recruiter-advanced `status`
- Lifecycle merge rules (preserve `lifecycle.status`, set `lastResubmittedAt` on retry)

**`submitGuestApplication`** must call both modules with **zero** request/response contract change for web clients.

**`completeTelegramApplication`** must call both — **never duplicate** merge/collision logic.

Telegram metadata on build:

- `sourceType: 'Telegram Bot'`
- `sourceSlug: appSlug`
- `lifecycle.clientVersion: 'telegram-1.0'`
- `lifecycle.isGuest: true`

---

### B.6 `functions/telegram/` modules

| Module | Responsibility |
|--------|----------------|
| `botApi.js` | `sendMessage`, `editMessageReplyMarkup`, `answerCallbackQuery`, `getFile`, download; **no-op** when token empty |
| `validateInitData.js` | Telegram WebApp HMAC; match `telegramUserId`; skip when token empty (dev); E2E bypass |
| `sessionService.js` | CRUD sessions, 72h TTL, status transitions |
| `schemaAdapter.js` | Load Firestore schema + company overrides; CJS MVP fallback for tests/cold start; **do not** `require()` frontend `src/config/*.js` (ESM/CJS mismatch) — port merge rules into Functions |
| `conversationEngine.js` | `/start`, `/cancel`, cursor, callbacks, employer sub-flow, consent, uploads → `awaiting_signature` |
| `webhook.js` | Parse updates; optional `TELEGRAM_WEBHOOK_SECRET` (header/path/query); rate limit; **return 200** always when tokenless |

**Webhook latency:** Acknowledge quickly. File download + Storage upload must not block Telegram’s timeout — if slow, set session `processing: true`, return 200, finish before next question (document approach in code).

**Feature flag:** Refuse intake unless `companies/{id}.features.telegramApply === true`.

---

### B.7 Telegram Mini App (frontend)

**SignatureApp must:**

- Read `?token=` from URL.
- Call `getTelegramSessionStatus` on load; show error if not `awaiting_signature` or consent not accepted.
- Reuse `src/lib/signature.js` only.
- Submit via `completeTelegramApplication` (signature + `initData` when in Telegram).
- `Telegram.WebApp.close()` on success when available.
- `VITE_E2E_TEST_MODE` bypass for Playwright (no initData).

**Do not** import `DataProvider`, `App.jsx`, or full router.

Optional dependency: `@twa-dev/sdk` only if justified; raw `window.Telegram.WebApp` is fine.

---

### B.8 Feature flag & admin UX

- Add `telegramApply` to `ALL_FEATURES` in `FeaturesView.jsx` (label: “Telegram Apply”).
- Read-only deep link in feature matrix: `https://t.me/<BOT_USERNAME_PLACEHOLDER>?start=apply_{appSlug}`
- Do **not** gate web `/apply/:slug` on this flag.

Update: `README.md`, `docs/callable-frontend-map.md`, `docs/feature-flags.md`.

---

## Phase C — Testing requirements

### C.1 Baseline and final gates

```bash
npm run lint
npm test -- --run
cd functions && npm test
node scripts/check-callable-contract.mjs
```

### C.2 New Functions Jest tests (`functions/test/unit/`)

| File | Coverage |
|------|----------|
| `buildApplicationDoc.test.js` | Shape, dedupe, timestamp/status/lifecycle preservation |
| `upsertApplicationDoc.test.js` | Collision suffix, merge, status preservation |
| `schemaAdapter.test.js` | Merge, hide/dependsOn, upload requirements, MVP ordering |
| `validateInitData.test.js` | Valid/invalid HMAC, stale auth date, user mismatch |
| `conversationEngine.test.js` | `/start`, cursor, validation, employer sub-flow, consent accept/decline, tokenless no-op |
| `completeTelegramApplication.test.js` | Happy path, signature errors, session states, initData, Telegram source metadata |

### C.3 Rules / Vitest / E2E

- `firestore.rules.security.test.js` — all roles fail read/write on `telegram_sessions`
- `SignatureApp.test.jsx` — load, disabled submit, success, E2E bypass
- `e2e/telegram-sign-miniapp.spec.cjs` (optional, preferred)
- **Regression:** `e2e/public-application.spec.cjs` or `e2e/guest-application-intake.spec.cjs`

---

## Phase D — Implementation checklist

- [ ] Phase A complete; baseline tests green
- [ ] `buildApplicationDoc.js` + `upsertApplicationDoc.js` extracted; `guestApplication.js` unchanged contract
- [ ] `functions/telegram/*` + exports in `functions/index.js`
- [ ] `telegram_sessions` rules (client deny)
- [ ] `schemaAdapter` + conversation engine + MVP field behavior
- [ ] Violations/accidents “yes” branch implemented per B.4
- [ ] Upload metadata `{ name, url, storagePath }`
- [ ] Consent in chat; signature + `signatureDate` / `signatureType` in Mini App
- [ ] `vite.config.js` MPA + `telegram-sign.html`
- [ ] `firebase.json` rewrite **before** catch-all
- [ ] Feature flag `telegramApply`
- [ ] `.env.example` updated
- [ ] All tests + callable contract green
- [ ] Docs updated

---

## Phase E — Explicit do-not-do list

- Do not store bot token in frontend or `VITE_*`.
- Do not echo SSN / full DOB in chat.
- Do not change `submitGuestApplication` request/response for web.
- Do not return full `formData` from `getTelegramSessionStatus`.
- Do not duplicate Firestore upsert logic in Telegram callable.
- Do not import `src/` schema modules directly into Functions (port to CJS).
- Do not require bot token at deploy; webhook must not throw when tokenless.
- Do not register webhook in code (manual ops later).
- Do not commit `.env` or real tokens.
- Do not add unrelated refactors.

---

## Phase F — Definition of done

1. Empty `TELEGRAM_BOT_TOKEN`: build, deploy, all existing tests pass.
2. Token configured locally: `/start apply_<slug>` works; feature flag enforced.
3. Mini App submits signature; application under `companies/{id}/applications/` with `sourceType: 'Telegram Bot'`.
4. Web `/apply/:slug` unchanged (E2E regression green).
5. Recruiter dossier renders Telegram application without errors.
6. Callable contract check includes new callables.

---

## Phase G — Suggested commit structure

Use a Git-enabled shell (git may not be on PATH in some environments).

1. `refactor(functions): extract buildApplicationDoc and upsertApplicationDoc`
2. `feat(functions): telegram webhook, session engine, callables`
3. `feat(rules): deny client access to telegram_sessions`
4. `feat(web): telegram signature mini app + hosting rewrite`
5. `feat(admin): telegramApply feature flag`
6. `test: telegram unit, rules, mini app, guest regression`
7. `docs: telegram apply setup and callable map`

---

## Reference: existing patterns to copy

| Need | Copy from |
|------|-----------|
| HTTP webhook | `functions/integrations/facebook.js` |
| Tokenized public flow | `publicSigning.js`, `SigningRoom.jsx` |
| Guest submit | `guestApplication.js`, `applicationId.js` |
| Employer validation | `employmentApplicationHelpers.js`, `Step6_Employment.jsx` |
| Signature canvas | `signature.js`, `Step9_Consent.jsx` |
| Slug lookup | `PublicApplyHandler.jsx` |
| Upload shape | `PublicApplyHandler.jsx` (`prepareGuestUpload` / file metadata) |
| Company intake | `companyTenant.js` |
| Rate limits | `rateLimiter.js` |
| Feature flags | `FeaturesView.jsx` |
| E2E bypass | `e2eMode.js` |

---

## Token configuration (human — out of scope)

1. Create bot via @BotFather  
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` in `functions/.env` + CI secrets  
3. Register webhook → `telegramWebhook` URL; set `secret_token` if using `TELEGRAM_WEBHOOK_SECRET`  
4. BotFather Mini App URL → `https://truckerapp-system.web.app/telegram/sign`

---

## Changelog (plan review amendments)

| Date | Amendment |
|------|-----------|
| 2026-06-02 | Merged approved user implementation plan into brief |
| 2026-06-02 | Split **`buildApplicationDoc`** + **`upsertApplicationDoc`** (collision/merge logic must not be reimplemented) |
| 2026-06-02 | MVP: ≥1 employer, consent in chat (incl. `agree-psp`), signature-only Mini App |
| 2026-06-02 | `getTelegramSessionStatus` required; minimal response (no full formData) |
| 2026-06-02 | Hosting: `/telegram/sign` → `/telegram-sign.html` **before** SPA catch-all |
| 2026-06-02 | Violations/accidents **yes** branch must be explicit (Option A recommended) |
| 2026-06-02 | Set `signatureDate`, `signatureType: 'drawn'` on complete |
| 2026-06-02 | Upload metadata `{ name, url, storagePath }` + signed read URL |
| 2026-06-02 | Feature flag from private `companies` doc; slug via `public_profiles` |
| 2026-06-02 | Webhook return **200** when tokenless; watch upload latency |
| 2026-06-02 | Out of scope: post-application e-docs, Groq autofill (Phase 2) |
| 2026-06-02 | `schemaAdapter` CJS fallback; do not import `src/` from Functions |
| 2026-06-02 | Implementation pass: Telegram MVP wired with core fields, >=1 employer, chat consent, signature-only Mini App, tokenless no-op webhook, and Phase 2 omissions documented above |

---

*End of agent brief.*
