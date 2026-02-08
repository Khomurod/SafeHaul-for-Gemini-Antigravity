import React from 'react';
import { CheckCircle, FileX, MessageSquare, Send, ArrowRight, Loader2 } from 'lucide-react';

/**
 * ApplicationActionBar - Sticky action bar with primary workflow actions
 */
export function ApplicationActionBar({
    currentStatus,
    canEdit,
    isEditing,
    isSaving,
    onApprove,
    onRequestDocs,
    onMessage,
    onMoveToNextStage,
    onSave,
    onCancelEdit
}) {
    // Determine which actions are available based on status
    const canApprove = ['In Review', 'Qualified', 'Background Check'].includes(currentStatus);
    const canRequestDocs = ['New', 'In Review', 'Qualified'].includes(currentStatus);
    const canMoveNext = ['New', 'In Review', 'Qualified'].includes(currentStatus);

    if (!canEdit && !isEditing) return null;

    return (
        <div className="sticky bottom-0 z-20 px-6 py-4 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between gap-4">
                {/* Left Side: Primary Actions */}
                <div className="flex items-center gap-3">
                    {isEditing ? (
                        <>
                            <button
                                onClick={onCancelEdit}
                                className="px-4 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onSave}
                                disabled={isSaving}
                                className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition flex items-center gap-2 shadow-md disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                Save Changes
                            </button>
                        </>
                    ) : (
                        <>
                            {canApprove && (
                                <button
                                    onClick={onApprove}
                                    className="px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-lg hover:from-green-700 hover:to-emerald-700 transition flex items-center gap-2 shadow-md"
                                >
                                    <CheckCircle size={16} />
                                    Approve
                                </button>
                            )}
                            {canRequestDocs && (
                                <button
                                    onClick={onRequestDocs}
                                    className="px-4 py-2.5 bg-amber-100 text-amber-700 font-bold rounded-lg hover:bg-amber-200 transition flex items-center gap-2 border border-amber-200"
                                >
                                    <FileX size={16} />
                                    Request Docs
                                </button>
                            )}
                            <button
                                onClick={onMessage}
                                className="px-4 py-2.5 bg-blue-100 text-blue-700 font-bold rounded-lg hover:bg-blue-200 transition flex items-center gap-2 border border-blue-200"
                            >
                                <MessageSquare size={16} />
                                Message
                            </button>
                        </>
                    )}
                </div>

                {/* Right Side: Move to Next Stage */}
                {!isEditing && canMoveNext && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Next:</span>
                        <button
                            onClick={onMoveToNextStage}
                            className="px-4 py-2.5 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition flex items-center gap-2 shadow-md"
                        >
                            <ArrowRight size={16} />
                            Move to {getNextStage(currentStatus)}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper to determine next stage
function getNextStage(currentStatus) {
    const workflow = {
        'New': 'In Review',
        'In Review': 'Qualified',
        'Qualified': 'Background Check',
        'Background Check': 'Approved',
        'Approved': 'Hired'
    };
    return workflow[currentStatus] || 'Next Stage';
}

export default ApplicationActionBar;
