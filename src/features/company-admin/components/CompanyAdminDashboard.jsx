import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { auth } from '@lib/firebase';
import { getPortalUser } from '@features/auth';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { StatCard, useCompanyDashboard } from '@features/companies';

import { CompanyBulkUpload } from './CompanyBulkUpload';
import { InlineLeaderboard } from './InlineLeaderboard';
import { QuickLeadModal } from './modals/QuickLeadModal';

import { useOnboarding } from '@features/onboarding/hooks/useOnboarding';
import { OnboardingTour } from '@features/onboarding/components/OnboardingTour';

import {
    FileText, Briefcase, User, CheckCircle
} from 'lucide-react';

export function CompanyAdminDashboard() {
    const { currentCompanyProfile, returnToCompanyChooser, currentUserClaims, currentUser, logout } = useData();
    const { showError } = useToast();
    const navigate = useNavigate();

    const { showTour, completeTour } = useOnboarding(currentUser);

    const companyId = currentCompanyProfile?.id;
    const companyName = currentCompanyProfile?.companyName;

    const isCompanyAdmin = currentUserClaims?.roles?.[companyId] === 'company_admin'
        || currentUserClaims?.roles?.globalRole === 'super_admin';

    // We only need the counts and loading state from the hook, not the full table data
    const dashboard = useCompanyDashboard(companyId);

    const [userName, setUserName] = useState('Admin User');
    const [userEmail, setUserEmail] = useState('');

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [showQuickLeadModal, setShowQuickLeadModal] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                setUserEmail(user.email);
                const portalUserDoc = await getPortalUser(user.uid);
                if (portalUserDoc && portalUserDoc.name) setUserName(portalUserDoc.name);
            }
        });
        return () => unsubscribe();
    }, []);

    const getInitials = (name) => {
        if (!name) return 'CO';
        const parts = name.split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    return (
        <div id="company-admin-container" className="h-full bg-gray-50 flex flex-col font-sans overflow-y-auto">

            {/* Main Content */}
            <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8">

                {/* Welcome Section */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Welcome back, {userName}</h1>
                    <p className="text-gray-500 mt-1">Here's what's happening at {companyName} today.</p>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {dashboard.statsFetchError && (
                        <div className="md:col-span-2 lg:col-span-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2" role="status">
                            <span>Some dashboard numbers could not load: {dashboard.statsFetchError}</span>
                            <button
                                type="button"
                                className="font-semibold text-amber-950 underline"
                                onClick={() => dashboard.refreshData()}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    <StatCard
                        id="stat-card-applications"
                        title="Applications"
                        value={dashboard.counts?.applications || 0}
                        icon={<FileText size={20} />}
                        colorClass="ring-blue-500 bg-blue-500"
                        onClick={() => navigate('/company/drivers/applications')}
                        active={false}
                    />

                    <StatCard
                        id="stat-card-company_leads"
                        title="Company Leads"
                        value={dashboard.counts?.companyLeads || 0}
                        icon={<Briefcase size={20} />}
                        colorClass="ring-orange-500 bg-orange-500"
                        onClick={() => navigate('/company/drivers/leads/company')}
                        active={false}
                    />
                    <StatCard
                        id="stat-card-my_leads"
                        title="My Leads"
                        value={dashboard.counts?.myLeads || 0}
                        icon={<User size={20} />}
                        colorClass="ring-green-500 bg-green-500"
                        onClick={() => navigate('/company/drivers/leads/my')}
                        active={false}
                    />
                    {/* P4 FIX: 4th StatCard to fill the 4-column grid */}
                    <StatCard
                        id="stat-card-hired"
                        title="Hired"
                        value={dashboard.counts?.hired || 0}
                        icon={<CheckCircle size={20} />}
                        colorClass="ring-emerald-500 bg-emerald-500"
                        onClick={() => navigate('/company/drivers/applications')}
                        active={false}
                    />
                </div>

                {/* Leaderboard */}
                <div className="grid grid-cols-1 gap-6">
                    <InlineLeaderboard companyId={companyId} />
                </div>
            </div>

            {/* Modals and Overlays */}
            {isUploadModalOpen && isCompanyAdmin && (
                <CompanyBulkUpload
                    companyId={companyId}
                    onClose={() => setIsUploadModalOpen(false)}
                    onUploadComplete={dashboard.refreshData}
                />
            )}

            {showQuickLeadModal && (
                <QuickLeadModal
                    companyId={companyId}
                    onClose={() => setShowQuickLeadModal(false)}
                    onSuccess={() => {
                        dashboard.refreshData();
                        navigate('/company/drivers/leads/company');
                    }}
                />
            )}

            {showTour && <OnboardingTour onComplete={completeTour} />}
        </div>
    );
}
