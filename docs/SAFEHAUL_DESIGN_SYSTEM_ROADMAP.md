# SafeHaul design-system roadmap

> Permanent migration record for SafeHaul UI/UX standardization
> Baseline reviewed: `main` / `origin/main` at `9c56feb6463fb6e1a2291449ab982e865be9ce13`
> Baseline date: 2026-07-22
> Roadmap created: 2026-07-23

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed and verified
- `[!]` Blocked or requires a decision

`[~]` and `[!]` are intentional project conventions. If a renderer treats them
as ordinary unchecked boxes, the text status remains authoritative.

## Non-negotiable architecture

- The design system controls reusable visual appearance and interaction.
- Feature folders control feature content, available actions, and domain-to-UI
  mapping.
- Hooks and services control data, state, integrations, and business logic.
- `src/app` controls application composition, routes, guards, and providers.
- Feature screens stay with their features and consume approved design-system
  components.
- The design system must never know what a driver, recruiter, application,
  lead, campaign, or company is.
- No phase may change Firebase rules, database structures, backend behavior,
  integrations, or business workflows merely to simplify UI code.
- Legacy styles are removed only after all known consumers migrate and the
  replacement is functionally, visually, responsively, and accessibly verified.

## How to use this roadmap

Before UI work, read this file and `src/design-system/README.md`. Update the
relevant item as soon as verified work changes its status. A completed item
must include date, files, verification evidence, and a commit or PR reference
when one exists. Never mark work complete because code exists.

For every implementation item below, **complete means all applicable checks
pass**:

1. implementation is complete;
2. existing behavior is preserved;
3. relevant tests pass;
4. desktop visual behavior is reviewed;
5. mobile behavior is reviewed where applicable;
6. keyboard and accessibility behavior is reviewed;
7. documentation and catalog examples are updated;
8. the final diff contains no unrelated changes.

If a check cannot run, leave the item open or mark it `[!]`, and record why.

---

## 1. Current-state assessment

### 1.1 Repository and frontend structure

SafeHaul is a React 19, Vite 7, Tailwind CSS 3.4 JavaScript application. The
frontend contains 351 JavaScript/CSS source files in `src`, with 14 feature
areas. Route-mounted screens are registered through
`src/app/routes/featureRegistry.jsx`, public/protected route manifests, and the
company route manifest. This is a sound basis for keeping screens in features.

The code graph shows the existing broad layers:

- `features` owns most product screens and feature behavior;
- `shared` is a high-fan-in layer used by features;
- `lib`, `hooks`, `config`, and `context` own substantial data and application
  logic;
- `app` and `App.jsx` own routing and composition.

The graph also shows 12 shared-to-feature calls. The clearest inversions are:

- `src/shared/components/layout/Stepper.jsx` imports all driver-application
  steps and signature behavior;
- `src/shared/components/modals/CompanyChooserModal.jsx` imports the companies
  feature service.

These are migration candidates, not permission to rewrite behavior.

### 1.2 What already exists and can be reused

- `src/shared/styles/designTokens.css` defines color, status, spacing,
  typography, elevation, radius, motion, z-index, focus, reduced-motion,
  high-contrast, and responsive values.
- `src/shared/components/form/InputField.jsx`, `DateTripletField.jsx`,
  `MonthYearField.jsx`, `RadioGroup.jsx`, `AgreementBox.jsx`, and
  `DynamicRow.jsx` provide reusable form foundations.
- `src/shared/components/modals/Modal.jsx` already implements dialog semantics,
  initial focus, focus trapping, Escape handling, backdrop handling, and focus
  restoration.
- `src/shared/components/badges/StatusBadge.jsx` pairs status color with an icon,
  avoiding color-only communication.
- `src/shared/components/table/ModernDriverTable.jsx` centralizes one table's
  header/cell spacing, loading skeleton, empty state, selection, sticky header,
  and pagination.
- Shared loading, error, toast, notification, paywall, and queue feedback
  components exist.
- `src/shared/hooks/useIsMobile.js` centralizes the Tailwind `md` breakpoint.
- Vitest/Testing Library, `vitest-axe`, Playwright, `@axe-core/playwright`, and
  desktop/mobile Playwright projects already exist.
- CI already runs frontend lint, unit/coverage, Chromium E2E, backend tests,
  callable-contract validation, and Firebase rule emulator tests. Type checking
  and browser accessibility are present as non-blocking lanes.
- Lucide is the dominant icon library; branded SafeHaul SVG artwork exists and
  should remain explicit.

These assets should be promoted, adapted, or wrapped rather than duplicated.

### 1.3 Inconsistency and adoption findings

Audit counts are exact `rg` line/tag matches at the baseline, not estimates of
unique user journeys:

| Finding | Baseline |
|---|---:|
| Raw `<button>` occurrences | 398 |
| Raw `<input>` occurrences | 155 |
| Raw `<select>` occurrences | 60 |
| Raw `<textarea>` occurrences | 23 |
| Raw `<table>` occurrences | 18 across 15 files |
| `fixed inset-0` overlay matches | 30 |
| `text-[9px]` matches | 22 |
| `text-[10px]` matches | 129 |
| Raw hexadecimal color matches | 73 across 10 files |
| Responsive/mobile code matches | 206 |

Important interpretation:

- The existing token stylesheet is imported globally, but its variables have
  no consumers outside that stylesheet. Most UI styling uses direct Tailwind
  palette, size, radius, and shadow utilities.
- `tailwind.config.js` previously had an empty `theme.extend`, so the CSS token
  layer and Tailwind layer were disconnected.
- Both `gray` and `slate` palettes are heavily used, creating subtle surface and
  typography drift.
- There is no approved shared Button or Card. Button treatment is repeated
  hundreds of times.
- Shared `InputField` has limited adoption relative to 238 raw
  input/select/textarea occurrences.
- `ModernDriverTable` is used by the company candidate list, while the remaining
  active data tables implement local spacing, density, alignment, empty/loading
  states, and mobile overflow.
- The accessible `Modal` has low direct adoption; most overlay files still
  construct backdrops and panels locally.
- Status styling is split across `StatusBadge.jsx`,
  `shared/utils/statusStyles.js`, and feature-local conditional classes.
- StatusBadge itself contains SafeHaul workflow labels. Its accessible behavior
  is reusable, but the future design-system Badge must accept a generic tone;
  features must map domain status to tone/icon/label.
- Many feature JSX files combine dense Tailwind markup with direct Firebase or
  callable access. The highest-risk examples include DocumentsManager,
  EnvelopeCreator, SigningRoom, PEVTab, UserProfilePage, CampaignDetails,
  FeaturesView, CompaniesView, and UnifiedDriverList.
- Some large components are legitimately feature-specific. Separation should
  happen only when an extraction preserves behavior and reduces coupling.

### 1.4 Tables: priority assessment

The current tables use at least three spacing families (`px-3`, `px-4`, and
`px-6`), multiple header sizes (10px, 11px, 12px, and 14px), mixed
capitalization/weight, and locally specified left/center/right alignment.
Headers and cells usually align within an individual hand-written table, but
there is no single contract preventing future header/cell drift.

`ModernDriverTable` is the best starting point, but it is not yet an approved
general DataTable:

- row click is mouse-only because the `<tr>` is not keyboard actionable;
- selection uses icon buttons instead of native checkboxes and lacks explicit
  accessible labels;
- header and cell class overrides can independently change alignment;
- no column schema owns alignment, width, numeric formatting, responsive
  priority, or truncation;
- no caption/accessible name contract exists;
- mobile behavior is overflow-only and not documented per use case;
- loading and empty states are embedded rather than composed from shared
  feedback patterns.

The migration must introduce one column schema that applies alignment and width
to both `<th>` and `<td>`, plus documented density and responsive modes.

### 1.5 Accessibility assessment

Strengths:

- Modal and InputField have structural accessibility tests.
- Modal focus management substantially follows the WAI-ARIA dialog pattern.
- Reduced-motion and high-contrast media support exist.
- Most form markup has labels; the audit found 204 `<label>` matches.
- Desktop and mobile browser projects are configured.

Risks:

- the browser axe job is non-blocking;
- component axe tests disable color contrast because happy-dom cannot calculate
  layout;
- no `focus-visible` usage was found, while focus-ring utilities are locally
  repeated;
- many icon-only and table-selection buttons need accessible-name review;
- clickable table rows need keyboard-equivalent behavior;
- locally implemented modals may lack focus trap, focus return, accessible
  naming, inert background behavior, or scroll locking;
- 9px and 10px interface text is widespread and risks readability;
- custom colors and muted text require real-browser contrast review;
- native semantics versus interactive ARIA grid behavior are not decided for
  complex tables;
- responsive layouts can visually hide context without an equivalent accessible
  label or relationship.

The target is WCAG 2.2 AA unless the owner explicitly chooses another documented
standard.

### 1.6 Mobile and responsive assessment

- Tailwind breakpoints and `useIsMobile` are present and used.
- Playwright defines Desktop Chrome, Mobile Safari emulation, and Mobile Chrome
  emulation.
- Signing has dedicated mobile/document-first coverage and must be treated as a
  high-risk specialized workflow.
- Many tables rely on horizontal scrolling; some pages use card/grid
  alternatives; no shared rule decides which strategy is appropriate.
- Fixed shells, nested overflow regions, sticky headers, and overlays require
  targeted small-screen review.
- Touch target size is not centralized despite a legacy 72px mobile-row token.

### 1.7 Risks

#### Main UI/UX risks

- visual drift accelerates because every feature can choose raw utilities;
- table density and alignment vary between otherwise similar admin workflows;
- modal, form, status, and feedback behavior is inconsistent by feature;
- tiny text and subtle muted colors reduce readability;
- two competing systems could emerge if new primitives are added without
  compatibility/migration plans.

#### Main accessibility risks

- non-blocking browser accessibility enforcement;
- local modal implementations;
- mouse-only row behavior and unlabeled icon controls;
- incomplete contrast evidence;
- unsupported small text;
- inconsistent focus treatment and mobile reading order.

#### Main maintainability risks

- UI markup and data mutations coexist in large feature components;
- shared-to-feature dependency inversions blur ownership;
- no catalog documents supported component states;
- no visual baseline catches accidental regressions;
- no ratcheting rule prevents new raw controls, tables, arbitrary colors, or
  unsupported font sizes.

### 1.8 What must not be changed by this initiative

- route URLs, authorization, role checks, and feature flags;
- Firebase rules, indexes, data shape, Cloud Functions, or integrations;
- submission, campaign, recruiting, verification, signing, or document
  workflows;
- PDF field geometry, signing coordinates, upload semantics, or offline queues;
- domain status vocabulary without a separate product decision;
- feature ownership of screens and actions;
- branded artwork unless accessibility or consistency requires an approved
  adjustment.

---

## 2. Professional design-system comparison

The target follows practices demonstrated by mature systems without copying
their visual identity:

- [Atlassian Foundations](https://atlassian.design/foundations) treats tokens
  as the source of truth and separates foundations, components, and patterns.
- [Atlassian Components](https://atlassian.design/components) demonstrates
  token-backed primitives and automated styling guardrails.
- [Carbon data-table guidance](https://carbondesignsystem.com/components/data-table/usage/)
  centralizes row sizes, toolbar relationships, alignment, variants, and table
  states.
- [Carbon data-table accessibility](https://carbondesignsystem.com/components/data-table/accessibility/)
  treats keyboard behavior, sortable headers, and in-cell controls as part of
  the component contract.
- [WAI-ARIA dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  defines focus containment, Escape, focus restoration, naming, and inert
  background expectations.
- [WAI-ARIA table/grid guidance](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
  distinguishes a semantic HTML table from an interactive keyboard-managed
  grid; SafeHaul must choose per use case rather than applying `role="grid"`
  cosmetically.
- [Storybook documentation](https://storybook.js.org/docs/writing-docs) and
  [visual testing guidance](https://storybook.js.org/tutorials/visual-testing-handbook/)
  support a state catalog and screenshot-based review.
- [Tailwind CSS v3 theme guidance](https://v3.tailwindcss.com/docs/adding-custom-styles)
  supports exposing design decisions through `theme.extend` and CSS variables.

SafeHaul is behind mature systems in token adoption, catalog coverage,
component enforcement, and visual regression. It already has stronger-than-zero
accessibility foundations, feature separation, route manifests, test
infrastructure, and several reusable primitives. The safest strategy is a
compatibility-backed, component-family migration with a ratcheting baseline.

---

## 3. Target architecture

```text
src/
├── design-system/
│   ├── tokens/       # Primitive scales, semantic roles, Tailwind bridge
│   ├── components/   # Business-neutral accessible primitives
│   ├── patterns/     # Reusable compositions and UI states
│   ├── layouts/      # Page/region geometry without route or domain knowledge
│   ├── icons/        # Approved icon contract and branded exceptions
│   ├── stories/      # Component catalog and supported-state examples
│   ├── tests/        # Boundary, contrast, a11y, interaction, visual tests
│   ├── README.md
│   └── index.css
├── features/         # Screens, feature components, domain adapters/actions
├── shared/           # Compatibility UI plus cross-feature non-domain utilities
├── hooks/            # Existing cross-feature state/data hooks
├── lib/              # Integrations and infrastructure
└── app/              # Routes, guards, providers, composition
```

### Layer contracts

#### `design-system/tokens`

Owns primitive scales and semantic roles. It may preserve compatibility imports
or aliases temporarily. Feature code should prefer semantic roles such as
content, surface, action, status tone, and table role rather than palette
names.

#### `design-system/components`

Owns Button, IconButton, Field primitives, Card, Badge, Dialog, and table
building blocks. APIs use generic props. A component must ship with documented
states, interaction tests, accessibility tests, and catalog examples before it
is considered approved.

#### `design-system/patterns`

Owns compositions such as PageState, EmptyState, FormField, Dialog sections,
DataTable toolbar/pagination, and responsive presentation patterns. Patterns
accept content and callbacks; they never fetch data or encode feature
permissions.

#### `design-system/layouts`

Owns visual geometry such as AppFrame regions, PageContainer, PageHeader,
Stack, Inline, and split panels. `CompanyAppShell` stays in its feature because
it knows company navigation and deactivation behavior; it may later consume
business-neutral layout primitives.

#### `features`

Own domain language, feature screens, feature-specific composition, available
actions, and adapters such as `applicationStatus -> { tone, icon, label }`.
Feature-specific screens remain here.

#### `shared`

During migration, owns existing compatibility components and cross-feature
utilities. New long-term visual primitives go to `design-system`; existing
shared components move or wrap the new components only after consumer and
behavior review. Non-visual helpers may remain shared.

#### hooks and services

Own data fetching, mutation, subscriptions, integration calls, validation, and
business state. Logic extraction is optional and behavior-preserving, not a
prerequisite for visual migration.

#### `app`

Owns routing, authentication/role guards, providers, error boundaries, and
feature registration. It must not become a component dumping ground.

### Dependency direction

```text
app -> features -> design-system
       features -> hooks/services/lib
       features -> shared (temporary or non-visual)
shared compatibility UI -> design-system (during migration)
design-system -> React/presentation libraries only
```

The reverse directions are prohibited.

---

## 4. Phased migration plan

### Phase 0 — governance, audit, and baseline

- [x] Audit the latest `main` UI architecture and establish the permanent
  roadmap.
  - Complete when: routes, component families, style adoption, tables, mobile,
    accessibility, mixed logic, risks, target layers, and migration inventory
    are documented against an exact commit.
  - Completed: 2026-07-23
  - Files: `docs/SAFEHAUL_DESIGN_SYSTEM_ROADMAP.md`
  - Verification: `git fetch origin main --prune`; local and remote `main`
    both resolved to `9c56feb6463fb6e1a2291449ab982e865be9ce13`;
    codebase knowledge-graph architecture review; source/tag/style/test/CI
    inventory; official design-system and accessibility research.
  - Visual/mobile/a11y: assessment only; no runtime change.
  - Commit/PR: checkpoint `d993804`.

- [x] Define permanent layer ownership and the no-business-knowledge boundary.
  - Complete when: the target tree, allowed dependencies, feature ownership,
    compatibility policy, and prohibited changes are documented and backed by
    an automated design-system dependency test.
  - Completed: 2026-07-23
  - Files: `src/design-system/README.md`,
    `src/design-system/tests/architecture.test.js`, this roadmap.
  - Verification: architecture test passed (1 test); final full-suite evidence
    is recorded in the completion log.
  - Visual/mobile/a11y: not applicable; no rendered output.
  - Commit/PR: checkpoint `d993804`.

### Phase 1 — design-system foundation and token v2 bridge

- [x] Establish the tracked `src/design-system` folder structure.
  - Complete when: tokens, components, patterns, layouts, icons, stories, and
    tests have documented responsibilities and aliases resolve in Vite and
    editor tooling.
  - Completed: 2026-07-23
  - Files: `src/design-system/**/README.md`, `vite.config.js`, `jsconfig.json`.
  - Verification: build, lint, typecheck, token tests, architecture test, and
    diff review; exact results are in the completion log.
  - Visual/mobile/a11y: not applicable; documentation and resolver-only change.
  - Commit/PR: checkpoint `d993804`.

- [x] Add a namespaced primitive/semantic token contract and Tailwind bridge
  without changing existing screens.
  - Complete when: `--ds-*` foundation and semantic tokens cover surfaces,
    content, actions, borders, states, typography, spacing, radius, elevation,
    motion, layering, and table roles; Tailwind exposes namespaced utilities;
    existing legacy CSS remains in the same cascade position; token tests prove
    supported type size and contrast.
  - Completed: 2026-07-23
  - Files: `src/design-system/tokens/foundation.css`,
    `src/design-system/tokens/semantic.css`,
    `src/design-system/tokens/index.css`, `src/design-system/index.css`,
    `src/index.css`, `tailwind.config.js`,
    `src/design-system/tests/tokens.test.js`.
  - Verification: 13 token tests passed, including 11 WCAG AA contrast pairs;
    production build passed; generated CSS reviewed; no feature uses the new
    tokens yet, so current visual output is intentionally unchanged.
  - Visual/mobile/a11y: no consumer migration; contrast is automated, runtime
    visual/mobile review becomes mandatory with the first consumer.
  - Notes: `src/shared/styles/designTokens.css` remains loaded as a temporary
    compatibility layer. Blue 600, rather than Blue 500, is the new primary
    semantic action color because white text meets normal-text AA contrast.
  - Commit/PR: checkpoint `d993804`.

- [ ] Reconcile legacy token names and values into explicit compatibility
  aliases.
  - Complete when: every legacy variable is mapped, changed values have visual
    approval, high-contrast/reduced-motion utilities have a permanent home, all
    consumers/build/tests pass, and removal criteria are recorded.

- [ ] Inventory and approve the complete semantic token vocabulary.
  - Complete when: design/product owners review brand, surface, text, action,
    status, chart, focus, and data-visualization roles in desktop/mobile/high
    contrast; automated contrast covers every foreground/background pair.

### Phase 2 — typography and content standards

- [ ] Define type roles and migrate unsupported 9px/10px interface text.
  - Complete when: heading/body/label/helper/table roles are documented; no new
    9px/10px body text is permitted; all 151 baseline tiny-text matches are
    resolved or explicitly exempted; desktop/mobile/zoom review and contrast
    pass.

- [!] Decide whether to self-host Inter or retain the external stylesheet.
  - Complete when: privacy, performance, offline behavior, licensing, and
    fallback metrics are reviewed; the chosen delivery passes build and visual
    regression at loading and loaded states.

### Phase 3 — buttons and controls

- [~] In progress — build and approve Button and IconButton.
  - Complete when: variants, sizes, loading, disabled, destructive, link-like,
    icon-only accessible naming, focus-visible, touch target, interaction tests,
    axe tests, stories, and desktop/mobile visuals pass.
  - Progress: business-neutral Button and IconButton primitives now cover the
    required variants, sizes, native disabled/loading behavior, accessible
    icon naming, focus visibility, and touch targets. Unit/axe tests and the
    Company shell desktop/mobile consumer review pass. This item remains open
    until the component catalog and durable visual baselines are approved.
  - Files: `src/design-system/components/button/*`,
    `src/features/company-admin/layout/CompanySidebar.jsx`,
    `src/features/company-admin/layout/CompanyTopbar.jsx`,
    `src/features/company-admin/components/NotificationDropdown.jsx`.

- [ ] Ratchet raw-button creation.
  - Complete when: a documented baseline allowlist prevents the 398 raw-button
    count from increasing; exceptions require a comment/roadmap entry; CI is
    blocking after the baseline is stable.

### Phase 4 — forms

- [~] In progress — Define Field, Label, HelpText, FieldError, Input, Select, Textarea,
  Checkbox, Radio, and file-input contracts.
  - Complete when: accessible names/descriptions/errors, required semantics,
    disabled/read-only states, focus, autofill, validation timing, touch size,
    stories, unit/axe tests, and mobile keyboard behavior pass.
  - Progress: the native-event `FormField`, `Label`, `FieldMessage`, `Input`,
    `Textarea`, `Select`, and `FormSection` contract is implemented and proven
    by the Company Settings Personal Profile compatibility slice. Checkbox,
    Radio, Switch, file input, autofill policy, component-catalog examples, and
    durable visual baselines remain open, so the family is not complete.
  - [x] Establish the native-event form foundation required by the first
    compatibility slice.
    - Completed: 2026-07-23.
    - Files: `src/design-system/components/form/**`,
      `src/design-system/components/index.js`,
      `src/design-system/components/README.md`,
      `src/design-system/README.md`.
    - Verification: 4 form primitive tests passed, including native events,
      label/description/error/required relationships, disabled/read-only
      behavior, Select/Textarea parity, FormSection semantics, and axe.
    - Visual/mobile/a11y: 44 px controls, semantic token styling, focus ring,
      invalid/read-only/disabled states, wrapping, and mobile single-column
      layout were reviewed through the first consumer at 1440×900, 1024×768,
      and 412×915.
    - Notes: these components emit native events and contain no Firebase,
      Company, user, recruiter, validation, or save logic. Existing shared
      callback/file controls remain compatibility adapters.
    - Commit/PR: checkpoint `0d22a0d`.

- [ ] Adapt existing shared form controls without changing data contracts.
  - Complete when: existing `(name, value)` callbacks, file behavior, date
    clamping, validation, and feature tests remain intact; consumers migrate
    incrementally; compatibility wrappers and removal criteria are documented.

### Phase 5 — feedback, status, and page states

- [~] In progress — build business-neutral Badge/StatusIndicator and feature-owned status
  adapters.
  - Complete when: the design system accepts generic tone/icon/label only,
    domain vocabulary remains in features, all visual states meet contrast and
    non-color communication requirements, and status vocabulary tests pass.
  - Progress: the generic Badge accepts tone and feature-provided content only;
    the Company leaderboard owns rank/MVP language. Badge unit/axe tests and
    desktop/mobile consumer review pass. StatusIndicator and remaining
    feature-owned adapters are not yet implemented, so this item remains open.
  - Files: `src/design-system/components/badge/*`,
    `src/features/company-admin/components/InlineLeaderboard.jsx`.

- [ ] Standardize LoadingState, EmptyState, ErrorState, InlineAlert, Skeleton,
  and Progress.
  - Complete when: supported sizes/layouts and live-region behavior are
    documented; shared feedback implementations are reused; async transitions
    have unit/axe/visual/mobile coverage; no workflow messaging changes.

### Phase 6 — dialogs and overlays

- [ ] Promote the accessible Modal foundation into an approved Dialog family.
  - Complete when: Dialog, AlertDialog, header/body/footer/close patterns,
    initial focus, trap, Escape, focus restoration, scroll lock, background
    inertness, nested dialog policy, mobile full-screen behavior, tests, and
    stories pass.

- [ ] Migrate local overlay implementations.
  - Complete when: all 30 baseline backdrop matches are migrated or explicitly
    exempted; destructive flows focus the least destructive action where
    appropriate; functional tests prove no save/cancel/delete behavior changed.

### Phase 7 — tables and data presentation

- [x] Specify the DataTable column schema and visual contract.
  - Complete when: one column definition controls header and cell alignment,
    width/min-width, numeric/date formatting, truncation, responsive priority,
    and accessible label; density, toolbar, pagination, selection, loading,
    empty, and error states are documented.
  - Completed: 2026-07-23.
  - Files: `src/design-system/components/data-table/tableColumnContract.js`,
    `src/design-system/components/data-table/tableColumnContract.test.js`,
    `src/design-system/components/data-table/README.md`.
  - Verification: 7 contract tests passed; the candidate pilot verified that
    the same column attributes control header/cell alignment, width, priority,
    truncation, row headers, and accessible labels.
  - Visual/mobile/a11y: the contract's comfortable and compact density,
    selection, page states, pagination, and horizontal-overflow behavior were
    reviewed through the candidate consumer on desktop and Mobile Chrome.
  - Notes: feature renderers retain feature-specific formatting and actions;
    the contract remains business-neutral.
  - Commit/PR: checkpoint `d993804`.

- [~] In progress — build approved semantic Table/DataTable primitives.
  - Complete when: native-table versus interactive-grid behavior is explicit;
    keyboard selection/sorting, captions, header scopes, icon labels, row
    actions, sticky behavior, overflow, stories, unit/axe/Playwright tests, and
    desktop/mobile visual baselines pass.
  - Progress: the native-table DataTable, candidate fixtures, unit tests,
    scoped axe checks, keyboard/selection E2E, and desktop/mobile review are
    complete. This item remains open until the component-catalog decision is
    resolved and approved stories plus durable visual baselines exist.
  - Files: `src/design-system/components/data-table/*`,
    `src/design-system/components/index.js`,
    `src/design-system/components/README.md`.

- [~] In progress — migrate each table in the dedicated inventory below.
  - Complete when: every row is individually verified, header/cell alignment is
    reviewed at representative data lengths, behavior is preserved, and the raw
    table guardrail reaches zero outside approved locations/exemptions.
  - Progress: the Company candidate-list consumer is complete and verified.
    The Company leaderboard is also complete and verified. The legacy
    `ModernDriverTable` still serves Super Admin and remains in the inventory;
    all other table consumers remain unchecked.

### Phase 8 — cards and page structure

- [~] In progress — approve Card, PageContainer, PageHeader, Section, Stack, Inline, and
  responsive grid/layout primitives.
  - Complete when: spacing, surface, elevation, heading order, actions, loading,
    narrow/wide widths, stories, visual tests, and mobile behavior pass.
  - Progress: Card, MetricCard, PageContainer, PageHeader, Section, Stack,
    Inline, and ResponsiveGrid are implemented, documented, unit/axe tested,
    and verified in the Company dashboard at 1440 px, 1024 px, and 412 px.
    Approval stories and durable visual baselines remain unresolved.
  - Files: `src/design-system/components/card/*`,
    `src/design-system/layouts/page/*`.

- [~] In progress — compose feature shells from layout primitives without moving feature
  ownership.
  - Complete when: Company and Super Admin navigation/permissions/flags remain
    in features, scroll/focus behavior is preserved, and route E2E tests pass.
  - Progress: the Company shell now consumes the business-neutral
    WorkspaceFrame while Company navigation, route visibility, permissions,
    feature flags, labels, and persistence remain feature-owned. Company route,
    access-control, keyboard, desktop, laptop, and Mobile Chrome checks pass.
    Super Admin remains unmigrated.
  - Files: `src/design-system/layouts/workspace/*`,
    `src/features/company-admin/layout/*`.

### Phase 9 — responsive and mobile behavior

- [~] In progress — document responsive strategies by pattern.
  - Complete when: breakpoints, container widths, touch targets, dialogs,
    navigation, forms, cards, tables (scroll/card/column-priority), and
    document/signing exceptions are defined and reviewed on Mobile Chrome,
    Mobile Safari emulation, and desktop.
  - Progress: the workspace off-canvas navigation, responsive metric grid, and
    native-table horizontal-overflow strategy are documented and verified in
    Chromium/Mobile Chrome. Forms, dialogs, documents/signing, Mobile Safari
    emulation, and the remaining feature strategies are still open.

- [ ] Add representative mobile visual and interaction coverage.
  - Complete when: public application, company dashboard/candidate list,
    settings forms, dialogs, super-admin data, and signing have stable mobile
    assertions and screenshot baselines with an owner-approved review workflow.

### Phase 10 — accessibility

- [!] Confirm WCAG 2.2 AA as the permanent product target.
  - Complete when: owner approval is recorded, exceptions have accountable
    remediation plans, and the standard appears in the UI standard and PR
    checklist.

- [ ] Make browser accessibility tests blocking.
  - Complete when: serious/critical baseline violations are resolved, the axe
    lane is stable in CI, false positives are documented narrowly, and
    `continue-on-error` is removed.

- [ ] Establish keyboard, zoom/reflow, contrast, reduced-motion, and
  high-contrast manual test matrices.
  - Complete when: each approved component and migrated screen records results
    against the matrix and automated checks cover enforceable portions.

### Phase 11 — component catalog and visual regression

- [!] Select Storybook or a smaller equivalent and its baseline-review service.
  - Complete when: dependency/security/maintenance cost, Firebase compatibility,
    hosting, CI time, private data mocking, and baseline approval ownership are
    decided.

- [ ] Catalog every approved component and pattern.
  - Complete when: default, variant, state, error, long-content, empty,
    loading, reduced-motion, and narrow viewport examples exist with usage and
    anti-pattern documentation.

- [ ] Add blocking visual screenshot regression.
  - Complete when: deterministic fonts/data/animations are configured, desktop
    and mobile baselines are approved, intentional-update workflow is
    documented, and CI uploads useful diffs.

### Phase 12 — permanent automated guardrails

- [x] Add a business-neutral design-system dependency test.
  - Complete when: CI-visible tests reject imports from features, application
    context, or Firebase into `src/design-system`.
  - Completed: 2026-07-23
  - Files: `src/design-system/tests/architecture.test.js`.
  - Verification: focused test passed; full frontend suite result is recorded
    in the completion log.
  - Visual/mobile/a11y: not applicable.
  - Commit/PR: checkpoint `d993804`.

- [ ] Add ratcheting rules for arbitrary colors and unsupported type sizes.
  - Complete when: the baseline cannot increase; design-system internals and
    branded/visualization exceptions are explicit; all new violations fail CI.

- [ ] Add ratcheting rules for raw tables, duplicate buttons, local modals, and
  local form controls.
  - Complete when: approved locations are machine-readable, baseline counts
    decrease with migrations, and CI rejects new unapproved implementations.

- [ ] Add a design-system PR checklist.
  - Complete when: behavior, desktop/mobile visual, keyboard, a11y, tests,
    roadmap, catalog, diff, and migration/compatibility evidence are required
    for UI PRs.

- [x] Add permanent AI-agent instructions.
  - Complete when: `AGENTS.md` and `CLAUDE.md` require roadmap/UI-standard
    reading, approved reuse, documented exceptions, roadmap evidence, relevant
    tests, and honest status.
  - Completed: 2026-07-23
  - Files: `AGENTS.md`, `CLAUDE.md`.
  - Verification: instruction diff reviewed; no runtime behavior.
  - Visual/mobile/a11y: not applicable.
  - Commit/PR: checkpoint `d993804`.

### Phase 13 — feature-by-feature migration order

- [x] Pilot: migrate the Company candidate list from `ModernDriverTable` to the
  approved DataTable.
  - Complete when: DataTable primitives prove alignment, selection, pagination,
    loading/empty/error, keyboard, desktop, and mobile contracts without
    changing filters, bulk actions, row actions, data, or dossier behavior.
  - Completed: 2026-07-23.
  - Files: `src/features/company-admin/views/CompanyCandidatesListPage.jsx`,
    `src/features/companies/components/DashboardToolbar.jsx`,
    `src/design-system/components/data-table/*`,
    `src/design-system/components/index.js`,
    `src/design-system/components/README.md`,
    `src/design-system/tokens/semantic.css`, `tailwind.config.js`,
    `src/features/company-admin/components/modals/driver-dossier/DriverProfileModal.jsx`,
    `src/shared/components/modals/CallOutcomeModalUI.jsx`,
    `e2e/company-candidate-table.spec.cjs`.
  - Verification: 15 focused DataTable tests passed; the full frontend suite
    and coverage gate passed; build, lint, and typecheck passed; 8 candidate
    desktop/mobile Playwright checks passed with 2 intentional
    viewport-specific skips; 8 existing candidate filter tests passed.
  - Visual/mobile/a11y: desktop alignment was measured at under 1 px
    header/cell center variance; Mobile Chrome verified labeled horizontal
    overflow, visible touch actions, and dossier access; scoped axe found no
    serious or critical violations.
  - Notes: filters, sorting, loading, pagination, calls, bulk assignment,
    permissions, selection scope, and dossier workflows remain feature-owned.
    `ModernDriverTable` was not deleted or globally rewritten because Super
    Admin still consumes it. The mobile review exposed the existing Company
    shell/sidebar width defect; the Company workspace shell/dashboard phase
    resolved and verified it on 2026-07-23.
  - Commit/PR: checkpoint `d993804`.

- [x] Company workspace shell and dashboard.
  - Complete when: layout/card/button/status primitives are adopted and route,
    permissions, onboarding, stats, upload, leaderboard, and mobile tests pass.
  - Completed: 2026-07-23.
  - Files: `src/design-system/components/button/*`,
    `src/design-system/components/card/*`,
    `src/design-system/components/badge/*`,
    `src/design-system/layouts/workspace/*`,
    `src/design-system/layouts/page/*`,
    `src/design-system/layouts/index.js`,
    `src/design-system/components/data-table/*`,
    `src/design-system/components/index.js`,
    `src/design-system/components/README.md`,
    `src/design-system/README.md`,
    `src/design-system/tokens/semantic.css`,
    `src/features/companies/components/StatCard.jsx`,
    `src/features/company-admin/layout/CompanyAppShell.jsx`,
    `src/features/company-admin/layout/CompanySidebar.jsx`,
    `src/features/company-admin/layout/CompanySidebar.test.jsx`,
    `src/features/company-admin/layout/CompanyTopbar.jsx`,
    `src/features/company-admin/components/CompanyAdminDashboard.jsx`,
    `src/features/company-admin/components/InlineLeaderboard.jsx`,
    `src/features/company-admin/components/InlineLeaderboard.test.jsx`,
    `src/features/company-admin/components/NotificationDropdown.jsx`,
    `src/tests/dashboard.test.jsx`,
    `e2e/company-shell-dashboard.spec.cjs`, `tailwind.config.js`.
  - Verification: 10 focused files / 36 tests passed; final full coverage
    gate passed with 80 files / 518 tests and 2 files / 48
    emulator-dependent rules tests skipped by their existing environment guard;
    frontend/backend lint passed with 0 errors and 169 existing frontend
    warnings; typecheck and production build passed; the shell/dashboard
    Playwright spec passed 5 checks with 3 intentional viewport-specific skips
    across Chromium and Mobile Chrome; combined route, authorization,
    candidate-table, and filtering regression run passed 23 checks with 5
    intentional viewport-specific skips.
  - Visual/mobile/a11y: manually reviewed at 1440×900, 1024×768, and 412×915;
    the page has no document-level horizontal overflow, metrics reflow, the
    leaderboard contains its horizontal overflow with aligned numeric columns,
    and the 412 px shell keeps full-width content. Mobile navigation is
    off-canvas with a touch close action, inert/hidden closed state, focus trap,
    Escape/route close, and focus return. Scoped real-browser axe found no
    serious or critical violations.
  - Notes: Company route labels, feature flags, permissions, local persistence,
    dashboard hooks, onboarding, stats, uploads, navigation actions, and the
    Firestore leaderboard query remain feature-owned. No backend, Firebase
    rules, database, integration, or workflow behavior changed. Component
    families remain in progress until catalog/visual-baseline approval.
  - Commit/PR: checkpoint `d993804`.

- [~] In progress — Company settings and profile.
  - Complete when: form/table/dialog primitives are adopted and all save,
    integration, phone assignment, question, role, and validation behavior
    remains covered.
  - [x] Audit the active settings/profile controls and select the first
    compatibility slice.
    - Completed: 2026-07-23.
    - Files: `src/features/settings/components/**`,
      `src/features/settings/hooks/useLineAssignments.js`,
      `src/features/company-admin/views/UserProfilePage.jsx`, this roadmap.
    - Verification: codebase graph architecture/dependency review; exact
      inventory of inputs, selects, textareas, checkboxes, button-based
      switches, uploads, labels, direct Firebase/Auth/Storage/callable access,
      tiny text, and existing tests.
    - Visual/mobile/a11y: source audit identified missing label associations,
      locally repeated focus/disabled/read-only states, button-based switches
      without switch semantics, 10 px settings navigation labels, and the
      keyboard-inaccessible avatar upload surface. Runtime review is required
      per migrated slice.
    - Notes: Personal Profile inside Company Settings is the first low-risk
      compatibility slice. The separate `/company/profile` account-security
      screen remains higher risk because it combines avatar upload,
      Authentication reauthentication/email/password changes, uniqueness
      lookup, and Firestore writes.
    - Commit/PR: checkpoint `0d22a0d`.
  - [x] Migrate the Company Settings Personal Profile tab as the first
    compatibility slice.
    - Complete when: name load/edit/save, read-only email, recruiting-link
      generation/copy, loading/success/error behavior, field relationships,
      keyboard order, desktop/mobile layout, axe, existing data contracts, and
      final diff are verified without changing Firebase behavior.
    - Completed: 2026-07-23.
    - Files: `src/features/settings/components/PersonalProfileTab.jsx`,
      `src/features/settings/components/PersonalProfileTab.test.jsx`,
      `src/features/settings/components/CompanySettings.jsx`,
      `src/design-system/components/form/**`,
      `src/design-system/components/index.js`,
      `src/design-system/components/README.md`,
      `src/design-system/README.md`,
      `e2e/company-settings-profile.spec.cjs`, this roadmap.
    - Verification: 2 focused files / 9 tests passed; full frontend coverage
      passed with 82 files / 527 tests and the existing 2 files / 48
      emulator-dependent rules tests skipped; lint passed with 0 errors and
      169 existing frontend warnings; backend lint, typecheck, production
      build, and `git diff --check` passed. Chromium and Mobile Chrome
      regression passed 5 checks with 3 intentional viewport-specific skips.
    - Visual/mobile/a11y: manually reviewed at 1440×900, 1024×768, and 412×915.
      Labels and fields align, controls are 44 px high, read-only email is
      distinct and described, focus is visible, text wraps, mobile is
      single-column, and document/workspace horizontal overflow is absent.
      Unit axe reported no violations; scoped real-browser axe reported no
      serious or critical violations in the migrated content.
    - Notes: the original user-document read, generated recruiting-code
      payloads, recruiter-link mapping, name-only `{ name }` write, clipboard
      URL, success/error messages, routes, and admin gate are unchanged. The
      only shell-adjacent change is `min-w-0` on the existing settings content
      flex item to remove verified 1024 px nested overflow. No backend,
      Firebase rules, storage, database, permissions, or data-format changes.
      The legacy 10 px settings navigation headings identified by this slice
      were subsequently migrated in the bounded shell checkpoint `334b5c6`.
    - Commit/PR: checkpoint `0d22a0d`.
  - [x] Migrate the Company Settings shell and grouped navigation presentation.
    - Complete when: group headings use supported typography and semantic
      tokens; navigation/current-item semantics, keyboard focus movement,
      visible focus, tab switching, feature-flag visibility, admin redirect,
      desktop/tablet/mobile layouts, overflow, axe, and final diff are verified
      without changing settings state or behavior.
    - Completed: 2026-07-23.
    - Files: `src/design-system/components/section-navigation/**`,
      `src/design-system/components/index.js`,
      `src/design-system/components/README.md`,
      `src/design-system/README.md`,
      `src/features/settings/components/CompanySettings.jsx`,
      `src/features/settings/components/CompanySettings.test.jsx`,
      `src/features/settings/components/CompanyProfileTab.jsx`,
      `e2e/company-settings-navigation.spec.cjs`,
      `e2e/company-settings-profile.spec.cjs`, this roadmap.
    - Verification: 2 shell-focused unit files / 9 tests passed; final
      design-system gate passed with 11 files / 46 tests; final full frontend
      gate passed with 84 files / 536 tests and the existing 2 files / 48
      emulator-dependent rules tests skipped; frontend lint passed with 0
      errors and 169 existing warnings; typecheck, production build, and
      `git diff --check` passed. Combined settings Chromium/Mobile Chrome
      regression passed 10 checks with 6 intentional viewport-specific skips;
      the shell/navigation spec contributed 5 passes and 3 skips.
    - Visual/mobile/a11y: manually reviewed at 1440×900, 1024×768, and
      412×915. Desktop retains the side navigation; tablet uses a four-group
      grid above content; mobile uses a two-column grid. Group headings are
      12 px, targets are at least 44 px, long labels wrap, the current section
      is visually and semantically identified, focus remains visible and is
      retained through selection, and document/workspace/nested horizontal
      overflow is absent. Unit axe reported no violations; scoped real-browser
      axe reported no serious or critical violations.
    - Notes: `SectionNavigation` is business-neutral and owns only generic
      grouped navigation appearance, current-item semantics, responsive
      presentation, disabled state, and Arrow/Home/End focus movement.
      Company Settings still owns labels, feature-flag visibility, the existing
      `activeTab` state, tab content, admin gate, Manage Team behavior, and
      success feedback. The Company Profile tab strip now stacks on mobile only
      to remove its verified nested scroller; its tab identifiers and content
      switching are unchanged. No routes, data loading, uploads, saves,
      permissions, Firebase code, backend code, rules, or data formats changed.
    - Commit/PR: checkpoint `334b5c6`.
  - Notes: Company Profile, Team & Users, Email, SMS/number assignment,
    Automated SMS, Integrations, Billing, question configuration, and
    `/company/profile` remain separate slices and must not be migrated together.

- [ ] Campaigns.
  - Complete when: campaign cards/editor/results/report dialogs migrate without
    changing targeting, sending, reporting, or status behavior.

- [ ] E-docs, driver dossier, and verification workflows.
  - Complete when: dialogs/tables/forms/states migrate and document generation,
    employment verification, uploads, previews, and audit behavior pass.

- [ ] Public application and change-review portals.
  - Complete when: field/progress/state primitives migrate stepwise with draft,
    submission, validation, upload, offline, consent, and mobile behavior
    preserved.

- [ ] Signing and envelope creation.
  - Complete when: specialized document-first behavior, coordinates, zoom,
    gestures, signatures, and send/sign workflows pass all existing and added
    desktop/mobile tests. This is high risk and must not be an early pilot.

- [ ] Super Admin.
  - Complete when: tables, cards, controls, modals, integrations, analytics,
    and system states migrate without changing elevated permissions or
    maintenance actions.

- [ ] Auth, sandbox, and remaining edge screens.
  - Complete when: visual primitives migrate and login/redirect/test-only
    behavior remains unchanged.

### Phase 14 — cleanup and durable documentation

- [ ] Publish `docs/SAFEHAUL_UI_DESIGN_STANDARD.md`.
  - Complete when: foundations, components, patterns, content, accessibility,
    responsive, tables, exceptions, contribution workflow, and catalog links
    reflect implemented reality and have owner approval.

- [ ] Remove legacy styles and compatibility wrappers.
  - Complete when: repository searches show no consumers, visual and functional
    suites pass, migration notes identify replacements, and the deletion diff
    is reviewed separately.

- [ ] Close the initiative.
  - Complete when: every roadmap item is complete or an owner-approved,
    separately tracked exception; all active screens use approved primitives;
    guardrails are blocking; the catalog and visual baselines are current; and
    a final repository-wide audit confirms no competing design system remains.

---

## 5. Migration inventory

### 5.1 Active route and feature-screen inventory

Status `Not started` means audited but not migrated.

| Screen / area | Current implementation | Target component or pattern | Priority | Risk | Dependencies | Status | Verification needed |
|---|---|---|---|---|---|---|---|
| Login `/login` | `features/auth/components/LoginScreen.jsx`; local inputs/buttons/card/branding | Field, Button, Card, AuthLayout, PageState | Medium | Medium | Tokens, controls, forms, cards | Not started | Auth/redirect tests, keyboard, autofill, error, desktop/mobile visual |
| Company workspace shell | `company-admin/layout/*`; feature-owned sidebar/topbar consuming WorkspaceFrame and approved controls | Layout primitives consumed by feature-owned shell | High | Medium | Tokens, controls, layouts | Completed 2026-07-23 | Verified: routes, roles, flags, persisted desktop collapse, overflow, keyboard/focus, 1440/1024/412 px, Mobile Chrome, scoped axe |
| Company dashboard | `CompanyAdminDashboard`, MetricCard compatibility adapter, DataTable leaderboard | PageHeader, Card, Metric, DataTable, Dialog, PageState | High | Medium | Controls, cards, table, dialog | Completed 2026-07-23 | Verified: dashboard/onboarding tests, stats/actions, leaderboard loading/empty/error/retry, import/lead routes, numeric alignment, desktop/mobile, scoped axe; Dialog/PageState family migration remains a separate shared phase |
| Applications / company leads / my leads | `CompanyCandidatesListPage` now consumes the approved DataTable; feature owns toolbar, filters, actions, and status mapping | Approved DataTable pilot, toolbar, filters, page states | Critical | High | Table spec/primitives, controls, badge | Completed 2026-07-23 | Verified: measured alignment, keyboard row/selection, filters/sorting, pagination contract, bulk actions, calls, dossier, desktop/mobile, scoped axe |
| Campaigns | `CompanyCampaignsPage`, `CampaignsDashboard`, local cards/results/report modal | PageHeader, Card, DataTable, Dialog, Badge, PageState | Medium | High | Controls, cards, table, dialog, status | Not started | Campaign unit tests, targeting/send/report behavior, mobile |
| E-Docs | `DocumentsManager`, `EnvelopeCreator`, `EnvelopeHistory` | Page structure, controls, DataTable, Dialog, PageState | High | High | Controls, forms, table, dialog | Not started | Template/send/history tests, PDF workflow, desktop/mobile |
| Import leads | `ImportLeadsPage`, `CompanyBulkUpload`, `BulkUploadLayout` | Upload pattern, DataTable preview, Dialog, PageState | Medium | High | Forms, table, dialog, feedback | Not started | Parse/mapping/upload/error/progress behavior, large files, mobile |
| Quick add lead | `QuickAddLeadPage`, `QuickLeadModal` | Form layout, Field controls, Button, Dialog | Medium | Medium | Controls, forms, dialog | Not started | Validation, save, duplicate/error behavior, keyboard/mobile |
| User profile | `UserProfilePage`; dense local forms/actions | PageHeader, Card, Field, Button, InlineAlert | Medium | High | Forms, controls, cards, feedback | Not started | Profile/security actions, upload, validation, mobile |
| Company settings | `CompanySettings` tabs and settings components | Tabs, PageHeader, Field family, Table, Dialog, PageState | High | High | Controls, forms, table, dialog, status | Not started | All save/integration/number/team/question tests and mobile |
| Super Admin `/super-admin/*` | feature-local view router, tables, forms, modals, analytics | Feature-owned router using layout/card/table/dialog/form system | High | High | All core families | Not started | Permissions, maintenance actions, integrations, analytics, desktop/mobile |
| Public application `/apply/:slug` | `PublicApplyHandler`, shared feature-coupled `Stepper`, step forms | Feature-owned wizard using Progress, Field, Button, Card, PageState | Critical | Very high | Forms, feedback, layout, compatibility plan | Not started | Draft/offline/upload/validation/submission/consent, full mobile E2E |
| Signing room `/sign/...` | specialized PDF/document-first workflow | Approved controls/states around feature-owned document canvas | Medium | Very high | Controls, dialog, feedback; signing QA | Not started | Existing signing unit/E2E, coordinates, zoom/touch/signature, mobile |
| Verification portal `/verify/:token` | feature-local cards/radios/status screens | Card, Field/Radio, Button, PageState | Medium | High | Forms, cards, feedback | Not started | Token states, submit, errors, keyboard/mobile |
| Change review `/review-change/:token` | local form/card/actions with direct data logic | Card, Field, Button, PageState | Medium | High | Forms, cards, feedback | Not started | Approve/reject/error/expired states, keyboard/mobile |
| Sandbox application | production-like application plus test controls | Production primitives with feature-owned sandbox controls | Low | Medium | Public-application migration | Not started | E2E fixtures, no production leakage, mobile |
| Sandbox transfer success | `SandboxTransferSuccess` local status screen | PageState, Card, Button | Low | Low | Feedback, controls | Not started | Redirect/action and desktop/mobile visual |
| Driver dossier modal | feature-local shell/tabs/application/documents | Dialog family, Tabs, Card, Field display, PageState | High | High | Dialog, controls, feedback, layout | Not started | Focus, tabs, edits/uploads/actions, large content, mobile |
| PEV/VOE workflows | local modals/tabs/forms/previews | Dialog, Field, Button, Status, document layout | High | Very high | Dialog, forms, status | Not started | Lookup/request/save/send/preview/audit, keyboard/mobile |

### 5.2 Shared component-family inventory

| Family | Current implementation | Target | Priority | Risk | Dependencies | Status | Verification needed |
|---|---|---|---|---|---|---|---|
| Tokens | `shared/styles/designTokens.css`, direct Tailwind utilities | `design-system/tokens` semantic contract + temporary compatibility | Critical | Medium | Owner visual approval | Foundation complete; adoption not started | Contrast, build, desktop/mobile consumer visuals, legacy parity |
| Buttons | Button/IconButton primitives adopted by the Company shell; legacy raw buttons remain elsewhere | Button + IconButton | Critical | Medium | Tokens | In progress — primitive and Company consumer verified; catalog/ratchet remain | Variants/states, names, focus, touch, remaining consumers, approved visual baselines |
| Inputs | Shared InputField plus 155 raw inputs | Field/Input and compatibility adapter | Critical | High | Tokens, controls | Not started | Existing callbacks/files/errors/autofill/mobile keyboard |
| Select/textarea | 60 selects, 23 textareas, local styling | Select/Textarea under Field | High | Medium | Forms | Not started | Labels/errors/disabled/long content/mobile |
| Radio/checkbox | Shared/local radio and icon-based selection | Native-first Radio/Checkbox groups | High | High | Forms, table | Not started | Keyboard model, group naming, indeterminate selection |
| Cards | Card/MetricCard primitives adopted by Company dashboard; compatibility StatCard retained | Card/Section/Metric | High | Low | Tokens, layouts | In progress — Company dashboard verified; catalog and remaining consumers open | Spacing/elevation/heading/actions/mobile/approved visual baselines |
| Dialogs | Accessible shared Modal plus local overlays | Dialog/AlertDialog family | Critical | High | Controls, layouts | Not started | Focus/inert/scroll/Escape/return/naming/mobile |
| Status badges | Generic Badge adopted by Company leaderboard; StatusBadge/statusStyles/local maps remain | Generic Badge/StatusIndicator + feature adapters | High | Medium | Tokens | In progress — generic Badge verified; StatusIndicator and remaining adapters open | Vocabulary, contrast, icons, non-color communication |
| Loading | SafeHaulLoader, GlobalLoadingState, skeletons, local spinners | Spinner/Skeleton/LoadingState | Medium | Medium | Tokens, feedback | Not started | Live regions, reduced motion, async transition visuals |
| Empty/error | Error boundaries and many table-local messages | EmptyState/ErrorState/InlineAlert/PageState | High | Medium | Controls, cards | Not started | Recovery actions, announcements, long text, mobile |
| Toast/notification | ToastProvider and notification components | Retain behavior; normalize visuals through tokens/components | Medium | High | Feedback, controls | Not started | Timers, focus, announcements, stacking, mobile |
| Layout | WorkspaceFrame and page primitives adopted by the feature-owned Company shell/dashboard; remaining shells and Stepper unchanged | Business-neutral layouts/progress; feature owns orchestration | High | Very high | Controls, forms, feedback | In progress — Company shell/dashboard completed 2026-07-23 | Remaining route/workflow parity, Super Admin shell, public Stepper, scroll, focus, mobile |
| Icons | Lucide + branded SVGs + icon-only buttons | Icon contract and accessible IconButton | Medium | Medium | Controls | Not started | Sizes/strokes/names, branded exceptions |

### 5.3 Raw table migration inventory

All table migrations depend on the Phase 7 table schema and primitives. No row
may be marked complete until header-to-cell alignment is visually reviewed with
short, long, empty, loading, error, and representative numeric/date data.

| Current table | Target | Priority | Risk | Additional dependencies | Status | Verification needed |
|---|---|---|---|---|---|---|
| `shared/components/table/ModernDriverTable.jsx` | DataTable pilot/compatibility wrapper | Critical | High | Selection, pagination, Badge | In progress — Company candidate consumer migrated; Super Admin consumer remains | Verify remaining Super Admin behavior before adapting or removing the compatibility component |
| `campaigns/components/CampaignResultsTable.jsx` | Compact DataTable | High | Medium | Status adapter | Not started | Remove 10px text, contact/status/time alignment, loading |
| `campaigns/components/DetailedReportModal.jsx` | DataTable inside Dialog | Medium | High | Dialog, status | Not started | Dialog focus + table overflow, long message truncation |
| `company-admin/components/InlineLeaderboard.jsx` | Numeric compact DataTable | High | Medium | Metric formatting | Completed 2026-07-23 | Verified: representative/empty/error/retry unit states, header/cell end alignment under 1 px, compact density, long names, labeled mobile overflow, desktop/mobile axe |
| `settings/number-assignment/AssignmentTable.jsx` | DataTable with form controls | High | High | Select/Checkbox | Not started | Header/cell alignment, control labels, save states, mobile |
| `settings/questions/StandardQuestionsConfig.jsx` | Settings DataTable | Medium | High | Checkbox/Switch | Not started | Keyboard toggles, labels, sticky/overflow, mobile |
| `signing/components/EnvelopeHistory.jsx` | DataTable | Medium | High | Status, IconButton | Not started | Document actions, dates, empty state, mobile |
| `super-admin/components/CompaniesView.jsx` | DataTable | High | High | Badge, actions | Not started | Loading/error/empty, sticky header, permissions, long names |
| `super-admin/components/FeaturesView.jsx` | DataTable/matrix | High | Very high | Switch/Checkbox, responsive matrix | Not started | Sticky first column, header/cell alignment, keyboard, overflow |
| `super-admin/integrations/LineManager.jsx` | DataTable | Medium | High | Badge, actions | Not started | Phone/label/status/default/action alignment, keyboard |
| `super-admin/modals/ViewCompanyAppsModal.jsx` | DataTable inside Dialog | Medium | High | Dialog, status | Not started | Focus, overflow, status/date alignment, mobile |
| `super-admin/components/StatsBackfillPanel.jsx` | Compact numeric DataTable | Medium | High | Feedback/progress | Not started | Numeric alignment, maintenance actions, error states |
| `super-admin/components/UsersView.jsx` | DataTable | High | High | Badge/actions | Not started | Roles/actions, loading/error/empty, long email, mobile |
| `super-admin/views/AnalyticsView.jsx` | Analytics DataTables | High | High | Charts/number/date format | Not started | Numeric and date alignment, periods, empty states, mobile |
| `shared/components/admin/BulkUploadLayout.jsx` | Preview DataTable pattern | Medium | High | Upload/feedback | Not started | Large data, truncation, headers, errors, performance |

### 5.4 Company settings/profile form migration inventory

This inventory records the 2026-07-23 bounded audit. Counts describe raw native
controls in the named presentation files; nested components are listed in their
own rows. Data and workflow ownership stays in the feature.

| Screen / slice | Current controls and presentation | Data / behavior coupling | Main risks | Priority / risk | Status | Verification needed |
|---|---|---|---|---|---|---|
| Company Settings shell | Approved `SectionNavigation`, semantic shell tokens, feature-owned grouped item definitions, existing local success toast and billing card | Admin role redirect, feature-flag visibility, tab state, Manage Team dialog remain feature-owned | Live success announcement remains for a later feedback slice | High / Medium | Shell/navigation compatibility slice completed 2026-07-23 | 9 focused unit tests, full suite, Chromium/Mobile Chrome, 1440/1024/412 px, keyboard/focus/current state, admin redirect, feature flag, axe, overflow passed |
| Company Profile — info | 9 text inputs and 9 visual labels in `CompanyInfoSection`; local edit/save controls | `saveCompanySettings`, nested contact/address/legal/application payload | Label associations, edit/read-only distinction, payload parity, long company/address values | High / High | Audited; not migrated | Load/edit/cancel/save, payload shape, validation, desktop/mobile |
| Company Profile — branding | File input and logo preview in `BrandingSection` | `uploadCompanyLogo`, upload progress/error, saved logo URL | File naming, keyboard upload, preview/alt text, file/type/size behavior | High / High | Audited; not migrated | Exact upload contract, progress/error, keyboard/mobile, preview |
| Company Profile — questions | Text/select/textarea previews, 4 native checkboxes, button-based required/hidden switches, question editors | Application configuration and custom-question state passed through Company Profile save | Switch semantics, required/hidden exclusivity, DOT-required protections, destructive actions | High / Very high | Audited; not migrated | All question tests, keyboard toggles, validation, save payload, mobile |
| Team & Users | 3 inputs, 1 role select, local buttons | Direct Firestore user/team reads and writes; Manage Team dialog | Permissions, required fields, role changes, duplicate/error states | High / Very high | Audited; not migrated | Role gates, add/manage flows, validation, dialog, desktop/mobile |
| Personal Profile in Company Settings | `FormField`, `Input`, `FormSection`, `Card`, and `Button` now replace local form/card/button styling | Direct user/recruiter-link Firestore reads/writes and clipboard copy remain feature-owned and unchanged | Broader settings forms remain locally styled | High / Low | First compatibility slice completed 2026-07-23 | 4 feature tests, 4 primitive tests, full suite, Chromium/Mobile Chrome, keyboard/focus, 1440/1024/412 px, axe passed |
| Email Settings | 4 inputs, 1 textarea, local test/save buttons | Firestore settings plus callable test/save behavior and retained secret handling | Secret/autofill handling, required validation, test/save distinction, long errors | High / Very high | Audited; not migrated | Existing email tests/contracts, secret preservation, validation, errors, mobile |
| SMS / number assignment | 2 selects in assignment rows/default line, raw table, verify/save/diagnostic controls | `useLineAssignments` owns Firestore/callable behavior and legacy token compatibility | Table/control alignment, redacted line tokens, verification states, accessible select labels | High / Very high | Audited; not migrated | Existing 15-case suite, save/backfill/verify, DataTable, keyboard/mobile |
| Automated SMS | 1 textarea and save button | Direct Firestore load/save of message template | Template preservation, loading/error state, textarea description/limits | Medium / High | Audited; not migrated | Exact text round-trip, save/error, keyboard/mobile |
| Integrations | Connection cards and buttons, including disabled states | Firebase callable/SDK connection workflows and feature availability | External SDK state, disabled explanation, destructive/reconnect behavior | Medium / Very high | Audited; not migrated | Integration mocks/contracts, permissions, loading/error, mobile |
| Billing | Informational card only | Plan value display | Empty/long plan content and support messaging | Low / Low | Audited; not migrated | Plan variants, mobile/heading review |
| `/company/profile` account profile/security | 8 inputs, 8 labels, avatar file input, 6 buttons, password/email forms | Firebase Auth profile/email/password, reauthentication, Storage upload, Firestore user writes/query | Keyboard-inaccessible avatar surface, nested click targets, validation/error association, security/autofill, upload and reauth regressions | High / Very high | Audited; defer until form/upload/dialog foundations are proven | Auth/storage mocks, validation branches, save/email/password/upload workflows, keyboard/autofill, desktop/mobile |

---

## 6. Verification matrix

Apply checks proportionally, but never claim an unrun check:

| Change type | Minimum required checks |
|---|---|
| Documentation only | Markdown/link review, diff inspection |
| Tokens/Tailwind | Token tests, contrast tests, build, lint, generated CSS/diff review; consumer visual/mobile review when used |
| Primitive component | Unit/interaction, axe, build, lint, desktop and mobile visual, keyboard |
| Table | Unit/interaction, axe, desktop/mobile Playwright, alignment screenshots, data extremes, feature behavior |
| Dialog/form | Unit/interaction, axe, keyboard/focus, desktop/mobile visual, feature save/cancel/error behavior |
| Feature migration | Existing feature tests, relevant backend contract tests if touched, desktop/mobile E2E, visual regression, axe |
| Rules/backend (normally out of scope) | Explicit approval, backend tests, rules emulator, contract tests, security review |

### Foundation-pass completion log

- Date: 2026-07-23
- Baseline: `9c56feb6463fb6e1a2291449ab982e865be9ce13`
- Focused design-system tests: 2 files passed, 14 tests passed.
- Full frontend unit tests: 71 files passed, 486 tests passed; 2 rule-test
  files / 48 emulator-dependent tests skipped by their existing environment
  guard. An initial resource-contended run timed out in one existing
  Playwright-config test before its assertion; that file then passed 4/4 alone
  and the complete suite passed when rerun serially.
- CI-equivalent frontend coverage gate: passed (`vitest run --coverage`).
- Frontend lint: passed with 0 errors and 178 pre-existing warnings.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed; Vite transformed 2,610 modules. Existing warnings
  remain for stale Browserslist data and chunks over 500 kB.
- Backend tests: not applicable; no backend file changed.
- Firebase rules tests: not applicable; no rules/data/backend file changed.
- Playwright desktop/mobile: not required for the non-rendering scaffold and
  unused token contract; the first consumer migration must run both.
- Visual review: generated token/Tailwind contract and CSS cascade review only;
  no feature consumes the new utilities, so rendered screens are unchanged by
  design.
- Accessibility: 11 normal-text contrast pairs plus minimum type-size contract
  passed; architecture boundary passed.
- Compiled CSS review: both the new `--ds-color-canvas` contract and the legacy
  `--bg-page` compatibility token are present.
- Diff review: `git diff --check` passed; changed-file and focused source diffs
  contained no unrelated application/backend changes.
- Commit/PR: checkpoint `d993804`.

### Company candidate-list/DataTable pilot completion log

- Date: 2026-07-23.
- Baseline: `9c56feb6463fb6e1a2291449ab982e865be9ce13`.
- Focused DataTable tests: 2 files passed, 15 tests passed.
- Full frontend coverage gate: 73 files passed, 2 files skipped; 501 tests
  passed and 48 emulator-dependent rules tests skipped by their existing
  environment guard. Coverage was 25.18% statements, 22.17% branches, 23.24%
  functions, and 25.72% lines.
- Frontend and backend lint: passed. Frontend reported 0 errors and 176
  existing warnings; backend lint reported no error.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed; Vite transformed 2,615 modules. Existing warnings
  remain for stale Browserslist data and chunks over 500 kB.
- Candidate Playwright, Chromium + Mobile Chrome: 8 passed, 2 intentionally
  skipped because each alignment/mobile-presentation assertion only applies to
  its matching viewport.
- Existing candidate search/filter Playwright, Chromium + Mobile Chrome:
  8 passed.
- Functional coverage: search, filters, latest sorting, scope, page-scoped
  selection, mixed selection, filter-reset selection, assignment count, call
  action isolation, keyboard dossier opening, and row dossier opening passed.
- Accessibility: native table semantics, caption/header scopes, named
  checkboxes and actions, Enter/Space row activation, nested-control isolation,
  focus visibility, dialog naming, and scoped real-browser axe checks passed;
  axe reported no serious or critical violations.
- Desktop visual review: representative headers and cells used the same
  contract attributes; measured center alignment variance was under 1 px.
  Column widths, comfortable 72 px rows, 48 px headers, spacing, selected state,
  and action reveal were reviewed.
- Mobile visual review: DataTable uses a labeled, keyboard-focusable horizontal
  scroll region, keeps actions visible, displays an overflow hint, and preserves
  dossier access. At 412 px the existing Company sidebar remains 255 px wide,
  leaving only 100 px for content; this pre-existing shell defect is explicitly
  assigned to the next migration phase and is not hidden inside the table.
- Loading, empty, and error states: component unit tests cover all three,
  including the stale-row inline-error case.
- Backend tests and Firebase rules tests: not applicable; no backend, rules,
  database, integration, or Firebase behavior changed.
- Diff review: final whitespace and changed-file review required no unrelated
  application/backend changes.
- Commit/PR: checkpoint `d993804`.

### Company workspace shell/dashboard completion log

- Date: 2026-07-23.
- Baseline: `9c56feb6463fb6e1a2291449ab982e865be9ce13`.
- Previous-phase audit: candidate DataTable contract and consumer were
  independently rechecked before this phase; 2 files / 15 focused tests and
  16 candidate/filter checks passed with 2 intentional viewport-specific
  skips. The roadmap's contract-test note was corrected from 6 to the actual
  7 tests; no completed checkbox required reversal.
- Focused component/feature tests: 10 files passed, 36 tests passed. The final
  closed-navigation accessibility hardening test passed 2/2 after the focused
  aggregate.
- Full frontend coverage gate: 80 files passed, 2 files skipped; 518 tests
  passed and 48 emulator-dependent rules tests skipped by their existing
  environment guard. Coverage was 25.06% statements, 22.98% branches, 24.01%
  functions, and 25.53% lines.
- Frontend and backend lint: passed. Frontend reported 0 errors and 169
  existing warnings; backend lint reported no error.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed; Vite transformed 2,631 modules. Existing warnings
  remain for stale Browserslist data and the main chunk over 500 kB.
- Shell/dashboard Playwright, Chromium + Mobile Chrome: 5 passed, 3
  intentionally skipped because desktop/laptop/mobile assertions run only at
  matching viewports.
- Combined Company regression, Chromium + Mobile Chrome: 23 passed, 5
  intentional viewport-specific skips across shell/dashboard, access control,
  candidate DataTable, and application search/filter specifications.
- Functional coverage: dashboard metric navigation, sidebar group/route
  visibility, persisted desktop collapse, import route, unauthorized redirect,
  onboarding rendering, leaderboard refresh/retry, and the prior candidate
  filtering/selection/dossier workflows passed.
- Accessibility: Button/IconButton, Badge, Card/MetricCard, WorkspaceFrame,
  page layout, DataTable, Sidebar, and leaderboard unit/axe checks passed;
  Mobile Chrome verified focus entry, trap, Escape, focus return, route close,
  explicit touch close, and inert/hidden closed navigation. Scoped
  real-browser axe found no serious or critical violations.
- Desktop/laptop/mobile visual review: reviewed at 1440×900, 1024×768, and
  412×915. Header/content alignment, metric spacing/reflow, leaderboard column
  widths/end alignment, compact row density, long-name truncation, date-control
  wrapping, contained horizontal overflow, mobile hint, and full-width mobile
  content passed review. Laptop document width remained 1024 px at a 1024 px
  viewport; leaderboard overflow stayed inside its labeled scroll region.
- Loading/empty/error: leaderboard unit tests cover representative, empty, and
  error/retry states; DataTable retains its standardized loading/empty/error
  contract.
- Backend tests and Firebase rules tests: not applicable; no backend, rules,
  database, integration, or Firebase behavior changed.
- Visual regression: no durable screenshot baseline was claimed because the
  catalog/baseline owner decision remains open; manual rendered review and
  deterministic geometry assertions were completed instead.
- Diff review: `git diff --check` passed; added UI source was checked for new
  arbitrary colors and 9px/10px/11px text; the design-system architecture test
  passed; no unrelated backend or Firebase files changed.
- Commit/PR: checkpoint `d993804`.

### Company Settings Personal Profile compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: prior verified design-system, DataTable, Company
  shell/dashboard, and leaderboard work was reviewed, cleaned, and committed
  separately as `d993804` (`feat: establish design system and migrate company
  workspace`) before this slice began.
- Audit: all active Company Settings tabs plus `/company/profile` were
  inventoried for native controls, uploads, labels/messages, presentation/data
  coupling, direct Firebase/Auth/Storage/callable access, tests, mobile, and
  accessibility risk. The inventory is in section 5.4.
- Selected slice: Company Settings Personal Profile; it has one editable name,
  one read-only email, recruiting-link generation/copy, and no upload,
  password, role, integration, or question workflow.
- Focused tests: 2 files passed, 9 tests passed (4 form primitive and 5 feature
  compatibility tests).
- Full frontend coverage gate: 82 files passed, 2 files skipped; 527 tests
  passed and 48 emulator-dependent rules tests skipped by their existing
  environment guard. Coverage was 25.61% statements, 23.61% branches, 24.53%
  functions, and 26.13% lines.
- Frontend and backend lint: passed. Frontend reported 0 errors and 169
  existing warnings, including the pre-existing Personal Profile effect
  dependency warning; backend lint reported no error.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed; Vite transformed 2,634 modules. Existing warnings
  remain for stale Browserslist data and chunks over 500 kB.
- Chromium and Mobile Chrome regression: 5 passed, 3 intentionally skipped
  because desktop/laptop/mobile assertions run only in their matching
  viewport project.
- Behavior: existing name load/edit/name-only write, generated recruiter-link
  mapping and user-code write, clipboard URL, read-only email, and success and
  error feedback passed focused tests. No new validation or business rule was
  introduced.
- Accessibility: labels, descriptions, read-only state, native keyboard order,
  44 px controls, visible focus, and FormSection landmarks passed. Unit axe
  reported no violations; scoped real-browser axe reported no serious or
  critical violations in the migrated content.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  passed for alignment, spacing, wrapping, read-only contrast, control density,
  single-column mobile layout, and document/workspace overflow. The initial
  1024 px review found nested settings overflow; `min-w-0` on the existing
  flex content slot fixed it and a regression assertion now covers both client
  and scroll width.
- Visual regression: no durable screenshot baseline was claimed because the
  catalog/baseline ownership decision remains open; deterministic Chromium and
  Mobile Chrome geometry plus manual rendered review were completed instead.
- Backend/Firebase rules tests: not applicable; no backend, rules, database,
  storage, callable, integration, or Firebase contract changed.
- Diff review: `git diff --check` passed; generated `coverage/`, `dist/`, and
  `test-results/` artifacts were removed; no unrelated source or backend file
  is present.
- Commit/PR: checkpoint `0d22a0d`.

### Company Settings shell/navigation compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: Personal Profile and the native-event form foundation
  were committed separately as `0d22a0d` before this slice began.
- Selected slice: only the Company Settings shell, grouped navigation, and the
  directly observed Company Profile mobile tab-strip overflow were changed.
- Component contract: added business-neutral `SectionNavigation` with labelled
  navigation/groups, current-item and content-region semantics, 44 px targets,
  semantic token styling, disabled state, visible focus, Arrow Up/Down,
  Home/End focus movement, and stack/grid responsive modes. Settings labels,
  feature flags, permissions, tab state, and content remain feature-owned.
- Focused tests: 2 shell-focused files passed, 9 tests passed. The broader
  focused settings regression including Personal Profile passed 3 files /
  14 tests.
- Design-system tests: 11 files passed, 46 tests passed.
- Full frontend gate: 84 files passed, 2 files skipped; 536 tests passed and 48
  emulator-dependent rules tests skipped by their existing environment guard.
- Frontend lint: passed with 0 errors and 169 existing warnings. No warning was
  added by this slice.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed; Vite transformed 2,637 modules. Existing stale
  Browserslist-data and chunk-size warnings remain.
- Chromium and Mobile Chrome regression: the combined navigation and Personal
  Profile run passed 10 checks with 6 intentional viewport-specific skips; the
  navigation spec contributed 5 passes and 3 skips.
- Behavior: active-tab identifiers and `setActiveTab` ownership, Company
  Profile/Team/Email/SMS/Automated SMS/Integrations/Billing/Personal content,
  `callTracking` visibility, company-admin redirect, routes, Manage Team,
  success feedback, data loading, saves, uploads, permissions, and Firebase
  behavior are unchanged.
- Desktop/laptop/mobile: manual rendered review passed at 1440×900, 1024×768,
  and 412×915. Desktop is side-by-side; tablet is a four-group navigation grid;
  mobile is a two-column grid. All eight items remain reachable, long labels
  wrap, selection remains obvious, focus is visible, touch targets are at least
  44 px, and no document, workspace, shell, or nested horizontal scroller
  remains.
- Accessibility: unit axe reported no violations; scoped Chromium/Mobile Chrome
  axe reported no serious or critical violations. `aria-current="page"`,
  `aria-controls`, labelled groups, native buttons, logical Tab order, and
  Arrow/Home/End focus movement were verified.
- Visual regression: no durable screenshot baseline was claimed because the
  catalog/baseline ownership decision remains open; manual screenshots and
  deterministic geometry assertions were completed instead.
- Backend/Firebase rules tests: not applicable; no backend, rules, database,
  storage, callable, integration, or Firebase contract changed.
- Diff review: `git diff --check` passed; generated `playwright-report/` and
  `test-results/` artifacts were removed; no unrelated source or backend file
  was included.
- Commit/PR: checkpoint `334b5c6`.

---

## 7. Decisions and blockers

- `[!]` Confirm WCAG 2.2 AA as the permanent standard.
- `[!]` Select component catalog and visual baseline hosting/review ownership.
- `[!]` Decide whether Inter remains externally hosted.
- `[!]` Approve semantic brand/action colors before declaring visible component
  families fully approved. Compatibility-first consumers preserve the current
  blue-led UI direction and SafeHaul navy/mint brand assets, but product/design
  review is still required.
- `[!]` Decide table responsive behavior per use case (horizontal scroll,
  priority columns, stacked cards, or specialized interactive grid). There is
  no safe universal conversion. The candidate-list decision was completed on
  2026-07-23: retain the dense native table and use labeled horizontal overflow
  at narrow widths so no field or action disappears. Other tables still require
  individual decisions.

These decisions do not block compatibility-first migrations that preserve the
current identity and record evidence. They do block declaring the affected
families fully approved, publishing durable visual baselines, or making the
related CI enforcement permanently blocking.

---

## 8. Safest next phase

The Company Settings shell/navigation compatibility slice completed on
2026-07-23. The safest next bounded slice is Company Profile information,
excluding branding upload and application-form questions.

Sequence:

1. audit and freeze the exact Company information load, edit, cancel, and save
   payload contract before changing presentation;
2. migrate only `CompanyInfoSection` labels, inputs, read-only presentation,
   validation messages, and edit/save/cancel controls to approved form, card,
   button, and layout primitives;
3. preserve `saveCompanySettings`, nested contact/address/legal/application
   payloads, existing field names, default values, and success/error behavior;
4. add focused payload-parity, edit/cancel, label/error, keyboard, axe, and
   responsive coverage;
5. verify at 1440×900, 1024×768, and 412×915 before marking the slice complete.

Do not combine Company Profile branding upload, application questions, team
roles, email secrets, phone assignment, integrations, or `/company/profile`
account security with this slice. Those remain independent high-risk items
with their own behavior-preservation evidence.
