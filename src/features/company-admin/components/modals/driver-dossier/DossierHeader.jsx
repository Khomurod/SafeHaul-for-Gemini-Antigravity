import React, { useMemo } from 'react';
import { X, Download, Trash2 } from 'lucide-react';
import { generateApplicationPDF } from '@shared/utils/pdfGenerator';
import { ATS_STATUS_DROPDOWN_OPTIONS } from '@shared/constants/atsStatus';

export function DossierHeader({
    activeTab,
    appData,
    companyProfile,
    currentStatus,
    onClose,
    onStatusUpdate,
    canEdit,
    teamMembers = [],
    assignedTo,
    onAssignChange,
    canDelete = false,
    onDelete,
}) {
    const getTitle = () => {
        switch (activeTab) {
            case 'application': return 'Application Review';
            case 'documents': return 'Document Gallery';
            case 'dq': return 'Driver Qualification File';
            case 'activity': return 'Activity Timeline';
            case 'notes': return 'Internal Notes';
            case 'pev': return 'Previous Employment Verification';
            default: return 'Driver Dossier';
        }
    };

    const handleDownload = () => {
        if (appData) {
            generateApplicationPDF({
                applicant: appData,
                company: companyProfile,
                agreements: []
            });
        }
    };

    const statusOptions = useMemo(() => {
        const uniq = new Set(ATS_STATUS_DROPDOWN_OPTIONS);
        if (currentStatus && String(currentStatus).trim()) {
            uniq.add(currentStatus);
        }
        return [...uniq];
    }, [currentStatus]);

    const statusValue = currentStatus || 'New';

    return (
        <>
            <div className="flex items-center gap-4 min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-800 truncate">{getTitle()}</h2>

                {activeTab === 'application' && (
                    <span className="text-xs text-gray-400 font-medium px-2 py-1 bg-gray-50 rounded-md border border-gray-100 shrink-0">
                        {appData ? `App ID: ${appData.id?.slice(0, 8)}` : 'Loading...'}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                {canEdit && (
                    <>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <span className="hidden lg:inline">Status</span>
                            <select
                                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none max-w-[200px]"
                                value={statusValue}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (onStatusUpdate) void onStatusUpdate(v);
                                }}
                            >
                                {statusOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <span className="hidden lg:inline">Assign To</span>
                            <select
                                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none max-w-[180px]"
                                value={assignedTo || ''}
                                onChange={(e) => {
                                    if (onAssignChange) void onAssignChange(e.target.value);
                                }}
                            >
                                <option value="">Unassigned</option>
                                {(teamMembers || []).map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name || m.displayName || m.email || m.id}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="h-6 w-px bg-gray-200 hidden sm:block" />
                    </>
                )}

                <button
                    onClick={handleDownload}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors border border-transparent hover:border-blue-100"
                    title="Download PDF"
                    type="button"
                >
                    <Download size={20} />
                </button>

                {canDelete && (
                    <button
                        onClick={onDelete}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors border border-transparent hover:border-red-100"
                        title="Delete application"
                        aria-label="Delete application"
                        type="button"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />

                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X size={24} />
                </button>
            </div>
        </>
    );
}
