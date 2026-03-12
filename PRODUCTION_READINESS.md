## SafeHaul – Production Readiness Audit (2026‑03‑10)

### 1. Scope & Assumptions

- **Scope**: Frontend (Vite/React), Firebase Hosting, Firebase Cloud Functions, Firestore security rules, CI pipeline.
- **Source of truth**: Current `main` branch plus working tree diffs as of 2026‑03‑10.
- **Assumptions**:
  - Production and CI will run on **Node 20.x** (matching `functions/package.json` and GitHub Actions).
  - Firebase project configuration (Auth, Firestore indexes, Hosting, App Check, runtime config) is already provisioned as described in `README.md` / `ARCHITECTURE.md`.

### 2. High‑Priority Findings & Recommendations

- **F1 – Lockfile not tracked (reproducibility risk)**
  - **Finding**: `.gitignore` was ignoring `package-lock.json` while `package-lock.json` and `functions/package-lock.json` exist and are modified.
  - **Risk**: Non‑deterministic installs between dev/CI/prod; “works on my machine” drift.
  - **Status**: **Fixed in this audit**.
    - `package-lock.json` is no longer ignored; lockfiles are expected to be tracked.
  - **Recommendation**:
    - Commit both lockfiles to `main`:
      - `git add package-lock.json functions/package-lock.json`
      - `git commit -m "chore: track lockfiles for reproducible builds"`
    - Treat changes to these files as part of normal review for dependency updates.

- **F2 – Node version mismatch (local vs CI/prod)**
  - **Finding**:
    - `functions/package.json` declares `"engines": { "node": "20" }`.
    - GitHub Actions workflow uses Node 20.x.
    - Local environment observed during this audit was **Node v24.11.0**, leading to `EBADENGINE` warnings and tooling mismatches.
  - **Risk**: Subtle behavior differences; CI green while local red (or vice versa).
  - **Recommendation**:
    - Standardize on **Node 20.x** for all environments that run builds or Cloud Functions:
      - Use a version manager (e.g. `nvm`, `fnm`, `Volta`) and set the local version to 20.x.
      - Optionally add an `.nvmrc` / `.node-version` with `20` to document the requirement.
    - Re‑run locally on Node 20.x:
      - `npm ci`
      - `npm run build`
      - `npm run lint`
      - `npm test`
      - `cd functions && npm ci && npm run lint && npm test`

- **F3 – Incomplete toolchain install during checks**
  - **Finding**:
    - `npm run build` failed because `@vitejs/plugin-react` could not be resolved while `npm ci` was still running.
    - `npm run lint` and `functions/npm run lint` failed with `eslint` not found before dependencies finished installing.
  - **Risk**: False negatives during local audits; masks real issues until later in the pipeline.
  - **Recommendation**:
    - Always run installs to completion before invoking CI‑like scripts:
      - Root: `npm ci`
      - Functions: `cd functions && npm ci`
    - Once installs complete, treat any remaining failures in `build`, `lint`, or `test` as real issues to fix before release.

- **F4 – Dependencies with known vulnerabilities**
  - **Finding**:
    - `cd functions && npm ci` reported **13 vulnerabilities** (10 low, 2 moderate, 1 high) at the time of this audit.
  - **Risk**: Potential exploit paths in transitive dependencies (most often low, but the high‑severity item must be understood).
  - **Recommendation**:
    - From `functions/`, run:
      - `npm audit`
    - For low/moderate issues:
      - Run `npm audit fix` where it does not introduce breaking changes.
    - For the high‑severity issue:
      - Investigate the specific package and path from `npm audit`.
      - If a patch/upgrade is available:
        - Update the dependency and re‑run all tests.
      - If no safe upgrade exists:
        - Document a **formal risk acceptance**:
          - Why the vulnerable code path is not reachable or is mitigated by other controls (e.g., App Check, auth, Firestore rules).
          - Plan and owner for re‑evaluation on a future date.

- **F5 – Large set of deletions (backfill scripts, reports, artifacts)**
  - **Finding**:
    - Git diff shows ~1800 deletions across 21 files, mostly:
      - Historical backfill scripts (`functions/backfillEmployerFields.js`, `functions/scripts/backfillPhoneNumbers.js`, `functions/statsBackfill.js`).
      - Local reports (`report.md`, `issuestoaddress.md`) and test output artifacts (`test-results.json`, `vitest-output.txt`).
  - **Risk**:
    - Operational: if any of these scripts were still used for production maintenance, deleting them without a replacement runbook could slow incident response or data repair.
  - **Recommendation**:
    - Confirm with operations/engineering:
      - These scripts are **truly legacy** and no longer used, or
      - They have been replaced with documented runbooks / new functions.
    - If they are no longer needed:
      - Keep them deleted (good for surface‑area reduction).
    - If any are still needed:
      - Restore them or move them into a dedicated `tools/` or `scripts/` directory with clear documentation and restricted access.

### 4. Security & Access Control Review (Spot‑Check)

- **Firestore rules (`src/firestore.rules`)**
  - Positive patterns observed:
    - Role‑based checks using **custom claims**: `isSuperAdmin`, `isCompanyAdmin(companyId)`, `isCompanyTeam(companyId)`, `isStaff`.
    - Strict handling of:
      - `verification_requests` (Cloud Functions only).
      - Company data under `/companies/{companyId}` and subcollections like `templates`, `message_templates`, `bulk_sessions`, `segments`, `notifications`, `pipeline_entries`.
      - Application subcollections (`dq_files`, `general_documents`) with parent ownership checks (`isParentApplicationOwner`).
      - Global collection group queries (`{path=**}/applications`, `{path=**}/leads`, `{path=**}/activity_logs`, `{path=**}/signing_requests`).
    - Guest application submissions are explicitly designed to **bypass rules via Admin SDK**, with rate limiting and App Check monitoring in the Cloud Function.
  - Recommendations:
    - Maintain alignment between:
      - Custom claims structure used in Auth.
      - Helper functions in `src/firestore.rules`.
      - Backend authorization helpers, e.g. `functions/bulkActions/helpers/auth.js`, `functions/companyAdmin.js`.
    - For any new collections, follow the same pattern:
      - Define clear helper functions and narrow `allow` clauses.

- **Cloud Functions (security‑sensitive areas)**
  - `functions/bulkActions/helpers/auth.js` / `functions/companyAdmin.js`:
    - Use Firestore membership, company documents, and **Auth custom claims** to assert admin access.
    - Leverage `admin.auth().getUser` to check `customClaims.globalRole === 'super_admin'` (no hard‑coded backdoors).
  - `functions/guestApplication.js`:
    - Uses deterministic IDs, confirmation numbers, `sanitizeData`, App Check logging, and rate limiting (`checkRateLimit`).
  - `functions/storageSecure.js`:
    - Enforces App Check for uploads, strict MIME whitelist, rate limiting for guests, and signed URL generation with a random file path and download token.
  - `functions/integrations/facebook.js`:
    - Uses Firebase Functions v2 secrets, HMAC signature verification for webhooks (both v2 and v1), and stores tokens in Firestore with timestamps.
  - Recommendation:
    - Keep this pattern for any new functions:
      - **Input validation** (schemas or explicit checks).
      - **Auth and/or App Check enforcement**.
      - **Rate limiting** for public/guest endpoints.
      - **Structured logging** for security‑relevant events.

### 4. CI / CD & Operational Readiness

- **CI (GitHub Actions)**
  - Workflow `CI/CD Pipeline`:
    - `test-functions` job:
      - Node 20.x
      - `working-directory: ./functions`
      - `npm ci`, `npm run lint`, `npm test`
    - `frontend-build` job:
      - Node 20.x
      - Root `npm ci`, `npm run build`
  - Recommendations:
    - Add explicit **status checks** on pull requests so merges to `main` require:
      - `test-functions` success.
      - `frontend-build` success.
    - Optionally add:
      - A `frontend-test` job for Vitest / Playwright.
      - A `rules-deploy-dry-run` (using Firebase emulators or rules unit tests).

- **Deployment**
  - Recommended release flow (GitHub → Firebase):
    1. Developer branch → PR to `main`.
    2. CI runs:
       - `npm ci && npm run build && npm run lint && npm test`.
       - `cd functions && npm ci && npm run lint && npm test`.
    3. Only if all checks pass:
       - Tag a release (e.g. `vX.Y.Z`).
       - Trigger a deployment job (manual or automated) that runs:
         - `firebase deploy` or
         - `npm run build && firebase deploy --only hosting,functions,firestore:rules,storage`.
    4. Post‑deploy:
       - Monitor Sentry (frontend + backend) and Firebase logs for at least one full business day.

### 5. Go / No‑Go Summary

- **Conditional verdict**:
  - **If you implement and enforce all of the following**, SafeHaul is in a **production‑ready** state from the perspective of this audit:
    - `package-lock.json` and `functions/package-lock.json` are tracked and up to date.
    - All environments that build or run functions use **Node 20.x**.
    - `npm ci && npm run build && npm run lint && npm test` succeed at the root.
    - `cd functions && npm ci && npm run lint && npm test` succeed for Cloud Functions.
    - The high‑severity vulnerability reported by `npm audit` in `functions/` is either:
      - Remediated via upgrade, **or**
      - Explicitly documented and accepted with compensating controls.
    - Any deleted backfill / maintenance scripts are confirmed legacy or replaced with documented runbooks.
    - CI (GitHub Actions) is wired as a required gate for `main`.

Under those conditions, and given the strong existing work on Firestore rules, Cloud Function hardening, and CI coverage, this app is well‑positioned for production deployment on Firebase Hosting + Cloud Functions.

