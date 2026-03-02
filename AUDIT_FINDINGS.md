# SafeHaul Codebase Audit Report - Plain Text

Date: March 2, 2026
Repository: Khomurod/SafeHaul-for-Gemini-Antigravity
Status: All findings documented below

================================================================================
CRITICAL ISSUES (11 Total)
================================================================================

1. CONFIRMATION NUMBER FORMAT MISMATCH
   Files: src/lib/applicationId.js, functions/guestApplication.js
   Problem: Client generates SAF-YYYY-XXXXX format, server expects SH-XXXXXX format
   Impact: Driver applications fail end-to-end, unrecognized submissions
   Fix Priority: IMMEDIATE

2. PLACEHOLDER EMAIL DOMAIN MISMATCH
   Files: src/features/campaigns/workers/import.worker.js, functions/driverSync.js
   Problem: Bulk imports use @system.local, server checks for @placeholder.com
   Impact: Duplicate detection broken for bulk uploads, ghost applications created
   Fix Priority: IMMEDIATE

3. PHONE VALIDATION REJECTS VALID 11-DIGIT NUMBERS
   Files: src/shared/utils/validation.js, src/features/driver-app/PublicApplyHandler.jsx
   Problem: Validation logic rejects valid US numbers with country code (+1)
   Impact: Legitimate driver applications fail at Step 1 submission
   Fix Priority: IMMEDIATE

4. EMPLOYER FIELD NAMES MISMATCH (AF1)
   Files: src/features/driver-app/steps/Step6_Employment.jsx, src/features/company-admin/ApplicationTab.jsx
   Problem: Form saves as name/street/reason, display reads companyName/address/reasonForLeaving
   Impact: All employment history data appears blank when viewing applications
   Fix Priority: IMMEDIATE

5. CDL EXPIRATION BADGE ALWAYS SHOWS "--" (AF2)
   Files: src/features/company-admin/ApplicationTab.jsx
   Problem: Field name mismatch - form saves cdlExpiration, display reads cdlExpirationDate
   Impact: Cannot verify driver CDL validity at a glance
   Fix Priority: IMMEDIATE

6. SCHEMARENDERER CANNOT RENDER ARRAY SECTIONS (AF3)
   Files: src/shared/components/SchemaRenderer.jsx
   Problem: Component has no logic to handle array-type fields
   Impact: Employment history, previous addresses, custom questions fail to render
   Fix Priority: IMMEDIATE

7. SSN PRINTED UNMASKED IN GENERATED PDFS
   Files: src/shared/utils/pdfGenerator.js, src/shared/utils/pdfSections.js
   Problem: SSN values printed in full (e.g., 123-45-6789) without masking
   Impact: Data exposure, compliance violation, PII security risk
   Fix Priority: IMMEDIATE

8. OVERLY PERMISSIVE FIRESTORE SECURITY RULE FOR LEADS UPDATE
   Files: src/firestore.rules
   Problem: Rule allows any staff member to update ANY lead globally
   Impact: Cross-company data manipulation possible, lead tampering
   Fix Priority: IMMEDIATE

9. MISSING AUTHENTICATION CHECK ON CONFIRMDRIVERINTEREST FUNCTION
   Files: functions/leadDistribution.js
   Problem: Function has NO authentication check whatsoever
   Impact: Unauthenticated users can manipulate driver interest status
   Fix Priority: IMMEDIATE

10. SERVICEACCOUNTKEY.JSON NOT IN .GITIGNORE
    Files: .gitignore
    Problem: Sensitive service account key not explicitly excluded from git
    Impact: Credentials at risk if accidentally committed
    Fix Priority: HIGH

================================================================================
HIGH SEVERITY ISSUES (6 Total)
================================================================================

11. SCHEMARENDERER HAS NO FILE-TYPE RENDERING (AF4)
    Files: src/shared/components/SchemaRenderer.jsx
    Problem: File upload fields display as [object Object]
    Impact: File upload custom questions are broken
    Fix Priority: HIGH

12. EXPERIENCETIMELINE MISSING DOT COMPLIANCE FIELDS (AF5)
    Files: src/features/company-admin/components/ExperienceTimeline.jsx
    Problem: Only displays 4 of 11 required employer fields per DOT 49 CFR 391.21
    Impact: DOT compliance documentation incomplete
    Fix Priority: HIGH

13. GUEST VS AUTHENTICATED APPLICATION PAYLOADS DIFFER (AF6)
    Files: src/features/driver-app/PublicApplyHandler.jsx, functions/guestApplication.js
    Problem: Guest submissions have different data structure than authenticated
    Impact: Backend processing inconsistencies, validation failures
    Fix Priority: HIGH

================================================================================
MEDIUM SEVERITY ISSUES (21 Total)
================================================================================

14. DUPLICATE HTTPScallable IMPORT
    Files: src/features/driver-app/PublicApplyHandler.jsx
    Problem: httpsCallable imported twice in same file
    Impact: Dead code, bundle bloat, code cleanliness issue
    Fix Priority: MEDIUM

15. SSN CARD MISSING FROM REVIEW STEP & FAN-OUT
    Files: src/features/driver-app/steps/Step8_Review.jsx, functions/driverSync.js
    Problem: SSN data collected but not displayed in Review step or synced to profile
    Impact: Cannot review SSN before submission
    Fix Priority: MEDIUM

16. MVR/DRUG CONSENT MISSING FROM REVIEW STEP & FAN-OUT
    Files: src/features/driver-app/steps/Step8_Review.jsx, functions/driverSync.js
    Problem: MVR and drug test consent fields not shown in Review step or synced
    Impact: Cannot verify consent selections before submission
    Fix Priority: MEDIUM

17. CUSTOM QUESTIONS NEVER SHOWN TO PUBLIC APPLICANTS
    Files: src/features/driver-app/PublicApplyHandler.jsx
    Problem: Public guest applicants never see company custom questions
    Impact: Custom screening questions ineffective for public applications
    Fix Priority: MEDIUM

18. STEP NAVIGATION BREAKS WITH CUSTOM QUESTIONS
    Files: src/features/driver-app/steps/Step8_Review.jsx, src/shared/components/Stepper.jsx
    Problem: Adding custom questions shifts step indices, breaks navigation logic
    Impact: Users can get stuck or skip steps dynamically
    Fix Priority: MEDIUM

19. STORAGE BUCKET NAME MISMATCH BETWEEN SCRIPTS
    Files: functions/check-cdl.js (both versions)
    Problem: Two different check-cdl.js files reference different bucket names
    Impact: CDL checking scripts fail
    Fix Priority: MEDIUM

20. DUPLICATE DEBUG SCRIPTS WITH HARDCODED NAMES
    Files: functions/check-cdl.js, scripts/check-cdl.js
    Problem: Two identical scripts with hardcoded driver names
    Impact: Code clutter, debugging confusion, maintenance burden
    Fix Priority: MEDIUM

21. DEAD HOS TABLE CODE (IMPORTED BUT NEVER CALLED)
    Files: src/shared/utils/pdfSections.js, src/shared/utils/pdfGenerator.js
    Problem: HOS table function imported but never used in code
    Impact: Bundle bloat, indicates incomplete feature removal
    Fix Priority: MEDIUM

22. NO ADMIN ROLE CHECK ON BACKFILLEMPLOYERFIELDS FUNCTION
    Files: functions/backfillEmployerFields.js
    Problem: Function lacks proper admin role verification
    Impact: Data integrity risk via unauthorized function calls
    Fix Priority: MEDIUM

23. UPLOAD INSTRUCTIONS CONTRADICT AUTO-GENERATION LOGIC
    Files: src/features/company-admin/CompanyBulkUpload.jsx, src/features/campaigns/workers/import.worker.js
    Problem: Instructions say emails required but system auto-generates placeholders
    Impact: User confusion, support burden
    Fix Priority: MEDIUM

24. ACTIVITY_LOGS SECURITY RELIES ON MISSING COMPANYID FIELD
    Files: src/firestore.rules
    Problem: Collection group rule depends on companyId field that may not exist
    Impact: Activity log access control potentially bypassed
    Fix Priority: MEDIUM

25. ARCHITECTURE.MD HAS STALE REFERENCES
    Files: ARCHITECTURE.md
    Problem: References outdated v1 patterns, claims RingCentral-only (actually supports 8x8), wrong hash inputs
    Impact: Misleading documentation for developers
    Fix Priority: MEDIUM

26. DUPLICATE COMMENT BLOCK
    Files: functions/leadDistribution.js
    Problem: Identical comment block appears twice
    Impact: Code cleanliness, indicates incomplete refactoring
    Fix Priority: MEDIUM

27. SIGNATURE IMAGE PATHS NOT VALIDATED IN DOCUMENT SEALING
    Files: functions/digitalSealing.js
    Problem: Image paths from signature uploads not validated
    Impact: Potential path traversal vulnerability
    Fix Priority: MEDIUM

28. DOCUMENT AUDIT TRAIL CHECKSUM IS NOT CRYPTOGRAPHIC
    Files: functions/digitalSealing.js
    Problem: Checksum for audit trail is not a real cryptographic hash
    Impact: Document tamper detection ineffective, false security
    Fix Priority: MEDIUM

29. GUEST-UPLOADED FILES INACCESSIBLE VIA NORMAL SDK
    Files: src/storage.rules
    Problem: Guest uploads stored with restrictive rules, normal SDK reads fail
    Impact: Difficulty retrieving guest-uploaded files
    Fix Priority: MEDIUM

30. PHONE NUMBER FORMAT INCONSISTENCY IN BLACKLIST
    Files: functions/integrations/blacklist.js
    Problem: Phone blacklist uses inconsistent formatting (some with country codes, some without)
    Impact: TCPA compliance risk, duplicate contact attempts
    Fix Priority: MEDIUM

31. IDENTITYCARD USES WRONG ADDRESS KEY (AF7)
    Files: src/features/company-admin/components/ApplicationTab.jsx
    Problem: Reads from address field but form saves to street field
    Impact: Address field always blank on identity card
    Fix Priority: MEDIUM

32. PDF GENERATOR USES DIFFERENT FIELD NAMES THAN FORM (AF8)
    Files: src/shared/utils/pdfSections.js, src/features/driver-app/steps/Step6_Employment.jsx
    Problem: Form and PDF generator use different employer field names
    Impact: Employment history missing from generated PDFs
    Fix Priority: MEDIUM

33. MIXED FIREBASE FUNCTIONS V1 AND V2 USAGE (L1)
    Files: Multiple Cloud Functions
    Problem: Some functions use v1 API, others use v2, inconsistent patterns
    Impact: Code maintainability, inconsistent patterns
    Fix Priority: MEDIUM

34. NEW SMTP CONNECTION CREATED PER EMAIL SEND (L2)
    Files: functions/emailService.js
    Problem: Each email creates new Nodemailer connection, no pooling
    Impact: Performance degradation under load, slow bulk operations
    Fix Priority: MEDIUM

35. GUEST APPLICATIONS DONT REQUIRE APP CHECK VERIFICATION (L3)
    Files: functions/guestApplication.js
    Problem: Public applications not protected by App Check, reCAPTCHA not enforced
    Impact: Vulnerable to bot attacks and spam submissions
    Fix Priority: MEDIUM

36. SMART SEGMENT RULES ARE HARDCODED (L4)
    Files: functions/shared/segments.js
    Problem: Audience segment definitions hardcoded, not configurable by admins
    Impact: Limited flexibility for audience targeting
    Fix Priority: MEDIUM

37. RATE LIMIT RECORDS ACCUMULATE FOREVER (L5)
    Files: Firestore rate_limits collection
    Problem: Rate limit records have no TTL, data accumulates indefinitely
    Impact: Storage costs increase, query performance degrades
    Fix Priority: MEDIUM

================================================================================
LOW SEVERITY ISSUES (5 Total)
================================================================================

38. CAMPAIGNEDITOR AUTO-SAVE FIRES ON MOUNT
    Files: src/features/campaigns/components/CampaignEditor.jsx
    Problem: Auto-save triggered on mount with default values
    Impact: Accidental campaign overwrites possible
    Fix Priority: LOW

39. INTERNAL FIELDS VISIBLE IN BULK UPLOAD PREVIEW
    Files: src/features/campaigns/components/BulkUploadLayout.jsx
    Problem: Internal system fields displayed in preview table
    Impact: UI clutter, minor data exposure risk
    Fix Priority: LOW

================================================================================
SUMMARY & RECOMMENDATIONS
================================================================================

TOTAL ISSUES FOUND: 39
- Critical: 10
- High: 3
- Medium: 21
- Low: 5

IMMEDIATE ACTION ITEMS (Deploy Today):
1. Fix confirmation ID format (Critical)
2. Fix placeholder email domain (Critical)
3. Fix phone validation (Critical)
4. Fix employer field mismatches (Critical - AF1, AF2, AF7, AF8)
5. Mask SSN in PDFs (Critical)
6. Fix Firestore security rules (Critical)
7. Add auth check to confirmDriverInterest (Critical)
8. Add serviceAccountKey.json to .gitignore (Critical)

NEXT SPRINT PRIORITIES:
1. Fix SchemaRenderer for arrays (AF3)
2. Add file-type rendering (AF4)
3. Fix ExperienceTimeline DOT fields (AF5)
4. Standardize application payloads (AF6)
5. Add missing SSN & consent cards to Review (Issues 15, 16)
6. Add custom questions to public applications (Issue 17)

PLANNED MAINTENANCE:
1. Remove dead code (Issues 14, 20, 21)
2. Fix step navigation for dynamic steps (Issue 18)
3. Fix script bucket references (Issue 19)
4. Add admin role checks (Issue 22)
5. Fix document sealing security (Issues 27, 28)
6. Update ARCHITECTURE.md (Issue 25)

TECHNICAL DEBT:
1. Consolidate to Firebase Functions v2 (Issue 33)
2. Implement SMTP connection pooling (Issue 34)
3. Add App Check to guest applications (Issue 35)
4. Make segment rules configurable (Issue 36)
5. Add TTL to rate limit records (Issue 37)
6. Fix CampaignEditor auto-save timing (Issue 38)
7. Hide internal fields from UI (Issue 39)

APP RUNTIME IMPACT:
- Will the app run? YES, but with critical gaps
- Driver applications will FAIL due to phone validation, ID format, email domain issues
- Data display is BROKEN due to field name mismatches
- Security RISKS present: SSN exposed, overly permissive rules, missing auth checks
- DOT COMPLIANCE GAPS: Employment history incomplete, missing consent sections

================================================================================
END OF AUDIT REPORT
================================================================================
