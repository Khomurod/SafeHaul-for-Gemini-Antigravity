import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  User,
  Search,
  FileText,
  Megaphone,
  Upload,
  PlusCircle,
  Settings,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  GitBranch,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import {
  COMPANY_ROUTE_MANIFEST,
  COMPANY_NAV_GROUPS,
  COMPANY_NAV_LAYOUT,
} from '@app/routes/companyRouteManifest';

const SIDEBAR_STORAGE_KEY = 'companySidebarMode';
const ICON_MAP = Object.freeze({
  LayoutDashboard,
  Users,
  Building2,
  User,
  Search,
  FileText,
  Megaphone,
  Upload,
  PlusCircle,
  Settings,
  GitBranch,
});

function stripEdgeDividers(entries) {
  const cleaned = [];
  for (const entry of entries) {
    if (entry.type === 'divider' && cleaned.length === 0) continue;
    if (entry.type === 'divider' && cleaned[cleaned.length - 1]?.type === 'divider') continue;
    cleaned.push(entry);
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'divider') {
    cleaned.pop();
  }
  return cleaned;
}

export const CompanySidebar = () => {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? stored === 'expanded' : true;
  });

  const [expandedGroups, setExpandedGroups] = useState({
    applications: true
  });

  const { currentCompanyProfile, currentUserClaims } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const routeLookup = useMemo(
    () => new Map(COMPANY_ROUTE_MANIFEST.map((route) => [route.id, route])),
    [],
  );
  const featureFlags = currentCompanyProfile?.features || {};

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, isExpanded ? 'expanded' : 'minimized');
  }, [isExpanded]);

  const toggleSidebar = () => setIsExpanded(!isExpanded);

  const toggleGroup = (group) => {
    if (!isExpanded) {
      setIsExpanded(true);
      setExpandedGroups(prev => ({ ...prev, [group]: true }));
    } else {
      setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    }
  };

  const companyId = currentCompanyProfile?.id;
  const isCompanyAdmin = currentCompanyProfile && (
    currentUserClaims?.roles?.[companyId] === 'company_admin' ||
    currentUserClaims?.roles?.globalRole === 'super_admin'
  );

  const isRouteVisible = (route) => {
    const nav = route?.nav;
    if (!nav) return false;
    if (nav.adminOnly && !isCompanyAdmin) return false;
    if (nav.featureFlag && featureFlags[nav.featureFlag] === false) return false;
    return true;
  };

  const toMenuItem = (route) => ({
    id: route.id,
    label: route.nav.label,
    icon: ICON_MAP[route.nav.icon] || FileText,
    path: `/company/${route.path}`,
  });

  const menuEntries = useMemo(() => {
    const entries = [];
    for (const block of COMPANY_NAV_LAYOUT) {
      if (block.type === 'divider') {
        entries.push({ type: 'divider' });
        continue;
      }

      if (block.type === 'route') {
        const route = routeLookup.get(block.routeId);
        if (route && isRouteVisible(route)) {
          entries.push({ type: 'item', item: toMenuItem(route) });
        }
        continue;
      }

      if (block.type === 'section') {
        const routes = COMPANY_ROUTE_MANIFEST
          .filter((route) => route.nav?.kind === 'item' && route.nav.section === block.section)
          .filter((route) => isRouteVisible(route))
          .map(toMenuItem);
        for (const item of routes) entries.push({ type: 'item', item });
        continue;
      }

      if (block.type === 'group') {
        const group = COMPANY_NAV_GROUPS[block.group];
        if (!group) continue;
        const children = COMPANY_ROUTE_MANIFEST
          .filter((route) => route.nav?.kind === 'group-item' && route.nav.group === block.group)
          .filter((route) => isRouteVisible(route))
          .map(toMenuItem);
        if (children.length > 0) {
          entries.push({ type: 'group', group, children });
        }
      }
    }
    return stripEdgeDividers(entries);
  }, [featureFlags, isCompanyAdmin, routeLookup]);

  const NavItem = ({ item, isChild = false }) => {
    return (
      <NavLink
        to={item.path}
        className={({ isActive }) => `
          flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group relative
          ${isActive
            ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-l-2 border-transparent'}
          ${isChild ? 'pl-9 text-sm' : ''}
          ${!isExpanded && !isChild ? 'justify-center' : ''}
        `}
      >
        {({ isActive }) => (
          <>
            <item.icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-900'} />

            {isExpanded && (
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                {item.label}
              </span>
            )}

            {!isExpanded && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-white text-gray-900 text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap border border-gray-200 shadow-lg">
                {item.label}
              </div>
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <div
      className={`
        h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300
        ${isExpanded ? 'w-64' : 'w-16'}
      `}
    >
      {/* Top Header */}
      <div className="h-16 flex items-center px-4 border-b border-gray-200">
        <div className="flex items-center gap-3 w-full overflow-hidden">
          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
            {(currentCompanyProfile?.companyName || currentCompanyProfile?.name || 'C').charAt(0)}
          </div>

          {isExpanded && (
            <div className="flex flex-col min-w-0">
              <span className="text-gray-900 font-medium truncate">
                {currentCompanyProfile?.companyName || currentCompanyProfile?.name || 'Company'}
              </span>
              <button onClick={() => navigate('/company/settings')} className={`text-xs text-blue-600 hover:text-blue-700 text-left truncate ${!isCompanyAdmin ? 'hidden' : ''}`}>
                Company Settings
              </button>
              <button onClick={() => navigate('/company/dashboard')} className={`text-xs text-gray-500 hover:text-gray-700 text-left truncate ${isCompanyAdmin ? 'hidden' : ''}`}>
                {/* Placeholder for non-admins if needed, or just hide the button above */}
                Team Member
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 overflow-y-auto overflow-x-hidden space-y-1 custom-scrollbar">
        {menuEntries.map((entry, idx) => {
          if (entry.type === 'divider') {
            return <div key={`divider-${idx}`} className="my-2 border-t border-gray-200"></div>;
          }

          if (entry.type === 'group') {
            const group = entry.group;
            const isGroupActive = expandedGroups[group.id];
            const hasActiveChild = entry.children.some(child => location.pathname === child.path);
            const GroupIcon = ICON_MAP[group.icon] || Users;

            return (
              <div key={group.id} className="mb-2">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`
                            w-full flex items-center gap-3 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors
                            ${!isExpanded ? 'justify-center' : ''}
                            ${hasActiveChild ? 'text-blue-700' : ''}
                        `}
                >
                  <GroupIcon size={20} className={hasActiveChild ? 'text-blue-600' : 'text-gray-500'} />
                  {isExpanded && (
                    <>
                      <span className="flex-1 text-left font-medium text-sm">{group.label}</span>
                      {isGroupActive ? <ChevronRight size={16} className="rotate-90 transition-transform" /> : <ChevronRight size={16} className="transition-transform" />}
                    </>
                  )}
                </button>

                {/* Children */}
                {isExpanded && isGroupActive && (
                  <div className="mt-1 space-y-0.5">
                    {entry.children.map((child) => (
                      <NavItem key={child.id} item={child} isChild={true} />
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return <NavItem key={entry.item.id} item={entry.item} />;
        })}
      </div>

      {/* Footer / Toggle */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          {isExpanded ? <ChevronsLeft size={20} /> : <ChevronsRight size={20} />}
        </button>
      </div>
    </div>
  );
};
