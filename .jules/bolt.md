## 2026-01-30 - [Event Listener Leaks]
**Learning:** Found O(N) event listener leak in list components (CampaignCard). Components attaching global listeners in `useEffect` without checking state (e.g. `showMenu`) cause performance degradation as list size grows.
**Action:** Always condition global listeners on the state that requires them (e.g., `if (!isOpen) return;`).
