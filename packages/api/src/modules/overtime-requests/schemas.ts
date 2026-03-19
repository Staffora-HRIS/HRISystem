/**
 * Overtime Requests Module - TypeBox Schemas
 *
 * Defines validation schemas for the Overtime Authorisation Workflow API.
 *
 * State machine:
 *   pending -> approved / rejected / cancelled
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Overtime request type enum matching database type
 */
export const OvertimeRequestTypeSchema = t.Union([
  t.Literal("planned"),
  t.Literal("unplanned"),
  t.Literal("emergency"),
]);

export type OvertimeRequestType = Static<typeof OvertimeRequestTypeSchema>;

/**
 * Overtime authorisation type: pre-approval (before overtime) or post-approval (retroactive).
 */
export const OvertimeAuthorisationTypeSchema = t.Union([
  t.Literal("pre_approval"),
  t.Literal("post_approval"),
]);

export type OvertimeAuthorisationType = Static<typeof OvertimeAuthorisationTypeSchema>;

/**
 * Overtime request status enum matching database type
 */
export const OvertimeRequestStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);

export type OvertimeRequestStatus = Static<typeof OvertimeRequestStatusSchema>;

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
 * Create a new overtime request
 */
export const CreateOvertimeRequestSchema = t.Object({
  employee_id: UuidSchema,
  request_type: t.Optional(OvertimeRequestTypeSchema),
  authorisation_type: t.Optional(OvertimeAuthorisationTypeSchema),
  date: DateSchema,
  planned_hours: t.Number({ minimum: 0.25, maximum: 24 }),
  actual_hours: t.Optional(t.Number({ minimum: 0, maximum: 24 })),
  reason: t.String({ minLength: 1, maxLength: 5000 }),
});

export type CreateOvertimeRequest = Static<typeof CreateOvertimeRequestSchema>;

/**
 * Approve an overtime request
 */
export const ApproveOvertimeRequestSchema = t.Object({
  actual_hours: t.Optional(t.Number({ minimum: 0, maximum: 24 })),
  manager_notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type ApproveOvertimeRequest = Static<typeof ApproveOvertimeRequestSchema>;

/**
 * Reject an overtime request
 */
export const RejectOvertimeRequestSchema = t.Object({
  rejection_reason: t.String({ minLength: 1, maxLength: 5000 }),
  manager_notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type RejectOvertimeRequest = Static<typeof RejectOvertimeRequestSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Overtime request filters for list endpoints
 */
export const OvertimeRequestFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(OvertimeRequestStatusSchema),
  request_type: t.Optional(OvertimeRequestTypeSchema),
  authorisation_type: t.Optional(OvertimeAuthorisationTypeSchema),
  date_from: t.Optional(DateSchema),
  date_to: t.Optional(DateSchema),
});

export type OvertimeRequestFilters = Static<typeof OvertimeRequestFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Overtime request response
 */
export const OvertimeRequestResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  request_type: OvertimeRequestTypeSchema,
  authorisation_type: OvertimeAuthorisationTypeSchema,
  date: t.String(),
  planned_hours: t.Number(),
  actual_hours: t.Union([t.Number(), t.Null()]),
  reason: t.String(),
  status: OvertimeRequestStatusSchema,
  approver_id: t.Union([UuidSchema, t.Null()]),
  approved_at: t.Union([t.String(), t.Null()]),
  rejection_reason: t.Union([t.String(), t.Null()]),
  manager_notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type OvertimeRequestResponse = Static<typeof OvertimeRequestResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Idempotency key header (optional)
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
