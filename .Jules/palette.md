## 2026-01-29 - [Icon-Only Buttons and Accessibility]
**Learning:** Found multiple instances of icon-only buttons (close buttons, toggles) lacking `aria-label` attributes, rendering them inaccessible to screen readers.
**Action:** Systematically audit `X`, `Chevron`, and other icon-based interactive elements for `aria-label` or `aria-labelledby` attributes.
