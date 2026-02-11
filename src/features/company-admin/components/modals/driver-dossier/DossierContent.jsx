import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ApplicationTab } from './tabs/ApplicationTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { DQFileTab } from './tabs/DQFileTab';

// Lazy Load Legacy Tabs to keep bundle size optimized
const ActivityHistoryTab = React.lazy(() => import('@features/company-admin/components/tabs').then(m => ({ default: m.ActivityHistoryTab })));
const NotesTab = React.lazy(() => import('@features/company-admin/components/tabs').then(m => ({ default: m.NotesTab })));

export function DossierContent({
    activeTab,
    appData,
    driverId,
    companyId,
    collectionName,
    isEditing,
    setIsEditing,
    handleSaveEdit,
    isSaving,
    fileUrls
}) {
    // Shared Loading Fallback
    const TabLoading = () => (
        <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading Tab...
        </div>
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'application':
                return <ApplicationTab
                    appData={appData}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                />;

            case 'documents':
                return <DocumentsTab
                    appData={appData}
                    fileUrls={fileUrls}
                />;

            case 'dq':
                return <DQFileTab
                    companyId={companyId}
                    applicationId={driverId}
                    collectionName={collectionName}
                />;

            case 'activity':
                return (
                    <Suspense fallback={<TabLoading />}>
                        <ActivityHistoryTab
                            companyId={companyId}
                            applicationId={driverId}
                            collectionName={collectionName}
                        />
                    </Suspense>
                );

            case 'notes':
                return (
                    <Suspense fallback={<TabLoading />}>
                        <NotesTab
                            companyId={companyId}
                            applicationId={driverId}
                            collectionName={collectionName}
                        />
                    </Suspense>
                );

            default:
                return null;
        }
    };

    return (
        <div className="h-full animate-in fade-in duration-300">
            {renderContent()}
        </div>
    );
}
