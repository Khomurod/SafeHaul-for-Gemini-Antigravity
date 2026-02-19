# SafeHaul Platform — Audit Findings & Recommendations

> **Audit Date:** February 19, 2026  
> **Scope:** Full read-only audit of the entire SafeHaul platform — all backend Cloud Functions, Firestore & Storage security rules, integrations module, shared utilities, and frontend core.  
> **Purpose:** Identify and document all security, logic, data integrity, and architectural issues, and provide world-class best-practice recommendations for each.  
> **Important:** This document contains no code changes. It is a reference guide for prioritized remediation.

---

## Table of Contents

- [Severity Legend](#severity-legend)
- [Critical Findings (C1–C3)](#-critical-findings--must-fix-immediately)
- [High Findings (H1–H6)](#-high-findings--fix-within-1-2-weeks)
- [Medium Findings (M1–M8)](#-medium-findings--fix-within-1-month)
- [Low Findings (L1–L5)](#-low-findings--fix-when-convenient)
- [Positive Architecture Observations](#-positive-architecture-observations)
- [Recommended Execution Order](#-recommended-execution-order)

---

## Severity Legend

| Level | Meaning | Action Timeline |
|-------|---------|-----------------|
| 🔴 **Critical** | Active security risk or broken functionality affecting users right now | Fix immediately |
| 🟠 **High** | Significant risk that could cause data loss, security holes, or major bugs under certain conditions | Fix within 1–2 weeks |
| 🟡 **Medium** | Code quality, consistency, or minor security issues that don't cause immediate harm but will cause problems as the platform grows | Fix within 1 month |
| 🔵 **Low** | Cleanup, optimization, and maintenance items that improve long-term health | Fix when convenient |

---

## 🔴 Critical Findings — Must Fix Immediately

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

**World-Class Recommendation:**

The industry best practice (used by platforms like SendGrid, Mailgun, and Postmark) is to have a **single, unified email abstraction layer**:

1. **Create one canonical email sending function** that all parts of the app use. This should be the existing `sendDynamicEmail()` function in `emailService.js`, since it already supports generic SMTP.

2. **Refactor `notifySigner.js`** to call `sendDynamicEmail()` instead of creating its own transporter. This eliminates the duplicate credential logic entirely.

3. **Standardize the credential schema** in the database. All companies should store their email settings using the same field names (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`). For Gmail users, `smtpHost` would be `smtp.gmail.com`, `smtpPort` would be `587`, `smtpUser` would be their email, and `smtpPass` would be their App Password.

4. **Add a migration step** for any companies that might have the old `email`/`appPassword` format — convert them to the standard format.

**Impact of not fixing:** Companies' document signing emails are silently failing, meaning drivers/signers never receive their signing links. This directly impacts business operations.

---

### C2: "Test Email Connection" Feature Doesn't Check the New Settings Location

**What's the problem?**

When the email credential storage was recently migrated, a new location was introduced: instead of storing email settings directly on the company document (`companyData.emailSettings`), they can now also be stored in a subcollection at `companies/{companyId}/system_settings/email_config`.

The main `sendDynamicEmail()` function was correctly updated — it checks the main document first, and if no settings are found there, it falls back to the subcollection. This ensures emails work regardless of where the settings are stored.

However, the `testEmailConnection()` function was **not updated** with this same fallback. It only checks `companyData.emailSettings`. So if a company's settings are stored in the new subcollection location, testing the connection will always report "Missing SMTP configuration" — even though sending emails would actually work fine.

**Where exactly does this happen?**

- `functions/emailService.js` — Line 110 in `testEmailConnection()` (missing subcollection fallback)
- Compare with Lines 30–36 in `sendDynamicEmail()` (has the correct fallback)

**World-Class Recommendation:**

The best practice here is the **DRY principle (Don't Repeat Yourself)**:

1. **Extract the credential-fetching logic** into a single helper function (e.g., `getEmailSettings(companyId)`) that encapsulates the fallback logic.

2. **All three email functions** (`sendDynamicEmail`, `testEmailConnection`, `testEmailCredentials`) should use this same helper to get credentials.

3. This ensures that any future changes to where/how credentials are stored only need to be updated in one place.

**Impact of not fixing:** Companies using the new settings location see a confusing "test failed" message even though their email actually works. This erodes trust in the platform and generates unnecessary support tickets.

---

### C3: Guest File Upload Has No Rate Limiting

**What's the problem?**

SafeHaul allows guests (people who aren't logged in) to upload files — for example, when applying for a job, they might upload a resume or CDL image. To handle this securely, the app uses a Cloud Function called `getSignedUploadUrl` that generates a temporary, one-time upload link.

The function checks for **App Check** (a Firebase feature that verifies the request comes from your real app, not a script). If App Check passes, the request is allowed. But App Check on the web can be bypassed by a determined attacker.

The critical issue is that the code has a **placeholder comment** for rate limiting but **no actual implementation**:

```
if (!context.auth) {
    // Guest Rate Limiting (IP-based approx)
    // Implementation: We'll trust App Check for now as the primary barrier.
}
```

This means an attacker could write a simple script that requests thousands of upload URLs per second, then upload garbage files to your storage bucket.

**Where exactly does this happen?**

- `functions/storageSecure.js` — Lines 20–28 (empty rate limiting block)

**World-Class Recommendation:**

Leading cloud platforms (AWS, GCP, Cloudflare) all enforce rate limiting on upload endpoints. The recommended approach:

1. **Implement IP-based rate limiting** using the existing `checkRateLimit()` utility that already exists in your codebase (`functions/shared/rateLimiter.js`). Allow a maximum of 10 upload URL requests per IP address per 60-second window.

2. **Add file count limits per session** — Even with rate limiting, set a maximum number of files per application submission (e.g., 5 files max).

3. **Add storage bucket lifecycle rules** in Google Cloud Console — Automatically delete files in the `guest_uploads` folder that are older than 30 days and not linked to any application. This limits the blast radius of any abuse.

4. **Consider Cloud Armor or Cloudflare** in front of your Cloud Functions for additional DDoS protection if the platform grows.

**Impact of not fixing:** An attacker could fill your Google Cloud Storage bucket with junk data, potentially costing hundreds or thousands of dollars in storage fees, and potentially causing legitimate uploads to fail if quotas are exceeded.

---

## 🟠 High Findings — Fix Within 1–2 Weeks

---

### H1: Public Signing Endpoint Exposes Signer's Email Address

**What's the problem?**

When someone receives a document to sign, they click a link that takes them to a public signing page. The frontend calls a Cloud Function (`getPublicEnvelope`) to fetch the document details. This function returns the document title, fields to fill, and a link to view the PDF — but it also returns the **signer's email address** (`recipientEmail`).

This is a public endpoint — anyone with the signing link can call it. If a signing link is forwarded, shared, or intercepted, the attacker can see the signer's email address without any authentication.

**Where exactly does this happen?**

- `functions/publicSigning.js` — Line 54 (returns `recipientEmail` in the response)

**World-Class Recommendation:**

The principle here is **minimum necessary disclosure** (also called "data minimization" under GDPR and CCPA):

1. **Remove `recipientEmail` from the API response.** The signer already knows their own email — they don't need it sent back from the server.

2. **If the frontend needs to display the email** (e.g., "Signing as john@example.com"), mask it (e.g., `j***@example.com`) instead of returning the full address.

3. **Audit all public endpoints** to ensure no other PII (Personally Identifiable Information) is leaked. Check that only the minimum required data is returned in each response.

**Impact of not fixing:** Potential GDPR/CCPA compliance violation. If a signing link is shared or forwarded, any third party can discover the signer's email address.

---

### H2: Pipeline Tracker Trigger Fires Itself 3 Times Per Action

**What's the problem?**

The pipeline tracking system has a Firestore trigger (`onPipelineEntryWrite`) that watches for changes to pipeline entries. When a driver's status changes to "hired" or "rejected," the trigger:

1. **First invocation:** Detects the status change → Appends a system comment ("Driver was hired on 02/19/2026") and updates timestamps.
2. **Second invocation:** The comment change from step 1 triggers the function again → Detects that comments changed → Updates `lastCheckedDisplay` and `lastModifiedAt`.
3. **Third invocation:** The timestamp changes from step 2 trigger the function again → Loop prevention finally catches it (only server-managed fields changed) and stops.

So every single "hire" or "reject" action causes **3 Cloud Function executions** instead of 1. This wastes computing resources and triples your Cloud Functions bill for this trigger.

**Where exactly does this happen?**

- `functions/pipelineTriggers.js` — Lines 64–82 (loop prevention), Lines 104–112 (comment appending that triggers the loop)

**World-Class Recommendation:**

The industry-standard approaches for preventing Firestore trigger loops (used by Firebase's own documentation and Google's best practices):

1. **Use a `_lastUpdatedBy` field** — When the trigger writes back to the document, set a field like `_lastUpdatedBy: 'system'`. At the start of the trigger, check if `_lastUpdatedBy === 'system'` — if so, skip immediately. This reduces 3 invocations to 2 (the minimum possible with self-writing triggers).

2. **Better: Combine all updates into a single write** — Instead of first appending the comment (which triggers re-execution), gather ALL changes (status timestamp + comment + display timestamp) into one single `update()` call. This reduces to 2 invocations total (the original + one echo that gets caught by loop prevention).

3. **Best: Use a separate "audit trail" collection** — Instead of modifying the pipeline entry's `comments` field directly, write the audit note to a separate `audit_trail` subcollection. This eliminates the self-triggering entirely, reducing to just 1 invocation.

**Impact of not fixing:** 3x Cloud Function cost for every pipeline status change. Under heavy usage (e.g., 100 hires/day), this adds up. Also increases the risk of race conditions and unexpected behavior.

---

### H3: Smart Segments Recount All Members on Every Application Update

**What's the problem?**

SafeHaul has "smart segments" — automatic lists of drivers based on rules (e.g., "Inactive 30 Days", "Ghosted", "New Leads"). Every time any application is created or updated, the `segments.js` trigger runs and:

1. Checks if the application matches each segment's rules
2. Adds or removes the application from each segment
3. Then calls `updateSegmentCounts()` which **queries the count of every member in every segment** and writes the new count

Step 3 is the problem. If you have 3 segments and 10,000 applications, every single application update triggers 3 count queries plus 3 writes. At scale, this creates a massive read/write amplification.

**Where exactly does this happen?**

- `functions/segments.js` — Lines 91–99 (`updateSegmentCounts` function)

**World-Class Recommendation:**

This is a well-known scalability pattern in database design. The world-class solutions:

1. **Incremental counting** — Instead of recounting everything, use Firestore's `FieldValue.increment(1)` when adding a member and `FieldValue.increment(-1)` when removing one. This replaces N count queries + N writes with 0 queries + 1 write per segment change.

2. **Distributed counters** (if high write frequency) — If many applications update simultaneously, even `increment()` can hit Firestore's 1-write-per-second-per-document limit. Use Firebase's official distributed counter pattern with shards.

3. **Background recalculation** — Run a scheduled function (e.g., every hour) that recalculates segment counts in bulk, instead of doing it on every single update. This is how analytics platforms like Mixpanel and Amplitude handle aggregate counts.

**Impact of not fixing:** As the platform grows beyond a few hundred applications per company, the segment triggers will consume excessive Firestore reads and writes, increasing costs and potentially hitting Firestore rate limits (causing cascading failures).

---

### H4: Shadow Profile Merge Permanently Deletes Data Without Backup

**What's the problem?**

When a new driver registers with a phone number that already exists in the system (because they were previously added as a lead or "shadow profile"), the `userOnboarding.js` function tries to merge the old data into the new profile and then **permanently deletes the old document**.

There are two problems:

1. **No backup is created** before deletion. If the merge logic misses any data (and it currently only merges `source` and `recruiterId` — many other fields could be lost), that data is gone forever.

2. **Subcollections are not transferred.** In Firestore, deleting a document does NOT delete its subcollections. So if the shadow profile had `internal_notes`, `activity_logs`, or other subcollections, those become orphaned — they still exist in the database but are no longer linked to any parent. They waste storage and can never be found again.

**Where exactly does this happen?**

- `functions/userOnboarding.js` — Lines 54–73 (merge logic and deletion)

**World-Class Recommendation:**

Data migration and merging is a critical operation. Industry best practices (used by CRM platforms like Salesforce and HubSpot for contact deduplication):

1. **Never delete without archiving** — Before deleting the shadow profile, copy the entire document to an `archived_profiles` collection with a reference to the new profile it was merged into. This creates a permanent audit trail.

2. **Transfer subcollections explicitly** — Before deleting the parent, enumerate all subcollections (Firestore Admin SDK provides `listCollections()`) and batch-copy every document to the corresponding subcollection under the new profile.

3. **Expand the merge logic** — Currently only `source` and `recruiterId` are merged. Add a comprehensive field-by-field merge that preserves any data the new profile doesn't already have.

4. **Log the merge operation** — Create a detailed log entry in the new profile's activity trail documenting what was merged, what was kept, and what the shadow profile's original ID was.

**Impact of not fixing:** Potential data loss when drivers register. Recruiters may lose notes, call history, and lead attribution data they previously recorded for that driver.

---

### H5: Notification and Stats Modules Create Their Own Database Instances

**What's the problem?**

The application has a well-designed shared database initialization module (`firebaseAdmin.js`) that creates a single Firestore instance used across most Cloud Functions. However, two modules — `notificationTriggers.js` and `statsAggregator.js` — ignore this shared module and create their own separate Firestore instances using a "lazy initialization" pattern.

While this technically works, it creates risks:

1. **`.settings()` conflicts** — Both modules call `dbInstance.settings({ ignoreUndefinedProperties: true })`. If this is called after any Firestore query has already been made (by the shared instance), it can throw an error in certain Firebase SDK versions.

2. **Configuration drift** — If the shared instance is configured differently (e.g., different timeout settings, different behavior flags), these two modules won't inherit those settings.

3. **Debugging difficulty** — When troubleshooting database issues, having multiple initialization paths makes it harder to understand what's going on.

**Where exactly does this happen?**

- `functions/notificationTriggers.js` — Lines 7–23 (lazy initialization)
- `functions/statsAggregator.js` — Lines 8–23 (identical lazy initialization)

**World-Class Recommendation:**

The **Singleton pattern** is the universally accepted approach for database connections:

1. **Replace the lazy initialization** in both files with a simple import from the shared module: `const { db } = require('./firebaseAdmin');`

2. **Apply any special settings** (like `ignoreUndefinedProperties`) in the shared `firebaseAdmin.js` module so they apply globally.

3. **As a general rule:** No Cloud Function file should ever call `admin.initializeApp()` or `getFirestore()` directly. All access should go through the shared module.

**Impact of not fixing:** Potential for subtle, hard-to-debug errors — especially after Firebase SDK upgrades. The `.settings()` call could fail unpredictably depending on which function cold-starts first.

---

### H6: Rate Limiter Fails Open (Allows All Traffic on Error)

**What's the problem?**

The rate limiting utility (`rateLimiter.js`) is designed to prevent abuse by limiting how many requests an IP address or user can make in a time window. However, the error handling has a deliberate design choice: **if any error occurs during the rate limit check (database timeout, quota exceeded, network error), the function returns `true` — meaning "allow the request through."**

The reasoning is that you don't want to block legitimate users just because the rate limiter database had a hiccup. But this means that during any Firestore outage or high-load period (exactly when you'd MOST need rate limiting), the rate limiter is completely disabled.

**Where exactly does this happen?**

- `functions/shared/rateLimiter.js` — Line 56 (`return true; // Fail open`)

**World-Class Recommendation:**

Leading security platforms (Cloudflare, AWS WAF, Stripe) handle this with a **tiered fail strategy**:

1. **Fail closed for security-critical endpoints** — For endpoints like `submitPublicEnvelope` (public document submission), `getSignedUploadUrl` (file upload), and any authentication-related endpoints, the rate limiter should **deny** requests if it can't verify the limit. Better to temporarily block a legitimate user than allow a flood of malicious requests.

2. **Fail open for user-facing features** — For endpoints like "load dashboard data" or "fetch driver list," failing open is acceptable because these endpoints already require authentication.

3. **Make the behavior configurable** — Add a `failBehavior` parameter to `checkRateLimit()`: either `'open'` (allow on error) or `'closed'` (deny on error). Each caller chooses the appropriate behavior for their security context.

4. **Add an in-memory cache** as a fallback — Before calling Firestore, check an in-memory map. If Firestore fails, the in-memory cache provides a degraded but still functional rate limit for the duration of that cloud function instance's life.

**Impact of not fixing:** During any Firestore performance issue, all rate limiting is disabled platform-wide, leaving public endpoints completely unprotected against brute-force or denial-of-service attacks.

---

## 🟡 Medium Findings — Fix Within 1 Month

---

### M1: Signature Image Paths Are Not Validated in Document Sealing

**What's the problem?**

The `digitalSealing.js` function creates finalized signed PDFs. When processing the document, it downloads the original PDF and any signature images that were uploaded. For the main PDF file, the code **correctly validates** that the file path starts with an allowed prefix (`companies/{companyId}/` or `secure_documents/{companyId}/`) — this prevents one company from accessing another company's files.

However, when downloading **signature images** (the actual signature drawings/uploads), no such validation is performed. The signature path comes directly from the `fieldValues` data in the Firestore document. If a malicious user could manipulate `fieldValues` to contain a path like `secure_documents/OTHER_COMPANY_ID/confidential/secret.pdf`, the sealing function would download and attempt to embed that file.

**Where exactly does this happen?**

- `functions/digitalSealing.js` — Lines 43–52 (main PDF path validation — correct)
- `functions/digitalSealing.js` — Lines 114–119 (signature path — NO validation)

**World-Class Recommendation:**

The security principle is **consistent authorization boundaries**:

1. **Apply the exact same path validation** to signature file paths as is already applied to the main PDF path. Every file download in the function should be gated by the same `allowedPrefixes` check.

2. **Use a whitelist approach for file types** — When embedding signatures, verify the downloaded file is actually a PNG image (check the file header/magic bytes), not a PDF or other file type.

**Impact of not fixing:** A sophisticated attacker who gains write access to a signing request document could potentially access files belonging to other companies through the sealing function.

---

### M2: Document Audit Trail "Checksum" Is Not a Real Checksum

**What's the problem?**

When a document is signed and sealed, the system appends an "audit trail page" to the PDF. This page includes what's labeled as a "Checksum Hash" — a value that's supposed to prove the document hasn't been tampered with. However, the current implementation just concatenates the first 8 characters of the request ID with the current timestamp:

```
Checksum Hash: ${requestId.substring(0, 8)}-${Date.now()}
```

This is not a cryptographic hash. It doesn't verify anything. A real checksum would be a mathematical fingerprint of the document's content — if even one pixel changes, the checksum would be completely different.

**Where exactly does this happen?**

- `functions/digitalSealing.js` — Line 159

**World-Class Recommendation:**

Document signing platforms (DocuSign, Adobe Sign, HelloSign) all use cryptographic hashes for document integrity:

1. **Compute a SHA-256 hash** of the final PDF bytes before uploading. SHA-256 is the industry standard for document integrity verification.

2. **Store the hash in both the PDF audit page and in Firestore** — This allows independent verification. Someone can download the PDF, hash it themselves, and compare with the stored hash to prove the document hasn't been altered.

3. **Consider adding a digital certificate** — For enterprise-grade document signing, embed a real X.509 digital signature in the PDF. Libraries like `pdf-lib` support this. This would make your signed documents legally equivalent to DocuSign'd documents in most jurisdictions.

**Impact of not fixing:** If a signed document is ever challenged legally (e.g., a dispute about employment terms), the fake "checksum" provides zero proof of integrity. A real hash would make the documents legally defensible.

---

### M3: Super Admin Email Hardcoded in Frontend

**What's the problem?**

In the `DataContext.jsx` file (the frontend's authentication context), there's a line that grants super admin access to anyone logged in with the email `holmurod96@gmail.com`, regardless of what their Firebase custom claims say:

```javascript
const isSuperAdmin = claims.globalRole === 'super_admin' || roles.globalRole === 'super_admin' || user.email === 'holmurod96@gmail.com';
```

This is well-commented in the code as intentional — it's a safety net to ensure the platform owner always has access, even if custom claims get misconfigured. The **backend** (Cloud Functions and Firestore rules) does NOT have this hardcoded check — it only uses proper custom claims.

**Where exactly does this happen?**

- `src/context/DataContext.jsx` — Line 75

**World-Class Recommendation:**

While the current implementation is not a critical risk (since the backend enforces proper claims regardless of what the frontend thinks), best practices suggest:

1. **Remove the hardcoded email from the frontend** — A compromised Gmail account + this hardcoded check = an attacker sees the super admin UI. While they can't DO anything destructive (backend blocks unauthorized actions), they can SEE sensitive data like company lists, driver counts, and system health info.

2. **Implement a "break glass" recovery mechanism** instead — Store a recovery flag in a Firebase Remote Config or a special Firestore document that can only be accessed with the Firebase Console. If claims get corrupted, set the flag to trigger a claims rebuild.

3. **At minimum**, move this fallback email to an environment variable so it's not visible in the compiled JavaScript bundle that's served to browsers.

**Impact of not fixing:** Low immediate risk since backend security is proper. However, if the Gmail account is compromised, an attacker could view (but not modify) sensitive admin information.

---

### M4: Guest-Uploaded Files Are Inaccessible Through Normal Firebase SDK

**What's the problem?**

When a guest uploads a file (resume, CDL photo, etc.), the `storageSecure.js` function generates a signed upload URL pointing to a path like:
```
companies/{companyId}/applications/guest_uploads/{uniqueId}_{fileName}
```

Your Storage security rules for the `applications` path require the `{applicantId}` segment to match the authenticated user's ID (`isOwner(applicantId)`). But in the guest upload path, the `applicantId` position contains `guest_uploads` — which isn't a user ID.

This means:
- The signed URL **works fine** for uploading (signed URLs bypass storage rules)
- But reading the file later via the **normal Firebase SDK** fails — no one is the "owner" of `guest_uploads`
- Company admins can't browse or download these files directly from the client app

Currently, this works because the backend generates signed download URLs when needed. But it's a fragile arrangement — any frontend code that tries to read these files directly will get a "Permission Denied" error.

**Where exactly does this happen?**

- `src/storage.rules` — Lines 54–60 (application attachments rule)
- `functions/storageSecure.js` — Line 46 (guest upload path structure)

**World-Class Recommendation:**

1. **Add a specific storage rule for guest uploads:**
   ```
   match /companies/{companyId}/applications/guest_uploads/{allPaths=**} {
     allow read: if isCompanyTeam(companyId) || isSuperAdmin();
     allow create: if request.resource.size < 10 * 1024 * 1024;  // 10MB limit for guests
   }
   ```

2. **Alternatively, restructure guest upload paths** to include a generated applicant ID that matches the application document — this way the existing rules would naturally apply.

3. **Document the design decision** — If the current arrangement is intentional (all guest files accessed via signed URLs only), add a comment in the storage rules explaining this.

**Impact of not fixing:** Frontend developers may inadvertently write code that tries to read guest files directly and encounter confusing "Permission Denied" errors. Also, company admins cannot manually browse guest uploads.

---

### M5: Document Signing Access Tokens Never Expire

**What's the problem?**

When a document signing request is created, it includes an `accessToken` — a random string embedded in the signing link. This token is the **only** thing that controls who can view and sign the document. There is no user authentication required — anyone with the link can sign.

After a document is successfully signed:
- The status changes to `'signed'`
- The `getPublicEnvelope` function returns early with `{ status: 'signed', recipientName: data.recipientName }`
- But the `accessToken` **remains in the database** and is still validated

This means the signing link remains "active" forever. While you can't re-sign the document, you can still use the link to confirm that:
1. A document with this ID exists
2. It was signed
3. Who signed it (recipientName)

**Where exactly does this happen?**

- `functions/publicSigning.js` — Lines 22–29 (token validated, then early return for signed docs)

**World-Class Recommendation:**

Document signing platforms like DocuSign handle this with **token lifecycle management**:

1. **Invalidate the access token after signing** — In the `submitPublicEnvelope` function, after the document is successfully signed, either delete the `accessToken` field or replace it with `null`.

2. **Add expiration timestamps** — Set an `expiresAt` field when creating the signing request (e.g., 7 days). The `getPublicEnvelope` function should check if the token is expired and reject access.

3. **Return minimal information for signed documents** — Instead of returning `recipientName`, return only `{ status: 'signed' }`. The caller doesn't need to know who signed it.

**Impact of not fixing:** Signing links are permanent URLs that always reveal whether a document was signed and who signed it. In industries with confidentiality requirements, this could be a compliance issue.

---

### M6: Phone Number Format Inconsistency in Blacklist

**What's the problem?**

The blacklist system is designed to prevent sending messages to people who opted out. When someone texts "STOP", their phone number is saved to the blacklist. Later, before sending any message, the system checks if the recipient's number is blacklisted.

The problem is that phone numbers can be formatted differently: `+1234567890`, `1234567890`, `(123) 456-7890`, `123-456-7890`, etc. The blacklist stores whatever format the incoming message provides (e.g., `+1234567890`), but the lookup might use a different format (e.g., `1234567890`). If the formats don't match, **the blacklist check fails and the system sends a message to someone who opted out**.

This could violate TCPA (Telephone Consumer Protection Act) regulations, which impose fines of $500–$1,500 per unsolicited text message.

**Where exactly does this happen?**

- `functions/blacklist.js` — Line 18 (uses `data.from` raw, no normalization)
- `functions/blacklist.js` — Lines 41–53 (`isBlacklisted` uses the phone number as-is)

**World-Class Recommendation:**

Telecom platforms (Twilio, Vonage, Telnyx) all normalize phone numbers to E.164 format before any operations:

1. **Normalize phone numbers before storage** — Strip all non-digit characters except the leading `+`. Convert to E.164 format (`+1XXXXXXXXXX` for US numbers).

2. **Normalize phone numbers before lookup** — Apply the same normalization in `isBlacklisted()`.

3. **Use a normalization utility** — Create a shared `normalizePhone(phone)` function and use it consistently in blacklist operations, SMS sending, and driver identity resolution. Your `driverSync.js` already has phone normalization logic — reuse it here.

4. **Backfill existing blacklist entries** — Run a one-time migration to normalize all existing blacklist document IDs.

**Impact of not fixing:** Potential TCPA violation. A person who opted out could receive unwanted messages, resulting in legal liability (fines up to $1,500 per message).

---

### M7: Unused Code in Schema Validation File

**What's the problem?**

The `functions/shared/schema.js` file defines Joi validation schemas for input data. Two schemas — `optionalEmailSchema` and `optionalIdSchema` — are defined but never exported in the `module.exports` block and never referenced by any other file.

This is purely dead code. It doesn't cause any bugs, but it makes the codebase slightly messier and can confuse future developers who might wonder where these schemas are used.

**Where exactly does this happen?**

- `functions/shared/schema.js` — Lines 5–7 (unused definitions)

**World-Class Recommendation:**

1. **Remove unused code** — Delete the two unused schema definitions.
2. **Add a linting rule** — Configure ESLint with the `no-unused-vars` rule to catch unused exports in the future.

**Impact of not fixing:** No functional impact. Minor code cleanliness issue.

---

### M8: System Repair Function Loads All Companies Into Memory

**What's the problem?**

The `syncSystemStructure` function in `systemIntegrity.js` is a super admin tool that scans the database for missing fields and adds default values. For top-level collections (companies, leads, users), the function correctly uses Firestore streaming (`queryRef.stream()`) to process documents one at a time without loading everything into memory.

However, for subcollection repair (fixing applications within each company), the function first loads **ALL company documents at once** using `db.collection("companies").get()`. While this is fine with a small number of companies, it will cause out-of-memory crashes as the platform grows.

**Where exactly does this happen?**

- `functions/systemIntegrity.js` — Line 102 (`const companiesSnap = await db.collection("companies").get();`)

**World-Class Recommendation:**

1. **Use streaming for company enumeration** — Replace `.get()` with `.stream()` to process companies one at a time.

2. **Add a pagination/batching approach** — Process companies in batches of 50–100, committing results between batches.

3. **Consider making this a Cloud Task-based operation** — For very large datasets, spawn a separate Cloud Task for each company's subcollection repair (similar to how `leadDistribution.js` already handles company-level processing).

**Impact of not fixing:** The system repair function will crash with an out-of-memory error once the platform has enough companies (estimated threshold: ~500–1000 companies depending on document size). The function has a 512MB memory limit and a 540s timeout.

---

## 🔵 Low Findings — Fix When Convenient

---

### L1: Mixed Firebase Functions V1 and V2 Usage

**What's the problem?**

Some backend files use `firebase-functions/v1` (the older API) while others use `firebase-functions/v2` (the newer API). Both versions work correctly side by side, and Firebase officially supports mixing them. However, the two versions have different syntax for defining triggers, different runtime options, and different behavior for some features (like CORS handling).

**Examples:**
- V1: `digitalSealing.js`, `storageSecure.js`, `userOnboarding.js`
- V2: `publicSigning.js`, `notificationTriggers.js`, `systemIntegrity.js`

**World-Class Recommendation:**

1. **Plan a gradual migration** to V2 for all functions. V2 functions have better scaling, concurrency support, and more runtime options.
2. **Don't rush this** — V1 functions are not deprecated. Migrate as you make other changes to each file.
3. **Document which version each file uses** — Add a note in the project README listing which functions use V1 vs V2.

**Impact of not fixing:** Increased maintenance burden. Developers need to remember two different API styles. New team members may be confused.

---

### L2: A New Email Connection Is Created For Every Email Send

**What's the problem?**

Every time `sendDynamicEmail()` is called, it creates a brand new SMTP connection (via `nodemailer.createTransport()`). For high-volume email sending (e.g., bulk email campaigns), this is inefficient because establishing a new connection takes time.

However, this is an inherent design constraint — since each company has different SMTP credentials, you can't reuse one connection for all companies.

**World-Class Recommendation:**

1. **For single emails** (signing notifications, automated follow-ups), the current approach is perfectly fine. The overhead of creating a connection is negligible for individual emails.

2. **For bulk email campaigns**, consider implementing a connection pool that caches transporters by company ID. The transporter can be reused for multiple emails to the same company's recipients within a single Cloud Function execution.

3. **Alternative: Use a transactional email API** (SendGrid, Mailgun) instead of direct SMTP. API calls are stateless and don't require connection management.

**Impact of not fixing:** Negligible for current usage. Could become a minor performance issue if sending hundreds of emails per company in a single function execution.

---

### L3: Guest Applications Don't Require App Check Verification

**What's the problem?**

The `submitGuestApplication` function in `guestApplication.js` checks for App Check (a Firebase feature that verifies requests come from your legitimate app). If App Check fails, it **logs a warning but allows the application to be submitted anyway**.

This is a deliberate design choice — the rationale is that a missed legitimate application is worse than accepting a potentially fraudulent one. App Check can have false negatives (legitimate users on certain browsers or networks might fail verification).

**World-Class Recommendation:**

1. **Keep the current behavior** — This is actually the correct approach for a guest application form. Blocking legitimate applicants is worse than accepting a few spam submissions.

2. **Add a "spam confidence score"** — Flag applications that fail App Check with a `suspiciousFlags: ['app_check_failed']` field. The HR team can prioritize reviewing flagged applications more carefully.

3. **Implement CAPTCHA** (e.g., Google reCAPTCHA v3) as an additional spam prevention layer that works alongside App Check.

**Impact of not fixing:** No immediate impact. The current design is appropriate for the use case.

---

### L4: Smart Segment Rules Are Hardcoded — Users Can't Create Custom Segments

**What's the problem?**

The smart segments feature (`segments.js`) automatically categorizes drivers based on predefined rules:
- "Inactive 30 Days" — No contact in 30+ days
- "Ghosted" — Applied but never answered calls
- "New Leads" — Created within the last 48 hours with "new" status

These rules are defined directly in the code. If a company wants different criteria (e.g., "Inactive 14 Days" or "CDL-A Only"), they cannot create or modify segments without a code deployment.

**World-Class Recommendation:**

1. **For now, this is acceptable** — Most early-stage SaaS platforms start with hardcoded segments and add customization as customer demand warrants it.

2. **When ready for customization**, store segment rules in Firestore (e.g., `companies/{companyId}/segment_rules/{ruleId}`) and have the trigger dynamically evaluate rules stored in the database instead of code.

3. **Use a rules engine pattern** — Define a simple DSL (domain-specific language) for rules: `{ field: 'lastContactedAt', operator: 'olderThan', value: '30d' }`. This is how platforms like Intercom and HubSpot implement their "Smart Lists" feature.

**Impact of not fixing:** Limited customization for companies. All companies get the same three segments. This is a feature limitation, not a bug.

---

### L5: Rate Limit Records Accumulate Forever in the Database

**What's the problem?**

Every time the rate limiter checks a request, it creates or updates a document in the `rate_limits` collection in Firestore. Each document has an `expiresAt` timestamp indicating when the rate limit window expires. However, **no process ever deletes expired documents**. Over months and years, this collection will grow indefinitely with stale records.

**Where exactly does this happen?**

- `functions/shared/rateLimiter.js` — Sets `expiresAt` (Line 24) but never cleans up expired documents

**World-Class Recommendation:**

1. **Use Firestore TTL (Time-to-Live) policies** — This is a built-in Firestore feature. You can configure a TTL policy on the `expiresAt` field, and Firestore will automatically delete documents after they expire. This requires zero code changes — just a one-time configuration in the Firebase Console.

2. **Alternatively, add a scheduled cleanup function** — Run a Cloud Scheduler function daily that queries `rate_limits` where `expiresAt < now()` and batch-deletes them.

3. **Option 1 (TTL) is strongly recommended** — It's free, automatic, and requires no maintenance.

**Impact of not fixing:** Gradual increase in Firestore storage costs and document count. Over a year, this could accumulate tens of thousands of stale documents. The functional impact is minimal (the rate limiter handles expired windows correctly by resetting them), but the storage waste is unnecessary.

---

## ✅ Positive Architecture Observations

Not everything in this audit is a problem! The following patterns are well-designed and demonstrate solid engineering:

| Pattern | Where | Why It's Good |
|---------|-------|---------------|
| **Reference-based lead assignment** | `leadLogic.js` | Instead of copying lead data to each company, leads are shared by reference. This eliminates data duplication and ensures updates propagate automatically. |
| **Sharded statistics** | `leadDistribution.js` | Lead pool stats are split across multiple "shards" to prevent Firestore's 1-write-per-second limit from becoming a bottleneck. |
| **Streaming for large datasets** | `leadLogic.js`, `systemIntegrity.js` | Using `.stream()` instead of `.get()` prevents out-of-memory crashes when processing thousands of documents. |
| **Admin SDK bypass for guest applications** | `guestApplication.js` | Using the backend Admin SDK (which bypasses security rules) ensures guest applications are always saved, even if there's a rule misconfiguration. Reliability over strictness — the right choice for this use case. |
| **Path traversal prevention** | `digitalSealing.js` | Validates that file paths start with allowed prefixes, preventing one company from accessing another's files. |
| **Encrypted SMS credentials** | `integrations/encryption.js` | SMS provider API keys are encrypted at rest using AES-256-CBC with an environment-based encryption key. |
| **Idempotent stats aggregation** | `statsAggregator.js` | Uses a `processed_signals` subcollection to track which events have already been counted, preventing double-counting even if a function retries. |
| **Comprehensive Firestore rules** | `firestore.rules` | Clean helper functions (`isSuperAdmin`, `isCompanyAdmin`, `isCompanyTeam`) with consistent authorization patterns across all collections. |
| **Error boundaries and loading states** | `App.jsx`, `DataContext.jsx` | Every route has proper error handling and loading spinners. The app gracefully handles auth failures, missing data, and network issues. |
| **Custom claims sync** | `hrAdmin.js` | User roles are synced to Firebase Auth custom claims via the `onMembershipWrite` trigger, ensuring backend authorization decisions are always based on the latest role data. |

---

## 📋 Recommended Execution Order

Based on severity, user impact, and implementation effort, here is the recommended order for addressing these findings:

| Priority | Finding | Effort | Reason |
|----------|---------|--------|--------|
| 1 | **C1** — Unify email credential schema | Medium | Signing notification emails are currently broken for most companies |
| 2 | **C2** — Fix `testEmailConnection` fallback | Low | Quick fix that restores trust in the email test feature |
| 3 | **C3** — Add rate limiting to file uploads | Low | Prevents potential storage abuse and cost spike |
| 4 | **H1** — Stop leaking email in signing endpoint | Low | Simple field removal, immediate privacy improvement |
| 5 | **M6** — Normalize phone numbers in blacklist | Medium | TCPA compliance risk — potential legal liability |
| 6 | **M1** — Validate signature paths | Low | Quick security hardening |
| 7 | **H4** — Add backup before shadow profile deletion | Medium | Prevents silent data loss |
| 8 | **H5** — Use shared DB instance everywhere | Low | Quick cleanup, prevents subtle bugs |
| 9 | **M2** — Implement real checksum hash | Low | Strengthens legal defensibility of signed documents |
| 10 | **H6** — Make rate limiter configurable | Medium | Improves security resilience |
| 11 | **H2** — Fix pipeline trigger loop | Medium | Reduces unnecessary Cloud Function costs |
| 12 | **H3** — Use incremental segment counting | Medium | Improves scalability for growing companies |
| 13 | **M5** — Expire signing tokens | Low | Privacy hardening |
| 14 | **L5** — Add TTL for rate limit cleanup | Low | One-time Firebase Console configuration |
| 15 | **All remaining** | Low | Best-effort cleanup and optimization |

---

*This document is a living reference. As findings are addressed, mark them as resolved with the date and the conversation/deployment ID where the fix was applied.*

---

## 🔴🟠 Application Flow Audit — Data Pipeline Breaks

> **Audit Date:** February 19, 2026
> **Scope:** Full trace of driver application data — from form input (driver-side), through Firestore storage, to company-side display.
> **Trigger:** Specific reports of "Previous Employment not showing" and "CDL not showing" for driver "Valentin Joseph" (Wenze Trucking).
> **Root Cause Summary:** Multiple field name mismatches and renderer gaps cause data that IS correctly saved in Firestore to be silently invisible on the company dashboard.

---

### AF1: 🔴 Employer Data Field Names Don't Match Between Form and Display

**What's the problem?**

The driver fills out previous employers in `Step6_Employment.jsx`. This form stores each employer with these field names:

| Field in Form (Step6) | Key Saved to Firestore |
|---|---|
| Company Name | `name` |
| Street Address | `street` |
| Reason for Leaving | `reason` |

But the company-side `ExperienceTimeline` component (in `ApplicationTab.jsx` line 260-297) reads these field names:

| What the Company View Reads | Key Expected |
|---|---|
| Company Name | `companyName` |
| Address | `address` (not `street`) |
| Reason for Leaving | `reasonForLeaving` |

The `APPLICATION_SCHEMA` in `applicationSchema.js` (lines 259-277) also defines the fields as `companyName`, `address`, and `reasonForLeaving` — matching the **display** side, not the **input** side.

**What happens because of this?**

- **Employer company names show as "Unknown Employer"** on the company side, even though the driver filled them in. The data IS in Firestore — it's just stored under `name` while the view looks for `companyName`.
- **Reason for leaving never displays.** The view checks `job.reasonForLeaving` but the data is stored under `job.reason`.
- **This is the direct cause of the reported issue** for driver "Valentin Joseph" — his previous employers appear to be missing, but the data is actually saved correctly in Firestore under different field names.

**Where exactly does this happen?**

- `src/features/driver-app/components/application/steps/Step6_Employment.jsx` — Line 26: `initialEmployer` uses `name`, `street`, `reason`
- `src/features/company-admin/components/modals/driver-dossier/tabs/ApplicationTab.jsx` — Lines 282-291: reads `companyName`, `reasonForLeaving`
- `src/config/applicationSchema.js` — Lines 265-275: schema defines `companyName`, `address`, `reasonForLeaving`

**Recommendation:**

Update `Step6_Employment.jsx` `initialEmployer` and `renderEmployerRow` to use field names matching the schema: `companyName` instead of `name`, `address` instead of `street`, `reasonForLeaving` instead of `reason`. Then run a data backfill script to rename the fields in all existing applications in Firestore.

---

### AF2: 🔴 CDL Expiration Date Field Name Mismatch — Badge Always Shows N/A

**What's the problem?**

The driver application wizard saves the CDL expiration date to a field called `cdlExpiration` (defined in `applicationSchema.js` line 168 and used in `Step3_License.jsx` line 101).

But the company-side `LicenseCard` component (in `ApplicationTab.jsx` lines 150-202) reads from `appData.cdlExpirationDate` — a field that **does not exist** in the data:

```javascript
// ApplicationTab.jsx line 151 — WRONG field name
const expDate = appData.cdlExpirationDate ? new Date(appData.cdlExpirationDate) : null;

// ApplicationTab.jsx line 194 — WRONG field name
{appData.cdlExpirationDate ? formatDate(appData.cdlExpirationDate) : '--'}
```

**What happens because of this?**

- The CDL expiration date **always shows "--"** on the company dashboard.
- The expiration badge (VALID / EXPIRING SOON / EXPIRED) **never appears** — it's always null because `daysUntilExp` is always null.
- The data IS correctly saved in Firestore under `cdlExpiration`, it's just being read from the wrong key.

**Where exactly does this happen?**

- `src/config/applicationSchema.js` — Line 168: defines field as `cdlExpiration`
- `src/features/driver-app/components/application/steps/Step3_License.jsx` — Line 101: saves as `cdlExpiration`
- `src/features/company-admin/components/modals/driver-dossier/tabs/ApplicationTab.jsx` — Lines 151, 194: reads `cdlExpirationDate`

**Recommendation:**

Change `ApplicationTab.jsx` lines 151 and 194 to read `cdlExpiration` instead of `cdlExpirationDate`.

---

### AF3: 🔴 SchemaRenderer Cannot Render Array Sections — Employment, Violations, Accidents, and Addresses Are Invisible in "Full Application" View

**What's the problem?**

The `ApplicationTab` has two views: a "Summary View" (cards) and a "Full Application" view. The Full Application view iterates over `APPLICATION_SCHEMA.sections` and renders each section using `SchemaSection` from `SchemaRenderer.jsx`.

`SchemaSection` (lines 273-306) renders fields like this:

```javascript
{(section.fields || []).map(field => (
    <SchemaField key={field.key} fieldKey={field.key} data={data} ... />
))}
```

It ONLY iterates over `section.fields`. But several critical sections use `section.itemFields` instead (because they are arrays of items):

| Section | Has `fields`? | Has `itemFields`? | Result |
|---|---|---|---|
| `EMPLOYMENT_SECTION` | ❌ No | ✅ Yes (11 fields) | **INVISIBLE** — renders empty |
| `PREVIOUS_ADDRESSES_SECTION` | ❌ No | ✅ Yes (6 fields) | **INVISIBLE** — renders empty |
| `ADDITIONAL_LICENSES_SECTION` | ❌ No | ✅ Yes (4 fields) | **INVISIBLE** — renders empty |
| `VIOLATIONS_SECTION` | ✅ 1 field | ✅ Yes (3 fields) | Only shows "has-violations?" toggle, **NOT the actual violation entries** |
| `ACCIDENTS_SECTION` | ✅ 1 field | ✅ Yes (5 fields) | Only shows "has-accidents?" toggle, **NOT the actual accident entries** |

**What happens because of this?**

- When a company user switches to the "Full Application" view to see *everything* the driver submitted, they see **zero employment history entries**, **zero violation details**, **zero accident details**, and **zero previous addresses**. The section headers render, but the content is blank.
- This compounds the AF1 issue — not only does the Summary View show "Unknown Employer" due to the field name mismatch, but the Full Application View shows nothing at all.

**Where exactly does this happen?**

- `src/shared/components/schema/SchemaRenderer.jsx` — Lines 289-304: `SchemaSection` only reads `section.fields`, ignores `section.itemFields` and `section.type === 'array'`
- `src/config/applicationSchema.js` — Lines 87-100, 174-187, 227-257, 259-277: sections that use `itemFields`

**Recommendation:**

Enhance `SchemaSection` to detect when a section has `type: 'array'` and `itemFields`. For such sections, it should read the corresponding array from `data` (e.g., `data.employers`, `data.violations`) and render each item's fields in a table or card layout using the `itemFields` definition.

---

### AF4: 🟠 SchemaRenderer Has No File-Type Rendering — CDL Uploads, Medical Card, TWIC Are Blank in "Full Application" View

**What's the problem?**

The schema defines file upload fields (e.g., `cdl-front`, `cdl-back`, `medical-card-upload`) with `type: 'file'`. But the `SchemaField` component's `renderDisplayMode` function (lines 173-225) has **no special handling for file types**. It falls through to the default `formatDisplayValue()` which tries to render the value as a string.

File values are stored as objects like:
```json
{
  "name": "cdl_front.jpg",
  "url": "https://firebasestorage.googleapis.com/...",
  "storagePath": "companies/.../cdl-front/...",
  "uploadedAt": "2026-02-18T..."
}
```

When `formatDisplayValue` encounters this object, it calls `String(value)`, which renders as `[object Object]`.

**What happens because of this?**

- In the "Full Application" view, CDL Documents, Medical Card, and TWIC sections show `[object Object]` or an empty state instead of a clickable file preview or download link.
- The user reported "CDL not showing on company side" — this is one of the contributing causes (alongside the separate Documents Tab rendering issue).

**Where exactly does this happen?**

- `src/shared/components/schema/SchemaRenderer.jsx` — Lines 243-267: `formatDisplayValue` has no `file` type handling
- `src/config/applicationSchema.js` — Lines 189-198 (CDL uploads), Line 206 (medical card), Line 218 (TWIC)

**Recommendation:**

Add a `case FIELD_TYPES.FILE:` handler in `renderDisplayMode` that checks if the value has a `url` or `storagePath` property and renders a clickable link/thumbnail. Also add it in `formatDisplayValue` to render file names instead of `[object Object]`.

---

### AF5: 🟠 ExperienceTimeline Only Shows 4 of 11 Employer Fields

**What's the problem?**

Even when the field name mismatch from AF1 is fixed and employer data IS displayed, the `ExperienceTimeline` component (lines 260-297) only shows:

1. `companyName` (as "Unknown Employer" due to AF1)
2. `position` (defaults to "Driver")
3. `startDate` / `endDate`
4. `reasonForLeaving`

But each employer entry in the schema has **11 fields**:

| Schema Field | Shown in Timeline? |
|---|---|
| companyName | ✅ (broken per AF1) |
| address | ❌ |
| city | ❌ |
| state | ❌ |
| phone | ❌ |
| startDate | ✅ |
| endDate | ✅ |
| position | ✅ |
| reasonForLeaving | ✅ (broken per AF1) |
| supervisorName | ❌ |
| mayContact | ❌ |

**What happens because of this?**

DOT regulations (49 CFR 391.21) require companies to have a complete record of previous employment, including **employer contact information** (address, phone, supervisor). The company cannot perform Previous Employer Verification (PEV) from the application view because the contact details are not displayed — they must manually look at Firestore to find them.

**Where exactly does this happen?**

- `src/features/company-admin/components/modals/driver-dossier/tabs/ApplicationTab.jsx` — Lines 260-297: `ExperienceTimeline` component

**Recommendation:**

Expand the `ExperienceTimeline` to display all employer fields, including address (city, state), phone, supervisor name, and "may we contact" flag. Consider adding a dedicated "PEV" action button per employer that pre-fills employer contact details for outreach.

---

### AF6: 🟠 Guest Application vs Authenticated Application Use Different Data Paths — Potential Inconsistency

**What's the problem?**

There are TWO completely separate submission paths:

1. **Authenticated Driver** → `DriverApplicationWizard.jsx` → `driverService.submitDriverApplication()` → writes directly to Firestore using client SDK
2. **Guest (public applicant)** → `guestApplication.js` Cloud Function → writes using Admin SDK

Both paths spread `formData` into the document, but they apply different post-processing:

| Feature | Authenticated Path | Guest Path |
|---|---|---|
| Arrays ensured | ❌ No explicit array normalization | ✅ Explicitly wraps `employers`, `violations`, `accidents`, `schools`, `military` |
| `driverId` field | ✅ Set to `currentUser.uid` | ❌ Not set |
| `userId` field | ✅ Set to `currentUser.uid` | ❌ Not set |
| `companyName` | ❌ Not set | ✅ Looked up from `public_profiles` |
| `sanitizeData` | ✅ Replaces `undefined` with `null` | ✅ Replaces `undefined` with `null` |

**What happens because of this?**

- **Guest applications may have their array fields stringify or be undefined** if the raw form data doesn't already contain them as arrays (the backend does check, but the client might not send them at all).
- **Guest applications have no `driverId` or `userId`** — this means Firestore queries that filter by `driverId` (used by `fetchMyApplications`) will never find guest applications. A guest who later creates an account cannot see their previous application on their dashboard.
- **Authenticated applications have no `companyName`** — the company name that appears on the driver's dashboard comes from `data.companyName`, but the authenticated path never sets it. This means authenticated drivers might see their application listed with company name as `undefined` or empty.

**Where exactly does this happen?**

- `src/features/driver-app/services/driverService.js` — Lines 315-340: authenticated submission payload
- `functions/guestApplication.js` — Lines 125-155: guest submission payload

**Recommendation:**

Unify the two submission payloads to ensure both paths produce identical document structures. Add `companyName` lookup to the authenticated path (or set it from the already-known `job.companyName`). Add `driverId` and `userId` mapping for guest applications (using the deterministic `applicationId` as a reference). Ensure both paths normalize all array fields identically.

---

### AF7: 🟡 IdentityCard Uses Inconsistent Address Keys

**What's the problem?**

The `IdentityCard` component (in `ApplicationTab.jsx` line 128) constructs the address display from:

```javascript
[appData.address, appData.city, appData.state, appData.zip].filter(Boolean).join(', ')
```

But the driver form saves the street address as `appData.street` (defined in `applicationSchema.js` line 79:
`{ key: 'street', label: 'Address 1', type: 'text' }`).

**What happens because of this?**

- The driver's street address **never appears** in the Identity Card on the company side. Only city, state, and zip show up (e.g., ", Dallas, TX, 75001" instead of "123 Main St, Dallas, TX, 75001").

**Where exactly does this happen?**

- `src/config/applicationSchema.js` — Line 79: field key is `street`
- `src/features/company-admin/components/modals/driver-dossier/tabs/ApplicationTab.jsx` — Line 128: reads `appData.address`

**Recommendation:**

Change `ApplicationTab.jsx` line 128 to read `appData.street` instead of `appData.address`. Alternatively, if `address` is used elsewhere as a legacy field, check for both: `appData.street || appData.address`.

---

### AF8: 🟡 PDF Generator Uses Different Employer Field Names Than Both Form and Schema

**What's the problem?**

The `pdfGenerator.js` (line 141) calls:

```javascript
y = addEmploymentSection(doc, y, applicant?.employers || []);
```

The `addEmploymentSection` in `pdfSections.js` (line 57) renders employer data from the `employers` array. However, this function expects specific field names from each employer object. Because the form saves employers with `name`, `street`, `reason` (the Step6 keys), and the schema says `companyName`, `address`, `reasonForLeaving`, the PDF also needs to know which field names to read.

**What happens because of this?**

If the PDF generator reads `employer.companyName` (matching the schema), it will get `undefined` because the form actually saved it as `employer.name`. The PDF may show empty employer names even though the data exists.

**Where exactly does this happen?**

- `src/shared/utils/pdfGenerator.js` — Line 141
- `src/shared/utils/pdf/pdfSections.js` — Line 57: `addEmploymentSection`

**Recommendation:**

Verify which field names `pdfSections.js:addEmploymentSection` reads, and ensure they match whichever field names are settled on after fixing AF1. The PDF, the form, the schema, and the company view should all use the same field names — this is the "Mirror Law" principle the schema was designed to enforce.

---

### Summary of Application Flow Findings

| ID | Severity | Issue | Root Cause | User-Visible Impact |
|---|---|---|---|---|
| **AF1** | 🔴 Critical | Previous employers show as "Unknown Employer" | Form saves `name`, view reads `companyName` | **Directly reported issue** |
| **AF2** | 🔴 Critical | CDL expiration always shows "--" | View reads `cdlExpirationDate`, data saved as `cdlExpiration` | Badge never renders |
| **AF3** | 🔴 Critical | Full Application view missing Employment, Violations, Accidents, Addresses | SchemaRenderer ignores `itemFields` | Sections render blank |
| **AF4** | 🟠 High | CDL/Medical/TWIC show `[object Object]` in Full Application | No file-type handling in SchemaRenderer | **Directly reported issue** |
| **AF5** | 🟠 High | Only 4/11 employer fields shown | ExperienceTimeline template incomplete | Can't do PEV from dashboard |
| **AF6** | 🟠 High | Guest vs Authenticated payloads differ | Two separate submission paths | Guest apps lack `driverId`, auth apps lack `companyName` |
| **AF7** | 🟡 Medium | Street address missing in Identity Card | View reads `address`, form saves `street` | Address shows without street |
| **AF8** | 🟡 Medium | PDF may have empty employer names | PDF generator field names may not match form | PDF quality degraded |

### Recommended Fix Order for Application Flow

| Priority | Finding | Effort | Rationale |
|---|---|---|---|
| 1 | **AF1** — Fix employer field name mismatch | Low | Directly solves the reported "employment not showing" issue |
| 2 | **AF2** — Fix CDL expiration field name | Trivial | 1-line fix, solves the expiration badge |
| 3 | **AF7** — Fix address field name | Trivial | 1-line fix |
| 4 | **AF3** — Add array rendering to SchemaRenderer | Medium | Unlocks the Full Application view for all array data |
| 5 | **AF4** — Add file rendering to SchemaRenderer | Low | Unlocks CDL/medical previews in Full Application view |
| 6 | **AF5** — Expand ExperienceTimeline | Low | Shows full employer details for PEV |
| 7 | **AF6** — Unify submission payloads | Medium | Prevents data inconsistency between guest and auth paths |
| 8 | **AF8** — Verify PDF field alignment | Low | Ensures PDF matches the canonical field names |
