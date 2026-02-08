import React from 'react';
import { Check, Clock } from 'lucide-react';

/**
 * ProgressIndicator - Compact horizontal progress bar showing application completion
 */
export function ProgressIndicator({ appData, currentStatus }) {
    // Define completion steps
    const steps = [
        { id: 'personal', label: 'Personal Info', check: () => !!(appData?.firstName && appData?.lastName && appData?.email) },
        { id: 'qualifications', label: 'Qualifications', check: () => !!(appData?.cdlClass || appData?.driverType) },
        { id: 'employment', label: 'Employment', check: () => (appData?.employers?.length > 0 || appData?.employmentHistory?.length > 0) },
        {
            id: 'documents', label: 'Documents', check: () => {
                const docs = appData?.uploadedDocuments || appData?.documents || {};
                return Object.keys(docs).length >= 2;
            }
        },
        { id: 'consent', label: 'Consent', check: () => !!(appData?.signatureData || appData?.hasAgreedToTerms) }
    ];

    const completedSteps = steps.filter(s => s.check()).length;
    const progress = (completedSteps / steps.length) * 100;

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">Application Progress</span>
                </div>
                <span className="text-xs font-bold text-blue-600">
                    {completedSteps}/{steps.length} completed
                </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Steps */}
            <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                    const isCompleted = step.check();
                    return (
                        <div key={step.id} className="flex flex-col items-center gap-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${isCompleted
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-gray-100 text-gray-400'
                                }`}>
                                {isCompleted ? <Check size={14} /> : index + 1}
                            </div>
                            <span className={`text-[10px] font-medium ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ProgressIndicator;
