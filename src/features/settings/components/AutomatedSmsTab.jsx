import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@lib/firebase';
import { Loader2, Save, Info } from 'lucide-react';
import { useToast } from '@shared/components/feedback';

export function AutomatedSmsTab({ companyId }) {
    const { showSuccess, showError } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [templateContactAttempt1, setTemplateContactAttempt1] = useState('');
    const [templateContactAttempt2, setTemplateContactAttempt2] = useState('');
    const [templateContactAttempt3, setTemplateContactAttempt3] = useState('');

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const ref = doc(db, 'companies', companyId, 'settings', 'automated_sms');
                const snap = await getDoc(ref);
                if (!cancelled && snap.exists()) {
                    const d = snap.data();
                    setTemplateContactAttempt1(d.templateContactAttempt1 || '');
                    setTemplateContactAttempt2(d.templateContactAttempt2 || '');
                    setTemplateContactAttempt3(d.templateContactAttempt3 || '');
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) showError('Could not load automated SMS templates.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast stable; avoid reload loops
    }, [companyId]);

    const handleSave = async () => {
        if (!companyId) return;
        setSaving(true);
        try {
            await setDoc(
                doc(db, 'companies', companyId, 'settings', 'automated_sms'),
                {
                    templateContactAttempt1,
                    templateContactAttempt2,
                    templateContactAttempt3,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            showSuccess('Automated SMS templates saved.');
        } catch (e) {
            console.error(e);
            showError('Failed to save templates.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
                <Loader2 className="animate-spin" size={22} /> Loading…
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-4xl animate-in fade-in pb-12">
            <div className="border-b border-gray-200 pb-4 mb-2">
                <h2 className="text-xl font-bold text-gray-900">Automated SMS</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Messages sent when a lead or application moves into each contact-attempt stage. Use{' '}
                    <code className="text-xs bg-slate-100 px-1 rounded">{`{driver name}`}</code> and{' '}
                    <code className="text-xs bg-slate-100 px-1 rounded">{`{user name}`}</code>{' '}
                    for the applicant and recruiter names.
                </p>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 flex gap-3 text-sm text-blue-900">
                <Info size={18} className="shrink-0 mt-0.5" />
                <p>
                    Requires an active SMS integration and a valid phone on the record. Duplicate sends are prevented when
                    the status does not change.
                </p>
            </div>

            {[
                {
                    label: 'Contact Attempt 1',
                    value: templateContactAttempt1,
                    onChange: setTemplateContactAttempt1,
                },
                {
                    label: 'Contact Attempt 2',
                    value: templateContactAttempt2,
                    onChange: setTemplateContactAttempt2,
                },
                {
                    label: 'Contact Attempt 3',
                    value: templateContactAttempt3,
                    onChange: setTemplateContactAttempt3,
                },
            ].map((field) => (
                <div key={field.label}>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">{field.label}</label>
                    <textarea
                        className="w-full min-h-[100px] p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder={`Hi {driver name}, this is {user name} from SafeHaul…`}
                    />
                </div>
            ))}

            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Save templates
            </button>
        </div>
    );
}
