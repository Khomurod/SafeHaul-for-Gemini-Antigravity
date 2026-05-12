import React, { useMemo, useState } from 'react';
import { X, Download, GitBranch, Check, Loader2 } from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@lib/firebase';
import { useData } from '@/context/DataContext';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { generateApplicationPDF } from '@shared/utils/pdfGenerator';
import { ATS_STATUS_DROPDOWN_OPTIONS } from '@shared/constants/atsStatus';
import { normalizePhone } from '@shared/utils/helpers';

// Map the source ATS status to a pipeline hiringStage so the row created from
// the dossier doesn't reset progress already made on the candidates list.
function statusToHiringStage(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('hired') || s.includes('approved')) return 'hired';
    if (s.includes('rejected') || s.includes('declined') || s.includes('disqualified')) return 'rejected';
    if (s.includes('hold')) return 'on_hold';
    return 'in_process';
}

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
}) {
    const { currentCompanyProfile } = useData();
    const { showSuccess, showError } = useToast();
    const [pipelineState, setPipelineState] = useState('idle'); // idle | adding | added
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

    const handleAddToPipeline = async () => {
        const companyId = currentCompanyProfile?.id;
        if (!companyId || !appData?.id) {
            showError('Cannot add to pipeline: missing company or applicant.');
            return;
        }
        setPipelineState('adding');
        try {
            const linkedAppCollection = appData?.collectionName || appData?.sourceCollection
                || (appData?.sourceType === 'Company Lead' ? 'leads' : 'applications');

            // Reuse an existing pipeline row for this applicant if one exists,
            // so re-clicking "Add to Pipeline" never produces dupes.
            const pipelineCol = collection(db, 'companies', companyId, 'pipeline_entries');
            const existingSnap = await getDocs(query(
                pipelineCol,
                where('linkedAppId', '==', appData.id),
                where('linkedAppCollection', '==', linkedAppCollection),
                limit(1)
            ));
            const ref = existingSnap.empty ? doc(pipelineCol) : existingSnap.docs[0].ref;

            const driverName = [appData.firstName, appData.lastName].filter(Boolean).join(' ').trim()
                || appData.fullName
                || 'Unnamed driver';
            const phone = appData.phone || '';
            const driverType = Array.isArray(appData.driverType)
                ? (appData.driverType[0] || 'Company Driver')
                : (appData.driverType || 'Company Driver');

            await setDoc(ref, {
                driverName,
                driverType,
                phoneNumber: phone,
                phoneNormalized: normalizePhone(phone),
                hiringStage: statusToHiringStage(currentStatus),
                linkedAppId: appData.id,
                linkedAppCollection,
                comments: existingSnap.empty
                    ? `[System]: Added from ${linkedAppCollection === 'leads' ? 'lead' : 'application'} dossier.`
                    : undefined,
                lastModifiedAt: serverTimestamp(),
                statusChangedAt: serverTimestamp(),
                createdAt: existingSnap.empty ? serverTimestamp() : undefined,
            }, { merge: true });

            setPipelineState('added');
            showSuccess(existingSnap.empty ? 'Added to pipeline.' : 'Pipeline entry refreshed.');
            setTimeout(() => setPipelineState('idle'), 2500);
        } catch (err) {
            console.error('[DossierHeader] Add to pipeline failed:', err);
            showError('Could not add to pipeline.');
            setPipelineState('idle');
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

                {canEdit && (
                    <button
                        type="button"
                        onClick={handleAddToPipeline}
                        disabled={pipelineState === 'adding'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                            pipelineState === 'added'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                        }`}
                        title="Create or refresh a pipeline tracker row for this driver"
                    >
                        {pipelineState === 'adding' ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : pipelineState === 'added' ? (
                            <Check size={14} />
                        ) : (
                            <GitBranch size={14} />
                        )}
                        {pipelineState === 'added' ? 'In Pipeline' : 'Add to Pipeline'}
                    </button>
                )}

                <button
                    onClick={handleDownload}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors border border-transparent hover:border-blue-100"
                    title="Download PDF"
                    type="button"
                >
                    <Download size={20} />
                </button>

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
