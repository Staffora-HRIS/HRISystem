/**
 * Admin Layout Component
 *
 * Layout for admin console pages with:
 * - Sidebar navigation for admin sections
 * - Permission-based menu items
 * - Breadcrumbs
 * - Responsive design
 */

import { useState, useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  BarChart3,
  Users,
  Briefcase,
  Building2,
  Network,
  Heart,
  UserPlus,
  TrendingUp,
  ArrowUpRight,
  Zap,
  LayoutTemplate,
  User,
  Shield,
  Key,
  ClipboardList,
  BarChart2,
  FileText,
  BookOpen,
  ClipboardCheck,
  Settings,
  Puzzle,
  ArrowLeft,
  X,
  Menu,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Bell,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { useAuth, useSession } from "../../lib/auth";
import { PermissionGate } from "../../hooks/use-permissions";
import { getInitials } from "../../lib/utils";
import { Spinner } from "../ui/spinner";

// Navigation item types
interface NavItem {
  name: string;
  href: string;
  icon: ReactNode;
  permission?: string;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

// Admin navigation groups
const adminNavGroups: NavGroup[] = [
  {
    name: "Overview",
    items: [
      {
        name: "Dashboard",
        href: "/admin/dashboard",
        icon: <BarChart3 className="h-5 w-5" />,
        permission: "dashboards:read",
      },
    ],
  },
  {
    name: "HR Administration",
    items: [
      {
        name: "Employees",
        href: "/admin/hr/employees",
        icon: <Users className="h-5 w-5" />,
        permission: "employees:read",
      },
      {
        name: "Positions",
        href: "/admin/hr/positions",
        icon: <Briefcase className="h-5 w-5" />,
        permission: "positions:read",
      },
      {
        name: "Departments",
        href: "/admin/hr/departments",
        icon: <Building2 className="h-5 w-5" />,
        permission: "org:read",
      },
      {
        name: "Org Chart",
        href: "/admin/hr/org-chart",
        icon: <Network className="h-5 w-5" />,
        permission: "org:read",
      },
    ],
  },
  {
    name: "Benefits",
    items: [
      {
        name: "Plans",
        href: "/admin/benefits",
        icon: <Heart className="h-5 w-5" />,
        permission: "benefits:read",
      },
    ],
  },
  {
    name: "Talent",
    items: [
      {
        name: "Recruitment",
        href: "/admin/talent/recruitment",
        icon: <UserPlus className="h-5 w-5" />,
        permission: "recruitment:read",
      },
      {
        name: "Performance",
        href: "/admin/talent/performance",
        icon: <TrendingUp className="h-5 w-5" />,
        permission: "performance:read",
      },
      {
        name: "Succession",
        href: "/admin/talent/succession",
        icon: <ArrowUpRight className="h-5 w-5" />,
        permission: "succession:read",
      },
    ],
  },
  {
    name: "Workflows",
    items: [
      {
        name: "Workflow Builder",
        href: "/admin/workflows/builder",
        icon: <Zap className="h-5 w-5" />,
        permission: "workflows:write",
      },
      {
        name: "Templates",
        href: "/admin/workflows/templates",
        icon: <LayoutTemplate className="h-5 w-5" />,
        permission: "workflows:read",
      },
    ],
  },
  {
    name: "Security",
    items: [
      {
        name: "Users",
        href: "/admin/security/users",
        icon: <User className="h-5 w-5" />,
        permission: "users:read",
      },
      {
        name: "Roles",
        href: "/admin/security/roles",
        icon: <Shield className="h-5 w-5" />,
        permission: "roles:read",
      },
      {
        name: "Permissions",
        href: "/admin/security/permissions",
        icon: <Key className="h-5 w-5" />,
        permission: "roles:read",
      },
      {
        name: "Audit Log",
        href: "/admin/security/audit-log",
        icon: <ClipboardList className="h-5 w-5" />,
        permission: "audit:read",
      },
    ],
  },
  {
    name: "Analytics & Reports",
    items: [
      {
        name: "Analytics",
        href: "/admin/analytics",
        icon: <BarChart2 className="h-5 w-5" />,
        permission: "reports:read",
      },
      {
        name: "Reports",
        href: "/admin/reports",
        icon: <FileText className="h-5 w-5" />,
        permission: "reports:read",
      },
    ],
  },
  {
    name: "Learning",
    items: [
      {
        name: "Courses",
        href: "/admin/lms/courses",
        icon: <BookOpen className="h-5 w-5" />,
        permission: "courses:read",
      },
      {
        name: "Assignments",
        href: "/admin/lms/assignments",
        icon: <ClipboardCheck className="h-5 w-5" />,
        permission: "learning:assign",
      },
    ],
  },
  {
    name: "Settings",
    items: [
      {
        name: "Tenant Settings",
        href: "/admin/settings/tenant",
        icon: <Settings className="h-5 w-5" />,
        permission: "tenant:read",
      },
      {
        name: "Integrations",
        href: "/admin/settings/integrations",
        icon: <Puzzle className="h-5 w-5" />,
        permission: "settings:read",
      },
    ],
  },
];

export interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useSession();
  const { logout, isLoggingOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Close user menu on Escape key
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [userMenuOpen]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
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
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-gray-900 text-white shadow-lg transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-gray-800 px-4">
          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold">Admin</span>
              <span className="ml-1 text-xs text-gray-400">Console</span>
            </div>
          </Link>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Back to app link */}
        <div className="border-b border-gray-800 p-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {adminNavGroups.map((group) => (
            <div key={group.name} className="mb-4">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {group.name}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <PermissionGate key={item.href} permission={item.permission}>
                    <NavLink
                      to={item.href}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary-600 text-white"
                            : "text-gray-300 hover:bg-gray-800 hover:text-white"
                        )
                      }
                    >
                      {item.icon}
                      {item.name}
                    </NavLink>
                  </PermissionGate>
                ))}
              </div>
            </div>
          ))}
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

          {/* Breadcrumb */}
          <div className="hidden lg:block">
            <AdminBreadcrumbs />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
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
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-error-500 text-[10px] font-bold text-white">
                3
              </span>
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-medium text-white">
                  {user ? getInitials(user.name || user.email) : "?"}
                </div>
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 z-20 mt-2 w-56 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
                    role="menu"
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
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      role="menuitem"
                    >
                      My Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setUserMenuOpen(false);
                      }}
                      disabled={isLoggingOut}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-error-600 hover:bg-gray-100 dark:text-error-400 dark:hover:bg-gray-700"
                      role="menuitem"
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

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function AdminBreadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  // Skip the first segment if it's "admin"
  const breadcrumbSegments = pathSegments[0] === "admin" ? pathSegments.slice(1) : pathSegments;

  if (breadcrumbSegments.length === 0) return null;

  const breadcrumbs = breadcrumbSegments.map((segment, index) => {
    const href = "/admin/" + breadcrumbSegments.slice(0, index + 1).join("/");
    const label = segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return { href, label };
  });

  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      <Link
        to="/admin/dashboard"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        Admin
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
