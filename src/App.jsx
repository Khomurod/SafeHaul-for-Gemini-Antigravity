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
import { featureScreens, companyChildRouteDefs } from '@app/routes/featureRegistry';
import { isCompanyWorkspaceRole } from '@app/auth/roles';
import {
  COMPANY_WORKSPACE_ROUTE,
  PROTECTED_FEATURE_ROUTE_MANIFEST,
  PUBLIC_FEATURE_ROUTE_MANIFEST,
} from '@app/routes/appRouteManifest';

// Keep Auth screens eager-loaded as they are the entry point
import { LoginScreen } from '@features/auth';

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
  if (isCompanyWorkspaceRole(userRole)) return <Navigate to="/company/dashboard" />;
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
  const CompanyWorkspaceLayout = featureScreens[COMPANY_WORKSPACE_ROUTE.screen];

  return (
    <Suspense fallback={<GlobalLoadingState />}>
      <Routes>
        {/* --- PUBLIC ROUTES (No Login Required) --- */}
        {/* P3-12 FIX: Redirect authenticated users away from login */}
        <Route path="/login" element={<AuthGuardedLogin />} />
        {/* /join/:companyId route REMOVED — the underlying joinCompanyTeam
            Cloud Function was disabled, so this link only produced permission
            errors. Use the Super Admin "Create Portal User" flow instead. */}

        {/* Public feature routes */}
        {PUBLIC_FEATURE_ROUTE_MANIFEST.map((routeDef) => {
          const Screen = featureScreens[routeDef.screen];
          if (!Screen) return null;

          return (
            <Route
              key={routeDef.id}
              path={routeDef.path}
              element={withFeatureBoundary(routeDef.featureName, <Screen />)}
            />
          );
        })}

        {/* --- PROTECTED ROUTES (Login Required) --- */}
        {PROTECTED_FEATURE_ROUTE_MANIFEST.map((routeDef) => {
          const Screen = featureScreens[routeDef.screen];
          if (!Screen) return null;

          return (
            <Route
              key={routeDef.id}
              path={routeDef.path}
              element={(
                <ProtectedRoute allowedRoles={routeDef.allowedRoles}>
                  {withFeatureBoundary(routeDef.featureName, <Screen />)}
                </ProtectedRoute>
              )}
            />
          );
        })}

        {/* Company workspace */}
        {CompanyWorkspaceLayout && (
          <Route
            path={COMPANY_WORKSPACE_ROUTE.path}
            element={(
              <ProtectedRoute allowedRoles={COMPANY_WORKSPACE_ROUTE.allowedRoles}>
                {withFeatureBoundary(
                  COMPANY_WORKSPACE_ROUTE.featureName,
                  <CompanyWorkspaceLayout />,
                )}
              </ProtectedRoute>
            )}
          >
          <Route index element={<Navigate to={COMPANY_WORKSPACE_ROUTE.indexRedirect} replace />} />
          {companyChildRouteDefs.map((routeDef) => {
            const Screen = featureScreens[routeDef.screen];
            if (!Screen) return null;

            if (routeDef.id === 'settings' && !currentCompanyProfile) {
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
        )}

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
          </Router>
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
