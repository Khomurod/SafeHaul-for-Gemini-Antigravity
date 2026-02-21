# SafeHaul Platform — Remaining Audit Findings

> **Original Audit Date:** February 19, 2026  
> **Last Updated:** February 21, 2026  
> **Note:** All previously fixed items (C3, H2, H3, H5, H6, M7, M8) have been removed. This document contains only the **24 remaining open findings**.

---

## Severity Legend

| Level | Meaning | Action Timeline |
|-------|---------|-----------------| 
| 🔴 **Critical** | Active security risk or broken functionality affecting users right now | Fix immediately |
| 🟠 **High** | Significant risk that could cause data loss, security holes, or major bugs under certain conditions | Fix within 1–2 weeks |
| 🟡 **Medium** | Code quality, consistency, or minor security issues that don't cause immediate harm but will cause problems as the platform grows | Fix within 1 month |
| 🔵 **Low** | Cleanup, optimization, and maintenance items that improve long-term health | Fix when convenient |

---

## 🔴 Critical Findings (2 Remaining)

---

### C1: Two Email Systems Use Incompatible Credential Formats

**What's the problem?**

SafeHaul has two separate email-sending systems:

1. **`emailService.js`** — The general-purpose email sender used for automated emails, bulk messages, etc. This system looks for email credentials stored as `smtpHost`, `smtpPort`, `smtpUser`, and `smtpPass`. It supports any SMTP provider (Gmail, Outlook, custom mail servers, etc.).

2. **`notifySigner.js`** — The email sender specifically for document signing notifications. This system looks for credentials stored as `email` and `appPassword`, and it's hardcoded to use Gmail only (via `service: 'gmail'`).

Both systems read from the same location in the database (`emailSettings` on the company document, or the `system_settings/email_config` subcollection). But they expect **completely different field names**.

**What happens because of this?**

- If a company sets up their email using the Settings page (which likely saves `smtpHost`, `smtpUser`, `smtpPass`), their **signing notification emails will never send** because `notifySigner.js` is looking for `email` and `appPassword` — fields that don't exist.
- Conversely, if a company somehow configured `email` and `appPassword`, their general automated emails from `emailService.js` would fail.
- In both cases, the failures are **silent** — no error is shown to the user, emails just don't arrive.

**Where exactly does this happen?**

- `functions/emailService.js` — Lines 39, 48–55 (looks for `smtpHost`, `smtpUser`, `smtpPass`)
- `functions/notifySigner.js` — Lines 39, 47–53 (looks for `email`, `appPassword`, uses `service: 'gmail'`)

**Recommendation:**

1. **Create one canonical email sending function** that all parts of the app use. This should be the existing `sendDynamicEmail()` function in `emailService.js`, since it already supports generic SMTP.
2. **Refactor `notifySigner.js`** to call `sendDynamicEmail()` instead of creating its own transporter.
3. **Standardize the credential schema** in the database. All companies should store their email settings using the same field names (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`).
4. **Add a migration step** for any companies that might have the old `email`/`appPassword` format.

**Impact of not fixing:** Companies' document signing emails are silently failing, meaning drivers/signers never receive their signing links.

---

### C2: "Test Email Connection" Feature Doesn't Check the New Settings Location

**What's the problem?**

When the email credential storage was recently migrated, a new location was introduced: instead of storing email settings directly on the company document (`companyData.emailSettings`), they can now also be stored in a subcollection at `companies/{companyId}/system_settings/email_config`.

The main `sendDynamicEmail()` function was correctly updated — it checks the main document first, and if no settings are found there, it falls back to the subcollection. However, the `testEmailConnection()` function was **not updated** with this same fallback. It only checks `companyData.emailSettings`.

**Where exactly does this happen?**

- `functions/emailService.js` — Line 110 in `testEmailConnection()` (missing subcollection fallback)
- Compare with Lines 30–36 in `sendDynamicEmail()` (has the correct fallback)

**Recommendation:**

1. **Extract the credential-fetching logic** into a single helper function (e.g., `getEmailSettings(companyId)`) that encapsulates the fallback logic.
2. **All three email functions** (`sendDynamicEmail`, `testEmailConnection`, `testEmailCredentials`) should use this same helper.

**Impact of not fixing:** Companies using the new settings location see a confusing "test failed" message even though their email actually works.

---

## 🟠 High Findings (2 Remaining)

---

### H1: Public Signing Endpoint Exposes Signer's Email Address

**What's the problem?**

When someone receives a document to sign, they click a link that takes them to a public signing page. The frontend calls a Cloud Function (`getPublicEnvelope`) to fetch the document details. This function returns the document title, fields to fill, and a link to view the PDF — but it also returns the **signer's email address** (`recipientEmail`).

This is a public endpoint — anyone with the signing link can call it. If a signing link is forwarded, shared, or intercepted, the attacker can see the signer's email address without any authentication.

**Where exactly does this happen?**

- `functions/publicSigning.js` — Line 54 (returns `recipientEmail` in the response)

**Recommendation:**

1. **Remove `recipientEmail` from the API response.** The signer already knows their own email.
2. **If the frontend needs to display the email**, mask it (e.g., `j***@example.com`).
3. **Audit all public endpoints** to ensure no other PII is leaked.

**Impact of not fixing:** Potential GDPR/CCPA compliance violation. If a signing link is shared, any third party can discover the signer's email address.

---

### H4: Shadow Profile Merge Permanently Deletes Data Without Backup

**What's the problem?**

When a new driver registers with a phone number that already exists in the system (because they were previously added as a lead or "shadow profile"), the `userOnboarding.js` function tries to merge the old data into the new profile and then **permanently deletes the old document**.

There are two problems:

1. **No backup is created** before deletion. If the merge logic misses any data (and it currently only merges `source` and `recruiterId` — many other fields could be lost), that data is gone forever.

2. **Subcollections are not transferred.** In Firestore, deleting a document does NOT delete its subcollections. So if the shadow profile had `internal_notes`, `activity_logs`, or other subcollections, those become orphaned.

**Where exactly does this happen?**

- `functions/userOnboarding.js` — Lines 54–73 (merge logic and deletion)

**Recommendation:**

1. **Never delete without archiving** — Copy the entire document to an `archived_profiles` collection first.
2. **Transfer subcollections explicitly** — Use `listCollections()` and batch-copy every document.
3. **Expand the merge logic** — Currently only `source` and `recruiterId` are merged.
4. **Log the merge operation** — Create a detailed activity trail entry.

**Impact of not fixing:** Potential data loss when drivers register. Recruiters may lose notes, call history, and lead attribution data.

---

## 🟡 Medium Findings (6 Remaining)

---

### M1: Signature Image Paths Are Not Validated in Document Sealing

**What's the problem?**

The `digitalSealing.js` function creates finalized signed PDFs. When processing the document, it downloads the original PDF and any signature images. For the main PDF file, the code **correctly validates** that the file path starts with an allowed prefix — this prevents one company from accessing another company's files.

However, when downloading **signature images**, no such validation is performed. The signature path comes directly from the `fieldValues` data in Firestore.

**Where exactly does this happen?**

- `functions/digitalSealing.js` — Lines 43–52 (main PDF path validation — correct)
- `functions/digitalSealing.js` — Lines 114–119 (signature path — NO validation)

**Recommendation:**

1. **Apply the exact same path validation** to signature file paths.
2. **Verify downloaded files are PNG images** (check file header/magic bytes).

**Impact of not fixing:** A sophisticated attacker who gains write access to a signing request could potentially access files belonging to other companies.

---

### M2: Document Audit Trail "Checksum" Is Not a Real Checksum

**What's the problem?**

When a document is signed and sealed, the audit trail page includes what's labeled as a "Checksum Hash" — but it's just the request ID + timestamp, not a cryptographic hash:

```
Checksum Hash: ${requestId.substring(0, 8)}-${Date.now()}
```

**Where exactly does this happen?**

- `functions/digitalSealing.js` — Line 159

**Recommendation:**

1. **Compute a SHA-256 hash** of the final PDF bytes before uploading.
2. **Store the hash in both the PDF audit page and in Firestore** for independent verification.

**Impact of not fixing:** If a signed document is ever challenged legally, the fake "checksum" provides zero proof of integrity.

---

### M3: Super Admin Email Hardcoded in Frontend

**What's the problem?**

In `DataContext.jsx`, there's a line that grants super admin access to anyone logged in with `holmurod96@gmail.com`, regardless of custom claims:

```javascript
const isSuperAdmin = claims.globalRole === 'super_admin' || roles.globalRole === 'super_admin' || user.email === 'holmurod96@gmail.com';
```

The **backend** does NOT have this — it only uses proper custom claims. This is well-commented as intentional (safety net).

**Where exactly does this happen?**

- `src/context/DataContext.jsx` — Line 75

**Recommendation:**

1. **Move this fallback email to an environment variable** so it's not visible in the compiled JavaScript bundle.
2. **Consider a "break glass" recovery mechanism** via Firebase Remote Config instead.

**Impact of not fixing:** Low immediate risk since backend security is proper. However, if the Gmail account is compromised, an attacker could view (but not modify) sensitive admin information.

---

### M4: Guest-Uploaded Files Are Inaccessible Through Normal Firebase SDK

**What's the problem?**

Guest upload paths use `guest_uploads` in the `{applicantId}` position. Storage rules require `isOwner(applicantId)`, which fails for `guest_uploads`. Signed URLs work fine, but direct SDK reads fail.

**Where exactly does this happen?**

- `src/storage.rules` — Lines 54–60
- `functions/storageSecure.js` — Line 46

**Recommendation:**

Add a specific storage rule for guest uploads:
```
match /companies/{companyId}/applications/guest_uploads/{allPaths=**} {
  allow read: if isCompanyTeam(companyId) || isSuperAdmin();
  allow create: if request.resource.size < 10 * 1024 * 1024;
}
```

**Impact of not fixing:** Frontend code that tries to read guest files directly will encounter "Permission Denied" errors.

---

### M5: Document Signing Access Tokens Never Expire

**What's the problem?**

After a document is signed, the `accessToken` remains active forever. While you can't re-sign, the link still reveals that a document exists, was signed, and who signed it (`recipientName`).

**Where exactly does this happen?**

- `functions/publicSigning.js` — Lines 22–29

**Recommendation:**

1. **Invalidate the access token after signing** — Delete or null the `accessToken` field.
2. **Add expiration timestamps** — Set `expiresAt` (e.g., 7 days).
3. **Return minimal information** — Only `{ status: 'signed' }`, not `recipientName`.

**Impact of not fixing:** Signing links permanently reveal document status and signer identity.

---

### M6: Phone Number Format Inconsistency in Blacklist

**What's the problem?**

Phone numbers can be formatted differently (`+1234567890`, `1234567890`, `(123) 456-7890`). The blacklist stores whatever format arrives, but lookups might use a different format. If they don't match, **the system sends a message to someone who opted out**.

This could violate TCPA regulations — fines of $500–$1,500 per unsolicited text message.

**Where exactly does this happen?**

- `functions/blacklist.js` — Line 18 (no normalization on save)
- `functions/blacklist.js` — Lines 41–53 (no normalization on lookup)

**Recommendation:**

1. **Normalize to E.164 format** (`+1XXXXXXXXXX`) before storage AND before lookup.
2. **Create a shared `normalizePhone()`** function. `driverSync.js` already has phone normalization — reuse it.
3. **Backfill existing blacklist entries** with normalized phone numbers.

**Impact of not fixing:** Potential TCPA violation — fines up to $1,500 per message sent to someone who opted out.

---

## 🔵 Low Findings (5 Remaining)

---

### L1: Mixed Firebase Functions V1 and V2 Usage

Some files use `firebase-functions/v1`, others use `firebase-functions/v2`. Both work correctly side by side.

- V1: `digitalSealing.js`, `storageSecure.js`, `userOnboarding.js`
- V2: `publicSigning.js`, `notificationTriggers.js`, `systemIntegrity.js`

**Recommendation:** Plan a gradual migration to V2. Don't rush — V1 is not deprecated.

---

### L2: A New Email Connection Is Created For Every Email Send

Every call to `sendDynamicEmail()` creates a new SMTP connection. For single emails, this is fine. For bulk campaigns, consider a connection pool or a transactional email API (SendGrid, Mailgun).

**Impact:** Negligible for current usage.

---

### L3: Guest Applications Don't Require App Check Verification

`submitGuestApplication` logs a warning if App Check fails but allows the submission. This is the correct behavior — blocking legitimate applicants is worse than accepting spam.

**Recommendation:** Add a `suspiciousFlags` field for failed App Check. Consider adding reCAPTCHA v3.

---

### L4: Smart Segment Rules Are Hardcoded

The three segment rules ("Inactive 30 Days", "Ghosted", "New Leads") are in code. Companies can't customize them.

**Recommendation:** When ready, store rules in Firestore and evaluate dynamically. Use a simple DSL: `{ field: 'lastContactedAt', operator: 'olderThan', value: '30d' }`.

---

### L5: Rate Limit Records Accumulate Forever

The `rate_limits` collection grows indefinitely. Records have `expiresAt` but nothing deletes them.

**Recommendation:** Use Firestore TTL policies on the `expiresAt` field — zero code changes needed, just a one-time Firebase Console configuration.

---

## ✅ Positive Architecture Observations

| Pattern | Where | Why It's Good |
|---------|-------|---------------|
| **Reference-based lead assignment** | `leadLogic.js` | Leads shared by reference — no data duplication |
| **Sharded statistics** | `leadDistribution.js` | Prevents 1-write/sec limit bottleneck |
| **Streaming for large datasets** | `leadLogic.js`, `systemIntegrity.js` | Prevents OOM crashes |
| **Admin SDK bypass for guests** | `guestApplication.js` | Reliability over strictness — correct choice |
| **Path traversal prevention** | `digitalSealing.js` | Validates file path prefixes |
| **Encrypted SMS credentials** | `integrations/encryption.js` | AES-256-CBC with env-based key |
| **Idempotent stats aggregation** | `statsAggregator.js` | `processed_signals` prevents double-counting |
| **Comprehensive Firestore rules** | `firestore.rules` | Clean RBAC helpers |
| **Error boundaries and loading states** | `App.jsx`, `DataContext.jsx` | Graceful error handling |
| **Custom claims sync** | `hrAdmin.js` | Roles synced to Auth custom claims |

---

## 🔴🟠 Application Flow Findings (8 Remaining)

> **Trigger:** Reports of "Previous Employment not showing" and "CDL not showing" for driver "Valentin Joseph" (Wenze Trucking).  
> **Root Cause:** Multiple field name mismatches cause data that IS correctly saved in Firestore to be invisible on the company dashboard.

---

### AF1: 🔴 Employer Data Field Names Don't Match Between Form and Display

The form `Step6_Employment.jsx` saves employers with `name`, `street`, `reason`. But the company-side `ExperienceTimeline` reads `companyName`, `address`, `reasonForLeaving`.

**Result:** Employer names show as "Unknown Employer". Data IS in Firestore — just under different field names.

**Fix:** Update `Step6_Employment.jsx` to use schema field names (`companyName`, `address`, `reasonForLeaving`). Run a backfill script in Firestore.

| Files | Lines |
|-------|-------|
| `Step6_Employment.jsx` | Line 26 (`initialEmployer`) |
| `ApplicationTab.jsx` | Lines 282-291 |
| `applicationSchema.js` | Lines 265-275 |

---

### AF2: 🔴 CDL Expiration Date Field Name Mismatch — Badge Always Shows "--"

Schema and form save as `cdlExpiration`. Company view reads `cdlExpirationDate`.

**Fix:** Change `ApplicationTab.jsx` lines 151 and 194 to read `cdlExpiration`.

---

### AF3: 🔴 SchemaRenderer Cannot Render Array Sections

`SchemaSection` only reads `section.fields`, but Employment, Addresses, Violations, and Accidents use `section.itemFields`. These sections render blank in "Full Application" view.

**Fix:** Enhance `SchemaSection` to detect `type: 'array'` and render each item using `itemFields`.

---

### AF4: 🟠 SchemaRenderer Has No File-Type Rendering

File upload fields (`cdl-front`, `medical-card-upload`) have no handler in `renderDisplayMode`. They show `[object Object]`.

**Fix:** Add a `case FIELD_TYPES.FILE:` handler in `renderDisplayMode`.

---

### AF5: 🟠 ExperienceTimeline Only Shows 4 of 11 Employer Fields

Missing: address, city, state, phone, supervisorName, mayContact. DOT regulations (49 CFR 391.21) require employer contact info for Previous Employer Verification.

**Fix:** Expand `ExperienceTimeline` to display all employer fields.

---

### AF6: 🟠 Guest vs Authenticated Application Payloads Differ

| Feature | Authenticated | Guest |
|---------|--------------|-------|
| `driverId` / `userId` | ✅ Set | ❌ Missing |
| `companyName` | ❌ Missing | ✅ Set |
| Array normalization | ❌ No | ✅ Yes |

**Fix:** Unify both submission paths to produce identical document structures.

---

### AF7: 🟡 IdentityCard Uses Wrong Address Key

View reads `appData.address`, form saves as `appData.street`. Street address never appears.

**Fix:** Change `ApplicationTab.jsx` line 128 to read `appData.street`.

---

### AF8: 🟡 PDF Generator Uses Different Employer Field Names

`pdfSections.js` may read `employer.companyName` but form saves as `employer.name`. PDF may show empty employer names.

**Fix:** Align PDF field names with whichever names are settled on after fixing AF1.

---

## Recommended Fix Order

| Priority | Finding | Effort | Reason |
|----------|---------|--------|--------|
| 1 | **C1** — Unify email credential schema | Medium | Signing emails are broken for most companies |
| 2 | **C2** — Fix `testEmailConnection` fallback | Low | Quick fix, restores trust |
| 3 | **AF1** — Fix employer field name mismatch | Low | Directly solves reported "employment not showing" |
| 4 | **AF2** — Fix CDL expiration field name | Trivial | 1-line fix |
| 5 | **AF7** — Fix address field name | Trivial | 1-line fix |
| 6 | **H1** — Stop leaking email in signing endpoint | Low | Simple field removal |
| 7 | **M6** — Normalize phone numbers in blacklist | Medium | TCPA compliance risk |
| 8 | **M1** — Validate signature paths | Low | Quick security hardening |
| 9 | **H4** — Add backup before shadow profile deletion | Medium | Prevents data loss |
| 10 | **AF3** — Add array rendering to SchemaRenderer | Medium | Unlocks Full Application view |
| 11 | **AF4** — Add file rendering to SchemaRenderer | Low | Unlocks CDL/medical previews |
| 12 | **AF5** — Expand ExperienceTimeline | Low | Shows full employer details for PEV |
| 13 | **M2** — Implement real checksum hash | Low | Legal defensibility |
| 14 | **M5** — Expire signing tokens | Low | Privacy hardening |
| 15 | **AF6** — Unify submission payloads | Medium | Data consistency |
| 16 | **L5** — Add TTL for rate limit cleanup | Low | One-time Console config |
| 17 | **All remaining** | Low | Best-effort cleanup |
