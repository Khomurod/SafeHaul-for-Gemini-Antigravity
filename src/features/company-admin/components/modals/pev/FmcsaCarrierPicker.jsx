// src/features/company-admin/components/modals/pev/FmcsaCarrierPicker.jsx
//
// Presentational FMCSA company-match suggestions block for the PEV request modal.
// Pure/stateless — receives lookup state + selection and reports row clicks via
// onSelectRow. Extracted from PEVRequestModal (no refs involved, so a safe split).

import React from 'react';
import { Building2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { mapFmcsaRowToPevContact } from '@shared/services/fmcsaEmployerSocrata';

/** Stable key for an FMCSA census row (DOT number + index). Shared with the container. */
export function buildFmcsaRowKey(row, index) {
    const dot = row?.dot_number === undefined || row?.dot_number === null ? 'x' : String(row.dot_number).trim();
    return `${dot}-${index}`;
}

export function FmcsaCarrierPicker({
    fmcsaStateCode,
    fmcsaLoading,
    fmcsaError,
    fmcsaRows,
    selectedFmcsaKey,
    lastFmcsaRowHadContact,
    onSelectRow,
}) {
    return (
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
                                    onClick={() => onSelectRow(row, idx)}
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
    );
}

export default FmcsaCarrierPicker;
