## 2026-01-30 - [Event Listener Leaks]
**Learning:** Found O(N) event listener leak in list components (CampaignCard). Components attaching global listeners in `useEffect` without checking state (e.g. `showMenu`) cause performance degradation as list size grows.
**Action:** Always condition global listeners on the state that requires them (e.g., `if (!isOpen) return;`).
## 2026-01-30 - [ESLint Monorepo Config]
**Learning:** CI failed because nested eslint config was missing `"root": true`, causing it to traverse up and load the root's incompatible `eslint.config.js`.
**Action:** Always add `"root": true` to nested `.eslintrc.json` files in monorepos to isolate their configuration.
## 2026-01-30 - [ESLint Flat Config]
**Learning:** Legacy ESLint 8.x in subdirectories (like `functions/`) may incorrectly auto-detect and prefer a root `eslint.config.js` (Flat Config) over a local `.eslintrc.json`, even with `"root": true`.
**Action:** Explicitly set `ESLINT_USE_FLAT_CONFIG=false` in the lint script to force legacy mode when relying on `.eslintrc.json`.
