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
    `Textarea`, `Select`, `FieldDisplay`, and `FormSection` contract is
    implemented and proven by the Company Settings Personal Profile and
    Company Profile information compatibility slices. Checkbox, Radio, Switch,
    file input, autofill policy, component-catalog examples, and durable visual
    baselines remain open, so the family is not complete.
  - [x] Establish the native-event form foundation required by the first
    compatibility slice.
    - Completed: 2026-07-23.
    - Files: `src/design-system/components/form/**`,
      `src/design-system/components/index.js`,
      `src/design-system/components/README.md`,
      `src/design-system/README.md`.
    - Verification: 5 form primitive tests passed, including native events,
      label/description/error/required relationships, disabled/read-only
      behavior, Select/Textarea parity, labelled read-only display,
      FormSection semantics, and axe.
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
  - [x] Migrate Company Profile information as a bounded form compatibility
    slice.
    - Complete when: all nine existing values load and remain editable; the
      exact nested save payload, cancel behavior, permission gate, and
      success/error behavior are preserved; labels, keyboard order, focus,
      control sizing, desktop/mobile layout, overflow, axe, and final diff are
      verified without changing branding upload or application questions.
    - Completed: 2026-07-23.
    - Files: `src/design-system/components/form/**`,
      `src/design-system/components/index.js`,
      `src/features/settings/components/CompanyProfileTab.jsx`,
      `src/features/settings/components/CompanyProfileTab.test.jsx`,
      `src/features/settings/components/profile/CompanyInfoSection.jsx`,
      `e2e/company-settings-company-info.spec.cjs`, this roadmap.
    - Verification: 3 focused files / 17 tests passed; design-system gate
      passed with 11 files / 47 tests; full frontend gate passed with 85 files /
      544 tests and the existing 2 files / 48 emulator-dependent rules tests
      skipped; frontend lint passed with 0 errors and 169 existing warnings;
      typecheck, production build, and `git diff --check` passed. Combined
      settings Chromium/Mobile Chrome regression passed 15 checks with 9
      intentional viewport-specific skips; the Company information spec
      contributed 5 passes and 3 skips.
    - Visual/mobile/a11y: manually reviewed display and edit states at
      1440×900, 1024×768, and 412×915. All nine labels align with 44 px
      controls, the address becomes one column on mobile, long values wrap,
      actions remain at least 44 px, focus is visible and returns to Edit
      Profile after cancel/save, and document/content/nested horizontal
      overflow is absent. Unit axe reported no violations; scoped real-browser
      axe reported no serious or critical violations.
    - Notes: added the business-neutral `FieldDisplay` primitive and reused
      `Card`, `FormSection`, `FormField`, `Input`, and `Button`. Existing field
      keys, local state, defaults, admin edit gate, `saveCompanySettings`
      target, nested contact/address/legal/application payload, cancel
      behavior, and success/error messages are unchanged. Branding upload and
      application questions remain untouched. No backend, Firebase rules,
      storage, database, permissions, route, or data-format change was made.
    - Commit/PR: checkpoint `a0cefc3`.
  - [x] Migrate the Company Settings Billing informational card.
    - Complete when: the plan calculation, plan names, and support message are
      preserved exactly; heading, labelled plan value, plan-status treatment,
      and guidance move to approved card/typography/layout treatment; plan
      variants, missing-plan fallback, semantics, axe, and desktop/tablet/mobile
      layout are verified without adding upgrade/cancel/external actions or any
      Firebase behavior.
    - Completed: 2026-07-23.
    - Files: `src/features/settings/components/BillingTab.jsx`,
      `src/features/settings/components/BillingTab.test.jsx`,
      `src/features/settings/components/CompanySettings.jsx`,
      `e2e/company-settings-billing.spec.cjs`, this roadmap.
    - Verification: 7 focused BillingTab tests passed; the CompanySettings
      shell test (5) and design-system gate (11 files / 47 tests) still pass;
      full frontend gate passed with 85 files / 550 tests plus the existing 2
      files / 48 emulator-dependent rules tests skipped by their environment
      guard (the pre-existing `playwrightConfig` resource-contention flake timed
      out under load and then passed 4/4 in isolation); frontend lint passed
      with 0 errors on the changed files; typecheck, production build, and
      `git diff --check` passed. Combined Billing Chromium/Mobile Chrome
      regression passed 5 checks with 3 intentional viewport-specific skips.
    - Visual/mobile/a11y: manually reviewed at 1440×900, 1024×768, and 412×915.
      The heading is a 16 px `<h2>`, the plan label is 13 px, the plan badge and
      support message are 12 px, and no 9/10 px text was introduced. The plan is
      a labelled `FieldDisplay` whose value is a tone-carrying `Badge`
      (success for Pro, neutral for Free) so status is not communicated by
      color alone. No document, content, or nested horizontal overflow exists at
      any reviewed width. Unit axe reported no violations; scoped Chromium/Mobile
      Chrome axe reported no serious or critical violations.
    - Notes: the informational card added no interactive controls — the existing
      copy still directs users to contact support and there is no upgrade,
      cancel, or external billing action. The plan mapping
      (`planType === 'paid' ? 'Pro Plan' : 'Free Plan'`) and support copy are
      unchanged and remain feature-owned; the design system stays business
      neutral. The billing card was extracted into a feature-owned `BillingTab`
      to match the sibling tabs and enable focused tests; the previously inline
      local `SectionHeader` (used only by billing) was removed. No backend,
      Firebase rules, storage, database, permissions, route, or data-format
      change was made.
    - Commit/PR: checkpoint `a98954d`.
  - [x] Migrate the Company Settings Automated SMS templates form.
    - Complete when: the three-template Firestore read/write contract is frozen
      and preserved exactly; the three textareas, their labels, guidance, and the
      save action move to approved form/section/button primitives with
      programmatic label association, an announced loading state, an accessible
      saving state, and correct error/help semantics; template round-trip, empty
      fallbacks, save contract, save states, all three messages, missing-company
      behavior, keyboard order, axe, and desktop/tablet/mobile layout are verified.
    - Completed: 2026-07-23.
    - Files: `src/features/settings/components/AutomatedSmsTab.jsx`,
      `src/features/settings/components/AutomatedSmsTab.test.jsx`,
      `e2e/company-settings-automated-sms.spec.cjs`, this roadmap.
    - Firestore behavior preserved (frozen before migration): read
      `getDoc(doc(db, 'companies', companyId, 'settings', 'automated_sms'))`
      with an `snap.exists()` guard, `templateContactAttempt1/2/3` each falling
      back to `''`, and the `cancelled` unmount guard; write
      `setDoc(<same path>, { templateContactAttempt1, templateContactAttempt2,
      templateContactAttempt3, updatedAt: serverTimestamp() }, { merge: true })`.
      The load-error (`Could not load automated SMS templates.`), save-success
      (`Automated SMS templates saved.`), and save-error
      (`Failed to save templates.`) messages, the `{driver name}`/`{user name}`
      placeholders, the SMS-integration/duplicate-send guidance, the `saving`
      disable, the toast behavior, the `automated_sms` tab id, the admin gate,
      and routes are unchanged.
    - Verification: 12 focused AutomatedSmsTab tests passed (path, all-three-load,
      missing-doc and missing-field empty fallbacks, unique associated ids,
      independent editing, exact save path/payload/`serverTimestamp`/`{merge:true}`,
      save-disabled-while-saving with `aria-busy`, save-success, save-error,
      load-error, missing-`companyId` no-read/no-write, unmount guard, and axe);
      the CompanySettings shell test (5) and design-system gate (11 files /
      47 tests) still pass; full frontend gate passed with 87 files / 563 tests
      and the existing 2 files / 48 emulator-dependent rules tests skipped by
      their environment guard (no flaky failure this run); coverage gate
      completed; frontend lint passed with 0 errors on the changed files;
      typecheck, production build, and `git diff --check` passed. Chromium and
      Mobile Chrome Playwright passed 7 checks with 3 intentional
      viewport-specific skips, including loaded-form axe on both projects.
    - Visual/mobile/a11y: manually reviewed the loaded form at 1440×900,
      1024×768, and 412×915. Each of the three textareas is programmatically
      associated with its label (`.labels.length === 1`), is 112 px tall with
      14 px body text, and wraps long content; the heading is 16 px, the
      description and inline `{variable}` code and labels are 13 px, and the
      guidance help text is 12 px, so no 9/10 px text was introduced. The save
      button is the approved 44 px `Button`, communicates saving via `aria-busy`
      and disablement, and keyboard order runs template 1 → 2 → 3 → save. No
      document, content, or nested horizontal overflow exists at any width. The
      loading state is an announced `role="status"`. Unit axe reported no
      violations; scoped Chromium/Mobile Chrome axe reported no serious or
      critical violations.
    - Notes: template names, template state, Firestore reads/writes, placeholder
      meaning, SMS guidance, and all messages remain feature-owned; the design
      system gained no Firebase, SMS, template, or Company knowledge. The three
      fields were kept as three independent textareas (not merged or turned into
      a dynamic list). Documented behavior concern: when `companyId` is absent
      the existing guard performs no read and leaves the tab in its loading
      state; this pre-existing behavior was preserved unchanged, not altered by
      this visual slice. No backend, Firebase rules, storage, database,
      permissions, route, or data-format change was made.
    - Commit/PR: checkpoint `00fd311`.
  - [x] Migrate the Company Settings Email Settings form.
    - Complete when: the three callable contracts and every secret-handling rule
      are frozen and preserved exactly; the status banner, SMTP fields, password
      field, distinct Test/Save actions, signature, and setup-guide disclosure
      move to approved primitives with associated labels, a connected password
      helper, announced states, and status/alert semantics; metadata load, secret
      isolation, existing-password behavior, first-time requirement, test-vs-save
      payloads, all messages, and desktop/tablet/mobile layout are verified with
      no backend or Cloud Function change.
    - Completed: 2026-07-23.
    - Files: `src/features/settings/components/EmailSettingsTab.jsx`,
      `src/features/settings/components/EmailSettingsTab.test.jsx`,
      `e2e/company-settings-email.spec.cjs`, this roadmap.
    - Secret-handling contract preserved (frozen before migration): the saved
      SMTP password is never loaded into state (`emailSettings` has no
      `smtpPass`); `smtpPassInput` starts empty and is never hydrated;
      `getEmailSettingsMeta` returns only sanitized fields plus a `hasPassword`
      flag; an empty password field never overwrites the stored secret; the
      manual-save payload includes `smtpPass` only when the user types a new
      value; the password is required for first-time setup and optional once
      saved; Test Connection requires a freshly entered plaintext password; and
      the saved-password placeholder/helpers never imply the secret can be
      retrieved. No real secret appears in code, tests, or evidence — tests use
      the obviously-artificial value `NOT_A_REAL_PASSWORD_test_value`.
    - Callable contracts preserved: `getEmailSettingsMeta({ companyId })` →
      `{ smtpHost, smtpPort, smtpUser, signature, isVerified, hasPassword }`
      (never `smtpPass`); `testEmailConnection({ smtpHost, smtpPort, smtpUser,
      smtpPass })`; on test success an auto-save via `saveEmailSettings({
      companyId, smtpHost, smtpPort, smtpUser, smtpPass, signature })`; and the
      manual `saveEmailSettings` payload `{ companyId, smtpHost, smtpPort,
      smtpUser, signature }` plus `smtpPass` only when newly entered. Test and
      Save remain separate actions. Verified-state invalidation on host/port/
      user/password edits (and not on signature edits), the port `parseInt`
      conversion, the graceful metadata-load failure (`console.warn`, no toast),
      and the missing-`companyId` early return (settings load ends, form renders)
      are unchanged. Load/test/save success and error messages are unchanged.
    - Verification: 24 focused EmailSettingsTab render tests passed (metadata
      load incl. exact callable + `{ companyId }` request, sanitized hydration,
      empty password input, hasPassword true/false, load failure, missing
      company id; manual save incl. host/username/first-time-password gating,
      existing-password save without `smtpPass`, rotation save with `smtpPass`,
      exact payload, success/error, aria-busy disabled state; test connection
      incl. disabled-until-password, exact test payload, success auto-save
      payload with the new password, failure response, thrown exception,
      auto-save failure, verified + saved-password indicator updates;
      presentation incl. distinct action names, guide disclosure + safe external
      links, password-helper association, axe). The 12 existing email logic
      tests, the CompanySettings shell test (5), and the design-system gate
      (11 files / 47 tests) still pass. Full frontend gate passed with 88 files /
      587 tests and the existing 2 files / 48 emulator-dependent rules tests
      skipped by their environment guard; coverage gate completed; frontend lint
      passed with 0 errors on the changed files; typecheck, production build, and
      `git diff --check` passed. Chromium and Mobile Chrome Playwright passed 7
      checks with 3 intentional viewport-specific skips, including loaded-form
      axe on both projects and an accessible-loading-status assertion.
    - Visual/mobile/a11y: reviewed the loaded form at 1440×900, 1024×768, and
      412×915. Five labelled controls are 44 px tall; the tab heading is 20 px,
      section headings 16 px, labels/banner 13 px, and help/badge text 12 px, so
      no 9/10 px text was introduced. Every SMTP field has an associated label,
      the password helper is connected via `aria-describedby`, Test and Save have
      distinct accessible names with `aria-busy` progress, the connection status
      and test result use Badge tone plus text (not color alone) with
      `role="status"`/`role="alert"`, the setup-guide toggle exposes
      `aria-expanded`/`aria-controls`, external guide links keep
      `rel="noopener noreferrer"`, keyboard order runs host → port → user →
      password, and no document, content, or nested horizontal overflow exists.
      Unit axe reported no violations; scoped Chromium/Mobile Chrome axe reported
      no serious or critical violations.
    - Notes: the three handlers (`loadSettings`, `handleTestConnection`,
      `handleSaveEmailSettings`) are byte-for-byte unchanged; only presentation
      changed (the `disabled` conditions moved `testing`/`loading` into the
      Button `loading` prop, which is behavior-equivalent). Provider SMTP
      instructions remain feature-owned; the design system gained no SMTP,
      email-provider, secret, Firebase, or Company knowledge. Minor presentation
      changes: the Test button adopts the approved secondary variant (was
      purple) and both action buttons keep a stable label with a spinner instead
      of swapping to "Testing Connection…" micro-copy. The literal `**E-Docs**`/
      `**PEV**` banner text was preserved as-is (a pre-existing content quirk not
      corrected here). No backend, Cloud Function, Firebase rules, storage,
      database, permissions, route, or data-format change was made.
    - Commit/PR: checkpoint `9c05f9e`.
  - [x] Migrate the `/company/profile` account profile & security screen
    (`UserProfilePage`).
    - Complete when: the initial data preference/fallback, avatar type/size
      validation and exact Storage upload sequence, profile validation and
      username query (including the permission-denied skip), the email
      reauthentication/update sequence with all mapped errors and cancel/reset,
      and the password validation/reauthentication/update/reset are preserved;
      the avatar upload becomes keyboard-accessible with no nested interactive
      elements; passwords are never exposed; correct autocomplete is applied;
      labels, focus, control sizing, desktop/tablet/mobile layout, overflow,
      axe, and final diff are verified without any backend or rules change.
    - Completed: 2026-07-24.
    - Files: `src/features/company-admin/views/UserProfilePage.jsx`,
      `src/features/company-admin/views/UserProfilePage.test.jsx`,
      `src/features/company-admin/components/profile/ProfileAvatarField.jsx`,
      `src/features/company-admin/components/profile/ProfileAvatarField.test.jsx`,
      `e2e/company-profile-security.spec.cjs`, this roadmap.
    - Verification: 2 focused files / 38 tests passed; full frontend coverage
      gate passed with 98 files / 730 tests and the existing 2 files / 48
      emulator-dependent rules tests skipped; frontend lint passed with 0 errors
      and 166 existing warnings; typecheck, production build, and
      `git diff --check` passed. `company-profile-security.spec.cjs` passed 9
      Chromium/Mobile Chrome checks with 3 intentional viewport-specific skips.
      Backend/callable/rules checks were not run and are not applicable: this
      diff changes no Cloud Function, callable, or rule (`functions/node_modules`
      is not installed here, so backend lint was not run — recorded honestly).
    - Visual/mobile/a11y: manually reviewed at 1440×900, 1024×768, and 412×915
      plus the desktop email-edit state. No document-level horizontal overflow at
      any width; single-column mobile; 44 px controls; visible focus; labelled
      fields; a single keyboard-accessible avatar trigger with a visually hidden
      labelled input and a `role="status"` upload announcement. Unit axe reported
      no violations; scoped real-browser axe reported no serious or critical
      violations. Full GO completion log is in section 6.
    - Notes: the avatar handler, profile/email/password handlers, Storage path,
      Auth calls, Firestore writes, and all toast messages are behavior-identical;
      only presentation and accessibility changed. Username uniqueness remains
      not server-enforced. Passwords stay in transient state only. No backend,
      Cloud Function, Firebase rules, storage, database, permissions, route, or
      data-format change was made.
    - Commit/PR: feature + docs commits on
      `claude/company-profile-security-migration-mjdbm1`; PR into `main`.
  - [x] Migrate the Company Profile Application Form Questions interface.
    - Complete when: standard-field required/hidden exclusivity, all standard
      ids/labels/defaults, the exact `applicationConfig`/`customQuestions` save
      payload, custom-question UUID creation and `INITIAL_QUESTION_STATE`
      defaults, all question types, option add/remove/edit, type-change option
      initialization, preview/edit mode, ordering (mouse drag + a new
      keyboard method with the same array format), DOT deletion protection and
      the exact alert, and the inverse compliance-field mappings are preserved;
      every editor field has an associated label; standard toggles have unique
      accessible names with programmatic (non-color) state; desktop/tablet/mobile
      layout, overflow, axe, and final diff are verified without any backend,
      rules, or public-application-schema change.
    - Completed: 2026-07-24.
    - Files: `src/features/settings/components/questions/StandardQuestionsConfig.jsx`,
      `src/features/settings/components/questions/CustomQuestionsBuilder.jsx`,
      `src/features/settings/components/questions/QuestionEditor.jsx`,
      `src/features/settings/components/questions/ToggleSwitch.jsx`,
      `src/features/settings/components/profile/OperationalSettingsSection.jsx`,
      plus co-located tests and `e2e/company-settings-questions.spec.cjs`,
      this roadmap.
    - Verification: 5 focused files / 47 tests passed (4 new question files / 35
      tests + the unchanged CompanyProfileTab 12); full frontend coverage gate
      passed with 102 files / 766 tests and the existing 2 files / 48
      emulator-dependent rules tests skipped; public-application regression
      (`Step3_License`, `PublicApplyHandler`) passed; frontend lint 0 errors
      (163 existing warnings); typecheck, production build, and
      `git diff --check` passed. `company-settings-questions.spec.cjs` passed 9
      Chromium/Mobile Chrome checks with 3 intentional viewport-specific skips.
      Backend/callable/rules checks are not applicable — no Cloud Function,
      callable, or rule changed (`functions/node_modules` absent, so backend
      lint/`publicProfileDto` Jest were not run — recorded honestly; the
      frontend-side public consumers are covered).
    - Visual/mobile/a11y: reviewed at 1440×900, 1024×768, and 412×915 (standard
      config + a custom question with the options editor). No document-level
      horizontal overflow; standard rows stack with inline Required/Hidden
      captions on mobile; toggles are ARIA switches with `aria-checked`; reorder
      and delete are named IconButtons; every editor field is labelled. Unit axe
      clean; scoped real-browser axe found no serious or critical violations.
    - Notes: the `applicationConfig` `{[fieldId]:{required,hidden}}` shape, the
      `customQuestions` item fields (`id/key/type/label/options/required/
      dotRequired/helpText/min/max`), the `crypto.randomUUID()` id creation, the
      exact DOT-delete `alert()` text, and the inverse Lock/Protect mappings are
      unchanged; only presentation and accessibility changed. A keyboard
      move-up/down reorder was added alongside the preserved native drag; both
      mutate the same array order, so the saved format is identical. Because the
      design system still has no approved Switch/Checkbox primitive, the
      accessible `ToggleSwitch` and the native compliance checkboxes are
      documented feature-level compositions (see the Radio/checkbox item).
      Pre-existing latent behavior left unchanged and noted: the public
      `publicProfileDto` allowlist strips `addressHistory`/`employmentHistory`/
      `referralSource`/`mvrConsent` config so those toggles do not currently take
      effect publicly — a separate backend concern, not this UI slice.
    - Commit/PR: feature + docs commits on
      `claude/company-profile-security-migration-mjdbm1`; PR into `main`.
  - Notes: Company Profile branding, Team & Users, and the account-security and
    application-questions screens are migrated (GO). SMS/number assignment and
    Integrations remain separate NO-GO slices and must not be migrated together
    with anything else.

- [~] In progress — Campaigns.
  - Complete when: campaign cards/editor/results/report dialogs migrate without
    changing targeting, sending, reporting, or status behavior.
  - [x] Migrate the campaign list card (`CampaignCard`) and its status/menu
    presentation.
    - Complete when: the card consumes approved primitives; status is a
      feature-mapped Badge tone/label; the options menu is an accessible popover
      with the exact Cancel-vs-Delete conditions; progress/leads/failed/method/
      date/View Report/Details are preserved; desktop/tablet/mobile layout,
      overflow, keyboard, and scoped axe pass without touching listeners,
      callables, permissions, or data shapes.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/CampaignCard.jsx`,
      `src/features/campaigns/components/CampaignCard.test.jsx`,
      `e2e/campaign-card.spec.cjs`, this roadmap.
    - Verification: 22 focused card tests passed; full frontend coverage gate
      passed with 102 files / 780 tests and the existing 2 files / 48
      emulator-dependent rules tests skipped; frontend lint 0 errors (163
      existing warnings); typecheck, production build, and `git diff --check`
      passed. `campaign-card.spec.cjs` passed 9 Chromium/Mobile Chrome checks
      with 3 intentional viewport-specific skips.
    - Visual/mobile/a11y: reviewed at 1440×900 and 412×915 (tablet overflow
      checked in E2E). No document-level horizontal overflow; the options menu
      is an accessible popover (`aria-haspopup`/`aria-expanded`, `role="menu"`/
      `menuitem`, Escape-to-close, click-outside preserved); the card opens from
      a keyboard-focusable Details button as well as the mouse whole-card click.
      Card-scoped real-browser axe found no serious or critical violations.
    - Notes: `CampaignCard` is presentation-only — the `CampaignsDashboard` keeps
      both Firestore listeners (`campaign_drafts`, `bulk_sessions`), the
      `cancelBulkSession` callable, the `window.confirm` messages, and the
      draft/session delete logic unchanged. Status tones preserve the prior
      appearance (active=success, completed=info, scheduled=warning, everything
      else neutral); `isCancellableSessionStatus` still decides Cancel vs Delete.
      No approved DS menu primitive exists, so the popover is a documented
      feature-level composition. 10 px card text was replaced with the supported
      `--ds-*` xs size. The dashboard shell (header, stat cards, tabs) remains
      legacy and out of this slice — its pre-existing 10 px stat-label contrast
      findings are tracked for a later dashboard slice.
    - Commit/PR: feature + docs commits on
      `claude/company-profile-security-migration-mjdbm1`; PR into `main`.
  - [x] Migrate the campaigns dashboard shell (`CampaignsDashboard`) — header,
    Create action, stat cards, tabs, loading/empty states, card grid.
    - Complete when: the shell consumes approved layout/components
      (`PageContainer`/`PageHeader`/`Section`/`ResponsiveGrid`, `Button`,
      `MetricCard`); the former 10 px stat labels and their contrast are fixed;
      the Drafts/Past Sequences tabs are an accessible tablist (programmatic
      selection + keyboard); loading is announced; empty states carry a clear
      heading and action; and no listeners, callables, calculations, tab values,
      `CampaignCard` props, or report-modal behavior change.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/CampaignsDashboard.jsx`,
      `src/features/campaigns/CampaignsDashboard.test.jsx`,
      `e2e/campaigns-dashboard.spec.cjs`, `e2e/campaign-card.spec.cjs`
      (tab selector updated to `role="tab"`), this roadmap.
    - Verification: 16 focused dashboard tests passed (paywall + no-listeners,
      exact drafts/sessions listeners + unmount cleanup, live/outreach stats,
      accessible header/tablist/action, tab switch + arrow-key navigation, exact
      new-draft write + editor open, announced loading, per-tab empty states,
      frozen `CampaignCard` props, container axe). Full frontend suite 102 files
      / 790 tests passed (2 files / 48 emulator rules tests skipped); migrated
      file coverage 80% lines / 80% branches (uncovered lines are the frozen
      cancel/delete error branches and e2e-seed paths); frontend lint 0 errors;
      typecheck, production build, and `git diff --check` passed. Playwright
      passed 20 Chromium/Mobile Chrome checks across
      `campaigns-dashboard`/`campaign-card`/`campaign-launch-and-control` (6
      intentional viewport-specific skips).
    - Visual/mobile/a11y: reviewed at 1440×900, 1024×900, and 412×915 for both
      Drafts and Past Sequences tabs. No document-level horizontal overflow; the
      header stacks and the primary action goes full-width on mobile; stat cards
      collapse to one column. Stat labels now use the supported `--ds-*` xs size
      with `content-secondary` color (10 px + low-contrast defect fixed). The
      tablist exposes `role="tab"`/`aria-selected`, roving `tabindex`, and
      Arrow/Home/End activation with a visible focus ring; loading is a
      `role="status"` region. Shell-scoped real-browser axe found no serious or
      critical and no color-contrast violations.
    - Notes: presentation only — the paywall (`campaignsEnabled !== false`), both
      Firestore listeners (`campaign_drafts`, `bulk_sessions`) and their unsubs,
      the E2E mock seeds, session→card mapping, live/outreach calculations, the
      exact new-draft `setDoc` payload/path, `cancelBulkSession`, the
      `window.confirm` messages, delete logic, the `'drafts'`/`'history'` tab
      values, `CampaignCard` props, and `DetailedReportModal` wiring are all
      unchanged. No approved DS tab primitive exists yet, so the tablist is a
      documented feature-level composition following the WAI-ARIA tabs pattern.
    - Commit/PR: feature + docs commits on
      `claude/safehaul-design-system-g1vr3a`; PR into `main`.
  - [x] Migrate the campaign results table (`CampaignResultsTable`) — recipient
    delivery log with search, status, and per-row error.
    - Complete when: the log consumes approved primitives (`Card`, `Input`,
      `Label`, `Badge`); the former 10 px low-contrast headers are fixed; search
      is labelled; loading is announced; statuses are text + icon (never
      colour-only); per-row errors are readable; the scrollable results area and
      sticky header are preserved; and no query, mapping, search logic, or
      messages change.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/CampaignResultsTable.jsx`,
      `src/features/campaigns/components/CampaignResultsTable.test.jsx`,
      `e2e/campaign-results-table.spec.cjs`, this roadmap.
    - Verification: 11 focused tests passed (exact `getDocs` query — path,
      `orderBy('timestamp','desc')`, `limit(200)`, one read; no-query on missing
      IDs; announced loading; empty state; case-insensitive name / substring
      identity filtering; `delivered`→Delivered, all else→Failed mapping; per-row
      error; timestamp + `Pending` fallback; labelled search + column headers;
      container axe). Full frontend suite 102 files / 799 tests passed (2 files /
      48 emulator rules tests skipped); migrated file coverage 88% lines / 91%
      branches (uncovered are the fetch-catch and E2E-seed branches); lint 0
      errors; typecheck, production build, and `git diff --check` passed.
      `campaign-results-table.spec.cjs` passed 8 Chromium/Mobile Chrome checks
      (2 viewport-specific skips); the campaign-card/dashboard/launch specs stay
      green.
    - Visual/mobile/a11y: reviewed populated at 1440 and 412; no document-level
      horizontal overflow at 1440/1024/412 (wide content scrolls inside the
      results region). Headers now use the supported `--ds-*` xs size with
      `content-secondary` colour; statuses are `Badge` success/danger with a
      check/alert icon plus text; per-row errors use the readable danger token;
      the search field has a programmatic label; the scroll region is a labelled,
      keyboard-focusable region with the sticky header preserved. Real-browser
      axe scoped to the table found no serious/critical and no color-contrast
      violations.
    - Notes: presentation only — props (`companyId`, `campaignId`), the
      no-query-on-missing-IDs guard, the one-time `getDocs` on
      `companies/{companyId}/bulk_sessions/{campaignId}/logs` with
      `orderBy('timestamp','desc')` + `limit(200)`, the id-preserving log
      mapping, the `recipientName`/`recipientIdentity` search, the exact loading
      and empty strings, the `delivered`→Delivered / else→Failed rule, the
      console-only fetch-error handling, and the timestamp/`Pending` formatting
      are all unchanged. `DataTable` was intentionally not adopted here: it owns a
      horizontal column-scroll region and requires a definite-height ancestor for
      its vertical sticky scroll, which would replace the log's `max-height`
      grow-to-content behavior, and its skeleton loading would change the exact
      loading string — so `Card`/`Input`/`Badge` plus a semantic DS-token table
      are the safe fit (recorded as a primitive-fit exception). Recipient identity
      is sensitive: it is never logged, snapshotted, or seeded with real data
      (E2E uses artificial names + fictional 555-01xx contacts, guarded by
      `isE2ETestMode`).
    - Commit/PR: feature + docs commits on
      `claude/safehaul-design-system-g1vr3a`; PR into `main`.
  - [x] Migrate the detailed delivery-report dialog (`DetailedReportModal`).
    - Complete when: the dialog adopts the shared accessible `Modal` plus
      `Button`/`IconButton`/`Badge` and `--ds-*` tokens; backdrop close is kept
      while Escape, focus trap, and focus restoration are added; loading is
      announced; statuses are not colour-only; error text wraps; the results
      table scrolls internally without document overflow; and every fetch/retry
      contract, guard, message, and toast is preserved without any backend or
      rules change.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/DetailedReportModal.jsx`,
      `src/features/campaigns/components/DetailedReportModal.test.jsx`,
      `e2e/campaign-report-modal.spec.cjs`, this roadmap.
    - Verification: 17 focused tests passed (open/closed + missing-ID no-fetch
      guards; exact `companies/{id}/bulk_sessions/{id}/logs` query with
      `orderBy('timestamp','desc')` + `limit(200)` and id-preserving mapping;
      exact loading/empty/fetch-error strings; delivered = `status==='delivered'`
      or truthy `isSuccess`, else Failed; `hasFailures` = `failed` or
      `isSuccess===false`; retry confirm text, `retryFailedAttempts({companyId,
      originalSessionId})` payload, success toast + close-after-success, the
      `success:false`/generic/thrown failure branches; dialog focus-in, Escape,
      backdrop, header/footer close, focus restoration; container axe). Full
      frontend suite 102 files / 816 tests (2 files / 48 emulator rules tests
      skipped); frontend lint 0 errors; typecheck, production build, and
      `git diff --check` passed. `campaign-report-modal.spec.cjs` passed 9
      Chromium/Mobile Chrome checks with 1 viewport-specific skip; campaign
      card/results/dashboard specs stay green.
    - Visual/mobile/a11y: reviewed at 1440×900 and 412×915. The dialog is
      centered with a dimmed backdrop; the header/footer close and X are named
      controls; statuses are `Badge` success/danger with text (not colour-only);
      error cells wrap (`overflow-wrap: anywhere`); the results table is a
      labelled, keyboard-focusable scroll region (`scrollable-region-focusable`
      resolved) with a sticky header, so wide content scrolls inside the dialog
      with no document overflow at any width; on short viewports (landscape phone,
      zoom) the overlay scrolls vertically and the panel is auto-margin centered,
      so the Retry/Close controls are never clipped; loading is announced via a
      `role="status"` live region. Unit axe clean; dialog-scoped real-browser axe
      found no serious/critical violations.
    - Notes: presentation only — the props (`companyId`, `sessionId`, `isOpen`,
      `onClose`), the no-fetch-unless-open-with-both-IDs guard, the one-time
      `getDocs` and mapping, the exact strings, `hasFailures`, the delivered/failed
      rule, the retry confirmation/callable/toasts/close-after-success, and the
      `CampaignsDashboard` wiring are unchanged. `retryFailedAttempts` and all
      backend/rules are untouched. Recipient identity is sensitive and is never
      logged, snapshotted, or tested with real data (tests use synthetic names +
      `redacted-*` placeholders).
    - Commit/PR: feature + docs commits on
      `claude/company-profile-security-migration-mjdbm1`; PR into `main`.
  - [x] Migrate the campaign detail view (`CampaignDetails`).
    - Complete when: the full-screen detail view adopts `Card`/`Button`/
      `IconButton`/`Badge`/`FieldMessage` and layout tokens; the progress bar is
      a programmatic `progressbar`; status/actions are not colour-only; loading
      is announced; failure text wraps; actions stay reachable (wrap) on mobile;
      no document overflow; and every tenant/company guard, formatting, progress
      calc, action-visibility rule, exact callable payload, confirmation, toast,
      loading flag, and `onClose` is preserved with no backend or rules change.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/CampaignDetails.jsx`,
      `src/features/campaigns/components/CampaignDetails.test.jsx`,
      `e2e/campaign-details.spec.cjs`, this roadmap.
    - Verification: 25 focused tests passed (null/tenant-mismatch/missing-company
      guards; `effectiveCompanyId` fallback + exact `CampaignResultsTable` props;
      capitalized status, progress calc + accessible `progressbar`, audience/sent/
      failed from progress and the matchCount/zero fallbacks; failure reason and
      message/method/id rendering; the active/queued/scheduled→Pause,
      paused→Resume, active|paused→Cancel, failures-on-non-active→Retry visibility
      rules; the exact `pause/resume/cancel/retry` callable names + payloads;
      resume `success:false` keeps the view open; confirm-cancellation for
      cancel/retry; success/failure/thrown branches; accessible back-close; axe).
      Full frontend suite 102 files / 839 tests (2 files / 48 emulator rules tests
      skipped); frontend lint 0 errors; typecheck, production build, and
      `git diff --check` passed. `campaign-details.spec.cjs` passed 8
      Chromium/Mobile Chrome checks; campaign card/results/report/dashboard specs
      stay green.
    - Visual/mobile/a11y: reviewed at 1440×900 and 412×915 (tablet overflow in
      E2E). No document overflow; the header + action buttons wrap on mobile so
      they stay reachable; status is a `Badge` with text (not colour-only); the
      progress bar exposes `role="progressbar"` + `aria-valuenow/min/max`; the
      failure reason uses a danger `FieldMessage` that wraps; action loading uses
      the `Button` busy state. Full-page real-browser axe (view + migrated shell)
      found no serious/critical violations.
    - Notes: presentation only — `effectiveCompanyId`
      (`campaign.companyId || currentCompanyProfile.id`), the tenant-mismatch and
      missing-company states and their exact copy, `formatDate`, the progress/
      audience/sent/failed calculations, the failure-reason source
      (`error || failureReason`), the message/method/id/date rendering, the
      `CampaignResultsTable` props, all four action-visibility rules, the exact
      `pauseBulkSession`/`resumeBulkSession`/`cancelBulkSession`
      (`{companyId: effectiveCompanyId, sessionId: campaign.id}`) and
      `retryFailedAttempts` (`{companyId, originalSessionId}`) payloads, both
      confirmations, all toasts, the per-action loading flags, and every `onClose`
      path are unchanged. `MetricCard` was not used for the stat cards because its
      tone set has no danger treatment for the red "Failed" count, so `Card` with
      status tokens is the fit (recorded exception). Status label casing is
      capitalized to match the already-migrated `CampaignCard`. No `CampaignEditor`
      or backend/rules change.
    - Commit/PR: feature + docs commits on
      `claude/company-profile-security-migration-mjdbm1`; PR into `main`.
  - [x] Migrate the `CampaignEditor` shell (wizard chrome only).
    - Complete when: the shell adopts `Input`/`Button`/`FormField` + layout
      tokens; section navigation is keyboard-accessible with programmatic
      selected (`aria-current="step"`) and completed states; the Campaign Name is
      labelled; the save status and Suspense fallback are announced; the editor is
      responsive with no document overflow; and every listener/autosave/merge/
      guard/child-prop contract is preserved without touching `AudienceBuilder`,
      `ContentComposer`, `LaunchPad`, backend, or rules.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/CampaignEditor.jsx`,
      `src/features/campaigns/CampaignEditor.test.jsx`,
      `e2e/campaign-editor.spec.cjs`, this roadmap.
    - Verification: 12 focused tests passed (exact draft-doc listener + unsubscribe
      on unmount; no-subscribe on missing IDs; deep filter merge preserving
      in-memory `rawData`; no autosave on mount; the 2-second debounce with
      `rawData` stripped from the save payload; section navigation, `aria-current`,
      and audience/content completion rules; the exact `AudienceBuilder`/
      `ContentComposer`/`LaunchPad` props incl. `onLaunchSuccess === onClose`;
      the E2E-mock path skipping the listener; labelled name, announced save
      status, Exit; the Suspense fallback; axe). Full frontend suite 104 files /
      851 tests (2 files / 48 emulator rules tests skipped); frontend lint 0
      errors; typecheck, production build, and `git diff --check` passed.
      `campaign-editor.spec.cjs` passed 9 Chromium/Mobile Chrome checks with 1
      viewport-specific skip; all other campaign specs stay green.
    - Visual/mobile/a11y: reviewed at 1440×900 and 412×915 (tablet overflow in
      E2E). Desktop keeps the left sidebar; mobile stacks the shell (Exit,
      labelled name, section nav, save status) above the content with no document
      overflow. The nav is a labelled `<nav>` of buttons with `aria-current` and
      sr-only completed/incomplete text; the save status and Suspense fallback are
      `role="status"`/live regions. Unit axe clean; shell-scoped real-browser axe
      found no serious/critical violations.
    - Notes: shell/chrome only. Preserved verbatim: props (`companyId`,
      `campaignId`, `onClose`); the `audience`/`content`/`launch` `SECTIONS`;
      the initial `campaignData`; the E2E-mock behavior; the `onSnapshot`
      `campaign_drafts/{campaignId}` listener + unsub; the deep filter merge and
      in-memory `rawData` preservation; the `isDirty` + `isInitializedRef`
      init guards; the exact 2-second autosave debounce; the `rawData` strip
      before `saveDraft`; `isSectionComplete`; all lazy child props;
      `onLaunchSuccess={onClose}`; and the Saving/Auto-Saved status (the
      `useCampaignDraft` hook returns `isSaving: false`, so it reads "Auto-Saved").
      `AudienceBuilder`, `ContentComposer`, and `LaunchPad` were intentionally
      not touched.
    - Commit/PR: feature + docs commits on
      `claude/company-profile-security-migration-mjdbm1`; PR into `main`.
  - [x] Migrate the content composer (`ContentComposer`) — the editor's message
    Content section (channel toggle, subject/message fields, variable insertion,
    device preview, tips).
    - Complete when: the composer consumes approved primitives (`Card`,
      `FormField`, `Input`, `Textarea`, `Button`); the SMS/Email choice is a
      keyboard-accessible toggle exposing selected state; Subject/Message have
      associated labels; variable buttons identify what they insert; focus
      returns to the edited field; the character count is accessible; the toolbar
      is in normal flow (no overlapping absolute bar) and reachable on mobile;
      there is no document overflow at 1440/1024/412; and no message limit,
      validation, sending rule, or preserved behavior changes.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/ContentComposer.jsx`,
      `src/features/campaigns/components/ContentComposer.test.jsx`,
      `e2e/campaign-content-composer.spec.cjs`, this roadmap.
    - Verification: 18 focused tests passed (exact `{ ...messageConfig, [key]: value }`
      method updates; conditional Subject; message/subject merge updates;
      active-field tracking; every variable value with surrounding spaces; caret
      insertion; selection replacement; subject-vs-message targeting; append
      fallback when the selection API is unavailable; `requestAnimationFrame`
      focus + caret restoration; accessible character count; exact `DeviceMockup`
      `type`/preview content; placeholders; Pro Tips copy; axe). Full frontend
      suite 105 files / 869 tests passed (2 files / 48 emulator rules tests
      skipped); migrated file coverage 100% lines / 96.7% branches; lint 0 errors;
      typecheck, production build, and `git diff --check` passed.
      `campaign-content-composer.spec.cjs` passed 8 Chromium/Mobile Chrome checks
      (2 viewport-specific skips); the editor/card/dashboard/results/launch specs
      stay green.
    - Visual/mobile/a11y: no document-level horizontal overflow at 1440/1024/412
      (measured in-browser). The channel toggle is a labelled `role="group"` of
      `aria-pressed` buttons (keyboard-operable, selected state exposed); Subject
      and Message use `FormField` label association; variable buttons carry
      `Insert <name> placeholder` labels with a "inserts at your cursor in the
      active field" hint; the character count is an `aria-live="polite"` region
      with an sr-only "Message length:" prefix; the variable toolbar sits in
      normal flow below the field (the former absolute overlapping bar is gone).
      The intro subtitle was moved from `content-muted` to `content-secondary`
      because the editor's `#f1f5f9` content background dropped muted text to
      4.34:1; real-browser axe scoped to the composer then found no
      serious/critical and no color-contrast violations.
    - Notes: presentation only — props (`messageConfig`, `onChange`); the
      `handleChange` spread; the exact `sms`/`email` methods; email-only Subject;
      the `activeField` default (`message`) + focus tracking; the variable labels
      and values; caret/selection insertion with surrounding spaces;
      subject-only-when-email-and-active vs message targeting; the
      `requestAnimationFrame` focus/caret restore; the append fallback; the
      placeholders; the character count; and the `DeviceMockup` `type` + preview
      content are all unchanged. `DeviceMockup` was not redesigned. No message
      limit, validation, or sending rule changed.
    - Commit/PR: feature + docs commits on
      `claude/safehaul-design-system-g1vr3a`; PR into `main`.
  - [x] Migrate the audience builder (`AudienceBuilder`) — the editor's Audience
    section (source tabs, CRM filters, list import, recipient preview header).
    - Complete when: the builder consumes approved primitives (`Card`,
      `FormField`, `Select`, `Input`, `Button`); both tab groups are accessible
      and expose selected state; every filter and the file/sheet inputs are
      labelled; status stays a multi-select with a non-colour-only selected
      state; the count loading is announced and exclusion counts are readable;
      the upload surface uses one accessible file-input trigger with no nested
      interactive controls; the virtual list stays functional, internally
      scrollable and mobile-reachable; unsupported 10 px text is removed; and no
      targeting, counting, import parsing, exclusion rule, or saved filter shape
      changes.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/AudienceBuilder.jsx`,
      `src/features/campaigns/components/AudienceBuilder.test.jsx`,
      `e2e/campaign-audience-builder.spec.cjs`, this roadmap.
    - Verification: 22 focused tests passed (initial defaults + upload-tab
      restoration from `filters.leadType`; campaign-scope exclusion reset; upload
      fingerprint reset vs. preserved skips; CRM↔upload transitions with
      `rawData` added and stripped; the exact source/owner/exclusion option
      values; CRM `off` vs upload `7` defaults; labelled filter updates; status
      multi-select with `aria-pressed`; manual exclusions and
      `finalCount = matchCount − manualExcluded`; the exact file `accept` list +
      `handleFileChange`; sheet URL/import wiring and the processing state; the
      frozen `VirtualLeadList` props in both modes; announced count; arrow-key
      tab operation; axe in both modes). Full frontend suite 105 files / 887
      tests passed (2 files / 48 emulator rules tests skipped); migrated file
      coverage 93% lines / 84% branches; lint 0 errors; typecheck, production
      build, and `git diff --check` passed. `campaign-audience-builder.spec.cjs`
      passed 11 Chromium/Mobile Chrome checks (3 viewport-specific skips) and the
      29-check campaign regression sweep stayed green.
    - Visual/mobile/a11y: no document-level horizontal overflow at 1440/1024/412
      (measured in-browser). Source and import tabs are WAI-ARIA tablists with
      roving `tabindex`, Arrow/Home/End activation, `aria-selected`, and a visible
      focus ring; filters use `FormField` label association; status pills are
      `aria-pressed` buttons with a check icon so selection is never colour-only;
      a `role="status"` region announces the recipient count and its loading
      state; the exclusion chips were lightened to readable tones; the former
      10 px hint text now uses the supported `--ds-*` xs size via `FieldMessage`.
      Heading order was corrected (the upload panel's `h4` became `h3`) after
      axe flagged it. Real-browser axe scoped to the builder found no
      serious/critical violations.
    - Notes: presentation only — props (`companyId`, `filters`, `onChange`,
      `campaignScopeKey`); the initial tab selection and filter defaults; the
      `useCompanyTeam`/`useCampaignTargeting`/`useBulkImport` calls; the upload
      fingerprint helper; the campaign-scope and fingerprint exclusion resets;
      the CRM/upload effects and `rawData` handling; `onChange(localFilters,
      matchCount)` parent sync; manual exclusion toggling; `finalCount`; all
      filter and option values; the file `accept` list; the sheet URL/import
      behavior; every `VirtualLeadList` prop; and the exact
      `onChange(localFilters, finalCount)` Confirm Audience call are unchanged.
      **Documented temporary exception:** the recipient-preview panel keeps its
      dark surface (literal slate colours, not `--ds-*`) because the unmigrated
      `VirtualLeadList` — explicitly out of scope for this slice — renders its own
      hard-coded dark list chrome. (Resolved by the `VirtualLeadList` slice below:
      that list's 10 px status pills and low-contrast "Scanning Database..." label
      are now fixed and the builder's scoped axe scan no longer excludes it. The
      dark surface itself remains a deliberate, documented product treatment — see
      the dark-surface note in that slice.)
    - Commit/PR: feature + docs commits on
      `claude/safehaul-design-system-g1vr3a`; PR into `main`.
  - [x] Migrate the recipient preview list (`VirtualLeadList`) — virtualized lead
    rows, selection, pagination, and load states.
    - Complete when: the inaccessible clickable row containers become
      keyboard-operable selection controls that keep whole-row usability;
      selected / manually excluded / already-messaged states are text and icon
      based rather than colour-only; already-messaged rows stay non-toggleable;
      loading and pagination are announced; retry is an approved `Button`; error
      and empty states are accessible; the 10 px status pills are gone;
      "Scanning Database…" meets contrast; contact data is never logged or
      snapshotted; virtualization and internal scrolling stay intact; and no
      targeting, pagination, recipient data or exclusion behavior changes.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/VirtualLeadList.jsx`,
      `src/features/campaigns/components/VirtualLeadList.test.jsx`,
      `e2e/campaign-lead-preview.spec.cjs`,
      `e2e/campaign-audience-builder.spec.cjs` (its axe scan no longer excludes
      the preview), this roadmap.
    - Verification: 20 focused tests passed (exact `getFilteredLeadsPage` payload
      with `pageSize: 50`, the `excludeRecentDays` `off`→`null` and
      `campaignLimit` `parseInt` mapping, and `lastDocId`; append-with-cursor
      pagination and the `hasMore` rule including the empty-page case; reset on
      filter change; the in-flight fetch guard; local-data mode with no backend
      call; `import_<index>` fallback ids; name/contact fallbacks; toggle rows
      with `aria-pressed` and exact `onToggleExclusion(safeId)` values;
      non-toggleable already-messaged rows; phone-exclusion only when a Set is
      supplied; Badge status tones and no 10 px text; announced loading, empty and
      pagination states; alert + retry; the frozen Virtuoso props; axe with mixed
      row states). Full frontend suite 106 files / 907 tests passed (2 files / 48
      emulator rules tests skipped); migrated file coverage 100% lines / 93%
      branches; lint 0 errors; typecheck, production build, and
      `git diff --check` passed. `campaign-lead-preview.spec.cjs` passed 11
      Chromium/Mobile Chrome checks (3 viewport-specific skips) and the 35-check
      campaign regression sweep stayed green.
    - Visual/mobile/a11y: rows are now native `<button aria-pressed>` controls, so
      Enter/Space work from the platform and the whole row stays clickable; an
      `ds-visually-hidden` state sentence ("Included in this campaign" /
      "Excluded from this campaign" / "Already messaged — cannot be selected")
      pairs with the check/cross icon so state is never colour-only;
      already-messaged rows are not exposed as controls at all. Status pills are
      approved `Badge`s (12 px, replacing the 10 px spans); "Scanning Database…"
      moved to `slate-300` (≈9.5:1 on the panel, up from 4.23:1); loading, empty
      and pagination regions are `role="status"`; the failure state is a
      `role="alert"` with an approved `Button` retry. `Virtuoso` still owns the
      internal scrolling, and there is no document-level overflow at
      1440/1024/412. Real-browser axe over the **populated** preview (rows
      injected by intercepting the callable) found no serious/critical and no
      color-contrast violations.
    - Notes: presentation only — all props and defaults, local-vs-remote
      behavior, the StrictMode double-fetch guard, the `getFilteredLeadsPage`
      callable, the backend filter mapping, `pageSize: 50`, pagination/reset/
      append/`lastDocId`, the `hasMore` calculation, error handling and retry,
      imported-row fallback ids, name/contact fallbacks, the manual and
      phone-based exclusion rules, every exclusion callback value, the `Virtuoso`
      `data`/`endReached`/`itemContent`/Footer wiring, and all existing status and
      empty/loading/error copy are unchanged. Recipient contact data is never
      logged (only the failure reason is) and never snapshotted; all fixtures use
      artificial names and fictional 555-01xx numbers. **Documented feature-level
      exception (smallest scope):** the panel keeps its dark surface using literal
      slate colours instead of `--ds-*`, because the editor presents it as an
      inverted "console" panel and the design system has no approved dark-surface
      tokens; rather than expand the token set for one surface, the exception is
      confined to this container and every piece of text on it is contrast-checked
      in a real browser.
    - Commit/PR: feature + docs commits on
      `claude/safehaul-design-system-g1vr3a`; PR into `main`.
  - [x] Migrate the launch pad (`LaunchPad`) — the editor's Launch section:
    pre-flight checks, estimate, launch action and confirmation dialog.
    - Complete when: the pad consumes approved primitives (`Card`, `Button`,
      `Badge`, the shared `Modal`, status tokens); validation and success states
      are non-colour-only; the launching state is announced; the confirmation
      dialog has Escape dismissal, focus trap and focus restoration with
      mobile-safe actions; and no launch payload, validation message, toast,
      guard, estimate or preview behavior changes.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/LaunchPad.jsx`,
      `src/features/campaigns/components/LaunchPad.test.jsx`,
      `e2e/campaign-launchpad.spec.cjs`, this roadmap.
    - Verification: 33 focused tests passed (both validation messages and the
      combined case; the disabled launch action; the "Company ID missing" guard
      with no backend call; the estimate and its rounding; the accessible dialog
      name/description; Escape and Cancel without launching plus focus
      restoration; the 280-character preview truncation with and without the
      ellipsis; the exact `initBulkSession` payload with `rawData` stripped from
      `filters`, `null` rawData, and absent filters; every result branch
      (success, success with `filteredCount`, `success: false` with and without a
      message) and every error mapping (`bulk-actions-queue`,
      `PROCESS_BULK_BATCH_URL`, passthrough, empty); the duplicate-launch guard;
      the announced launching state; the finally-state resets and lock release;
      E2E mock short-circuit and the non-mock path; axe in the ready, blocked and
      dialog-open states). The real launch callable is never invoked — every test
      drives a stub — and all fixtures are artificial. Full frontend suite 106
      files / 938 tests passed (2 files / 48 emulator rules tests skipped);
      migrated file coverage 100% lines / 93.5% branches; lint 0 errors;
      typecheck, production build, and `git diff --check` passed.
      `campaign-launchpad.spec.cjs` passed 10 Chromium/Mobile Chrome checks.
    - Visual/mobile/a11y: the pre-flight result is an icon + heading text
      (`role="alert"` for failures, `role="status"` for the all-clear with a
      `Badge` carrying the estimate), so state is never colour-only; a
      visually hidden `role="status"` announces "Launching campaign…" while the
      request is in flight; the confirmation dialog is now the shared accessible
      `Modal` (adds Escape, focus trap and focus restoration, keeping backdrop
      dismissal) and its actions stack on narrow viewports; the launch action is
      an approved `Button` whose `disabled`/`loading` composition reproduces the
      previous `!isValid || isLaunching` rule exactly. No document-level
      horizontal overflow at 1440/1024/412; real-browser axe found no
      serious/critical and no color-contrast violations.
    - Notes: presentation only — props (`companyId`, `campaign`,
      `onLaunchSuccess`), the company-id validation, the `launchLockRef` +
      `isLaunching` duplicate-launch protection, the E2E mock behavior, the
      `initBulkSession` callable, the `rawData` extraction from filters, the exact
      payload (`companyId`, `sessionName`, `filters`, `rawData || null`, `config`,
      `scheduledFor: null`), every success/error toast and friendly error
      mapping, `onLaunchSuccess`, all finally-state resets, the validation
      messages, the estimated-duration calculation, the confirmation
      recipient/method/message preview with its 280-character truncation and
      ellipsis, and the button disabled/loading behavior are unchanged.
      `FieldMessage` was considered but not used: this screen has no form fields,
      and its error-tone variant renders its own `role="alert"`, which would have
      nested duplicate alerts inside the pre-flight summary.
    - Commit/PR: feature + docs commits on
      `claude/safehaul-design-system-g1vr3a`; PR into `main`.
  - [x] Close out Campaigns: resolve the two non-interactive leftovers.
    - Owner decision (2026-07-24): **split** — `DeviceMockup` is an approved
      documented exception; the `CompanyCampaignsPage` fallback is fixed.
    - Completed: 2026-07-24.
    - Files: `src/features/campaigns/components/DeviceMockup.jsx` (exception
      recorded in-code), `src/features/campaigns/pages/CompanyCampaignsPage.jsx`,
      `src/features/campaigns/pages/CompanyCampaignsPage.test.jsx`, this roadmap.
    - **Approved exception — `components/DeviceMockup.jsx`:** the simulated
      "9:41" device status time keeps `text-[10px]`. This is a *simulation of
      phone chrome*, not SafeHaul interface text: a real status bar is that
      small, and promoting it to the supported `--ds-*` xs size would make the
      mockup read as oversized UI rather than as a phone. The 9px/10px ban
      targets real interface text; nothing in the frame conveys product
      information. The rationale is also recorded in a file-level comment so the
      exception travels with the code. The bezel geometry keeps its literal
      sizes for the same reason. This exception is **scoped to this decorative
      component only** and must not be cited for interface text.
    - **Fixed — `pages/CompanyCampaignsPage.jsx`:** the "Please select a
      company." fallback moved off legacy `text-gray-700` onto
      `text-ds-content-secondary` (a defined Tailwind key — emission verified in
      the production CSS, per the lesson from the editor-nav token finding).
      Presentation only: the `useData` company resolution, the guard condition,
      the exact fallback string, and the `CampaignsDashboard companyId` handoff
      are unchanged. A test locks the DS token and asserts no `text-gray-*`
      class remains.
    - Verification: 3 `CompanyCampaignsPage` tests pass (guard message, token,
      dashboard handoff); full frontend suite, lint, typecheck, build, and
      `git diff --check` recorded in the closing-slice completion evidence below.
  - [x] **Campaigns is complete.** All ten interactive components are migrated
    and verified, the decorative `DeviceMockup` carries an approved documented
    exception, and the `CompanyCampaignsPage` fallback is tokenized. No Campaigns
    file remains on legacy interface styling.

- [~] In progress — E-docs, driver dossier, and verification workflows.
  - Complete when: dialogs/tables/forms/states migrate and document generation,
    employment verification, uploads, previews, and audit behavior pass.
  - [x] Migrate the E-Docs envelope history table (`EnvelopeHistory`) — the
    Documents Center document/recipient/status/date/actions log.
    - Complete when: the `signing_requests` real-time subscription and ordering,
      the void write, both signing-link and signed-document callables, every
      toast and error mapping, and the per-status action-visibility rules are
      preserved while presentation adopts the approved `DataTable` with a
      feature-owned status adapter.
    - Completed: 2026-07-24 (GO).
    - Files: `src/features/signing/components/EnvelopeHistory.jsx`,
      `src/features/signing/components/EnvelopeHistory.test.jsx`,
      `e2e/edoc-envelope-history.spec.cjs`, this roadmap.
    - Verification: 46 focused unit tests, 10 Chromium + Mobile Chrome E2E
      checks, the 20 existing E-Doc send/sign regressions, the full frontend
      suite and coverage gate, lint, typecheck, production build,
      `git diff --check`, built-CSS token-emission check, unit and scoped
      real-browser axe, and review at 1440×900, 1024×768, and 412×915.
      Detailed evidence is in the completion log.
    - Notes: the 9 px delivery pills are gone and per-row action names are now
      unique; a snapshot failure raises a visible `role="alert"` instead of an
      empty table. `DocumentsManager`, `EnvelopeCreator`, backend functions and
      rules were untouched and stay open as separate slices.
  - [x] Migrate the Documents Center page header (`DocumentsManager` header area
    only) — page canvas, Back to Dashboard, Create Template, Send One-off.
    - Complete when: back navigation and both creator transitions keep their
      exact call order while the canvas, heading, icon and three actions adopt
      `PageContainer`/`Stack`/`PageHeader` and approved `Button`s that wrap on
      mobile.
    - Completed: 2026-07-24 (GO) — PR #100, merged as `bfe4563`.
    - Files: `src/features/company-admin/views/DocumentsManager.jsx`,
      `src/features/company-admin/views/DocumentsManager.test.jsx`.
    - Verification: 9 focused tests, three E-Doc E2E specs (26 Chromium +
      Mobile Chrome checks), lint, production build, `git diff --check`, and a
      built-CSS emission check for `bg-ds-canvas`, `flex-wrap`, `self-start`
      and `text-ds-action-primary`.
    - Notes: the tabs and content blocks moved one indent level because their
      wrapper changed; no tab logic, class or prop was altered in that slice.
  - [x] Migrate the Documents Center navigation and template-management surface
    — the History/Templates tab interface in `DocumentsManager` plus the whole
    of `TemplatesPanel`.
    - Complete when: the `'list'`/`'templates'` state values (with `'list'`
      initial), the exact `EnvelopeHistory` props, every `TemplatesPanel` prop,
      the post-application ordering/required rules and persistence callbacks,
      and every template use/edit/delete argument shape are preserved while the
      tabs become a WAI-ARIA tab interface and the panel adopts
      `Card`/`Button`/`IconButton`/`Badge`/`Stack`/`ResponsiveGrid`.
    - Completed: 2026-07-24 (GO).
    - Files: `src/features/company-admin/views/DocumentsManager.jsx`,
      `src/features/company-admin/views/DocumentsManager.test.jsx`,
      `src/features/company-admin/components/documents/TemplatesPanel.jsx`,
      `src/features/company-admin/components/documents/TemplatesPanel.test.jsx`,
      `e2e/edoc-documents-tabs-and-templates.spec.cjs`,
      `e2e/edoc-recruiter-send-flow.spec.cjs` (selectors only), this roadmap.
    - Verification: 22 DocumentsManager + 35 TemplatesPanel focused tests, 12
      new Chromium + Mobile Chrome E2E checks, the existing E-Doc send/sign and
      envelope-history regressions, the full frontend suite and coverage gate,
      lint, typecheck, production build, `git diff --check`, built-CSS token
      emission, unit and scoped real-browser axe, and a measured review at
      1440×900, 1024×768 and 412×915. Detailed evidence is in the completion
      log.
    - Notes: the design system has no approved Tabs or Checkbox primitive, so
      both stay feature-owned documented compositions. `SendTemplateModal`,
      `EnvelopeCreator`, the prefill utilities, backend functions and rules were
      untouched.

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

- [~] In progress — Auth, sandbox, and remaining edge screens.
  - Complete when: visual primitives migrate and login/redirect/test-only
    behavior remains unchanged.
  - [x] Migrate the Login `/login` screen to approved form/button/card
    primitives and the shared accessible dialog.
    - Complete when: email/password login, password visibility, authentication
      errors and loading, smart role-based and requested-route redirects, and
      the full password-reset workflow are preserved while presentation adopts
      FormField/Input/Button/IconButton/Card and the shared Modal.
    - Completed: 2026-07-23.
    - Files: `src/features/auth/components/LoginScreen.jsx`,
      `src/features/auth/components/LoginScreen.test.jsx`,
      `e2e/login.spec.cjs`, `src/design-system/README.md`, this roadmap.
    - Verification: 16 focused Login tests plus the 5 existing auth tests, the
      full frontend suite, design-system/route/modal-adoption gates, lint,
      typecheck, production build, `git diff --check`, Chromium and Mobile
      Chrome E2E (login spec + access-control regression), unit and scoped
      real-browser axe, and rendered review at 1440×900, 1024×768, and 412×915.
      Detailed evidence is in the completion log.
    - Notes: the reset modal was migrated to the shared accessible Modal;
      sandbox and remaining edge screens stay open.
  - [x] Migrate the Sandbox Transfer Success status screen
    (`/sandbox/transfer-success`) to approved Card/Button/Badge and layout
    primitives.
    - Complete when: the `companyName || companyId || 'the selected company'`
      fallback, the `New Application` status wording, and the Super Admin (`/super-admin`)
      and Home (`/`) navigations are preserved while presentation adopts
      Card/Badge/Button/Stack/Inline with a single `<h1>`/`<main>`.
    - Completed: 2026-07-23.
    - Files: `src/features/sandbox/SandboxTransferSuccess.jsx`,
      `src/features/sandbox/SandboxTransferSuccess.test.jsx`,
      `e2e/sandbox-transfer-success.spec.cjs`, this roadmap.
    - Verification: 9 focused tests, the route-manifest and design-system gates,
      full frontend suite, coverage, lint, typecheck, production build,
      `git diff --check`, Chromium and Mobile Chrome E2E, unit and scoped
      real-browser axe, and rendered review at 1440×900, 1024×768, and 412×915.
      Detailed evidence is in the completion log.
    - Notes: route paths, navigation, status wording, and the state fallback are
      unchanged; the route-manifest entry was untouched.
  - Remaining: the sandbox application screen and the verification and
    change-review token screens are still unmigrated.

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
| Login `/login` | `features/auth/components/LoginScreen.jsx` now consumes `FormField`, `Input`, `Button`, `IconButton`, `Card`, and the shared accessible `Modal`; branded marketing panel preserved | Field, Button, Card, shared Modal | Medium | Medium | Tokens, controls, forms, cards | Compatibility slice completed 2026-07-23 | Verified: 16 focused + 5 existing auth tests, login/requested-route/super-admin/company/root redirects, password visibility, loading/errors, reset open/submit/success/failure/close, focus, autofill, Chromium/Mobile Chrome, 1440/1024/412 px, axe, overflow |
| Company workspace shell | `company-admin/layout/*`; feature-owned sidebar/topbar consuming WorkspaceFrame and approved controls | Layout primitives consumed by feature-owned shell | High | Medium | Tokens, controls, layouts | Completed 2026-07-23 | Verified: routes, roles, flags, persisted desktop collapse, overflow, keyboard/focus, 1440/1024/412 px, Mobile Chrome, scoped axe |
| Company dashboard | `CompanyAdminDashboard`, MetricCard compatibility adapter, DataTable leaderboard | PageHeader, Card, Metric, DataTable, Dialog, PageState | High | Medium | Controls, cards, table, dialog | Completed 2026-07-23 | Verified: dashboard/onboarding tests, stats/actions, leaderboard loading/empty/error/retry, import/lead routes, numeric alignment, desktop/mobile, scoped axe; Dialog/PageState family migration remains a separate shared phase |
| Applications / company leads / my leads | `CompanyCandidatesListPage` now consumes the approved DataTable; feature owns toolbar, filters, actions, and status mapping | Approved DataTable pilot, toolbar, filters, page states | Critical | High | Table spec/primitives, controls, badge | Completed 2026-07-23 | Verified: measured alignment, keyboard row/selection, filters/sorting, pagination contract, bulk actions, calls, dossier, desktop/mobile, scoped axe |
| Campaigns | All interactive components migrated — `CampaignCard`, `CampaignsDashboard` shell, `CampaignResultsTable`, `DetailedReportModal`, `CampaignDetails`, `CampaignEditor` shell, `ContentComposer`, `AudienceBuilder`, `VirtualLeadList`, and `LaunchPad`; only the decorative `DeviceMockup` illustration and the `CompanyCampaignsPage` fallback string remain unmigrated | Presentation-only throughout; the dashboard keeps both listeners + cleanup, stats, new-draft write, `cancelBulkSession`, confirmations, delete logic, and wiring; `CampaignDetails` keeps `effectiveCompanyId`, guards, and the pause/resume/cancel/retry payloads; the `CampaignEditor` shell keeps the draft listener, deep merge + `rawData` preservation, 2s autosave debounce, and all lazy child props; `ContentComposer` keeps the `messageConfig` spread and variable insertion; `AudienceBuilder` keeps the targeting/import hooks, exclusion resets and `finalCount`; `VirtualLeadList` keeps the `getFilteredLeadsPage` callable, mapping, pagination and exclusion rules; `LaunchPad` keeps the `initBulkSession` payload, launch guards, toasts, error mapping, estimate and preview truncation | Status presentation, action-visibility rules, exact callables, autosave/merge/guards, variable insertion targeting, targeting/counting/import parsing, pagination and exclusion behavior, launch payload and guards | Medium | High | **Complete** 2026-07-24 — all ten interactive components migrated; `CompanyCampaignsPage` fallback tokenized; decorative `DeviceMockup` status-bar text carries an approved documented exception | 22 card + 16 dashboard + 11 results + 18 report-modal + 25 details + 12 editor + 18 composer + 22 audience + 20 preview + 33 launch unit tests, full suite/coverage, Chromium/Mobile Chrome, 1440/1024/412 px, scoped axe, overflow, git diff --check passed |
| E-Docs | `EnvelopeHistory` (approved `DataTable`), the `DocumentsManager` page header/canvas, its History/Templates tab navigation (feature-owned WAI-ARIA tab interface), and the whole `TemplatesPanel` are migrated; `SendTemplateModal` and `EnvelopeCreator` still on legacy markup | Presentation-only throughout: the history table keeps the `signing_requests` `onSnapshot` subscription and ordering, the `voided` + `serverTimestamp` write, the `getSigningLink`/`getSignedDocumentUrl` callables, `gs://` path cleaning, `window.confirm` and every toast; the header keeps back navigation and both creator transitions; the tabs keep the exact `'list'`/`'templates'` values with `'list'` initial; `TemplatesPanel` keeps every prop, the `postSubmitRequiredById = {}` default, the `!== false` required rule, `templates.find` lookup with null for missing ids, the id order, the move directions and first/last disabling, and all callback argument shapes | Real-time status updates, per-status action visibility, signing-link confidentiality, tab state values, post-application ordering/required persistence, template use/edit/delete argument shapes | High | High | **In progress** — `EnvelopeHistory`, the header, the tab navigation and `TemplatesPanel` complete 2026-07-24 (GO); `SendTemplateModal` + `EnvelopeCreator` remain separate slices | 46 history + 22 DocumentsManager + 35 TemplatesPanel unit tests, 22 new Chromium/Mobile Chrome E2E checks, existing E-Doc send/sign regressions, full suite/coverage, 1440/1024/412 px, scoped axe, overflow, built-CSS token emission, git diff --check passed |
| Import leads | `ImportLeadsPage`, `CompanyBulkUpload`, `BulkUploadLayout` | Upload pattern, DataTable preview, Dialog, PageState | Medium | High | Forms, table, dialog, feedback | Not started | Parse/mapping/upload/error/progress behavior, large files, mobile |
| Quick add lead | `QuickAddLeadPage`, `QuickLeadModal` | Form layout, Field controls, Button, Dialog | Medium | Medium | Controls, forms, dialog | Not started | Validation, save, duplicate/error behavior, keyboard/mobile |
| User profile | `UserProfilePage` now consumes `FormSection`, `FormField`, `Input`, `Button`, `FieldDisplay`, `FieldMessage`, `PageHeader`, `Stack`; avatar upload moved to keyboard-accessible `ProfileAvatarField` (no nested interactives) | PageHeader, Card, Field, Button, FieldMessage | Medium | High | Forms, controls, cards, feedback | Completed 2026-07-24 (GO) | Verified: 38 focused tests (load prefs/fallback, avatar type/size + Storage sequence, profile validation/username query + permission skip, email reauth/errors/cancel, password branches/reset, password non-exposure, autocomplete, keyboard avatar, axe), full suite/coverage, route manifest, Chromium/Mobile Chrome, 1440/1024/412 px, git diff --check |
| Company settings | `CompanySettings` tabs and settings components | Tabs, PageHeader, Field family, Table, Dialog, PageState | High | High | Controls, forms, table, dialog, status | Not started | All save/integration/number/team/question tests and mobile |
| Super Admin `/super-admin/*` | feature-local view router, tables, forms, modals, analytics | Feature-owned router using layout/card/table/dialog/form system | High | High | All core families | Not started | Permissions, maintenance actions, integrations, analytics, desktop/mobile |
| Public application `/apply/:slug` | `PublicApplyHandler`, shared feature-coupled `Stepper`, step forms | Feature-owned wizard using Progress, Field, Button, Card, PageState | Critical | Very high | Forms, feedback, layout, compatibility plan | Not started | Draft/offline/upload/validation/submission/consent, full mobile E2E |
| Signing room `/sign/...` | specialized PDF/document-first workflow | Approved controls/states around feature-owned document canvas | Medium | Very high | Controls, dialog, feedback; signing QA | Not started | Existing signing unit/E2E, coordinates, zoom/touch/signature, mobile |
| Verification portal `/verify/:token` | `VerificationPortal` + status screens + 4 sections now consume `Card`, `FormSection`, `FormField`, `Input`, `Select`, `Textarea`, `FieldDisplay`, `FieldMessage`, `Badge`, `Button`, `Stack`; feature-local `RadioGroup` accessibility-hardened; `SignaturePad`/hook untouched | Card, form primitives, Badge, Button, layout | Medium | High | Forms, cards, feedback | Compatibility slice completed 2026-07-23 | Verified: 24 focused tests (hook token-load/submit contract + portal integration + status screens), full suite, coverage, callable-contract, Chromium/Mobile Chrome, 1440/1024/412 px, single h1 per state, radio grouping + keyboard, associated labels, validation focus, axe, overflow |
| Change review `/review-change/:token` | `ReviewChangePortal` now consumes `Card`, `Button`, `Input`, and `Stack`/tokens with one `<h1>`, `role="status"`/`role="alert"` states, and a tokenized feature-owned approve/reject/edit toggle group; load/validation/payload/callables unchanged | Card, Button, Input, layout | Medium | High | Forms, cards, feedback | Compatibility slice completed 2026-07-23 | Verified: 16 focused tests (token load/cancellation/errors, scalar/array/object/empty previews, no-pending/completed, action default/reject/edit/exclusivity/edit-hidden-for-nonscalar, exact approve/reject/edit payloads + order, submitting/disabled, success/error fallbacks, single h1, applicant-name non-disclosure, axe) + existing 3, full suite, coverage, callable-contract, Chromium/Mobile Chrome, 1440/1024/412 px, axe, overflow |
| Sandbox application | production-like application plus test controls | Production primitives with feature-owned sandbox controls | Low | Medium | Public-application migration | Not started | E2E fixtures, no production leakage, mobile |
| Sandbox transfer success | `SandboxTransferSuccess` now consumes `Card`, `Button`, `Badge`, `Stack`, and `Inline` with a single `<h1>`/`<main>` | Card, Button, Badge, layout primitives | Low | Low | Feedback, controls | Compatibility slice completed 2026-07-23 | Verified: name/id/final fallback, `New Application` status, Super Admin + Home navigation, single h1, keyboard actions, Chromium/Mobile Chrome, 1440/1024/412 px, axe, overflow |
| Driver dossier modal | feature-local shell/tabs/application/documents | Dialog family, Tabs, Card, Field display, PageState | High | High | Dialog, controls, feedback, layout | Not started | Focus, tabs, edits/uploads/actions, large content, mobile |
| PEV/VOE workflows | local modals/tabs/forms/previews | Dialog, Field, Button, Status, document layout | High | Very high | Dialog, forms, status | Not started | Lookup/request/save/send/preview/audit, keyboard/mobile |

### 5.2 Shared component-family inventory

| Family | Current implementation | Target | Priority | Risk | Dependencies | Status | Verification needed |
|---|---|---|---|---|---|---|---|
| Tokens | `shared/styles/designTokens.css`, direct Tailwind utilities | `design-system/tokens` semantic contract + temporary compatibility | Critical | Medium | Owner visual approval | Foundation complete; adoption not started | Contrast, build, desktop/mobile consumer visuals, legacy parity |
| Buttons | Button/IconButton primitives adopted by the Company shell; legacy raw buttons remain elsewhere | Button + IconButton | Critical | Medium | Tokens | In progress — primitive and Company consumer verified; catalog/ratchet remain | Variants/states, names, focus, touch, remaining consumers, approved visual baselines |
| Inputs | Shared InputField plus 155 raw inputs | Field/Input and compatibility adapter | Critical | High | Tokens, controls | Not started | Existing callbacks/files/errors/autofill/mobile keyboard |
| Select/textarea | 60 selects, 23 textareas, local styling | Select/Textarea under Field | High | Medium | Forms | Not started | Labels/errors/disabled/long content/mobile |
| Radio/checkbox | Shared/local radio and icon-based selection | Native-first Radio/Checkbox groups | High | High | Forms, table | Not started (DS primitive) — the application-questions slice uses a documented feature-level accessible `ToggleSwitch` (ARIA switch) and native compliance checkboxes as an interim until this primitive exists | Keyboard model, group naming, indeterminate selection |
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
| `campaigns/components/CampaignResultsTable.jsx` | Card + Input + Badge + semantic DS-token table (DataTable not a fit — see Phase 13 note) | High | Medium | Status adapter | Migrated 2026-07-24 (GO) | 10px/contrast headers fixed, labelled search, text+icon status, readable errors, preserved max-height scroll + sticky header |
| `campaigns/components/DetailedReportModal.jsx` | Shared accessible `Modal` + `Button`/`IconButton`/`Badge` + semantic DS-token table in a labelled keyboard-focusable scroll region (DataTable not adopted — same primitive-fit exception as the results table) | Medium | High | Dialog, status | Migrated 2026-07-24 (GO) | Focus trap/Escape/restore added, backdrop preserved, text+badge status, wrapping errors, internal scroll with no doc overflow, 17 unit + Chromium/Mobile Chrome + dialog-scoped axe |
| `company-admin/components/InlineLeaderboard.jsx` | Numeric compact DataTable | High | Medium | Metric formatting | Completed 2026-07-23 | Verified: representative/empty/error/retry unit states, header/cell end alignment under 1 px, compact density, long names, labeled mobile overflow, desktop/mobile axe |
| `settings/number-assignment/AssignmentTable.jsx` | DataTable with form controls | High | High | Select/Checkbox | Not started | Header/cell alignment, control labels, save states, mobile |
| `settings/questions/StandardQuestionsConfig.jsx` | Settings DataTable | Medium | High | Checkbox/Switch | Not started | Keyboard toggles, labels, sticky/overflow, mobile |
| `signing/components/EnvelopeHistory.jsx` | Approved `DataTable` (adopted — no max-height/sticky-header constraint and no exact loading string to preserve, so the results-table primitive-fit exception does not apply here) + `Badge`/`Button` with a feature-owned status adapter | Medium | High | Status, IconButton | Migrated 2026-07-24 (GO) | 5-column contract, row header + accessible per-row action names, text+icon status (never colour alone), announced loading/empty/error, labelled keyboard-focusable scroll region, 46 unit + 10 Chromium/Mobile Chrome E2E, 1440/1024/412 px, scoped axe |
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
| Company Profile — info | Approved `FormField`, `Input`, `FieldDisplay`, `FormSection`, `Card`, and `Button` replace local information-field/card/action styling | `saveCompanySettings`, nested contact/address/legal/application payload remain feature-owned and unchanged | Branding upload and application questions remain separate higher-risk slices | High / High | Compatibility slice completed 2026-07-23 | 17 focused tests, full suite, Chromium/Mobile Chrome, 1440/1024/412 px, payload parity, keyboard/focus, labels, axe, overflow passed |
| Company Profile — branding | Approved `Button` + `FieldMessage` and a labelled, keyboard-triggered file input replace the local `<label>`-wrapped hidden input and raw preview in `BrandingSection`; preview/fallback tokenized | `uploadCompanyLogo` Storage path `company_assets/{companyId}/logo.{ext}` and the `companies/{companyId}.companyLogoUrl` Firestore field via `saveCompanySettings` remain feature-owned and unchanged | Keyboard trigger, no nesting, alt text, uploading announcement, focus return, no client size/type validation (preserved) | High / High | Compatibility slice completed 2026-07-23 | 18 focused tests (9 UI/a11y, 5 upload integration, 4 Storage contract), full suite, coverage, Chromium/Mobile Chrome, 1440/1024/412 px, exact Storage/Firestore contracts, keyboard/focus, axe, overflow passed |
| Company Profile — questions | Standard config uses accessible `ToggleSwitch` (ARIA switch) rows in a `Card` with unique "Require X"/"Hide X" names; custom builder/editor use `Card`/`FormField`/`Input`/`Select`/`Button`/`IconButton`/`Badge` with labelled fields, named delete/option-remove/reorder controls, and a keyboard move-up/down alongside preserved native drag | `applicationConfig` `{required,hidden}` shape, `customQuestions` item fields, `crypto.randomUUID()`, DOT-delete `alert()`, inverse Lock/Protect mappings, and the `saveCompanySettings` pass-through remain feature-owned and unchanged | Switch semantics, required/hidden exclusivity, DOT-required protections, destructive actions | High / Very high | Migrated (GO) 2026-07-24 | 47 focused tests (standard defaults/exclusivity/payload, every custom type, UUID/defaults, label/help/options edit, type-change option init, add/remove, preview/edit, reorder, DOT delete + exact alert, compliance mappings), full suite/coverage, public-app regression, Chromium/Mobile Chrome, 1440/1024/412 px, axe, overflow, git diff --check passed |
| Team & Users | Add New User form now uses `FormSection`/`FormField`/`Input`/`Select`/`Button`; `ManageTeamModal` moved to the shared accessible `Modal` with `Card`/`Button`/`IconButton` and labelled goal inputs; `CompanySettings` permission gate and backend `hrAdmin.js` unchanged | `createPortalUser`/`deletePortalUser` callables, membership `onSnapshot` subscription, user/goal Firestore reads, `setDoc` goal-write, tracking-link construction, and clipboard/toast remain feature-owned and unchanged | Native-required create-user validation, password never logged/stored (`autocomplete=new-password`), admin gate, live subscription cleanup, goal `value||default` compatibility, fire-and-forget clipboard, destructive delete | High / Very high | Compatibility slice completed 2026-07-23 (both surfaces) | 25 focused tests (9 Add-User, 16 Manage-Team) + shell suite, full suite, coverage, callable-contract, Chromium/Mobile Chrome, 1440/1024/412 px, exact create/delete/goal/link contracts, permission gate, dialog name/close/Escape/backdrop/focus-restore, axe, overflow passed |
| Personal Profile in Company Settings | `FormField`, `Input`, `FormSection`, `Card`, and `Button` now replace local form/card/button styling | Direct user/recruiter-link Firestore reads/writes and clipboard copy remain feature-owned and unchanged | Broader settings forms remain locally styled | High / Low | First compatibility slice completed 2026-07-23 | 4 feature tests, 4 primitive tests, full suite, Chromium/Mobile Chrome, keyboard/focus, 1440/1024/412 px, axe passed |
| Email Settings | Approved `FormSection`, `FormField`, `Input`, `Textarea`, `Button`, `Badge`, `Card`, and `FieldMessage` replace the local status banner, SMTP fields, test/save buttons, and setup-guide chrome (provider instructions stay feature-owned) | `getEmailSettingsMeta`/`testEmailConnection`/`saveEmailSettings` callables, sanitized metadata load, and password-isolation rules remain feature-owned and unchanged | Secret/autofill handling, required validation, test/save distinction, long errors | High / Very high | Compatibility slice completed 2026-07-23 | 24 focused render + 12 existing logic tests, full suite, Chromium/Mobile Chrome, 1440/1024/412 px, secret-payload contract, label association, guide disclosure, axe, overflow passed |
| SMS / number assignment | Default-line select + editable recruiter matrix (`<select>` per row), verify buttons, diagnostic modal, save; renders alongside the shared secret-entry `LineManager` (out of scope) | `useLineAssignments` owns the `sms_provider` listener, roster join, one-time token backfill, `verifyLineConnection`, and token-based `saveSmsLineAssignments`; correctness depends on server-side token→phone resolution | Editable matrix (not a display table), DLP token redaction, markup-coupled 15-case safety suite, color-only status, 9/10 px status text, secret-entry entanglement | High / Very high | Deep-audited 2026-07-23; **not migrated (NO-GO)** — blocked on the editable-matrix responsive/interaction owner decision and unproven DataTable-for-form-controls fit | Owner decision on editable-matrix strategy; then per-row select labels, token-redaction save contract, verify/backfill/diagnostic callables, status text+tone, DataTable-with-controls parity, keyboard/mobile |
| Automated SMS | Approved `FormSection`, `FormField`, `Textarea`, `Button`, and `FieldMessage` replace the local heading/labels/textareas/save styling for three SMS-template textareas (`templateContactAttempt1/2/3`) and one save action | Three SMS-template textareas and one save action backed by a single Firestore document `companies/{companyId}/settings/automated_sms`; read/write remain feature-owned and unchanged | Template preservation, loading/error state, textarea description/limits | Medium / High | Compatibility slice completed 2026-07-23 | 12 focused contract tests, full suite, Chromium/Mobile Chrome, 1440/1024/412 px, label association, loading announce, save states, axe, overflow passed |
| Integrations | Facebook Lead Ads connection card: dynamic FB SDK load, `FB.login` popup, browser Graph API page lookup + first-page auto-select, `connectFacebookPage` callable; local-only Connected state | `connectFacebookPage` callable, `functions/integrations/facebook.js` token exchange/`integrations_index` write/webhook, feature-flag visibility | External SDK state, sensitive short-lived token, **tenant binding `companyId = request.auth.uid`**, non-persistent Connected state, no disconnect/reconnect | Medium / Very high | Deep-audited 2026-07-23; **not migrated (NO-GO)** — blocked on a tenant-binding correctness/security defect (`request.auth.uid` used as the company id, incompatible with the auto-id + membership multi-tenant model); presentation withheld so the UI does not imply the workflow is production-ready | Separate integration-correctness/security project to fix tenant binding; then SDK-load/login-scope/graph/first-page/callable mocks, token-safety, feature-flag/permission, connected-state, keyboard/mobile |
| Billing | Approved `FormSection`, `FieldDisplay`, `Badge`, and `FieldMessage` replace the local heading/card/plan/support styling | Plan value display only; `planType` read from the loaded profile, unchanged | Empty/long plan content and support messaging | Low / Low | Compatibility slice completed 2026-07-23 | 7 focused tests, full suite, Chromium/Mobile Chrome, 1440/1024/412 px, labelled plan/badge status, support copy, axe, overflow passed |
| `/company/profile` account profile/security | Approved `FormSection`, `FormField`, `Input`, `Button`, `FieldDisplay`, `FieldMessage`, `PageHeader`, `Stack` replace the local form/card/button styling; avatar upload moved to the keyboard-accessible `ProfileAvatarField` (visually hidden labelled input, `role="status"`, focus return, no nested interactives); autocomplete added | Firebase Auth profile/email/password, reauthentication, Storage `avatars/{uid}/{file.name}` upload, Firestore user writes/query all remain feature-owned and byte-for-byte unchanged | Passwords kept in transient state only; validation/error association; upload and reauth regressions | High / Very high | **Migrated (GO)** 2026-07-24 | 38 focused tests (load prefs/fallback, avatar type/size + exact Storage sequence, profile validation/username query + permission skip, email reauth/errors/cancel, password branches/reset, password non-exposure, autocomplete, keyboard avatar, axe), full suite/coverage, route manifest, Chromium/Mobile Chrome, 1440/1024/412 px, git diff --check passed; backend/callable/rules not applicable (no backend change) |

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

### Company Profile information compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: the Company Settings shell/navigation implementation was
  committed as `334b5c6` and its roadmap evidence as `d4e308b` before this
  slice began.
- Selected slice: only the nine Company information values and the shared
  edit/cancel/save presentation were migrated. Branding upload and application
  questions were excluded and remain unchanged.
- Component contract: added business-neutral `FieldDisplay` for labelled
  read-only values and reused `Card`, `FormSection`, `FormField`, `Input`, and
  `Button`. The design system contains no Company, Firebase, permission, save,
  validation, or upload behavior.
- Focused tests: 3 files passed, 17 tests passed, including the exact save
  payload, all nine field keys/values, cancel behavior, error behavior,
  company-admin permission, native label relationships, focus return, and axe.
- Design-system tests: 11 files passed, 47 tests passed.
- Full frontend gate: 85 files passed, 2 files skipped; 544 tests passed and 48
  emulator-dependent rules tests skipped by their existing environment guard.
- Frontend lint: passed with 0 errors and 169 existing warnings. No warning was
  added by this slice.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed; Vite transformed 2,637 modules. Existing stale
  Browserslist-data and chunk-size warnings remain.
- Chromium and Mobile Chrome regression: the combined Company information,
  settings navigation, and Personal Profile run passed 15 checks with 9
  intentional viewport-specific skips; the Company information spec
  contributed 5 passes and 3 skips.
- Behavior: existing data initialization, field names, state updates, admin
  edit permission, `saveCompanySettings(companyId, payload)`, nested
  contact/address/legal/application values, custom questions, logo URL, cancel
  behavior, and success/error messages are unchanged. Save payload parity is
  asserted directly.
- Desktop/laptop/mobile: manual rendered review passed at 1440×900, 1024×768,
  and 412×915 in display and edit states. Labels align, controls and actions
  are at least 44 px, long content wraps, address fields collapse to one mobile
  column, and no document, content, or nested horizontal overflow remains.
- Accessibility: Company Name receives visible focus on edit; native Tab order
  reaches all fields and actions; focus returns to Edit Profile after cancel or
  successful save. Unit axe reported no violations; scoped Chromium/Mobile
  Chrome axe reported no serious or critical violations.
- Visual regression: no durable screenshot baseline was claimed because the
  catalog/baseline ownership decision remains open; manual rendered review and
  deterministic Chromium/Mobile Chrome geometry assertions were completed.
- Backend/Firebase rules tests: not applicable; no backend, rules, database,
  storage, callable, integration, or Firebase contract changed.
- Diff review: `git diff --check` passed; generated `dist/`,
  `playwright-report/`, `test-results/`, and `firestore-debug.log` artifacts
  were removed; no unrelated source or backend file was included.
- Commit/PR: checkpoint `a0cefc3`.

### Company Settings Billing informational-card compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: the Company Profile information slice was committed as
  `a0cefc3` and its roadmap evidence as `2a06fa3` before this slice began.
- Audit: the Billing tab was informational only. It displayed a section
  heading, subtitle, a decorative credit-card glyph, the derived plan name
  (`planType === 'paid' ? 'Pro Plan' : 'Free Plan'`), and static
  contact-support guidance. It had no upgrade, cancel, or external billing
  action, no billing-specific permission or feature flag, no direct Firebase or
  callable read (it read the already-loaded `currentCompanyProfile.planType`),
  and no separate loading, empty, or error state.
- Selected slice: only the Billing informational card was migrated. The plan
  calculation, plan names, and support copy were frozen before presentation
  changed.
- Component contract: reused the business-neutral `FormSection`, `FieldDisplay`,
  `Badge`, and `FieldMessage`. No new design-system component was added. The
  card was extracted into a feature-owned `BillingTab`, matching the sibling
  tabs and enabling focused tests; the previously inline `SectionHeader`
  (used only by billing) was removed. The design system gained no Company,
  Firebase, plan, permission, or billing knowledge.
- Focused tests: 1 file passed, 7 tests passed, covering the paid Pro plan, a
  non-paid free plan, a missing `planType` fallback, a null profile, the
  labelled plan value, the preserved support message, and axe.
- Shell/design-system regression: the CompanySettings shell test (5) and the
  design-system gate (11 files / 47 tests) still pass unchanged.
- Full frontend gate: 85 files passed, 2 files skipped; 550 tests passed and 48
  emulator-dependent rules tests skipped by their environment guard. The
  pre-existing `playwrightConfig` resource-contention flake timed out once under
  parallel load and then passed 4/4 in isolation; no assertion in it changed.
- Frontend lint: passed with 0 errors on the changed files. Typecheck,
  production build, and `git diff --check` passed. The build emitted only the
  existing stale-Browserslist and chunk-size warnings.
- Chromium and Mobile Chrome regression: the Billing spec passed 5 checks with 3
  intentional viewport-specific skips.
- Behavior: the plan mapping, plan names, informational-only nature, contact
  support copy, tab identifier, settings shell, admin gate, routes, and all data
  behavior are unchanged. No new interactive control, validation, or business
  rule was introduced.
- Accessibility: the section is a labelled landmark with an `<h2>` heading; the
  plan value is a labelled `FieldDisplay` whose value is a tone-carrying `Badge`
  (success for Pro, neutral for Free), so plan status is communicated by text
  and tone rather than color alone. The heading is 16 px, the label 13 px, and
  the badge and support message 12 px, so no 9/10 px text was introduced. Unit
  axe reported no violations; scoped Chromium/Mobile Chrome axe reported no
  serious or critical violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed the labelled plan, subtitle, and guidance render, the card stays
  within the viewport, and no document, content, or nested horizontal overflow
  exists at any width.
- Visual regression: no durable screenshot baseline was claimed because the
  catalog/baseline ownership decision remains open; manual rendered review and
  deterministic Chromium/Mobile Chrome geometry assertions were completed.
- Backend/Firebase rules tests: not applicable; no backend, rules, database,
  storage, callable, integration, or Firebase contract changed.
- Diff review: `git diff --check` passed; generated `dist/` and `test-results/`
  artifacts remain gitignored and were not staged; no unrelated source or
  backend file was included.
- Commit/PR: checkpoint `a98954d`.

### Company Settings Automated SMS compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: the Billing card was committed as `a98954d` and its
  roadmap evidence as `00fd366` before this slice began.
- Roadmap correction: the section 5.4 inventory and section 8 previously
  described Automated SMS as a single-textarea screen. The screen actually
  edits three independent templates (`templateContactAttempt1`,
  `templateContactAttempt2`, `templateContactAttempt3`) through three textareas
  stored together in one Firestore document. The wording was corrected to
  "three SMS-template textareas and one save action backed by a single Firestore
  document" without changing any status merely for the correction.
- Audit / frozen contract: read
  `getDoc(doc(db, 'companies', companyId, 'settings', 'automated_sms'))` behind
  a `snap.exists()` guard, with each of the three templates falling back to `''`
  and a `cancelled` flag preventing post-unmount state updates; write
  `setDoc(<same path>, { templateContactAttempt1, templateContactAttempt2,
  templateContactAttempt3, updatedAt: serverTimestamp() }, { merge: true })`.
  Load-error, save-success, and save-error messages, the `{driver name}` and
  `{user name}` placeholders, and the SMS-integration/duplicate-send guidance
  were frozen before presentation changed.
- Component contract: reused the business-neutral `FormSection`, `FormField`,
  `Textarea`, `Button`, and `FieldMessage`. No new design-system component was
  added; no Firebase, SMS, template, or Company knowledge entered the design
  system. The three fields remain three independent textareas.
- Focused tests: 1 file passed, 12 tests passed, asserting the exact read path,
  all-three load, missing-document and missing-field empty fallbacks, unique
  programmatically associated ids, independent editing, the exact save
  path/payload/`serverTimestamp`/`{ merge: true }` contract, save disabled with
  `aria-busy` while saving, the save-success/save-error/load-error messages, the
  missing-`companyId` no-read/no-write guard, the unmount cancellation guard,
  and axe.
- Shell/design-system regression: the CompanySettings shell test (5) and the
  design-system gate (11 files / 47 tests) still pass unchanged.
- Full frontend gate: 87 files passed, 2 files skipped; 563 tests passed and 48
  emulator-dependent rules tests skipped by their environment guard. The
  `playwrightConfig` flake did not recur this run.
- Coverage gate: `vitest run --coverage` completed (26.64% statements, 24.70%
  branches, 25.72% functions, 27.24% lines); no threshold regressed.
- Frontend lint: passed with 0 errors on the changed files. Typecheck,
  production build, and `git diff --check` passed. The build emitted only the
  existing stale-Browserslist and chunk-size warnings.
- Chromium and Mobile Chrome regression: the Automated SMS spec passed 7 checks
  with 3 intentional viewport-specific skips, including loaded-form axe on both
  projects and an accessible-loading-status assertion. Because the offline E2E
  project has no emulator, the gating Firestore read rejects with `unavailable`
  only after the SDK's offline-detection delay (~20s), so the loaded-form waits
  are intentionally generous; this gating is the existing, preserved behavior.
- Behavior: the three template names, per-field state, Firestore read/write, the
  `automated_sms` tab id, admin gate, routes, toast behavior, and all messages
  are unchanged. No new interactive control, validation, or business rule was
  introduced.
- Accessibility: each textarea is programmatically associated with a stable
  unique label id; the heading is 16 px, description/inline-code/labels 13 px,
  and help text 12 px, so no 9/10 px text was introduced. The save button is the
  approved 44 px `Button` communicating saving via `aria-busy` and disablement;
  keyboard order runs template 1 → 2 → 3 → save; the loading state is an
  announced `role="status"`. Unit axe reported no violations; scoped
  Chromium/Mobile Chrome axe reported no serious or critical violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed three full-width labelled textareas, aligned labels, 44 px controls,
  wrapping, and no document, content, or nested horizontal overflow at any width.
- Documented behavior concern: when `companyId` is absent the existing guard
  performs no read and leaves the tab in its loading state; this pre-existing
  behavior was preserved unchanged and asserted, not altered by the visual slice.
- Backend/Firebase rules tests: the mocked Firestore contract is asserted in the
  focused unit tests; no emulator rules test was applicable because no rules,
  data shape, or backend behavior changed.
- Diff review: `git diff --check` passed; generated `dist/`, `test-results/`,
  and `playwright-report/` artifacts remain gitignored and were not staged; no
  unrelated source or backend file was included.
- Commit/PR: checkpoint `00fd311`.

### Company Settings Email Settings compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: the Automated SMS slice (`00fd311` feat, `171eecc` docs)
  was verified — both commits are linear descendants of `00fd366`, the working
  tree is clean, `git diff --check` is clean, and the Firestore contract matches
  the report — before this slice began. `origin/main` still ends at `00fd366`;
  the Automated SMS commits remain on local `main`, fast-forwardable, unpushed.
- Audit / frozen contract: the tab was audited in full — loading state, connection
  status banner, SMTP host/port/user/password, Test Connection, test-result
  display, signature textarea, and the expandable Gmail/Outlook/SendGrid guide.
  All three callables, the secret-isolation rules, validation, port conversion,
  verified-state invalidation, messages, and the graceful load-failure and
  missing-`companyId` behaviors were frozen before presentation changed.
- Go/no-go decision: the slice was judged safe to migrate whole because every
  callable is mockable, secret handling is verifiable, existing-password behavior
  is assertable, Test and Save are independently testable, and no backend or
  Cloud Function change is required. The three handlers were preserved
  byte-for-byte; only presentation changed.
- Component contract: reused `FormSection`, `FormField`, `Input`, `Textarea`,
  `Button`, `Badge`, `Card`, and `FieldMessage`. No new design-system component
  was added; no SMTP, email-provider, secret, Firebase, or Company knowledge
  entered the design system. Provider setup instructions remain feature-owned.
- Secret safety: no real secret exists anywhere in the change; the tests use the
  obviously-artificial `NOT_A_REAL_PASSWORD_test_value`. The component contains
  no hardcoded credential, the password input binds only to the always-empty
  `smtpPassInput`, and the saved password is never rendered or logged.
- Focused tests: 1 file passed, 24 tests passed (7 metadata-load, 8 manual-save,
  6 test-connection, 3 presentation/a11y — plus axe). The 12 existing email
  logic tests still pass.
- Shell/design-system regression: the CompanySettings shell test (5) and the
  design-system gate (11 files / 47 tests) still pass unchanged.
- Full frontend gate: 88 files passed, 2 files skipped; 587 tests passed and 48
  emulator-dependent rules tests skipped by their environment guard. No flake
  this run.
- Coverage gate: `vitest run --coverage` completed (27.26% statements, 25.42%
  branches, 26.13% functions, 27.89% lines); no threshold regressed.
- Frontend lint: passed with 0 errors on the changed files. Typecheck,
  production build, and `git diff --check` passed. The build emitted only the
  existing stale-Browserslist and chunk-size warnings.
- Chromium and Mobile Chrome regression: the Email spec passed 7 checks with 3
  intentional viewport-specific skips, including loaded-form axe on both projects
  and an accessible-loading-status assertion. Unlike the Firestore-gated
  Automated SMS tab, the metadata callable rejects quickly offline, so the form
  renders without a long wait.
- Server hygiene: the browser/Playwright checks ran against the live `vite dev`
  server on port 5000 (PID 9708), confirmed to be a dev server (not `vite
  preview`) in E2E test mode serving the current working tree — the `getEmailSettingsMeta`
  callable was invoked and the migrated form rendered. No unknown process was
  terminated.
- Accessibility: every SMTP field has an associated label; the password helper is
  connected via `aria-describedby`; Test and Save have distinct accessible names
  with `aria-busy`; the status banner and test result use Badge tone plus text
  (not color alone) with `role="status"`/`role="alert"`; the setup-guide toggle
  exposes `aria-expanded`/`aria-controls`; external links keep
  `rel="noopener noreferrer"`; keyboard order runs host → port → user → password;
  and all rendered text is ≥12 px. Unit axe reported no violations; scoped
  Chromium/Mobile Chrome axe reported no serious or critical violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed five labelled 44 px controls, distinct 44 px action buttons, a
  single-column mobile layout, wrapping, and no document, content, or nested
  horizontal overflow.
- Backend/Cloud Function tests: not applicable; no callable implementation,
  rules, data shape, or backend behavior changed. The callable request/response
  contracts are asserted in the focused render tests via mocks.
- Diff review: `git diff --check` passed; generated `dist/`, `coverage/`,
  `test-results/`, and `playwright-report/` artifacts were removed and remain
  gitignored; no unrelated source or backend file was included; no secret value
  entered any artifact.
- Commit/PR: checkpoint `9c05f9e`.

### Company Settings SMS / number-assignment deep-audit log (NO-GO)

- Date: 2026-07-23.
- Checkpoint boundary: verified before this audit — the four prior slice commits
  (`00fd311`, `171eecc`, `9c05f9e`, `d9839b1`) are a clean linear chain on
  `00fd366`, working tree clean, no tracked artifacts, `git diff --check` clean,
  and a repository secret scan of source/tests/docs found only the artificial
  `NOT_A_REAL_PASSWORD_test_value` and env placeholders. The four commits remain
  on local `main`, unpushed.
- Scope audited: `SmsSettingsTab` (composes the shared secret-entry `LineManager`
  plus `NumberAssignmentManager`), `useLineAssignments`, `NumberAssignmentManager`,
  `number-assignment/DefaultLineSection`, `number-assignment/AssignmentTable`,
  `number-assignment/AssignmentRow`, `SMSDiagnosticModal`, `utils/linePhone`, and
  the existing tests.
- Baseline: the existing suite passed unchanged — `NumberAssignmentManager.test.jsx`
  15 cases (A–O) + `SmsSettingsTab.test.jsx` 3 cases = 18 tests. No source was
  modified during the audit.
- Frozen Firestore contract (must be preserved by any future migration):
  live `onSnapshot(doc(db,'companies',{companyId},'integrations','sms_provider'))`;
  fields `isActive`, `inventory[]` ({ phoneNumber, lineId|id, label, usageType,
  hasDedicatedCredentials }), `assignments{uid→phone}`, `assignmentLineTokens{uid→token}`,
  `defaultPhoneNumber`, `defaultLineToken`, `config.defaultPhoneNumber`; roster from
  `memberships` where `companyId ==` then `users` by `documentId() in` batches of 30;
  and a second resolve pass for assignment-owner uids missing from the roster.
- Frozen callable contracts: `saveSmsLineAssignments({ companyId, assignmentTokens,
  [defaultToken] })` (empty `assignmentTokens` and no `defaultToken` = the one-time
  non-destructive token backfill); `verifyLineConnection({ companyId, phoneNumber })`
  → `{ identity, timestamp }`; diagnostic-modal `verifySmsConfig({ companyId })` →
  `{ message }` and `sendTestSMS({ companyId, testPhoneNumber, fromNumber|null })`.
  Save sends stable line **tokens**, never raw phone values.
- Frozen sensitive-value/redaction contract: `<select>` option VALUES are stable
  line tokens (lineId), never phone numbers, so selection survives browser/DLP
  layers that strip phone-like text; `MISSING_TOKEN='__missing__'` surfaces a
  configured-but-unsynced line; phone display is label-first; the save path maps
  tokens→phones server-side. No provider token/JWT/secret is handled by
  `NumberAssignmentManager` (that lives in the out-of-scope `LineManager` and is
  encrypted server-side, never echoed). Any tests must use artificial numbers
  such as `+15550000001` (the existing suite already does).
- Go/no-go: NO-GO for a single bounded migration now. Conditions largely met
  (callables/Firestore mockable, no backend/rule change, permissions/`isActive`
  gate preservable), but blocked by: (1) an **open owner decision** on the
  responsive/interaction strategy for an *editable* matrix — the approved
  DataTable is proven only for display tables, and §7 leaves per-table strategy
  undecided with "no safe universal conversion"; (2) unproven DataTable fit for
  per-row form controls + `MISSING_TOKEN` resilience options + verify actions
  (would need heavy feature-owned custom cells, minimal schema reuse);
  (3) a safety-critical, markup-coupled 15-case suite encoding SMS-sending
  correctness (E.164 normalization, token-vs-raw-phone under redaction, legacy
  `lnN` migration, roster-missing resolution, one-time backfill) that a
  presentation change would force rewriting; and (4) entanglement with the
  out-of-scope shared secret-entry `LineManager`. Per policy, no partial table
  conversion was forced. Known non-migration UI/a11y debt recorded for the future
  slice: unlabelled per-row and default-line selects, `text-[9px]`/`text-[10px]`
  status text, and color-only status dots.
- Outcome: marked audited-but-not-migrated; no source changed; this is a
  documentation-only checkpoint.

### Login/Auth compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: local `main` and `origin/main` both resolved to
  `9e9da5e` (the SMS number-assignment NO-GO checkpoint) with a clean working
  tree before this slice began. Work was done on the designated
  `claude/safehaul-design-system-g1vr3a` branch, which started at `9e9da5e`.
- Audit / frozen contract: `LoginScreen.jsx` was audited in full before any
  presentation change. The frozen behavior is: `loginUser(email, password)`;
  the `location.state?.from` requested-route redirect with `{ replace: true }`;
  the smart redirect using `getPortalUser`, `getMembershipsForUser`, and
  `user.getIdTokenResult()` — Super Admin via `claims.super_admin === true` or
  the `userDoc.role === 'super_admin'` Firestore fallback to `/super-admin`,
  company membership to `/company/dashboard`, and the no-membership fallback to
  `/`; authentication error mapping and the loading state; password visibility
  toggling; and the full reset workflow (login-email pre-fill,
  `resetPassword(resetEmail)`, empty-email validation, reset loading, success,
  error, and close/reset).
- Go/no-go decision: safe to migrate whole. The screen has no secrets, no
  destructive actions, and no editable table; the services are mockable at the
  feature boundary; every redirect branch and the reset workflow are assertable;
  and no route, role name, claim, permission, Firebase, or Cloud Function
  change is required. The two handlers (`handleSubmit`, `handleForgotPassword`)
  and all open/close/reset helpers were preserved logic-for-logic; only
  presentation and imports changed.
- Component contract: reused `FormField`, `Input`, `Button`, `IconButton`, and
  `Card` from the design system and migrated the password-reset overlay from a
  local `fixed inset-0` panel to the shared accessible `Modal`
  (`@shared/components/modals/Modal`). No new design-system component was added;
  no auth, redirect, role, or Firebase knowledge entered the design system.
- Reset modal migration: the local overlay was replaced by the shared Modal,
  which adds focus trap, Escape and backdrop dismissal, and focus restoration to
  the trigger while preserving the reset business logic and messages. Initial
  focus is placed on the reset email field; the dialog is named via
  `aria-labelledby` on the current heading. This removes one of the baseline
  local `fixed inset-0` overlays.
- Documented exceptions: the trailing password-reveal control is a feature-level
  `IconButton` positioned over the design-system `Input` (with inline
  `padding-inline-end`) because the form family has no input-adornment slot yet;
  the "Forgot password?", "Contact SafeHaul", and "Back to login" text links
  remain feature-level controls pending the Phase 3 link-style Button variant.
  Both are recorded here as temporary, bounded exceptions, not new primitives.
- Preserved presentation: the branded desktop marketing panel (SafeHaul
  navy/mint artwork, stats, DOT/FMCSA) is unchanged; the "Welcome Back" heading,
  "Sign In" label, and `you@example.com` / `Enter your password` placeholders
  that existing auth and access-control tests depend on are retained.
- Focused tests: 1 new file, 16 tests passed — labelled/autofill controls plus
  unit axe, the login service call, the requested-route/super-admin(claims)/
  super-admin(Firestore fallback)/company/root redirects, error + re-enable,
  the loading-disabled state, password visibility with an accessible pressed
  toggle, and reset open/pre-fill/focus, empty validation, success, failure, and
  both close paths. The 5 existing `src/tests/auth.test.jsx` tests still pass.
- Full frontend gate: 89 files passed, 2 files skipped; 603 tests passed and 48
  emulator-dependent rules tests skipped by their environment guard. The
  design-system, route (`app/routes`), and `modalAdoption` gates pass unchanged.
- Frontend lint: passed with 0 errors; warnings dropped from the 169 baseline to
  168 (the unused `Link` import was removed and none were added). Typecheck,
  production build, and `git diff --check` passed with only the pre-existing
  stale-Browserslist and chunk-size build warnings.
- Chromium and Mobile Chrome regression: the new `e2e/login.spec.cjs` passed 12
  checks with 4 intentional viewport-specific skips across both projects
  (autofill attributes, desktop keyboard order + visible focus + label/control
  alignment, password reveal/hide, reset dialog initial focus + Escape close +
  focus restoration, desktop marketing-panel visibility, tablet and mobile
  overflow, and scoped axe on the page and with the reset dialog open). The
  existing `e2e/access-control.spec.cjs` redirect-to-login regression passed on
  both projects.
- Server hygiene: the browser/Playwright checks ran against the live `vite dev`
  server on port 5000 in E2E test mode serving the current working tree; the
  pre-installed system Chromium was used via `PW_CHROMIUM_EXECUTABLE`. No
  unknown process was terminated.
- Accessibility: email and password have associated labels (via `FormField` and
  `Label`); required fields expose `aria-required`; the reveal control is a
  labelled `IconButton` with `aria-pressed`; the authentication error is a
  token-styled `role="alert"` banner (not color alone); the reset dialog uses
  the shared Modal's dialog semantics, focus trap, and restoration; keyboard
  order runs email → password → reveal → forgot → sign-in; and all interface
  text is ≥12 px. Unit axe reported no violations; scoped Chromium/Mobile Chrome
  axe reported no serious or critical violations on the page or with the reset
  dialog open.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed 44 px controls, a visible focus ring, the trailing reveal control
  clear of the masked value, a single-column mobile layout with the marketing
  panel hidden below `lg`, and no document, content, or nested horizontal
  overflow. The reset dialog is centered and constrained at all three widths.
- Backend/Cloud Function tests: not applicable; no callable implementation,
  rules, data shape, route, permission, or backend behavior changed.
- Diff review: `git diff --check` passed; only `LoginScreen.jsx` (feature),
  `LoginScreen.test.jsx`, `e2e/login.spec.cjs`, `src/design-system/README.md`,
  and this roadmap changed; generated artifacts were not committed; no secret
  value entered any artifact.
- Remaining Login/Auth work: adopt the Phase 3 link-style Button variant for the
  text links, add an input-adornment slot to the form family (to retire the
  feature-level reveal exception), and migrate the sandbox and verification/
  change-review edge screens.

### Company Profile branding-upload compatibility-slice completion log

- Date: 2026-07-23.
- Checkpoint boundary: `origin/main` at `db1d785` (the merged Login/Auth PR #78)
  with a clean working tree before this slice began. Work was done on the
  designated `claude/safehaul-design-system-g1vr3a` branch, restarted from
  `origin/main`.
- Audit findings: the logo control is a two-part feature composition.
  `BrandingSection.jsx` (presentation) received `companyLogoUrl`, `isEditing`,
  `logoUploading`, and `onLogoUpload`; the parent `CompanyProfileTab.jsx`
  (unchanged) owns `handleLogoUpload`. The pre-migration markup was a raw
  128 px preview (`<img alt="Logo">` or a `Building` fallback) plus, only in
  edit mode, a `<label>`-wrapped **`display:none`** `<input type="file"
  accept="image/*">`. Findings: (a) the file input was keyboard-**inaccessible**
  because `display:none` removed it from the tab order and the `<label>` is not
  focusable; (b) there is **no client-side file-type or file-size validation**
  anywhere (neither the component nor the `uploadCompanyLogo` helper) — the
  `accept="image/*"` attribute is the only filter; (c) clicking the preview does
  **not** open the picker; (d) the markup had **no nested buttons** (a label
  wrapping an input is valid); (e) uploading was not announced; accepted types
  and current/replacement state were not surfaced; the `alt` text was the
  generic "Logo".
- Exact Storage contract (frozen): `uploadCompanyLogo(companyId, file)` in
  `src/lib/firebase/storage.js` writes to
  **`company_assets/{companyId}/logo.{ext}`** where `ext` is
  `file.name.split('.').pop()`, then returns `getDownloadURL`. On failure it
  throws `File upload failed. Please try again.`; missing id/file throws
  `Company ID and file are required for upload.`. This helper is **shared** with
  Super Admin's `EditCompanyModal`, so it was not modified.
- Exact Firestore contract (frozen): the logo upload calls
  `saveCompanySettings(companyId, { companyLogoUrl: downloadURL })`, which does
  `updateDoc(doc(db,'companies',companyId), { companyLogoUrl })` — the single
  field **`companyLogoUrl`** on `companies/{companyId}`. Messages: success
  `Logo uploaded successfully!`; failure `Logo upload failed: {message}` via the
  feature toast (`role="alert"`). Permissions: the upload control shows only in
  edit mode, and edit is gated by `isCompanyAdmin` (company_admin claim or
  super_admin global role).
- Go/no-go decision: **GO**. Both contracts are fully understood and mockable,
  file behavior is preserved unchanged (no new validation), permissions are
  untouched, and no Storage-rule, Firestore-rule, or backend change is required.
  The Storage destination, Firestore field, upload payload, accepted formats
  (`image/*`), replacement behavior, and messages are all preserved.
- Presentation changes (only `BrandingSection.jsx`): the edit-mode trigger is
  now an approved keyboard-accessible `Button` (`variant="secondary"`,
  `loading={logoUploading}`) that opens a visually hidden but labelled native
  `<input type="file">` via a ref (`onClick`), so the input is no longer
  `display:none` and there are no nested interactive elements. Added: an
  `aria-label="Upload company logo"` on the input; a `FieldMessage` help line
  explaining current/replacement state and accepted types, associated via
  `aria-describedby`; a `role="status"` region announcing "Uploading company
  logo…"; focus return to the trigger after an upload settles; a meaningful
  `alt="Company logo"` and a `role="img"` "No company logo set" fallback; and
  `--ds-*` tokens replacing the gray/blue palette. Trigger text is
  "Upload logo" / "Change logo" / "Uploading…".
- Behavior preserved: the `onLogoUpload` change event is forwarded verbatim; the
  parent handler, `uploadCompanyLogo`, `saveCompanySettings`, the Storage path,
  the `companyLogoUrl` field, the toast messages, the admin gate, and the
  no-client-validation behavior are all unchanged. The prop interface is
  identical, so `CompanyProfileTab.jsx` and `CompanyInfoSection.jsx` were not
  modified.
- Documented exception: the design system has no approved file-input primitive
  yet (the forms family lists it as open), so this remains a feature-level
  composition using approved `Button`/`FieldMessage`. Recorded as a temporary,
  bounded exception, not a new primitive.
- Focused tests: 18 new — `BrandingSection.test.jsx` (9: existing-image render +
  alt, no-image fallback, labelled input + accepted types + described trigger,
  upload-vs-change label, keyboard trigger with no nesting, verbatim change
  forwarding, uploading announce + disabled, focus return, axe in both modes);
  `CompanyProfileTab.test.jsx` (5 added: exact Storage call + exact
  `{ companyLogoUrl }` Firestore payload + success + preview replacement,
  no-file no-op, failure message + previous-logo retention, disabled-in-flight,
  permission-gated absence); `storage.test.js` (4: exact
  `company_assets/company-1/logo.png` path, extension derivation, id/file guard,
  stable failure message). All pass.
- Full frontend gate: 91 files passed, 2 skipped; **621 tests passed** and 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate `vitest run --coverage` passed at 27.74% statements / 25.74% branches /
  26.34% functions / 28.41% lines — no threshold regressed.
- Lint (0 errors, 168 pre-existing warnings), typecheck, production build, and
  `git diff --check` passed with only the pre-existing stale-Browserslist and
  chunk-size build warnings.
- Chromium and Mobile Chrome regression: the new
  `e2e/company-settings-branding.spec.cjs` passed 12 checks with 6 intentional
  viewport-specific skips across both projects (labelled input + visible
  accepted types, keyboard-focusable trigger with visible focus and no nesting,
  desktop/tablet and mobile overflow, and scoped edit-mode axe). The existing
  `e2e/company-settings-company-info.spec.cjs` regression passed on both
  projects. The real upload was not triggered in E2E (it needs Firebase
  Storage); the exact contracts are locked by the vitest suite.
- Server hygiene: the browser checks ran against the live `vite dev` server on
  port 5000 in E2E test mode serving the current working tree; the pre-installed
  system Chromium was used via `PW_CHROMIUM_EXECUTABLE`. No unknown process was
  terminated.
- Accessibility: the file input is labelled and keyboard-operable via the
  Button; there are no nested interactive elements; the preview has meaningful
  alt / labelled fallback; accepted types and current/replacement state are
  visible and associated; uploading is announced via `role="status"`; errors and
  success use the existing `role="alert"` toast (text + not color-only); focus is
  visible and returns to the trigger after upload; the Button meets the standard
  control height. Unit axe reported no violations; scoped Chromium/Mobile Chrome
  axe reported no serious or critical violations in edit mode.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed the tokenized preview, a clear "Upload logo"/"Change logo" trigger,
  the visible accepted-types help, a single-column mobile identity card, and no
  document or nested horizontal overflow.
- Backend/Storage tests: no Storage rule, Firestore rule, data shape, or backend
  behavior changed. The Storage path and Firestore field contracts are asserted
  in the focused tests via mocks.
- Diff review: only `BrandingSection.jsx` (feature) plus the three test files and
  `e2e/company-settings-branding.spec.cjs` and this roadmap changed; the shared
  `uploadCompanyLogo` helper, `CompanyProfileTab.jsx`, and `CompanyInfoSection.jsx`
  were not touched; no generated artifact, real logo, credential, or production
  Storage URL entered any artifact (tests use `cdn.example.test`).
- Remaining Settings/Profile work: Company Profile application questions
  (switch semantics, required/hidden exclusivity, DOT protections, destructive
  actions), Team & Users, Integrations, and the `/company/profile`
  account-security screen — each a separate audited slice. A design-system
  file-input primitive would retire this slice's feature-level exception.

### Sandbox Transfer Success status-screen completion log

- Date: 2026-07-23.
- Checkpoint boundary: `origin/main` at `9d836b4` (the merged branding-upload
  PR #79) with a clean working tree before this slice began. Work was done on
  the designated `claude/safehaul-design-system-g1vr3a` branch, restarted from
  `origin/main`.
- Audit findings: `SandboxTransferSuccess.jsx` is a small public status screen
  on the public route `/sandbox/transfer-success` (`sandboxTransferSuccess` in
  `PUBLIC_FEATURE_ROUTE_MANIFEST`). It reads `useLocation().state` and derives
  `companyName = state?.companyName || state?.companyId || 'the selected company'`,
  shows an `<h1>` "Transfer complete", a sentence ending in the `New Application`
  status, and two actions — "Super Admin" → `navigate('/super-admin')` and
  "Home" → `navigate('/')`. The pre-migration markup used raw slate/green
  utilities, a monospace status pill, and two text-link `<button>`s below any
  reasonable touch-target size.
- Go/no-go decision: **GO**. Pure presentation with no data, callables,
  permissions, or backend; the fallback chain, status wording, and both
  navigations are trivially preservable and testable.
- Presentation changes (only `SandboxTransferSuccess.jsx`): the outer surface is
  a `Card as="main"` (single `<main>` landmark; public routes add no wrapping
  landmark) with a `Stack`/`Inline` layout; the icon is the same `Building2`
  presented in a success-tinted token badge (`bg-ds-status-success-bg` /
  `text-ds-status-success-fg`, aria-hidden); the status is now a neutral `Badge`
  (same "New Application" words); the two actions are approved `Button`s
  (primary "Super Admin", secondary "Home") at the standard control height; all
  colour/spacing/type use `--ds-*` tokens. The `<h1>` "Transfer complete" and
  the sentence copy are unchanged.
- Behavior preserved: the exact `companyName || companyId || 'the selected
  company'` fallback, the `New Application` status wording, both `navigate`
  destinations, the route path, and the screen copy. The route-manifest entry
  and `featureRegistry` named export were not touched.
- Components reused: `Card`, `Button`, `Badge`, `Stack`, `Inline` — no new or
  Sandbox-specific design-system component was added, and no business logic
  entered the design system. No documented exception was required.
- Focused tests: 1 new file, 9 tests passed — company name from state, company
  id fallback, final fallback text, `New Application` status, Super Admin
  navigation, Home navigation, a single level-1 heading, both actions as
  keyboard-operable typed buttons with focusability, and unit axe. The
  route-manifest contract tests (3) and design-system gates pass unchanged.
- Full frontend gate: 92 files passed, 2 skipped; **630 tests passed** and 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate `vitest run --coverage` passed at 27.8% statements / 25.81% branches /
  26.49% functions / 28.47% lines — no threshold regressed.
- Lint (0 errors, 168 pre-existing warnings), typecheck, production build, and
  `git diff --check` passed with only the pre-existing stale-Browserslist and
  chunk-size build warnings.
- Chromium and Mobile Chrome regression: the new
  `e2e/sandbox-transfer-success.spec.cjs` passed 7 checks with 3 intentional
  viewport-specific skips across both projects (heading/status/actions,
  keyboard-operable actions with visible focus, desktop/tablet and mobile
  overflow, and scoped axe).
- Server hygiene: the browser checks ran against the live `vite dev` server on
  port 5000 in E2E test mode serving the current working tree; the pre-installed
  system Chromium was used via `PW_CHROMIUM_EXECUTABLE`. No unknown process was
  terminated.
- Accessibility: exactly one `<h1>`; success is conveyed by the "Transfer
  complete" heading text (not colour alone); the company name uses
  `break-words`; both actions are real keyboard-operable buttons with a visible
  focus ring at the standard control height; reading order is main → icon
  (hidden) → heading → status sentence → actions; all text is ≥12 px. Unit axe
  reported no violations; scoped Chromium/Mobile Chrome axe reported no serious
  or critical violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed a centered card, the tokenized success icon badge, the neutral
  status badge inline in the wrapped sentence, side-by-side actions, and no
  document or horizontal overflow.
- Backend tests: not applicable; no data, route, permission, or backend behavior
  changed.
- Diff review: only `SandboxTransferSuccess.jsx` (feature) plus its test and
  `e2e/sandbox-transfer-success.spec.cjs` and this roadmap changed; no generated
  artifact, credential, or production URL entered any artifact (tests use
  `Acme Freight` / `cmp-12345`).
- Remaining edge screens: the sandbox application screen and the verification /
  change-review token result cards are still unmigrated.

### Public Verification Portal completion log

- Date: 2026-07-23.
- Checkpoint boundary: `origin/main` at `93aa651` (the merged Sandbox Transfer
  Success PR #80) with a clean working tree before this slice began. Work was
  done on the designated `claude/safehaul-design-system-g1vr3a` branch, restarted
  from `origin/main`.
- Audit findings: `/verify/:token` (public, token-based, no login) is an
  FMCSA 49 CFR §391.23 employer-verification form. Logic lives entirely in
  `hooks/useVerificationPortal.js`; the token comes from `useParams()`. Page
  states: loading, error, expired, already-completed, completed, and the main
  form. The main form has four sections (Employment, conditional Safety,
  Additional, Respondent + signature) with conditional sub-fields
  (`wasEmployed`, `subjectToDotTesting`, `hadDrugAlcoholViolations`,
  `hadAccidents`). Pre-migration a11y gaps: sibling `<label>`s not associated
  with controls, a custom `RadioGroup` with `sr-only` inputs and no
  fieldset/legend, no visible radio focus, no error association, and no
  validation focus move. There is no retry mechanism (load runs once on mount)
  and no separate duplicate-submit guard beyond the `submitting` flag + the
  completed transition.
- Exact token-load contract (frozen, unchanged): `httpsCallable(functions,
  'getVerificationRequest')({ token })` → `result.data`; `data.status ===
  'completed'` → already-completed, else stored as `verificationData`. Errors:
  `functions/deadline-exceeded` → expired; `functions/not-found` → "This
  verification link is invalid or has been removed."; otherwise `err.message ||
  'Failed to load verification request.'`. No token → "No verification token
  provided." An `?e2eVerify=mock` E2E path returns fixture data.
- Exact submission contract (frozen, unchanged): `httpsCallable(functions,
  'submitVerificationResponse')({ token, response: formData })` on a passing
  custom `validate()`; success → completed + scroll to top; failure →
  `err.message || 'Failed to submit response. Please try again.'`. The hook's
  boolean (`true`/`false`/`null`), string (`'yes'`/`'no'`/`'in_progress'`,
  select values), and empty-string field representations and the full 19-field
  `response` shape are asserted verbatim in tests.
- Go/no-go decision: **GO**. Both callables are mockable; every page and
  conditional state is testable; the custom validation and the shared
  `SignaturePad` are preserved unchanged; no backend, callable, or Firebase-rules
  change is required; and the whole workflow stays feature-owned.
- Presentation changes: `VerificationPortal.jsx` (tokenized page, `role="alert"`
  error summary that receives focus on a fresh validation failure, `Button`
  submit), `PortalStatusScreens.jsx` (each state is a `Card as="main"` with one
  `<h1>`, tinted status icon, and an inner `role="status"`/`role="alert"` live
  region), `ApplicantDetailsCard.jsx` (`Card` + `FieldDisplay`), the four
  sections (`FormSection` + `FormField` + `Input`/`Select`/`Textarea`, which now
  associate labels and errors), and `RadioGroup.jsx` (a11y-hardened in place).
- Behavior preserved: `useVerificationPortal.js` and `SignaturePad` were **not**
  changed; every `updateField(field, value)` call, `formData`/`formErrors` read,
  option value, placeholder, conditional guard, the `validate()` rules, the token
  footer display, and all user-visible messages are identical. Native `required`
  was deliberately **not** added (it would bypass the custom error summary and
  break the flow); required state is exposed via `aria-required` + a visual
  asterisk instead.
- Radio decision: no approved design-system radio primitive exists (Phase 4
  Radio/Checkbox is not started), so the feature-local `RadioGroup` was hardened
  in place — `<fieldset>`/`<legend>` grouping, native radios grouped by `name`
  (arrow-key nav preserved), a `focus-within` visible focus ring, and
  `aria-describedby` error/description association — and remains feature-owned.
  No competing design-system RadioGroup was created.
- Privacy/security: the route token is not logged, stored, or sent to analytics;
  no hidden backend fields were added; the public route stays unauthenticated and
  token validation is unchanged. All tests use artificial names, employers,
  phones, and tokens (`token-abc`/`token-xyz`, "Artificial Applicant",
  `555-000-1111`); no real data or token appears in any artifact.
- Focused tests: 24 new across 2 files. `useVerificationPortal.test.js` (10):
  exact token request, loading, valid/completed/not-found/expired/generic-failure
  loads, no-token guard, validation-blocked submit with exact `formErrors`, and
  the exact `{ token, response }` submit payload + completion + submit failure.
  `VerificationPortal.test.jsx` (14): token-from-route, single `<h1>` + applicant
  display, grouped radios with legend + preserved labels, conditional employment
  and drug/alcohol reveals, validation error summary receiving focus without
  submitting, full submit-to-success, the invalid-link error screen, loaded-form
  axe, and one-h1 + axe for all five status screens.
- Full frontend gate: 94 files passed, 2 skipped; **654 tests passed** and 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate `vitest run --coverage` passed at 28.68% statements / 26.62% branches /
  27.62% functions / 29.34% lines — no threshold regressed. The
  callable-contract check passed (`OK | mapped 101 | raw 101`); no backend
  changed.
- Lint (0 errors, 168 pre-existing warnings), typecheck, production build, and
  `git diff --check` passed with only the pre-existing build warnings.
- Chromium and Mobile Chrome regression: the extended
  `e2e/pev-request-and-portal-response.spec.cjs` passed 7 checks with 3
  intentional viewport-specific skips across both projects — the original
  mock-mode complete-response flow, a grouped keyboard-focusable employment
  question with visible focus, desktop/tablet and mobile overflow, and scoped
  loaded-form axe on both projects.
- Server hygiene: port 5000 was confirmed free before use; the browser checks
  ran against a fresh `vite dev` server in E2E test mode serving the current
  working tree via the pre-installed system Chromium (`PW_CHROMIUM_EXECUTABLE`).
  No unknown process was terminated.
- Accessibility: one `<h1>` per state; section `<h2>`s under it; radios grouped
  by `<fieldset>`/`<legend>` with visible focus and associated errors; text/date/
  select/textarea labels associated via `FormField`; `aria-required` on required
  controls; a focused `role="alert"` error summary on validation failure; status
  screens use `role="status"`/`role="alert"`; success and errors read as text,
  not colour alone; all interface text is ≥12 px. Unit axe reported no
  violations; scoped Chromium/Mobile Chrome axe reported no serious or critical
  violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed the branded header, the FMCSA banner + `FieldDisplay` applicant grid,
  tokenized sections, the untouched SignaturePad, a single-column mobile layout,
  and no document or horizontal overflow.
- Backend tests: not applicable; no callable implementation, Firestore/Storage
  rule, data shape, route, or token behavior changed. The callable request/
  response contracts are asserted in the focused tests via mocks.
- Diff review: only the nine verification presentation files (portal, status
  screens, applicant card, RadioGroup, four sections), the two new test files,
  and the PEV e2e spec changed; the hook and `SignaturePad` were untouched; no
  generated artifact, real token, or personal data entered any artifact.
- Remaining Verification work: adopting a design-system Radio/Checkbox primitive
  would retire the feature-local RadioGroup; the Change Review Portal
  (`/review-change/:token`) remains a separate, not-yet-migrated slice.

### Public Change Review Portal completion log

- Date: 2026-07-23.
- Checkpoint boundary: `origin/main` at `8a7fb70` (the merged Public Verification
  Portal PR #81) with a clean working tree before this slice began. Work was
  done on the designated `claude/safehaul-design-system-g1vr3a` branch, restarted
  from `origin/main`; the verification hook and shared `SignaturePad` were
  confirmed unchanged.
- Audit findings: `/review-change/:token` (public, token-based, no login) lets a
  driver approve/reject/edit recruiter-proposed changes. `ReviewChangePortal.jsx`
  reads the token from `useParams()`, supports `?e2eReview=mock`, loads via
  `getChangeReview({ token })`, initializes each pending change to `approve`, and
  submits via `submitChangeResolution({ token, resolutions })`. Render states:
  loading, load error, loaded review, no-pending, submitting, submission error,
  success. A backend `status: 'completed'` review surfaces as the no-pending
  state (the frontend derives no-work from `pending.length === 0`), which the
  migration preserves. There is no retry or expired-specific screen, and the
  frontend adds no missing-token guard (a missing token flows to the backend
  "Missing token." error) — both preserved. The persistent header `<h1>` is
  shown in every state. `applicantName` is returned by the callable but is **not
  rendered** by the UI; the migration preserves this non-disclosure on the public
  link.
- Exact load contract (frozen, unchanged): `httpsCallable(functions,
  'getChangeReview')({ token })` → `r.data` = `{ applicantName, status,
  changes[] }`; each change is `{ fieldKey, fieldLabel, originalValue,
  proposedValue, status, resolvedValue }`. The cancellation guard
  (`let cancelled = false; … if (cancelled) return; … return () => { cancelled =
  true; }`), the `String(proposedValue ?? '')` scalar init, the `isScalar`
  (null/undefined/non-object) and `previewValue` (`—` / `{n} item(s)` /
  `(updated)` / `String`) rules, and the `'This review link is invalid or has
  expired.'` frontend fallback are all unchanged. Backend-mapped messages
  ("Missing token.", "Too many requests. Please wait a moment.", "This review
  link is invalid.", "This review link has expired.") are surfaced verbatim and
  were not altered.
- Exact resolution/submission contract (frozen, unchanged): one resolution per
  pending change, in pending order — approve `{ fieldKey, action: 'approve' }`,
  reject `{ fieldKey, action: 'reject' }`, edit `{ fieldKey, action: 'edit',
  value }` (scalar → edited local value; non-scalar → proposedValue, which the UI
  prevents). `submitChangeResolution({ token, resolutions })`; success →
  `Thank you!` / `Your responses have been recorded.`; failure fallback →
  `Could not submit your review. Please try again.`. Duplicate submission is
  resisted by the existing `submitting` flag disabling the button.
- Go/no-go decision: **GO**. Load/submit contracts understood and mockable;
  scalar/non-scalar, all action values/payloads, and every status state are
  testable; validation and payload construction are preserved; no backend or
  Firebase-rules change is required; token privacy is intact.
- Presentation changes (only `ReviewChangePortal.jsx`): the page is a
  `Card as="main"` with a branded dark header (`<h1>`); loading is a
  `role="status"` region, load/submit errors a `role="alert"` box, and success /
  no-pending are `role="status"` regions; before/after now show visible
  `Current:`/`Proposed:` labels (understandable without relying only on
  strikethrough + arrow); the approve/reject/edit control stays a **feature-owned
  segmented toggle group** with `aria-pressed`, per-field `role="group"`
  labelling, icon + text (not colour alone), semantic status-token active tones,
  a `focus-visible` ring, and a ≥40 px touch target; the corrected-value control
  is the design-system `Input` (label association preserved via `aria-label`);
  the submit is a design-system `Button`; and the footer note moved from a raw
  `text-[11px]` to a supported ≥12 px token.
- Behavior preserved: all load/cancellation/init/`setAction`/`setValue`/`pending`
  filtering/`handleSubmit` logic, every action value, the exact payload shape and
  order, the callables, the token handling, the render-state precedence
  (loading → error → done → no-pending → form), and every user-visible message
  are identical. `functions/applicationChanges.js` was not modified.
- Decision-control decision: no approved design-system segmented/toggle-group
  primitive exists, and an approve/reject/edit control is domain-specific, so it
  remains feature-owned per the slice brief (no business-specific design-system
  component was created). A future design-system Radio/Checkbox or generic
  segmented-control primitive could inform a later refactor.
- Privacy/security: the route token is not logged, stored in local/session
  storage, or sent to analytics; no hidden backend fields were added; object- and
  array-valued changes are shown only as `(updated)` / `{n} item(s)` (contents
  never revealed); `applicantName` is not rendered; the route stays
  unauthenticated and token validation/expiration/rate-limiting are unchanged.
  All tests use artificial data (`tok-1`, "John Doe" asserted **not** rendered,
  `555…` mock numbers, `Jonathan`/`Sparks`).
- Focused tests: 16 (up from 3) — token-from-route + exact `getChangeReview`
  request + loading, single `<h1>`, applicant-name non-disclosure, pending-only
  display, empty/array/object previews without exposing contents + edit hidden
  for non-scalar, completed→no-pending state, approve-default + mutual exclusion,
  labelled corrected-value input, exact approve-default and edit/reject payloads
  in order, submitting-disabled + announcement, backend error message, generic
  load-error fallback, generic submission-error fallback, cancellation guard, and
  loaded-form axe. The existing PEV/route-manifest/design-system gates pass
  unchanged.
- Full frontend gate: 94 files passed, 2 skipped; **667 tests passed** and 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate `vitest run --coverage` passed at 28.71% statements / 26.72% branches /
  27.62% functions / 29.35% lines — no threshold regressed. The
  callable-contract check passed (`OK | mapped 101 | raw 101`); no backend
  changed, so backend unit tests were not required.
- Lint (0 errors, 168 pre-existing warnings), typecheck, production build, and
  `git diff --check` passed with only the pre-existing build warnings.
- Chromium and Mobile Chrome regression: the new
  `e2e/change-review-portal.spec.cjs` passed 7 checks with 3 intentional
  viewport-specific skips across both projects — the default-approve complete
  flow, a grouped keyboard-focusable decision control with visible focus,
  desktop/tablet and mobile overflow, and scoped axe on both projects.
- Server hygiene: port 5000 was confirmed free before use; the browser checks
  ran against a fresh `vite dev` server in E2E test mode serving the current
  working tree via the pre-installed system Chromium (`PW_CHROMIUM_EXECUTABLE`).
  No unknown process was terminated.
- Accessibility: one persistent `<h1>` across states; loading/success/no-pending
  use `role="status"`, errors use `role="alert"`; each change has a `role="group"`
  label; decision buttons expose `aria-pressed`, are keyboard operable with a
  visible focus ring and a ≥40 px target, and convey state by icon + text, not
  colour alone; before/after read via `Current:`/`Proposed:` labels; the
  corrected-value input is labelled; submit is disabled + announced while
  processing; long labels/values wrap; all interface text is ≥12 px. Unit axe
  reported no violations; scoped Chromium/Mobile Chrome axe reported no serious or
  critical violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed the branded header, the token-styled change cards with visible
  before/after labels and tinted active decisions, the corrected-value input, and
  a single-column mobile layout with no document or horizontal overflow.
- Backend tests: not applicable; no callable implementation, Firestore/Storage
  rule, data shape, route, or token behavior changed. The callable request/
  response contracts are asserted in the focused tests via mocks.
- Diff review: only `ReviewChangePortal.jsx` (feature), its test, and
  `e2e/change-review-portal.spec.cjs` changed; the backend
  `functions/applicationChanges.js` was untouched; no generated artifact, real
  token, or personal data entered any artifact.
- Remaining token/public-screen work: all three public token screens
  (`/verify/:token`, `/review-change/:token`, `/sandbox/transfer-success`) are
  now migrated. A design-system Radio/Checkbox or generic segmented-control
  primitive would let the verification RadioGroup and this decision control move
  out of feature ownership.

### Company Settings Team & Users completion log

- Date: 2026-07-23.
- Checkpoint boundary: `origin/main` at `c79a172` (the merged Change Review PR
  #82) with a clean working tree before this slice began; the Change Review
  backend was confirmed unchanged. Work was done on the designated
  `claude/safehaul-design-system-g1vr3a` branch, restarted from `origin/main`.
- Scope: one audited workflow with two presentation surfaces — the Add New User
  form (`TeamManagementTab.jsx`) and the Manage Team & Links modal
  (`ManageTeamModal.jsx`). Both migrated together (full GO). `CompanySettings.jsx`
  (permission gate + modal wiring) and `functions/hrAdmin.js` were not changed.
- Permission contract (frozen, unchanged): `CompanySettings` gates the route on
  `currentUserClaims?.roles?.[currentCompanyProfile?.id] === 'company_admin' ||
  currentUserClaims?.roles?.globalRole === 'super_admin'`, redirecting non-admins
  to `/company/dashboard`; `TeamManagementTab` keeps its own "Access Denied. Only
  Admins can manage the team." fallback. Neither was weakened or broadened.
- Exact create-user contract (frozen): `httpsCallable(functions,
  'createPortalUser')({ fullName, email, password, companyId:
  currentCompanyProfile.id, role })`. Role options unchanged (`hr_user` →
  "Recruiter (Standard)", `company_admin` → "Company Admin (Full Access)"); the
  backend-recognized `recruiter` is still not exposed. Success toast `User
  {fullName} created successfully!` + reset to `{ fullName:'', email:'',
  password:'', role:'hr_user' }`; failure `Failed to create user:
  {error.message}`. **Native `required`** is the form's validation (unlike the
  verification form) and was preserved via `FormField required`.
- Password-security contract (frozen + hardened): the password lives only in
  controlled component state for the callable; it is never logged (the catch
  logs the error object, not the password — asserted by test), never written to
  Firestore by the frontend, never in local/session storage or analytics, and is
  cleared on reset. Added `autocomplete="new-password"` on the password field and
  `autocomplete="off"` on name/email so the admin's own credentials are not
  autofilled into a create-other-user form. Tests use
  `NOT_A_REAL_PASSWORD_test_123`.
- Exact team-loading contract (frozen): reads `companies/{companyId}` →
  `companySlug = appSlug || companyId` (load failure warns, keeps fallback);
  `onSnapshot(query(collection(db,'memberships'), where('companyId','==',
  companyId)))` with unsubscribe on unmount; per membership reads
  `users/{userId}` (fallback `{ name:'Unknown', email:'No Email' }`) and
  `companies/{companyId}/team/{userId}` (defaults `callGoal:150`,
  `contactGoal:50` via `value || default`, so a stored zero still falls back —
  preserved).
- Exact goal-write contract (frozen): save-on-blur
  `setDoc(doc(db,'companies',companyId,'team',userId), { [field]: Number(value),
  updatedAt: new Date() }, { merge: true })`; failure → `alert('Error saving
  goal')`. No debounce/autosave introduced.
- Exact tracking-link contract (frozen): base `import.meta.env.VITE_DRIVER_APP_URL
  || window.location.origin`, trailing slash trimmed; link
  `{base}/apply/{companySlug}?recruiter={userId}`;
  `navigator.clipboard.writeText(link)` (fire-and-forget, not awaited) with
  `showSuccess('Custom recruiter link copied!')` always shown — the current
  clipboard-failure behavior (toast regardless) is preserved and locked by a
  rejection test.
- Exact delete-user contract (frozen): `window.confirm('Are you sure you want to
  remove {name || 'this user'} from the team?')`; `httpsCallable(functions,
  'deletePortalUser')({ userId, companyId })`; success `{name || 'User'} has been
  removed from the team.`; failure `Failed to remove user: {message}`;
  row-specific `deleteLoading`. Backend membership/claims/SMS-assignment/orphan
  cleanup is unchanged (callable not replaced with client-side deletion).
- Go/no-go decision: **GO for both surfaces**. Both callables and all Firestore
  reads/writes/subscription are mockable; password handling stays safe; the admin
  gate is untouched; goal-save, clipboard, and destructive delete are testable;
  the shared accessible `Modal` preserves title/description/close/Escape/backdrop/
  focus-trap/focus-restore; no backend or Firebase-rules change is required.
- Presentation changes: **Add New User** → `FormSection` + `FormField` +
  `Input`/`Select` + `Button`, associating labels/errors and keeping native
  required + the two role options; the denied state is tokenized. **Manage Team**
  → the local `fixed inset-0` overlay replaced by the shared `Modal` (named/
  described by its header, `IconButton` close, Escape + backdrop dismissal, focus
  trap, and focus restoration to "View All Team Members & Goals"); member rows are
  tokenized `Card`-like list items with truncating name/email, compact goal
  inputs now carrying member-specific `aria-label`s ("Daily dial/contact goal for
  {name}") and a visible focus ring, a `Button` copy control named "Copy tracking
  link for {name}", and a danger `IconButton` named "Remove {name} from the team"
  with row-specific loading. The former **8 px** "Dials"/"Contacts" labels are now
  a supported 12 px token.
- Behavior preserved: every callable/Firestore/subscription/clipboard/confirm
  operation, field names, payloads, defaults, messages, and the permission gate
  are identical; `CompanySettings.jsx` and `hrAdmin.js` were not modified.
- Components reused: `FormSection`, `FormField`, `Input`, `Select`, `Button`,
  `IconButton`, and the shared accessible `Modal`. No business concept
  (recruiter, membership, company role, Firebase) entered the design system, and
  no competing modal or form primitive was created.
- Focused tests: 25 new — `TeamManagementTab.test.jsx` (9: non-admin denial,
  initial values + exact two role options + default role, required/typed inputs +
  autocomplete, exact `createPortalUser` request, success toast + full reset with
  password cleared, disabled-while-creating, failure message + password absent
  from console/storage, Manage-Team open, axe) and `ManageTeamModal.test.jsx`
  (16: loading + memberships query + list, user/goal fallbacks, stored goals with
  unique labels, empty state, snapshot unsubscribe on unmount, goal save-on-blur
  exact path/`Number`/`updatedAt`/merge, goal-save alert, exact tracking link with
  env base + trailing-slash trim + origin/slug fallback, clipboard-rejection
  still-toasts, delete confirm/cancel/exact request/failure/row-loading/other-rows-
  operable, dialog name+description+close+Escape+backdrop, axe). The existing
  `CompanySettings.test.jsx` shell suite (which mocks the tab/modal) still passes.
- Full frontend gate: 96 files passed, 2 skipped; **692 tests passed** and 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate `vitest run --coverage` passed at 29.4% statements / 27% branches / 28.34%
  functions / 30.1% lines — no threshold regressed. The callable-contract check
  passed (`OK | mapped 101 | raw 101`).
- Backend tests: the `functions/test/unit/createPortalUser.test.js` jest suite
  could **not run** in this environment (jest is not installed under `functions/`);
  recorded honestly. No backend code was changed, so `hrAdmin.js` behavior is
  unchanged and the callable-contract check covers the export mapping.
- Lint (0 errors, 168 pre-existing warnings), typecheck, production build, and
  `git diff --check` passed with only the pre-existing build warnings.
- Chromium and Mobile Chrome regression: the new
  `e2e/company-settings-team.spec.cjs` passed 9 checks with 3 intentional
  viewport-specific skips across both projects — labelled/required form with safe
  autocomplete, desktop keyboard order + visible focus, the Manage Team dialog
  opening with an accessible name/description and restoring focus to the trigger
  on Escape, desktop/tablet and mobile overflow, and scoped axe on both projects.
- Server hygiene: port 5000 was confirmed free before use; the browser checks ran
  against a fresh `vite dev` server in E2E test mode serving the current working
  tree via the pre-installed system Chromium (`PW_CHROMIUM_EXECUTABLE`). No
  unknown process was terminated.
- Accessibility: each surface has a clear heading; all create-user inputs are
  labelled with programmatic required state and correct autocomplete; the password
  is never surfaced in helper text; goal inputs carry unique member+type labels
  and stay keyboard editable with visible focus; copy/delete controls have
  member-specific accessible names; status/actions use icon + text, not colour
  alone; the modal is a named/described focus-trapped dialog; touch targets meet
  the control minimum; the 8 px goal labels are now ≥12 px. Unit axe reported no
  violations; scoped Chromium/Mobile Chrome axe reported no serious or critical
  violations.
- Visual/mobile review: rendered review at 1440×900, 1024×768, and 412×915
  confirmed the tokenized Add New User form (labelled 2×2 grid, required markers,
  primary action), the shared-Modal Manage Team dialog (named header, close,
  scrollable body, empty state), a single-column mobile layout, and no document or
  horizontal overflow.
- Diff review: only `TeamManagementTab.jsx`, `ManageTeamModal.jsx`, their two new
  tests, and `e2e/company-settings-team.spec.cjs` changed; `CompanySettings.jsx`
  and `functions/hrAdmin.js` were untouched; no generated artifact, real password
  (only the artificial `NOT_A_REAL_PASSWORD_test_123`), email, token, or personal
  data entered any artifact.
- Remaining Team & Users work: none for these two surfaces — the area is complete.
  Broader Settings/Profile work (Integrations, Company Profile application
  questions, `/company/profile` account security) remains separate.

### Company Settings Integrations deep-audit log (NO-GO)

- Date: 2026-07-23.
- Checkpoint boundary: `origin/main` at `3bb5f9c` (the merged Team & Users PR
  #83) with a clean working tree; the Team & Users slice was confirmed not to
  have touched `CompanySettings.jsx` or `functions/hrAdmin.js`. This is an
  audit/documentation-only checkpoint — **no source or presentation file was
  changed**.
- Scope audited: `src/features/settings/components/IntegrationsTab.jsx`,
  `CompanySettings.jsx` (feature-flag visibility + admin gate),
  `functions/integrations/facebook.js` (`connectFacebookPage`,
  `facebookWebhook`/`facebookWebhookV1`, `processLead`), `functions/index.js`
  export mapping, `docs/callable-frontend-map.md`, and the company/membership/
  lead architecture.
- Settings-visibility contract (frozen): the Integrations nav item shows only
  when `currentCompanyProfile?.features?.callTracking !== false`
  (`CompanySettings.jsx`); the standard admin gate + `/company/dashboard`
  redirect apply. Unchanged.
- SDK-loading contract (frozen): on mount, if `window.FB` exists →
  `setIsSdkLoaded(true)` and no script insertion; otherwise assign
  `window.fbAsyncInit` calling `window.FB.init({ appId:
  import.meta.env.VITE_FACEBOOK_APP_ID, cookie: true, xfbml: true, version:
  'v19.0' })` then `setIsSdkLoaded(true)`, and inject a `<script
  id="facebook-jssdk" src="https://connect.facebook.net/en_US/sdk.js">` before
  the first `<script>` (skipped when the id already exists). Audit notes (not to
  be "fixed" in a presentation slice): if no first `<script>` exists,
  `fjs.parentNode` throws; if the script tag exists but `window.FB` never
  initialized, `isSdkLoaded` stays false with no retry; unmount before
  `fbAsyncInit` fires can call `setIsSdkLoaded` after unmount; and the effect
  overwrites any pre-existing `window.fbAsyncInit` (no coordination with other
  consumers).
- Login/scopes contract (frozen): not-ready → `showError('Facebook SDK not
  loaded yet. Please refresh.')`; otherwise `setConnecting(true)` then
  `window.FB.login(cb, { scope: 'pages_show_list,pages_read_engagement,
  leads_retrieval,pages_manage_metadata,pages_manage_ads' })`. On
  `response.authResponse` → pass `response.authResponse.accessToken` onward; else
  `setConnecting(false)` and, when `response.status !== 'unknown'`,
  `showError('Facebook login failed or was cancelled.')` ('unknown' = silent
  popup close).
- Graph-API/page-selection contract (frozen): the browser fetches
  `https://graph.facebook.com/v19.0/me/accounts?access_token={shortLivedUserToken}`,
  parses JSON, expects `data[]`, throws `No Facebook Pages found for this user.`
  when empty, and **auto-selects `pagesResp.data[0]`** (no picker, no sort/filter
  — a first-page-only behavior recorded here explicitly).
- Callable contract (frozen): `httpsCallable(functions, 'connectFacebookPage')({
  shortLivedUserToken, pageId: pageToConnect.id, pageName: pageToConnect.name })`;
  success → `setConnectedPage(pageToConnect.name)` +
  `showSuccess('Successfully connected Facebook Page: {pageName}')`; failure →
  `console.error(error)` + `showError(error.message || 'Failed to connect
  Facebook Page.')`; `connecting` resets in the `finally`.
- Token-security contract: the frontend uses only the public
  `VITE_FACEBOOK_APP_ID`; no `FACEBOOK_APP_SECRET`/`FACEBOOK_VERIFY_TOKEN`, no
  token exchange, and no long-lived/page tokens exist in the browser (verified by
  `grep`). The short-lived token flows into the Graph fetch and the callable and
  must never reach console/toast/tests/screenshots/logs — a constraint any future
  GO slice must keep.
- Connected-state limitation (frozen, must not be masked): `connectedPage` lives
  only in local React state — it is not loaded from Firestore or a callable, is
  lost on refresh, has no disconnect/reconnect flow, and renders a disabled
  "Connected" button after success. A presentation migration must not imply
  persistence.
- **Tenant-binding audit (the blocker):** `connectFacebookPage` derives
  `const companyId = request.auth.uid;` (the backend comment itself says
  "Assumes 1:1 user-company mapping for simplicity"). It then writes
  `integrations_index/{pageId}` with `companyId = uid`, and the webhook
  `processLead` ingests each lead to `companies/{companyId}/leads` with that same
  `uid`. But SafeHaul is explicitly multi-tenant: companies are created via
  `addDoc(collection(db,'companies'), { ownerId: user.uid, … })` so the company
  **document id is an auto-generated Firestore id, not the owner's uid**; users
  are linked to companies through the `memberships` collection and
  `roles[companyId]` custom claims; and every lead consumer reads
  `companies/{realCompanyId}/leads` (e.g. `useCompanyDashboard.js`,
  `QuickLeadModal`, `LeadAssignmentModal`, `useSystemHealth`). The
  `IntegrationsTab` receives **no** `companyId` prop and the callable payload
  carries none, so the binding is entirely `uid`-derived. Consequence: connected
  Facebook leads would be written to `companies/{uid}/leads` — a path that is not
  the user's real company doc — so they would never reach the intended company's
  dashboard, and a page-to-tenant mapping keyed on `uid` breaks for any
  membership/multi-company user. `request.auth.uid` is therefore an incompatible
  (legacy one-user/one-company) assumption, not the intended company identifier.
- Go/no-go decision: **NO-GO.** Per the tenant-binding rule, the tenant binding
  is incompatible with the multi-tenant company model, so: no backend change is
  made here; the presentation is **not** migrated (polishing the card would imply
  a production-ready workflow it is not); and this defect is handed off to a
  separate integration-correctness/security project with its own scope, tests,
  and security review. The SDK-load edge cases and the non-persistent
  connected-state are secondary reasons the card should not be presented as
  finished.
- Verification performed for this audit: full frontend suite passed unchanged
  (96 files / 692 tests, 48 emulator-gated rules skipped); frontend lint 0
  errors; the callable-contract check passed (`OK | mapped 101 | raw 101`) and
  `connectFacebookPage` is exported from `functions/index.js`; no Facebook secret
  appears in `src/`; no real Facebook login/Graph request was made. No Facebook
  backend unit test exists under `functions/test`, and the `functions` jest
  runner is not installed in this environment — recorded honestly. Working tree
  contained only this roadmap documentation change.
- Outcome: Integrations marked deep-audited-but-not-migrated (NO-GO); no source
  changed; contracts frozen above for a future slice once the tenant binding is
  corrected under a separate security-reviewed project.

### Company account profile & security completion log (GO)

- Date: 2026-07-24.
- Starting baseline: `main` at `b47874b` (Merge PR #84 — Integrations
  deep-audit NO-GO). Local branch started clean at that commit.
- Scope: `/company/profile` → `UserProfilePage`. Application questions and
  Integrations were explicitly excluded from this diff.
- Go/no-go decision: **GO.** Every Auth, Storage, and Firestore contract is
  mockable and testable without any backend or rules change. No callable, rule,
  route, permission, or data-shape change was needed or made.
- Audited contracts, all preserved verbatim:
  - Initial load: Auth `currentUser` base values, `getPortalUser(uid)`,
    Firestore `name || displayName` preference, Firestore `photoURL`
    preference, username load, and `newEmail` initialized to `currentUser.email`.
  - Avatar: size `< 2 MB` check first, then `image/*` type check, both with
    their exact messages; Storage path `avatars/{uid}/{file.name}`;
    `uploadBytes` → `getDownloadURL` → Auth `updateProfile({ photoURL })` →
    Firestore `users/{uid}.photoURL`; existing success/failure toasts.
  - Profile save: empty display-name validation; best-effort username
    uniqueness query; permission-denied uniqueness check skipped (not blocking)
    with the SEC-002 comment retained; Auth display-name update only when the
    value changed; Firestore `{ name, username }` write; existing messages.
    Username uniqueness remains **not** server-enforced (unchanged).
  - Email change: new-email + current-password requirement; same-email
    cancellation; `EmailAuthProvider.credential(currentUser.email, password)`;
    `reauthenticateWithCredential`; `updateEmail`; Firestore
    `users/{uid}.email`; the four error mappings (wrong password, email in use,
    requires recent login, generic); cancel/reset restoring the current email
    and clearing the password.
  - Password change: current+new requirement; confirmation match; six-character
    minimum; reauthentication with current email+password; `updatePassword`;
    full field reset on success; existing messages and loading states.
- Presentation changes: the screen now consumes `FormSection`, `FormField`,
  `Input`, `Button`, `FieldDisplay`, `FieldMessage`, `PageHeader`, and `Stack`
  with `--ds-*` tokens. The nested/clickable avatar surface (clickable wrapper +
  hover overlay + nested corner `<button>` + hidden input) was replaced by a
  single keyboard-accessible `ProfileAvatarField` trigger with a visually hidden
  labelled input, a `role="status"` upload announcement, and focus return; no
  nested interactive elements remain. Correct autocomplete was added: email
  `email`, all current-password fields `current-password`, and the new/confirm
  password fields `new-password`.
- Sensitive-data handling: passwords stay only in transient component state and
  are never written to logs, Firestore, Storage, analytics, or browser storage;
  a test asserts non-exposure. All test/E2E credentials are artificial.
- Focused tests: 2 files passed, 38 tests
  (`UserProfilePage.test.jsx` 29, `ProfileAvatarField.test.jsx` 9).
- Full frontend coverage gate: 98 files passed, 730 tests passed; 2 files / 48
  emulator-dependent rules tests skipped by their existing environment guard.
  Coverage was 30.6% statements, 27.75% branches, 29.1% functions, 31.37% lines.
- Route-manifest tests: `appRouteManifest.test.js` passed within the suite.
- Frontend lint: passed with 0 errors and 166 pre-existing warnings.
- Typecheck: passed (`tsc -p jsconfig.json --noEmit`).
- Production build: passed.
- Playwright, Chromium + Mobile Chrome (`company-profile-security.spec.cjs`):
  9 passed, 3 intentionally skipped because each keyboard/geometry assertion
  only applies to its matching viewport.
- Accessibility: unit `vitest-axe` reported no violations on the page and the
  avatar component; scoped real-browser axe reported no serious or critical
  violations.
- Visual review at 1440×900, 1024×768, and 412×915 (plus the desktop email-edit
  state): no document-level horizontal overflow at any width; single-column
  mobile layout; 44 px controls; visible focus; labelled fields.
- Backend/callable/rules checks: not run and not applicable — this diff changes
  no Cloud Function, callable payload, or rule; `functions/node_modules` is not
  installed in this environment, so backend lint was not run (recorded honestly).
- Diff review: `git diff --check` passed; the changed file plus the two new test
  files, the new avatar component, and the new E2E spec contain no unrelated
  application/backend changes.
- Avatar initials robustness: because the initials prop is evaluated eagerly
  (regardless of whether a photo exists), `getInitials` was made trim-safe so a
  whitespace-only name cannot throw. This restores the original property that a
  photo-backed account always renders its image and never crashes; normal-name
  output ("John Doe" → "JD") is unchanged. Locked by a regression test.
- Commit/PR: feature commit + docs commit on
  `claude/company-profile-security-migration-mjdbm1`; PR into `main`.

### Company Profile application-questions completion log (GO)

- Date: 2026-07-24.
- Starting baseline: `main` at `e470318` (Merge PR #85 — account profile/security).
- Scope: the Company Profile → "Application Form Questions" tab only
  (`StandardQuestionsConfig`, `CustomQuestionsBuilder`, `QuestionEditor`,
  `OperationalSettingsSection`). No other feature touched.
- Go/no-go decision: **GO.** The migration is presentation/accessibility only
  and preserves the saved data shape exactly, so it needs no backend, rules, or
  public-application-schema change. Consumer audit confirmed the frozen shape:
  `applicationConfig` `{[fieldId]:{required,hidden}}` (read by 5 driver-app steps
  and `buildApplicationDoc`, gated by the `publicProfileDto` allowlist) and
  `customQuestions` items (`id/key/type/label/options/required/dotRequired/
  helpText/min/max`, consumed by the Stepper merge, `DynamicQuestionsStep`, and
  the PDF generator via `customAnswers`).
- Reordering: **partial-to-full GO.** Native mouse drag is preserved verbatim; a
  keyboard-accessible move-up/down was added. Both mutate the same array-order
  format `onChange` already emits, so the saved `customQuestions` order format is
  provably unchanged (locked by tests). No NO-GO was required.
- Preserved contracts: standard required/hidden exclusivity and the exact
  `{required,hidden}` payload; all standard ids/labels/defaults; custom-question
  `crypto.randomUUID()` creation and `INITIAL_QUESTION_STATE` defaults; every
  question type; option add/remove/edit and the `Option N` naming;
  `hasOptions`-driven `['Option 1']` initialization on type change; preview/edit
  mode; DOT-required deletion protection with the exact alert text; the inverse
  `canCompanyHide`/`canCompanyModify` checkbox mappings; and the
  `applicationConfig`/`customQuestions` pass-through via `saveCompanySettings`.
- Accessibility: standard toggles are ARIA switches with unique "Require X"/
  "Hide X" names and `aria-checked` (state not by color alone); every editor
  field has an associated label; delete, option-remove, and reorder are named
  IconButtons; the preview mock inputs are `aria-hidden`. No approved DS
  Switch/Checkbox primitive exists, so the `ToggleSwitch` and native compliance
  checkboxes are documented feature-level compositions (Radio/checkbox item).
- Focused tests: 5 files / 47 tests (4 new question files / 35 + the unchanged
  CompanyProfileTab 12).
- Full frontend coverage gate: 102 files / 766 tests passed; 2 files / 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  31.39% statements / 28.63% branches / 30.65% functions / 32.2% lines.
- Public-application regression: `Step3_License` and `PublicApplyHandler` tests
  passed (they exercise `applicationConfig` gating and profile projection).
- Frontend lint: 0 errors (163 pre-existing warnings); typecheck, production
  build, and `git diff --check` passed.
- Playwright (`company-settings-questions.spec.cjs`), Chromium + Mobile Chrome:
  9 passed, 3 intentional viewport-specific skips.
- Accessibility checks: unit `vitest-axe` clean; scoped real-browser axe found no
  serious or critical violations (one real contrast finding was fixed by moving
  the compliance note off the subtle background onto the card surface).
- Visual review at 1440×900, 1024×768, and 412×915 (standard config + a custom
  question with the options editor): no document-level horizontal overflow;
  standard rows stack with inline Required/Hidden captions on mobile.
- Backend/callable/rules checks: not applicable and not run — no Cloud Function,
  callable, or rule changed; `functions/node_modules` is not installed here, so
  the `publicProfileDto` Jest guard and backend lint were not run (recorded
  honestly). The frontend-side public consumers are covered by the regression
  above.
- Pre-existing latent behavior left unchanged (documented, not fixed here): the
  `publicProfileDto` allowlist strips `addressHistory`/`employmentHistory`/
  `referralSource`/`mvrConsent` config, so those standard toggles do not
  currently take effect in the public application (`mvrConsent` is unused). This
  is a separate backend/allowlist concern; the data-shape-preserving UI does not
  introduce or change it.
- Commit/PR: feature commit + docs commit on
  `claude/company-profile-security-migration-mjdbm1`; PR into `main`.

### E-Docs envelope history completion log (GO)

- Date: 2026-07-24.
- Starting baseline: `main` at `e8f5cb1` (Merge PR #98 — LaunchPad dismissal
  hardening). PR #98's final head `19d6df7` had all 8 CI lanes green, so nothing
  needed resolving before starting.
- Scope: `src/features/signing/components/EnvelopeHistory.jsx` only.
  `DocumentsManager`, `EnvelopeCreator`, `TemplatesPanel`, `SendTemplateModal`,
  backend functions, Firestore rules and Storage rules were not touched.
- Go/no-go decision: **GO.** The full data and action contract was frozen before
  any presentation change: a `signing_requests` `onSnapshot` subscription ordered
  by `createdAt desc`, a direct `updateDoc` void write, and two callables
  (`getSigningLink`, `getSignedDocumentUrl`). All three are mockable, the change
  is presentation-only, no permission or rule is involved, and the component's
  single consumer (`DocumentsManager`) passes exactly `companyId` + `onCorrect`,
  which is unchanged.
- `DataTable` adoption is a genuine fit here, explicitly unlike
  `CampaignResultsTable`/`DetailedReportModal`: this table has no max-height
  vertical scroll and no sticky header needing a definite-height ancestor, and no
  exact loading string had to be preserved (the old loading state was a bare
  unannounced spinner). So `DataTable`'s built-in `isLoading`, `empty`, `error`
  and horizontal scroll region cover every state — note that the design system
  has no `PageState` primitive, contrary to the older Phase 13 column text.
- Preserved contracts: the exact `companies/{companyId}/signing_requests` query
  and `orderBy('createdAt','desc')`; the unsubscribe on unmount; the
  `if (!companyId) return` guard placed *before* `setLoading(true)` (so with no
  company the table stays in its loading state, exactly as before); the
  `{status:'voided', voidedAt: serverTimestamp()}` write and its document path;
  the verbatim `window.confirm` text including the `"this document"` fallback;
  `getSigningLink({companyId, requestId})` and the clipboard write;
  `getSignedDocumentUrl({storagePath})` with the `gs://` bucket-prefix stripping,
  the `signedPdfUrl || storagePath` source, and `window.open(url,'_blank')`;
  every toast string and the `functions/not-found` mapping; the locally-obtained
  `getFunctions()` in both handlers; the case-sensitive `status === 'signed' |
  'voided' | 'sent'` action-visibility rules (deliberately left case-sensitive
  while the badge lowercases — pre-existing behavior, not changed here); the
  `emailStatus === 'failed'` override with its 80-character truncation and
  `'Email delivery failed'` fallback; the delivery-method rules
  (`sendEmail === false && sendSms !== true` → Manual); and the
  `Untitled` / `—` / `--` fallbacks.
- Accessibility fixes: the 9 px delivery-method pills are gone (approved 12 px
  `Badge`s); status is text + icon in a toned `Badge`, never colour alone;
  per-row action names are unique and start with their visible text
  (`Download <title>`, `Link for <title>`, `Correct <title>`, `Void <title>`,
  satisfying WCAG 2.5.3), replacing four repeated `Link`/`Void` names per table;
  the document title is the row header; loading and empty are announced
  (`role="status"`); the horizontal scroll region is labelled and
  keyboard-focusable.
- Behavior improvement (the one intentional non-presentation change, requested as
  part of the slice): a snapshot error previously left the operator staring at an
  empty history. The `onSnapshot` error callback now also sets a visible
  `role="alert"` state ("Could not load document history. Please try again."),
  while the subscription, the `console.error`, and every other code path stay
  byte-for-byte the same.
- Focused tests: 46 unit tests in
  `src/features/signing/components/EnvelopeHistory.test.jsx` (subscription/query/
  unsubscribe/guard, all six status mappings + unknown fallback, email-failure
  override and truncation boundaries at 80/120 chars, delivery-method
  combinations, every fallback, action visibility per status and with/without
  `onCorrect`, the exact void write + confirmation + failure, per-row busy states,
  copy-link payload/clipboard/error-message fallback, download raw-path/`gs://`/
  `storagePath`-fallback/`functions/not-found`/generic error, keyboard action
  activation, no 9 px or 10 px text, `vitest-axe` across mixed row states, and an
  explicit assertion that the signing link never enters the DOM).
- E2E: `e2e/edoc-envelope-history.spec.cjs`, 10 passed across Chromium and Mobile
  Chrome (labelled keyboard-reachable scroll region, the five-column contract,
  the announced data state, no document overflow at 1440/1024/412, scoped
  real-browser axe with no serious/critical or contrast violations). The
  `e2eEdoc=mock` harness stubs templates but not `signing_requests`, and seeding
  it would mean editing `DocumentsManager` (out of scope), so the browser layer
  asserts the shell and the vitest suite owns row/action behavior — recorded
  honestly rather than papered over.
- Existing E-Doc regressions: `edoc-recruiter-send-and-sign.spec.cjs`,
  `edoc-recruiter-send-flow.spec.cjs` and `guest-post-application-edoc.spec.cjs`
  — 20 passed on Chromium + Mobile Chrome.
- Full frontend suite: 107 files / 991 tests passed; 2 files / 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate passed at 34.58% statements / 32.34% branches / 34.2% functions / 35.37%
  lines.
- Frontend lint: 0 errors (158 pre-existing warnings); typecheck and production
  build passed; `git diff --check` clean. Every `--ds-*` utility used by the
  component was verified as an emitted selector in `dist/assets/main-*.css`
  (the Phase 13 lesson about CSS-variable-only tokens being dropped from the
  build).
- Privacy: recipient names, emails, phone numbers, signing links and document
  URLs are treated as sensitive. All fixtures are artificial — RFC 2606 reserved
  `example.test` domains and a fictional `555-0142` number — no real signing link
  or document URL is asserted, logged or snapshotted, and no screenshot of
  populated history data was taken.
- Backend/callable/rules checks: not applicable and not run — no Cloud Function,
  callable or rule changed. `functions/node_modules` is not installed in this
  environment, so `npm run lint:backend` cannot run here (pre-existing; CI covers
  it).
- Remaining E-Docs slices: `DocumentsManager` (page shell, tabs, post-application
  template configuration) and `EnvelopeCreator` (PDF field placement) stay open as
  separate audited slices.

---

### Documents Center header completion log (GO)

- Date: 2026-07-24. PR #100, merged as `bfe4563`.
- Starting baseline: `main` at `3e61a30` (Merge PR #99 — envelope history).
- Scope: the page header area of
  `src/features/company-admin/views/DocumentsManager.jsx` only.
- Go/no-go decision: **GO.** The header holds no data contract: back navigation
  is a single `navigate('/company/dashboard')` call and the two create actions
  are pure local state transitions, so nothing needed freezing beyond their call
  order.
- Migrated: the legacy `min-h-screen bg-gray-50 p-6 sm:p-8` canvas plus its
  `max-w-6xl mx-auto space-y-6` wrapper became `bg-ds-canvas` +
  `PageContainer width="standard"` + `Stack gap="lg"`; Back to Dashboard,
  Create Template and Send One-off became approved `Button`s (ghost / secondary /
  primary) with their icons inheriting the button's content colour; the heading
  moved into `PageHeader` with the `FileSignature` icon on
  `text-ds-action-primary` and `aria-hidden`, so the accessible name stayed
  exactly "Documents Center"; the actions sit in a wrapping `Inline` and the
  header is allowed to wrap, so they drop to their own line instead of
  overflowing at narrow widths.
- Preserved contracts: `navigate('/company/dashboard')`, and both create actions'
  exact call order — `setEditRequestId(null)`, `setEditTemplateId(null)`,
  `setCreatorInitialMode('template' | 'request')`, `setViewMode('create')`.
- Verification: 9 focused tests; `edoc-recruiter-send-flow`,
  `edoc-recruiter-send-and-sign` and `edoc-envelope-history` passed with 26
  Chromium + Mobile Chrome checks; frontend lint 0 errors; production build and
  `git diff --check` passed; `bg-ds-canvas`, `flex-wrap`, `self-start` and
  `text-ds-action-primary` were each confirmed as emitted selectors in
  `dist/assets/main-*.css`.
- Notes: the tab and content blocks moved one indent level because their wrapper
  changed; their markup, classes, logic and props were byte-identical otherwise.
  The roadmap was deliberately not touched in that slice at the owner's request,
  and is recorded here instead.

---

### Documents Center navigation and template-management completion log (GO)

- Date: 2026-07-24.
- Starting baseline: `main` at `bfe4563` (Merge PR #100 — Documents Center
  header). All eight PR #100 lanes completed green on head `e5d1e08` before the
  merge, and local `main` was confirmed equal to `origin/main` with a clean tree.
- Scope: the History/Templates tab navigation inside
  `src/features/company-admin/views/DocumentsManager.jsx` and the complete
  presentation of
  `src/features/company-admin/components/documents/TemplatesPanel.jsx` — one
  cohesive navigation and template-management surface.
- Go/no-go decision: **GO**, taken after auditing every prop and callback.
  `activeTab` is pure local state with two values and no side effect, so the tab
  interface is presentation-only. `TemplatesPanel` is already a props-only
  component: all thirteen props arrive from `DocumentsManager`, every callback
  has a fixed argument shape (`handleSavePostSubmitTemplates()` with no
  arguments, `togglePostSubmitRequired?.(templateId)`,
  `movePostSubmitTemplate(templateId, 'up' | 'down')`,
  `isTemplateEnabledPostSubmit(tmp.id)`, `togglePostSubmitTemplate(tmp.id)`,
  `handleUseTemplate(tmp)`, `handleEditTemplate(tmp)`,
  `handleDeleteTemplate(tmp.id)`), and all of them are mockable, so the entire
  behaviour could be frozen in tests before any markup changed. No Firestore
  read/write, callable, send path or rule is involved.
- Tab contract preserved exactly: initial value `'list'`; only `'list'` and
  `'templates'` exist; History selects `'list'` and Templates selects
  `'templates'`; History still renders
  `<EnvelopeHistory companyId={currentCompanyProfile.id} onCorrect={handleCorrect} />`
  and nothing else (a test asserts the prop set is exactly those two); and
  `TemplatesPanel` still receives all thirteen props (a test asserts the exact
  key set). `handleCorrect`, the creator transitions, `showDriverPicker`, the
  `SendTemplateModal` wiring, the subscriptions, queries, writes, callable names
  and payloads, and the E2E mock behaviour are unchanged; a test proves that
  switching tabs performs no Firestore write, no callable and no navigation.
- Accessible tab interface (feature-owned — the design system has no approved
  Tabs primitive, and `SectionNavigation` is a vertical `nav` with Up/Down keys,
  so it does not fit a horizontal tab interface): `role="tablist"` labelled
  "Document Center views", `role="tab"` with stable per-instance ids,
  `aria-selected`, `aria-controls` pointing at the single always-present
  `role="tabpanel"`, the panel's `aria-labelledby` tracking the selected tab,
  roving `tabIndex` (only the selected tab is in the tab order), ArrowLeft /
  ArrowRight with wrap-around, Home / End, automatic activation so focus follows
  selection, a `focus-visible:shadow-ds-focus` ring, a 44 px-tall activation
  area, decorative icons `aria-hidden`, and a visually hidden "(selected)"
  suffix so selection is never carried by the underline colour alone.
- `TemplatesPanel` contracts preserved: the `postSubmitRequiredById = {}`
  default; the exact heading "Post-Application Success Page Forms" and its
  explanatory copy and meaning; `handleSavePostSubmitTemplates` on Save Forms
  with `savingPostSubmitTemplates` driving the disabled/loading state; the exact
  empty messages "No follow-up forms enabled yet." and "No templates saved
  yet."; the `postSubmitTemplateIds` order; the
  `templates.find((item) => item.id === templateId)` lookup returning `null` for
  a missing template; `postSubmitRequiredById[templateId] !== false` as the
  required rule; `togglePostSubmitRequired?.(templateId)` including the optional
  call; `movePostSubmitTemplate(templateId, 'up' | 'down')` with move-up
  disabled on the first row and move-down on the last; the
  `template.title || 'Complete Form'` fallback; `templatesLoading` behaviour;
  the original `templates` array order; `tmp.fields?.length || 0`; and the exact
  delete/use/edit/post-submit callback arguments.
- `TemplatesPanel` presentation: approved `Card` for the post-application
  section and for every template; approved `Button` for Save Forms, Use and
  Edit; approved `IconButton` for the two move controls and for Delete; an
  approved `Badge` for the field count, which replaces the unsupported 10 px
  uppercase text without changing its value; `Stack` and `ResponsiveGrid`
  instead of the hand-rolled grid; and the hover-only Delete control is now
  always rendered, keyboard-reachable and left at the default 40 px size so its
  touch target matches the card's other actions.
- Accessible names: every card action is unique and starts with its visible text
  where it has any — `Delete <title>`, `Use <title>`, `Edit <title>` (WCAG
  2.5.3) — and the ordering controls are `Move <title> up` / `Move <title> down`.
  A disabled ordering control keeps a tooltip explaining why ("<title> is
  already first"/"already last"), because a disabled button is skipped by
  keyboard focus. The post-application Required checkbox is named "Required for
  <title>" so rows are distinguishable; the card checkbox keeps exactly "Show on
  post-submit success page", since the card's own heading supplies the template
  and repeating the title would put a second copy of it in the card's text.
- Checkboxes: the design system still has no approved Checkbox primitive, so
  both native checkboxes stay feature-owned documented compositions with a
  programmatic label, `accent-ds-action-primary`, a visible
  `focus-visible:shadow-ds-focus` ring, a measured 44 px activation row and no
  nested interactive controls.
- Focused tests: 22 in `DocumentsManager.test.jsx` (default History selection,
  switching both ways, roles and ARIA relationships, roving tabIndex,
  ArrowLeft/ArrowRight with wrap, Home/End, focus following selection, ignored
  keys, the exact `EnvelopeHistory` prop set, `onCorrect` opening the creator in
  request mode, the exact `TemplatesPanel` prop set, no Firebase write/callable/
  send on tab switches, and axe on both tabs) and 35 in
  `TemplatesPanel.test.jsx` (all props and defaults, loading state, both exact
  empty messages, save callback and saving state, required default true and
  explicit optional, the exact Required callback value, the optional-callback
  guard, missing-template null handling, id ordering, move directions and
  disabled boundaries, the field-count value including the missing-array
  default, the exact post-submit checkbox values and callback, the exact delete
  id, whole-object Use/Edit arguments, unique accessible names, keyboard
  activation, native checkbox labels, no 9 px/10 px classes, no raw hex colours,
  long-title wrapping, row wrapping, and axe across loading/empty/populated).
- E2E: `e2e/edoc-documents-tabs-and-templates.spec.cjs`, 12 passed across
  Chromium and Mobile Chrome (default History, switching both ways, keyboard
  ArrowRight/Home/End with focus following selection, tab-to-panel wiring,
  card actions visible without hover, no document overflow at 1440/1024/412, and
  a scoped real-browser axe pass with no serious/critical or contrast
  violations).
- Existing regressions: `edoc-recruiter-send-and-sign` (14),
  `edoc-envelope-history` (10) and `guest-post-application-edoc` passed on
  Chromium + Mobile Chrome. `edoc-recruiter-send-flow` needed two **selector**
  updates and no behaviour change: the Templates control is now `role="tab"`
  rather than `role="button"`, and the template's Use action is now
  `Use E2E Test Document` rather than a bare `Use`. The flow it asserts —
  Templates → Use → Send Document → signer handoff route — is unchanged and
  passes.
- Full frontend suite: 109 files / 1048 tests passed; 2 files / 48
  emulator-dependent rules tests skipped by their environment guard. Coverage
  gate passed at 35.55% statements / 32.85% branches / 35.22% functions / 36.31%
  lines.
- Frontend lint 0 errors (158 pre-existing warnings); typecheck, production build
  and `git diff --check` passed. Every new `--ds-*` utility was verified as an
  emitted selector in `dist/assets/main-*.css` (`rounded-t-ds-xl`,
  `border-ds-action-primary`, `min-h-11`, `accent-ds-action-primary`,
  `bg-ds-status-accent-bg`, `text-ds-status-accent-fg`, `bg-ds-status-info-bg`,
  `border-ds-status-info-border`, `px-ds-5`, `py-ds-4`).
- Measured responsive review at 1440×900, 1024×768 and 412×915 on the Templates
  tab: `document.documentElement.scrollWidth` equalled the viewport at every
  width (no document-level horizontal overflow); both tabs stayed visible and
  operable at 54 px tall; the checkbox activation row measured 44 px; and Use,
  Edit, Delete and Save Forms were all visible without hover (Use/Edit 335 px
  wide at 1024 and 165 px at 412, Delete 40 px square, Save Forms full-width at
  412).
- Retained motion: the only animations left are the panel's `animate-in`
  transition and the loading spinner, both already neutralised by the global
  `prefers-reduced-motion: reduce` rule in `src/shared/styles/designTokens.css`.
- No raw hexadecimal colours and no 9 px or 10 px interface text remain in either
  file (asserted in tests and re-checked by grep).
- Privacy: every fixture is an artificial template ("Artificial Offer Letter",
  "Artificial Policy Acknowledgement", "Artificial Equipment Checklist") or the
  existing `E2E Test Document` mock. No real document, recipient or signing
  information appears, nothing is snapshotted, and no send is triggered.
- Backend/callable/rules checks: not applicable and not run — no Cloud Function,
  callable or rule changed. `functions/node_modules` is not installed here, so
  `npm run lint:backend` could not run locally (pre-existing; CI covers it).
- Pre-existing failure recorded honestly, not introduced here: the non-blocking
  `@a11y` **public signing room** journey in `e2e/a11y.spec.cjs` reports
  `color-contrast x1` and `label x3`. This was reproduced on clean `main` with
  this slice's changes stashed, is inside the signing room (`EnvelopeCreator` /
  signer surface) which is explicitly out of this slice's scope, and belongs to
  the still-open signing slice. The CI `e2e-a11y` lane is
  `continue-on-error: true`, which is why it has not blocked.
- Remaining E-Docs work: **`SendTemplateModal`** (the send/driver-picker dialog,
  delivery-method controls and prefill inputs) and **`EnvelopeCreator` with its
  PDF workbench components** (field placement, coordinates, zoom and gesture
  behaviour — high risk, and the pre-existing signing-room axe findings belong
  with it). Each needs its own audit and must not share a diff with the other.

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
- `[!]` Decide the responsive/interaction strategy for *editable* matrices
  (per-row form controls), starting with the SMS number-assignment recruiter
  matrix. The approved DataTable is proven only for display tables; converting an
  editable matrix (per-row `<select>`, `MISSING_TOKEN` resilience options, verify
  actions, status) to a scroll table or stacked cards needs an owner decision and
  a proof of behavior parity before migration. This blocked the SMS
  number-assignment slice on 2026-07-23 (deep-audit log in section 6).

- `[!]` Correct the Facebook Integrations tenant binding before any Integrations
  presentation migration. `connectFacebookPage` uses `companyId =
  request.auth.uid`, which is incompatible with SafeHaul's auto-id + membership
  multi-tenant model, so connected leads ingest to `companies/{uid}/leads`
  instead of the real company. This is a backend correctness/security defect that
  must be fixed under a separate, security-reviewed integration-correctness
  project (explicit company id in the callable payload or via membership/claims,
  with tests) — not as part of a design-system slice. The Integrations
  presentation stays unmigrated until this is resolved (deep-audit log in section
  6).

These decisions do not block compatibility-first migrations that preserve the
current identity and record evidence. They do block declaring the affected
families fully approved, publishing durable visual baselines, or making the
related CI enforcement permanently blocking.

---

## 8. Safest next phase

The Company Settings SMS / number-assignment workflow was deep-audited on
2026-07-23 and returned **NO-GO** (deep-audit log in section 6): it is an
editable matrix, not a display table, and is blocked on the new `[!]`
editable-matrix responsive/interaction owner decision, an unproven
DataTable-for-form-controls fit, a safety-critical markup-coupled 15-case suite,
and entanglement with the out-of-scope secret-entry `LineManager`. No partial
table conversion was forced; its contracts are frozen in section 6 for a future
slice once the owner decision lands.

The **Login/Auth screen** (`/login`) was migrated and verified on 2026-07-23
(completion log in section 6): it now consumes `FormField`, `Input`, `Button`,
`IconButton`, and `Card`, and its password-reset overlay moved to the shared
accessible `Modal`, all with authentication, redirects, and reset behavior
preserved.

The **Company Profile branding-upload** section was migrated and verified on
2026-07-23 (completion log in section 6): `BrandingSection` now uses an approved
`Button` and `FieldMessage` with a labelled, keyboard-triggered file input, and
the exact `uploadCompanyLogo` Storage path and `companyLogoUrl` Firestore field
are preserved and locked by tests. The separate **`/company/profile`
account-security** screen was migrated and verified on 2026-07-24 (GO;
completion log in section 6): `UserProfilePage` now consumes `FormSection`,
`FormField`, `Input`, `Button`, `FieldDisplay`, `FieldMessage`, `PageHeader`,
and `Stack`, its avatar upload moved to the keyboard-accessible
`ProfileAvatarField` (no nested interactive elements), and correct autocomplete
was added, while every Auth reauthentication/email/password contract, the exact
`avatars/{uid}/{file.name}` Storage sequence, the username query with its
permission-denied skip, and all Firestore writes and toast messages are
preserved.

The **Company Profile — Application Form Questions** interface was migrated and
verified on 2026-07-24 (GO; completion log in section 6): the standard-field
required/hidden toggles became accessible ARIA switches with unique names, and
the custom-question builder/editor adopted `Card`/`FormField`/`Input`/`Select`/
`Button`/`IconButton`/`Badge` with labelled fields, named destructive/reorder
controls, and a keyboard move-up/down alongside the preserved native drag —
while the `applicationConfig`/`customQuestions` data shape, `crypto.randomUUID()`
creation, DOT deletion protection and its exact alert, and the inverse
compliance mappings are unchanged. With this, every in-phase **Company Settings /
Profile** item is resolved: Company info, branding, Team & Users, Billing,
Automated SMS, Email Settings, account security, and application questions are
migrated (GO); **SMS number assignment** and **Integrations** remain NO-GO.

The **Sandbox Transfer Success** status screen (`/sandbox/transfer-success`) was
migrated and verified on 2026-07-23 (completion log in section 6): it now
consumes `Card`, `Button`, `Badge`, `Stack`, and `Inline` with a single
`<h1>`/`<main>`, preserving the company-name fallback chain, the `New
Application` status wording, and both navigations.

The **public Verification Portal** (`/verify/:token`) was migrated and verified
on 2026-07-23 (completion log in section 6): the portal, its five status
screens, and the four FMCSA form sections now consume `Card`, `FormSection`,
`FormField`, `Input`/`Select`/`Textarea`, `FieldDisplay`, `FieldMessage`,
`Badge`, and `Button`; the feature-local `RadioGroup` was accessibility-hardened
in place (fieldset/legend, visible focus, error/description association) and the
`useVerificationPortal` hook and shared `SignaturePad` were left untouched, so
the token-load/validate/submit contracts are unchanged.

The **public Change Review Portal** (`/review-change/:token`) was migrated and
verified on 2026-07-23 (completion log in section 6): `ReviewChangePortal` now
consumes `Card`, `Button`, and `Input` with one `<h1>`, `role="status"`/
`role="alert"` states, and a tokenized feature-owned approve/reject/edit toggle
group (`aria-pressed` preserved), while the `getChangeReview`/
`submitChangeResolution` callables, the resolution payload, `isScalar`/
`previewValue`, token handling, and the non-display of `applicantName` are
unchanged; `functions/applicationChanges.js` was not touched.

The **Company Settings Team & Users** area was migrated and verified on
2026-07-23 (completion log in section 6): both surfaces landed together — the Add
New User form now uses `FormSection`/`FormField`/`Input`/`Select`/`Button`, and
`ManageTeamModal` moved to the shared accessible `Modal` with `Card`/`Button`/
`IconButton` and labelled goal inputs — while the `createPortalUser`/
`deletePortalUser` callables, the membership `onSnapshot` subscription, the goal
`setDoc` write, the tracking-link construction, the admin permission gate, and
`functions/hrAdmin.js` are all unchanged.

The **Company Settings Integrations** area was deep-audited on 2026-07-23 and
returned **NO-GO** (deep-audit log in section 6): the Facebook Lead Ads workflow
binds the tenant on `companyId = request.auth.uid`, which is incompatible with
SafeHaul's auto-id + membership multi-tenant model, so connected leads would
ingest to `companies/{uid}/leads` instead of the real company. Per the
tenant-binding rule, no backend was changed and the presentation was **not**
migrated (polishing the card would imply a production-ready workflow it is not);
the fix belongs to a separate, security-reviewed integration-correctness project.
All contracts (SDK load, login/scopes, Graph first-page selection, callable,
token safety, connected-state limitation) are frozen in section 6.

The **`/company/profile` account-security** screen and the **Company Profile —
application questions** interface were both migrated and verified on 2026-07-24
(GO; completion logs in section 6), which resolves every in-phase Company
Settings / Profile item. The **Campaigns** area migration then began with its
safest bounded slice — the **campaign list card** (`CampaignCard`), migrated and
verified on 2026-07-24 (GO; completion log in the Phase 13 Campaigns item): the
card now uses `Card`/`Badge`/`IconButton` with a feature-mapped status tone/label
and an accessible options popover, while `CampaignsDashboard` keeps both Firestore
listeners, the `cancelBulkSession` callable, confirmations, and delete logic
unchanged. The **campaigns dashboard shell** was then migrated and verified on
2026-07-24 (GO; completion log in the Phase 13 Campaigns item): the header, Create
action, stat cards, Drafts/Past Sequences tabs, loading/empty states, and card
grid now use `PageContainer`/`PageHeader`/`Section`/`ResponsiveGrid`, `Button`,
and `MetricCard`; the former 10 px low-contrast stat labels are fixed and the tabs
are an accessible WAI-ARIA tablist (programmatic selection + keyboard), all while
the paywall, both listeners + cleanup, stats math, the exact new-draft write,
`cancelBulkSession`, confirmations, delete logic, tab values, and
`CampaignCard`/report-modal wiring stay unchanged. The **campaign results table**
(`CampaignResultsTable`) was then migrated and verified on 2026-07-24 (GO;
completion log in the Phase 13 Campaigns item): the recipient delivery log now
uses `Card`/`Input`/`Label`/`Badge` with a semantic DS-token table, fixing the
10 px low-contrast headers, labelling the search, making statuses text + icon and
per-row errors readable, and preserving the `max-height` scroll region and sticky
header — while the exact Firestore read, log mapping, search logic, loading/empty
strings, status mapping, and timestamp/`Pending` formatting stay unchanged.
`DataTable` was recorded as a primitive-fit exception here (it owns a horizontal
column-scroll region and needs a definite-height ancestor for vertical
stickiness, which would change the log's grow-to-content scroll behavior). The
**detailed delivery-report dialog** (`DetailedReportModal`) was then migrated and
verified on 2026-07-24 (GO; completion log in the Phase 13 Campaigns item): it now
uses the shared accessible `Modal` (adding Escape, focus trap, and focus
restoration while keeping backdrop close) plus `Button`/`IconButton`/`Badge`, with
the log table in a labelled keyboard-focusable internal-scroll region so wide
content scrolls without document overflow — while the props, the
no-fetch-unless-open-with-both-IDs guard, the exact logs query/mapping, the
loading/empty/fetch-error strings, `hasFailures`, the delivered/failed mapping,
and the `retryFailedAttempts` confirmation/payload/toasts/close-after-success are
all unchanged (`retryFailedAttempts` and all backend/rules untouched). The
**campaign detail view** (`CampaignDetails`) was then migrated and verified on
2026-07-24 (GO; completion log in the Phase 13 Campaigns item): the full-screen
view now uses `Card`/`Button`/`IconButton`/`Badge`/`FieldMessage` and layout
tokens with a programmatic `progressbar`, wrapping failure text, and mobile-
reachable (wrapping) header actions — while `effectiveCompanyId`, the tenant-
mismatch/missing-company states, the status/date formatting, the progress/
audience/sent/failed calculations, the failure reason, the `CampaignResultsTable`
props, all four action-visibility rules, and the exact `pauseBulkSession`/
`resumeBulkSession`/`cancelBulkSession`/`retryFailedAttempts` payloads,
confirmations, toasts, loading flags, and `onClose` paths are unchanged
(`CampaignEditor` and all backend/rules untouched). The **`CampaignEditor` shell**
(wizard chrome only) was then migrated and verified on 2026-07-24 (GO; completion
log in the Phase 13 Campaigns item): the shell now uses `Input`/`Button`/
`FormField` + layout tokens with a keyboard-accessible section nav
(`aria-current="step"` + sr-only completed state), a labelled Campaign Name, and
announced save/Suspense regions — while the draft `onSnapshot` listener + unsub,
the deep filter merge with in-memory `rawData` preservation, the `isDirty`/init
guards, the exact 2-second autosave debounce, the `rawData` strip before
`saveDraft`, `isSectionComplete`, all lazy child props, and `onLaunchSuccess=
{onClose}` are unchanged. The **content composer** (`ContentComposer`) was then
migrated and verified on 2026-07-24 (GO; completion log in the Phase 13 Campaigns
item): the editor's Content section now uses `Card`/`FormField`/`Input`/
`Textarea`/`Button` with a keyboard-accessible SMS/Email toggle (labelled group of
`aria-pressed` buttons), associated Subject/Message labels, clearly-labelled
variable buttons, an `aria-live` character count, and the variable toolbar in
normal flow (the former absolute overlapping bar removed) — while the
`messageConfig` spread, the `sms`/`email` methods, email-only Subject, the
`activeField` tracking, the variable labels/values, the caret/selection insertion
with surrounding spaces, the subject-vs-message targeting, the
`requestAnimationFrame` focus/caret restore, the append fallback, the
placeholders, the character count, and the `DeviceMockup` `type`/preview content
are unchanged (`DeviceMockup` not redesigned; no message limit, validation, or
sending rule changed). The **audience builder** (`AudienceBuilder`) was then
migrated and verified on 2026-07-24 (GO; completion log in the Phase 13 Campaigns
item): the editor's Audience section now uses `Card`/`FormField`/`Select`/
`Input`/`Button` with accessible source and import tablists (roving tabindex,
`aria-selected`, keyboard activation), labelled filters and file/sheet inputs,
`aria-pressed` status pills carrying a check icon so selection is never
colour-only, an announced recipient count, readable exclusion chips, and a single
labelled file-input trigger with no nested interactive controls — while the
targeting/import hooks, the upload fingerprint and campaign-scope exclusion
resets, the CRM/upload `rawData` handling, `onChange(localFilters, matchCount)`
parent sync, manual exclusion toggling, `finalCount`, every filter/option value
(including the CRM `off` vs upload `7` exclusion defaults), the file `accept`
list, the sheet import behavior, every `VirtualLeadList` prop, and the exact
`onChange(localFilters, finalCount)` Confirm Audience call are unchanged. The
**recipient preview list** (`VirtualLeadList`) was then migrated and verified on
2026-07-24 (GO; completion log in the Phase 13 Campaigns item): its inaccessible
clickable row containers became native `aria-pressed` toggle buttons that keep
whole-row usability and pair a check/cross icon with a visually hidden state
sentence, so selection is never colour-only; already-messaged rows are no longer
exposed as controls at all; status pills became approved 12 px `Badge`s (the
10 px spans are gone); "Scanning Database…" was lifted from 4.23:1 to ≈9.5:1;
loading, empty and pagination regions are `role="status"`, and the failure state
is a `role="alert"` with an approved `Button` retry — while the callable, backend
filter mapping, `pageSize: 50`, pagination/reset/`hasMore`, the StrictMode fetch
guard, fallback ids, name/contact fallbacks, every exclusion rule and callback
value, the `Virtuoso` wiring, and all existing copy are unchanged. Its dark
surface is retained as the smallest documented feature-level exception (the design
system has no approved dark-surface tokens), with every piece of text on it
contrast-verified in a real browser against a populated list. The **launch pad**
(`LaunchPad`) was then migrated and verified on 2026-07-24 (GO; completion log in
the Phase 13 Campaigns item): the pre-flight result is now icon + text
(`role="alert"` for failures, `role="status"` for the all-clear with a `Badge`
estimate), a visually hidden `role="status"` announces "Launching campaign…", and
the confirmation moved to the shared accessible `Modal` (Escape, focus trap and
focus restoration, mobile-safe stacked actions) — while the `initBulkSession`
payload, the `rawData` extraction, the duplicate-launch lock, every toast and
friendly error mapping, `onLaunchSuccess`, the finally-state resets, the
validation messages, the estimate, and the 280-character preview truncation are
unchanged (the real launch callable is never invoked in tests).

**Campaigns is complete** as of 2026-07-24. The two non-interactive leftovers were
closed out by an owner decision to split them: the decorative `DeviceMockup`
illustration keeps `text-[10px]` for its simulated "9:41" status bar as an
**approved documented exception** (it simulates phone chrome rather than SafeHaul
interface text, and enlarging it would make the mockup read as oversized UI; the
rationale is recorded in-code and is scoped to that decorative component only),
while the `CompanyCampaignsPage` "Please select a company." fallback was **fixed**
— moved from legacy `text-gray-700` to `text-ds-content-secondary`, with a test
locking the token and asserting no `text-gray-*` remains. All ten interactive
components plus the route wrapper are therefore on approved primitives and
tokens, with no Campaigns file left on legacy interface styling. The recommended
next area is the **E-Docs** document/envelope workflows — audited and scoped
before any presentation change.

**E-Docs is in progress.** The **envelope history table** (`EnvelopeHistory`) was
audited and migrated on 2026-07-24 (GO; completion log in section 6): the
Documents Center history now consumes the approved `DataTable` with a
feature-owned status adapter, so the 9 px delivery pills are gone, status is text
+ icon in a toned `Badge`, each row's Download/Link/Correct/Void action carries a
unique name prefixed with its visible label, the document title is the row
header, loading/empty are announced, the horizontal scroll region is labelled and
keyboard-focusable, and a snapshot failure now raises a visible `role="alert"`
instead of an empty table — while the `signing_requests` `onSnapshot` query and
ordering, the unsubscribe, the no-`companyId` guard placement, the
`voided`/`serverTimestamp` write and its path, the `window.confirm` text, both
callables (`getSigningLink`, `getSignedDocumentUrl`) with the `gs://` path
cleaning and `signedPdfUrl || storagePath` source, every toast string, the
`functions/not-found` mapping, the case-sensitive action-visibility rules, the
email-failure override with its 80-character truncation, the delivery-method
rules and all fallbacks are unchanged. `DataTable` is a genuine fit here — unlike
the campaign results table and report modal, this table has no max-height or
sticky-header constraint and no exact loading string to preserve.

The **Documents Center page header** was then migrated and verified on 2026-07-24
(GO; completion log in section 6, PR #100 merged as `bfe4563`): the canvas and
container moved to `bg-ds-canvas` + `PageContainer`/`Stack`, the heading and its
icon are tokenized through `PageHeader`, and Back to Dashboard / Create Template /
Send One-off are approved `Button`s that wrap onto their own line instead of
overflowing — while back navigation and both creator transitions keep their exact
call order.

The **Documents Center navigation and template-management surface** was then
migrated and verified on 2026-07-24 (GO; completion log in section 6): the
History/Templates control became a feature-owned WAI-ARIA tab interface
(labelled `role="tablist"`, `aria-selected`/`aria-controls`, a connected
`role="tabpanel"`, roving `tabIndex`, ArrowLeft/ArrowRight with wrap, Home/End,
focus following selection, a visible focus ring and a visually hidden
"(selected)" state so selection is never colour alone), and `TemplatesPanel` now
consumes `Card`/`Button`/`IconButton`/`Badge`/`Stack`/`ResponsiveGrid` — the
hover-only Delete control is always reachable, every card action is uniquely
named (`Delete`/`Use`/`Edit` + title), the ordering controls are
`Move <title> up`/`down` with tooltips explaining a disabled boundary, and the
unsupported 10 px field-count text became an approved `Badge` with the same
value. Meanwhile the `'list'`/`'templates'` state values (with `'list'` initial),
the exact `EnvelopeHistory` props, all thirteen `TemplatesPanel` props, the
`postSubmitRequiredById = {}` default, the `!== false` required rule, the
`templates.find` lookup with `null` for missing ids, the id order, the move
directions and first/last disabling, the `'Complete Form'` fallback, both exact
empty messages, `templatesLoading`, `tmp.fields?.length || 0` and every callback
argument shape are unchanged — and a test proves switching tabs performs no
Firestore write, callable or navigation. The design system still has no approved
Tabs or Checkbox primitive, so both remain documented feature-owned compositions.

The remaining E-Docs slices are **`SendTemplateModal`** (the send/driver-picker
dialog, delivery-method controls and prefill inputs) and **`EnvelopeCreator` with
its PDF workbench components** (field placement, coordinates, zoom and gestures —
high risk; the pre-existing non-blocking signing-room axe findings belong with
it). Each needs its own audit and must not share a diff with the other.

The **sandbox application** screen remains tied to the
public-application migration. The Phase 3 link-style Button variant (Login
text-link and reveal-adornment exceptions), a design-system file-input primitive
(the branding-upload exception), a design-system Radio/Checkbox or
segmented-control primitive (which would retire the verification RadioGroup, the
change-review decision control, the settings question toggles and the two
Documents Center template checkboxes), and a design-system **Tabs** primitive
(currently missing: `SectionNavigation` is a vertical `nav` with Up/Down keys, so
the Documents Center History/Templates tab interface is a documented
feature-owned WAI-ARIA composition) stay independently tracked. All public token
screens (`/verify/:token`, `/review-change/:token`, `/sandbox/transfer-success`)
are migrated. The SMS number-assignment NO-GO and the new Integrations
tenant-binding NO-GO are unchanged.

Sequence (whichever slice the owner selects):

1. audit and freeze the exact data/callable/upload behavior, validation, and
   messages before changing presentation;
2. confirm the go/no-go conditions (mockable contracts, testable behavior, no
   backend change, preservable permissions) are met;
3. migrate only that bounded area to approved primitives, preserving all
   behavior;
4. add focused behavior + accessibility coverage plus axe and responsive checks;
5. verify at 1440×900, 1024×768, and 412×915 before marking the slice complete.

Do not start any remaining slice in the same unreviewed diff as another. SMS
number-assignment, Company Profile branding upload/application questions, Team &
Users, and Integrations each remain independent items with their own audits and
behavior-preservation evidence. `/company/profile` account security is migrated
(GO) and no longer open. The SMS number-assignment slice stays blocked until the
editable-matrix strategy is owner-approved.
