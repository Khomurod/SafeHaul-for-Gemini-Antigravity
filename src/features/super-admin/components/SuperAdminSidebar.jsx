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

/**
 * Super Admin section navigation.
 *
 * Migrated to the design system 2026-07-28. Presentation only — `setActiveView`
 * still receives the exact `SUPER_ADMIN_VIEWS` value for each item, the item
 * order and grouping are unchanged, and selecting an item still clears the
 * global search first (`onClearSearch`).
 *
 * Fixed here:
 *  - Legacy `bg-blue-600` / `text-gray-700` / `border-gray-200` palette replaced
 *    with `--ds-*` tokens.
 *  - The nav had no accessible name and the active item was communicated by
 *    colour alone — screen-reader users had no way to tell which section they
 *    were in. It is now a named `<nav>` whose active item carries
 *    `aria-current="page"`.
 *  - Mobile overflow: the old markup was `w-full sm:w-64 shrink-0` inside a
 *    `flex` row next to `flex-1` content, so below `sm` the sidebar demanded the
 *    full viewport width *and refused to shrink*, pushing the main region off
 *    screen. Below `sm` it is now a horizontally scrollable strip; the vertical
 *    rail returns from `sm` up.
 *
 * `DataTable`/`SectionNavigation` are deliberately not used: `SectionNavigation`
 * is the Company Settings tab contract (a single flat list inside a page), while
 * this is a grouped, always-visible application rail with different responsive
 * behaviour. Recorded in the roadmap rather than forcing an ill-fitting reuse.
 */
function NavItem({ label, icon, isActive, onClick }) {
  return (
    <li className="shrink-0 sm:shrink">
      <button
        type="button"
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={`
          flex w-full items-center gap-ds-3 whitespace-nowrap rounded-ds-md px-ds-4 py-ds-3
          text-left font-medium transition-colors
          focus-visible:outline-none focus-visible:shadow-ds-focus
          ${isActive
            ? "bg-ds-action-primary text-ds-content-inverse shadow-ds-sm"
            : "text-ds-content hover:bg-ds-surface-subtle"
          }
        `}
      >
        {icon}
        {label}
      </button>
    </li>
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
    <nav
      aria-label="Super Admin sections"
      data-testid="super-admin-sidebar"
      className="
        w-full min-w-0 shrink-0 overflow-x-auto rounded-ds-lg border border-ds-border-subtle
        bg-ds-surface p-ds-4 shadow-ds-md
        sm:sticky sm:top-24 sm:max-h-[calc(100vh-8rem)] sm:w-64 sm:overflow-x-visible
        sm:overflow-y-auto
      "
    >
      <ul className="flex flex-row gap-ds-2 sm:flex-col">
        {SUPER_ADMIN_NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          const showDivider = previousGroup !== null && previousGroup !== item.group;
          previousGroup = item.group;

          return (
            <React.Fragment key={item.id}>
              {showDivider && (
                <li
                  aria-hidden="true"
                  className="my-ds-2 hidden border-t border-ds-border-subtle sm:block"
                />
              )}
              <NavItem
                label={item.label}
                icon={<Icon size={20} aria-hidden="true" />}
                isActive={activeView === item.id && !isSearching}
                onClick={() => handleNavClick(item.id)}
              />
            </React.Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
