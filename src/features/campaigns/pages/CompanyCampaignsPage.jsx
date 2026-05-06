import React from 'react';
import { CampaignsDashboard } from '../CampaignsDashboard';
import { useData } from '@/context/DataContext';

export function CompanyCampaignsPage() {
  const { currentCompanyProfile } = useData();
  const companyId = currentCompanyProfile?.id;

  if (!companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">
        Please select a company.
      </div>
    );
  }

  return <CampaignsDashboard companyId={companyId} />;
}
