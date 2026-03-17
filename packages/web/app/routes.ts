import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // Health check (no auth, used by Docker/load balancers)
  route("healthz", "routes/healthz.tsx"),

  // Root index - redirects to dashboard or login
  index("routes/home.tsx"),

  // Authentication routes (no auth required)
  layout("routes/(auth)/layout.tsx", [
    route("login", "routes/(auth)/login/route.tsx"),
    route("mfa", "routes/(auth)/mfa/route.tsx"),
    route("forgot-password", "routes/(auth)/forgot-password/route.tsx"),
    route("reset-password", "routes/(auth)/reset-password/route.tsx"),
  ]),

  // Main application routes (auth required)
  layout("routes/(app)/layout.tsx", [
    route("dashboard", "routes/(app)/dashboard/route.tsx"),

    // Employee self-service (/me/*)
    ...prefix("me", [
      index("routes/(app)/me/index.tsx"),
      route("profile", "routes/(app)/me/profile/route.tsx"),
      route("time", "routes/(app)/me/time/route.tsx"),
      route("leave", "routes/(app)/me/leave/route.tsx"),
      route("benefits", "routes/(app)/me/benefits/route.tsx"),
      route("documents", "routes/(app)/me/documents/route.tsx"),
      route("learning", "routes/(app)/me/learning/route.tsx"),
      route("cases", "routes/(app)/me/cases/route.tsx"),
      route("competencies", "routes/(app)/me/competencies/route.tsx"),
      route("onboarding", "routes/(app)/me/onboarding/route.tsx"),
      route("org-chart", "routes/(app)/me/org-chart/route.tsx"),
    ]),

    // Manager portal (/manager/*)
    ...prefix("manager", [
      index("routes/(app)/manager/index.tsx"),
      route("dashboard", "routes/(app)/manager/dashboard/route.tsx"),
      route("team", "routes/(app)/manager/team/route.tsx"),
      route("org-chart", "routes/(app)/manager/org-chart/route.tsx"),
      route("approvals", "routes/(app)/manager/approvals/route.tsx"),
      route("approvals/leave", "routes/(app)/manager/approvals/leave/route.tsx"),
      route("approvals/timesheets", "routes/(app)/manager/approvals/timesheets/route.tsx"),
      route("approvals/expenses", "routes/(app)/manager/approvals/expenses/route.tsx"),
      route("schedules", "routes/(app)/manager/schedules/route.tsx"),
      route("performance", "routes/(app)/manager/performance/route.tsx"),
    ]),
  ]),

  // Admin console routes (admin permission required)
  layout("routes/(admin)/layout.tsx", [
    ...prefix("admin", [
      route("dashboard", "routes/(admin)/dashboard/route.tsx"),

      // HR Administration
      ...prefix("hr", [
        index("routes/(admin)/hr/index.tsx"),
        route("employees", "routes/(admin)/hr/employees/route.tsx"),
        route("employees/:employeeId", "routes/(admin)/hr/employees/[employeeId]/route.tsx"),
        route("positions", "routes/(admin)/hr/positions/route.tsx"),
        route("contracts", "routes/(admin)/hr/contracts/route.tsx"),
        route("departments", "routes/(admin)/hr/departments/route.tsx"),
        route("organization", "routes/(admin)/hr/organization/route.tsx"),
        route("org-chart", "routes/(admin)/hr/org-chart/route.tsx"),
      ]),

      // Time & Attendance
      ...prefix("time", [
        index("routes/(admin)/time/index.tsx"),
        route("timesheets", "routes/(admin)/time/timesheets/route.tsx"),
        route("schedules", "routes/(admin)/time/schedules/route.tsx"),
        route("policies", "routes/(admin)/time/policies/route.tsx"),
        route("reports", "routes/(admin)/time/reports/route.tsx"),
      ]),

      // Leave Management
      ...prefix("leave", [
        index("routes/(admin)/leave/index.tsx"),
        route("types", "routes/(admin)/leave/types/route.tsx"),
        route("policies", "routes/(admin)/leave/policies/route.tsx"),
        route("requests", "routes/(admin)/leave/requests/route.tsx"),
      ]),

      // Absence Management (legacy)
      route("absence", "routes/(admin)/absence/index.tsx"),

      // Talent Management
      ...prefix("talent", [
        index("routes/(admin)/talent/index.tsx"),
        route("performance", "routes/(admin)/talent/performance/route.tsx"),
        route("goals", "routes/(admin)/talent/goals/route.tsx"),
        route("competencies", "routes/(admin)/talent/competencies/route.tsx"),
        route("succession", "routes/(admin)/talent/succession/route.tsx"),
        route("recruitment", "routes/(admin)/talent/recruitment/route.tsx"),
        route("recruitment/candidates", "routes/(admin)/talent/recruitment/candidates/route.tsx"),
      ]),

      // Benefits Administration
      ...prefix("benefits", [
        index("routes/(admin)/benefits/route.tsx"),
        route("enrollments", "routes/(admin)/benefits/enrollments/route.tsx"),
      ]),

      // Cases Administration
      ...prefix("cases", [
        index("routes/(admin)/cases/route.tsx"),
        route(":caseId", "routes/(admin)/cases/[caseId]/route.tsx"),
      ]),

      // Documents Administration
      ...prefix("documents", [
        route("templates", "routes/(admin)/documents/templates/route.tsx"),
      ]),

      // Onboarding Administration
      ...prefix("onboarding", [
        index("routes/(admin)/onboarding/index.tsx"),
        route("templates", "routes/(admin)/onboarding/templates/route.tsx"),
        route("active", "routes/(admin)/onboarding/active/route.tsx"),
      ]),

      // Analytics
      route("analytics", "routes/(admin)/analytics/route.tsx"),

      // Workflow Administration
      ...prefix("workflows", [
        index("routes/(admin)/workflows/index.tsx"),
        route("builder", "routes/(admin)/workflows/builder/route.tsx"),
        route("templates", "routes/(admin)/workflows/templates/route.tsx"),
      ]),

      // Security Administration
      ...prefix("security", [
        index("routes/(admin)/security/index.tsx"),
        route("users", "routes/(admin)/security/users/route.tsx"),
        route("roles", "routes/(admin)/security/roles/route.tsx"),
        route("permissions", "routes/(admin)/security/permissions/route.tsx"),
        route("audit-log", "routes/(admin)/security/audit-log/route.tsx"),
      ]),

      // Reports
      ...prefix("reports", [
        index("routes/(admin)/reports/route.tsx"),
        route("new", "routes/(admin)/reports/new/route.tsx"),
        route("templates", "routes/(admin)/reports/templates/route.tsx"),
        route("favourites", "routes/(admin)/reports/favourites/route.tsx"),
        route(":reportId", "routes/(admin)/reports/[reportId]/route.tsx"),
        route(":reportId/edit", "routes/(admin)/reports/[reportId]/edit/route.tsx"),
      ]),

      // LMS Administration
      ...prefix("lms", [
        index("routes/(admin)/lms/index.tsx"),
        route("courses", "routes/(admin)/lms/courses/route.tsx"),
        route("paths", "routes/(admin)/lms/paths/route.tsx"),
        route("assignments", "routes/(admin)/lms/assignments/route.tsx"),
      ]),

      // System Settings
      ...prefix("settings", [
        index("routes/(admin)/settings/index.tsx"),
        route("tenant", "routes/(admin)/settings/tenant/route.tsx"),
        route("notifications", "routes/(admin)/settings/notifications/route.tsx"),
        route("integrations", "routes/(admin)/settings/integrations/route.tsx"),
      ]),
    ]),
  ]),

  // Catch-all 404
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
