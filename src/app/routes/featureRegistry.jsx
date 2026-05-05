import React from 'react';

const lazyNamed = (loader, exportName) =>
  React.lazy(() => loader().then((module) => ({ default: module[exportName] })));

const lazyDefault = (loader) => React.lazy(loader);

/**
 * Central feature registration for route-mounted screens.
 * Adding new screens should happen here first.
 */
export const featureScreens = Object.freeze({
  superAdminDashboard: lazyNamed(
    () => import('@features/super-admin/components/SuperAdminDashboard'),
    'SuperAdminDashboard',
  ),
  companyAdminDashboard: lazyNamed(
    () => import('@features/company-admin/components/CompanyAdminDashboard'),
    'CompanyAdminDashboard',
  ),
  companyAppShell: lazyNamed(
    () => import('@features/company-admin/layout/CompanyAppShell'),
    'CompanyAppShell',
  ),
  companyCandidatesListPage: lazyNamed(
    () => import('@features/company-admin/views/CompanyCandidatesListPage'),
    'CompanyCandidatesListPage',
  ),
  searchDriversPage: lazyNamed(
    () => import('@features/company-admin/views/SearchDriversPage'),
    'SearchDriversPage',
  ),
  importLeadsPage: lazyNamed(
    () => import('@features/company-admin/views/ImportLeadsPage'),
    'ImportLeadsPage',
  ),
  quickAddLeadPage: lazyNamed(
    () => import('@features/company-admin/views/QuickAddLeadPage'),
    'QuickAddLeadPage',
  ),
  pipelineSheetPage: lazyNamed(
    () => import('@features/company-admin/views/PipelineSheetPage'),
    'PipelineSheetPage',
  ),
  userProfilePage: lazyNamed(
    () => import('@features/company-admin/views/UserProfilePage'),
    'UserProfilePage',
  ),
  companySettings: lazyNamed(
    () => import('@features/settings/components/CompanySettings'),
    'CompanySettings',
  ),
  driverDashboard: lazyNamed(
    () => import('@features/driver-app/components/DriverDashboard'),
    'DriverDashboard',
  ),
  driverApplicationWizard: lazyNamed(
    () => import('@features/driver-app/components/application/DriverApplicationWizard'),
    'DriverApplicationWizard',
  ),
  publicApplyHandler: lazyNamed(
    () => import('@features/driver-app/components/application/PublicApplyHandler'),
    'PublicApplyHandler',
  ),
  interestPage: lazyNamed(
    () => import('@features/driver-app/components/InterestPage'),
    'InterestPage',
  ),
  signingRoom: lazyDefault(() => import('@features/signing/SigningRoom')),
  verificationPortal: lazyNamed(
    () => import('@features/verification/VerificationPortal'),
    'VerificationPortal',
  ),
  documentsManager: lazyDefault(() => import('@features/company-admin/views/DocumentsManager')),
});

export const companyChildRouteDefs = Object.freeze([
  {
    path: 'dashboard',
    screen: 'companyAdminDashboard',
    featureName: 'Company Dashboard',
    requiresCompanyProfile: true,
  },
  {
    path: 'drivers/applications',
    screen: 'companyCandidatesListPage',
    featureName: 'Applications',
    props: { scope: 'applications' },
  },
  {
    path: 'drivers/leads/safehaul',
    screen: 'companyCandidatesListPage',
    featureName: 'SafeHaul Leads',
    props: { scope: 'find_driver' },
  },
  {
    path: 'drivers/leads/company',
    screen: 'companyCandidatesListPage',
    featureName: 'Company Leads',
    props: { scope: 'company_leads' },
  },
  {
    path: 'drivers/leads/my',
    screen: 'companyCandidatesListPage',
    featureName: 'My Leads',
    props: { scope: 'my_leads' },
  },
  {
    path: 'drivers/pipeline',
    screen: 'pipelineSheetPage',
    featureName: 'Pipeline',
  },
  {
    path: 'search',
    screen: 'searchDriversPage',
    featureName: 'Search Drivers',
  },
  {
    path: 'e-docs',
    screen: 'documentsManager',
    featureName: 'E-Docs',
  },
  {
    path: 'import-leads',
    screen: 'importLeadsPage',
    featureName: 'Import Leads',
  },
  {
    path: 'quick-add-lead',
    screen: 'quickAddLeadPage',
    featureName: 'Quick Add Lead',
  },
  {
    path: 'profile',
    screen: 'userProfilePage',
    featureName: 'Profile',
  },
  {
    path: 'settings',
    screen: 'companySettings',
    featureName: 'Company Settings',
    requiresCompanyProfile: true,
  },
]);
