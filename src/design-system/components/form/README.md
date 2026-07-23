# Form controls

These primitives own the visual and accessibility contract for native form
controls. They use native event objects and do not transform values, validate
business rules, fetch data, or save anything.

- `FormField` associates one control with its label, helper text, required
  state, and error.
- `Label` and `FieldMessage` are available for uncommon compositions.
- `Input`, `Textarea`, and `Select` share height, typography, focus, invalid,
  disabled, and read-only presentation.
- `FormSection` groups related fields with a heading and optional actions.

Existing `src/shared/components/form/InputField.jsx` remains a compatibility
adapter for consumers that require `(name, value)` callbacks and specialized
file behavior. Migrate those consumers separately and preserve their callback
contracts.

Checkbox, Radio, Switch, and file-input contracts remain open roadmap work;
do not improvise local design-system alternatives.
