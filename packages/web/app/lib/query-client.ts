/**
 * React Query Configuration
 *
 * Features:
 * - Tenant-scoped query key factory
 * - Default query options
 * - Mutation helpers with invalidation
 */

import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "./api-client";

// Default stale times
const STALE_TIMES = {
  short: 30 * 1000, // 30 seconds
  medium: 5 * 60 * 1000, // 5 minutes
  long: 30 * 60 * 1000, // 30 minutes
} as const;

// Create query client with default options
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.medium,
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors)
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: "always",
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Query Key Factory
 *
 * Creates tenant-scoped query keys for proper cache isolation
 * between tenants in multi-tenant environment.
 */
export const queryKeys = {
  // Get current tenant ID from API client
  _tenantScope: () => api.getTenantId() ?? "default",

  // Auth & User
  auth: {
    all: () => ["auth"] as const,
    me: () => [...queryKeys.auth.all(), "me", queryKeys._tenantScope()] as const,
    session: () => [...queryKeys.auth.all(), "session", queryKeys._tenantScope()] as const,
    permissions: () =>
      [...queryKeys.auth.all(), "permissions", queryKeys._tenantScope()] as const,
    mfaStatus: () => [...queryKeys.auth.all(), "mfa-status", queryKeys._tenantScope()] as const,
  },

  // Current User (Employee Self-Service)
  me: {
    all: () => ["me", queryKeys._tenantScope()] as const,
    profile: () => [...queryKeys.me.all(), "profile"] as const,
    time: () => [...queryKeys.me.all(), "time"] as const,
    timeEntries: (filters?: Record<string, unknown>) =>
      [...queryKeys.me.time(), "entries", filters] as const,
    leave: () => [...queryKeys.me.all(), "leave"] as const,
    leaveRequests: (filters?: Record<string, unknown>) =>
      [...queryKeys.me.leave(), "requests", filters] as const,
    leaveBalances: () => [...queryKeys.me.leave(), "balances"] as const,
    benefits: () => [...queryKeys.me.all(), "benefits"] as const,
    documents: () => [...queryKeys.me.all(), "documents"] as const,
    learning: () => [...queryKeys.me.all(), "learning"] as const,
    cases: () => [...queryKeys.me.all(), "cases"] as const,
  },

  // Manager
  manager: {
    all: () => ["manager", queryKeys._tenantScope()] as const,
    isManager: () => [...queryKeys.manager.all(), "is-manager"] as const,
    overview: () => [...queryKeys.manager.all(), "overview"] as const,
    team: () => [...queryKeys.manager.all(), "team"] as const,
    directReports: () => [...queryKeys.manager.team(), "direct-reports"] as const,
    allSubordinates: (maxDepth?: number) =>
      [...queryKeys.manager.all(), "all-subordinates", maxDepth] as const,
    teamMember: (id: string) => [...queryKeys.manager.all(), "team-member", id] as const,
    isSubordinate: (id: string) => [...queryKeys.manager.all(), "is-subordinate", id] as const,
    approvals: () => [...queryKeys.manager.all(), "approvals"] as const,
    pendingApprovals: (type?: string) =>
      [...queryKeys.manager.approvals(), "pending", type] as const,
    teamAbsence: (startDate: string, endDate: string) =>
      [...queryKeys.manager.all(), "team-absence", startDate, endDate] as const,
    schedules: () => [...queryKeys.manager.all(), "schedules"] as const,
    performance: () => [...queryKeys.manager.all(), "performance"] as const,
  },

  // HR Administration
  employees: {
    all: () => ["employees", queryKeys._tenantScope()] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.employees.all(), "list", filters] as const,
    detail: (id: string) => [...queryKeys.employees.all(), "detail", id] as const,
    employment: (id: string) => [...queryKeys.employees.detail(id), "employment"] as const,
    compensation: (id: string) => [...queryKeys.employees.detail(id), "compensation"] as const,
    documents: (id: string) => [...queryKeys.employees.detail(id), "documents"] as const,
  },

  // Organization
  organization: {
    all: () => ["organization", queryKeys._tenantScope()] as const,
    departments: () => [...queryKeys.organization.all(), "departments"] as const,
    departmentList: (filters?: Record<string, unknown>) =>
      [...queryKeys.organization.departments(), "list", filters] as const,
    department: (id: string) => [...queryKeys.organization.departments(), id] as const,
    positions: () => [...queryKeys.organization.all(), "positions"] as const,
    positionList: (filters?: Record<string, unknown>) =>
      [...queryKeys.organization.positions(), "list", filters] as const,
    position: (id: string) => [...queryKeys.organization.positions(), id] as const,
    tree: () => [...queryKeys.organization.all(), "tree"] as const,
    locations: () => [...queryKeys.organization.all(), "locations"] as const,
  },

  // Time & Attendance
  time: {
    all: () => ["time", queryKeys._tenantScope()] as const,
    entries: (filters?: Record<string, unknown>) =>
      [...queryKeys.time.all(), "entries", filters] as const,
    entry: (id: string) => [...queryKeys.time.all(), "entry", id] as const,
    schedules: () => [...queryKeys.time.all(), "schedules"] as const,
    policies: () => [...queryKeys.time.all(), "policies"] as const,
  },

  // Leave Management
  leave: {
    all: () => ["leave", queryKeys._tenantScope()] as const,
    requests: (filters?: Record<string, unknown>) =>
      [...queryKeys.leave.all(), "requests", filters] as const,
    request: (id: string) => [...queryKeys.leave.all(), "request", id] as const,
    types: () => [...queryKeys.leave.all(), "types"] as const,
    policies: () => [...queryKeys.leave.all(), "policies"] as const,
    balances: (employeeId?: string) =>
      [...queryKeys.leave.all(), "balances", employeeId] as const,
  },

  // Benefits
  benefits: {
    all: () => ["benefits", queryKeys._tenantScope()] as const,
    plans: () => [...queryKeys.benefits.all(), "plans"] as const,
    enrollments: (filters?: Record<string, unknown>) =>
      [...queryKeys.benefits.all(), "enrollments", filters] as const,
    enrollment: (id: string) => [...queryKeys.benefits.all(), "enrollment", id] as const,
  },

  // Workflows
  workflows: {
    all: () => ["workflows", queryKeys._tenantScope()] as const,
    definitions: () => [...queryKeys.workflows.all(), "definitions"] as const,
    definition: (id: string) => [...queryKeys.workflows.definitions(), id] as const,
    instances: (filters?: Record<string, unknown>) =>
      [...queryKeys.workflows.all(), "instances", filters] as const,
    instance: (id: string) => [...queryKeys.workflows.all(), "instance", id] as const,
    templates: () => [...queryKeys.workflows.all(), "templates"] as const,
  },

  // Security
  security: {
    all: () => ["security", queryKeys._tenantScope()] as const,
    users: (filters?: Record<string, unknown>) =>
      [...queryKeys.security.all(), "users", filters] as const,
    user: (id: string) => [...queryKeys.security.all(), "user", id] as const,
    roles: () => [...queryKeys.security.all(), "roles"] as const,
    role: (id: string) => [...queryKeys.security.roles(), id] as const,
    permissions: () => [...queryKeys.security.all(), "permissions"] as const,
    fieldPermissions: () =>
      [...queryKeys.security.all(), "field-permissions"] as const,
    entityFieldPermissions: (entity: string) =>
      [...queryKeys.security.all(), "field-permissions", entity] as const,
    auditLog: (filters?: Record<string, unknown>) =>
      [...queryKeys.security.all(), "audit-log", filters] as const,
  },

  // Reports
  reports: {
    all: () => ["reports", queryKeys._tenantScope()] as const,
    list: () => [...queryKeys.reports.all(), "list"] as const,
    report: (id: string) => [...queryKeys.reports.all(), id] as const,
    execute: (id: string, params?: Record<string, unknown>) =>
      [...queryKeys.reports.report(id), "execute", params] as const,
    fieldCatalog: () => [...queryKeys.reports.all(), "fields"] as const,
    fieldCategories: () => [...queryKeys.reports.all(), "fields", "categories"] as const,
    fieldValues: (fieldKey: string) =>
      [...queryKeys.reports.all(), "fields", fieldKey, "values"] as const,
    templates: () => [...queryKeys.reports.all(), "templates"] as const,
    favourites: () => [...queryKeys.reports.all(), "favourites"] as const,
    executions: (id: string) =>
      [...queryKeys.reports.report(id), "executions"] as const,
    scheduled: () => [...queryKeys.reports.all(), "scheduled"] as const,
  },

  // LMS
  lms: {
    all: () => ["lms", queryKeys._tenantScope()] as const,
    courses: (filters?: Record<string, unknown>) =>
      [...queryKeys.lms.all(), "courses", filters] as const,
    course: (id: string) => [...queryKeys.lms.all(), "course", id] as const,
    assignments: (filters?: Record<string, unknown>) =>
      [...queryKeys.lms.all(), "assignments", filters] as const,
    progress: (employeeId?: string) =>
      [...queryKeys.lms.all(), "progress", employeeId] as const,
  },

  // Tenant
  tenant: {
    all: () => ["tenant"] as const,
    current: () => [...queryKeys.tenant.all(), "current", queryKeys._tenantScope()] as const,
    settings: () => [...queryKeys.tenant.all(), "settings", queryKeys._tenantScope()] as const,
    list: () => [...queryKeys.tenant.all(), "list"] as const,
  },

  // Portal
  portal: {
    all: () => ["portal", queryKeys._tenantScope()] as const,
    available: () => [...queryKeys.portal.all(), "available"] as const,
    navigation: (portalCode: string) =>
      [...queryKeys.portal.all(), "navigation", portalCode] as const,
  },

  // Analytics
  analytics: {
    all: () => ["analytics", queryKeys._tenantScope()] as const,
    headcount: (filters?: Record<string, unknown>) =>
      [...queryKeys.analytics.all(), "headcount", filters] as const,
    turnover: (filters?: Record<string, unknown>) =>
      [...queryKeys.analytics.all(), "turnover", filters] as const,
    diversity: (filters?: Record<string, unknown>) =>
      [...queryKeys.analytics.all(), "diversity", filters] as const,
    compensation: (filters?: Record<string, unknown>) =>
      [...queryKeys.analytics.all(), "compensation", filters] as const,
    executive: () => [...queryKeys.analytics.all(), "executive"] as const,
    manager: () => [...queryKeys.analytics.all(), "manager"] as const,
  },

  // Payroll
  payroll: {
    all: () => ["payroll", queryKeys._tenantScope()] as const,
    runs: (filters?: Record<string, unknown>) =>
      [...queryKeys.payroll.all(), "runs", filters] as const,
    run: (id: string) => [...queryKeys.payroll.all(), "run", id] as const,
    taxDetails: (employeeId: string) =>
      [...queryKeys.payroll.all(), "tax-details", employeeId] as const,
    pension: () => [...queryKeys.payroll.all(), "pension"] as const,
  },

  // Directory
  directory: {
    all: () => ["directory", queryKeys._tenantScope()] as const,
    search: (filters?: Record<string, unknown>) =>
      [...queryKeys.directory.all(), "search", filters] as const,
    departments: () => [...queryKeys.directory.all(), "departments"] as const,
  },

  // Dashboard
  dashboard: {
    all: () => ["dashboard", queryKeys._tenantScope()] as const,
    employee: () => [...queryKeys.dashboard.all(), "employee"] as const,
    manager: () => [...queryKeys.dashboard.all(), "manager"] as const,
    admin: () => [...queryKeys.dashboard.all(), "admin"] as const,
    stats: (type: "employee" | "manager" | "admin") =>
      [...queryKeys.dashboard.all(), "stats", type] as const,
  },
} as const;

/**
 * Invalidation helpers for common mutation patterns
 */
export const invalidationPatterns = {
  // After employee mutation
  employee: (employeeId?: string) => {
    const patterns: QueryKey[] = [queryKeys.employees.all()];
    if (employeeId) {
      patterns.push(queryKeys.employees.detail(employeeId));
    }
    patterns.push(queryKeys.dashboard.admin());
    return patterns;
  },

  // After leave request mutation
  leaveRequest: () => [
    queryKeys.leave.all(),
    queryKeys.me.leave(),
    queryKeys.manager.approvals(),
    queryKeys.dashboard.all(),
  ],

  // After time entry mutation
  timeEntry: () => [
    queryKeys.time.all(),
    queryKeys.me.time(),
    queryKeys.manager.approvals(),
  ],

  // After workflow mutation
  workflow: () => [
    queryKeys.workflows.all(),
    queryKeys.manager.approvals(),
  ],

  // After organization mutation
  organization: () => [
    queryKeys.organization.all(),
    queryKeys.employees.all(),
  ],

  // After security mutation
  security: () => [
    queryKeys.security.all(),
    queryKeys.auth.permissions(),
  ],

  // After report mutation
  report: () => [
    queryKeys.reports.all(),
  ],

  // After analytics-relevant mutation (employee changes, compensation, etc.)
  analytics: () => [
    queryKeys.analytics.all(),
    queryKeys.dashboard.all(),
  ],
};

/**
 * Helper to invalidate multiple query patterns
 */
export function invalidateQueries(patterns: QueryKey[]): Promise<void[]> {
  return Promise.all(
    patterns.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  );
}

/**
 * Helper to prefetch queries for navigation
 */
export function prefetchQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  staleTime = STALE_TIMES.medium
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime,
  });
}

// Export stale times for use in components
export { STALE_TIMES };
