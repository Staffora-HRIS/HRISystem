/**
 * Error Module
 *
 * Centralized error handling utilities for the HRIS platform.
 * Provides error codes, messages, and helper functions for creating
 * standardized error responses.
 */

export * from "./codes";
export * from "./messages";

import { type ErrorCode } from "./codes";
import { getErrorMessage } from "./messages";

/**
 * Standard error details structure used in API responses
 */
export interface ErrorDetails {
  /** The error code identifier */
  code: ErrorCode | string;
  /** Human-readable error message */
  message: string;
  /** Optional additional error details */
  details?: Record<string, unknown>;
  /** Optional field-level validation errors */
  fieldErrors?: Record<string, string[]>;
  /** Request ID for tracing */
  requestId?: string;
  /** HTTP status code */
  statusCode?: number;
}

/**
 * Application error class with structured error information
 */
export class AppError extends Error {
  public readonly code: ErrorCode | string;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;
  public readonly fieldErrors: Record<string, string[]> | undefined;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode | string,
    options: {
      message?: string;
      statusCode?: number;
      details?: Record<string, unknown>;
      fieldErrors?: Record<string, string[]>;
      cause?: Error;
      isOperational?: boolean;
    } = {}
  ) {
    const message = options.message || getErrorMessage(code);
    super(message, { cause: options.cause });

    this.name = "AppError";
    this.code = code;
    this.statusCode = options.statusCode || mapCodeToStatusCode(code);
    this.details = options.details;
    this.fieldErrors = options.fieldErrors;
    this.isOperational = options.isOperational ?? true;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Convert the error to a plain object for API responses
   */
  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
      ...(this.fieldErrors && { fieldErrors: this.fieldErrors }),
      statusCode: this.statusCode,
    };
  }
}

/**
 * Create a standardized error object
 *
 * @param code - The error code
 * @param options - Additional error options
 * @returns A new AppError instance
 *
 * @example
 * ```typescript
 * throw createError(ErrorCodes.NOT_FOUND, {
 *   message: "Employee not found",
 *   details: { employeeId: "123" }
 * });
 * ```
 */
export function createError(
  code: ErrorCode | string,
  options: {
    message?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    fieldErrors?: Record<string, string[]>;
    cause?: Error;
    isOperational?: boolean;
  } = {}
): AppError {
  return new AppError(code, options);
}

/**
 * Create a validation error with field-level details
 *
 * @param fieldErrors - Object mapping field names to error messages
 * @param message - Optional custom message
 * @returns A new AppError instance for validation errors
 *
 * @example
 * ```typescript
 * throw createValidationError({
 *   email: ["Invalid email format"],
 *   name: ["Name is required", "Name must be at least 2 characters"]
 * });
 * ```
 */
export function createValidationError(
  fieldErrors: Record<string, string[]>,
  message?: string
): AppError {
  return new AppError("VALIDATION_ERROR", {
    message: message || "Validation failed. Please check your input.",
    statusCode: 400,
    fieldErrors,
  });
}

/**
 * Create a not found error
 *
 * @param resourceType - The type of resource that was not found
 * @param resourceId - The identifier of the resource
 * @returns A new AppError instance for not found errors
 *
 * @example
 * ```typescript
 * throw createNotFoundError("Employee", "emp_123");
 * ```
 */
export function createNotFoundError(
  resourceType: string,
  resourceId?: string
): AppError {
  const message = resourceId
    ? `${resourceType} with ID '${resourceId}' was not found.`
    : `${resourceType} was not found.`;

  return new AppError("NOT_FOUND", {
    message,
    statusCode: 404,
    details: { resourceType, resourceId },
  });
}

/**
 * Create a forbidden error
 *
 * @param action - The action that was forbidden
 * @param resource - The resource the action was attempted on
 * @returns A new AppError instance for forbidden errors
 *
 * @example
 * ```typescript
 * throw createForbiddenError("delete", "employee");
 * ```
 */
export function createForbiddenError(
  action?: string,
  resource?: string
): AppError {
  const message =
    action && resource
      ? `You do not have permission to ${action} this ${resource}.`
      : "You do not have permission to perform this action.";

  return new AppError("FORBIDDEN", {
    message,
    statusCode: 403,
    details: { action, resource },
  });
}

/**
 * Create an unauthorized error
 *
 * @param message - Optional custom message
 * @returns A new AppError instance for unauthorized errors
 */
export function createUnauthorizedError(message?: string): AppError {
  return new AppError("UNAUTHORIZED", {
    message: message || "Authentication is required.",
    statusCode: 401,
  });
}

/**
 * Create a conflict error
 *
 * @param message - Description of the conflict
 * @param details - Additional details about the conflict
 * @returns A new AppError instance for conflict errors
 */
export function createConflictError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  return new AppError("CONFLICT", {
    message,
    statusCode: 409,
    ...(details ? { details } : {}),
  });
}

/**
 * Check if an error is an AppError instance
 *
 * @param error - The error to check
 * @returns True if the error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if an error is operational (expected) vs programming error
 *
 * @param error - The error to check
 * @returns True if the error is operational
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * Map error codes to HTTP status codes
 */
function mapCodeToStatusCode(code: ErrorCode | string): number {
  const statusCodeMap: Record<string, number> = {
    // 400 Bad Request
    VALIDATION_ERROR: 400,
    INVALID_TIME_ENTRY: 400,
    EFFECTIVE_DATE_OVERLAP: 400,
    TERMINATION_DATE_BEFORE_HIRE: 400,
    CIRCULAR_REPORTING_LINE: 400,
    LEAVE_REQUEST_OVERLAP: 400,
    CLOCK_EVENT_OUT_OF_SEQUENCE: 400,
    INVALID_WORKFLOW_TRANSITION: 400,
    INVALID_LIFECYCLE_TRANSITION: 400,
    PREREQUISITE_NOT_MET: 400,

    // 401 Unauthorized
    UNAUTHORIZED: 401,
    INVALID_CREDENTIALS: 401,
    SESSION_EXPIRED: 401,
    MFA_REQUIRED: 401,
    MFA_INVALID: 401,

    // 403 Forbidden
    FORBIDDEN: 403,
    ACCOUNT_LOCKED: 403,
    ACCOUNT_SUSPENDED: 403,
    TENANT_SUSPENDED: 403,
    TENANT_ACCESS_DENIED: 403,
    RESTRICTED_ACCESS: 403,
    BLACKOUT_PERIOD_VIOLATION: 403,
    INSUFFICIENT_LEAVE_BALANCE: 403,

    // 404 Not Found
    NOT_FOUND: 404,
    TENANT_NOT_FOUND: 404,
    EMPLOYEE_NOT_FOUND: 404,
    POLICY_NOT_FOUND: 404,
    WORKFLOW_NOT_FOUND: 404,
    COURSE_NOT_FOUND: 404,

    // 409 Conflict
    CONFLICT: 409,
    POSITION_ALREADY_FILLED: 409,
    CANDIDATE_ALREADY_EXISTS: 409,
    TIMESHEET_ALREADY_APPROVED: 409,
    TASK_ALREADY_COMPLETED: 409,
    ASSIGNMENT_ALREADY_COMPLETED: 409,
    SCHEDULE_CONFLICT: 409,
    ORG_UNIT_HAS_CHILDREN: 409,

    // 410 Gone
    REQUISITION_CLOSED: 410,
    OFFER_EXPIRED: 410,
    CASE_CLOSED: 410,

    // 500 Internal Server Error
    INTERNAL_ERROR: 500,

    // 503 Service Unavailable
    SERVICE_UNAVAILABLE: 503,
  };

  return statusCodeMap[code] || 500;
}
