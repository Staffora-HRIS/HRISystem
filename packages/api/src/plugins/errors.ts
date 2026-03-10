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
 * Error codes used across the application
 */
export const ErrorCodes = {
  // Generic errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_INVALID: "SESSION_INVALID",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_INVALID: "MFA_INVALID",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_NOT_VERIFIED: "ACCOUNT_NOT_VERIFIED",
  CSRF_INVALID: "CSRF_INVALID",

  // Tenant errors
  MISSING_TENANT: "MISSING_TENANT",
  INVALID_TENANT: "INVALID_TENANT",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  TENANT_SUSPENDED: "TENANT_SUSPENDED",
  TENANT_DELETED: "TENANT_DELETED",

  // Authorization errors
  FORBIDDEN: "FORBIDDEN",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  MFA_REQUIRED_FOR_ACTION: "MFA_REQUIRED_FOR_ACTION",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",

  // Business logic errors
  STATE_MACHINE_VIOLATION: "STATE_MACHINE_VIOLATION",
  EFFECTIVE_DATE_OVERLAP: "EFFECTIVE_DATE_OVERLAP",
  INVALID_LIFECYCLE_TRANSITION: "INVALID_LIFECYCLE_TRANSITION",
  RESOURCE_IN_USE: "RESOURCE_IN_USE",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",

  // Idempotency errors
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IDEMPOTENCY_HASH_MISMATCH: "IDEMPOTENCY_HASH_MISMATCH",
  REQUEST_STILL_PROCESSING: "REQUEST_STILL_PROCESSING",
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Map error codes to HTTP status codes
 */
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  // 400 Bad Request
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  MISSING_TENANT: 400,
  INVALID_TENANT: 400,
  IDEMPOTENCY_HASH_MISMATCH: 400,

  // 401 Unauthorized
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  SESSION_INVALID: 401,
  ACCOUNT_NOT_VERIFIED: 401,

  // 403 Forbidden
  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  MFA_REQUIRED: 403,
  MFA_INVALID: 403,
  ACCOUNT_SUSPENDED: 403,
  MFA_REQUIRED_FOR_ACTION: 403,
  CSRF_INVALID: 403,
  CONSTRAINT_VIOLATION: 403,
  TENANT_SUSPENDED: 403,

  // 404 Not Found
  NOT_FOUND: 404,
  TENANT_NOT_FOUND: 404,
  TENANT_DELETED: 404,

  // 405 Method Not Allowed
  METHOD_NOT_ALLOWED: 405,

  // 409 Conflict
  CONFLICT: 409,
  STATE_MACHINE_VIOLATION: 409,
  EFFECTIVE_DATE_OVERLAP: 409,
  INVALID_LIFECYCLE_TRANSITION: 409,
  RESOURCE_IN_USE: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_STILL_PROCESSING: 409,

  // 429 Too Many Requests
  TOO_MANY_REQUESTS: 429,
  LIMIT_EXCEEDED: 429,

  // 500 Internal Server Error
  INTERNAL_ERROR: 500,

  // 503 Service Unavailable
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

