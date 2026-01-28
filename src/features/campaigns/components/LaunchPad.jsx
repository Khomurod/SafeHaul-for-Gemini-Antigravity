import React, { useState } from 'react';
import { Rocket, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@shared/components/feedback/ToastProvider';

export function LaunchPad({ companyId, campaign, onLaunchSuccess }) {
    const navigate = useNavigate();
    const { showSuccess, showError } = useToast();
    const [isLaunching, setIsLaunching] = useState(false);
    const [scheduleTime, setScheduleTime] = useState('');

    const handleLaunch = async () => {
        if (!companyId) return showError("Company ID missing");

        setIsLaunching(true);
        try {
            const initBulkSession = httpsCallable(functions, 'initBulkSession');

            const payload = {
                companyId,
                filters: campaign.filters,
                messageConfig: campaign.messageConfig,
                scheduledFor: scheduleTime ? new Date(scheduleTime).toISOString() : null
            };

            const result = await initBulkSession(payload);

            if (result.data.success) {
                showSuccess("Campaign Launched Successfully!");
                if (onLaunchSuccess) onLaunchSuccess();
                // Navigate back to dashboard or show success state
                // navigate('/campaigns'); // Optional
            } else {
                showError(result.data.message || "Launch failed");
            }
        } catch (err) {
            console.error("Launch Error:", err);
            showError(err.message || "Failed to launch campaign");
        } finally {
            setIsLaunching(false);
        }
    };

    // Validation
    const errors = [];
    if (!campaign.filters?.status?.length && !campaign.filters?.leadType) errors.push("No audience selected");
    if (!campaign.messageConfig?.message) errors.push("Message content is empty");
    if (campaign.matchCount === 0) errors.push("Audience size is 0");

    const isValid = errors.length === 0;

    return (
        <div className="max-w-2xl mx-auto text-center pt-12">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Rocket size={40} className="text-blue-600" />
                </div>

                <h2 className="text-3xl font-black text-slate-900 mb-2">Ready for Liftoff?</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                    You are about to message <strong>{campaign.matchCount || 0}</strong> recipients via <strong>{campaign.messageConfig?.method === 'email' ? 'Email' : 'SMS'}</strong>.
                </p>

                {errors.length > 0 ? (
                    <div className="bg-red-50 p-6 rounded-2xl mb-8 text-left">
                        <h3 className="flex items-center gap-2 font-bold text-red-700 mb-3">
                            <AlertTriangle size={18} /> Pre-Flight Checks Failed
                        </h3>
                        <ul className="space-y-2">
                            {errors.map((err, i) => (
                                <li key={i} className="text-sm text-red-600 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div> {err}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className="bg-emerald-50 p-6 rounded-2xl mb-8 flex items-center justify-center gap-2 text-emerald-800 font-bold">
                        <CheckCircle size={20} /> All Systems Go
                    </div>
                )}

                <div className="mb-8 text-left">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Schedule (Optional)</label>
                    <input
                        type="datetime-local"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 mt-2 font-medium">Leave blank to send immediately.</p>
                </div>

                <div className="flex gap-4">
                    <button
                        disabled={!isValid || isLaunching}
                        onClick={handleLaunch}
                        className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-black text-lg shadow-lg shadow-blue-200 flex items-center justify-center gap-3 transition-all"
                    >
                        {isLaunching ? <Loader2 size={24} className="animate-spin" /> : <Rocket size={24} />}
                        {scheduleTime ? 'Schedule Launch' : 'Launch Now'}
                    </button>
                </div>
            </div>
        </div>
    );
}
