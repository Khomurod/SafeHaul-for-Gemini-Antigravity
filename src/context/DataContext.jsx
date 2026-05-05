// src/context/DataContext.jsx
import React, { useState, useEffect, useContext, createContext, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@lib/firebase';
import { doc, getDoc, collection, getCountFromServer } from 'firebase/firestore';
import { SafeHaulLoader } from '@shared/components/SafeHaulLoader';
import { CompanyChooserModal } from '@shared/components/modals';
import { RoleSelectionModal } from '@shared/components/modals/RoleSelectionModal';
import { SESSION_KEYS } from './dataContext/sessionKeys';
import { extractRoleContext, getPrimaryCompanyRole } from './dataContext/claims';

export const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export function DataProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserClaims, setCurrentUserClaims] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const [currentCompanyProfile, setCurrentCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCompanyChooser, setShowCompanyChooser] = useState(false);

  const [hasDriverProfile, setHasDriverProfile] = useState(false);
  const [hasEmployerProfile, setHasEmployerProfile] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState(null);

  // Prevent stale async auth callbacks from overriding state.
  const authVersionRef = useRef(0);

  const loginToCompany = useCallback(async (companyId, _role, isAutoLogin = false) => {
    if (!isAutoLogin) setLoading(true);
    try {
      const companyDoc = await getDoc(doc(db, 'companies', companyId));
      if (companyDoc.exists()) {
        const companyData = { id: companyDoc.id, ...companyDoc.data() };
        setCurrentCompanyProfile(companyData);
        localStorage.setItem(SESSION_KEYS.SELECTED_COMPANY_ID, companyId);
        setShowCompanyChooser(false);
      } else {
        console.warn('Saved company ID no longer exists.');
        localStorage.removeItem(SESSION_KEYS.SELECTED_COMPANY_ID);
        if (isAutoLogin) setShowCompanyChooser(true);
      }
    } catch (error) {
      console.error('Error logging into company:', error);
      localStorage.removeItem(SESSION_KEYS.SELECTED_COMPANY_ID);
    } finally {
      if (!isAutoLogin) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const thisVersion = ++authVersionRef.current;

      try {
        if (!user) {
          setCurrentUser(null);
          setCurrentUserClaims(null);
          setCurrentCompanyProfile(null);
          setUserRole(null);
          setShowCompanyChooser(false);
          setHasDriverProfile(false);
          setHasEmployerProfile(false);
          setShowRoleSelection(false);
          setSelectedPortal(null);
          localStorage.removeItem(SESSION_KEYS.SELECTED_COMPANY_ID);
          localStorage.removeItem(SESSION_KEYS.SELECTED_PORTAL);
          localStorage.removeItem(SESSION_KEYS.PLATFORM_STATS);
          return;
        }

        setLoading(true);

        const idTokenResult = await user.getIdTokenResult();
        if (authVersionRef.current !== thisVersion) return;

        const claims = idTokenResult.claims;
        const { roles, hasCompanyRoles, isSuperAdmin } = extractRoleContext(claims);

        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (authVersionRef.current !== thisVersion) return;
        const isDriver = driverDoc.exists();

        setCurrentUser(user);
        setCurrentUserClaims(claims);
        setHasDriverProfile(isDriver);
        setHasEmployerProfile(isSuperAdmin || hasCompanyRoles);

        if (isSuperAdmin) {
          try {
            const [companiesSnap, driversSnap] = await Promise.all([
              getCountFromServer(collection(db, 'companies')),
              getCountFromServer(collection(db, 'drivers')),
            ]);
            if (authVersionRef.current !== thisVersion) return;
            const platformStats = {
              companies: companiesSnap.data().count || 0,
              drivers: driversSnap.data().count || 0,
              updatedAt: Date.now(),
            };
            localStorage.setItem(SESSION_KEYS.PLATFORM_STATS, JSON.stringify(platformStats));
          } catch (statsErr) {
            console.warn('Could not cache platform stats:', statsErr);
          }
        }

        const savedPortal = localStorage.getItem(SESSION_KEYS.SELECTED_PORTAL);

        if (isSuperAdmin) {
          setUserRole('super_admin');
          setSelectedPortal('employer');
          const savedCompanyId = localStorage.getItem(SESSION_KEYS.SELECTED_COMPANY_ID);
          if (savedCompanyId) {
            await loginToCompany(savedCompanyId, null, true);
          }
          return;
        }

        if (isDriver && hasCompanyRoles) {
          if (savedPortal === 'driver') {
            setUserRole('driver');
            setSelectedPortal('driver');
            return;
          }

          if (savedPortal === 'employer') {
            setUserRole(getPrimaryCompanyRole(claims));
            setSelectedPortal('employer');
            const savedCompanyId = localStorage.getItem(SESSION_KEYS.SELECTED_COMPANY_ID);
            if (savedCompanyId) {
              await loginToCompany(savedCompanyId, null, true);
            } else {
              setShowCompanyChooser(true);
            }
            return;
          }

          setShowRoleSelection(true);
          setUserRole(null);
          return;
        }

        if (hasCompanyRoles) {
          setUserRole(getPrimaryCompanyRole(claims));
          setSelectedPortal('employer');
          const savedCompanyId = localStorage.getItem(SESSION_KEYS.SELECTED_COMPANY_ID);
          if (savedCompanyId) {
            await loginToCompany(savedCompanyId, null, true);
          } else {
            setShowCompanyChooser(true);
          }
          return;
        }

        if (isDriver) {
          setUserRole('driver');
          setSelectedPortal('driver');
          return;
        }

        // Fallback for users with no explicit claim mapping yet.
        setUserRole(roles.globalRole || 'driver');
        setSelectedPortal('driver');
      } catch (error) {
        console.error('Error initializing user data:', error);
      } finally {
        if (authVersionRef.current === thisVersion) {
          setLoading(false);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loginToCompany]);

  const handlePortalSelection = async (portal) => {
    setSelectedPortal(portal);
    localStorage.setItem(SESSION_KEYS.SELECTED_PORTAL, portal);
    setShowRoleSelection(false);

    if (portal === 'driver') {
      setUserRole('driver');
      window.location.href = '/driver/dashboard';
      return;
    }

    const actualRole = getPrimaryCompanyRole(currentUserClaims || {});
    setUserRole(actualRole);

    const savedCompanyId = localStorage.getItem(SESSION_KEYS.SELECTED_COMPANY_ID);
    if (savedCompanyId) {
      await loginToCompany(savedCompanyId, null, true);
      window.location.href = '/company/dashboard';
    } else {
      setShowCompanyChooser(true);
    }
  };

  const switchPortal = () => {
    localStorage.removeItem(SESSION_KEYS.SELECTED_PORTAL);
    setSelectedPortal(null);
    setUserRole(null);
    setShowRoleSelection(true);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      localStorage.removeItem(SESSION_KEYS.SELECTED_COMPANY_ID);
      localStorage.removeItem(SESSION_KEYS.SELECTED_PORTAL);
      window.location.href = '/login';
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  const returnToCompanyChooser = () => {
    setCurrentCompanyProfile(null);
    localStorage.removeItem(SESSION_KEYS.SELECTED_COMPANY_ID);
    setShowCompanyChooser(true);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <SafeHaulLoader size="h-20 w-20" className="mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Platform...</p>
        </div>
      </div>
    );
  }

  const contextValue = {
    currentUser,
    currentUserClaims,
    userRole,
    currentCompanyProfile,
    setCurrentCompanyProfile,
    loginToCompany,
    handleLogout,
    logout: handleLogout,
    returnToCompanyChooser,
    setShowCompanyChooser,
    loading,
    hasDriverProfile,
    hasEmployerProfile,
    selectedPortal,
    switchPortal,
    canSwitchPortals: hasDriverProfile && hasEmployerProfile,
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}

      {currentUser && showRoleSelection && !loading && (
        <RoleSelectionModal onSelect={handlePortalSelection} />
      )}

      {currentUser && showCompanyChooser && !loading && userRole === 'company_admin' && !showRoleSelection && (
        <CompanyChooserModal />
      )}
    </DataContext.Provider>
  );
}
