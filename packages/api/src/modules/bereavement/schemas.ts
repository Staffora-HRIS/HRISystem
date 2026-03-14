/**
 * Parental Bereavement Leave Module - TypeBox Schemas
 *
 * Defines validation schemas for all Parental Bereavement Leave API endpoints.
 * Implements the Parental Bereavement (Leave and Pay) Act 2018 ("Jack's Law").
 *
 * Key rules:
 * - Bereaved parents entitled to 2 weeks' leave
 * - Can be taken as 1 block of 2 weeks, or 2 separate blocks of 1 week
 * - Must be taken within 56 weeks of the child's death
 * - Available from day one of employment
 * - SPBP requires 26 weeks continuous employment and earnings above LEL
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Parental bereavement leave status enum matching database type
 * app.parental_bereavement_status
 */
export const BereavementStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("active"),
  t.Literal("completed"),
]);

export type BereavementStatus = Static<typeof BereavementStatusSchema>;

/**
 * Valid status transitions for parental bereavement leave:
 *   pending -> approved
 *   pending -> rejected (logical — handled by service as rejection)
 *   approved -> active
 *   active -> completed
 */

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
// Request Schemas
// =============================================================================

/**
 * Create parental bereavement leave request
 */
export const CreateBereavementLeaveSchema = t.Object({
  employee_id: UuidSchema,
  child_name: t.String({ minLength: 1, maxLength: 255 }),
  date_of_death: DateSchema,
  leave_start_date: DateSchema,
  leave_end_date: DateSchema,
  spbp_eligible: t.Optional(t.Boolean({ default: false })),
  spbp_rate_weekly: t.Optional(t.Number({ minimum: 0 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateBereavementLeave = Static<typeof CreateBereavementLeaveSchema>;

/**
 * Update parental bereavement leave request
 */
export const UpdateBereavementLeaveSchema = t.Partial(
  t.Object({
    child_name: t.String({ minLength: 1, maxLength: 255 }),
    date_of_death: DateSchema,
    leave_start_date: DateSchema,
    leave_end_date: DateSchema,
    spbp_eligible: t.Boolean(),
    spbp_rate_weekly: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);

export type UpdateBereavementLeave = Static<typeof UpdateBereavementLeaveSchema>;

/**
 * Status transition request (approve/reject)
 */
export const BereavementStatusTransitionSchema = t.Object({
  status: t.Union([
    t.Literal("approved"),
    t.Literal("active"),
    t.Literal("completed"),
  ]),
  reason: t.Optional(t.String({ maxLength: 500 })),
});

export type BereavementStatusTransition = Static<typeof BereavementStatusTransitionSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Parental bereavement leave response
 */
export const BereavementLeaveResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  child_name: t.String(),
  date_of_death: t.String(),
  leave_start_date: t.String(),
  leave_end_date: t.String(),
  spbp_eligible: t.Boolean(),
  spbp_rate_weekly: t.Union([t.Number(), t.Null()]),
  status: BereavementStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type BereavementLeaveResponse = Static<typeof BereavementLeaveResponseSchema>;

/**
 * Paginated list response
 */
export const BereavementLeaveListResponseSchema = t.Object({
  items: t.Array(BereavementLeaveResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type BereavementLeaveListResponse = Static<typeof BereavementLeaveListResponseSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for list endpoint
 */
export const BereavementLeaveFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(BereavementStatusSchema),
  date_of_death_from: t.Optional(DateSchema),
  date_of_death_to: t.Optional(DateSchema),
});

export type BereavementLeaveFilters = Static<typeof BereavementLeaveFiltersSchema>;

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
// Header Schemas
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
