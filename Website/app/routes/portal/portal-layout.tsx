import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Ticket,
  FolderOpen,
  Newspaper,
  CreditCard,
  HeadphonesIcon,
  Users,
  FileUp,
  PenSquare,
  Receipt,
  Shield,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  KeyRound,
  Moon,
  Sun,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  PortalAuthProvider,
  usePortalAuth,
} from "~/hooks/use-portal-auth";
import { usePortalPermissions } from "~/hooks/use-portal-permissions";

export function meta() {
  return [{ title: "Client Portal - Staffora" }];
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  permission?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  permission?: string;
}

/* -------------------------------------------------------------------------- */
/*  Wrapper with auth provider                                                 */
/* -------------------------------------------------------------------------- */

export default function PortalLayoutWrapper() {
  return (
    <PortalAuthProvider>
      <PortalLayoutShell />
    </PortalAuthProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main shell                                                                 */
/* -------------------------------------------------------------------------- */

function PortalLayoutShell() {
  const { user, isLoading, isAuthenticated } = usePortalAuth();
  const permissions = usePortalPermissions();

  if (isLoading) {
    return <PortalLoadingSkeleton />;
  }

  if (!isAuthenticated) {
    // The auth provider will redirect, but show loading in the meantime
    return <PortalLoadingSkeleton />;
  }

  return (
    <PortalLayout user={user!} permissions={permissions}>
      <Outlet />
    </PortalLayout>
  );
}

/* -------------------------------------------------------------------------- */
/*  Layout component                                                           */
/* -------------------------------------------------------------------------- */

interface PortalLayoutProps {
  user: NonNullable<ReturnType<typeof usePortalAuth>["user"]>;
  permissions: ReturnType<typeof usePortalPermissions>;
  children: ReactNode;
}

function PortalLayout({ user, permissions, children }: PortalLayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Toggle dark mode class on html element
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* Navigation sections */
  const navSections: NavSection[] = [
    {
      items: [
        {
          label: "Dashboard",
          href: "/portal/dashboard",
          icon: LayoutDashboard,
        },
        {
          label: "Tickets",
          href: "/portal/tickets",
          icon: Ticket,
          badge: 3,
        },
        {
          label: "Documents",
          href: "/portal/documents",
          icon: FolderOpen,
        },
        {
          label: "News",
          href: "/portal/news",
          icon: Newspaper,
          badge: 2,
        },
        ...(permissions.canViewBilling
          ? [
              {
                label: "Billing",
                href: "/portal/billing",
                icon: CreditCard,
              },
            ]
          : []),
      ],
    },
    ...(permissions.isAdmin
      ? [
          {
            title: "Administration",
            permission: "isAdmin",
            items: [
              {
                label: "Ticket Management",
                href: "/portal/admin/tickets",
                icon: HeadphonesIcon,
              },
              {
                label: "User Management",
                href: "/portal/admin/users",
                icon: Users,
              },
              {
                label: "Document Management",
                href: "/portal/admin/documents",
                icon: FileUp,
              },
              {
                label: "News Management",
                href: "/portal/admin/news",
                icon: PenSquare,
              },
              ...(permissions.isSuperAdmin
                ? [
                    {
                      label: "Billing Management",
                      href: "/portal/admin/billing",
                      icon: Receipt,
                    },
                  ]
                : []),
              ...(permissions.canViewAuditLog
                ? [
                    {
                      label: "Audit Log",
                      href: "/portal/admin/audit-log",
                      icon: Shield,
                    },
                  ]
                : []),
            ],
          } satisfies NavSection,
        ]
      : []),
  ];

  /* Breadcrumbs */
  const breadcrumbs = buildBreadcrumbs(location.pathname);

  /* User initials */
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  /* Role display */
  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    support_agent: "Support Agent",
    client: "Client",
  };

  const roleBadgeColors: Record<string, string> = {
    super_admin: "bg-purple-100 text-purple-700",
    admin: "bg-brand-100 text-brand-700",
    support_agent: "bg-amber-100 text-amber-700",
    client: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-800 lg:static lg:z-auto",
          sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64",
          sidebarOpen
            ? "w-64 translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Sidebar navigation"
      >
        {/* Sidebar header */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700">
          <Link
            to="/portal/dashboard"
            className={cn(
              "flex items-center gap-2.5 transition-opacity",
              sidebarCollapsed && "lg:justify-center",
            )}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-brand shadow-md shadow-brand-500/20">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                Staffora
              </span>
            )}
          </Link>

          {/* Close button (mobile only) */}
          <button
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden dark:hover:bg-gray-700"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Portal navigation">
          {navSections.map((section, sectionIdx) => (
            <div
              key={section.title || sectionIdx}
              className={cn(sectionIdx > 0 && "mt-6")}
            >
              {section.title && !sidebarCollapsed && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {section.title}
                </h3>
              )}
              {section.title && sidebarCollapsed && (
                <div className="mx-auto mb-2 h-px w-8 bg-gray-200 dark:bg-gray-700" />
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.href !== "/portal/dashboard" &&
                      location.pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                          sidebarCollapsed && "lg:justify-center lg:px-2",
                          isActive
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white",
                        )}
                        title={sidebarCollapsed ? item.label : undefined}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon
                          className={cn(
                            "h-5 w-5 flex-shrink-0",
                            isActive
                              ? "text-brand-600 dark:text-brand-400"
                              : "text-gray-400 dark:text-gray-500",
                          )}
                        />
                        {!sidebarCollapsed && (
                          <>
                            <span className="flex-1">{item.label}</span>
                            {item.badge !== undefined && item.badge > 0 && (
                              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                        {sidebarCollapsed &&
                          item.badge !== undefined &&
                          item.badge > 0 && (
                            <span className="absolute right-1 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                              {item.badge}
                            </span>
                          )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar collapse toggle (desktop only) */}
        <div className="hidden border-t border-gray-200 p-3 dark:border-gray-700 lg:block">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex w-full items-center justify-center rounded-xl py-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition dark:hover:bg-gray-700"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <ChevronRight
              className={cn(
                "h-5 w-5 transition-transform",
                !sidebarCollapsed && "rotate-180",
              )}
            />
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800 lg:px-6">
          {/* Left: hamburger + search */}
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden dark:hover:bg-gray-700"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Search bar */}
            <div className="hidden items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 sm:flex dark:border-gray-600 dark:bg-gray-700">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-48 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200 lg:w-64"
                aria-label="Search"
              />
              <kbd className="hidden rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 lg:inline dark:bg-gray-600 dark:text-gray-300">
                /
              </kbd>
            </div>
          </div>

          {/* Right: notifications + user */}
          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition dark:hover:bg-gray-700 dark:text-gray-400"
              aria-label={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {darkMode ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            {/* Notifications */}
            <button
              className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition dark:hover:bg-gray-700 dark:text-gray-400"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                2
              </span>
            </button>

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-100 transition dark:hover:bg-gray-700"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                aria-label="User menu"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
                    {initials}
                  </div>
                )}
                <div className="hidden text-left md:block">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {user.firstName} {user.lastName}
                  </p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-gray-400 md:block" />
              </button>

              {/* Dropdown */}
              {userMenuOpen && (
                <UserDropdownMenu
                  user={user}
                  initials={initials}
                  roleLabel={roleLabels[user.role] || user.role}
                  roleBadgeColor={
                    roleBadgeColors[user.role] || roleBadgeColors.client
                  }
                  darkMode={darkMode}
                  onToggleDarkMode={() => setDarkMode(!darkMode)}
                  onClose={() => setUserMenuOpen(false)}
                />
              )}
            </div>
          </div>
        </header>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 1 && (
          <div className="border-b border-gray-100 bg-white px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800 lg:px-6">
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-1.5 text-sm">
                {breadcrumbs.map((crumb, idx) => (
                  <li key={crumb.href} className="flex items-center gap-1.5">
                    {idx > 0 && (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                    )}
                    {idx === breadcrumbs.length - 1 ? (
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.href}
                        className="text-gray-400 hover:text-gray-600 transition dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-100 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 lg:px-6">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              Powered by{" "}
              <a
                href="https://staffora.co.uk"
                className="font-medium text-brand-600 hover:text-brand-700 transition"
                target="_blank"
                rel="noopener noreferrer"
              >
                Staffora
              </a>
            </span>
            <span>v1.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  User dropdown menu                                                         */
/* -------------------------------------------------------------------------- */

interface UserDropdownMenuProps {
  user: NonNullable<ReturnType<typeof usePortalAuth>["user"]>;
  initials: string;
  roleLabel: string;
  roleBadgeColor: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onClose: () => void;
}

function UserDropdownMenu({
  user,
  initials,
  roleLabel,
  roleBadgeColor,
  darkMode,
  onToggleDarkMode,
  onClose,
}: UserDropdownMenuProps) {
  const { logout } = usePortalAuth();
  const navigate = useNavigate();

  return (
    <div
      className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-gray-200 bg-white py-2 shadow-xl animate-fade-in-down dark:border-gray-700 dark:bg-gray-800"
      role="menu"
    >
      {/* User info */}
      <div className="border-b border-gray-100 px-4 pb-3 pt-2 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {user.email}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
            roleBadgeColor,
          )}
        >
          {roleLabel}
        </span>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <DropdownItem
          icon={User}
          label="Profile"
          onClick={() => {
            onClose();
            navigate("/portal/profile");
          }}
        />
        <DropdownItem
          icon={KeyRound}
          label="Change Password"
          onClick={() => {
            onClose();
            navigate("/portal/change-password");
          }}
        />
        <DropdownItem
          icon={darkMode ? Sun : Moon}
          label={darkMode ? "Light Mode" : "Dark Mode"}
          onClick={() => {
            onToggleDarkMode();
          }}
        />
      </div>

      <div className="border-t border-gray-100 py-1 dark:border-gray-700">
        <DropdownItem
          icon={LogOut}
          label="Sign Out"
          variant="danger"
          onClick={async () => {
            onClose();
            await logout();
          }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dropdown item                                                              */
/* -------------------------------------------------------------------------- */

interface DropdownItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant?: "default" | "danger";
  onClick: () => void;
}

function DropdownItem({
  icon: Icon,
  label,
  variant = "default",
  onClick,
}: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-sm transition",
        variant === "danger"
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700",
      )}
      role="menuitem"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

function PortalLoadingSkeleton() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-16 items-center gap-2.5 border-b border-gray-200 px-4">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            >
              <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Main area skeleton */}
      <div className="flex flex-1 flex-col">
        <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="h-9 w-64 animate-pulse rounded-xl bg-gray-100" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl bg-gray-200"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Breadcrumb builder                                                         */
/* -------------------------------------------------------------------------- */

function buildBreadcrumbs(
  pathname: string,
): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  const labelMap: Record<string, string> = {
    portal: "Portal",
    dashboard: "Dashboard",
    tickets: "Tickets",
    documents: "Documents",
    news: "News",
    billing: "Billing",
    invoices: "Invoices",
    admin: "Admin",
    users: "Users",
    new: "New",
    invite: "Invite",
    upload: "Upload",
    "audit-log": "Audit Log",
  };

  let path = "";
  for (const segment of segments) {
    path += `/${segment}`;
    const label = labelMap[segment] || formatSegment(segment);
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

function formatSegment(segment: string): string {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
