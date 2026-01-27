import { useState } from 'react';
import { db, functions } from '@lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
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
            const ref = doc(db, 'companies', companyId, 'bulk_sessions', sessionId);
            await updateDoc(ref, { status: 'paused' });
            showSuccess("Session Paused");
        } catch (err) { showError(err.message); }
    };

    const resumeSession = async (sessionId) => {
        try {
            const ref = doc(db, 'companies', companyId, 'bulk_sessions', sessionId);
            await updateDoc(ref, { status: 'active' });
            showSuccess("Session Resumed");
        } catch (err) { showError(err.message); }
    };

    const cancelSession = async (sessionId) => {
        if (!window.confirm("Are you sure you want to cancel this campaign? This cannot be undone.")) return;
        try {
            const ref = doc(db, 'companies', companyId, 'bulk_sessions', sessionId);
            await updateDoc(ref, { status: 'cancelled' });
            showSuccess("Session Cancelled");
        } catch (err) { showError(err.message); }
    };

    const retryFailed = async (originalSessionId) => {
        setIsExecuting(true);
        try {
            const result = await httpsCallable(functions, 'retryFailedAttempts')({ companyId, originalSessionId });
            if (result.data.success) {
                showSuccess("Retry session created successfully.");
                return { success: true, sessionId: result.data.sessionId };
            } else {
                showError(result.data.message || "Failed to initiate retry.");
                return { success: false };
            }
        } catch (err) {
            showError(err.message);
            return { success: false };
        } finally {
            setIsExecuting(false);
        }
    };

    return {
        isExecuting,
        handleLaunch,
        pauseSession,
        resumeSession,
        cancelSession,
        retryFailed
    };
}
