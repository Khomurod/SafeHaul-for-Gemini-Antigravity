import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    X,
    Mail,
    Printer,
    Send,
    ShieldCheck,
    Info,
    FileText,
    Loader2,
    Building2,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';
import {
    fetchFmcsaCarrierCandidatesForPev,
    mapFmcsaRowToPevContact,
    normalizeEmployerStateToFmcsaPhyState,
} from '@shared/services/fmcsaEmployerSocrata';

function employerDisplayName(employer) {
    return String(employer?.companyName || employer?.name || '').trim();
}

function buildFmcsaRowKey(row, index) {
    const dot = row?.dot_number === undefined || row?.dot_number === null ? 'x' : String(row.dot_number).trim();
    return `${dot}-${index}`;
}

export function PEVRequestModal({ employer, applicant: _applicant, onClose, onProceed }) {
    const socrataToken = import.meta.env.VITE_SOCRATA_APP_TOKEN;

    const [contactInfo, setContactInfo] = useState({
        email: employer.companyEmail || employer.email || '',
        fax: employer.fax || '',
        phone: employer.phone || ''
    });

    const [deliveryMethod, setDeliveryMethod] = useState('email');

    const [fmcsaLoading, setFmcsaLoading] = useState(false);
    const [fmcsaError, setFmcsaError] = useState(null);
    const [fmcsaRows, setFmcsaRows] = useState([]);
    const abortRef = useRef(null);

    const [selectedFmcsaKey, setSelectedFmcsaKey] = useState(null);
    /** After selecting a census row: whether FMCSA returned any email/fax/phone on that row */
    const [lastFmcsaRowHadContact, setLastFmcsaRowHadContact] = useState(null);

    const [proceedError, setProceedError] = useState({ field: null, message: '' });

    const emailInputRef = useRef(null);
    const faxInputRef = useRef(null);
    const emailSectionRef = useRef(null);
    const faxSectionRef = useRef(null);

    const companyLabel = employerDisplayName(employer);
    const employerStateRaw = employer?.state ?? '';
    const fmcsaStateCode = useMemo(
        () => normalizeEmployerStateToFmcsaPhyState(employerStateRaw),
        [employerStateRaw],
    );

    useEffect(() => {
        setSelectedFmcsaKey(null);
        setLastFmcsaRowHadContact(null);
        setProceedError({ field: null, message: '' });
    }, [companyLabel, employerStateRaw]);

    useEffect(() => {
        if (!socrataToken || companyLabel.length < 2) {
            setFmcsaRows([]);
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        let cancelled = false;
        (async () => {
            setFmcsaLoading(true);
            setFmcsaError(null);
            try {
                const rows = await fetchFmcsaCarrierCandidatesForPev(companyLabel, {
                    appToken: socrataToken,
                    signal: controller.signal,
                    employerState: employerStateRaw,
                });
                if (!cancelled) {
                    setFmcsaRows(rows);
                    setSelectedFmcsaKey(null);
                    setLastFmcsaRowHadContact(null);
                }
            } catch (e) {
                if (e?.name === 'AbortError') return;
                if (!cancelled) {
                    console.warn('[PEVRequestModal] FMCSA lookup', e);
                    setFmcsaError('Could not load FMCSA registry suggestions.');
                    setFmcsaRows([]);
                }
            } finally {
                if (!cancelled) setFmcsaLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [socrataToken, companyLabel, employerStateRaw]);

    const applyFmcsaRow = useCallback((row, rowIndex) => {
        const m = mapFmcsaRowToPevContact(row);
        const key = buildFmcsaRowKey(row, rowIndex);
        const censusHadContact = !!(m.email || m.fax || m.phone);

        setSelectedFmcsaKey(key);
        setLastFmcsaRowHadContact(censusHadContact);
        setProceedError({ field: null, message: '' });

        setContactInfo((prev) => ({
            ...prev,
            email: m.email || prev.email,
            fax: m.fax || prev.fax,
            phone: m.phone || prev.phone,
        }));
    }, []);

    const methods = useMemo(() => {
        const hasEmail = !!(String(contactInfo.email || '').trim() || employer.companyEmail || employer.email);
        const hasFax = !!(String(contactInfo.fax || '').trim() || employer.fax);
        return [
            {
                id: 'email',
                label: 'E-mail with Portal Link',
                icon: Mail,
                description: 'Send a secure online verification form to the employer. They can respond in 2-3 minutes.',
                active: hasEmail,
            },
            {
                id: 'fax',
                label: 'Fax Transmission',
                icon: Printer,
                description: 'Electronic fax delivery + generate portal link to share manually.',
                active: hasFax,
            },
            {
                id: 'manual',
                label: 'Download / Print',
                icon: FileText,
                description: 'Download PDF + generate a sharable portal link to email or hand over.',
                active: true,
            },
        ];
    }, [contactInfo.email, contactInfo.fax, employer]);

    const handleDeliveryMethodChange = (id) => {
        setDeliveryMethod(id);
        setProceedError({ field: null, message: '' });
    };

    const handleContinue = () => {
        setProceedError({ field: null, message: '' });

        if (deliveryMethod === 'email' && !String(contactInfo.email || '').trim()) {
            setProceedError({
                field: 'email',
                message: 'Enter the employer\'s email address to send the portal link, or switch to Download / Print.',
            });
            requestAnimationFrame(() => {
                emailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                emailInputRef.current?.focus();
            });
            return;
        }
        if (deliveryMethod === 'fax' && !String(contactInfo.fax || '').trim()) {
            setProceedError({
                field: 'fax',
                message: 'Enter the fax number, or switch to Download / Print.',
            });
            requestAnimationFrame(() => {
                faxSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                faxInputRef.current?.focus();
            });
            return;
        }
        onProceed(deliveryMethod, contactInfo);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-slate-900 p-6 text-white relative shrink-0">
                    <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition">
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-500 rounded-lg">
                            <ShieldCheck size={24} />
                        </div>
                        <h3 className="text-xl font-bold">Initiate Verification</h3>
                    </div>
                    <p className="text-slate-400 text-sm">Verify employment for <span className="text-white font-semibold">{companyLabel || 'Employer'}</span></p>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {/* FMCSA suggestions */}
                    {socrataToken && companyLabel.length >= 2 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                                <Building2 size={14} className="text-blue-600" />
                                FMCSA company match
                            </div>
                            {fmcsaStateCode && (
                                <p className="text-[10px] text-slate-600 leading-snug">
                                    Prioritizing carriers in <span className="font-semibold">{fmcsaStateCode}</span> (employment address state). If none match there, results include other states.
                                </p>
                            )}
                            <p className="text-[10px] text-slate-500 leading-snug">
                                Tap a row to use that census record. Email and fax fill in only when FMCSA publishes them; otherwise enter them manually below.
                            </p>
                            {fmcsaLoading && (
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Loader2 size={16} className="animate-spin text-blue-600" />
                                    Searching Transportation.gov registry…
                                </div>
                            )}
                            {fmcsaError && (
                                <p className="text-xs text-amber-700">{fmcsaError}</p>
                            )}
                            {!fmcsaLoading && !fmcsaError && fmcsaRows.length === 0 && (
                                <p className="text-xs text-slate-500">No matching motor carrier found for this name. Enter contact details manually below.</p>
                            )}
                            {fmcsaRows.length > 0 && (
                                <ul className="space-y-2">
                                    {fmcsaRows.map((row, idx) => {
                                        const m = mapFmcsaRowToPevContact(row);
                                        const rowKey = buildFmcsaRowKey(row, idx);
                                        const selected = selectedFmcsaKey === rowKey;
                                        const sub = [m.phyCity, m.phyState].filter(Boolean).join(', ');
                                        const hasContact = !!(m.email || m.fax || m.phone);
                                        return (
                                            <li key={rowKey}>
                                                <button
                                                    type="button"
                                                    aria-pressed={selected}
                                                    data-testid={`fmcsa-row-${idx}`}
                                                    onClick={() => applyFmcsaRow(row, idx)}
                                                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${selected
                                                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200 shadow-sm'
                                                        : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <span className="font-semibold text-slate-900 block truncate">{m.legalName || 'Unknown'}</span>
                                                            <span className="text-xs text-slate-500">
                                                                USDOT {m.dotNumber || '—'}
                                                                {sub ? ` · ${sub}` : ''}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 block mt-0.5">
                                                                {hasContact
                                                                    ? 'Includes email, fax, or phone from FMCSA — merged into the form'
                                                                    : 'Identity match — FMCSA did not list email/fax on this record'}
                                                            </span>
                                                        </div>
                                                        {selected && (
                                                            <CheckCircle2 size={20} className="text-blue-600 shrink-0 mt-0.5" aria-hidden />
                                                        )}
                                                    </div>
                                                    {selected && (
                                                        <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                                            Selected
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {selectedFmcsaKey != null && lastFmcsaRowHadContact === false && (
                                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/90 p-2.5 text-[11px] text-amber-900">
                                    <AlertCircle size={16} className="shrink-0 text-amber-600 mt-0.5" />
                                    <div>
                                        <span className="font-semibold">No email or fax from this registry row.</span>
                                        {' '}
                                        Type the recipient email or fax below, or choose <strong>Download / Print</strong> so you do not need either.
                                    </div>
                                </div>
                            )}
                            <p className="text-[10px] text-slate-500 leading-snug">
                                Suggestions are from the public FMCSA company census. Always verify the recipient before sending (49 CFR 391.23).
                            </p>
                        </div>
                    )}

                    {/* Method Selection */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Delivery Method</label>
                        <div className="grid gap-3">
                            {methods.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleDeliveryMethodChange(m.id)}
                                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left group ${deliveryMethod === m.id
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className={`p-3 rounded-lg transition-colors ${deliveryMethod === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                                        }`}>
                                        <m.icon size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`font-bold ${deliveryMethod === m.id ? 'text-blue-900' : 'text-gray-700'}`}>{m.label}</span>
                                            {!m.active && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Missing Info</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${deliveryMethod === m.id ? 'border-blue-600 bg-blue-600' : 'border-gray-200'
                                        }`}>
                                        {deliveryMethod === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Conditional Input */}
                    {deliveryMethod === 'email' && (
                        <div
                            ref={emailSectionRef}
                            className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in slide-in-from-top-2"
                        >
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2" htmlFor="pev-recipient-email">
                                Recipient Email Address
                            </label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="pev-recipient-email"
                                    ref={emailInputRef}
                                    type="email"
                                    value={contactInfo.email}
                                    onChange={(e) => {
                                        setContactInfo({ ...contactInfo, email: e.target.value });
                                        if (proceedError.field === 'email') setProceedError({ field: null, message: '' });
                                    }}
                                    aria-invalid={proceedError.field === 'email'}
                                    aria-describedby={proceedError.field === 'email' ? 'pev-email-error' : undefined}
                                    className={`w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-sm focus:ring-2 outline-none transition-all ${proceedError.field === 'email'
                                        ? 'border-red-400 ring-2 ring-red-100 focus:ring-red-500'
                                        : 'border-gray-300 focus:ring-blue-600'
                                        }`}
                                    placeholder="hr@company.com"
                                    autoComplete="off"
                                />
                            </div>
                            {proceedError.field === 'email' && (
                                <p id="pev-email-error" className="mt-2 text-xs font-medium text-red-600" role="alert">
                                    {proceedError.message}
                                </p>
                            )}
                        </div>
                    )}

                    {deliveryMethod === 'fax' && (
                        <div
                            ref={faxSectionRef}
                            className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in slide-in-from-top-2"
                        >
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2" htmlFor="pev-recipient-fax">
                                Recipient Fax Number
                            </label>
                            <div className="relative">
                                <Printer size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="pev-recipient-fax"
                                    ref={faxInputRef}
                                    type="tel"
                                    value={contactInfo.fax}
                                    onChange={(e) => {
                                        setContactInfo({ ...contactInfo, fax: e.target.value });
                                        if (proceedError.field === 'fax') setProceedError({ field: null, message: '' });
                                    }}
                                    aria-invalid={proceedError.field === 'fax'}
                                    aria-describedby={proceedError.field === 'fax' ? 'pev-fax-error' : undefined}
                                    className={`w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-sm focus:ring-2 outline-none transition-all ${proceedError.field === 'fax'
                                        ? 'border-red-400 ring-2 ring-red-100 focus:ring-red-500'
                                        : 'border-gray-300 focus:ring-blue-600'
                                        }`}
                                    placeholder="(555) 000-0000"
                                    autoComplete="off"
                                />
                            </div>
                            {proceedError.field === 'fax' && (
                                <p id="pev-fax-error" className="mt-2 text-xs font-medium text-red-600" role="alert">
                                    {proceedError.message}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Legal Note */}
                    <div className="flex gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <Info size={18} className="text-amber-600 shrink-0" />
                        <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                            Verifications are performed in compliance with FMCSA 49 CFR Part 391.23. The driver&apos;s signed authorization is attached to the request automatically.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 bg-white"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleContinue}
                        className="flex-1 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-100 flex items-center justify-center gap-2"
                    >
                        <Send size={18} />
                        {deliveryMethod === 'manual' ? 'Preview & Print' : 'Continue to Preview'}
                    </button>
                </div>
            </div>
        </div>
    );
}
