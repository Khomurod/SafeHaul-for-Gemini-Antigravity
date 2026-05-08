import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Mail, Printer, Send, ShieldCheck, Info, FileText, Loader2, Building2 } from 'lucide-react';
import {
    fetchFmcsaCarrierCandidatesForPev,
    mapFmcsaRowToPevContact,
} from '@shared/services/fmcsaEmployerSocrata';

function employerDisplayName(employer) {
    return String(employer?.companyName || employer?.name || '').trim();
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

    const companyLabel = employerDisplayName(employer);

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
                });
                if (!cancelled) setFmcsaRows(rows);
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
    }, [socrataToken, companyLabel]);

    const applyFmcsaRow = (row) => {
        const m = mapFmcsaRowToPevContact(row);
        setContactInfo((prev) => ({
            ...prev,
            email: m.email || prev.email,
            fax: m.fax || prev.fax,
            phone: m.phone || prev.phone,
        }));
    };

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
                                        const sub = [m.phyCity, m.phyState].filter(Boolean).join(', ');
                                        const hasContact = !!(m.email || m.fax || m.phone);
                                        return (
                                            <li key={`${m.dotNumber}-${idx}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => applyFmcsaRow(row)}
                                                    className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                                                >
                                                    <span className="font-semibold text-slate-900 block truncate">{m.legalName || 'Unknown'}</span>
                                                    <span className="text-xs text-slate-500">
                                                        USDOT {m.dotNumber || '—'}
                                                        {sub ? ` · ${sub}` : ''}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 block mt-0.5">
                                                        {hasContact
                                                            ? 'Click to fill email / fax / phone when listed by FMCSA'
                                                            : 'Registry match — FMCSA may not list email/fax; use for identity only'}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
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
                                    onClick={() => setDeliveryMethod(m.id)}
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
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in slide-in-from-top-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Recipient Email Address</label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    value={contactInfo.email}
                                    onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                                    placeholder="hr@company.com"
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    {deliveryMethod === 'fax' && (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in slide-in-from-top-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Recipient Fax Number</label>
                            <div className="relative">
                                <Printer size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="tel"
                                    value={contactInfo.fax}
                                    onChange={(e) => setContactInfo({ ...contactInfo, fax: e.target.value })}
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                                    placeholder="(555) 000-0000"
                                    autoComplete="off"
                                />
                            </div>
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
                        onClick={() => {
                            if (deliveryMethod === 'email' && !String(contactInfo.email || '').trim()) {
                                window.alert('Please provide a valid recipient email.');
                                return;
                            }
                            if (deliveryMethod === 'fax' && !String(contactInfo.fax || '').trim()) {
                                window.alert('Please provide a valid fax number.');
                                return;
                            }
                            onProceed(deliveryMethod, contactInfo);
                        }}
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
