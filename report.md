# SafeHaul Production Readiness Audit Report

## 1. Audit Metadata

- Project: `SafeHaul-for-Gemini-Antigravity`
- Repository root: `C:\Users\Kholmurod\Desktop\SafeHaul-for-Gemini-Antigravity`
- Audit date: 2026-03-08 (Asia/Tashkent) — last updated 2026-03-10
- Auditor: Codex (GPT-5 coding agent)
- Audit type: Full-scale production readiness and security audit with targeted security remediation
- Code changes made: Security fixes for SH-001, SH-002, SH-003, SH-005, SH-006, SH-011

## 2. Executive Summary

### Final Verdict

**Not yet production ready** (7 of 11 issues still open).

Critical and high security issues SH-001, SH-002, SH-003, SH-005, and SH-006 have been **fixed** in this audit pass.
SH-011 (secrets in git history) has been partially mitigated (files untracked; history not purged).

Remaining blockers before production launch:

- SH-004: Guest application submission can overwrite records (data integrity)
- SH-007: Known production dependency vulnerabilities (`jspdf`, `axios`, `fast-xml-parser`)
- SH-008: Test framework mismatch makes CI unreliable
- SH-009: Lint pipeline is broken/noisy
- SH-010: CI validates only part of the system
- SH-011: `.env` secrets were in git history — **rotate all keys immediately** (see SH-011)

### Business Risk in Plain Language

With the critical security holes patched (email impersonation, storage abuse, privilege escalation, app-check-only writes, webhook forgery), the immediate exploit surface is substantially reduced.  
However the app should still **not be released** until SH-004 is hardened, SH-007 vulnerabilities are patched, and quality gates (lint, tests, CI) are operational.

---

## 3. Scope and Methodology

## 3.1 Scope Reviewed

- Frontend (`src/`, root configs, build/test/lint scripts)
- Backend Firebase Functions (`functions/`)
- Firestore rules and Storage rules
- Deployment/CI workflows (`.github/workflows`)
- Dependency health (`npm audit` root + functions)
- Environment and secret handling patterns

## 3.2 What Was Executed

### Automated checks run

1. `npm run lint` (root)
2. `npm run test -- --run` (root / Vitest)
3. `npm run build` (root / Vite production build)
4. `npm --prefix functions test -- --runInBand` (functions / Jest)
5. Backend lint equivalents (direct `eslint` from `functions/`)
6. `npm audit --json` and `npm audit --omit=dev --json` (root)
7. `npm --prefix functions audit --json` and `npm --prefix functions audit --omit=dev --json` (functions)

### Key outcomes

- Root lint failed with **2154 issues** (`626 errors`, `1528 warnings`).
- Root tests failed (`3` test files failed; `4` tests failed).
- Functions Jest tests failed (framework mismatch with Vitest-style tests).
- Production build succeeded, but emitted large chunk warnings.
- Production audits found unresolved high/critical vulnerabilities.

---

## 4. Detailed Findings

Each finding includes:

- Plain-language explanation
- Technical evidence
- Attack scenario
- Impact
- Remediation
- Verification checklist

---

## SH-001: Guest upload path is too open (Critical) — **FIXED**

- Severity: **Critical**
- Category: Access Control / Abuse Prevention
- Status: **Fixed** — `src/storage.rules` line 57 now requires `request.appcheck != null && isValidFile()` for guest upload creation.

### Plain-language explanation

Right now, strangers can upload files too easily. The system does not require strong identity checks on some guest upload paths. This is like letting people throw boxes into your warehouse because they "look like they came from your app."

### Technical evidence

- `src/storage.rules:55` to `src/storage.rules:57`
  - Guest upload path allows `create` with only `isValidFile()`
  - No authentication requirement for create
- `src/storage.rules:56`
  - Read allows `request.appcheck != null`
- `functions/storageSecure.js:23` to `functions/storageSecure.js:37`
  - Missing App Check does not block request
  - Unauthenticated callers are rate-limited, but still allowed

### Attack scenario

1. Attacker scripts calls to guest upload URL generation.
2. Attacker uploads many files (valid mime types) repeatedly.
3. Storage usage and costs increase.
4. System can be degraded (resource abuse) and cluttered with malicious/unwanted files.

### Impact

- Financial: storage and bandwidth cost spikes
- Operational: noisy or polluted document storage
- Security: higher abuse surface for malware/phishing file payloads

### Recommended fix

1. Require either authenticated user ownership or strict one-time signed upload tokens tied to a server-side record.
2. Enforce App Check as required (not warning only) for public upload routes.
3. Bind each upload permission to:
   - specific company,
   - specific application,
   - specific path prefix,
   - short expiration,
   - max size/content type.
4. Add anti-abuse controls:
   - per-IP + per-device + per-company quotas,
   - global circuit breaker.

### Verification checklist

- Unauthenticated call without valid token fails.
- App Check missing in production fails.
- Upload allowed only for existing server-issued upload intent.
- Abuse simulation cannot exceed configured quota.

---

## SH-002: Any authenticated user can send email as any company (Critical) — **FIXED**

- Severity: **Critical**
- Category: Authorization
- Status: **Fixed** — `functions/companyAdmin.js` `sendAutomatedEmail` now calls `assertCompanyAdmin(uid, companyId, token)` before sending. A user who is not a member of the target company receives `permission-denied`.

### Plain-language explanation

The "send automated email" function checks only whether user is logged in, not whether user belongs to that company. This means a random logged-in user could send email pretending to be another company.

### Technical evidence

- `functions/companyAdmin.js:71` to `functions/companyAdmin.js:79`
  - `sendAutomatedEmail` checks only `request.auth`
- `functions/emailService.js:47` to `functions/emailService.js:65`
  - Loads SMTP config for provided `companyId`
- `functions/emailService.js:77`+
  - Sends email using that company's SMTP credentials

### Attack scenario

1. Attacker signs up and logs in.
2. Attacker calls callable function with victim `companyId`.
3. Function loads victim company SMTP settings.
4. Function sends outbound email from victim identity.

### Impact

- Brand/reputation damage
- Phishing risk
- Potential legal/compliance exposure
- Email provider reputation penalties / blacklisting

### Recommended fix

1. Enforce RBAC in `sendAutomatedEmail`:
   - allow only `company_admin`, `hr_user`, `recruiter` for that same company, or `super_admin`.
2. Add explicit membership verification (`memberships` + custom claims).
3. Add audit logging for sender identity, company, template, recipient count.
4. Add per-user and per-company outbound rate limits.

### Verification checklist

- Non-member authenticated user receives `permission-denied`.
- Member of company can send only for own company.
- `super_admin` can send only with explicit audited intent.

---

## SH-003: Privilege escalation via editable user profile fields (High) — **FIXED**

- Severity: **High**
- Category: Broken Access Control
- Status: **Fixed** — `functions/bulkActions/helpers/auth.js` `assertCompanyAdmin` now:
  1. Checks custom claims (immutable, server-set) as the primary fast path.
  2. Removed the dangerous mutable `users/{uid}` document role/companyId checks.
  3. Super-admin bypass now reads directly from `admin.auth().getUser()` custom claims, not the user document.

### Plain-language explanation

Some backend checks trust fields in user profile documents. But users are allowed to edit their own profile document. So a user can write "I am admin" in their own data and potentially pass backend authorization checks.

### Technical evidence

- `functions/bulkActions/helpers/auth.js:49` to `functions/bulkActions/helpers/auth.js:51`
  - Authorization accepts `userData.role`, `userData.globalRole`, `userData.companyId`
- `src/firestore.rules:339`
  - User may update own `/users/{userId}` doc

### Attack scenario

1. User updates own `/users/{uid}` document with privileged role/company fields.
2. Calls function protected by `assertCompanyAdmin`.
3. Function trusts manipulated user doc fields.
4. Unauthorized operations succeed.

### Impact

- Unauthorized access to company data/operations
- Potential data theft/modification
- Compliance and trust issues across tenants

### Recommended fix

1. Never trust mutable profile docs for authorization.
2. Use only signed custom claims + verified membership records.
3. Remove permissive fallback checks (`role === admin`, `companyId === ...`) unless sourced from immutable admin-controlled path.
4. Restrict user doc writes to safe fields only in Firestore rules.

### Verification checklist

- Editing own user doc cannot elevate privileges.
- Authorization decisions trace to claims/membership only.
- Pen test: self-edited role fields are ignored by backend auth helper.

---

## SH-004: Guest application submission can overwrite records (High)

- Severity: **High**
- Category: Data Integrity
- Status: Open

### Plain-language explanation

Guest submissions use deterministic IDs (based on company/email/phone) and write with merge mode. If someone can predict that ID, they can overwrite or alter an existing application record.

### Technical evidence

- `functions/guestApplication.js:67`
  - Public callable entry
- `functions/guestApplication.js:74` to `functions/guestApplication.js:76`
  - Missing App Check does not block in production
- `functions/guestApplication.js:133`
  - Deterministic ID generation
- `functions/guestApplication.js:187`
  - `set(..., { merge: true })`

### Attack scenario

1. Attacker knows or guesses victim email/phone/company.
2. Attacker computes same deterministic ID.
3. Submits payload to same document ID.
4. Existing fields get overwritten/merged.

### Impact

- Tampered application data
- Broken hiring decisions and audit trail
- Potential legal/compliance exposure

### Recommended fix

1. Require server-issued one-time submission token for guest flow.
2. For first-write records, use create-only semantics and reject overwrite.
3. If merge is needed, enforce strict field allowlist and immutable fields.
4. Require App Check in production for guest writes.

### Verification checklist

- Duplicate guest submission cannot overwrite critical fields.
- Immutable fields (`applicantId`, `submittedAt`, etc.) cannot be changed once set.
- Replay with same payload/token is rejected.

---

## SH-005: Firestore rules allow App Check-only updates to applications (High) — **FIXED**

- Severity: **High**
- Category: Security Rules Misconfiguration
- Status: **Fixed** — `src/firestore.rules` removed the `request.appcheck != null && isDeterministicApplicationId(...)` update path. Application documents can now only be updated by company team members, the application owner (signed-in), or a super admin.

### Plain-language explanation

Some updates are allowed just because request has App Check, even without user identity ownership checks. App Check proves request came from an app instance, not that the caller is the right person.

### Technical evidence

- `src/firestore.rules:262` to `src/firestore.rules:265`
  - `allow update` includes:
    - `(request.appcheck != null && isDeterministicApplicationId(companyId, applicationId))`

### Attack scenario

1. Attacker gets valid app instance token.
2. Targets predictable application doc id.
3. Sends update with arbitrary fields.
4. Rule path allows update due App Check + deterministic ID condition.

### Impact

- Unauthorized mutation of application documents
- Status/data corruption
- Trust and compliance audit failures

### Recommended fix

1. Remove App Check-only update path for sensitive collections.
2. Require authenticated ownership or company-team role for updates.
3. Apply field-level restrictions for guest-allowed updates (if any).

### Verification checklist

- App Check-only request without auth is denied on update.
- Guest update route limited to explicitly safe fields only.

---

## SH-006: Legacy Facebook webhook fallback is weak (High) — **FIXED**

- Severity: **High**
- Category: Webhook Authentication
- Status: **Fixed** — `functions/integrations/facebook.js`:
  1. Removed hardcoded fallback `'safehaul_verify_123'` verify token.
  2. Webhook now fails-closed (HTTP 500) if either `FACEBOOK_APP_SECRET_VALUE` or `FACEBOOK_VERIFY_TOKEN_VALUE` is not configured.
  3. HMAC signature check is always enforced on POST — no longer conditional on `APP_SECRET` being set (because it is now required).

### Plain-language explanation

Legacy webhook has insecure fallback defaults. If secrets are not set correctly, signature verification can be effectively bypassed or weakly validated.

### Technical evidence

- `functions/integrations/facebook.js:238`
  - Public Gen1 endpoint
- `functions/integrations/facebook.js:241`
  - Default verify token fallback
- `functions/integrations/facebook.js:261` to `functions/integrations/facebook.js:275`
  - Signature check only enforced when `APP_SECRET` is set

### Attack scenario

1. Misconfigured deployment misses secret env variable.
2. Endpoint accepts webhook events without strict signature validation.
3. Attacker sends forged lead events.
4. Fake data enters pipeline.

### Impact

- Fake lead ingestion
- Campaign pollution and wasted recruiter effort
- Trust loss in integration data quality

### Recommended fix

1. Remove insecure defaults entirely.
2. Hard-fail startup/request when secrets are missing.
3. Keep only one hardened webhook path (prefer v2 with strict signature checks).
4. Add monitoring/alert on signature failures and missing secret states.

### Verification checklist

- Deployment with missing secret fails closed.
- Unsigned/invalid signature requests return forbidden.
- Only signed requests from provider are processed.

---

## SH-007: Production dependencies contain known vulnerabilities (High)

- Severity: **High**
- Category: Supply Chain / Dependency Security
- Status: Open

### Plain-language explanation

Several libraries with known security issues are in production dependency tree. Attackers routinely look for these known versions.

### Technical evidence

- Root `npm audit --omit=dev --json` summary:
  - total: 4 (`high: 2`, `moderate: 2`)
  - includes direct `jspdf` vulnerability path
- Functions `npm audit --omit=dev --json` summary:
  - total: 14 (`critical: 1`, `high: 2`, `low: 11`)
  - includes direct `axios` high vulnerability
  - includes transitive critical `fast-xml-parser`
- Package references:
  - `package.json:25` (`jspdf`)
  - `functions/package.json:21` (`axios`)

### Impact

- Increased exploitability through known attack patterns
- Compliance issues (if policy requires clean critical/high)
- Higher incident probability over time

### Recommended fix

1. Prioritize remediation of critical/high prod vulnerabilities.
2. Upgrade direct dependencies first (`jspdf`, `axios`).
3. Resolve transitive vulnerabilities via lockfile refresh and constrained upgrades.
4. Add policy gate: fail CI on critical/high in production tree.

### Verification checklist

- `npm audit --omit=dev` at root and functions returns no critical/high.
- Dependency update tested by unit/integration/regression suite.

---

## SH-008: Test framework mismatch makes test results unreliable (Medium)

- Severity: **Medium**
- Category: Quality Engineering
- Status: Open

### Plain-language explanation

Backend test script says "use Jest", but some tests are written in Vitest style (`vi`, ES module imports). So tests fail for tooling reasons, not only code behavior. This makes your release confidence low.

### Technical evidence

- `functions/package.json:11`
  - test script: `jest`
- Vitest-style tests in functions:
  - `functions/test/unit/encryption.test.js:2`
  - `functions/test/unit/rateLimiter.test.js:2`
  - `functions/test/bulkActions.test.js:2`
  - `functions/test/integration/driverFlow.test.js:5`
- Root test setup:
  - `vitest.config.js:12` (`globals: true`)

### Impact

- False negatives / false positives in CI
- Broken trust in "tests passed"
- Slower development due noisy failures

### Recommended fix

1. Standardize backend tests on one framework (Jest or Vitest).
2. Align module format (CommonJS vs ESM) across test files and runner.
3. Split frontend and backend test commands cleanly.

### Verification checklist

- `npm test` (root) green and scoped to frontend only.
- `npm --prefix functions test` green and scoped to backend only.
- CI runs both and fails only on real behavior regressions.

---

## SH-009: Lint pipeline is broken/noisy and not a reliable gate (Medium)

- Severity: **Medium**
- Category: SDLC Quality Gate
- Status: Open

### Plain-language explanation

Lint checks currently fail for generated/minified files and environment script incompatibilities. This creates too much noise and hides real issues.

### Technical evidence

- `package.json:11` / `package.json:12`
  - root lint runs frontend then backend
- `eslint.config.js:7`
  - ignores functions, but not generated worker artifact in `public/`
- Frontend lint output:
  - `2154` problems (`626` errors, `1528` warnings)
  - includes `public/pdf.worker.min.mjs`
- `functions/package.json:5`
  - `ESLINT_USE_FLAT_CONFIG=false ...` (Unix style env assignment; fails on Windows)

### Impact

- Developers ignore lint due noise
- Real regressions hidden
- Platform-specific breakages in local/CI workflows

### Recommended fix

1. Exclude generated/minified artifacts from lint.
2. Make scripts cross-platform (`cross-env` or node wrapper).
3. Keep lint focused on source files only.
4. Keep error-level rules small and meaningful.

### Verification checklist

- Lint runs cleanly on supported OSes.
- Generated files are excluded.
- Error count reflects real code issues only.

---

## SH-010: CI validates only part of the system (Medium)

- Severity: **Medium**
- Category: CI/CD Coverage Gap
- Status: Open

### Plain-language explanation

Current GitHub workflow mostly tests `functions/` and does not enforce full root checks (frontend lint/test/build). So you can merge changes that break the web app.

### Technical evidence

- `.github/workflows/main.yml:14`
  - sets `working-directory: ./functions`
- `.github/workflows/main.yml:29`, `.github/workflows/main.yml:33`
  - runs lint and test only in functions job

### Impact

- Frontend regressions reach main branch
- Delayed detection of release blockers
- Lower confidence in deployment automation

### Recommended fix

1. Add separate CI jobs:
   - frontend lint
   - frontend unit tests
   - frontend production build
   - backend lint/tests
2. Add dependency audit gate for production tree.
3. Add status checks required before merge.

### Verification checklist

- PR cannot merge unless all app layers pass.
- CI artifact includes built frontend output.

---

## SH-011: `.env` files are tracked in git history (Medium process risk) — **PARTIALLY MITIGATED**

- Severity: **Medium**
- Category: Secret Management
- Status: **Partially Mitigated**
  - `.env` and `.env.local` have been removed from git tracking (`git rm --cached`).
  - `.env.example` template added so contributors know what variables to supply without committing values.
  - **ACTION REQUIRED**: The secrets were already committed in git history. All values that appeared in the committed `.env` file must be **rotated immediately**:
    - Firebase API Key (`VITE_FIREBASE_API_KEY`) — regenerate in Firebase Console
    - Sentry DSN (`VITE_SENTRY_DSN`) — revoke and regenerate in Sentry
    - reCAPTCHA Enterprise site key (`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`) — rotate in Google Cloud Console
    - Super admin email (`VITE_SUPER_ADMIN_EMAIL`) — update the value and re-deploy
  - To fully purge from history, run `git filter-repo` (or BFG Repo Cleaner) and force-push. Coordinate with all contributors to re-clone.

---

## 5. Additional Observations (Non-blocking but important)

1. Build performance warning:
   - Production build passes, but warns about large chunks (`>500 kB`), including ~954 kB main asset.
   - Recommendation: code-split large routes/features.

2. E2E gap:
   - Playwright config exists, but no tracked `e2e/` tests found.
   - Recommendation: add at least smoke tests for login, application submit, admin dashboard, signing flow.

3. Mixed role-claim patterns:
   - Some code checks `token.super_admin`, others `globalRole` under different structures.
   - Recommendation: centralize claim schema and enforce one canonical check.

---

## 6. Production Readiness Matrix

| Area | Status | Notes |
|---|---|---|
| AuthZ / Access Control | **FIXED** | SH-001, SH-002, SH-003, SH-005 resolved |
| Data Integrity | FAIL | SH-004 still open |
| Webhook Security | **FIXED** | SH-006 resolved |
| Dependency Security | FAIL | SH-007 still open |
| Test Reliability | FAIL | SH-008 still open |
| Lint/Static Gates | FAIL | SH-009 still open |
| CI/CD Coverage | FAIL | SH-010 still open |
| Secret Hygiene | PARTIAL | SH-011: files untracked; **rotate all committed secrets** |
| Buildability | PASS (with warnings) | Build succeeds but chunk size warning |

---

## 7. Prioritized Remediation Plan

## Phase 0 (Done ✅)

1. ✅ SH-002: Email authorization — `sendAutomatedEmail` now enforces company membership.
2. ✅ SH-001 + SH-005: Upload and Firestore rules lockdown.
3. ✅ SH-003: Removed mutable profile-field auth trust; custom claims are the primary check.
4. ✅ SH-006: Facebook webhook is now fail-closed and always enforces HMAC signature.

## Phase 1 (Immediate — Within 48 hours)

1. **ROTATE ALL COMMITTED SECRETS** (SH-011): Firebase API key, Sentry DSN, reCAPTCHA site key, super admin email. This is urgent because the secrets are in git history.
2. Patch SH-004 (guest write integrity controls).
3. Resolve SH-007 high/critical production dependency vulnerabilities.

## Phase 2 (Within 1 week)

1. Fix SH-008 (test framework consistency).
2. Fix SH-009 (lint signal quality and cross-platform scripts).
3. Fix SH-010 (full CI coverage and required checks).

## Phase 3 (Within 1 month)

1. Complete SH-011 full history purge (`git filter-repo`, force-push, re-clone).
2. Add E2E smoke suite and release checklist.
3. Add periodic security regression checks.

---

## 8. Definition of "Production Ready" for This Project

The app should not be marked production-ready until all conditions below are true:

1. No open critical/high security findings in this report.
2. `npm audit --omit=dev` has no critical/high for root and functions.
3. Root lint, root tests, functions lint, functions tests all pass in CI.
4. CI includes frontend build verification.
5. Access control logic uses immutable trusted sources only (claims + memberships).
6. Guest/public endpoints are fail-closed and abuse-protected.
7. Secret management policy is implemented and validated.

---

## 9. Re-test Plan After Fixes

After remediation, run:

1. Security regression tests:
   - Unauthorized email send attempts
   - Unauthorized application update attempts
   - Unauthorized guest upload attempts
   - Forged webhook attempts
2. Full quality gate:
   - lint, tests, build (root + functions)
3. Dependency scan:
   - root/functions `npm audit --omit=dev`
4. Manual smoke:
   - login
   - driver application submit
   - admin workflows
   - signing workflow

---

## 10. Closing Statement

The architecture has strong foundations (modular backend, roles concept, rules hardening effort), but current security/control gaps are large enough to block a safe production launch.  
Addressing the findings in the priority order above will materially reduce risk and create reliable release confidence.

