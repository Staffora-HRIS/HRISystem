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
      route("bank-details", "routes/(app)/me/bank-details/route.tsx"),
      route("emergency-contacts", "routes/(app)/me/emergency-contacts/route.tsx"),
      route("change-requests", "routes/(app)/me/change-requests/route.tsx"),
      route("directory", "routes/(app)/me/directory/route.tsx"),
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
        route("contract-amendments", "routes/(admin)/hr/contract-amendments/route.tsx"),
        route("contract-statements", "routes/(admin)/hr/contract-statements/route.tsx"),
        route("departments", "routes/(admin)/hr/departments/route.tsx"),
        route("organization", "routes/(admin)/hr/organization/route.tsx"),
        route("org-chart", "routes/(admin)/hr/org-chart/route.tsx"),
        route("jobs", "routes/(admin)/hr/jobs/route.tsx"),
        route("bank-details", "routes/(admin)/hr/bank-details/route.tsx"),
        route("emergency-contacts", "routes/(admin)/hr/emergency-contacts/route.tsx"),
        route("equipment", "routes/(admin)/hr/equipment/route.tsx"),
        route("adjustments", "routes/(admin)/hr/adjustments/route.tsx"),
        route("warnings", "routes/(admin)/hr/warnings/route.tsx"),
        route("probation", "routes/(admin)/hr/probation/route.tsx"),
        route("secondments", "routes/(admin)/hr/secondments/route.tsx"),
        route("flexible-working", "routes/(admin)/hr/flexible-working/route.tsx"),
        route("headcount-planning", "routes/(admin)/hr/headcount-planning/route.tsx"),
      ]),

      // Time & Attendance
      ...prefix("time", [
        index("routes/(admin)/time/index.tsx"),
        route("timesheets", "routes/(admin)/time/timesheets/route.tsx"),
        route("schedules", "routes/(admin)/time/schedules/route.tsx"),
        route("policies", "routes/(admin)/time/policies/route.tsx"),
        route("reports", "routes/(admin)/time/reports/route.tsx"),
        route("geofence", "routes/(admin)/time/geofence/route.tsx"),
      ]),

      // Leave Management
      ...prefix("leave", [
        index("routes/(admin)/leave/index.tsx"),
        route("types", "routes/(admin)/leave/types/route.tsx"),
        route("policies", "routes/(admin)/leave/policies/route.tsx"),
        route("requests", "routes/(admin)/leave/requests/route.tsx"),
        route("statutory", "routes/(admin)/leave/statutory/route.tsx"),
        route("statutory/:entitlementId", "routes/(admin)/leave/statutory/[entitlementId]/route.tsx"),
        route("ssp", "routes/(admin)/leave/ssp/route.tsx"),
        route("bereavement", "routes/(admin)/leave/bereavement/route.tsx"),
        route("carers", "routes/(admin)/leave/carers/route.tsx"),
        route("parental", "routes/(admin)/leave/parental/route.tsx"),
        route("return-to-work", "routes/(admin)/leave/return-to-work/route.tsx"),
      ]),

      // Absence Management (legacy)
      route("absence", "routes/(admin)/absence/index.tsx"),

      // Payroll Administration
      ...prefix("payroll", [
        index("routes/(admin)/payroll/index.tsx"),
        route("runs", "routes/(admin)/payroll/runs/route.tsx"),
        route("runs/:runId", "routes/(admin)/payroll/runs/[runId]/route.tsx"),
        route("schedules", "routes/(admin)/payroll/schedules/route.tsx"),
        route("payslips", "routes/(admin)/payroll/payslips/route.tsx"),
        route("deductions", "routes/(admin)/payroll/deductions/route.tsx"),
        route("tax-codes", "routes/(admin)/payroll/tax-codes/route.tsx"),
        route("tax-details", "routes/(admin)/payroll/tax-details/route.tsx"),
        route("ni-categories", "routes/(admin)/payroll/ni-categories/route.tsx"),
        route("bank-holidays", "routes/(admin)/payroll/bank-holidays/route.tsx"),
        route("pension", "routes/(admin)/payroll/pension/route.tsx"),
      ]),

      // Talent Management
      ...prefix("talent", [
        index("routes/(admin)/talent/index.tsx"),
        route("performance", "routes/(admin)/talent/performance/route.tsx"),
        route("goals", "routes/(admin)/talent/goals/route.tsx"),
        route("competencies", "routes/(admin)/talent/competencies/route.tsx"),
        route("succession", "routes/(admin)/talent/succession/route.tsx"),
        route("recruitment", "routes/(admin)/talent/recruitment/route.tsx"),
        route("recruitment/candidates", "routes/(admin)/talent/recruitment/candidates/route.tsx"),
        route("recruitment/agencies", "routes/(admin)/talent/recruitment/agencies/route.tsx"),
        route("recruitment/assessments", "routes/(admin)/talent/recruitment/assessments/route.tsx"),
        route("recruitment/dbs-checks", "routes/(admin)/talent/recruitment/dbs-checks/route.tsx"),
        route("recruitment/reference-checks", "routes/(admin)/talent/recruitment/reference-checks/route.tsx"),
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
        route("contracts", "routes/(admin)/documents/contracts/route.tsx"),
        route("letters", "routes/(admin)/documents/letters/route.tsx"),
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

      // Compliance Administration
      ...prefix("compliance", [
        index("routes/(admin)/compliance/index.tsx"),
        route("right-to-work", "routes/(admin)/compliance/right-to-work/route.tsx"),
        route("health-safety", "routes/(admin)/compliance/health-safety/route.tsx"),
        route("diversity", "routes/(admin)/compliance/diversity/route.tsx"),
        route("gender-pay-gap", "routes/(admin)/compliance/gender-pay-gap/route.tsx"),
        route("nmw", "routes/(admin)/compliance/nmw/route.tsx"),
        route("wtr", "routes/(admin)/compliance/wtr/route.tsx"),
        route("dsar", "routes/(admin)/compliance/dsar/route.tsx"),
        route("data-retention", "routes/(admin)/compliance/data-retention/route.tsx"),
        route("data-breach", "routes/(admin)/compliance/data-breach/route.tsx"),
      ]),

      // Privacy Administration
      ...prefix("privacy", [
        index("routes/(admin)/privacy/index.tsx"),
        route("dsar", "routes/(admin)/privacy/dsar/route.tsx"),
        route("data-erasure", "routes/(admin)/privacy/data-erasure/route.tsx"),
        route("data-breach", "routes/(admin)/privacy/data-breach/route.tsx"),
        route("consent", "routes/(admin)/privacy/consent/route.tsx"),
        route("notices", "routes/(admin)/privacy/notices/route.tsx"),
        route("privacy-notices", "routes/(admin)/privacy/privacy-notices/route.tsx"),
      ]),

      // Security Administration
      ...prefix("security", [
        index("routes/(admin)/security/index.tsx"),
        route("users", "routes/(admin)/security/users/route.tsx"),
        route("roles", "routes/(admin)/security/roles/route.tsx"),
        route("permissions", "routes/(admin)/security/permissions/route.tsx"),
        route("audit-log", "routes/(admin)/security/audit-log/route.tsx"),
        route("delegations", "routes/(admin)/security/delegations/route.tsx"),
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
        route("budgets", "routes/(admin)/lms/budgets/route.tsx"),
        route("cpd", "routes/(admin)/lms/cpd/route.tsx"),
        route("ratings", "routes/(admin)/lms/ratings/route.tsx"),
      ]),

      // System Settings
      ...prefix("settings", [
        index("routes/(admin)/settings/index.tsx"),
        route("tenant", "routes/(admin)/settings/tenant/route.tsx"),
        route("notifications", "routes/(admin)/settings/notifications/route.tsx"),
        route("integrations", "routes/(admin)/settings/integrations/route.tsx"),
        route("appearance", "routes/(admin)/settings/appearance/route.tsx"),
        route("lookup-values", "routes/(admin)/settings/lookup-values/route.tsx"),
        route("bank-holidays", "routes/(admin)/settings/bank-holidays/route.tsx"),
        route("delegations", "routes/(admin)/settings/delegations/route.tsx"),
      ]),
    ]),
  ]),

  // Catch-all 404
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
