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

The remaining migration candidates include form controls and Dialog. Existing
`src/shared/components` implementations remain compatibility sources until
each consumer is migrated.
