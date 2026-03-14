/**
 * Shared Route-Level Error Mapping
 *
 * Converts ServiceResult error codes to HTTP status codes and structured
 * error responses. This is the single source of truth for error-code-to-HTTP-
 * status mapping across all route modules (TODO-069).
 *
 * Two usage patterns are supported:
 *
 * 1. With Elysia's `set.status` (modules that destructure `set`):
 * ```ts
 * if (!result.success) {
 *   return mapServiceError(result.error, set, requestId);
 * }
 * ```
 *
 * 2. With Elysia's `error()` helper (modules that destructure `error`):
 * ```ts
 * if (!result.success) {
 *   return handleServiceError(error, result.error);
 * }
 * ```
 *
 * Both accept optional module-specific overrides for domain codes that aren't
 * in the base map:
 * ```ts
 * return handleServiceError(error, result.error, {
 *   BELOW_STATUTORY_MINIMUM: 400,
 * });
 * ```
 */

import { ErrorCodes } from "../plugins/errors";

// =============================================================================
// Service Error Type
// =============================================================================

/**
 * Shape of the error object from a failed ServiceResult.
 * All service layers return this when `success` is false.
 */
export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

// =============================================================================
// Error Code to HTTP Status Mapping
// =============================================================================

/**
 * Comprehensive mapping from error codes to HTTP status codes.
 * Covers all common error codes from ErrorCodes plus domain-specific codes
 * that modules use in their service layers.
 *
 * Module-specific codes that appear in service return values are included
 * here so that individual route files do not need to maintain their own
 * mapping tables. If a code is truly unique to one module and unlikely to
 * be reused, it can still be passed as a `moduleOverrides` argument.
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  // ---------------------------------------------------------------------------
  // 400 Bad Request
  // ---------------------------------------------------------------------------
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.MISSING_TENANT]: 400,
  [ErrorCodes.INVALID_TENANT]: 400,

  // HR module domain codes
  INVALID_PARENT: 400,
  INACTIVE_PARENT: 400,
  CIRCULAR_HIERARCHY: 400,
  HAS_CHILDREN: 400,
  HAS_EMPLOYEES: 400,
  HAS_ASSIGNMENTS: 400,
  INVALID_ORG_UNIT: 400,
  INVALID_SALARY_RANGE: 400,
  POSITION_NOT_FOUND: 400,
  POSITION_OVERFILLED: 400,

  // Benefits module domain codes
  LIFE_EVENT_EXPIRED: 400,
  OPEN_ENROLLMENT_NOT_ACTIVE: 400,
  WAITING_PERIOD_NOT_MET: 400,
  PLAN_NOT_ELIGIBLE: 400,
  INVALID_COVERAGE_LEVEL: 400,
  INVALID_DEPENDENTS: 400,
  INVALID_COURSE: 400,

  // Time module domain codes
  [ErrorCodes.CLOCK_EVENT_OUT_OF_SEQUENCE]: 400,
  [ErrorCodes.INVALID_TIME_ENTRY]: 400,

  // Absence module domain codes
  [ErrorCodes.INSUFFICIENT_LEAVE_BALANCE]: 400,
  [ErrorCodes.BLACKOUT_PERIOD_VIOLATION]: 400,

  // Analytics
  [ErrorCodes.INVALID_DATE_RANGE]: 400,

  // ---------------------------------------------------------------------------
  // 401 Unauthorized
  // ---------------------------------------------------------------------------
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.INVALID_CREDENTIALS]: 401,
  [ErrorCodes.SESSION_EXPIRED]: 401,
  [ErrorCodes.SESSION_INVALID]: 401,
  [ErrorCodes.ACCOUNT_NOT_VERIFIED]: 401,

  // ---------------------------------------------------------------------------
  // 403 Forbidden
  // ---------------------------------------------------------------------------
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.PERMISSION_DENIED]: 403,
  [ErrorCodes.CSRF_INVALID]: 403,
  [ErrorCodes.TENANT_SUSPENDED]: 403,
  [ErrorCodes.MFA_REQUIRED]: 403,
  [ErrorCodes.MFA_INVALID]: 403,
  [ErrorCodes.ACCOUNT_SUSPENDED]: 403,
  [ErrorCodes.MFA_REQUIRED_FOR_ACTION]: 403,
  [ErrorCodes.CONSTRAINT_VIOLATION]: 403,

  // Portal
  [ErrorCodes.PORTAL_ACCESS_DENIED]: 403,
  [ErrorCodes.RESTRICTED_ACCESS]: 403,

  // ---------------------------------------------------------------------------
  // 404 Not Found
  // ---------------------------------------------------------------------------
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.TENANT_NOT_FOUND]: 404,
  [ErrorCodes.TENANT_DELETED]: 404,
  [ErrorCodes.EMPLOYEE_NOT_FOUND]: 404,
  [ErrorCodes.COURSE_NOT_FOUND]: 404,
  [ErrorCodes.POLICY_NOT_FOUND]: 404,
  [ErrorCodes.WORKFLOW_NOT_FOUND]: 404,
  [ErrorCodes.SUCCESSION_PLAN_NOT_FOUND]: 404,
  [ErrorCodes.NO_EMPLOYEE_RECORD]: 404,

  // Domain-specific NOT_FOUND codes used in service layers
  CARRIER_NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  DEPENDENT_NOT_FOUND: 404,
  ENROLLMENT_NOT_FOUND: 404,
  LIFE_EVENT_NOT_FOUND: 404,
  OPEN_ENROLLMENT_NOT_FOUND: 404,
  TEMPLATE_NOT_FOUND: 404,
  TASK_NOT_FOUND: 404,

  // ---------------------------------------------------------------------------
  // 409 Conflict
  // ---------------------------------------------------------------------------
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.STATE_MACHINE_VIOLATION]: 409,
  [ErrorCodes.EFFECTIVE_DATE_OVERLAP]: 409,
  [ErrorCodes.INVALID_LIFECYCLE_TRANSITION]: 409,
  [ErrorCodes.RESOURCE_IN_USE]: 409,
  [ErrorCodes.IDEMPOTENCY_KEY_REUSED]: 409,
  [ErrorCodes.REQUEST_STILL_PROCESSING]: 409,
  [ErrorCodes.POSITION_ALREADY_FILLED]: 409,
  [ErrorCodes.CANDIDATE_ALREADY_EXISTS]: 409,
  [ErrorCodes.CANDIDATE_ALREADY_IN_PLAN]: 409,
  [ErrorCodes.COMPETENCY_ALREADY_ASSIGNED]: 409,
  [ErrorCodes.DUPLICATE_APPLICATION]: 409,
  [ErrorCodes.LEAVE_REQUEST_OVERLAP]: 409,
  [ErrorCodes.SCHEDULE_CONFLICT]: 409,
  [ErrorCodes.TIMESHEET_ALREADY_APPROVED]: 409,
  [ErrorCodes.TASK_ALREADY_COMPLETED]: 409,
  [ErrorCodes.LIFE_EVENT_ALREADY_REVIEWED]: 409,
  [ErrorCodes.ASSIGNMENT_ALREADY_COMPLETED]: 409,

  // Domain-specific CONFLICT codes used in service layers
  DUPLICATE_CODE: 409,
  INVALID_TRANSITION: 409,
  INVALID_STATUS: 409,
  ALREADY_ENROLLED: 409,
  ALREADY_PUBLISHED: 409,
  ENROLLMENT_CONFLICT: 409,
  CANNOT_ESCALATE: 409,
  CANNOT_RESOLVE: 409,
  CANNOT_CLOSE: 409,
  ALREADY_COMPLETED: 409,
  COURSE_NOT_PUBLISHED: 409,
  [ErrorCodes.REQUISITION_CLOSED]: 409,
  [ErrorCodes.REQUISITION_NOT_OPEN]: 409,
  [ErrorCodes.INVALID_STAGE_TRANSITION]: 409,
  [ErrorCodes.INVALID_WORKFLOW_TRANSITION]: 409,
  [ErrorCodes.PLAN_INACTIVE]: 409,
  [ErrorCodes.CASE_CLOSED]: 409,
  [ErrorCodes.TEMPLATE_INACTIVE]: 409,
  [ErrorCodes.ALREADY_ONBOARDING]: 409,
  [ErrorCodes.INSTANCE_CLOSED]: 409,
  [ErrorCodes.CANNOT_SKIP_REQUIRED]: 409,

  // ---------------------------------------------------------------------------
  // 423 Locked
  // ---------------------------------------------------------------------------
  [ErrorCodes.ACCOUNT_LOCKED]: 423,

  // ---------------------------------------------------------------------------
  // 429 Too Many Requests
  // ---------------------------------------------------------------------------
  [ErrorCodes.TOO_MANY_REQUESTS]: 429,
  [ErrorCodes.LIMIT_EXCEEDED]: 429,

  // ---------------------------------------------------------------------------
  // 500 Internal Server Error
  // ---------------------------------------------------------------------------
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.REPORT_GENERATION_FAILED]: 500,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  ENROLLMENT_FAILED: 500,
  START_FAILED: 500,
  COMPLETE_FAILED: 500,
  COMMENT_FAILED: 500,
  SKIP_FAILED: 500,

  // ---------------------------------------------------------------------------
  // 503 Service Unavailable
  // ---------------------------------------------------------------------------
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Get the HTTP status code for an error code.
 * Returns 500 for unknown error codes (fail-safe default).
 *
 * Accepts optional module-specific overrides that take precedence over
 * the base mapping.
 */
export function getHttpStatus(
  errorCode: string,
  moduleOverrides?: Record<string, number>
): number {
  if (moduleOverrides && errorCode in moduleOverrides) {
    return moduleOverrides[errorCode];
  }
  return ERROR_STATUS_MAP[errorCode] ?? 500;
}

/**
 * Convert a ServiceResult error to an HTTP error response.
 *
 * Sets the HTTP status on the Elysia `set` object and returns the
 * standard error response body.
 *
 * Use this when the route handler destructures `set` from context
 * (the Cases/LMS/Onboarding pattern).
 *
 * @param error - The error from ServiceResult ({ code, message, details? })
 * @param set - Elysia's response set object (must have `status` property)
 * @param requestId - The request ID from the errors plugin
 * @param moduleOverrides - Optional module-specific error code to status overrides
 */
export function mapServiceError(
  error: ServiceError,
  set: { status: number },
  requestId: string,
  moduleOverrides?: Record<string, number>
): {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
} {
  set.status = getHttpStatus(error.code, moduleOverrides);
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
    },
  };
}

/**
 * Convert a ServiceResult error to an HTTP error response using
 * Elysia's `error()` helper.
 *
 * Use this when the route handler destructures `error` from context
 * (the HR/Benefits/Recruitment pattern). The `error()` helper sets
 * the status code and returns the body in one call.
 *
 * @param errorFn - Elysia's `error(status, body)` function from context
 * @param serviceError - The error from ServiceResult ({ code, message, details? })
 * @param moduleOverrides - Optional module-specific error code to status overrides
 * @returns The return value of `errorFn` (Elysia uses this to set status + body)
 *
 * @example
 * ```ts
 * if (!result.success) {
 *   return handleServiceError(error, result.error);
 * }
 * ```
 *
 * @example With module-specific overrides
 * ```ts
 * if (!result.success) {
 *   return handleServiceError(error, result.error, {
 *     BELOW_STATUTORY_MINIMUM: 400,
 *   });
 * }
 * ```
 */
export function handleServiceError(
  errorFn: (status: number, body: unknown) => unknown,
  serviceError: ServiceError | unknown,
  moduleOverrides?: Record<string, number>
): never {
  const err = serviceError as ServiceError;
  const status = getHttpStatus(err.code, moduleOverrides);
  return errorFn(status, { error: err }) as never;
}
