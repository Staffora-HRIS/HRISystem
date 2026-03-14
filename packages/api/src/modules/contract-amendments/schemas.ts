/**
 * Contract Amendments Module - TypeBox Schemas
 *
 * Defines validation schemas for contract amendment API endpoints.
 * Tracks amendments to employment contracts and notification compliance
 * per the Employment Rights Act 1996, s.4.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Amendment type enum matching database varchar constraint.
 * Covers common categories of contract change.
 */
export const AmendmentTypeSchema = t.Union([
  t.Literal("hours_change"),
  t.Literal("role_change"),
  t.Literal("location_change"),
  t.Literal("pay_change"),
  t.Literal("benefits_change"),
  t.Literal("reporting_line"),
  t.Literal("other"),
]);

export type AmendmentType = Static<typeof AmendmentTypeSchema>;

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
 * Create contract amendment request.
 *
 * The caller must supply employee_id, contract_id, the type and description
 * of the amendment, the effective_date, and the notification_date.
 * The DB enforces that notification_date <= effective_date - 1 month.
 */
export const CreateContractAmendmentSchema = t.Object({
  employee_id: UuidSchema,
  contract_id: UuidSchema,
  amendment_type: AmendmentTypeSchema,
  description: t.String({ minLength: 1, maxLength: 5000 }),
  effective_date: DateSchema,
  notification_date: DateSchema,
});

export type CreateContractAmendment = Static<typeof CreateContractAmendmentSchema>;

/**
 * Update contract amendment request.
 * All fields optional (partial update).
 * Only allowed while amendment has not been acknowledged.
 */
export const UpdateContractAmendmentSchema = t.Partial(
  t.Object({
    amendment_type: AmendmentTypeSchema,
    description: t.String({ minLength: 1, maxLength: 5000 }),
    effective_date: DateSchema,
    notification_date: DateSchema,
  })
);

export type UpdateContractAmendment = Static<typeof UpdateContractAmendmentSchema>;

/**
 * Status transition request.
 *
 * Supported actions:
 * - "send_notification": mark notification_sent = true
 * - "acknowledge": mark acknowledged_by_employee = true with timestamp
 */
export const AmendmentStatusTransitionSchema = t.Object({
  action: t.Union([
    t.Literal("send_notification"),
    t.Literal("acknowledge"),
  ]),
});

export type AmendmentStatusTransition = Static<typeof AmendmentStatusTransitionSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Contract amendment response (full detail)
 */
export const ContractAmendmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  contract_id: UuidSchema,
  amendment_type: t.String(),
  description: t.String(),
  effective_date: t.String(),
  notification_date: t.String(),
  notification_sent: t.Boolean(),
  acknowledged_by_employee: t.Boolean(),
  acknowledged_at: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type ContractAmendmentResponse = Static<typeof ContractAmendmentResponseSchema>;

/**
 * Paginated list response
 */
export const ContractAmendmentListResponseSchema = t.Object({
  items: t.Array(ContractAmendmentResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ContractAmendmentListResponse = Static<typeof ContractAmendmentListResponseSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing contract amendments
 */
export const ContractAmendmentFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  contract_id: t.Optional(UuidSchema),
  amendment_type: t.Optional(AmendmentTypeSchema),
  notification_sent: t.Optional(t.Boolean()),
  acknowledged: t.Optional(t.Boolean()),
  effective_date_from: t.Optional(DateSchema),
  effective_date_to: t.Optional(DateSchema),
});

export type ContractAmendmentFilters = Static<typeof ContractAmendmentFiltersSchema>;

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
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
