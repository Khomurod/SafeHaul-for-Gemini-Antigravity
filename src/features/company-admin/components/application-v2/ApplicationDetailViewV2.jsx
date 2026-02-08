import React, { Suspense, useState, useEffect } from 'react';
import { X, Download, FileSignature, Edit2, Save, Trash2, ArrowRight, MessageSquare, Clock, Folder, UserCheck, Mail, Briefcase, Loader2 } from 'lucide-react';
import { useApplicationView } from '@features/company-admin/hooks/useApplicationView';
import { db } from '@lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useData } from '@/context/DataContext';
import { useToast } from '@shared/components/feedback';


// Components
import { CandidateHero } from './CandidateHero';
import { ApplicationOverview } from './ApplicationOverview';
import { WorkflowProgressBar } from './WorkflowProgressBar';
import { ApplicationLeftColumn } from './ApplicationLeftColumn';
import { ApplicationRightColumn } from './ApplicationRightColumn';

// Tabs (Lazy)
const DQFileTab = React.lazy(() => import('../tabs').then(m => ({ default: m.DQFileTab })));
const GeneralDocumentsTab = React.lazy(() => import('../tabs').then(m => ({ default: m.GeneralDocumentsTab })));
const NotesTab = React.lazy(() => import('../tabs').then(m => ({ default: m.NotesTab })));
const ActivityHistoryTab = React.lazy(() => import('../tabs').then(m => ({ default: m.ActivityHistoryTab })));
const PEVTab = React.lazy(() => import('../tabs').then(m => ({ default: m.PEVTab })));

import { SendOfferModal } from '../modals';
import { MoveApplicationModal, DeleteConfirmModal } from '@shared/components/modals/ApplicationModals.jsx';
import { ContactTab } from '@features/companies';

// Loading Spinner Component
const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="text-blue-600 animate-spin" />
    </div>
);

// Tab Fallback
const TabFallback = () => (
    <div className="h-64 flex items-center justify-center text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading...
    </div>
);

export function ApplicationDetailViewV2({
    companyId,
    applicationId,
    onClosePanel,
    onStatusUpdate,
    isCompanyAdmin,
    onPhoneClick
}) {
    const { currentUser } = useData();
    const { showSuccess, showError } = useToast();

    const {
        // From useApplicationDetails
        loading, error, appData, collectionName, fileUrls, currentStatus,
        isEditing, setIsEditing, isSaving, canEdit,
        teamMembers, assignedTo, handleAssignChange,
        loadApplication, handleDataChange, handleSaveEdit, handleStatusUpdate,

        // From useApplicationView
        showDeleteConfirm, setShowDeleteConfirm,
        showMoveModal, setShowMoveModal,
        showOfferModal, setShowOfferModal,
        activeSection, setActiveSection,
        dqFiles, dqStatus,
        isSuperAdmin, canEditAllFields, currentAppName, driverId,
        handleDownloadPdf, handleManagementComplete, handleWorkflowAction
    } = useApplicationView(companyId, applicationId, onStatusUpdate, onClosePanel, onPhoneClick);

    // --- Activity & Notes State (for right column) ---
    const [activities, setActivities] = useState([]);
    const [notes, setNotes] = useState([]);
    const [isLoadingNotes, setIsLoadingNotes] = useState(true);

    // --- Subscribe to activities and notes ---
    useEffect(() => {
        if (!companyId || !applicationId || !collectionName) return;

        // Activities subscription
        const activitiesRef = collection(db, 'companies', companyId, collectionName, applicationId, 'activity_logs');
        const activitiesQuery = query(activitiesRef, orderBy('timestamp', 'desc'), limit(20));

        const unsubActivities = onSnapshot(activitiesQuery, (snapshot) => {
            setActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => console.error('Activities subscription error:', err));

        // Notes subscription
        const notesRef = collection(db, 'companies', companyId, collectionName, applicationId, 'notes');
        const notesQuery = query(notesRef, orderBy('createdAt', 'desc'), limit(10));

        const unsubNotes = onSnapshot(notesQuery, (snapshot) => {
            setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoadingNotes(false);
        }, (err) => {
            console.error('Notes subscription error:', err);
            setIsLoadingNotes(false);
        });

        return () => {
            unsubActivities();
            unsubNotes();
        };
    }, [companyId, applicationId, collectionName]);

    // --- Add Note Handler ---
    const handleAddNote = async (content) => {
        if (!companyId || !applicationId || !collectionName) return;

        try {
            const notesRef = collection(db, 'companies', companyId, collectionName, applicationId, 'notes');
            await addDoc(notesRef, {
                content,
                author: currentUser?.displayName || currentUser?.email || 'Unknown',
                authorId: currentUser?.uid,
                createdAt: serverTimestamp(),
                pinned: false
            });
            showSuccess('Note added');
        } catch (err) {
            console.error('Error adding note:', err);
            showError('Failed to add note');
        }
    };

    // Tab Navigation - simplified for two-column layout
    const navItems = [
        { id: 'application', label: 'Application', icon: Briefcase },
        { id: 'dq', label: 'DQ Files', icon: UserCheck },
        { id: 'files', label: 'Files', icon: Folder },
        { id: 'contact', label: 'Contact', icon: Mail },
        { id: 'pev', label: 'PEV', icon: Briefcase },
        { id: 'notes', label: 'Notes', icon: MessageSquare },
        { id: 'activity', label: 'Activity', icon: Clock }
    ];

    // Render tab content (for non-application tabs)
    const renderTabContent = () => {
        switch (activeSection) {
            case 'contact':
                return <Suspense fallback={<TabFallback />}>
                    <ContactTab companyId={companyId} recordId={applicationId} collectionName={collectionName} email={appData.email} phone={appData.phone} applicantData={appData} />
                </Suspense>;
            case 'notes':
                return <Suspense fallback={<TabFallback />}>
                    <NotesTab companyId={companyId} applicationId={applicationId} collectionName={collectionName} />
                </Suspense>;
            case 'dq':
                return <Suspense fallback={<TabFallback />}>
                    <DQFileTab companyId={companyId} applicationId={applicationId} collectionName={collectionName} />
                </Suspense>;
            case 'pev':
                return <Suspense fallback={<TabFallback />}>
                    <PEVTab companyId={companyId} applicationId={applicationId} appData={appData} />
                </Suspense>;
            case 'files':
                return <Suspense fallback={<TabFallback />}>
                    <GeneralDocumentsTab companyId={companyId} applicationId={applicationId} appData={appData} fileUrls={fileUrls} collectionName={collectionName} />
                </Suspense>;
            case 'activity':
                return <Suspense fallback={<TabFallback />}>
                    <ActivityHistoryTab companyId={companyId} applicationId={applicationId} collectionName={collectionName} />
                </Suspense>;
            default:
                return null;
        }
    };

    // Render main content
    const renderContent = () => {
        if (loading) return <LoadingSpinner />;
        if (error) return <div className="flex items-center justify-center h-64"><p className="text-red-500">{error}</p></div>;
        if (!appData) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">No data available</p></div>;

        // For the 'application' tab, render the two-column layout
        if (activeSection === 'application') {
            return (
                <div className="two-column-layout flex flex-col lg:flex-row gap-6">
                    {/* Left Column - Main content, full width on mobile */}
                    <div className="left-column flex-1 min-w-0">
                        <ApplicationLeftColumn
                            appData={appData}
                            currentStatus={currentStatus}
                            dqStatus={dqStatus}
                            fileUrls={fileUrls}
                            isEditing={isEditing}
                            onDataChange={handleDataChange}
                            canEditAllFields={canEditAllFields}
                            onPhoneClick={onPhoneClick}
                            onViewDocument={(key, url) => window.open(url, '_blank')}
                            setActiveSection={setActiveSection}
                        />
                    </div>

                    {/* Right Column - Sidebar, hidden on mobile/tablet, shown on desktop */}
                    <div className="right-column hidden lg:block w-full lg:w-80 xl:w-96 shrink-0">
                        <ApplicationRightColumn
                            appData={appData}
                            activities={activities}
                            notes={notes}
                            dqStatus={dqStatus}
                            onAddNote={handleAddNote}
                            onPhoneClick={onPhoneClick}
                            isLoadingNotes={isLoadingNotes}
                        />
                    </div>
                </div>
            );
        }

        // For other tabs, render full-width
        return renderTabContent();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-[60] backdrop-blur-md flex justify-end transition-opacity duration-300" onClick={onClosePanel}>
            <div className="bg-white w-[95%] md:w-[90%] lg:w-[85%] xl:w-[80%] h-full shadow-2xl flex flex-col transform transition-transform duration-300 border-l border-gray-200" onClick={e => e.stopPropagation()}>
                {/* Top Bar - Sticky */}
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50 flex justify-between items-center shrink-0 z-20 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Assignee:</label>
                            <select
                                className="px-2 py-1 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={assignedTo}
                                onChange={(e) => handleAssignChange(e.target.value)}
                                disabled={!canEdit}
                            >
                                <option value="">Unassigned</option>
                                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!loading && appData && (
                            <>
                                {canEdit && ['Approved', 'Background Check'].includes(currentStatus) && (
                                    <button onClick={() => setShowOfferModal(true)} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition shadow-sm flex items-center gap-2">
                                        <FileSignature size={16} /> Offer
                                    </button>
                                )}
                                <button className="px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm transition flex items-center gap-2" onClick={handleDownloadPdf}>
                                    <Download size={16} /> PDF
                                </button>
                            </>
                        )}
                        <div className="h-6 w-px bg-gray-300 mx-1" />
                        <button className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition" onClick={onClosePanel}>
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className="p-6 space-y-5">
                        {!loading && appData && (
                            <>
                                <CandidateHero
                                    appData={appData}
                                    currentStatus={currentStatus}
                                    handleStatusUpdate={handleStatusUpdate}
                                    canEdit={canEdit}
                                    onPhoneClick={onPhoneClick}
                                />
                                <WorkflowProgressBar currentStatus={currentStatus} />
                            </>
                        )}

                        {/* Tab Navigation */}
                        <div className="flex items-center gap-1 p-1.5 bg-gray-100/80 rounded-2xl backdrop-blur-sm sticky top-0 z-10">
                            {navItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeSection === item.id
                                        ? 'bg-white text-blue-600 shadow-md ring-1 ring-gray-200/50'
                                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'}`}
                                >
                                    <item.icon size={16} className={activeSection === item.id ? 'text-blue-500' : ''} />
                                    <span className="hidden sm:inline">{item.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        {renderContent()}
                    </div>
                </div>

                {/* Footer Actions - Sticky */}
                {(canEdit || isSuperAdmin) && activeSection === 'application' && !loading && (
                    <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                        <div className="flex gap-3">
                            {isSuperAdmin && !isEditing && (
                                <button className="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200 transition flex items-center gap-2" onClick={() => setShowMoveModal(true)}>
                                    <ArrowRight size={16} /> Move
                                </button>
                            )}
                            {!isEditing ? (
                                <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition flex items-center gap-2 shadow-sm" onClick={() => setIsEditing(true)}>
                                    <Edit2 size={16} /> Edit
                                </button>
                            ) : (
                                <>
                                    <button className="px-4 py-2 text-gray-600 hover:underline font-medium" onClick={() => { setIsEditing(false); loadApplication(); }}>Cancel</button>
                                    <button className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition flex items-center gap-2 shadow-md" onClick={handleSaveEdit} disabled={isSaving}>
                                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
                                    </button>
                                </>
                            )}
                        </div>
                        {!isEditing && (
                            <button className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-bold transition flex items-center gap-2" onClick={() => setShowDeleteConfirm(true)}>
                                <Trash2 size={16} /> Delete
                            </button>
                        )}
                    </div>
                )}

                {/* Modals */}
                {showDeleteConfirm && (
                    <DeleteConfirmModal
                        appName={currentAppName}
                        companyId={companyId}
                        applicationId={applicationId}
                        collectionName={collectionName}
                        onClose={() => setShowDeleteConfirm(false)}
                        onDeletionComplete={handleManagementComplete}
                    />
                )}
                {showMoveModal && isSuperAdmin && (
                    <MoveApplicationModal
                        sourceCompanyId={companyId}
                        applicationId={applicationId}
                        onClose={() => setShowMoveModal(false)}
                        onMoveComplete={handleManagementComplete}
                    />
                )}
                {showOfferModal && (
                    <SendOfferModal
                        companyId={companyId}
                        applicationId={applicationId}
                        driverId={driverId}
                        driverName={currentAppName}
                        onClose={() => setShowOfferModal(false)}
                        onOfferSent={() => { handleStatusUpdate('Offer Sent'); loadApplication(); }}
                    />
                )}
            </div>
        </div>
    );
}

export default ApplicationDetailViewV2;
