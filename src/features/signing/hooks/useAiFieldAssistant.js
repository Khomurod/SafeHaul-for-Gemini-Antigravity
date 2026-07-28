import { useCallback, useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    buildSuggestionSet,
    normalizeManualReview,
    normalizeSuggestion,
} from '@features/signing/utils/aiFieldSuggestions';
import { inspectPdfDocument } from '@features/signing/utils/pdfFieldInspector';
import { loadPdfDocument, renderPageToDataUrl } from '@features/signing/utils/pdfPageRasterizer';

/**
 * AI Field Assistant — scan orchestration.
 *
 * Owns the *suggestion* lifecycle only. It never touches the editor's `fields`
 * array, never saves a template and never sends a document: `EnvelopeCreator`
 * applies reviewed suggestions explicitly.
 *
 * Hybrid analysis, in order:
 *   1. deterministic PDF inspection (AcroForm widgets, annotations, ruled
 *      blanks in the text layer) — measured geometry, always trusted first;
 *   2. vision analysis via the authenticated `analyzeEdocFieldPlacement`
 *      callable, only for pages the deterministic pass could not describe from
 *      embedded form data. A page that already carries real widgets does not
 *      need — and must not be overruled by — a visual guess.
 *
 * Every scan carries a `scanId`. A response whose id is not the current one is
 * discarded, so a slow answer can never overwrite a newer scan or a cancelled
 * one.
 */

/** Pages per callable request. The backend hard-caps this at 5. */
export const PAGES_PER_REQUEST = 3;

export const SCAN_SCOPES = Object.freeze(['current', 'selected', 'all']);

const STATUS = Object.freeze({
    IDLE: 'idle',
    SCANNING: 'scanning',
    READY: 'ready',
    ERROR: 'error',
    CANCELLED: 'cancelled',
});

const chunk = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

/** Resolve a scope + explicit selection into the concrete page list to scan. */
export function resolveScanPages({ scope, selectedPages = [], activePage = 1, numPages = 1 }) {
    const total = Number.isFinite(numPages) && numPages > 0 ? numPages : 1;
    const inRange = (page) => Number.isInteger(page) && page >= 1 && page <= total;

    if (scope === 'all') {
        return Array.from({ length: total }, (_, index) => index + 1);
    }
    if (scope === 'selected') {
        return [...new Set(selectedPages.filter(inRange))].sort((a, b) => a - b);
    }
    return inRange(activePage) ? [activePage] : [1];
}

const newScanId = () =>
    (globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);

export function useAiFieldAssistant({ companyId, file, numPages, activePage, fields = [] }) {
    const [status, setStatus] = useState(STATUS.IDLE);
    const [progress, setProgress] = useState({ phase: 'idle', completed: 0, total: 0 });
    const [suggestions, setSuggestions] = useState([]);
    const [manualReview, setManualReview] = useState([]);
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [lastScan, setLastScan] = useState(null);

    // The id of the scan whose results the UI is currently willing to accept.
    const activeScanRef = useRef(null);
    const abortRef = useRef(null);
    // Latest fields, so a long scan flags overlaps against the current editor
    // state rather than the state at scan start.
    const fieldsRef = useRef(fields);
    fieldsRef.current = fields;

    const canScan = Boolean(companyId && file && numPages > 0);

    const cancelScan = useCallback(() => {
        if (!activeScanRef.current) return;
        abortRef.current?.abort();
        activeScanRef.current = null;
        abortRef.current = null;
        setStatus(STATUS.CANCELLED);
        setProgress({ phase: 'idle', completed: 0, total: 0 });
    }, []);

    // A different document invalidates every suggestion on screen.
    useEffect(() => {
        activeScanRef.current = null;
        abortRef.current?.abort();
        abortRef.current = null;
        setSuggestions([]);
        setManualReview([]);
        setStats(null);
        setError(null);
        setStatus(STATUS.IDLE);
        setProgress({ phase: 'idle', completed: 0, total: 0 });
    }, [file]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const startScan = useCallback(
        async ({ scope = 'current', selectedPages = [] } = {}) => {
            if (!canScan) return;

            const pages = resolveScanPages({ scope, selectedPages, activePage, numPages });
            if (pages.length === 0) {
                setError('Choose at least one page to scan.');
                setStatus(STATUS.ERROR);
                return;
            }

            const scanId = newScanId();
            const controller = new AbortController();
            abortRef.current?.abort();
            abortRef.current = controller;
            activeScanRef.current = scanId;

            /** True only while this scan is still the one the user is waiting for. */
            const isCurrent = () => activeScanRef.current === scanId && !controller.signal.aborted;

            setStatus(STATUS.SCANNING);
            setError(null);
            setSuggestions([]);
            setManualReview([]);
            setStats(null);
            setProgress({ phase: 'inspecting', completed: 0, total: pages.length });

            const rawSuggestions = [];
            const rawManualReview = [];
            let pdfDocument = null;

            try {
                pdfDocument = await loadPdfDocument(file);
                if (!isCurrent()) return;

                const inspection = await inspectPdfDocument(pdfDocument, pages, {
                    signal: controller.signal,
                });
                if (!isCurrent()) return;

                rawSuggestions.push(...inspection.rawSuggestions);
                rawManualReview.push(...inspection.manualReview);

                // Pages already described by embedded form widgets do not need a
                // visual guess — and must not be overruled by one.
                const pagesWithEmbeddedFields = new Set(
                    inspection.rawSuggestions
                        .filter((item) => item.confidence >= 0.9)
                        .map((item) => item.page),
                );
                const visionPages = pages.filter((page) => !pagesWithEmbeddedFields.has(page));

                if (visionPages.length > 0) {
                    const functions = getFunctions();
                    const analyze = httpsCallable(functions, 'analyzeEdocFieldPlacement');
                    const batches = chunk(visionPages, PAGES_PER_REQUEST);
                    let completed = pages.length - visionPages.length;

                    for (const batch of batches) {
                        if (!isCurrent()) return;
                        setProgress({ phase: 'rendering', completed, total: pages.length });

                        const rendered = [];
                        for (const pageNumber of batch) {
                            if (!isCurrent()) return;
                            const imageDataUrl = await renderPageToDataUrl(pdfDocument, pageNumber);
                            if (imageDataUrl) rendered.push({ pageNumber, imageDataUrl });
                        }
                        if (!isCurrent()) return;
                        if (rendered.length === 0) {
                            completed += batch.length;
                            continue;
                        }

                        setProgress({ phase: 'analyzing', completed, total: pages.length });

                        const response = await analyze({ companyId, scanId, pages: rendered });
                        // A response for a scan that is no longer current is
                        // dropped outright — this is the staleness guard.
                        if (!isCurrent()) return;
                        const payload = response?.data || {};
                        if (payload.scanId && payload.scanId !== scanId) continue;

                        for (const item of payload.suggestions || []) {
                            rawSuggestions.push({ ...item, source: 'vision' });
                        }
                        rawManualReview.push(...(payload.manualReview || []));

                        completed += batch.length;
                        setProgress({ phase: 'analyzing', completed, total: pages.length });
                    }
                }

                if (!isCurrent()) return;

                const allowedPages = new Set(pages);
                const built = buildSuggestionSet({
                    rawSuggestions,
                    existingFields: fieldsRef.current,
                    allowedPages,
                });

                const seenWarning = new Set();
                const warnings = rawManualReview
                    .map(normalizeManualReview)
                    .filter(Boolean)
                    .filter((entry) => {
                        const key = `${entry.page}:${entry.kind}`;
                        if (seenWarning.has(key)) return false;
                        seenWarning.add(key);
                        return true;
                    });

                setSuggestions(built.suggestions);
                setStats(built.stats);
                setManualReview(warnings);
                setLastScan({ scanId, scope, pages });
                setStatus(STATUS.READY);
                setProgress({ phase: 'done', completed: pages.length, total: pages.length });
            } catch (err) {
                if (!isCurrent()) return;
                // Never surface raw provider/document detail to the operator.
                const code = err?.code || '';
                if (code === 'functions/resource-exhausted') {
                    setError('Too many scans right now. Please wait a moment and try again.');
                } else if (code === 'functions/permission-denied') {
                    setError('You do not have access to run the AI Field Assistant for this company.');
                } else if (code === 'functions/failed-precondition') {
                    setError('The AI Field Assistant is not configured on the server yet.');
                } else if (code === 'functions/unavailable') {
                    setError('Could not reach the AI service. Please try again.');
                } else {
                    setError('The scan could not be completed. Please try again.');
                }
                setStatus(STATUS.ERROR);
                setProgress({ phase: 'idle', completed: 0, total: 0 });
            } finally {
                if (activeScanRef.current === scanId) {
                    activeScanRef.current = null;
                    abortRef.current = null;
                }
                try {
                    await pdfDocument?.destroy?.();
                } catch (_) {
                    // A document that is already gone is not an error.
                }
            }
        },
        [canScan, companyId, file, numPages, activePage],
    );

    /** Edit one suggestion in place. Re-validated so an edit cannot break it. */
    const updateSuggestion = useCallback((suggestionId, patch) => {
        setSuggestions((prev) =>
            prev.map((item) => {
                if (item.suggestionId !== suggestionId) return item;
                const merged = { ...item, ...patch };
                const revalidated = normalizeSuggestion(merged, {
                    idFactory: () => item.suggestionId,
                });
                if (!revalidated) return item;
                return {
                    ...revalidated,
                    suggestionId: item.suggestionId,
                    status: merged.status || item.status,
                    overlapsFieldId: item.overlapsFieldId,
                    overlapsFieldLabel: item.overlapsFieldLabel,
                };
            }),
        );
    }, []);

    const setSuggestionStatus = useCallback((suggestionId, nextStatus) => {
        setSuggestions((prev) =>
            prev.map((item) => (item.suggestionId === suggestionId ? { ...item, status: nextStatus } : item)),
        );
    }, []);

    const removeSuggestions = useCallback((suggestionIds) => {
        const ids = new Set(suggestionIds);
        setSuggestions((prev) => prev.filter((item) => !ids.has(item.suggestionId)));
    }, []);

    const discardAll = useCallback(() => {
        activeScanRef.current = null;
        abortRef.current?.abort();
        abortRef.current = null;
        setSuggestions([]);
        setManualReview([]);
        setStats(null);
        setError(null);
        setStatus(STATUS.IDLE);
        setProgress({ phase: 'idle', completed: 0, total: 0 });
    }, []);

    return {
        status,
        isScanning: status === STATUS.SCANNING,
        canScan,
        progress,
        suggestions,
        manualReview,
        stats,
        error,
        lastScan,
        startScan,
        cancelScan,
        updateSuggestion,
        setSuggestionStatus,
        removeSuggestions,
        discardAll,
    };
}

export default useAiFieldAssistant;
