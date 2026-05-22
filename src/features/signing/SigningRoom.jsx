import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { initializeSignatureCanvas, clearCanvas, isCanvasEmpty, getSignatureDataUrl } from '@lib/signature';
import { isFieldLocked } from '@features/signing/utils/prefillEngine';
import { normalizeSignerField } from '@features/signing/utils/signerFieldStyle';
import { SignerFieldOverlay } from '@features/signing/components/SignerFieldOverlay';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';

const E2E_MOCK_PDF_URL =
    'data:application/pdf;base64,' +
    btoa('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, CheckCircle, PenTool, X, ChevronDown, AlertTriangle, ShieldCheck, FileText, Ban, Fingerprint } from 'lucide-react';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Fix: Use local worker to avoid CORS and 404s
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

export default function SigningRoom() {
    const { companyId, requestId } = useParams();
    const [searchParams] = useSearchParams();
    const accessToken = searchParams.get('token');

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
    const [activeSignatureField, setActiveSignatureField] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // PROD-FIX: Refs for each page container, used for scroll-to-field navigation
    const pageRefs = useRef({});

    // MED-4 FIX: Track window width for responsive PDF rendering
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // RACE FIX: Reset numPages when pdfUrl changes to prevent stale page rendering
    useEffect(() => {
        if (request?.pdfUrl === E2E_MOCK_PDF_URL) {
            setNumPages(1);
        } else {
            setNumPages(null);
        }
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

    // Init Canvas
    useEffect(() => {
        if (activeSignatureField) setTimeout(initializeSignatureCanvas, 100);
    }, [activeSignatureField]);

    const handleFieldChange = (id, value) => {
        setFieldValues(prev => ({ ...prev, [id]: value }));
    };

    const handleSaveSignature = async () => {
        if (isCanvasEmpty()) return alert("Please sign first.");
        const sigData = getSignatureDataUrl();
        handleFieldChange(activeSignatureField, sigData);
        setActiveSignatureField(null);
    };

    // PROD-FIX: Compute remaining required fields for the progress indicator
    const requiredFields = useMemo(() => {
        if (!request?.fields) return [];
        return request.fields.filter(f => f && f.required && !isFieldLocked(f));
    }, [request?.fields]);

    const completedCount = useMemo(() => {
        return requiredFields.filter(f => !!fieldValues[f.id]).length;
    }, [requiredFields, fieldValues]);

    const remainingCount = requiredFields.length - completedCount;

    // PROD-FIX: Find the first incomplete required field for "Jump to" navigation
    const firstIncompleteField = useMemo(() => {
        return requiredFields.find(f => !fieldValues[f.id]) || null;
    }, [requiredFields, fieldValues]);

    const lockedRequiredMissing = useMemo(() => {
        return (request?.fields || []).filter((field) => {
            if (!field || !field.required || !isFieldLocked(field)) return false;
            return String(field.defaultValue || '').trim() === '';
        });
    }, [request?.fields]);

    // PROD-FIX: Scroll to the page containing a specific field
    const scrollToField = useCallback((field) => {
        if (!field) return;
        const pageNum = Number(field.pageNumber) || 1;
        const pageEl = pageRefs.current[pageNum];
        if (pageEl) {
            pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Briefly flash the field's border via CSS class
            pageEl.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
            setTimeout(() => {
                pageEl.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
            }, 2000);
        }
    }, []);

    const handleFinishSigning = async () => {
        if (lockedRequiredMissing.length > 0) {
            alert(
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
            alert(`Please complete all required fields. (${missing.length} remaining)`);
            // PROD-FIX: Auto-scroll to the first missing field so the signer can find it
            scrollToField(missing[0]);
            return;
        }

        setSubmitting(true);
        try {
            if (isE2ETestMode && getE2EQueryParam('e2eSign', '') === 'mock') {
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

            setSuccess(true);
            // ESIGN-16 FIX: Confetti removed - document signing is a professional/legal act;
            // celebratory animations are inappropriate in regulated trucking compliance context.

        } catch (e) {
            console.error("Submission Error:", e);
            alert("Error saving document: " + e.message);
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

    const handleInputFocus = (e) => {
        setTimeout(() => {
            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    };

    const fillClass = 'w-full h-full min-w-0 min-h-0 box-border';
    const pdfRenderWidth = Math.min(windowWidth - 40, 800);
    const isE2EMockShell =
        isE2ETestMode &&
        getE2EQueryParam('e2eSign', '') === 'mock' &&
        request?.pdfUrl === E2E_MOCK_PDF_URL;

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
                            className={`${fillClass} border-2 border-blue-400 bg-blue-50/90 px-2 text-sm rounded`}
                            placeholder="Type here..."
                            value={fieldValues[field.id] || ''}
                            onFocus={handleInputFocus}
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
                            className={`${fillClass} border-2 border-green-400 bg-green-50/90 px-2 text-sm rounded`}
                            value={fieldValues[field.id] || ''}
                            onFocus={handleInputFocus}
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
            case 'signature': {
                const isSigned = !!fieldValues[field.id];
                return (
                    <SignerFieldOverlay field={field}>
                        <button
                            type="button"
                            onClick={() => setActiveSignatureField(field.id)}
                            className={`${fillClass} cursor-pointer border-2 border-dashed rounded flex items-center justify-center gap-2 shadow-sm transition ${isSigned ? 'bg-yellow-100 border-yellow-600' : 'bg-yellow-50/90 border-yellow-400 hover:bg-yellow-100 animate-pulse'}`}
                        >
                            {isSigned ? (
                                <span className="text-yellow-800 font-bold text-xs flex items-center gap-1">
                                    <CheckCircle size={14} /> Signed
                                </span>
                            ) : (
                                <span className="text-yellow-700 font-medium text-xs flex items-center gap-1">
                                    <PenTool size={14} /> Sign
                                </span>
                            )}
                        </button>
                    </SignerFieldOverlay>
                );
            }
            case 'initial': {
                const isInitialed = !!fieldValues[field.id];
                return (
                    <SignerFieldOverlay field={field}>
                        <button
                            type="button"
                            onClick={() => setActiveSignatureField(field.id)}
                            className={`${fillClass} cursor-pointer border-2 border-dashed rounded flex items-center justify-center gap-1 shadow-sm transition ${isInitialed ? 'bg-orange-100 border-orange-600' : 'bg-orange-50/90 border-orange-400 hover:bg-orange-100 animate-pulse'}`}
                        >
                            {isInitialed ? (
                                <span className="text-orange-800 font-bold text-[10px] flex items-center gap-1">
                                    <CheckCircle size={12} /> Initialed
                                </span>
                            ) : (
                                <span className="text-orange-700 font-medium text-[10px] flex items-center gap-1">
                                    <Fingerprint size={12} /> Initial
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
        Array.from(new Array(numPages), (el, index) => (
            <div
                key={index}
                ref={(el) => { pageRefs.current[index + 1] = el; }}
                className="relative shadow-xl border border-gray-300 bg-white inline-block transition-all duration-300"
                style={
                    isE2EMockShell
                        ? { width: pdfRenderWidth, height: Math.round(pdfRenderWidth * 1.294) }
                        : undefined
                }
            >
                {!isE2EMockShell && (
                    <Page
                        pageNumber={index + 1}
                        width={pdfRenderWidth}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                    />
                )}
                {(request?.fields || [])
                    .filter((f) => Number(f?.pageNumber) === index + 1)
                    .map((field) => (
                        <React.Fragment key={field.id}>{renderField(field)}</React.Fragment>
                    ))}
            </div>
        ));

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
            <header className="bg-white p-4 shadow-sm flex justify-between items-center sticky top-0 z-30">
                <div>
                    <h1 className="font-bold text-gray-800">{request?.title || 'Document'}</h1>
                    <p className="text-xs text-gray-500">Signing as: {request?.recipientName || 'Signer'}</p>
                </div>

                {/* PROD-FIX: Progress counter showing remaining fields */}
                <div className="flex items-center gap-3">
                    {requiredFields.length > 0 && (
                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${remainingCount === 0 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {remainingCount === 0 ? (
                                <><CheckCircle size={14} /> All fields complete</>
                            ) : (
                                <><AlertTriangle size={14} /> {remainingCount} field{remainingCount > 1 ? 's' : ''} remaining</>
                            )}
                        </div>
                    )}

                    <button onClick={handleFinishSigning} disabled={submitting} className="px-6 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50">
                        {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        Finish & Submit
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 flex justify-center bg-gray-200/50">
                {isE2EMockShell ? (
                    <div className="flex flex-col gap-6">{renderSigningPages()}</div>
                ) : (
                    <Document
                        file={request.pdfUrl}
                        onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
                        className="flex flex-col gap-6"
                    >
                        {renderSigningPages()}
                    </Document>
                )}
            </main>

            {/* PROD-FIX: Floating "Jump to next field" button - only shows when there are incomplete required fields */}
            {firstIncompleteField && (
                <div className="fixed bottom-6 right-6 z-40">
                    <button
                        onClick={() => scrollToField(firstIncompleteField)}
                        className="bg-blue-600 text-white px-4 py-3 rounded-xl shadow-2xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-all animate-bounce"
                    >
                        <ChevronDown size={18} />
                        Jump to next field (Page {Number(firstIncompleteField.pageNumber) || 1})
                    </button>
                </div>
            )}

            {activeSignatureField && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="bg-gray-50 p-4 border-b flex justify-between items-center"><h3 className="font-bold text-gray-700">Draw Your Signature</h3><button onClick={() => setActiveSignatureField(null)}><X size={20} /></button></div>
                        <div className="p-6 text-center">
                            <div className="border-2 border-dashed border-gray-300 rounded bg-white mb-4 relative"><canvas id="signature-canvas" className="w-full h-40 touch-none cursor-crosshair"></canvas><button id="clear-signature" onClick={clearCanvas} className="absolute bottom-2 right-2 text-xs text-red-500 bg-white border border-gray-200 px-2 py-1 rounded">Clear</button></div>
                            <p className="text-xs text-gray-400">By clicking "Adopt", I agree this is my legal signature.</p>
                        </div>
                        <div className="p-4 bg-gray-50 flex justify-end gap-2 border-t"><button onClick={() => setActiveSignatureField(null)} className="px-4 py-2 text-gray-600 font-medium">Cancel</button><button onClick={handleSaveSignature} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">Adopt Signature</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
