import React, { useState, useEffect } from 'react';
import { useCompanyDashboard } from '@features/companies/hooks/useCompanyDashboard';
import { DashboardTable } from '@features/companies/components/DashboardTable';
import { useData } from '@/context/DataContext';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { SafeHaulLeadsDriverModal } from '@shared/components/modals/SafeHaulLeadsDriverModal';
import { CallOutcomeModal } from '@shared/components/modals/CallOutcomeModal';
import { LeadAssignmentModal } from '../components/LeadAssignmentModal';

import { DriverProfileModal } from '../components/modals/driver-dossier/DriverProfileModal';
// const ApplicationDetailView = React.lazy(() => import('../components/application-v2').then(m => ({ default: m.ApplicationDetailViewV2 })));

export const CompanyCandidatesListPage = ({ scope }) => {
    // Scope maps to: 'applications', 'find_driver' (SafeHaul Leads), 'company_leads', 'my_leads'
    const { currentCompanyProfile, currentUserClaims } = useData();
    const companyId = currentCompanyProfile?.id;

    // Permission Check
    const isCompanyAdmin = currentUserClaims?.roles?.[companyId] === 'company_admin'
        || currentUserClaims?.roles?.globalRole === 'super_admin';

    // Initialize Dashboard Hook with the intended scope as the active tab
    const dashboard = useCompanyDashboard(companyId, scope);
    const { showError, showSuccess } = useToast();

    // Local State for Modals
    const [selectedApp, setSelectedApp] = useState(null);
    const [callModalData, setCallModalData] = useState(null);
    const [assigningLeads, setAssigningLeads] = useState([]);

    // Force hook to respect the scope prop if it changes
    useEffect(() => {
        if (scope && dashboard.activeTab !== scope) {
            dashboard.setActiveTab(scope);
        }
    }, [scope]);

    const handlePhoneClick = (e, item) => {
        if (e) e.stopPropagation();
        if (item && item.phone) {
            setCallModalData({ lead: item });
        } else {
            showError("No phone number available.");
        }
    };

    const handleOpenAssignment = (selectedIds) => {
        setAssigningLeads(selectedIds);
    };

    const handleAssignmentComplete = () => {
        showSuccess("Leads assigned successfully.");
        dashboard.refreshData();
    };

    // Render Logic for Detail Modals
    const renderSelectedModal = () => {
        if (!selectedApp) return null;

        // "Platform Leads" (SafeHaul Leads) always use the specific modal
        if (scope === 'find_driver' || selectedApp.isPlatformLead) {
            return (
                <SafeHaulLeadsDriverModal
                    lead={selectedApp}
                    onClose={() => setSelectedApp(null)}
                    onCallStart={() => handlePhoneClick(null, selectedApp)}
                />
            );
        }

        // Applications, Company Leads, My Leads use the NEW Driver Dossier Modal
        return (
            <DriverProfileModal
                key={selectedApp.id}
                companyId={companyId}
                driverId={selectedApp.id}
                isOpen={true}
                onClose={() => setSelectedApp(null)}
            />
        );
    };

    // Determine Page Title based on scope
    const getPageTitle = () => {
        switch (scope) {
            case 'applications': return 'Driver Applications';
            case 'find_driver': return 'SafeHaul Leads';
            case 'company_leads': return 'Company Leads';
            case 'my_leads': return 'My Leads';
            default: return 'Candidates';
        }
    };

    const canAssign = isCompanyAdmin && (scope === 'find_driver' || scope === 'company_leads');

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Page Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <h1 className="text-xl font-bold text-gray-900">{getPageTitle()}</h1>
                <p className="text-sm text-gray-500">Manage and track your driver pipeline.</p>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-hidden p-6">
                <div className="h-full bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
                    <DashboardTable
                        activeTab={scope} // Force the table to render for this specific scope
                        loading={dashboard.loading}
                        data={dashboard.paginatedData}
                        totalCount={dashboard.totalCount}

                        selectedId={selectedApp?.id}
                        onSelect={setSelectedApp}
                        onPhoneClick={handlePhoneClick}

                        searchQuery={dashboard.searchQuery}
                        setSearchQuery={dashboard.setSearchQuery}

                        filters={dashboard.filters}
                        setFilters={dashboard.setFilters}

                        currentPage={dashboard.currentPage}
                        itemsPerPage={dashboard.itemsPerPage}
                        totalPages={dashboard.totalPages}
                        setItemsPerPage={dashboard.setItemsPerPage}
                        nextPage={dashboard.nextPage}
                        prevPage={dashboard.prevPage}

                        latestBatchTime={dashboard.latestBatchTime}

                        // Assignment
                        canAssign={canAssign}
                        onAssignLeads={handleOpenAssignment}
                        teamMembers={dashboard.teamMembers}
                    />
                </div>
            </div>

            {/* Modals */}
            {renderSelectedModal()}

            {callModalData && (
                <CallOutcomeModal
                    lead={callModalData.lead}
                    companyId={companyId}
                    onClose={() => setCallModalData(null)}
                    onUpdate={(result) => {
                        dashboard.refreshData();
                    }}
                />
            )}

            {assigningLeads.length > 0 && (
                <LeadAssignmentModal
                    companyId={companyId}
                    selectedLeadIds={assigningLeads}
                    onClose={() => setAssigningLeads([])}
                    onSuccess={handleAssignmentComplete}
                />
            )}
        </div>
    );
};
