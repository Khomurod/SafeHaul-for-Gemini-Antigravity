import { useCallback, useEffect, useRef, useState } from 'react';
import { readBrowserVisibleValue } from '../config/browserVisibleEnvironment';
import { revealEnvironmentValue } from '../services/environmentVault';

/**
 * Owns the single revealed value on the Environment & Integrations page.
 *
 * ## Why exactly one slot
 *
 * The state holds one entry id and one value. That is not a simplification — it
 * is the mechanism by which "revealing one row never reveals another" is true:
 * there is nowhere for a second plaintext value to live, so a second reveal
 * necessarily evicts the first.
 *
 * ## Where a revealed value is *not*
 *
 * React state only. It is never written to `localStorage`, `sessionStorage`,
 * IndexedDB, a data attribute, the URL, a log line, an analytics event or a
 * Sentry breadcrumb, and it is never copied to the clipboard automatically. A
 * page refresh loses it because nothing persisted it.
 *
 * ## Everything that clears it
 *
 * The eye pressed again, a second reveal, the tab becoming hidden, the hook
 * unmounting (view change, logout, row unmount), and a 30-second timer. The
 * timer ticks once a second so the countdown shown next to the value is the real
 * remaining time rather than a decoration.
 */

export const REVEAL_WINDOW_SECONDS = 30;

export function useRevealedValue({ onReauthRequired } = {}) {
    const [revealedId, setRevealedId] = useState(null);
    const [revealedValue, setRevealedValue] = useState(null);
    const [unavailableReason, setUnavailableReason] = useState(null);
    const [secondsRemaining, setSecondsRemaining] = useState(0);
    const [pendingId, setPendingId] = useState(null);
    const [error, setError] = useState(null);

    const timerRef = useRef(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const hide = useCallback(() => {
        clearTimer();
        setRevealedId(null);
        setRevealedValue(null);
        setUnavailableReason(null);
        setSecondsRemaining(0);
    }, [clearTimer]);

    // Unmount — view change, logout, or the row's owner going away.
    useEffect(() => hide, [hide]);

    // A backgrounded tab is an unattended screen. Nothing stays revealed on one.
    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') hide();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [hide]);

    const startCountdown = useCallback(() => {
        clearTimer();
        setSecondsRemaining(REVEAL_WINDOW_SECONDS);
        timerRef.current = setInterval(() => {
            setSecondsRemaining((remaining) => {
                if (remaining <= 1) {
                    // Clearing inside the tick keeps the value and the countdown
                    // in one place; a separate timeout could drift apart from it.
                    clearTimer();
                    setRevealedId(null);
                    setRevealedValue(null);
                    setUnavailableReason(null);
                    return 0;
                }
                return remaining - 1;
            });
        }, 1000);
    }, [clearTimer]);

    /**
     * Reveals one entry. Always goes through the callable first — even for
     * build-time browser values, which the server cannot read — so that
     * authorisation, recency, rate limiting and the audit record apply
     * uniformly to every reveal.
     */
    const reveal = useCallback(async (entry) => {
        if (!entry) return;
        if (revealedId === entry.id) {
            hide();
            return;
        }

        // Evict the previous value before the request, not after: an in-flight
        // reveal must never leave an older secret on screen.
        hide();
        setError(null);
        setPendingId(entry.id);

        try {
            const result = await revealEnvironmentValue(entry.id);

            let value = result?.value ?? null;
            let reason = result?.unavailableReason ?? null;

            if (result?.readFrom === 'client-bundle') {
                value = readBrowserVisibleValue(entry.key);
                if (value === null) reason = 'This build-time value is not set in the deployed bundle.';
            }

            setRevealedId(entry.id);
            setRevealedValue(value);
            setUnavailableReason(value === null ? (reason || 'No value is available from this source.') : null);
            startCountdown();
        } catch (caught) {
            if (onReauthRequired?.(caught, () => reveal(entry))) return;
            setError({ entryId: entry.id, error: caught });
        } finally {
            setPendingId(null);
        }
    }, [hide, onReauthRequired, revealedId, startCountdown]);

    return {
        revealedId,
        revealedValue,
        unavailableReason,
        secondsRemaining,
        pendingId,
        error,
        reveal,
        hide,
    };
}
