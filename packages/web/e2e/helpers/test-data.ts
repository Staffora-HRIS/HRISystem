/**
 * Test Data for E2E Tests
 *
 * Contains test user credentials, employee data, and other fixtures
 * used across E2E test suites.
 *
 * IMPORTANT: These credentials must match seeded data in the test environment.
 * Run `bun run db:seed` to populate the database before running E2E tests.
 */

/** Admin user with full permissions */
export const ADMIN_USER = {
  email: "admin@staffora.co.uk",
  password: "Admin12345678!",
  name: "System Admin",
} as const;

/** HR Manager user with HR-related permissions */
export const HR_MANAGER_USER = {
  email: "hr.manager@staffora.co.uk",
  password: "HrManager12345!",
  name: "HR Manager",
} as const;

/** Regular employee user with limited permissions */
export const EMPLOYEE_USER = {
  email: "employee@staffora.co.uk",
  password: "Employee12345!",
  name: "Jane Employee",
} as const;

/** Create fresh test employee data per test to avoid collision under parallelism */
export function createNewEmployee() {
  const now = Date.now();
  return {
    firstName: "E2E",
    lastName: `Test-${now}`,
    email: `e2e-test-${now}@staffora.co.uk`,
    hireDate: new Date().toISOString().split("T")[0],
    employmentType: "full_time" as const,
  };
}

/** Create fresh leave request data per test */
export function createNewLeaveRequest() {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date();
  end.setDate(end.getDate() + 16);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
    reason: "E2E test leave request - annual leave",
  };
}

/** Application routes used in tests */
export const ROUTES = {
  login: "/login",
  forgotPassword: "/forgot-password",
  mfa: "/mfa",
  dashboard: "/dashboard",
  adminDashboard: "/admin/dashboard",
  employees: "/admin/hr/employees",
  positions: "/admin/hr/positions",
  departments: "/admin/hr/departments",
  contracts: "/admin/hr/contracts",
  orgChart: "/admin/hr/org-chart",
  leaveRequests: "/admin/leave/requests",
  leaveTypes: "/admin/leave/types",
  leavePolicies: "/admin/leave/policies",
  cases: "/admin/cases",
  courses: "/admin/lms/courses",
  learningPaths: "/admin/lms/paths",
  recruitment: "/admin/talent/recruitment",
  performance: "/admin/talent/performance",
  goals: "/admin/talent/goals",
  succession: "/admin/talent/succession",
  benefits: "/admin/benefits",
  onboardingTemplates: "/admin/onboarding/templates",
  documentTemplates: "/admin/documents/templates",
  users: "/admin/security/users",
  roles: "/admin/security/roles",
  auditLog: "/admin/security/audit-log",
  analytics: "/admin/analytics",
  reports: "/admin/reports",
  settings: "/admin/settings/tenant",
  myProfile: "/me/profile",
  schedules: "/admin/time/schedules",
  timesheets: "/admin/time/timesheets",
} as const;

/** Common page titles and headings */
export const PAGE_HEADINGS = {
  login: "Sign in to Staffora",
  dashboard: "Dashboard",
  employees: "Employees",
  leaveRequests: "Leave Requests",
  mfa: "Two-Factor Authentication",
} as const;
