/**
 * Carer's Leave Module - TypeBox Schemas
 *
 * Validation schemas for the Carer's Leave API endpoints.
 * Based on the Carer's Leave Act 2023 (c. 18):
 *   - Day-one right from April 2024
 *   - 1 week (5 days) unpaid leave per rolling 12-month period
 *   - Can be taken as individual days or half days
 *   - For employees with dependants requiring long-term care
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID schema
 */
export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

/**
 * Date string schema (YYYY-MM-DD)
 */
export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

/**
 * Cursor pagination schema
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Entitlement Status Enum
// =============================================================================

/**
 * Entitlement request status.
 * Entitlement records track annual usage; leave requests under the entitlement
 * go through an approval workflow.
 */
export const EntitlementStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
]);

export type EntitlementStatus = Static<typeof EntitlementStatusSchema>;

// =============================================================================
// Create Entitlement
// =============================================================================

/**
 * Create a carer's leave entitlement record for an employee.
 * Typically created once per leave year.
 */
export const CreateEntitlementSchema = t.Object({
  employee_id: UuidSchema,
  leave_year_start: DateSchema,
  leave_year_end: DateSchema,
  total_days_available: t.Optional(
    t.Number({ minimum: 0.5, maximum: 5, default: 5 })
  ),
});

export type CreateEntitlement = Static<typeof CreateEntitlementSchema>;

// =============================================================================
// Update Entitlement
// =============================================================================

/**
 * Update an existing entitlement (e.g. adjust total for part-time workers,
 * or manually correct days_used).
 */
export const UpdateEntitlementSchema = t.Object({
  total_days_available: t.Optional(
    t.Number({ minimum: 0.5, maximum: 10 })
  ),
  days_used: t.Optional(t.Number({ minimum: 0, maximum: 10 })),
});

export type UpdateEntitlement = Static<typeof UpdateEntitlementSchema>;

// =============================================================================
// Status Transition (Approve / Reject)
// =============================================================================

/**
 * Approve or reject an entitlement usage request.
 * Note: The Carer's Leave Act 2023 only allows employers to postpone
 * leave in specific circumstances, not refuse it outright.
 */
export const StatusTransitionSchema = t.Object({
  status: t.Union([t.Literal("approved"), t.Literal("rejected")]),
  reason: t.Optional(t.String({ maxLength: 500 })),
  days_to_deduct: t.Optional(t.Number({ minimum: 0.5, maximum: 5 })),
});

export type StatusTransition = Static<typeof StatusTransitionSchema>;

// =============================================================================
// Entitlement Response
// =============================================================================

/**
 * Entitlement record as returned from the API.
 */
export const EntitlementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  leave_year_start: t.String(),
  leave_year_end: t.String(),
  total_days_available: t.Number(),
  days_used: t.Number(),
  days_remaining: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type EntitlementResponse = Static<typeof EntitlementResponseSchema>;

// =============================================================================
// Entitlement List Response
// =============================================================================

/**
 * Paginated list of entitlements.
 */
export const EntitlementListResponseSchema = t.Object({
  items: t.Array(EntitlementResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type EntitlementListResponse = Static<
  typeof EntitlementListResponseSchema
>;

// =============================================================================
// Filters
// =============================================================================

/**
 * Filters for listing entitlements.
 */
export const EntitlementFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  leave_year_start: t.Optional(DateSchema),
  has_remaining: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type EntitlementFilters = Static<typeof EntitlementFiltersSchema>;

// =============================================================================
// Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(
    t.String({ minLength: 1, maxLength: 100 })
  ),
});

export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;
