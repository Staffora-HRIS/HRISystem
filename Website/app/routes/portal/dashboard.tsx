import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Ticket,
  MessageSquareReply,
  Newspaper,
  FileCheck2,
  Plus,
  FolderOpen,
  CreditCard,
  ArrowRight,
  AlertTriangle,
  Users,
  TrendingUp,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { usePortalAuth } from "~/hooks/use-portal-auth";
import { usePortalPermissions } from "~/hooks/use-portal-permissions";

export function meta() {
  return [{ title: "Dashboard - Staffora Client Portal" }];
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DashboardStats {
  openTickets: number;
  awaitingReply: number;
  unreadNews: number;
  pendingDocuments: number;
}

interface RecentTicket {
  id: string;
  subject: string;
  status: "open" | "in_progress" | "waiting_on_client" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  lastReplyAt: string;
}

interface NewsArticle {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  category: string;
}

interface AdminStats {
  totalOpen: number;
  unassigned: number;
  slaBreached: number;
  mrr: number;
  activeLicenses: number;
  totalUsers: number;
  newUsersThisMonth: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentTickets: RecentTicket[];
  latestNews: NewsArticle[];
  adminStats?: AdminStats;
}

/* -------------------------------------------------------------------------- */
/*  Demo data for rendering while API is not connected                         */
/* -------------------------------------------------------------------------- */

const DEMO_DATA: DashboardData = {
  stats: {
    openTickets: 3,
    awaitingReply: 1,
    unreadNews: 2,
    pendingDocuments: 1,
  },
  recentTickets: [
    {
      id: "TKT-001",
      subject: "Unable to export payroll report",
      status: "in_progress",
      priority: "high",
      createdAt: "2026-03-15T10:30:00Z",
      lastReplyAt: "2026-03-15T14:20:00Z",
    },
    {
      id: "TKT-002",
      subject: "Question about employee onboarding workflow",
      status: "waiting_on_client",
      priority: "medium",
      createdAt: "2026-03-14T09:00:00Z",
      lastReplyAt: "2026-03-15T11:45:00Z",
    },
    {
      id: "TKT-003",
      subject: "Request: additional admin user seat",
      status: "open",
      priority: "low",
      createdAt: "2026-03-13T16:15:00Z",
      lastReplyAt: "2026-03-13T16:15:00Z",
    },
    {
      id: "TKT-004",
      subject: "SSO integration not working with Azure AD",
      status: "resolved",
      priority: "urgent",
      createdAt: "2026-03-10T08:00:00Z",
      lastReplyAt: "2026-03-12T17:30:00Z",
    },
    {
      id: "TKT-005",
      subject: "Custom report builder training request",
      status: "closed",
      priority: "low",
      createdAt: "2026-03-08T14:00:00Z",
      lastReplyAt: "2026-03-09T10:00:00Z",
    },
  ],
  latestNews: [
    {
      slug: "march-2026-product-update",
      title: "March 2026 Product Update",
      excerpt:
        "New analytics dashboard, improved performance review workflows, and enhanced document management capabilities.",
      publishedAt: "2026-03-12T09:00:00Z",
      category: "Product Update",
    },
    {
      slug: "upcoming-maintenance-window",
      title: "Scheduled Maintenance: 22 March",
      excerpt:
        "Brief maintenance window planned for Saturday 22 March between 02:00 and 04:00 GMT for database optimisations.",
      publishedAt: "2026-03-10T12:00:00Z",
      category: "Maintenance",
    },
    {
      slug: "uk-employment-law-changes-april-2026",
      title: "UK Employment Law Changes - April 2026",
      excerpt:
        "Key statutory changes taking effect in April 2026 including updated SSP rates and pension auto-enrolment thresholds.",
      publishedAt: "2026-03-05T10:00:00Z",
      category: "Compliance",
    },
  ],
  adminStats: {
    totalOpen: 12,
    unassigned: 4,
    slaBreached: 1,
    mrr: 4250,
    activeLicenses: 85,
    totalUsers: 42,
    newUsersThisMonth: 3,
  },
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const { user } = usePortalAuth();
  const permissions = usePortalPermissions();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch dashboard data
  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        // In production this would call portalApi.dashboard.get()
        // For now, simulate a brief loading state with demo data
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (!cancelled) {
          setData(DEMO_DATA);
        }
      } catch {
        // Fallback to demo data if API fails
        if (!cancelled) {
          setData(DEMO_DATA);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading || !data) {
    return <DashboardSkeleton isAdmin={permissions.isAdmin} />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Here&apos;s what&apos;s happening with your account.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Ticket}
          label="Open Tickets"
          value={data.stats.openTickets}
          iconColor="text-brand-600"
          iconBg="bg-brand-50 dark:bg-brand-900/30"
          href="/portal/tickets"
        />
        <StatCard
          icon={MessageSquareReply}
          label="Awaiting Your Reply"
          value={data.stats.awaitingReply}
          iconColor="text-amber-600"
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          href="/portal/tickets?status=waiting_on_client"
        />
        <StatCard
          icon={Newspaper}
          label="Unread News"
          value={data.stats.unreadNews}
          iconColor="text-accent-600"
          iconBg="bg-accent-50 dark:bg-accent-900/30"
          href="/portal/news"
        />
        <StatCard
          icon={FileCheck2}
          label="Pending Acknowledgement"
          value={data.stats.pendingDocuments}
          iconColor="text-purple-600"
          iconBg="bg-purple-50 dark:bg-purple-900/30"
          href="/portal/documents"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <QuickActionButton
          icon={Plus}
          label="New Ticket"
          href="/portal/tickets/new"
          variant="primary"
        />
        <QuickActionButton
          icon={FolderOpen}
          label="View Documents"
          href="/portal/documents"
        />
        {permissions.canViewBilling && (
          <QuickActionButton
            icon={CreditCard}
            label="View Billing"
            href="/portal/billing"
          />
        )}
      </div>

      {/* Admin stats */}
      {permissions.isAdmin && data.adminStats && (
        <AdminStatsSection stats={data.adminStats} />
      )}

      {/* Two-column layout: tickets + news */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent tickets */}
        <div className="xl:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Recent Tickets
              </h2>
              <Link
                to="/portal/tickets"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {data.recentTickets.length === 0 ? (
              <div className="p-8 text-center">
                <Ticket className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">
                  No tickets yet.{" "}
                  <Link
                    to="/portal/tickets/new"
                    className="text-brand-600 hover:text-brand-700"
                  >
                    Create your first ticket
                  </Link>
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.recentTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to={`/portal/tickets/${ticket.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">
                          {ticket.id}
                        </span>
                        <PriorityBadge priority={ticket.priority} />
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-white">
                        {ticket.subject}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <TicketStatusBadge status={ticket.status} />
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(ticket.lastReplyAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Latest news */}
        <div className="xl:col-span-1">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Latest News
              </h2>
              <Link
                to="/portal/news"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {data.latestNews.length === 0 ? (
              <div className="p-8 text-center">
                <Newspaper className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">
                  No news articles yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.latestNews.map((article) => (
                  <Link
                    key={article.slug}
                    to={`/portal/news/${article.slug}`}
                    className="block px-5 py-4 transition hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    <div className="flex items-center gap-2">
                      <NewsCategoryBadge category={article.category} />
                      <span className="text-xs text-gray-400">
                        {formatDate(article.publishedAt)}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                      {article.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {article.excerpt}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat card                                                                  */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  iconColor: string;
  iconBg: string;
  href: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
  iconBg,
  href,
}: StatCardProps) {
  return (
    <Link
      to={href}
      className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-brand-400/5 to-transparent" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl",
            iconBg,
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        View details
        <ExternalLink className="h-3 w-3" />
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quick action button                                                        */
/* -------------------------------------------------------------------------- */

interface QuickActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

function QuickActionButton({
  icon: Icon,
  label,
  href,
  variant = "secondary",
}: QuickActionButtonProps) {
  return (
    <Link
      to={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
        variant === "primary"
          ? "bg-gradient-brand text-white shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 hover:-translate-y-0.5"
          : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Admin stats section                                                        */
/* -------------------------------------------------------------------------- */

function AdminStatsSection({ stats }: { stats: AdminStats }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5 dark:border-brand-800 dark:bg-brand-900/20">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        <TrendingUp className="h-5 w-5 text-brand-600" />
        Administration Overview
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <AdminStatItem label="Total Open" value={stats.totalOpen} />
        <AdminStatItem label="Unassigned" value={stats.unassigned} />
        <AdminStatItem
          label="SLA Breached"
          value={stats.slaBreached}
          variant={stats.slaBreached > 0 ? "danger" : "default"}
        />
        <AdminStatItem
          label="MRR"
          value={`£${stats.mrr.toLocaleString()}`}
        />
        <AdminStatItem label="Active Licences" value={stats.activeLicenses} />
        <AdminStatItem label="Total Users" value={stats.totalUsers} />
        <AdminStatItem
          label="New This Month"
          value={`+${stats.newUsersThisMonth}`}
        />
      </div>
    </div>
  );
}

interface AdminStatItemProps {
  label: string;
  value: string | number;
  variant?: "default" | "danger";
}

function AdminStatItem({
  label,
  value,
  variant = "default",
}: AdminStatItemProps) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-bold",
          variant === "danger"
            ? "text-red-600"
            : "text-gray-900 dark:text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badges                                                                     */
/* -------------------------------------------------------------------------- */

function TicketStatusBadge({
  status,
}: {
  status: RecentTicket["status"];
}) {
  const config: Record<
    RecentTicket["status"],
    { label: string; className: string }
  > = {
    open: {
      label: "Open",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    in_progress: {
      label: "In Progress",
      className: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
    },
    waiting_on_client: {
      label: "Awaiting Reply",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    },
    resolved: {
      label: "Resolved",
      className: "bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300",
    },
    closed: {
      label: "Closed",
      className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    },
  };

  const { label, className } = config[status];

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: RecentTicket["priority"];
}) {
  if (priority === "low") return null;

  const config: Record<string, { label: string; className: string }> = {
    medium: {
      label: "Medium",
      className: "text-amber-600",
    },
    high: {
      label: "High",
      className: "text-orange-600",
    },
    urgent: {
      label: "Urgent",
      className: "text-red-600",
    },
  };

  const item = config[priority];
  if (!item) return null;

  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-medium", item.className)}>
      {priority === "urgent" && <AlertTriangle className="h-3 w-3" />}
      {item.label}
    </span>
  );
}

function NewsCategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    "Product Update": "bg-brand-100 text-brand-700",
    Maintenance: "bg-amber-100 text-amber-700",
    Compliance: "bg-purple-100 text-purple-700",
    Announcement: "bg-accent-100 text-accent-700",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        colorMap[category] || "bg-gray-100 text-gray-600",
      )}
    >
      {category}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

function DashboardSkeleton({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-gray-100" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
          />
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-32 animate-pulse rounded-full bg-gray-200"
          />
        ))}
      </div>

      {/* Admin section */}
      {isAdmin && (
        <div className="h-32 animate-pulse rounded-2xl bg-brand-50" />
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 xl:col-span-2" />
        <div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-gray-100" />
      </div>
    </div>
  );
}
