/**
 * Secondment Module - TypeBox Schemas
 *
 * Defines validation schemas for secondment management API endpoints.
 * Tables: secondments
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const SecondmentStatusSchema = t.Union([
  t.Literal("proposed"),
  t.Literal("approved"),
  t.Literal("active"),
  t.Literal("extended"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type SecondmentStatus = Static<typeof SecondmentStatusSchema>;

// =============================================================================
// Secondment Schemas
// =============================================================================

export const CreateSecondmentSchema = t.Object({
  employee_id: UuidSchema,
  from_org_unit_id: UuidSchema,
  to_org_unit_id: UuidSchema,
  to_external_org: t.Optional(t.String({ maxLength: 255 })),
  start_date: DateSchema,
  expected_end_date: DateSchema,
  reason: t.Optional(t.String({ maxLength: 5000 })),
  terms: t.Optional(t.String({ maxLength: 10000 })),
});
export type CreateSecondment = Static<typeof CreateSecondmentSchema>;

export const UpdateSecondmentSchema = t.Partial(
  t.Object({
    to_org_unit_id: UuidSchema,
    to_external_org: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    start_date: DateSchema,
    expected_end_date: DateSchema,
    actual_end_date: t.Union([DateSchema, t.Null()]),
    reason: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    terms: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
  })
);
export type UpdateSecondment = Static<typeof UpdateSecondmentSchema>;

export const SecondmentStatusTransitionSchema = t.Object({
  status: SecondmentStatusSchema,
  actual_end_date: t.Optional(DateSchema),
  expected_end_date: t.Optional(DateSchema),
});
export type SecondmentStatusTransition = Static<typeof SecondmentStatusTransitionSchema>;

export const SecondmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  from_org_unit_id: UuidSchema,
  from_org_unit_name: t.Optional(t.String()),
  to_org_unit_id: UuidSchema,
  to_org_unit_name: t.Optional(t.String()),
  to_external_org: t.Union([t.String(), t.Null()]),
  start_date: t.String(),
  expected_end_date: t.String(),
  actual_end_date: t.Union([t.String(), t.Null()]),
  reason: t.Union([t.String(), t.Null()]),
  terms: t.Union([t.String(), t.Null()]),
  status: SecondmentStatusSchema,
  approved_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});
export type SecondmentResponse = Static<typeof SecondmentResponseSchema>;

export const SecondmentFiltersSchema = t.Object({
  status: t.Optional(SecondmentStatusSchema),
  employee_id: t.Optional(UuidSchema),
  from_org_unit_id: t.Optional(UuidSchema),
  to_org_unit_id: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type SecondmentFilters = Static<typeof SecondmentFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
