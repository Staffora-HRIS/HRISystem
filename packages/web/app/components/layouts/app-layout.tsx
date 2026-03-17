/**
 * App Layout Component
 *
 * Main application layout with:
 * - Sidebar navigation with permission-based items
 * - Header with user menu, global search, and notifications
 * - Breadcrumbs
 * - Mobile responsive design
 */

import { useState, useEffect, useRef, useCallback, type ReactNode, type KeyboardEvent } from "react";
import { Link, useLocation, NavLink } from "react-router";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { useAuth, useSession } from "../../lib/auth";
import { usePermissions, PermissionGate } from "../../hooks/use-permissions";
import { useTenant, useUserTenants, useSwitchTenant } from "../../hooks/use-tenant";
import { getInitials } from "../../lib/utils";
import { Spinner } from "../ui/spinner";
import { GlobalEmployeeSearch } from "../employee/GlobalEmployeeSearch";
import {
  Home, User, Clock, Calendar, Heart, FileText, BookOpen,
  BadgeCheck, ClipboardList, HelpCircle, Users, ClipboardCheck,
  CalendarDays, BarChart3, Settings, Menu, Moon, Sun, LogOut,
  ChevronDown, Check, ChevronRight, X, Bell, Search, Network
} from "lucide-react";

// Navigation item types
interface NavItem {
  name: string;
  href: string;
  icon: ReactNode;
  permission?: string;
  children?: NavItem[];
  badge?: ReactNode;
}

// Main navigation items
const mainNavItems: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: <Home className="h-5 w-5" />,
  },
];

// Employee self-service items
const selfServiceItems: NavItem[] = [
  {
    name: "My Profile",
    href: "/me/profile",
    icon: <User className="h-5 w-5" />,
  },
  {
    name: "Time & Attendance",
    href: "/me/time",
    icon: <Clock className="h-5 w-5" />,
  },
  {
    name: "Leave Requests",
    href: "/me/leave",
    icon: <Calendar className="h-5 w-5" />,
  },
  {
    name: "Benefits",
    href: "/me/benefits",
    icon: <Heart className="h-5 w-5" />,
  },
  {
    name: "Documents",
    href: "/me/documents",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    name: "Learning",
    href: "/me/learning",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    name: "My Skills",
    href: "/me/competencies",
    icon: <BadgeCheck className="h-5 w-5" />,
  },
  {
    name: "Onboarding",
    href: "/me/onboarding",
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    name: "Help & Support",
    href: "/me/cases",
    icon: <HelpCircle className="h-5 w-5" />,
  },
  {
    name: "Organisation Chart",
    href: "/me/org-chart",
    icon: <Network className="h-5 w-5" />,
  },
];

// Manager items
const managerItems: NavItem[] = [
  {
    name: "My Team",
    href: "/manager/team",
    icon: <Users className="h-5 w-5" />,
    permission: "manager:team:read",
  },
  {
    name: "Approvals",
    href: "/manager/approvals",
    icon: <ClipboardCheck className="h-5 w-5" />,
    permission: "manager:approvals:read",
    badge: (
      <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-error-100 px-1.5 text-xs font-medium text-error-700 dark:bg-error-900/30 dark:text-error-400">
        5
      </span>
    ),
  },
  {
    name: "Schedules",
    href: "/manager/schedules",
    icon: <CalendarDays className="h-5 w-5" />,
    permission: "manager:schedules:read",
  },
  {
    name: "Performance",
    href: "/manager/performance",
    icon: <BarChart3 className="h-5 w-5" />,
    permission: "manager:performance:read",
  },
];

export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useSession();
  const { logout, isLoggingOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { isManager } = usePermissions();
  const { tenant } = useTenant();
  const { tenants, hasMutipleTenants } = useUserTenants();
  const { switchTenant, isPending: isSwitchingTenant } = useSwitchTenant();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);

  // Refs for focus restoration on dropdown close
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const tenantMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const tenantMenuRef = useRef<HTMLDivElement>(null);

  // Close handlers that restore focus to the trigger button
  const closeUserMenu = useCallback(() => {
    setUserMenuOpen(false);
    // Restore focus to trigger on next frame after menu is removed from DOM
    requestAnimationFrame(() => userMenuTriggerRef.current?.focus());
  }, []);

  const closeTenantMenu = useCallback(() => {
    setTenantMenuOpen(false);
    requestAnimationFrame(() => tenantMenuTriggerRef.current?.focus());
  }, []);

  // Keyboard support for dropdown menus: Escape closes and restores focus
  useEffect(() => {
    if (!userMenuOpen && !tenantMenuOpen) return;
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (userMenuOpen) closeUserMenu();
        if (tenantMenuOpen) closeTenantMenu();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [userMenuOpen, tenantMenuOpen, closeUserMenu, closeTenantMenu]);

  // Auto-focus first menu item when dropdown opens
  useEffect(() => {
    if (userMenuOpen && userMenuRef.current) {
      const firstItem = userMenuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [userMenuOpen]);

  useEffect(() => {
    if (tenantMenuOpen && tenantMenuRef.current) {
      const firstItem = tenantMenuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [tenantMenuOpen]);

  // Arrow key navigation within dropdown menus
  const handleMenuKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const menu = e.currentTarget;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[next].focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prev].focus();
        break;
      }
      case "Home": {
        e.preventDefault();
        items[0].focus();
        break;
      }
      case "End": {
        e.preventDefault();
        items[items.length - 1].focus();
        break;
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-lg transition-transform duration-200 dark:bg-gray-800 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6 dark:border-gray-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
            <Users className="h-6 w-6 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">Staffora</span>
          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-1 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-700"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {/* Main nav */}
          <NavSection items={mainNavItems} />

          {/* Self-service */}
          <NavGroup title="Self Service" items={selfServiceItems} />

          {/* Manager (conditional) */}
          {isManager && <NavGroup title="Manager" items={managerItems} />}

          {/* Admin link */}
          <PermissionGate permissions={["admin:dashboard:read", "hr:*", "security:*"]}>
            <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
              <NavLink
                to="/admin/dashboard"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  )
                }
              >
                <Settings className="h-5 w-5" />
                Admin Console
              </NavLink>
            </div>
          </PermissionGate>
        </nav>
      </aside>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800 lg:px-6">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-700"
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Breadcrumb navigation */}
          <div className="hidden lg:block">
            <Breadcrumbs />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Global search - desktop */}
            <div className="hidden md:block">
              <div className="relative w-64 lg:w-80">
                <GlobalEmployeeSearch placeholder="Search employees..." />
              </div>
            </div>

            {/* Global search - mobile toggle */}
            <button
              type="button"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 md:hidden"
              aria-label="Search"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Tenant switcher */}
            {hasMutipleTenants && (
              <div className="relative">
                <button
                  ref={tenantMenuTriggerRef}
                  type="button"
                  onClick={() => setTenantMenuOpen(!tenantMenuOpen)}
                  aria-expanded={tenantMenuOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {tenant?.name || "Select Tenant"}
                  <ChevronDown className="h-4 w-4" />
                </button>

                {tenantMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={closeTenantMenu}
                    />
                    <div
                      ref={tenantMenuRef}
                      role="menu"
                      aria-label="Select tenant"
                      onKeyDown={handleMenuKeyDown}
                      className="absolute right-0 z-20 mt-2 w-56 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
                    >
                      {tenants.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => {
                            switchTenant(t.id);
                            closeTenantMenu();
                          }}
                          disabled={isSwitchingTenant}
                          className={cn(
                            "flex w-full items-center gap-2 px-4 py-2 text-left text-sm",
                            t.id === tenant?.id
                              ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                          )}
                        >
                          {t.name}
                          {t.id === tenant?.id && (
                            <Check className="ml-auto h-4 w-4" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} mode`}
            >
              {resolvedTheme === "light" ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </button>

            {/* Notifications */}
            <button
              type="button"
              className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-error-600 text-[10px] font-bold text-white">
                3
              </span>
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-medium text-white">
                  {user ? getInitials(user.name || user.email) : "?"}
                </div>
                <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-300 md:block">
                  {user?.name || user?.email}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-2 w-56 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
                  >
                    <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {user?.name || user?.email}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {user?.email}
                      </p>
                    </div>
                    <Link
                      to="/me/profile"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      My Profile
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        logout();
                        setUserMenuOpen(false);
                      }}
                      disabled={isLoggingOut}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-error-600 hover:bg-gray-100 dark:text-error-400 dark:hover:bg-gray-700"
                    >
                      {isLoggingOut ? (
                        <Spinner size="sm" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Mobile search bar (shown when search is toggled on mobile) */}
        {searchOpen && (
          <div className="border-b border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 md:hidden">
            <GlobalEmployeeSearch placeholder="Search employees..." />
          </div>
        )}

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

// Helper components
function NavSection({ items }: { items: NavItem[] }) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <PermissionGate key={item.href} permission={item.permission}>
          <NavLink
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              )
            }
          >
            {item.icon}
            {item.name}
            {item.badge}
          </NavLink>
        </PermissionGate>
      ))}
    </div>
  );
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <NavSection items={items} />
    </div>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  if (pathSegments.length === 0) return null;

  const breadcrumbs = pathSegments.map((segment, index) => {
    const href = "/" + pathSegments.slice(0, index + 1).join("/");
    const label = segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return { href, label };
  });

  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      <Link to="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
        <Home className="h-4 w-4" />
      </Link>
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-gray-400" />
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-gray-900 dark:text-white">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.href}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
