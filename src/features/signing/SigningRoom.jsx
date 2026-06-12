import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { isFieldLocked } from '@features/signing/utils/prefillEngine';
import { normalizeSignerField } from '@features/signing/utils/signerFieldStyle';
import {
    sortFieldsForFlow,
    isFieldComplete,
    findFirstIncompleteField,
    findNextField,
} from '@features/signing/utils/signerFieldFlow';
import { ensureFieldVisible } from '@features/signing/utils/fieldViewport';
import { clampSignerZoom } from '@features/signing/utils/envelopePdfZoom';
import { SignerFieldOverlay } from '@features/signing/components/SignerFieldOverlay';
import { SignatureSheet } from '@features/signing/components/SignatureSheet';
import { usePdfZoomGestures } from '@features/signing/hooks/usePdfZoomGestures';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';
import { useIsMobile } from '@shared/hooks';
import { useToast } from '@shared/components/feedback';

const E2E_MOCK_PDF_URL =
    'data:application/pdf;base64,' +
    btoa('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
import { Document, Page, pdfjs } from 'react-pdf';
import {
    Loader2, CheckCircle, PenTool, ChevronDown, AlertTriangle, ShieldCheck,
    FileText, Ban, Fingerprint, ZoomIn, ZoomOut, RefreshCw,
} from 'lucide-react';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Fix: Use local worker to avoid CORS and 404s
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

// US Letter portrait ratio — used for page placeholders until the real page
// geometry arrives from pdf.js, so layout never jumps more than once.
const DEFAULT_PAGE_ASPECT = 1.294;

// Cap the fit-width on large screens for readability; zoom can exceed it.
const MAX_FIT_WIDTH = 800;
const MIN_FIT_WIDTH = 260;

// Focused fields smaller than this (CSS px) trigger an automatic zoom bump on
// touch devices — at fit-width on a phone, a 5%-height field is ~18px and
// unusable for typing. 2.5x cap keeps the bump from being disorienting.
const MIN_COMFORTABLE_FIELD_PX = 22;
const AUTO_ZOOM_MAX = 2.5;

// Draft storage — survives a tab refresh on flaky LTE so drivers don't lose typed values.
// Signatures (PNG dataURLs, ~10-50 KB each) are included; multi-signature docs fit comfortably
// under the typical 5 MB localStorage quota.
const DRAFT_KEY_PREFIX = 'signing_draft_v1';
const draftKey = (companyId, requestId) => `${DRAFT_KEY_PREFIX}:${companyId}:${requestId}`;

function readDraft(companyId, requestId) {
    try {
        const raw = localStorage.getItem(draftKey(companyId, requestId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function writeDraft(companyId, requestId, values) {
    try {
        localStorage.setItem(draftKey(companyId, requestId), JSON.stringify(values));
    } catch {
        // Quota exceeded or storage disabled — silently skip, in-memory state still works.
    }
}

function clearDraft(companyId, requestId) {
    try {
        localStorage.removeItem(draftKey(companyId, requestId));
    } catch {
        /* ignore */
    }
}

export default function SigningRoom() {
    const { companyId, requestId } = useParams();
    const [searchParams] = useSearchParams();
    const accessToken = searchParams.get('token');
    const isMobile = useIsMobile();
    const { showError } = useToast();

    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [numPages, setNumPages] = useState(null);

    // ESIGN-8 FIX: Track electronic consent before allowing signing.
    // UETA (15 U.S.C. Sec. 96) and ESIGN Act (15 U.S.C. Sec. 7001) require affirmative consent
    // to use electronic records/signatures. Without this screen, e-signatures may not be
    // legally enforceable in disputes.
    const [hasEsignConsent, setHasEsignConsent] = useState(false);

    // Data State
    const [fieldValues, setFieldValues] = useState({});
    // { fieldId, kind: 'signature' | 'initial' } while the drawing sheet is open
    const [activeSignature, setActiveSignature] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Document-rendering state for the unified (desktop + mobile) PDF view.
    const [pageAspects, setPageAspects] = useState({});
    // NET-SLOW FIX: Fields stay non-interactive per page until that page's
    // canvas has actually painted, so signers on throttled connections can't
    // fill boxes floating over a blank page.
    const [renderedPages, setRenderedPages] = useState(() => new Set());
    const [docError, setDocError] = useState(null);
    const [docReloadKey, setDocReloadKey] = useState(0);
    const [scrollerWidth, setScrollerWidth] = useState(() => window.innerWidth);

    // The signer draws once; later signature/initial fields are stamped with
    // the same ink in one tap (DocuSign-style "adopted signature").
    const adoptedInkRef = useRef({ signature: null, initial: null });

    // PROD-FIX: Refs for each page container, used for scroll-to-field navigation
    const pageRefs = useRef({});

    const {
        zoom,
        zoomIn,
        zoomOut,
        zoomToElement,
        setScrollerEl,
        scrollerEl,
        contentRef,
    } = usePdfZoomGestures();

    const isE2EMockShell =
        isE2ETestMode &&
        getE2EQueryParam('e2eSign', '') === 'mock' &&
        request?.pdfUrl === E2E_MOCK_PDF_URL;

    // Track the scroller's box (not the window) so rotation and split-screen
    // resizes re-fit the page instantly. ResizeObserver is guarded for older
    // engines / test DOMs and falls back to window resize events.
    useEffect(() => {
        if (!scrollerEl) return undefined;
        const update = () => setScrollerWidth(scrollerEl.clientWidth);
        update();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(update);
            ro.observe(scrollerEl);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
        };
    }, [scrollerEl]);

    // RACE FIX: Reset per-document render state when pdfUrl changes to prevent
    // stale pages/aspects bleeding into a different document.
    useEffect(() => {
        setPageAspects({});
        if (request?.pdfUrl === E2E_MOCK_PDF_URL) {
            setNumPages(1);
            setRenderedPages(new Set([1])); // mock shell has no real canvas to wait for
        } else {
            setNumPages(null);
            setRenderedPages(new Set());
        }
        setDocError(null);
    }, [request?.pdfUrl]);

    // 1. Load Document via Public API
    useEffect(() => {
        async function load() {
            if (!accessToken) {
                setError("Invalid Link: No access token provided.");
                setLoading(false);
                return;
            }

            if (isE2ETestMode && getE2EQueryParam('e2eSign', '') === 'mock') {
                const mockFields = [
                    { id: 'text1', type: 'text', pageNumber: 1, required: true, xPosition: 10, yPosition: 10, width: 20, height: 5 },
                    { id: 'date1', type: 'date', pageNumber: 1, required: true, xPosition: 10, yPosition: 20, width: 20, height: 5 },
                    { id: 'check1', type: 'checkbox', pageNumber: 1, required: true, xPosition: 10, yPosition: 30, width: 4, height: 3 },
                    { id: 'sig1', type: 'signature', pageNumber: 1, required: true, xPosition: 10, yPosition: 40, width: 20, height: 8 },
                    // Edge-anchored optional fields so e2e can verify overlays
                    // hug the page corners at any viewport / zoom.
                    { id: 'corner_tl', type: 'text', pageNumber: 1, required: false, xPosition: 0, yPosition: 0, width: 12, height: 4 },
                    { id: 'corner_br', type: 'checkbox', pageNumber: 1, required: false, xPosition: 93, yPosition: 95, width: 6, height: 4 },
                ].map(normalizeSignerField);
                setRequest({
                    title: 'E2E Test Document',
                    recipientName: 'E2E Signer',
                    status: 'sent',
                    pdfUrl: E2E_MOCK_PDF_URL,
                    fields: mockFields,
                });
                setFieldValues({
                    text1: 'Jane Doe',
                    date1: '2026-05-21',
                    check1: true,
                    sig1: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                });
                setLoading(false);
                return;
            }

            try {
                const getEnvelopeFn = httpsCallable(functions, 'getPublicEnvelope');
                const result = await getEnvelopeFn({
                    companyId,
                    requestId,
                    accessToken
                });

                const data = result.data;

                // PROD-FIX: Normalize pageNumber to a number to prevent type-mismatch rendering bugs.
                // Firestore sometimes stores numbers as strings, causing strict === to fail
                // in the per-page field filter and making fields invisible.
                if (data.fields) {
                    data.fields = data.fields.filter(f => f != null).map(normalizeSignerField);
                }

                setRequest(data);

                // Initialize Fields - filter out null/undefined entries
                if (data.fields) {
                    const initial = {};
                    data.fields.forEach(f => {
                        if (f.type === 'checkbox') {
                            initial[f.id] = false;
                            return;
                        }

                        if (f.type === 'text' || f.type === 'date') {
                            if (isFieldLocked(f)) {
                                initial[f.id] = String(f.defaultValue ?? '');
                            } else if (f.defaultValue) {
                                initial[f.id] = String(f.defaultValue);
                            } else {
                                initial[f.id] = '';
                            }
                            return;
                        }

                        initial[f.id] = '';
                    });

                    // Merge any persisted draft over the freshly-initialized defaults.
                    // Only restore values for fields that still exist; ignore locked fields
                    // (their value must come from the server-side defaultValue, not the client).
                    const draft = readDraft(companyId, requestId);
                    if (draft) {
                        data.fields.forEach((f) => {
                            if (!f || isFieldLocked(f)) return;
                            if (Object.prototype.hasOwnProperty.call(draft, f.id)) {
                                initial[f.id] = draft[f.id];
                            }
                        });
                    }

                    setFieldValues(initial);
                }
            } catch (err) {
                console.error("Load Error:", err);
                setError("Document not found or link expired.");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [companyId, requestId, accessToken]);

    const handleFieldChange = useCallback((id, value) => {
        setFieldValues(prev => {
            const next = { ...prev, [id]: value };
            if (companyId && requestId) {
                writeDraft(companyId, requestId, next);
            }
            return next;
        });
    }, [companyId, requestId]);

    // Reading-order list drives "next field" navigation, the progress chip,
    // and the keyboard Enter key — independent of authoring order in Firestore.
    const orderedFields = useMemo(
        () => sortFieldsForFlow(request?.fields),
        [request?.fields],
    );

    // PROD-FIX: Compute remaining required fields for the progress indicator
    const requiredFields = useMemo(
        () => orderedFields.filter(f => f.required && !isFieldLocked(f)),
        [orderedFields],
    );

    const completedCount = useMemo(
        () => requiredFields.filter(f => isFieldComplete(f, fieldValues[f.id])).length,
        [requiredFields, fieldValues],
    );

    const remainingCount = requiredFields.length - completedCount;

    const firstIncompleteField = useMemo(
        () => findFirstIncompleteField(orderedFields, fieldValues),
        [orderedFields, fieldValues],
    );

    const lockedRequiredMissing = useMemo(() => {
        return (request?.fields || []).filter((field) => {
            if (!field || !field.required || !isFieldLocked(field)) return false;
            return String(field.defaultValue || '').trim() === '';
        });
    }, [request?.fields]);

    // PROD-FIX: Scroll directly to a field overlay (not just its page) and
    // flash it so the signer can spot the box they still need to fill.
    const scrollToField = useCallback((field) => {
        if (!field) return;
        const overlayEl = scrollerEl?.querySelector(`[data-field-id="${field.id}"]`);
        const target = overlayEl || pageRefs.current[Number(field.pageNumber) || 1];
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        target.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
        setTimeout(() => {
            target.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
        }, 2000);
    }, [scrollerEl]);

    /**
     * KEYBOARD FIX: When the virtual keyboard opens it covers the lower ~45%
     * of the screen without resizing the layout viewport. Nudge the document
     * scroller so the focused field sits in the visible band, and — on touch
     * screens — bump the zoom first when the field is too small to type into.
     */
    const handleFieldFocus = useCallback((e) => {
        const el = e.target;
        if (isMobile) {
            const rect = el.getBoundingClientRect();
            if (rect.height > 0 && rect.height < MIN_COMFORTABLE_FIELD_PX) {
                const target = clampSignerZoom(
                    Math.min(AUTO_ZOOM_MAX, zoom * (MIN_COMFORTABLE_FIELD_PX + 6) / rect.height),
                );
                if (target > zoom + 0.1) {
                    zoomToElement(el, target);
                }
            }
        }
        ensureFieldVisible(el, scrollerEl);
    }, [isMobile, zoom, zoomToElement, scrollerEl]);

    /** Keyboard "Next"/Enter advances to the next fillable field in reading order. */
    const handleEnterAdvance = useCallback((field) => (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = findNextField(orderedFields, field.id);
        if (!next) {
            e.target.blur();
            return;
        }
        const nextInput = scrollerEl?.querySelector(`[data-signer-input="${next.id}"]`);
        if (nextInput) {
            nextInput.focus(); // focus handler scrolls it into the visible band
        } else {
            scrollToField(next); // signature/checkbox — show the signer where it is
        }
    }, [orderedFields, scrollerEl, scrollToField]);

    /**
     * Signature fields: first tap opens the drawing sheet; once ink has been
     * adopted, tapping another signature/initial box stamps the same ink in
     * one tap. Tapping an already-signed box re-opens the sheet to redraw.
     */
    const handleSignatureTap = useCallback((field) => {
        const kind = field.type === 'initial' ? 'initial' : 'signature';
        const saved = adoptedInkRef.current[kind];
        if (saved && !fieldValues[field.id]) {
            handleFieldChange(field.id, saved);
            return;
        }
        setActiveSignature({ fieldId: field.id, kind });
    }, [fieldValues, handleFieldChange]);

    const handleAdoptInk = useCallback((dataUrl) => {
        if (!activeSignature) return;
        adoptedInkRef.current[activeSignature.kind] = dataUrl;
        handleFieldChange(activeSignature.fieldId, dataUrl);
        setActiveSignature(null);
    }, [activeSignature, handleFieldChange]);

    const handleFinishSigning = async () => {
        if (lockedRequiredMissing.length > 0) {
            showError(
                'This document has required locked fields with no value. Please ask the sender to correct and resend it.'
            );
            scrollToField(lockedRequiredMissing[0]);
            return;
        }

        // Validate
        // Locked fields are seeded from defaultValue in state so payloads match the UI; server also merges empty strings for locked fields.
        // SAFETY: Guard against null/undefined elements in the fields array from corrupted Firestore data.
        const missing = (request?.fields || []).filter(f => f && f.required && !isFieldLocked(f) && !fieldValues[f.id]);
        if (missing.length > 0) {
            showError(`Please complete all required fields. (${missing.length} remaining)`);
            // PROD-FIX: Auto-scroll to the first missing field so the signer can find it
            scrollToField(missing[0]);
            return;
        }

        setSubmitting(true);
        try {
            if (isE2ETestMode && getE2EQueryParam('e2eSign', '') === 'mock') {
                clearDraft(companyId, requestId);
                setSuccess(true);
                return;
            }

            // The server-side publicSigning.js overrides the IP from the actual request context.
            // We still send userAgent for browser fingerprinting in the audit trail.
            const auditData = {
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            };

            const submitFn = httpsCallable(functions, 'submitPublicEnvelope');
            await submitFn({
                companyId,
                requestId,
                accessToken,
                fieldValues,
                auditData
            });

            clearDraft(companyId, requestId);
            setSuccess(true);
            // ESIGN-16 FIX: Confetti removed - document signing is a professional/legal act;
            // celebratory animations are inappropriate in regulated trucking compliance context.

        } catch (e) {
            console.error("Submission Error:", e);
            showError("Error saving document: " + e.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="animate-spin text-blue-600 mb-2" size={40} />
            <p className="text-gray-500 font-medium ml-3">Loading secure document...</p>
        </div>
    );

    if (error) return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h3>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );

    // PHASE 4: Voided document hard-stop
    if (request?.status === 'voided') return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-10 rounded-2xl shadow-xl border border-red-100 text-center max-w-md">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Ban size={48} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Voided</h2>
                <p className="text-gray-600 mb-6">
                    This document has been voided by the sender and is no longer accessible.
                </p>
                <button onClick={() => window.close()} className="text-gray-500 font-semibold hover:underline">
                    Close Window
                </button>
            </div>
        </div>
    );

    if (success) return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-10 rounded-2xl shadow-xl border border-green-100 text-center max-w-md animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Signed!</h2>
                <p className="text-gray-600 mb-6">
                    Thank you, <strong>{request.recipientName}</strong>. The document has been securely sealed and sent to the sender.
                </p>
                <button onClick={() => window.close()} className="text-blue-600 font-semibold hover:underline">
                    Close Window
                </button>
            </div>
        </div>
    );

    // ESIGN-8 FIX: Electronic consent screen required before document access.
    // UETA Sec. 5(b) and ESIGN Act Sec. 101(c) mandate that signers affirmatively agree to
    // conduct business electronically before they can be bound by electronic signatures.
    // The consent must be presented BEFORE the document is displayed (not inline).
    if (!hasEsignConsent) return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100 max-w-lg w-full">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <ShieldCheck size={28} className="text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Electronic Signature Consent</h2>
                        <p className="text-sm text-gray-500">Required before signing</p>
                    </div>
                </div>

                <div className="space-y-4 text-sm text-gray-700 mb-6">
                    <p>
                        You are about to electronically sign: <strong className="text-gray-900">{request?.title || 'a document'}</strong>.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-blue-900 flex items-center gap-2">
                            <FileText size={16} /> Electronic Records & Signature Disclosure
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-blue-800 text-xs">
                            <li>Your electronic signature is legally binding under the ESIGN Act (15 U.S.C. Sec. 7001) and UETA.</li>
                            <li>You agree to receive and sign this document electronically instead of on paper.</li>
                            <li>You may withdraw consent and request a paper copy by contacting the sender.</li>
                            <li>To sign electronically, you need a compatible web browser with JavaScript enabled.</li>
                            <li>Your IP address and browser information are recorded in the audit trail for this document.</li>
                        </ul>
                    </div>
                    <p className="text-gray-600">
                        By clicking <strong>"I Agree - Proceed to Sign"</strong>, you confirm that you have read and agree to use electronic records and signatures.
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => window.close()}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                    >
                        Decline
                    </button>
                    <button
                        onClick={() => setHasEsignConsent(true)}
                        className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                    >
                        <ShieldCheck size={18} />
                        I Agree - Proceed to Sign
                    </button>
                </div>
            </div>
        </div>
    );

    // ------------------------------------------------------------------
    // Unified document-first view (desktop AND mobile).
    //
    // The PDF is always the source of truth on screen: fields are rendered as
    // percent-positioned overlays INSIDE each page container, so they scale
    // with the page at every viewport size and zoom level, and taps resolve
    // through native DOM hit testing (no coordinate math to drift).
    // ------------------------------------------------------------------

    const gutterX = isMobile ? 16 : 40; // matches px-2 / md:px-5 on the gutter wrapper
    const fitWidth = Math.max(MIN_FIT_WIDTH, Math.min(scrollerWidth - gutterX, MAX_FIT_WIDTH));
    const renderedWidth = Math.round(fitWidth * zoom);
    const zoomLabel = `${Math.round(zoom * 100)}%`;

    const fillClass = 'w-full h-full min-w-0 min-h-0 box-border';

    const renderField = (field) => {
        if (request.status === 'signed') return null;

        switch (field.type) {
            case 'text': {
                if (isFieldLocked(field)) {
                    return (
                        <SignerFieldOverlay field={field} interactive={false}>
                            <div className={`${fillClass} border-2 border-blue-300 bg-blue-50/90 px-2 text-sm rounded flex items-center text-gray-700 font-medium overflow-hidden`}>
                                {field.defaultValue || ''}
                            </div>
                        </SignerFieldOverlay>
                    );
                }
                return (
                    <SignerFieldOverlay field={field}>
                        <input
                            className={`${fillClass} border-2 border-blue-400 bg-blue-50/90 px-2 text-base md:text-sm rounded`}
                            placeholder="Type here..."
                            value={fieldValues[field.id] || ''}
                            data-signer-input={field.id}
                            enterKeyHint="next"
                            onFocus={handleFieldFocus}
                            onKeyDown={handleEnterAdvance(field)}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        />
                    </SignerFieldOverlay>
                );
            }
            case 'date': {
                if (isFieldLocked(field)) {
                    return (
                        <SignerFieldOverlay field={field} interactive={false}>
                            <div className={`${fillClass} border-2 border-green-300 bg-green-50/90 px-2 text-sm rounded flex items-center text-gray-700 font-medium overflow-hidden`}>
                                {field.defaultValue || ''}
                            </div>
                        </SignerFieldOverlay>
                    );
                }
                return (
                    <SignerFieldOverlay field={field}>
                        <input
                            type="date"
                            className={`${fillClass} border-2 border-green-400 bg-green-50/90 px-2 text-base md:text-sm rounded`}
                            value={fieldValues[field.id] || ''}
                            data-signer-input={field.id}
                            onFocus={handleFieldFocus}
                            onKeyDown={handleEnterAdvance(field)}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        />
                    </SignerFieldOverlay>
                );
            }
            case 'checkbox':
                return (
                    <SignerFieldOverlay field={field}>
                        <label className={`${fillClass} flex items-center justify-center cursor-pointer m-0`}>
                            <input
                                type="checkbox"
                                className="w-full h-full max-w-full max-h-full min-w-0 min-h-0 accent-purple-600 cursor-pointer m-0"
                                checked={!!fieldValues[field.id]}
                                onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                            />
                        </label>
                    </SignerFieldOverlay>
                );
            case 'signature':
            case 'initial': {
                const isInitial = field.type === 'initial';
                const value = fieldValues[field.id];
                const palette = isInitial
                    ? { signed: 'bg-orange-50/80 border-orange-500', empty: 'bg-orange-50/90 border-orange-400 hover:bg-orange-100 animate-pulse', text: 'text-orange-700' }
                    : { signed: 'bg-yellow-50/80 border-yellow-500', empty: 'bg-yellow-50/90 border-yellow-400 hover:bg-yellow-100 animate-pulse', text: 'text-yellow-700' };
                return (
                    <SignerFieldOverlay field={field}>
                        <button
                            type="button"
                            onClick={() => handleSignatureTap(field)}
                            aria-label={
                                value
                                    ? (isInitial ? 'Initials added — tap to redraw' : 'Signature added — tap to redraw')
                                    : (isInitial ? 'Tap to add initials' : 'Tap to sign')
                            }
                            className={`${fillClass} cursor-pointer border-2 ${value ? 'border-solid p-0.5' : 'border-dashed'} rounded flex items-center justify-center gap-1 shadow-sm transition ${value ? palette.signed : palette.empty}`}
                        >
                            {value ? (
                                // Show the actual ink on the document — the signer
                                // sees exactly what the sealed PDF will contain.
                                <img
                                    src={value}
                                    alt={isInitial ? 'Your initials' : 'Your signature'}
                                    className="w-full h-full object-contain pointer-events-none"
                                    draggable={false}
                                />
                            ) : (
                                <span className={`${palette.text} font-medium text-xs flex items-center gap-1`}>
                                    {isInitial ? <Fingerprint size={12} /> : <PenTool size={14} />}
                                    {isInitial ? 'Initial' : 'Sign'}
                                </span>
                            )}
                        </button>
                    </SignerFieldOverlay>
                );
            }
            default:
                return null;
        }
    };

    const renderSigningPages = () =>
        numPages > 0 &&
        Array.from(new Array(numPages), (el, index) => {
            const pageNumber = index + 1;
            const aspect = pageAspects[pageNumber] || DEFAULT_PAGE_ASPECT;
            const isPageReady = renderedPages.has(pageNumber);
            return (
                <div
                    key={pageNumber}
                    ref={(node) => { pageRefs.current[pageNumber] = node; }}
                    data-signing-page={pageNumber}
                    className="relative shadow-xl border border-gray-300 bg-white"
                    // Explicit dimensions from the known aspect ratio keep layout
                    // (and overlay anchors) stable while canvases re-render after
                    // a zoom commit or rotation.
                    style={{ width: renderedWidth, height: Math.round(renderedWidth * aspect) }}
                >
                    {!isE2EMockShell && (
                        <Page
                            pageNumber={pageNumber}
                            width={renderedWidth}
                            renderAnnotationLayer={false}
                            renderTextLayer={false}
                            loading={null}
                            onLoadSuccess={(page) => {
                                try {
                                    const vp = page.getViewport({ scale: 1 });
                                    const ratio = vp.height / vp.width;
                                    setPageAspects((prev) =>
                                        prev[pageNumber] === ratio ? prev : { ...prev, [pageNumber]: ratio },
                                    );
                                } catch {
                                    /* keep the default Letter aspect */
                                }
                            }}
                            onRenderSuccess={() => {
                                setRenderedPages((prev) => {
                                    if (prev.has(pageNumber)) return prev;
                                    const next = new Set(prev);
                                    next.add(pageNumber);
                                    return next;
                                });
                            }}
                        />
                    )}

                    {!isPageReady && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm gap-2">
                            <Loader2 className="animate-spin" size={18} /> Rendering page {pageNumber}…
                        </div>
                    )}

                    {/* NET-SLOW FIX: keep overlays inert until the page has painted */}
                    <div className={isPageReady ? undefined : 'pointer-events-none opacity-60'}>
                        {orderedFields
                            .filter((f) => Number(f?.pageNumber) === pageNumber)
                            .map((field) => (
                                <React.Fragment key={field.id}>{renderField(field)}</React.Fragment>
                            ))}
                    </div>
                </div>
            );
        });

    const progressChip = requiredFields.length > 0 && (
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${remainingCount === 0 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {remainingCount === 0 ? (
                <><CheckCircle size={14} /> <span className="hidden sm:inline">All fields complete</span><span className="sm:hidden">Done</span></>
            ) : (
                <><AlertTriangle size={14} /> {remainingCount} <span className="hidden sm:inline">field{remainingCount > 1 ? 's' : ''} remaining</span><span className="sm:hidden">left</span></>
            )}
        </div>
    );

    const zoomControls = (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
                type="button"
                onClick={zoomOut}
                aria-label="Zoom out"
                className="p-2 rounded-md text-gray-600 hover:bg-white hover:shadow-sm active:scale-95 transition"
            >
                <ZoomOut size={18} />
            </button>
            <span className="text-xs font-bold text-gray-600 w-11 text-center tabular-nums" aria-live="polite">
                {zoomLabel}
            </span>
            <button
                type="button"
                onClick={zoomIn}
                aria-label="Zoom in"
                className="p-2 rounded-md text-gray-600 hover:bg-white hover:shadow-sm active:scale-95 transition"
            >
                <ZoomIn size={18} />
            </button>
        </div>
    );

    return (
        // 100dvh tracks the *dynamic* mobile viewport (URL bar collapse); the
        // h-screen class is the fallback where dvh is unsupported.
        <div className="h-screen bg-gray-100 flex flex-col font-sans" style={{ height: '100dvh' }}>
            <header
                className="bg-white px-3 py-2 md:px-4 md:py-3 shadow-sm flex justify-between items-center gap-2 z-30 shrink-0"
                style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
            >
                <div className="min-w-0">
                    <h1 className="font-bold text-gray-800 truncate text-sm md:text-base">{request?.title || 'Document'}</h1>
                    <p className="text-xs text-gray-500 truncate">Signing as: {request?.recipientName || 'Signer'}</p>
                </div>

                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    {progressChip}
                    <div className="hidden md:block">{zoomControls}</div>
                    <button
                        onClick={handleFinishSigning}
                        disabled={submitting}
                        className="hidden md:flex px-6 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 transition items-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        Finish & Submit
                    </button>
                </div>
            </header>

            {/* The document scroller: native one-finger pan on both axes; the
                gesture hook intercepts two-finger pinch. relative is required
                so the page stack's offsetLeft/Top resolve against it. */}
            <div
                ref={setScrollerEl}
                data-signing-scroller
                className="flex-1 overflow-auto overscroll-contain bg-gray-200/50 relative"
                style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
            >
                {docError ? (
                    <div className="h-full flex items-center justify-center p-6">
                        <div className="bg-white rounded-xl border border-red-100 shadow p-6 text-center max-w-sm">
                            <AlertTriangle size={32} className="text-red-500 mx-auto mb-3" />
                            <h3 className="font-bold text-gray-900 mb-1">Couldn't load the document</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Check your connection and try again. Your entered values are saved on this device.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setDocError(null);
                                    setNumPages(null);
                                    setRenderedPages(new Set());
                                    setDocReloadKey((k) => k + 1);
                                }}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-lg"
                            >
                                <RefreshCw size={16} /> Try again
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="px-2 py-4 md:px-5 md:py-8 pb-28 md:pb-8">
                        <div
                            ref={contentRef}
                            className="mx-auto flex flex-col items-center gap-4 md:gap-6"
                            style={{ width: renderedWidth }}
                        >
                            {isE2EMockShell ? (
                                renderSigningPages()
                            ) : (
                                <Document
                                    key={docReloadKey}
                                    file={request.pdfUrl}
                                    onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
                                    onLoadError={(err) => {
                                        console.error('PDF load error:', err);
                                        setDocError(err?.message || 'load_failed');
                                    }}
                                    loading={(
                                        <div className="flex items-center gap-2 text-gray-500 py-16">
                                            <Loader2 className="animate-spin" size={20} /> Loading document…
                                        </div>
                                    )}
                                    className="flex flex-col items-center gap-4 md:gap-6"
                                >
                                    {renderSigningPages()}
                                </Document>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop keeps the floating jump pill; mobile gets a fixed action
                bar with zoom + next/finish (thumb-reachable, above safe area). */}
            {firstIncompleteField && (
                <div className="hidden md:block fixed bottom-6 right-6 z-40">
                    <button
                        onClick={() => scrollToField(firstIncompleteField)}
                        className="bg-blue-600 text-white px-4 py-3 rounded-xl shadow-2xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-all animate-bounce"
                    >
                        <ChevronDown size={18} />
                        Jump to next field (Page {Number(firstIncompleteField.pageNumber) || 1})
                    </button>
                </div>
            )}

            <div
                className="md:hidden bg-white border-t border-gray-200 px-3 py-2 flex items-center gap-2 z-40 shrink-0"
                style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
                {zoomControls}
                <div className="flex-1" />
                {remainingCount > 0 && firstIncompleteField ? (
                    <button
                        type="button"
                        onClick={() => scrollToField(firstIncompleteField)}
                        className="px-4 py-3 bg-blue-600 text-white font-bold rounded-xl shadow text-sm flex items-center gap-1.5 active:scale-[0.98] transition"
                    >
                        <ChevronDown size={16} /> Next field
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleFinishSigning}
                        disabled={submitting}
                        className="px-5 py-3 bg-green-600 text-white font-bold rounded-xl shadow text-sm flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition"
                    >
                        {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        Finish & Submit
                    </button>
                )}
            </div>

            {activeSignature && (
                <SignatureSheet
                    kind={activeSignature.kind}
                    onCancel={() => setActiveSignature(null)}
                    onAdopt={handleAdoptInk}
                />
            )}
        </div>
    );
}
