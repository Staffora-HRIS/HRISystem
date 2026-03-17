/**
 * Shared Constants
 *
 * This file exports all shared constants used across the Staffora platform.
 */

// =============================================================================
// HTTP Status Codes
// =============================================================================

export const HttpStatus = {
  // Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,

  // Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// =============================================================================
// Pagination Defaults
// =============================================================================

export const PaginationDefaults = {
  PAGE: 1,
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// =============================================================================
// Cache TTL (in seconds)
// =============================================================================

export const CacheTTL = {
  /** Permission cache: 15 minutes */
  PERMISSIONS: 15 * 60,

  /** Session cache: 24 hours */
  SESSION: 24 * 60 * 60,

  /** Tenant settings cache: 1 hour */
  TENANT_SETTINGS: 60 * 60,

  /** User profile cache: 5 minutes */
  USER_PROFILE: 5 * 60,

  /** Role cache: 30 minutes */
  ROLES: 30 * 60,

  /** Short-lived cache: 1 minute */
  SHORT: 60,

  /** Medium cache: 10 minutes */
  MEDIUM: 10 * 60,

  /** Long cache: 1 hour */
  LONG: 60 * 60,
} as const;

// =============================================================================
// Rate Limiting
// =============================================================================

export const RateLimits = {
  /** Default API rate limit per minute */
  DEFAULT: 100,

  /** Auth endpoints rate limit per minute */
  AUTH: 20,

  /** Search endpoints rate limit per minute */
  SEARCH: 60,

  /** Report generation rate limit per minute */
  REPORTS: 10,

  /** File upload rate limit per minute */
  UPLOADS: 20,
} as const;

// =============================================================================
// Session Configuration
// =============================================================================

export const SessionConfig = {
  /** Cookie name for session */
  COOKIE_NAME: "staffora_session",

  /** Session duration in milliseconds: 24 hours */
  DURATION: 24 * 60 * 60 * 1000,

  /** Remember me duration in milliseconds: 30 days */
  REMEMBER_ME_DURATION: 30 * 24 * 60 * 60 * 1000,

  /** Idle timeout in milliseconds: 30 minutes */
  IDLE_TIMEOUT: 30 * 60 * 1000,
} as const;

// =============================================================================
// Validation Constants
// =============================================================================

export const ValidationLimits = {
  /** Maximum email length */
  EMAIL_MAX: 255,

  /** Maximum name length */
  NAME_MAX: 100,

  /** Minimum password length */
  PASSWORD_MIN: 12,

  /** Maximum password length */
  PASSWORD_MAX: 128,

  /** Maximum description length */
  DESCRIPTION_MAX: 1000,

  /** Maximum notes length */
  NOTES_MAX: 5000,

  /** Maximum slug length */
  SLUG_MAX: 50,

  /** Minimum slug length */
  SLUG_MIN: 3,

  /** Maximum file upload size in bytes: 10MB */
  FILE_SIZE_MAX: 10 * 1024 * 1024,
} as const;

// =============================================================================
// Date/Time Formats
// =============================================================================

export const DateFormats = {
  /** ISO 8601 format */
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",

  /** Date only */
  DATE: "yyyy-MM-dd",

  /** Time only */
  TIME: "HH:mm:ss",

  /** Display date */
  DISPLAY_DATE: "MMM dd, yyyy",

  /** Display date and time */
  DISPLAY_DATETIME: "MMM dd, yyyy HH:mm",
} as const;

// =============================================================================
// System Roles
// =============================================================================

export const SystemRoles = {
  /** Super admin with full platform access */
  SUPER_ADMIN: "super_admin",

  /** Tenant admin with tenant-level access */
  TENANT_ADMIN: "tenant_admin",

  /** HR admin with full HR module access */
  HR_ADMIN: "hr_admin",

  /** HR officer with day-to-day HR operations */
  HR_OFFICER: "hr_officer",

  /** Payroll admin with payroll module access */
  PAYROLL_ADMIN: "payroll_admin",

  /** Recruitment admin with recruitment module access */
  RECRUITMENT_ADMIN: "recruitment_admin",

  /** LMS admin with learning management access */
  LMS_ADMIN: "lms_admin",

  /** Compliance officer with compliance oversight */
  COMPLIANCE_OFFICER: "compliance_officer",

  /** Health & safety officer */
  HEALTH_SAFETY_OFFICER: "health_safety_officer",

  /** Department head with department-wide access */
  DEPARTMENT_HEAD: "department_head",

  /** Line manager with direct reports access */
  LINE_MANAGER: "line_manager",

  /** Backwards-compatible alias for line_manager */
  MANAGER: "manager",

  /** Team leader with team-level access */
  TEAM_LEADER: "team_leader",

  /** Employee with self-service access */
  EMPLOYEE: "employee",

  /** Contractor with limited access */
  CONTRACTOR: "contractor",

  /** Temporary worker with limited access */
  TEMP_WORKER: "temp_worker",

  /** Intern with limited access */
  INTERN: "intern",

  /** External auditor with read-only audit access */
  EXTERNAL_AUDITOR: "external_auditor",

  /** Board member with executive reporting access */
  BOARD_MEMBER: "board_member",
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];

// =============================================================================
// Audit Event Types
// =============================================================================

export const AuditEventTypes = {
  // Auth events
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  AUTH_PASSWORD_CHANGED: "auth.password_changed",
  AUTH_MFA_ENABLED: "auth.mfa_enabled",
  AUTH_MFA_DISABLED: "auth.mfa_disabled",

  // User events
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_STATUS_CHANGED: "user.status_changed",

  // Employee events
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_TERMINATED: "employee.terminated",

  // Role events
  ROLE_ASSIGNED: "role.assigned",
  ROLE_REVOKED: "role.revoked",
  ROLE_CREATED: "role.created",
  ROLE_UPDATED: "role.updated",
  ROLE_DELETED: "role.deleted",

  // Tenant events
  TENANT_CREATED: "tenant.created",
  TENANT_UPDATED: "tenant.updated",
  TENANT_SUSPENDED: "tenant.suspended",
  TENANT_ACTIVATED: "tenant.activated",
} as const;

export type AuditEventType =
  (typeof AuditEventTypes)[keyof typeof AuditEventTypes];
