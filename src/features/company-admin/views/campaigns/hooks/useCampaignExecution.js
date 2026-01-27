import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { useToast } from '@shared/components/feedback/ToastProvider';

export function useCampaignExecution(companyId) {
    const { showSuccess, showError } = useToast();
    const [isExecuting, setIsExecuting] = useState(false);

    const handleLaunch = async (filters, messageConfig) => {
        setIsExecuting(true);
        try {
            const initFn = httpsCallable(functions, 'initBulkSession');
            const result = await initFn({
                companyId,
                filters,
                messageConfig,
                scheduledFor: filters.scheduledFor || null
            });

            if (result.data.success) {
                if (result.data.status === 'scheduled') {
                    showSuccess(`Campaign Scheduled for ${new Date(filters.scheduledFor).toLocaleString()}`);
                    return { success: true, scheduled: true };
                } else {
                    showSuccess(`Action Processed: ${result.data.targetCount} drivers queued.`);
                    return { success: true, sessionId: result.data.sessionId };
                }
            } else {
                showError(result.data.message || "Initialization failed.");
                return { success: false };
            }
        } catch (err) {
            showError(err.message);
            return { success: false };
        } finally {
            setIsExecuting(false);
        }
    };

    const pauseSession = async (sessionId) => {
        try {
            await httpsCallable(functions, 'pauseBulkSession')({ companyId, sessionId });
            showSuccess("Session Paused");
        } catch (err) { showError(err.message); }
    };

    const resumeSession = async (sessionId) => {
        try {
            await httpsCallable(functions, 'resumeBulkSession')({ companyId, sessionId });
            showSuccess("Session Resumed");
        } catch (err) { showError(err.message); }
    };

    const cancelSession = async (sessionId) => {
        if (!window.confirm("Are you sure you want to cancel this campaign? This cannot be undone.")) return;
        try {
            await httpsCallable(functions, 'cancelBulkSession')({ companyId, sessionId });
            showSuccess("Session Cancelled");
        } catch (err) { showError(err.message); }
    };

    return {
        isExecuting,
        handleLaunch,
        pauseSession,
        resumeSession,
        cancelSession
    };
}
