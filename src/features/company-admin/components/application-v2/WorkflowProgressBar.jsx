import React from 'react';
import { Check } from 'lucide-react';

const STAGES = [
    { id: 'applied', label: 'Applied' },
    { id: 'screened', label: 'Screened' },
    { id: 'background', label: 'Background' },
    { id: 'offer', label: 'Offer' },
    { id: 'hired', label: 'Hired' }
];

const STATUS_TO_STAGE_INDEX = {
    'New Application': 0,
    'New Lead': 0,
    'Contacted': 1,
    'Attempted': 1,
    'In Review': 1,
    'Background Check': 2,
    'Awaiting Documents': 2,
    'Document Review': 2,
    'Offer Sent': 3,
    'Offer Accepted': 3,
    'Approved': 3,
    'Hired': 4,
    'Active': 4
};

export function WorkflowProgressBar({ currentStatus }) {
    const currentStageIndex = STATUS_TO_STAGE_INDEX[currentStatus] ?? -1;

    // If status is terminal/negative, we don't show the progress or handle differently
    const isNegative = ['Rejected', 'Disqualified'].includes(currentStatus);

    return (
        <div className="w-full bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between relative">
                {/* Background Line */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 rounded-full z-0" />

                {/* Active Progress Line */}
                {!isNegative && currentStageIndex >= 0 && (
                    <div
                        className="absolute top-1/2 left-0 h-1 bg-blue-500 -translate-y-1/2 rounded-full z-0 transition-all duration-500 ease-out"
                        style={{ width: `${(currentStageIndex / (STAGES.length - 1)) * 100}%` }}
                    />
                )}

                {STAGES.map((stage, index) => {
                    const isCompleted = !isNegative && index < currentStageIndex;
                    const isActive = !isNegative && index === currentStageIndex;

                    return (
                        <div key={stage.id} className="relative z-10 flex flex-col items-center">
                            {/* Circle */}
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${isCompleted
                                        ? 'bg-blue-500 border-blue-500 text-white'
                                        : isActive
                                            ? 'bg-white border-blue-500 text-blue-500 ring-4 ring-blue-50'
                                            : 'bg-white border-gray-200 text-gray-400'
                                    }`}
                            >
                                {isCompleted ? (
                                    <Check size={16} strokeWidth={3} />
                                ) : (
                                    <span className="text-xs font-bold">{index + 1}</span>
                                )}
                            </div>

                            {/* Label */}
                            <span
                                className={`mt-2 text-[11px] font-bold uppercase tracking-wider transition-colors duration-300 ${isActive ? 'text-blue-600' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                                    }`}
                            >
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {isNegative && (
                <div className="mt-4 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100 inline-flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    Application {currentStatus}
                </div>
            )}
        </div>
    );
}
