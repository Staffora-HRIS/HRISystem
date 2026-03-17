/**
 * Shared Route Helpers
 *
 * Common schemas, response types, and utilities used across route modules.
 * Import from here instead of defining locally in each routes.ts.
 */

import { t } from "elysia";

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Standard error response schema for API responses
 */
export const ErrorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Unknown())),
  }),
});

/**
 * Standard success response for delete operations
 */
export const DeleteSuccessSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

// =============================================================================
// Error Mapping
// =============================================================================

/**
 * Common error code to HTTP status mapping.
 * Module-specific codes should be merged in:
 *
 * ```ts
 * const status = mapErrorToStatus(code, { CUSTOM_CODE: 400 });
 * ```
 */
export function mapErrorToStatus(
  code: string,
  extra?: Record<string, number>
): number {
  const base: Record<string, number> = {
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    VALIDATION_ERROR: 400,
    DUPLICATE_CODE: 409,
    INVALID_TRANSITION: 409,
    EFFECTIVE_DATE_OVERLAP: 409,
    CONFLICT: 409,
    STATE_MACHINE_VIOLATION: 409,
    INTERNAL_ERROR: 500,
    VIRUS_DETECTED: 422,
  };
  const merged = extra ? { ...base, ...extra } : base;
  return merged[code] || 500;
}
