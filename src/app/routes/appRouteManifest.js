import {
  COMPANY_WORKSPACE_ROLES,
  DRIVER_ROLES,
  SUPER_ADMIN_ROLES,
} from '@app/auth/roles';

/**
 * Route-level manifest for app-level features.
 * Keeps route wiring declarative so new features can be mounted with
 * one entry instead of hand-editing JSX blocks in App.jsx.
 */
export const PUBLIC_FEATURE_ROUTE_MANIFEST = Object.freeze([
  {
    id: 'publicApply',
    path: '/apply/:slug',
    screen: 'publicApplyHandler',
    featureName: 'Driver Application',
  },
  {
    id: 'interestPage',
    path: '/interest/:slug',
    screen: 'interestPage',
    featureName: 'Interest Page',
  },
  {
    id: 'signingRoom',
    path: '/sign/:companyId/:requestId',
    screen: 'signingRoom',
    featureName: 'E-Signature Room',
  },
  {
    id: 'verificationPortal',
    path: '/verify/:token',
    screen: 'verificationPortal',
    featureName: 'Verification Portal',
  },
]);

export const PROTECTED_FEATURE_ROUTE_MANIFEST = Object.freeze([
  {
    id: 'superAdmin',
    path: '/super-admin/*',
    screen: 'superAdminDashboard',
    featureName: 'Super Admin',
    allowedRoles: SUPER_ADMIN_ROLES,
  },
  {
    id: 'driverDashboard',
    path: '/driver/dashboard',
    screen: 'driverDashboard',
    featureName: 'Driver Dashboard',
    allowedRoles: DRIVER_ROLES,
  },
  {
    id: 'driverApply',
    path: '/driver/apply',
    screen: 'driverApplicationWizard',
    featureName: 'Driver Application',
    allowedRoles: DRIVER_ROLES,
  },
  {
    id: 'driverApplyCompany',
    path: '/driver/apply/:companyId',
    screen: 'driverApplicationWizard',
    featureName: 'Driver Application',
    allowedRoles: DRIVER_ROLES,
  },
]);

export const COMPANY_WORKSPACE_ROUTE = Object.freeze({
  path: '/company',
  screen: 'companyAppShell',
  featureName: 'Company Workspace',
  allowedRoles: COMPANY_WORKSPACE_ROLES,
  indexRedirect: 'dashboard',
});
