/**
 * Standardized PostgreSQL Error to ServiceResult Conversion
 *
 * Provides a shared utility for converting caught exceptions (especially
 * PostgreSQL errors) into typed ServiceResult failures. This eliminates
 * repetitive try/catch boilerplate across service modules and ensures
 * consistent, actionable error codes are returned to callers.
 *
 * PostgreSQL error codes handled:
 * - 23505: Unique violation       -> CONFLICT
 * - 23503: Foreign key violation   -> VALIDATION_ERROR
 * - 23514: Check constraint        -> VALIDATION_ERROR
 * - 23502: Not-null violation      -> VALIDATION_ERROR
 * - 42501: Insufficient privilege  -> FORBIDDEN (RLS denial)
 * - 40001: Serialization failure   -> CONFLICT (retry)
 * - 40P01: Deadlock detected       -> CONFLICT (retry)
 *
 * Usage:
 * ```ts
 * import { handleServiceError, withServiceErrorHandling, notFound } from "../../lib/service-errors";
 *
 * // Option A: manual catch
 * try {
 *   const result = await repo.create(ctx, data);
 *   return { success: true, data: result };
 * } catch (error) {
 *   return handleServiceError(error, "creating employee");
 * }
 *
 * // Option B: wrapper (preferred)
 * return withServiceErrorHandling("creating employee", async () => {
 *   const result = await repo.create(ctx, data);
 *   return { success: true, data: result };
 * });
 *
 * // Option C: custom PG code overrides
 * return withServiceErrorHandling("enrolling employee", async () => {
 *   const result = await repo.enroll(ctx, data);
 *   return { success: true, data: result };
 * }, {
 *   "23505": { code: "ALREADY_ENROLLED", message: "Employee is already enrolled in this course" },
 * });
 *
 * // Not-found helper
 * const employee = await repo.getById(ctx, id);
 * if (!employee) return notFound("Employee");
 * ```
 */

import { logger } from "./logger";
import { ErrorCodes } from "@staffora/shared/errors";

// =============================================================================
// Types
// =============================================================================

/**
 * Error payload within a ServiceResult failure.
 * Matches the shape used by ServiceResult in types/service-result.ts.
 */
export type ServiceError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Discriminated union for service operation outcomes.
 * Re-exported here for convenience so consumers can import from one place.
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

/**
 * The failure branch of a ServiceResult, useful for typing catch-block returns.
 */
export type ServiceFailure = { success: false; error: ServiceError };

/**
 * Override mapping: PG SQLSTATE code -> custom application error.
 * Used to map specific constraint violations to domain-specific error codes.
 */
export type PgErrorOverrides = Record<string, { code: string; message: string }>;

// =============================================================================
// PostgreSQL Error Mapping
// =============================================================================

/**
 * Shape of a postgres.js error object.
 * postgres.js surfaces the PG wire-protocol error fields as plain properties.
 */
interface PostgresError {
  code: string;
  detail?: string;
  constraint?: string;
  message?: string;
  table?: string;
  column?: string;
  schema?: string;
}

/**
 * Mapping from PostgreSQL SQLSTATE codes to application error codes.
 *
 * Reference: https://www.postgresql.org/docs/16/errcodes-appendix.html
 */
const PG_ERROR_MAP: Record<string, { code: string; messagePrefix: string }> = {
  // Class 23 - Integrity Constraint Violation
  "23505": { code: ErrorCodes.CONFLICT, messagePrefix: "Duplicate entry" },
  "23503": { code: ErrorCodes.VALIDATION_ERROR, messagePrefix: "Referenced record not found" },
  "23514": { code: ErrorCodes.VALIDATION_ERROR, messagePrefix: "Validation failed" },
  "23502": { code: ErrorCodes.VALIDATION_ERROR, messagePrefix: "Required field missing" },

  // Class 42 - Syntax / Access Rule Violation
  "42501": { code: ErrorCodes.FORBIDDEN, messagePrefix: "Access denied" },

  // Class 40 - Transaction Rollback
  "40001": { code: ErrorCodes.CONFLICT, messagePrefix: "Concurrent modification detected" },
  "40P01": { code: ErrorCodes.CONFLICT, messagePrefix: "Operation deadlocked, please retry" },
};

// =============================================================================
// Guards
// =============================================================================

/**
 * Type guard for PostgreSQL error objects from postgres.js.
 * These are plain objects with a string `code` property that matches
 * a 5-character SQLSTATE code pattern.
 */
function isPostgresError(error: unknown): error is PostgresError {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as PostgresError).code === "string"
  );
}

/**
 * Check whether a caught error is a PostgreSQL unique violation (23505).
 * Useful when a service wants to detect a specific constraint and return
 * a domain-specific error code before falling through to generic handling.
 *
 * @param error - The caught exception
 * @param constraintName - Optional: only return true if the violation is on this specific constraint
 */
export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (!isPostgresError(error) || error.code !== "23505") {
    return false;
  }
  if (constraintName && error.constraint !== constraintName) {
    return false;
  }
  return true;
}

/**
 * Check whether a caught error is a PostgreSQL foreign key violation (23503).
 *
 * @param error - The caught exception
 * @param constraintName - Optional: only return true if the violation is on this specific constraint
 */
export function isForeignKeyViolation(error: unknown, constraintName?: string): boolean {
  if (!isPostgresError(error) || error.code !== "23503") {
    return false;
  }
  if (constraintName && error.constraint !== constraintName) {
    return false;
  }
  return true;
}

// =============================================================================
// Convenience Builders
// =============================================================================

/**
 * Build a NOT_FOUND ServiceResult failure.
 *
 * @param resource - Human-readable name of the resource (e.g. "Employee", "Course")
 * @returns A ServiceResult failure with code NOT_FOUND
 */
export function notFound<T>(resource: string): ServiceResult<T> {
  return {
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `${resource} not found`,
    },
  };
}

/**
 * Build a generic ServiceResult failure with a custom code and message.
 *
 * @param code - Application error code
 * @param message - Human-readable error message
 * @param details - Optional additional details
 */
export function serviceFailure<T>(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ServiceResult<T> {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

/**
 * Build a success ServiceResult.
 *
 * @param data - The result data
 */
export function serviceSuccess<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

// =============================================================================
// Core Error Handler
// =============================================================================

/**
 * Convert a caught error into a ServiceResult failure.
 *
 * Inspects the error for a PostgreSQL SQLSTATE `code` property. If the code
 * maps to a known application error, returns a structured failure with the
 * mapped code and a human-readable message. Otherwise falls back to a
 * generic INTERNAL_ERROR.
 *
 * The `operation` parameter is used to build a contextual fallback message
 * (e.g. "Failed creating employee: ...") and is included in structured logs.
 *
 * @param error - The caught exception (unknown type)
 * @param operation - Human-readable description of the operation that failed
 * @param overrides - Optional: map of PG SQLSTATE codes to custom error responses.
 *                    When a PG error matches an override, the override's code/message
 *                    are used instead of the default PG_ERROR_MAP entry.
 * @returns A ServiceResult failure with an appropriate error code
 */
export function handleServiceError<T>(
  error: unknown,
  operation: string,
  overrides?: PgErrorOverrides,
): ServiceResult<T> {
  // Handle PostgreSQL errors
  if (isPostgresError(error)) {
    // Check caller-supplied overrides first
    if (overrides && error.code in overrides) {
      const override = overrides[error.code]!;

      logger.warn(
        { pgCode: error.code, constraint: error.constraint, operation },
        `PostgreSQL error during ${operation}: ${override.code} (overridden)`,
      );

      return {
        success: false,
        error: {
          code: override.code,
          message: override.message,
          details: error.constraint ? { constraint: error.constraint } : undefined,
        },
      };
    }

    // Fall back to default PG error map
    const mapped = PG_ERROR_MAP[error.code];

    if (mapped) {
      logger.warn(
        { pgCode: error.code, constraint: error.constraint, operation },
        `PostgreSQL error during ${operation}: ${mapped.code}`,
      );

      return {
        success: false,
        error: {
          code: mapped.code,
          message: `${mapped.messagePrefix}: ${error.detail || error.message || operation}`,
          details: error.constraint ? { constraint: error.constraint } : undefined,
        },
      };
    }

    // Unknown PG error code -- log at error level but still return structured result
    logger.error(
      { pgCode: error.code, detail: error.detail, operation },
      `Unhandled PostgreSQL error during ${operation}`,
    );
  } else {
    // Non-PG error -- log the full error
    logger.error(
      { err: error, operation },
      `Unexpected error during ${operation}`,
    );
  }

  // Generic error fallback
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: `Failed ${operation}: ${message}`,
    },
  };
}

// =============================================================================
// Wrapper
// =============================================================================

/**
 * Wrap an async service operation with standardized error handling.
 *
 * Executes the provided function and, if it throws, converts the exception
 * into a ServiceResult failure using `handleServiceError`.
 *
 * The wrapped function should return a ServiceResult itself (for the success
 * path). This wrapper only catches unexpected exceptions -- explicit business
 * logic failures should be returned as `{ success: false, ... }` from within
 * the function.
 *
 * @param operation - Human-readable description of the operation (for logs/messages)
 * @param fn - Async function that returns a ServiceResult
 * @param overrides - Optional: map of PG SQLSTATE codes to custom error responses
 * @returns The ServiceResult from the function, or a failure if it throws
 *
 * @example
 * ```ts
 * async createEmployee(ctx: TenantContext, input: CreateEmployee): Promise<ServiceResult<Employee>> {
 *   return withServiceErrorHandling("creating employee", async () => {
 *     // Business validation (returned, not thrown)
 *     if (await this.repo.emailExists(ctx, input.email)) {
 *       return serviceFailure("CONFLICT", "Email already in use");
 *     }
 *     // DB write (may throw PG errors)
 *     const employee = await this.repo.create(ctx, input);
 *     return serviceSuccess(employee);
 *   });
 * }
 * ```
 */
export async function withServiceErrorHandling<T>(
  operation: string,
  fn: () => Promise<ServiceResult<T>>,
  overrides?: PgErrorOverrides,
): Promise<ServiceResult<T>> {
  try {
    return await fn();
  } catch (error) {
    return handleServiceError(error, operation, overrides);
  }
}
