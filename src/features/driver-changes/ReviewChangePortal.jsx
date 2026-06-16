import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';
import { Loader2, Check, X, Pencil, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

const MOCK_REVIEW = {
    applicantName: 'Test Driver',
    status: 'open',
    changes: [
        { fieldKey: 'firstName', fieldLabel: 'First Name', originalValue: 'John', proposedValue: 'Jonathan', status: 'pending' },
        { fieldKey: 'phone', fieldLabel: 'Phone', originalValue: '5551112222', proposedValue: '5559998888', status: 'pending' },
    ],
};

function previewValue(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'object') return Array.isArray(v) ? `${v.length} item(s)` : '(updated)';
    return String(v);
}
const isScalar = (v) => v === null || v === undefined || typeof v !== 'object';

const ACTIONS = [
    { id: 'approve', label: 'Approve', icon: Check, cls: 'border-green-500 bg-green-50 text-green-700' },
    { id: 'reject', label: 'Reject', icon: X, cls: 'border-red-400 bg-red-50 text-red-700' },
    { id: 'edit', label: 'Edit', icon: Pencil, cls: 'border-blue-500 bg-blue-50 text-blue-700' },
];

export function ReviewChangePortal() {
    const { token } = useParams();
    const isMock = isE2ETestMode && getE2EQueryParam('e2eReview', '') === 'mock';

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [resolutions, setResolutions] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                let res;
                if (isMock) {
                    res = MOCK_REVIEW;
                } else {
                    const fn = httpsCallable(functions, 'getChangeReview');
                    const r = await fn({ token });
                    res = r.data;
                }
                if (cancelled) return;
                setData(res);
                const init = {};
                (res.changes || []).filter((c) => c.status === 'pending').forEach((c) => {
                    init[c.fieldKey] = { action: 'approve', value: isScalar(c.proposedValue) ? String(c.proposedValue ?? '') : c.proposedValue };
                });
                setResolutions(init);
            } catch (e) {
                if (!cancelled) setError(e?.message || 'This review link is invalid or has expired.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token, isMock]);

    const setAction = (fieldKey, action) => setResolutions((p) => ({ ...p, [fieldKey]: { ...p[fieldKey], action } }));
    const setValue = (fieldKey, value) => setResolutions((p) => ({ ...p, [fieldKey]: { ...p[fieldKey], value } }));

    const pending = (data?.changes || []).filter((c) => c.status === 'pending');

    const handleSubmit = async () => {
        const payload = pending.map((c) => {
            const r = resolutions[c.fieldKey] || { action: 'approve' };
            const out = { fieldKey: c.fieldKey, action: r.action };
            if (r.action === 'edit') out.value = isScalar(c.proposedValue) ? r.value : c.proposedValue;
            return out;
        });
        setSubmitting(true);
        setError('');
        try {
            if (!isMock) {
                const fn = httpsCallable(functions, 'submitChangeResolution');
                await fn({ token, resolutions: payload });
            }
            setDone(true);
        } catch (e) {
            setError(e?.message || 'Could not submit your review. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 sm:p-6">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-6">
                <div className="bg-slate-900 text-white p-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500 rounded-lg"><ShieldCheck size={22} /></div>
                        <div>
                            <h1 className="text-lg font-bold">Review changes to your application</h1>
                            <p className="text-slate-400 text-sm">Your recruiter proposed edits. Approve, reject, or fix each one.</p>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-500">
                            <Loader2 className="animate-spin mr-2" size={20} /> Loading…
                        </div>
                    ) : error ? (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" /> {error}
                        </div>
                    ) : done ? (
                        <div className="text-center py-12">
                            <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
                            <h2 className="text-xl font-bold text-slate-900 mb-1">Thank you!</h2>
                            <p className="text-slate-600 text-sm">Your responses have been recorded.</p>
                        </div>
                    ) : pending.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle2 size={40} className="text-green-600 mx-auto mb-3" />
                            <p className="text-slate-600 text-sm">There are no changes left to review.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {pending.map((c) => {
                                const r = resolutions[c.fieldKey] || { action: 'approve' };
                                const canEdit = isScalar(c.proposedValue) && isScalar(c.originalValue);
                                return (
                                    <div key={c.fieldKey} className="rounded-xl border border-slate-200 p-4">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">{c.fieldLabel || c.fieldKey}</p>
                                        <div className="flex items-center gap-2 text-sm mb-3 flex-wrap">
                                            <span className="line-through text-slate-400">{previewValue(c.originalValue)}</span>
                                            <span aria-hidden>→</span>
                                            <span className="font-semibold text-slate-900">{previewValue(c.proposedValue)}</span>
                                        </div>
                                        <div role="group" aria-label={`Decision for ${c.fieldLabel || c.fieldKey}`} className="flex gap-2">
                                            {ACTIONS.filter((a) => a.id !== 'edit' || canEdit).map((a) => {
                                                const active = r.action === a.id;
                                                const Icon = a.icon;
                                                return (
                                                    <button
                                                        key={a.id}
                                                        type="button"
                                                        aria-pressed={active}
                                                        onClick={() => setAction(c.fieldKey, a.id)}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${active ? a.cls : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                                    >
                                                        <Icon size={15} /> {a.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {r.action === 'edit' && canEdit && (
                                            <input
                                                type="text"
                                                value={r.value ?? ''}
                                                onChange={(e) => setValue(c.fieldKey, e.target.value)}
                                                aria-label={`Corrected value for ${c.fieldLabel || c.fieldKey}`}
                                                className="mt-3 w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Enter the correct value"
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {submitting && <Loader2 size={18} className="animate-spin" />}
                                Submit my responses
                            </button>
                            <p className="text-[11px] text-slate-400 text-center">
                                Approved or your edited values become part of your application. Rejected changes keep your original answer.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ReviewChangePortal;
