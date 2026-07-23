# Components

Business-neutral, accessible UI primitives belong here. Components accept
visual or interaction props such as `tone`, `size`, `disabled`, and
`aria-label`; they do not accept SafeHaul domain objects or query data.

`data-table/` contains the first approved primitive family and its documented
column, interaction, async-state, and responsive contracts. Its first consumer
is the Company candidate-list pilot.

`button/`, `card/`, and `badge/` contain the first shell/dashboard consumer
implementations. Their APIs, unit/axe tests, and usage documentation exist, but
the families remain in-progress until the project selects a component catalog
and approves durable visual baselines.

`form/` contains the native-event FormField, Label, FieldMessage, Input,
Textarea, Select, and FormSection foundation. Existing shared form components
remain compatibility adapters for callback and file behavior; Checkbox, Radio,
Switch, and file-input contracts remain open.

`section-navigation/` contains the grouped, current-item-aware navigation
contract for feature-owned settings and sub-section shells. It centralizes
navigation semantics, focus behavior, responsive presentation, and interaction
states while leaving routes, permissions, labels, and available items to the
feature.

The remaining migration candidates include those form controls and Dialog.
Existing `src/shared/components` implementations remain compatibility sources
until each consumer is migrated.
