/**
 * Salary Sacrifice Module - TypeBox Schemas
 *
 * Defines validation schemas for salary sacrifice CRUD endpoints.
 * Supports UK salary sacrifice types: pension, cycle_to_work,
 * childcare_vouchers, electric_car, technology.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const SacrificeTypeSchema = t.Union([
  t.Literal("pension"),
  t.Literal("cycle_to_work"),
  t.Literal("childcare_vouchers"),
  t.Literal("electric_car"),
  t.Literal("technology"),
]);

export type SacrificeType = Static<typeof SacrificeTypeSchema>;

export const SacrificeFrequencySchema = t.Union([
  t.Literal("monthly"),
  t.Literal("annual"),
]);

export type SacrificeFrequency = Static<typeof SacrificeFrequencySchema>;

export const SacrificeStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("paused"),
  t.Literal("ended"),
]);

export type SacrificeStatus = Static<typeof SacrificeStatusSchema>;

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

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateSalarySacrificeSchema = t.Object({
  employee_id: UuidSchema,
  sacrifice_type: SacrificeTypeSchema,
  amount: t.Number({ minimum: 0.01 }),
  frequency: SacrificeFrequencySchema,
  start_date: DateSchema,
  end_date: t.Optional(t.Union([DateSchema, t.Null()])),
});

export type CreateSalarySacrifice = Static<typeof CreateSalarySacrificeSchema>;

export const UpdateSalarySacrificeSchema = t.Partial(
  t.Object({
    sacrifice_type: SacrificeTypeSchema,
    amount: t.Number({ minimum: 0.01 }),
    frequency: SacrificeFrequencySchema,
    start_date: DateSchema,
    end_date: t.Union([DateSchema, t.Null()]),
    status: SacrificeStatusSchema,
  })
);

export type UpdateSalarySacrifice = Static<typeof UpdateSalarySacrificeSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

export const SalarySacrificeFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  sacrifice_type: t.Optional(SacrificeTypeSchema),
  status: t.Optional(SacrificeStatusSchema),
});

export type SalarySacrificeFilters = Static<typeof SalarySacrificeFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const SalarySacrificeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  sacrifice_type: t.String(),
  amount: t.Number(),
  frequency: t.String(),
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  status: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type SalarySacrificeResponse = Static<typeof SalarySacrificeResponseSchema>;
