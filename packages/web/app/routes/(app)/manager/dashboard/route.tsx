export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { Link } from "react-router";
import {
  Users,
  CheckCircle,
  Clock,
  Calendar,
  AlertCircle,
  ChevronRight,
  UserCheck,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardBody, Badge, Button, Spinner } from "~/components/ui";
import { StatCard } from "~/components/ui/card";
import { ApiError } from "~/lib/api-client";
import {
  useTeamOverview,
  useDirectReports,
  usePendingApprovals,
  useCurrentMonthTeamAbsence,
} from "~/hooks/use-manager";

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { text: string; variant: string };
}

export default function ManagerDashboardPage() {
  const { overview, isLoading: loadingOverview, error: overviewError } = useTeamOverview();
  const { team, isLoading: loadingTeam } = useDirectReports();
  const { approvals } = usePendingApprovals();
  const { entries: absenceEntries } = useCurrentMonthTeamAbsence();

  const isLoading = loadingOverview || loadingTeam;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (overviewError && !overview) {
    const message =
      overviewError instanceof ApiError
        ? overviewError.message
        : overviewError instanceof Error
          ? overviewError.message
          : "Unable to load manager dashboard.";

    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manager Dashboard</h1>
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800 dark:text-red-300">Error loading data</h4>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">{message}</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const activeCount = team.filter((m) => m.status === "active").length;
  const pendingCount = approvals.length;
  const leaveApprovals = approvals.filter((a) => a.type === "leave").length;
  const timesheetApprovals = approvals.filter((a) => a.type === "timesheet").length;
  const expenseApprovals = approvals.filter((a) => a.type === "expense").length;

  const quickActions: QuickAction[] = [
    {
      title: "My Team",
      description: "View and manage your direct reports",
      href: "/manager/team",
      icon: Users,
    },
    {
      title: "Pending Approvals",
      description: "Review leave requests, timesheets, and expenses",
      href: "/manager/approvals",
      icon: CheckCircle,
      badge: pendingCount > 0 ? { text: String(pendingCount), variant: "warning" } : undefined,
    },
    {
      title: "Schedules",
      description: "Manage team schedules and shifts",
      href: "/manager/schedules",
      icon: CalendarDays,
    },
    {
      title: "Performance",
      description: "Goals, reviews, and feedback",
      href: "/manager/performance",
      icon: BarChart3,
    },
    {
      title: "Organisation Chart",
      description: "View your team hierarchy",
      href: "/manager/org-chart",
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manager Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your team and handle approvals</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Team Size"
          value={String(overview?.totalDirectReports ?? team.length)}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Active Today"
          value={String(activeCount)}
          icon={<UserCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Approvals"
          value={String(overview?.pendingApprovals ?? pendingCount)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="On Leave"
          value={String(overview?.teamOnLeave ?? 0)}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Approval Breakdown */}
      {pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-amber-800 dark:text-amber-300">Action Required</h4>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                You have {pendingCount} pending {pendingCount === 1 ? "approval" : "approvals"} that
                {pendingCount === 1 ? " needs" : " need"} your attention.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {leaveApprovals > 0 && (
                  <Link to="/manager/approvals/leave">
                    <Badge variant="warning">
                      {leaveApprovals} leave {leaveApprovals === 1 ? "request" : "requests"}
                    </Badge>
                  </Link>
                )}
                {timesheetApprovals > 0 && (
                  <Link to="/manager/approvals/timesheets">
                    <Badge variant="info">
                      {timesheetApprovals} {timesheetApprovals === 1 ? "timesheet" : "timesheets"}
                    </Badge>
                  </Link>
                )}
                {expenseApprovals > 0 && (
                  <Link to="/manager/approvals/expenses">
                    <Badge variant="secondary">
                      {expenseApprovals} {expenseApprovals === 1 ? "expense" : "expenses"}
                    </Badge>
                  </Link>
                )}
              </div>
              <Link to="/manager/approvals" className="inline-block mt-3">
                <Button size="sm" variant="outline">
                  Review All
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <Link key={action.href} to={action.href}>
            <Card className="h-full hover:shadow-md transition-shadow">
              <CardBody className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                  <action.icon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-white">{action.title}</h3>
                    {action.badge && (
                      <Badge variant={action.badge.variant as any}>
                        {action.badge.text}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{action.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Team Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Team Members</h3>
            <Link to="/manager/team">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {team.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No direct reports found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {team.slice(0, 5).map((member) => (
                <div key={member.employeeId} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-sm font-medium text-primary-700 dark:text-primary-300">
                    {member.firstName.charAt(0)}
                    {member.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {member.displayName || `${member.firstName} ${member.lastName}`}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {member.jobTitle || "No position"}
                    </p>
                  </div>
                  <Badge
                    variant={
                      member.status === "active"
                        ? "success"
                        : member.status === "on_leave"
                          ? "warning"
                          : "secondary"
                    }
                    size="sm"
                  >
                    {member.status === "active"
                      ? "Active"
                      : member.status === "on_leave"
                        ? "On Leave"
                        : member.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Upcoming Leave */}
      {(overview?.upcomingLeave ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Upcoming Leave</h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {overview?.upcomingLeave ?? 0} upcoming
              </span>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {absenceEntries.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming leave this month</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {absenceEntries.slice(0, 5).map((entry, idx) => (
                  <div key={`${entry.employeeId}-${entry.date}-${idx}`} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                      <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{entry.employeeName}</span>{" "}
                        - {entry.leaveType}
                        {entry.isHalfDay && " (half day)"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(entry.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
