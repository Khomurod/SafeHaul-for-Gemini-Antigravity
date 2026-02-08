diff --git a/completechange2.md b/completechange2.md
new file mode 100644
index 0000000000000000000000000000000000000000..62ff6c516d28fd5f589eeceb88a1e440d00d2c71
--- /dev/null
+++ b/completechange2.md
@@ -0,0 +1,475 @@
+# Complete Implementation Instructions (v2) — Align Current Build to Required Company UX + Backend Correctness
+
+This document is a **detailed migration and hardening playbook** to implement:
+1) the UI/UX improvements you requested (lighter sidebar, improved company-side application view, improved drivers/leads table), and  
+2) all items previously identified as **not implemented / mismatched from the required diff**.
+
+> Scope: Company-side admin experience (`/company/*`) including shell, navigation, list workspace, application detail, profile, and backend wiring safeguards.
+
+---
+
+## 0) Goals and Constraints
+
+### 0.1 Primary Goals
+- Replace dark/black left menu with a clean, light enterprise navigation.
+- Redesign company-side driver application detail into a compliance-first, operator-friendly workflow.
+- Redesign leads/applications table into compact, high-signal list operations UI.
+- Close every known mismatch from the required spec:
+  - tab order/labels mismatch,
+  - profile capability gaps,
+  - assignee filter mismatch,
+  - phone normalization gap,
+  - SafeHaul timer logic gap,
+  - Firestore nested ownership-rule gap,
+  - call UX dual-trigger bug.
+
+### 0.2 Non-Goals (for this phase)
+- Rebuilding authentication architecture.
+- Replacing Firestore with new data store.
+- Rewriting all feature modules from scratch.
+
+### 0.3 Quality Bar
+- Visual consistency across all company routes.
+- No regressions in existing operational features.
+- Explicit role/permission validation by role.
+- Measured rollout (feature flags optional), then cleanup.
+
+---
+
+## 1) Current-State Mismatch Matrix (Must Resolve)
+
+Use this as your authoritative implementation checklist.
+
+| ID | Mismatch | Current symptom | Required end-state |
+|---|---|---|---|
+| M1 | Application tab structure | Tabs are Overview/Contact/Notes/DQ File/PEV/Documents/Activity | Tabs must be: Application, DQ Files, Files, Contact, PEV, Notes, Activity |
+| M2 | Profile parity | Email is disabled; full profile pipeline incomplete | Name, Avatar, Username, Password, Email all editable with correct backend mapping + reauth |
+| M3 | Assignee filter UX | Free-text assignee input | UID-backed dropdown with optional Unassigned filter |
+| M4 | Phone search | Raw phone equality search | Normalize and query `phoneNormalized` + backfill data |
+| M5 | SafeHaul timer | Hardcoded local “next 7 AM” logic | Timer from backend `rotationEndsAt` |
+| M6 | Nested doc rules | Subcollection read checks do not evaluate parent ownership robustly | Rules must evaluate parent ownership/permissions safely for `dq_files` and `general_documents` |
+| M7 | Call behavior | Desktop/mobile behavior can trigger dual path | Mobile => tel link only, Desktop => modal only, never both |
+| M8 | Sidebar style | Dark visual system | Light enterprise visual system while keeping expanded/minimized behavior |
+
+---
+
+## 2) Execution Plan Overview
+
+Implement in this order:
+
+1. **Foundation/UI shell pass** (Sidebar/topbar visual system and navigation consistency)
+2. **Application detail IA pass** (tab labels/order + content structure)
+3. **List workspace pass** (table/toolbar redesign + filter correctness)
+4. **Backend correctness pass** (phone normalization, timer source, call trigger split)
+5. **Profile hardening pass** (full editable profile + backend mapping)
+6. **Security rules pass** (nested ownership checks)
+7. **Audit, QA matrix, cleanup and dead code deletion**
+
+---
+
+## 3) Sidebar + Shell Redesign (Light Enterprise)
+
+### 3.1 Keep Existing Behaviors
+- Preserve persisted sidebar mode via `companySidebarMode`.
+- Preserve expanded (`icon + label`) and minimized (`icon-only`) behavior.
+- Preserve navigation routes.
+
+### 3.2 Required Visual Changes
+- Sidebar container:
+  - From dark background to `bg-white`.
+  - Border `border-r border-gray-200`.
+  - Ensure contrast AA minimum.
+- Navigation item states:
+  - Default: `text-gray-600`.
+  - Hover: `bg-gray-50 text-gray-900`.
+  - Active: `bg-blue-50 text-blue-700 border-l-2 border-blue-600`.
+- Group headers:
+  - Minimal all-caps label style only when expanded (optional).
+  - No heavy shadows/gradients.
+- Tooltips in minimized mode:
+  - Use white tooltip with gray border + subtle shadow.
+
+### 3.3 Switch Company Placement Rule
+- Place **Switch Company** as a first-class action in sidebar top block (expanded: icon+label, minimized: icon with tooltip).
+- Remove duplicate/competing switch entry from topbar once confirmed accessible in sidebar.
+
+### 3.4 Acceptance Criteria
+- No black/dark block remains in left nav.
+- Expanded and minimized behaviors still work and persist after refresh.
+- All navigation items are reachable and route correctly.
+
+---
+
+## 4) Application Detail View Overhaul (Company Side)
+
+### 4.1 Information Architecture (Mandatory)
+Set exact tab order and label mapping:
+1. `Application`
+2. `DQ Files`
+3. `Files`
+4. `Contact`
+5. `PEV`
+6. `Notes`
+7. `Activity`
+
+Implementation details:
+- Update internal tab IDs + labels.
+- Ensure default tab = `Application`.
+- Ensure keyboard navigation and focus visible states.
+
+### 4.2 Application Tab: Schema Parity
+- Render from shared driver application schema source.
+- Do not maintain independent hand-curated field lists unless mapped from schema.
+- Add “missing critical fields” warning block for recruiters when schema-required values are blank.
+
+### 4.3 DQ Files Tab: Unified Compliance List
+- Keep merged source approach:
+  - `dq_files` subcollection
+  - app-level uploaded docs (CDL front/back, med card, etc.)
+- Add columns:
+  - Doc Type
+  - Source (`DQ Upload`, `CDL Front`, etc.)
+  - Expiration
+  - Status (Expired/Expiring/Active)
+  - Actions (Preview/Download/Delete)
+- Add top summary chips:
+  - Required complete count
+  - Expiring soon
+  - Expired
+
+### 4.4 Files Tab
+- Keep `general_documents` as authoritative source.
+- Add upload restrictions and accepted file types panel.
+- Add pagination if count > 50.
+
+### 4.5 Contact/PEV/Notes/Activity Parity
+- Reuse existing capabilities; standardize layout/spacing to compact style.
+- Prevent UI drift by using a shared section wrapper component.
+
+### 4.6 Call UX Trigger Correction (Critical)
+- Add runtime gate:
+  - `isMobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android/i.test(navigator.userAgent)`
+- Behavior:
+  - If mobile and phone exists: trigger `tel:` and **return**.
+  - Else desktop: open call outcome modal and **do not** trigger `tel:`.
+- Ensure each click path logs one action only.
+
+### 4.7 Acceptance Criteria
+- Tabs appear exactly in required order and labels.
+- No dual trigger for call actions.
+- DQ and Files tabs behave independently and correctly.
+
+---
+
+## 5) Drivers/Leads List Table Redesign
+
+### 5.1 Visual and Density
+- Row height target: 40–44px.
+- Header height target: 36–40px.
+- Compact spacing rhythm: 8/12/16.
+- Minimize visual noise:
+  - remove heavy gradients,
+  - reserve color for status and critical alerts.
+
+### 5.2 Column Prioritization
+Recommended default visible columns:
+- Name
+- Source (Application/SafeHaul/Company/My)
+- Status
+- Assigned To
+- Last Contact
+- Phone
+- Created/Distributed date
+
+Secondary columns via column selector only.
+
+### 5.3 Toolbar Redesign
+- Search field with icon, 32–36px height.
+- Filter panel in popover/drawer.
+- Column selector + saved views.
+- Bulk action strip appears only when rows selected.
+
+### 5.4 Assignee Filter Fix (M3)
+- Replace free-text with dropdown loaded from team members.
+- Value = user UID, label = user name.
+- Include `Unassigned` synthetic option that maps to missing/null `assignedTo`.
+- Ensure query logic handles:
+  - specific UID,
+  - unassigned state,
+  - no filter.
+
+### 5.5 Phone Search Normalization (M4)
+- Add utility: `normalizePhone(input)` -> digits-only with country normalization strategy.
+- On lead/application create + update, write:
+  - `phoneNormalized`
+- Search behavior:
+  - If search token is phone-like, query `phoneNormalized`.
+- Backfill script:
+  - Iterate `companies/*/applications` and `companies/*/leads`.
+  - Populate missing `phoneNormalized`.
+  - Dry-run mode first.
+
+### 5.6 SafeHaul Timer Correctness (M5)
+- Replace local 7AM computation with backend `rotationEndsAt` field.
+- UI countdown uses server timestamp-derived value.
+- Show fallback text if missing (`Rotation schedule unavailable`).
+
+### 5.7 Acceptance Criteria
+- Assignee dropdown filters correctly by UID.
+- Phone search returns normalized matches reliably.
+- Timer reflects backend truth, not client heuristic.
+
+---
+
+## 6) Profile Hardening (M2)
+
+### 6.1 Required Editable Fields
+- Name
+- Avatar
+- Username
+- Email
+- Password
+
+### 6.2 Backend Mapping Requirements
+- Firestore profile doc:
+  - `name`, `username`, `photoURL`, etc.
+- Firebase Auth:
+  - `displayName`, `email`, `password`, `photoURL` where appropriate.
+- Storage:
+  - avatar file upload path under user/company profile namespace.
+
+### 6.3 Sensitive Changes
+- Email/password updates must enforce re-auth.
+- On email update success:
+  - update Auth email,
+  - update profile doc email field,
+  - trigger UI refresh.
+- On password update success:
+  - clear local password inputs,
+  - show success toast.
+
+### 6.4 Validation Rules
+- Username uniqueness check (scope: global portal users or company-scoped, per current product policy).
+- Avatar mime types (`image/jpeg`, `image/png`, `image/webp`) + max size.
+- Email valid format and conflict handling.
+
+### 6.5 Acceptance Criteria
+- All five fields editable and persisted.
+- Refresh shows latest values.
+- Error states are actionable and specific.
+
+---
+
+## 7) Firestore Rules Hardening for Nested Reads (M6)
+
+### 7.1 Problem
+Nested subcollection rules for `dq_files` and `general_documents` can evaluate subcollection `resource.data` fields that may not guarantee parent ownership semantics.
+
+### 7.2 Required Rule Pattern
+- In subcollection read rules, derive parent app/lead document and check ownership/role against parent fields.
+- Implement helper function for parent access checks, e.g.:
+  - `canReadApplication(companyId, applicationId)`
+
+### 7.3 Rule Requirements
+- Company team and super admin retain access.
+- Driver ownership checks should use parent app document fields.
+- Deny-by-default for unknown contexts.
+
+### 7.4 Acceptance Criteria
+- Rules emulator tests pass for:
+  - company admin read/write,
+  - recruiter read/write,
+  - owning driver read,
+  - non-owner driver denied.
+
+---
+
+## 8) Role/Permission Audit Matrix
+
+Validate by role:
+- `super_admin`
+- `company_admin`
+- `hr_user/recruiter`
+
+For each role, verify:
+- Sidebar item visibility
+- Route access
+- Import leads action permissions
+- Assignment permissions
+- E-Docs visibility/actions
+- Profile edit scope
+- Switch company behavior
+
+Document failures with exact route and action name.
+
+---
+
+## 9) QA Matrix (Must Pass Before Merge)
+
+### 9.1 Navigation/UI
+- Sidebar expanded/minimized visuals and behavior.
+- Light theme is consistent.
+- Switch company reachable and functional.
+
+### 9.2 Menu Features
+- Dashboard
+- Driver Applications and Leads group (all 4 targets)
+- Search For Drivers
+- E-Docs
+- Import Leads
+- Quick Add Leads
+- Profile
+
+### 9.3 Application Detail
+- Tab order exact.
+- Application tab schema parity.
+- DQ merged document behavior.
+- Files CRUD works.
+- Contact/PEV/Notes/Activity parity.
+
+### 9.4 Data/Security
+- Correct company scoping.
+- Role restrictions pass.
+- Nested document rule correctness.
+- No cross-company leakage.
+
+### 9.5 Regression Focus
+- Driver search modal
+- Call outcome flow
+- Lead assignment
+- Quick lead add
+- Notification bell behavior
+
+---
+
+## 10) Suggested File-Level Worklist
+
+> Adjust names/paths only if repo structure changes.
+
+### 10.1 Shell + Nav
+- `src/features/company-admin/layout/CompanySidebar.jsx`
+- `src/features/company-admin/layout/CompanyTopbar.jsx`
+- `src/features/company-admin/layout/CompanyAppShell.jsx`
+
+### 10.2 App Detail
+- `src/features/company-admin/components/application-v2/ApplicationDetailViewV2.jsx`
+- `src/features/company-admin/hooks/useApplicationView.js`
+- `src/features/company-admin/components/tabs/DQFileTab.jsx`
+- `src/features/company-admin/components/tabs/GeneralDocumentsTab.jsx`
+
+### 10.3 Table + Toolbar + Data
+- `src/features/companies/components/DashboardTable.jsx`
+- `src/features/companies/components/DashboardBody.jsx`
+- `src/features/companies/components/DashboardToolbar.jsx`
+- `src/features/companies/hooks/useCompanyDashboard.js`
+
+### 10.4 Profile
+- `src/features/company-admin/views/UserProfilePage.jsx`
+- (plus existing auth/profile service modules)
+
+### 10.5 Rules
+- `src/firestore.rules`
+- emulator rule tests (if present)
+
+### 10.6 Optional Migration Script
+- add temporary script for `phoneNormalized` backfill; remove from runtime paths post-run.
+
+---
+
+## 11) Implementation Phases With Checkpoints
+
+### Phase A — Sidebar Light Theme + Navigation Consistency
+- Implement new light visual tokens.
+- Confirm minimized/expanded behaviors and tooltips.
+- Ensure switch-company location policy is applied.
+
+**Checkpoint A exit:** all nav routes functional, visual sign-off passed.
+
+### Phase B — Application Detail IA + Tab Contract
+- Rename/reorder tabs.
+- Wire sections to exact required mapping.
+- Remove outdated naming (“Overview”, “Documents”, “DQ File” singular) from UI.
+
+**Checkpoint B exit:** required tab contract fully met.
+
+### Phase C — Table UX + Filter Correctness
+- Implement compact table style.
+- Assignee dropdown (UID based) + unassigned filter.
+- Toolbar cleanup.
+
+**Checkpoint C exit:** list operations pass with no filter/query mismatch.
+
+### Phase D — Data Correctness Fixes
+- Phone normalization writes + backfill + query usage.
+- SafeHaul timer from `rotationEndsAt`.
+- Call flow desktop/mobile split.
+
+**Checkpoint D exit:** correctness issues closed and tested.
+
+### Phase E — Profile Completeness
+- Enable and wire all profile field edits.
+- Add reauth and robust error handling.
+
+**Checkpoint E exit:** profile deep audit passes all five field tests.
+
+### Phase F — Security + Regression + Cleanup
+- Harden Firestore nested rules.
+- Execute full QA matrix.
+- Delete dead/obsolete code and migration artifacts no longer needed.
+
+**Checkpoint F exit:** release-ready.
+
+---
+
+## 12) Cleanup and Deletion Rules (Post-Stabilization)
+
+After all QA passes:
+
+1. Remove deprecated UI components no longer referenced.
+2. Remove stale imports/state/handlers and dead branches.
+3. Remove temporary compatibility adapters.
+4. Remove feature flags only after stable release window.
+5. Keep one-time migration scripts archived outside runtime bundle if policy requires.
+
+Mandatory verification before merge:
+- lint
+- type check
+- build
+- unused imports/exports scan
+- dead route scan
+
+Document each deleted module in PR notes.
+
+---
+
+## 13) Definition of Done
+
+Implementation is done only if all are true:
+
+1. Sidebar is light-themed and behavior-correct (expanded/minimized).
+2. Menu and routes match required structure.
+3. Application detail tabs exactly match required order and labels.
+4. Table/list UX is compact and operationally efficient.
+5. Assignee filter mismatch fixed with UID dropdown.
+6. Phone normalization implemented end-to-end (including backfill).
+7. SafeHaul timer uses backend `rotationEndsAt`.
+8. Call UX uses single trigger path by device context.
+9. Profile supports name/avatar/username/email/password with proper backend wiring.
+10. Firestore nested rules enforce parent ownership semantics.
+11. Full role/permission and regression audits pass.
+12. Legacy/dead code removed after stabilization.
+
+---
+
+## 14) PR Attachment Template (Use During Merge)
+
+Include these sections in PR body:
+
+1. **Feature parity table** (pre vs post vs verified)
+2. **Mismatch closure table** (M1–M8 with proof)
+3. **Role audit table**
+4. **Data integrity notes** (company scoping validation)
+5. **Rules verification notes**
+6. **Cleanup/deletion list**
+7. **Known risks and rollback plan**
+
