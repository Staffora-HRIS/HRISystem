/**
 * Error Handling Plugin
 *
 * Provides standardized error handling and response format.
 * Features:
 * - Standard error response format
 * - Error code mapping
 * - Request ID generation and tracking
 * - Development vs production error details
 */

import { Elysia, type ErrorHandler } from "elysia";
import { AuthError } from "./auth-better";
import { IdempotencyError } from "./idempotency";
import { TenantError } from "./tenant";
import { RbacError } from "./rbac";
import { ErrorCodes as SharedErrorCodes } from "@staffora/shared/errors";

// =============================================================================
// Types
// =============================================================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

/**
 * Error codes used across the application.
 *
 * Inherits all shared error codes from @staffora/shared/errors and extends
 * them with API-specific codes (transport, idempotency, portal, etc.).
 * Consumers should continue to import ErrorCodes from this module — the
 * shared codes are available automatically via the spread.
 */
export const ErrorCodes = {
  // ---- Shared error codes (from @staffora/shared/errors) --------------------
  ...SharedErrorCodes,

  // ---- API-specific codes (not in the shared package) -----------------------

  // Generic transport errors
  BAD_REQUEST: "BAD_REQUEST",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // Authentication (API-only extensions)
  SESSION_INVALID: "SESSION_INVALID",
  ACCOUNT_NOT_VERIFIED: "ACCOUNT_NOT_VERIFIED",
  CSRF_INVALID: "CSRF_INVALID",

  // Tenant (API-only extensions)
  MISSING_TENANT: "MISSING_TENANT",
  INVALID_TENANT: "INVALID_TENANT",
  TENANT_DELETED: "TENANT_DELETED",

  // Authorization (API-only extensions)
  PERMISSION_DENIED: "PERMISSION_DENIED",
  MFA_REQUIRED_FOR_ACTION: "MFA_REQUIRED_FOR_ACTION",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",

  // Business logic (API-only extensions)
  STATE_MACHINE_VIOLATION: "STATE_MACHINE_VIOLATION",
  RESOURCE_IN_USE: "RESOURCE_IN_USE",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",

  // Analytics errors
  INVALID_DATE_RANGE: "INVALID_DATE_RANGE",

  // Portal errors
  PORTAL_ACCESS_DENIED: "PORTAL_ACCESS_DENIED",

  // Domain-specific NOT_FOUND codes (API-only)
  SUCCESSION_PLAN_NOT_FOUND: "SUCCESSION_PLAN_NOT_FOUND",
  NO_EMPLOYEE_RECORD: "NO_EMPLOYEE_RECORD",

  // Conflict/state errors (API-only extensions)
  CANDIDATE_ALREADY_IN_PLAN: "CANDIDATE_ALREADY_IN_PLAN",
  COMPETENCY_ALREADY_ASSIGNED: "COMPETENCY_ALREADY_ASSIGNED",
  DUPLICATE_APPLICATION: "DUPLICATE_APPLICATION",
  LIFE_EVENT_ALREADY_REVIEWED: "LIFE_EVENT_ALREADY_REVIEWED",
  REQUISITION_NOT_OPEN: "REQUISITION_NOT_OPEN",
  INVALID_STAGE_TRANSITION: "INVALID_STAGE_TRANSITION",
  PLAN_INACTIVE: "PLAN_INACTIVE",
  TEMPLATE_INACTIVE: "TEMPLATE_INACTIVE",
  ALREADY_ONBOARDING: "ALREADY_ONBOARDING",
  INSTANCE_CLOSED: "INSTANCE_CLOSED",
  CANNOT_SKIP_REQUIRED: "CANNOT_SKIP_REQUIRED",
  COMPLIANCE_CHECKS_OUTSTANDING: "COMPLIANCE_CHECKS_OUTSTANDING",

  // Idempotency errors
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IDEMPOTENCY_HASH_MISMATCH: "IDEMPOTENCY_HASH_MISMATCH",
  REQUEST_STILL_PROCESSING: "REQUEST_STILL_PROCESSING",

  // Report errors
  REPORT_GENERATION_FAILED: "REPORT_GENERATION_FAILED",

  // Document errors
  VIRUS_DETECTED: "VIRUS_DETECTED",

  // Payroll period lock errors (TODO-234)
  PAYROLL_PERIOD_FINALIZED: "PAYROLL_PERIOD_FINALIZED",
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Map error codes to HTTP status codes.
 *
 * Uses Record<string, number> rather than Record<ErrorCode, number> so that
 * the map doesn't need to be updated every time a new shared error code is
 * added. The lookup in AppError falls back to 500 for unknown codes.
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  // ---------------------------------------------------------------------------
  // 400 Bad Request
  // ---------------------------------------------------------------------------
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  MISSING_TENANT: 400,
  INVALID_TENANT: 400,
  IDEMPOTENCY_HASH_MISMATCH: 400,
  CLOCK_EVENT_OUT_OF_SEQUENCE: 400,
  INVALID_TIME_ENTRY: 400,
  INSUFFICIENT_LEAVE_BALANCE: 400,
  BLACKOUT_PERIOD_VIOLATION: 400,
  INVALID_DATE_RANGE: 400,
  TERMINATION_DATE_BEFORE_HIRE: 400,
  CIRCULAR_REPORTING_LINE: 400,
  PREREQUISITE_NOT_MET: 400,

  // ---------------------------------------------------------------------------
  // 401 Unauthorized
  // ---------------------------------------------------------------------------
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  SESSION_INVALID: 401,
  ACCOUNT_NOT_VERIFIED: 401,

  // ---------------------------------------------------------------------------
  // 403 Forbidden
  // ---------------------------------------------------------------------------
  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  MFA_REQUIRED: 403,
  MFA_INVALID: 403,
  ACCOUNT_SUSPENDED: 403,
  MFA_REQUIRED_FOR_ACTION: 403,
  CSRF_INVALID: 403,
  CONSTRAINT_VIOLATION: 403,
  TENANT_SUSPENDED: 403,
  TENANT_ACCESS_DENIED: 403,
  PORTAL_ACCESS_DENIED: 403,
  RESTRICTED_ACCESS: 403,

  // ---------------------------------------------------------------------------
  // 404 Not Found
  // ---------------------------------------------------------------------------
  NOT_FOUND: 404,
  TENANT_NOT_FOUND: 404,
  TENANT_DELETED: 404,
  EMPLOYEE_NOT_FOUND: 404,
  COURSE_NOT_FOUND: 404,
  POLICY_NOT_FOUND: 404,
  WORKFLOW_NOT_FOUND: 404,
  SUCCESSION_PLAN_NOT_FOUND: 404,
  NO_EMPLOYEE_RECORD: 404,

  // ---------------------------------------------------------------------------
  // 405 Method Not Allowed
  // ---------------------------------------------------------------------------
  METHOD_NOT_ALLOWED: 405,

  // ---------------------------------------------------------------------------
  // 409 Conflict
  // ---------------------------------------------------------------------------
  CONFLICT: 409,
  STATE_MACHINE_VIOLATION: 409,
  EFFECTIVE_DATE_OVERLAP: 409,
  INVALID_LIFECYCLE_TRANSITION: 409,
  RESOURCE_IN_USE: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_STILL_PROCESSING: 409,
  POSITION_ALREADY_FILLED: 409,
  CANDIDATE_ALREADY_EXISTS: 409,
  CANDIDATE_ALREADY_IN_PLAN: 409,
  COMPETENCY_ALREADY_ASSIGNED: 409,
  DUPLICATE_APPLICATION: 409,
  LEAVE_REQUEST_OVERLAP: 409,
  SCHEDULE_CONFLICT: 409,
  TIMESHEET_ALREADY_APPROVED: 409,
  TASK_ALREADY_COMPLETED: 409,
  LIFE_EVENT_ALREADY_REVIEWED: 409,
  ASSIGNMENT_ALREADY_COMPLETED: 409,
  REQUISITION_CLOSED: 409,
  REQUISITION_NOT_OPEN: 409,
  INVALID_STAGE_TRANSITION: 409,
  INVALID_WORKFLOW_TRANSITION: 409,
  PLAN_INACTIVE: 409,
  CASE_CLOSED: 409,
  TEMPLATE_INACTIVE: 409,
  ALREADY_ONBOARDING: 409,
  INSTANCE_CLOSED: 409,
  CANNOT_SKIP_REQUIRED: 409,
  COMPLIANCE_CHECKS_OUTSTANDING: 409,
  ORG_UNIT_HAS_CHILDREN: 409,

  // ---------------------------------------------------------------------------
  // 410 Gone (from shared)
  // ---------------------------------------------------------------------------
  OFFER_EXPIRED: 410,

  // ---------------------------------------------------------------------------
  // 423 Locked
  // ---------------------------------------------------------------------------
  ACCOUNT_LOCKED: 423,

  // ---------------------------------------------------------------------------
  // 429 Too Many Requests
  // ---------------------------------------------------------------------------
  TOO_MANY_REQUESTS: 429,
  LIMIT_EXCEEDED: 429,

  // ---------------------------------------------------------------------------
  // 422 Unprocessable Entity (file is well-formed but rejected)
  // ---------------------------------------------------------------------------
  VIRUS_DETECTED: 422,

  // ---------------------------------------------------------------------------
  // 500 Internal Server Error
  // ---------------------------------------------------------------------------
  INTERNAL_ERROR: 500,
  REPORT_GENERATION_FAILED: 500,

  // ---------------------------------------------------------------------------
  // 503 Service Unavailable
  // ---------------------------------------------------------------------------
  SERVICE_UNAVAILABLE: 503,
};

// =============================================================================
// Custom Errors
// =============================================================================

/**
 * Base application error
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code] || 500;
    this.details = details;
  }
}

/**
 * Validation error with field-level details
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly errors: Array<{
      field: string;
      message: string;
      value?: unknown;
    }>
  ) {
    super("VALIDATION_ERROR", message, { errors });
    this.name = "ValidationError";
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super("NOT_FOUND", message, { resource, identifier });
    this.name = "NotFoundError";
  }
}

/**
 * Conflict error (e.g., duplicate, state violation)
 */
export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(code, message, details);
    this.name = "ConflictError";
  }
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `req_${timestamp}_${random}`;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: unknown
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
      requestId,
    },
  };
}

/**
 * Determine if error details should be shown
 */
function shouldShowDetails(): boolean {
  return process.env["NODE_ENV"] !== "production";
}

/**
 * Extract error details from an error object
 */
function extractErrorDetails(error: unknown): unknown {
  if (!shouldShowDetails()) {
    return undefined;
  }

  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
    };
  }

  return {
    name: error.name,
    stack: error.stack?.split("\n").slice(0, 5),
  };
}

/**
 * Map Elysia validation errors to our format
 */
function mapValidationError(
  error: unknown
): Array<{ field: string; message: string; value?: unknown }> {
  if (!error || typeof error !== "object") {
    return [{ field: "unknown", message: "Validation failed" }];
  }

  const errors: Array<{ field: string; message: string; value?: unknown }> = [];

  // Handle Elysia TypeBox validation errors
  if ("errors" in error && Array.isArray((error as { errors: unknown }).errors)) {
    for (const err of (error as { errors: Array<{ path?: string; message?: string; value?: unknown }> }).errors) {
      errors.push({
        field: err.path || "unknown",
        message: err.message || "Invalid value",
        value: shouldShowDetails() ? err.value : undefined,
      });
    }
  }

  return errors.length > 0 ? errors : [{ field: "unknown", message: "Validation failed" }];
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Error handling plugin for Elysia
 *
 * Provides standardized error responses and request ID tracking.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(errorsPlugin())
 *   .get('/example', () => {
 *     throw new NotFoundError('User', '123');
 *   });
 * ```
 */
export function errorsPlugin() {
  return new Elysia({ name: "errors" })
    // Generate request ID for every request
    .derive({ as: "global" }, () => ({
      requestId: generateRequestId(),
    }))

    .derive({ as: "global" }, (ctx) => {
      const { set } = ctx as any;
      return {
        error: (status: number, body: unknown) => {
          set.status = status;
          return body;
        },
      };
    })

    // Add request ID to response headers
    .onAfterHandle({ as: "global" }, ({ requestId, set, response }) => {
      set.headers["X-Request-ID"] = requestId;

      if (!response || typeof response !== "object") {
        return;
      }

      if (response instanceof Response) {
        return;
      }

      if (!("error" in response)) {
        return;
      }

      const resp = response as any;
      const errObj = resp.error;
      if (!errObj || typeof errObj !== "object") {
        return;
      }

      if (!errObj.requestId) {
        return {
          ...resp,
          error: {
            ...errObj,
            requestId,
          },
        };
      }
    })

    // Global error handler
    .onError({ as: "global" }, ({ error, requestId, set, code: elysiaCode }) => {
      // Add request ID to error response headers
      set.headers["X-Request-ID"] = requestId;

      // Handle our custom errors
      if (error instanceof AppError) {
        set.status = error.statusCode;
        return createErrorResponse(
          error.code,
          error.message,
          requestId,
          error.details
        );
      }

      if (error instanceof IdempotencyError) {
        set.status = error.statusCode;
        return createErrorResponse(
          error.code,
          error.message,
          requestId,
          extractErrorDetails(error)
        );
      }

      // Handle auth errors (e.g., from requireAuthContext beforeHandle guard)
      if (error instanceof AuthError) {
        set.status = error.statusCode;
        return createErrorResponse(error.code, error.message, requestId);
      }

      // Handle tenant errors
      if (error instanceof TenantError) {
        set.status = error.statusCode;
        return createErrorResponse(error.code, error.message, requestId);
      }

      // Handle RBAC errors
      if (error instanceof RbacError) {
        set.status = error.statusCode;
        return createErrorResponse(error.code, error.message, requestId);
      }

      // Handle Elysia built-in errors
      switch (elysiaCode) {
        case "VALIDATION":
          set.status = 400;
          return createErrorResponse(
            "VALIDATION_ERROR",
            "Request validation failed",
            requestId,
            { errors: mapValidationError(error) }
          );

        case "NOT_FOUND":
          set.status = 404;
          return createErrorResponse(
            "NOT_FOUND",
            "The requested resource was not found",
            requestId
          );

        case "PARSE":
          set.status = 400;
          return createErrorResponse(
            "BAD_REQUEST",
            "Failed to parse request body",
            requestId
          );

        case "INVALID_COOKIE_SIGNATURE":
          set.status = 401;
          return createErrorResponse(
            "UNAUTHORIZED",
            "Invalid authentication",
            requestId
          );

        case "UNKNOWN":
        default:
          {
            // Log the error
            console.error(`[${requestId}] Unhandled error:`, error);

            const maybeMessage =
              typeof (error as any)?.message === "string" ? (error as any).message : "";

            set.status = 500;
            return createErrorResponse(
              "INTERNAL_ERROR",
              shouldShowDetails()
                ? maybeMessage || "An unexpected error occurred"
                : "An unexpected error occurred",
              requestId,
              extractErrorDetails(error)
            );
          }
      }
    });
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Assert that a condition is true, or throw a validation error
 */
export function assertValid(
  condition: boolean,
  field: string,
  message: string
): asserts condition {
  if (!condition) {
    throw new ValidationError("Validation failed", [{ field, message }]);
  }
}

/**
 * Assert that a value exists, or throw a not found error
 */
export function assertFound<T>(
  value: T | null | undefined,
  resource: string,
  identifier?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource, identifier);
  }
}

