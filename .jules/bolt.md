# Bolt's Journal

## 2025-05-23 - Conditional Global Event Listeners
**Learning:** Attaching global event listeners (like `mousedown` for "click outside") in list components causes O(N) performance overhead, as every item in the list attaches a listener even when not interacting.
**Action:** Always conditionally attach global listeners only when the specific interaction state (e.g., `showMenu`) is active. Use `if (!isOpen) return;` inside the `useEffect`.
