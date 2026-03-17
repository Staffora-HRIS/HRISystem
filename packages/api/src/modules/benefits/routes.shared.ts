/**
 * Benefits Module - Shared Route Utilities
 *
 * Shared TypeBox schemas and error maps used across all benefits sub-route files.
 * Extracted to avoid circular dependencies between routes.ts and sub-route modules.
 */

import { t } from "elysia";

/**
 * Success response for delete/action operations
 */
export const SuccessSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

/**
 * UUID schema
 */
export const UuidSchema = t.String({ format: "uuid" });

/**
 * ID params schema
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

/**
 * Idempotency header schema
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

/**
 * Benefits module-specific error codes beyond the shared base set
 */
export const benefitsErrorStatusMap: Record<string, number> = {
  CARRIER_NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  DEPENDENT_NOT_FOUND: 404,
  ENROLLMENT_NOT_FOUND: 404,
  LIFE_EVENT_NOT_FOUND: 404,
  OPEN_ENROLLMENT_NOT_FOUND: 404,
  EMPLOYEE_NOT_FOUND: 404,
  ALREADY_ENROLLED: 409,
  ENROLLMENT_CONFLICT: 409,
  LIFE_EVENT_ALREADY_REVIEWED: 409,
  LIFE_EVENT_EXPIRED: 400,
  OPEN_ENROLLMENT_NOT_ACTIVE: 400,
  WAITING_PERIOD_NOT_MET: 400,
  PLAN_NOT_ELIGIBLE: 400,
  INVALID_COVERAGE_LEVEL: 400,
  INVALID_DEPENDENTS: 400,
};
