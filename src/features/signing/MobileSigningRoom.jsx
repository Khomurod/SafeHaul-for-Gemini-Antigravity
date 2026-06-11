import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import {
    ArrowLeft, ArrowRight, CheckCircle, ChevronLeft, Eraser, FileText,
    Loader2, PenTool, Eye, X, Type, Calendar as CalendarIcon, CheckSquare,
    Fingerprint, ShieldCheck,
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { isFieldLocked } from '@features/signing/utils/prefillEngine';

const TYPE_ICONS = {
    text: Type,
    date: CalendarIcon,
    checkbox: CheckSquare,
    signature: PenTool,
    initial: Fingerprint,
};

const TYPE_LABELS = {
    text: 'Text',
    date: 'Date',
    checkbox: 'Confirmation',
    signature: 'Signature',
    initial: 'Initial',
};

function sortFieldsForFlow(fields) {
    return [...fields].sort((a, b) => {
        const pa = Number(a.pageNumber) || 1;
        const pb = Number(b.pageNumber) || 1;
        if (pa !== pb) return pa - pb;
        const ya = Number(a.yPosition) || 0;
        const yb = Number(b.yPosition) || 0;
        if (ya !== yb) return ya - yb;
        return (Number(a.xPosition) || 0) - (Number(b.xPosition) || 0);
    });
}

function isFieldComplete(field, value) {
    if (!field) return true;
    if (isFieldLocked(field)) return true;
    if (!field.required) return true;
    if (field.type === 'checkbox') return value === true;
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

/**
 * Full-screen signature capture sheet. Uses react-signature-canvas so strokes
 * are DPR-aware and we get a working undo via clear().
 */
function SignatureSheet({ kind, onCancel, onAdopt }) {
    const ref = useRef(null);
    const wrapperRef = useRef(null);
    const [size, setSize] = useState({ width: 320, height: 200 });
    const isInitial = kind === 'initial';

    useEffect(() => {
        const measure = () => {
            const el = wrapperRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setSize({
                width: Math.max(280, Math.floor(rect.width)),
                height: Math.max(180, Math.floor(rect.height)),
            });
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, []);

    const clear = () => ref.current?.clear();

    const adopt = () => {
        const pad = ref.current;
        if (!pad || pad.isEmpty()) return;
        // getTrimmedCanvas crops whitespace; falls back to full canvas in tests.
        let dataUrl;
        try {
            dataUrl = pad.getTrimmedCanvas().toDataURL('image/png');
        } catch {
            dataUrl = pad.toDataURL('image/png');
        }
        onAdopt(dataUrl);
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-white flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={isInitial ? 'Draw your initials' : 'Draw your signature'}
        >
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white"
                style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-gray-600 font-medium flex items-center gap-1 -ml-1 px-2 py-1"
                >
                    <ChevronLeft size={20} /> Cancel
                </button>
                <h2 className="font-bold text-gray-900">
                    {isInitial ? 'Draw your initials' : 'Draw your signature'}
                </h2>
                <button
                    type="button"
                    onClick={clear}
                    className="text-blue-600 font-medium px-2 py-1 flex items-center gap-1"
                >
                    <Eraser size={16} /> Clear
                </button>
            </div>

            <div ref={wrapperRef} className="flex-1 mx-4 my-4 border-2 border-dashed border-gray-300 rounded-xl bg-white relative">
                <SignatureCanvas
                    ref={ref}
                    canvasProps={{
                        width: size.width,
                        height: size.height,
                        className: 'rounded-xl',
                        style: { touchAction: 'none', width: '100%', height: '100%' },
                        'data-testid': 'mobile-signature-canvas',
                    }}
                    penColor="#0f172a"
                    minWidth={1.2}
                    maxWidth={2.6}
                    velocityFilterWeight={0.7}
                />
                <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none">
                    Sign with your finger
                </p>
            </div>

            <div
                className="px-4 pb-4 bg-white border-t border-gray-100"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <p className="text-[11px] text-gray-500 mb-3 leading-snug">
                    By tapping Adopt, you agree this drawing is your legal {isInitial ? 'initials' : 'signature'}.
                </p>
                <button
                    type="button"
                    onClick={adopt}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow active:scale-[0.98] transition"
                >
                    Adopt &amp; continue
                </button>
            </div>
        </div>
    );
}

/**
 * Fullscreen review sheet — driver can browse the entire PDF before submitting.
 * Honors react-pdf's responsive width so it stays readable on small screens.
 */
function ReviewSheet({ pdfUrl, onClose, jumpToPage }) {
    const [numPages, setNumPages] = useState(null);
    const [width, setWidth] = useState(() => Math.min(window.innerWidth - 16, 800));
    const pageRefs = useRef({});

    useEffect(() => {
        const handler = () => setWidth(Math.min(window.innerWidth - 16, 800));
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    useEffect(() => {
        if (!jumpToPage || !numPages) return;
        const el = pageRefs.current[jumpToPage];
        if (el) {
            // Defer to next frame so layout settles after pages render.
            requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
    }, [jumpToPage, numPages]);

    return (
        <div className="fixed inset-0 z-50 bg-gray-900/90 flex flex-col" role="dialog" aria-modal="true" aria-label="Review document">
            <div
                className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200"
                style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <FileText size={18} className="text-blue-600" /> Review
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-full"
                    aria-label="Close review"
                >
                    <X size={22} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col items-center gap-3">
                <Document
                    file={pdfUrl}
                    onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                    loading={(
                        <div className="text-white py-10 flex items-center gap-2">
                            <Loader2 className="animate-spin" size={20} /> Loading document…
                        </div>
                    )}
                >
                    {numPages > 0 && Array.from(new Array(numPages), (_, idx) => (
                        <div
                            key={idx}
                            ref={(el) => { pageRefs.current[idx + 1] = el; }}
                            className="bg-white shadow-lg rounded overflow-hidden"
                        >
                            <Page
                                pageNumber={idx + 1}
                                width={width}
                                renderAnnotationLayer={false}
                                renderTextLayer={false}
                            />
                        </div>
                    ))}
                </Document>
            </div>
        </div>
    );
}

export default function MobileSigningRoom({
    request,
    fieldValues,
    onFieldChange,
    onSubmit,
    submitting,
}) {
    const orderedFields = useMemo(
        () => sortFieldsForFlow((request?.fields || []).filter(Boolean)),
        [request?.fields],
    );

    const [currentIdx, setCurrentIdx] = useState(() => {
        const firstIncomplete = orderedFields.findIndex(
            (f) => !isFieldLocked(f) && f.required && !isFieldComplete(f, fieldValues[f.id]),
        );
        return firstIncomplete === -1 ? 0 : firstIncomplete;
    });

    const [signatureSheet, setSignatureSheet] = useState(null); // { fieldId, kind }
    const [savedSignature, setSavedSignature] = useState(null);
    const [savedInitial, setSavedInitial] = useState(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewJumpPage, setReviewJumpPage] = useState(null);

    const total = orderedFields.length;
    const requiredFields = useMemo(
        () => orderedFields.filter((f) => f.required && !isFieldLocked(f)),
        [orderedFields],
    );
    const completedRequired = requiredFields.filter((f) => isFieldComplete(f, fieldValues[f.id])).length;
    const allRequiredDone = completedRequired === requiredFields.length;

    const currentField = orderedFields[currentIdx];

    const goNext = () => setCurrentIdx((i) => Math.min(total - 1, i + 1));
    const goBack = () => setCurrentIdx((i) => Math.max(0, i - 1));

    const openSignature = (field) => {
        const kind = field.type === 'initial' ? 'initial' : 'signature';
        const saved = kind === 'initial' ? savedInitial : savedSignature;
        if (saved) {
            // Reuse the saved drawing immediately; user can tap "Redraw" for a new one.
            onFieldChange(field.id, saved);
            setTimeout(() => goNext(), 0);
            return;
        }
        setSignatureSheet({ fieldId: field.id, kind });
    };

    const handleAdoptSignature = (dataUrl) => {
        if (!signatureSheet) return;
        if (signatureSheet.kind === 'initial') {
            setSavedInitial(dataUrl);
        } else {
            setSavedSignature(dataUrl);
        }
        onFieldChange(signatureSheet.fieldId, dataUrl);
        setSignatureSheet(null);
        // Auto-advance after adoption so the driver keeps moving.
        setTimeout(() => goNext(), 0);
    };

    const redrawSignature = (field) => {
        const kind = field.type === 'initial' ? 'initial' : 'signature';
        if (kind === 'initial') setSavedInitial(null);
        else setSavedSignature(null);
        onFieldChange(field.id, '');
        setSignatureSheet({ fieldId: field.id, kind });
    };

    const renderFieldInput = (field) => {
        if (!field) return null;
        const value = fieldValues[field.id];
        const locked = isFieldLocked(field);

        if (locked) {
            return (
                <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4 text-gray-800 font-medium break-words">
                    {field.defaultValue || <span className="text-gray-400 italic">No value provided</span>}
                </div>
            );
        }

        switch (field.type) {
            case 'text':
                return (
                    <input
                        type="text"
                        value={value || ''}
                        onChange={(e) => onFieldChange(field.id, e.target.value)}
                        placeholder="Type here…"
                        className="w-full p-4 text-base border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                        autoComplete="off"
                        autoCapitalize="sentences"
                    />
                );
            case 'date':
                return (
                    <input
                        type="date"
                        value={value || ''}
                        onChange={(e) => onFieldChange(field.id, e.target.value)}
                        className="w-full p-4 text-base border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                    />
                );
            case 'checkbox': {
                const checked = value === true;
                return (
                    <button
                        type="button"
                        onClick={() => onFieldChange(field.id, !checked)}
                        className={`w-full p-5 rounded-xl border-2 flex items-center justify-between transition ${checked ? 'bg-purple-50 border-purple-500 text-purple-900' : 'bg-white border-gray-200 text-gray-700'}`}
                        aria-pressed={checked}
                    >
                        <span className="font-semibold">{checked ? 'Confirmed' : 'Tap to confirm'}</span>
                        <span
                            className={`w-7 h-7 rounded-md border-2 flex items-center justify-center ${checked ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 bg-white'}`}
                            aria-hidden
                        >
                            {checked ? <CheckCircle size={18} /> : null}
                        </span>
                    </button>
                );
            }
            case 'signature':
            case 'initial': {
                const isInitial = field.type === 'initial';
                const signed = !!value;
                const filledClasses = isInitial
                    ? 'rounded-xl border-2 bg-orange-50 border-orange-400 p-4 flex flex-col items-center gap-3'
                    : 'rounded-xl border-2 bg-yellow-50 border-yellow-400 p-4 flex flex-col items-center gap-3';
                const emptyClasses = isInitial
                    ? 'w-full p-6 rounded-xl border-2 border-dashed border-orange-400 bg-orange-50/60 text-orange-800 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition'
                    : 'w-full p-6 rounded-xl border-2 border-dashed border-yellow-400 bg-yellow-50/60 text-yellow-800 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition';
                return (
                    <div className="space-y-3">
                        {signed ? (
                            <div className={filledClasses}>
                                <img
                                    src={value}
                                    alt={isInitial ? 'Your initials' : 'Your signature'}
                                    className="max-h-32 object-contain"
                                />
                                <button
                                    type="button"
                                    onClick={() => redrawSignature(field)}
                                    className="text-blue-600 font-semibold text-sm underline"
                                >
                                    Redraw
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => openSignature(field)}
                                className={emptyClasses}
                            >
                                {isInitial ? <Fingerprint size={20} /> : <PenTool size={20} />}
                                {isInitial ? 'Tap to add initials' : 'Tap to sign'}
                            </button>
                        )}
                    </div>
                );
            }
            default:
                return (
                    <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 text-gray-500 text-sm">
                        Unsupported field type: {field.type}
                    </div>
                );
        }
    };

    const TypeIcon = currentField ? (TYPE_ICONS[currentField.type] || Type) : Type;
    const currentDone = currentField ? isFieldComplete(currentField, fieldValues[currentField.id]) : true;
    const isLastField = currentIdx === total - 1;
    const isLocked = currentField ? isFieldLocked(currentField) : false;
    const canAdvance = !currentField || isLocked || currentDone || !currentField.required;

    const handleReviewFromField = () => {
        if (currentField?.pageNumber) {
            setReviewJumpPage(Number(currentField.pageNumber) || 1);
        }
        setReviewOpen(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Header */}
            <header
                className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20"
                style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="font-bold text-gray-900 truncate text-base">
                            {request?.title || 'Document'}
                        </h1>
                        <p className="text-xs text-gray-500 truncate">
                            Signing as {request?.recipientName || 'Signer'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setReviewJumpPage(null);
                            setReviewOpen(true);
                        }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold active:bg-gray-200"
                    >
                        <Eye size={14} /> Review
                    </button>
                </div>

                {/* Progress */}
                <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 mb-1.5">
                        <span>Step {Math.min(currentIdx + 1, total)} of {total || 1}</span>
                        <span>{completedRequired}/{requiredFields.length} required done</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${total ? ((currentIdx + 1) / total) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            </header>

            {/* Field card */}
            <main className="flex-1 px-4 py-5 pb-40">
                {!currentField && (
                    <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-200">
                        <ShieldCheck size={32} className="text-blue-600 mx-auto mb-2" />
                        <p className="font-semibold text-gray-900">No fields to complete</p>
                        <p className="text-sm text-gray-500 mt-1">You can submit this document now.</p>
                    </div>
                )}
                {currentField && (
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <TypeIcon size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] uppercase tracking-wide font-bold text-gray-400">
                                    {TYPE_LABELS[currentField.type] || 'Field'}
                                    {!currentField.required && (
                                        <span className="ml-2 text-gray-400 normal-case font-medium tracking-normal">
                                            (optional)
                                        </span>
                                    )}
                                </p>
                                <h2 className="font-bold text-gray-900 leading-snug break-words">
                                    {currentField.label || `Field ${currentIdx + 1}`}
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Page {Number(currentField.pageNumber) || 1}
                                </p>
                            </div>
                        </div>

                        {renderFieldInput(currentField)}

                        <button
                            type="button"
                            onClick={handleReviewFromField}
                            className="w-full text-sm text-blue-600 font-semibold py-2 flex items-center justify-center gap-1.5"
                        >
                            <Eye size={14} /> View this in the document
                        </button>
                    </div>
                )}
            </main>

            {/* Bottom action bar */}
            <div
                className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-30"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
                {isLastField ? (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={goBack}
                            disabled={currentIdx === 0}
                            className="px-4 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-semibold disabled:opacity-40"
                            aria-label="Previous field"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={onSubmit}
                            disabled={!allRequiredDone || submitting}
                            className="flex-1 py-3.5 rounded-xl bg-green-600 text-white font-bold shadow active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                        >
                            {submitting ? (
                                <><Loader2 className="animate-spin" size={18} /> Submitting…</>
                            ) : (
                                <><CheckCircle size={18} /> Finish &amp; Submit</>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={goBack}
                            disabled={currentIdx === 0}
                            className="px-4 py-3.5 rounded-xl border border-gray-300 text-gray-700 font-semibold disabled:opacity-40"
                            aria-label="Previous field"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={!canAdvance}
                            className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-bold shadow active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            Next <ArrowRight size={18} />
                        </button>
                    </div>
                )}
            </div>

            {signatureSheet && (
                <SignatureSheet
                    kind={signatureSheet.kind}
                    onCancel={() => setSignatureSheet(null)}
                    onAdopt={handleAdoptSignature}
                />
            )}
            {reviewOpen && (
                <ReviewSheet
                    pdfUrl={request?.pdfUrl}
                    jumpToPage={reviewJumpPage}
                    onClose={() => setReviewOpen(false)}
                />
            )}
        </div>
    );
}
