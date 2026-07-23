import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useApplicationView } from '@features/company-admin/hooks/useApplicationView';
import { useApplicationDelete } from '@features/applications/hooks/useApplicationDelete';
import { useData } from '@/context/DataContext';
import { Modal } from '@shared/components/modals/Modal';
import { DossierSidebar } from './DossierSidebar';
import { DossierHeader } from './DossierHeader';
import { DossierContent } from './DossierContent';

/**
 * DriverProfileModal
 * 
 * The main container for the Driver Dossier (3-pane modal).
 * It manages the active tab state and orchestrates the data fetching via useApplicationView.
 */
export function DriverProfileModal({
    companyId,
    driverId,
    isOpen,
    onClose,
    onDeleted,
}) {
    const [activeTab, setActiveTab] = useState('application');
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const { currentUserClaims } = useData();
    const isCompanyAdmin = currentUserClaims?.roles?.[companyId] === 'company_admin'
        || currentUserClaims?.roles?.globalRole === 'super_admin';
    const { deleting, deleteApplication } = useApplicationDelete();

    // Use the existing hook for data fetching
    // We pass onClose as onClosePanel to the hook
    const {
        loading,
        error,
        appData,
        companyProfile,
        currentStatus,
        isEditing,
        setIsEditing,
        isSaving,
        canEdit,
        handleStatusUpdate,
        handleAssignChange,
        handleSaveEdit,
        handleManagementComplete,
        fileUrls,
        dqStatus,
        collectionName,
        teamMembers,
        assignedTo,
    } = useApplicationView(companyId, driverId, null, onClose, null);

    const handleConfirmDelete = async () => {
        const ok = await deleteApplication({ companyId, applicationId: driverId, collectionName });
        if (ok) {
            setConfirmingDelete(false);
            onDeleted?.();
            onClose();
        }
    };

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Driver dossier"
        >
            {/* Backdrop with blur */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Card */}
            <div className="relative bg-white w-[90vw] h-[90vh] max-w-7xl rounded-2xl shadow-2xl overflow-hidden flex flex-row animate-in fade-in zoom-in-95 duration-200">

                {/* 1. Sidebar (Pane A) - Fixed Width */}
                <div className="w-[280px] shrink-0 border-r border-gray-200 bg-slate-50 h-full">
                    <DossierSidebar
                        appData={appData}
                        currentStatus={currentStatus}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        loading={loading}
                        dqStatus={dqStatus}
                    />
                </div>

                {/* Right Side Container */}
                <div className="flex-1 flex flex-col min-w-0 bg-white h-full">

                    {/* 2. Header (Pane B) - Sticky Top */}
                    <div className="h-16 shrink-0 border-b border-gray-100 flex items-center justify-between px-6 bg-white z-10">
                        <DossierHeader
                            activeTab={activeTab}
                            appData={appData}
                            companyProfile={companyProfile}
                            currentStatus={currentStatus}
                            onClose={onClose}
                            onStatusUpdate={handleStatusUpdate}
                            canEdit={canEdit}
                            teamMembers={teamMembers}
                            assignedTo={assignedTo}
                            onAssignChange={handleAssignChange}
                            canDelete={isCompanyAdmin}
                            onDelete={() => setConfirmingDelete(true)}
                        />
                    </div>

                    {/* 3. Content (Pane C) - Scrollable */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-white relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="p-8 text-center text-red-500">
                                <p>Error loading application details.</p>
                                <p className="text-sm mt-2 text-gray-400">{error}</p>
                            </div>
                        ) : (
                            <DossierContent
                                activeTab={activeTab}
                                appData={appData}
                                driverId={driverId}
                                companyId={companyId}
                                collectionName={collectionName}
                                isEditing={isEditing}
                                setIsEditing={setIsEditing}
                                handleSaveEdit={handleSaveEdit}
                                isSaving={isSaving}
                                fileUrls={fileUrls}
                                canEdit={canEdit}
                            />
                        )}
                    </div>
                </div>

            </div>

            {confirmingDelete && (
                <Modal
                    onClose={deleting ? undefined : () => setConfirmingDelete(false)}
                    labelledBy="delete-app-title"
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                >
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <AlertTriangle size={22} className="text-red-600" />
                            </div>
                            <h2 id="delete-app-title" className="text-lg font-bold text-gray-900">Delete this application?</h2>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            This permanently removes the application, its activity history, notes, and all
                            uploaded documents. This cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmingDelete(false)}
                                disabled={deleting}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
                            >
                                {deleting && <Loader2 size={16} className="animate-spin" />}
                                {deleting ? 'Deleting…' : 'Delete permanently'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
