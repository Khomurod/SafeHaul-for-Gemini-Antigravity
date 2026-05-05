import React from 'react';
import {
  LayoutDashboard,
  Building,
  Users,
  FileText,
  Layers,
  Plus,
  BarChart3,
  Activity,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { SUPER_ADMIN_NAV_ITEMS } from '../config/views';

function NavItem({ label, icon, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left font-medium
        ${isActive
          ? "bg-blue-600 text-white shadow-md"
          : "text-gray-700 hover:bg-gray-100"
        }
        transition-all
      `}
    >
      {icon}
      {label}
    </button>
  );
}

export function SuperAdminSidebar({
  activeView,
  setActiveView,
  isSearching,
  onClearSearch,
}) {
  const iconMap = {
    LayoutDashboard,
    Building,
    Users,
    FileText,
    Layers,
    Plus,
    BarChart3,
    Activity,
    MessageSquare,
    RefreshCw,
  };

  const handleNavClick = (viewName) => {
    setActiveView(viewName);
    if (onClearSearch) onClearSearch();
  };

  let previousGroup = null;

  return (
    <nav className="w-full sm:w-64 shrink-0 bg-white p-4 rounded-xl shadow-lg border border-gray-200 space-y-2 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
      {SUPER_ADMIN_NAV_ITEMS.map((item) => {
        const Icon = iconMap[item.icon];
        const showDivider = previousGroup !== null && previousGroup !== item.group;
        previousGroup = item.group;

        return (
          <React.Fragment key={item.id}>
            {showDivider && <div className="my-2 border-t border-gray-100"></div>}
            <NavItem
              label={item.label}
              icon={<Icon size={20} />}
              isActive={activeView === item.id && !isSearching}
              onClick={() => handleNavClick(item.id)}
            />
          </React.Fragment>
        );
      })}
    </nav>
  );
}
