/**
 * Reasonable Adjustments Module - TypeBox Schemas
 *
 * Defines validation schemas for Reasonable Adjustments API endpoints.
 * Equality Act 2010 (ss.20-22) requires employers to make reasonable
 * adjustments for disabled employees.
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Adjustment status enum matching database type `app.adjustment_status`
 */
export const AdjustmentStatusSchema = t.Union([
  t.Literal("requested"),
  t.Literal("under_review"),
  t.Literal("approved"),
  t.Literal("implemented"),
  t.Literal("rejected"),
  t.Literal("withdrawn"),
]);

export type AdjustmentStatus = Static<typeof AdjustmentStatusSchema>;

/**
 * Who requested the adjustment
 */
export const RequestedBySchema = t.Union([
  t.Literal("employee"),
  t.Literal("manager"),
  t.Literal("occupational_health"),
]);

export type RequestedBy = Static<typeof RequestedBySchema>;

/**
 * Adjustment category
 */
export const AdjustmentCategorySchema = t.Union([
  t.Literal("physical_workspace"),
  t.Literal("equipment"),
  t.Literal("working_hours"),
  t.Literal("duties"),
  t.Literal("communication"),
  t.Literal("other"),
]);

export type AdjustmentCategory = Static<typeof AdjustmentCategorySchema>;

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

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create reasonable adjustment request
 */
export const CreateAdjustmentSchema = t.Object({
  employee_id: UuidSchema,
  requested_date: DateSchema,
  requested_by: RequestedBySchema,
  description: t.String({ minLength: 1, maxLength: 5000 }),
  reason: t.Optional(t.String({ maxLength: 5000 })),
  category: AdjustmentCategorySchema,
  review_date: t.Optional(DateSchema),
  cost_estimate: t.Optional(t.Number({ minimum: 0 })),
});

export type CreateAdjustment = Static<typeof CreateAdjustmentSchema>;

/**
 * Assess adjustment request (move from requested/under_review -> under_review)
 */
export const AssessAdjustmentSchema = t.Object({
  assessment_notes: t.String({ minLength: 1, maxLength: 5000 }),
});

export type AssessAdjustment = Static<typeof AssessAdjustmentSchema>;

/**
 * Decide on adjustment (approve or reject)
 */
export const DecideAdjustmentSchema = t.Object({
  decision: t.Union([t.Literal("approved"), t.Literal("rejected")]),
  rejection_reason: t.Optional(t.String({ maxLength: 5000 })),
  review_date: t.Optional(DateSchema),
  cost_estimate: t.Optional(t.Number({ minimum: 0 })),
});

export type DecideAdjustment = Static<typeof DecideAdjustmentSchema>;

/**
 * Implement adjustment (mark as implemented)
 */
export const ImplementAdjustmentSchema = t.Object({
  implementation_notes: t.Optional(t.String({ maxLength: 5000 })),
  actual_cost: t.Optional(t.Number({ minimum: 0 })),
  review_date: t.Optional(DateSchema),
});

export type ImplementAdjustment = Static<typeof ImplementAdjustmentSchema>;

/**
 * Filters for list endpoint
 */
export const AdjustmentFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(AdjustmentStatusSchema),
  category: t.Optional(AdjustmentCategorySchema),
  requested_by: t.Optional(RequestedBySchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type AdjustmentFilters = Static<typeof AdjustmentFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Adjustment response (full detail)
 */
export const AdjustmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  requested_date: t.String(),
  requested_by: t.String(),
  description: t.String(),
  reason: t.Union([t.String(), t.Null()]),
  category: t.String(),
  status: AdjustmentStatusSchema,
  assessment_date: t.Union([t.String(), t.Null()]),
  assessed_by: t.Union([UuidSchema, t.Null()]),
  assessment_notes: t.Union([t.String(), t.Null()]),
  decision_date: t.Union([t.String(), t.Null()]),
  decided_by: t.Union([UuidSchema, t.Null()]),
  rejection_reason: t.Union([t.String(), t.Null()]),
  implementation_date: t.Union([t.String(), t.Null()]),
  implementation_notes: t.Union([t.String(), t.Null()]),
  review_date: t.Union([t.String(), t.Null()]),
  cost_estimate: t.Union([t.Number(), t.Null()]),
  actual_cost: t.Union([t.Number(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type AdjustmentResponse = Static<typeof AdjustmentResponseSchema>;

/**
 * Adjustment list item (summary)
 */
export const AdjustmentListItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  requested_date: t.String(),
  requested_by: t.String(),
  description: t.String(),
  category: t.String(),
  status: AdjustmentStatusSchema,
  review_date: t.Union([t.String(), t.Null()]),
  cost_estimate: t.Union([t.Number(), t.Null()]),
  created_at: t.String(),
});

export type AdjustmentListItem = Static<typeof AdjustmentListItemSchema>;

/**
 * Adjustment list response (paginated)
 */
export const AdjustmentListResponseSchema = t.Object({
  items: t.Array(AdjustmentListItemSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  total: t.Optional(t.Number()),
});

export type AdjustmentListResponse = Static<typeof AdjustmentListResponseSchema>;

/**
 * Due review item
 */
export const DueReviewItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  description: t.String(),
  category: t.String(),
  review_date: t.String(),
  implementation_date: t.Union([t.String(), t.Null()]),
  days_overdue: t.Number(),
});

export type DueReviewItem = Static<typeof DueReviewItemSchema>;
