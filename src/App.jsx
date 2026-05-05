// src/App.jsx
import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider, useData } from '@/context/DataContext';
import {
  ToastProvider,
  ErrorBoundary,
  FeatureErrorBoundary,
  GlobalLoadingState,
} from '@shared/components/feedback';
import { QueueStatusIndicator } from '@shared/components/feedback/QueueStatusIndicator';
import { DiscontinuedLeadsPopup } from '@shared/components/modals/DiscontinuedLeadsPopup';
import { featureScreens, companyChildRouteDefs } from '@app/routes/featureRegistry';

// Keep Auth screens eager-loaded as they are the entry point
import { LoginScreen, TeamMemberSignup } from '@features/auth';

function withFeatureBoundary(featureName, element) {
  return (
    <FeatureErrorBoundary featureName={featureName}>
      {element}
    </FeatureErrorBoundary>
  );
}

// --- ROUTE GUARDS ---
function RootRedirect() {
  const { currentUser, userRole, loading } = useData();
  if (loading) return <GlobalLoadingState />;
  if (!currentUser) return <Navigate to="/login" />;

  if (userRole === 'super_admin') return <Navigate to="/super-admin" />;
  // P2 FIX: Accept all company-side roles, not just 'company_admin'
  if (['company_admin', 'hr_user', 'recruiter'].includes(userRole)) return <Navigate to="/company/dashboard" />;
  if (userRole === 'driver') return <Navigate to="/driver/dashboard" />;

  // P0 FIX: If role is null (pending selection modal), don't show infinite loader
  // The RoleSelectionModal in DataContext will handle this case
  if (!userRole) return null;

  return <Navigate to="/login" />;
}

// P3-12 FIX: Redirect authenticated users away from login page
function AuthGuardedLogin() {
  const { currentUser, loading } = useData();
  if (loading) return <GlobalLoadingState />;
  if (currentUser) return <Navigate to="/" replace />;
  return <LoginScreen />;
}
function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userRole, loading } = useData();
  if (loading) return <GlobalLoadingState />;
  if (!currentUser) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(userRole)) return <Navigate to="/" />;
  return children;
}

// --- MAIN ROUTER ---
function AppRoutes() {
  const { currentCompanyProfile } = useData();
  const {
    superAdminDashboard: SuperAdminDashboardScreen,
    companyAppShell: CompanyAppShellScreen,
    publicApplyHandler: PublicApplyHandlerScreen,
    interestPage: InterestPageScreen,
    signingRoom: SigningRoomScreen,
    verificationPortal: VerificationPortalScreen,
    driverDashboard: DriverDashboardScreen,
    driverApplicationWizard: DriverApplicationWizardScreen,
  } = featureScreens;

  const superAdminElement = withFeatureBoundary(
    'Super Admin',
    <SuperAdminDashboardScreen />,
  );

  const companyLayoutElement = withFeatureBoundary(
    'Company Workspace',
    <CompanyAppShellScreen />,
  );

  return (
    <Suspense fallback={<GlobalLoadingState />}>
      <Routes>
        {/* --- PUBLIC ROUTES (No Login Required) --- */}
        {/* P3-12 FIX: Redirect authenticated users away from login */}
        <Route path="/login" element={<AuthGuardedLogin />} />
        <Route path="/join/:companyId" element={<TeamMemberSignup />} />

        {/* Public Driver Routes */}
        <Route
          path="/apply/:slug"
          element={withFeatureBoundary('Driver Application', <PublicApplyHandlerScreen />)}
        />

        {/* FIX: New route for personalized recruiter invites */}
        <Route
          path="/interest/:slug"
          element={withFeatureBoundary('Interest Page', <InterestPageScreen />)}
        />

        {/* Signing Room (Publicly Accessible via Token) */}
        <Route
          path="/sign/:companyId/:requestId"
          element={withFeatureBoundary('E-Signature Room', <SigningRoomScreen />)}
        />

        {/* Employment Verification Portal (Publicly Accessible via Token) */}
        <Route
          path="/verify/:token"
          element={withFeatureBoundary('Verification Portal', <VerificationPortalScreen />)}
        />

        {/* --- PROTECTED ROUTES (Login Required) --- */}

        {/* Super Admin */}
        <Route path="/super-admin/*" element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            {superAdminElement}
          </ProtectedRoute>
        } />

        {/* Company Admin / HR */}
        {/* Company Admin / HR */}
        <Route path="/company" element={
          <ProtectedRoute allowedRoles={['company_admin', 'super_admin', 'hr_user', 'recruiter']}>
            {companyLayoutElement}
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="dashboard" replace />} />
          {companyChildRouteDefs.map((routeDef) => {
            const Screen = featureScreens[routeDef.screen];
            if (!Screen) return null;

            if (routeDef.path === 'settings' && !currentCompanyProfile) {
              return (
                <Route
                  key={routeDef.path}
                  path={routeDef.path}
                  element={<Navigate to="/company/dashboard" />}
                />
              );
            }

            const content = routeDef.requiresCompanyProfile && !currentCompanyProfile
              ? (
                <div className="min-h-screen flex items-center justify-center text-gray-700">
                  Please select a company.
                </div>
                )
              : <Screen {...(routeDef.props || {})} />;

            return (
              <Route
                key={routeDef.path}
                path={routeDef.path}
                element={withFeatureBoundary(routeDef.featureName, content)}
              />
            );
          })}
        </Route>

        {/* Driver App */}
        <Route path="/driver/dashboard" element={
          <ProtectedRoute allowedRoles={['driver']}>
            {withFeatureBoundary('Driver Dashboard', <DriverDashboardScreen />)}
          </ProtectedRoute>
        } />

        <Route path="/driver/apply" element={
          <ProtectedRoute allowedRoles={['driver']}>
            {withFeatureBoundary('Driver Application', <DriverApplicationWizardScreen />)}
          </ProtectedRoute>
        } />

        <Route path="/driver/apply/:companyId" element={
          <ProtectedRoute allowedRoles={['driver']}>
            {withFeatureBoundary('Driver Application', <DriverApplicationWizardScreen />)}
          </ProtectedRoute>
        } />

        {/* Fallbacks */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <DataProvider>
          <Router>
            <AppRoutes />
            {/* Bulletproof: Show queue/offline status indicator */}
            <QueueStatusIndicator />
            <DiscontinuedLeadsPopup />
          </Router>
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
