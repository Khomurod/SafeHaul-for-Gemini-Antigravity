## 2024-05-23 - Global Event Listener Leak in Lists
**Learning:** Attaching global event listeners (like `mousedown` for click-outside) in individual list items (like `CampaignCard`) creates O(N) event listeners, causing performance degradation as the list grows.
**Action:** Conditionally attach listeners only when the specific interaction state (e.g., `showMenu`) is active, reducing active listeners from N to 0 or 1.
