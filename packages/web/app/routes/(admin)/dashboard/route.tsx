/**
 * Admin Dashboard Page
 *
 * Features:
 * - System stats (employees, departments, pending workflows)
 * - Quick actions for common admin tasks
 * - Recent activity log
 * - System health indicators
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../../lib/api-client";
import { queryKeys } from "../../../lib/query-client";
import {
  Card,
  CardHeader,
  CardBody,
  StatCard,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { formatRelativeTime, formatCompactNumber } from "../../../lib/utils";
import type { Route } from "./+types/route";

// Types
interface AdminStats {
  totalEmployees: number;
  activeEmployees: number;
  departments: number;
  openPositions: number;
  pendingWorkflows: number;
  pendingApprovals: number;
}

interface SystemHealth {
  status: "healthy" | "degraded" | "down";
  services: {
    name: string;
    status: "healthy" | "degraded" | "down";
    latency?: number;
  }[];
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  actor: string;
  timestamp: string;
  details?: string;
}

// API functions
async function fetchAdminStats(): Promise<AdminStats> {
  return api.get<AdminStats>("/dashboard/admin/stats");
}

async function fetchSystemHealth(): Promise<SystemHealth> {
  return api.get<SystemHealth>("/system/health");
}

async function fetchRecentAuditLog(): Promise<AuditLogEntry[]> {
  return api.get<AuditLogEntry[]>("/security/audit-log?limit=10");
}

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Admin Dashboard | Staffora" },
    { name: "description", content: "Staffora Admin Dashboard" },
  ];
}

export default function AdminDashboardPage() {
  // Fetch admin data
  const {
    data: stats,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: queryKeys.dashboard.stats("admin"),
    queryFn: fetchAdminStats,
  });

  const {
    data: systemHealth,
    isLoading: healthLoading,
  } = useQuery({
    queryKey: ["system", "health"],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const {
    data: auditLog,
    isLoading: auditLoading,
  } = useQuery({
    queryKey: queryKeys.security.auditLog({ limit: 10 }),
    queryFn: fetchRecentAuditLog,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Overview of your organization&apos;s HR system
          </p>
        </div>
        <div className="flex items-center gap-2">
          {systemHealth && (
            <StatusIndicator status={systemHealth.status} />
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Employees"
          value={statsLoading ? "-" : formatCompactNumber(stats?.totalEmployees || 0)}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
        />
        <StatCard
          title="Active"
          value={statsLoading ? "-" : formatCompactNumber(stats?.activeEmployees || 0)}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          title="Departments"
          value={statsLoading ? "-" : stats?.departments || 0}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          }
        />
        <StatCard
          title="Open Positions"
          value={statsLoading ? "-" : stats?.openPositions || 0}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatCard
          title="Pending Workflows"
          value={statsLoading ? "-" : stats?.pendingWorkflows || 0}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          }
        />
        <StatCard
          title="Pending Approvals"
          value={statsLoading ? "-" : stats?.pendingApprovals || 0}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          }
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick actions */}
        <Card variant="default">
          <CardHeader title="Quick Actions" bordered />
          <CardBody padding="md">
            <div className="space-y-2">
              <Link to="/admin/hr/employees?action=new" className="block">
                <Button variant="outline" fullWidth className="justify-start">
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                  Add New Employee
                </Button>
              </Link>
              <Link to="/admin/hr/departments?action=new" className="block">
                <Button variant="outline" fullWidth className="justify-start">
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Create Department
                </Button>
              </Link>
              <Link to="/admin/security/users?action=invite" className="block">
                <Button variant="outline" fullWidth className="justify-start">
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  Invite User
                </Button>
              </Link>
              <Link to="/admin/reports" className="block">
                <Button variant="outline" fullWidth className="justify-start">
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Run Report
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>

        {/* System health */}
        <Card variant="default">
          <CardHeader
            title="System Health"
            action={
              systemHealth && <StatusIndicator status={systemHealth.status} showLabel />
            }
            bordered
          />
          <CardBody padding="none">
            {healthLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : !systemHealth ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Unable to fetch system health
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {systemHealth.services.map((service) => (
                  <li
                    key={service.name}
                    className="flex items-center justify-between px-6 py-3"
                  >
                    <span className="text-sm text-gray-900 dark:text-white">
                      {service.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {service.latency && (
                        <span className="text-xs text-gray-500">
                          {service.latency}ms
                        </span>
                      )}
                      <StatusDot status={service.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Recent audit log */}
        <Card variant="default">
          <CardHeader
            title="Recent Activity"
            action={
              <Link to="/admin/security/audit-log">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            }
            bordered
          />
          <CardBody padding="none">
            {auditLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : !auditLog || auditLog.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No recent activity
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {auditLog.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="px-6 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                        <AuditIcon action={entry.action} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-white">
                          <span className="font-medium">{entry.actor}</span>{" "}
                          {entry.action} {entry.resource}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatRelativeTime(entry.timestamp)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// Helper components
function StatusIndicator({
  status,
  showLabel = false,
}: {
  status: "healthy" | "degraded" | "down";
  showLabel?: boolean;
}) {
  const colors = {
    healthy: "bg-success-500",
    degraded: "bg-warning-500",
    down: "bg-error-500",
  };

  const labels = {
    healthy: "All Systems Operational",
    degraded: "Degraded Performance",
    down: "System Outage",
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${colors[status]}`} />
      {showLabel && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {labels[status]}
        </span>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: "healthy" | "degraded" | "down" }) {
  const colors = {
    healthy: "bg-success-500",
    degraded: "bg-warning-500",
    down: "bg-error-500",
  };

  return <span className={`h-2 w-2 rounded-full ${colors[status]}`} />;
}

function AuditIcon({ action }: { action: string }) {
  const actionLower = action.toLowerCase();

  if (actionLower.includes("create") || actionLower.includes("add")) {
    return (
      <svg className="h-4 w-4 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    );
  }

  if (actionLower.includes("update") || actionLower.includes("edit")) {
    return (
      <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    );
  }

  if (actionLower.includes("delete") || actionLower.includes("remove")) {
    return (
      <svg className="h-4 w-4 text-error-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
