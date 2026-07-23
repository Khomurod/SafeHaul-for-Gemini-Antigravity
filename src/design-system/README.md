# SafeHaul design system

This directory is the business-neutral visual contract for SafeHaul. It owns
how reusable interface elements look and behave, but it does not decide what
driver, recruiter, application, lead, campaign, or company data is shown.

Before changing UI code, read:

1. `docs/SAFEHAUL_DESIGN_SYSTEM_ROADMAP.md`
2. This file
3. The component or pattern documentation relevant to the change

## Layer responsibilities

- `tokens/` contains primitive and semantic design decisions and the Tailwind
  bridge. Feature code should prefer semantic tokens over palette values.
- `components/` is for small, accessible, business-neutral controls and
  display primitives.
- `patterns/` composes components into repeatable UI states such as data
  presentation, forms, empty states, and dialog structure.
- `layouts/` contains business-neutral page and region composition.
- `icons/` documents and exports the approved icon contract.
- `stories/` is the future component-catalog entry point.
- `tests/` enforces token and dependency boundaries.

Feature screens remain in `src/features`. Features own content, available
actions, domain-to-visual mapping, and orchestration. Hooks and services own
data, state, and business logic. `src/app` owns routing and application
composition. `src/shared` remains a compatibility and cross-feature utility
layer while visual primitives migrate deliberately into this directory.

## Dependency rule

Code in this directory may depend on React, approved presentation libraries,
and other design-system modules. It must not import feature modules, Firebase,
application context, domain services, or business vocabulary.

Do not move a feature screen here. Do not add a local alternative to an
approved component without recording the gap and migration decision in the
roadmap.

## Compatibility policy

`src/design-system/index.css` currently loads the existing
`src/shared/styles/designTokens.css` after the new namespaced token contract.
This preserves the current cascade while consumers migrate. The legacy file
must not be removed until its consumers and visual behavior have been
verified.

## Current approved consumers

- Company candidate lists consume `DataTable`.
- The Company workspace shell and dashboard consume workspace/page layouts,
  Button/IconButton, Card/MetricCard, Badge, and DataTable.
- The Company Settings Personal Profile compatibility slice consumes the
  native-event form foundation, Card, Button, PageHeader, and Stack while its
  Firestore and clipboard behavior remains feature-owned.
- The Company Settings shell consumes SectionNavigation while the settings
  feature retains tab state, labels, feature flags, permissions, and rendered
  content.
- The Company Settings Billing informational card consumes FormSection,
  FieldDisplay, Badge, and FieldMessage while the plan mapping and support copy
  remain feature-owned.

The primitive APIs are usable for migrated consumers, but their broader
component-family roadmap items remain in progress until catalog examples and
durable visual baselines are owner-approved.
