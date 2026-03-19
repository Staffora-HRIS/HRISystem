/**
 * Salary Sacrifice - TypeBox Schemas (TODO-232)
 *
 * Defines request/response schemas for UK salary sacrifice processing.
 * Salary sacrifice allows employees to exchange part of their gross pay
 * for non-cash benefits, reducing tax and NI liability.
 *
 * Part of the Payroll module.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Sacrifice type -- matches app.sacrifice_type enum in DB
 */
export const SacrificeTypeSchema = t.Union([
  t.Literal("pension"),
  t.Literal("cycle_to_work"),
  t.Literal("childcare_vouchers"),
  t.Literal("electric_car"),
  t.Literal("technology"),
]);

export type SacrificeType = Static<typeof SacrificeTypeSchema>;

/**
 * Sacrifice frequency -- matches app.sacrifice_frequency enum in DB
 */
export const SacrificeFrequencySchema = t.Union([
  t.Literal("monthly"),
  t.Literal("annual"),
]);

export type SacrificeFrequency = Static<typeof SacrificeFrequencySchema>;

/**
 * Sacrifice status -- matches app.sacrifice_status enum in DB
 */
export const SacrificeStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("paused"),
  t.Literal("ended"),
]);

export type SacrificeStatus = Static<typeof SacrificeStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

const DateSchema = t.String({
  format: "date",
  pattern: "^\d{4}-\d{2}-\d{2}$",
});

// =============================================================================
// Create Salary Sacrifice
// =============================================================================

export const CreateSalarySacrificeSchema = t.Object({
  employee_id: UuidSchema,
  sacrifice_type: SacrificeTypeSchema,
  amount: t.Number({
    minimum: 0.01,
    maximum: 999999.99,
    description: "Sacrifice amount in GBP. Must be greater than zero.",
  }),
  frequency: t.Optional(SacrificeFrequencySchema),
  start_date: DateSchema,
  end_date: t.Optional(t.Union([DateSchema, t.Null()])),
  reference_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
});

export type CreateSalarySacrifice = Static<typeof CreateSalarySacrificeSchema>;

// =============================================================================
// Update Salary Sacrifice
// =============================================================================

export const UpdateSalarySacrificeSchema = t.Object({
  amount: t.Optional(
    t.Number({
      minimum: 0.01,
      maximum: 999999.99,
      description: "Updated sacrifice amount in GBP.",
    })
  ),
  frequency: t.Optional(SacrificeFrequencySchema),
  end_date: t.Optional(t.Union([DateSchema, t.Null()])),
  status: t.Optional(SacrificeStatusSchema),
  notes: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
});

export type UpdateSalarySacrifice = Static<typeof UpdateSalarySacrificeSchema>;

// =============================================================================
// Response Schema
// =============================================================================

export const SalarySacrificeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  sacrifice_type: SacrificeTypeSchema,
  amount: t.String({ description: "Sacrifice amount as decimal string" }),
  frequency: SacrificeFrequencySchema,
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  status: SacrificeStatusSchema,
  reference_id: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type SalarySacrificeResponse = Static<typeof SalarySacrificeResponseSchema>;

// =============================================================================
// Impact Calculation Response
// =============================================================================

/**
 * Shows the impact of all active salary sacrifices on an employee's pay.
 * Calculates the tax and NI savings from salary sacrifice arrangements.
 */
export const SalarySacrificeImpactSchema = t.Object({
  employee_id: UuidSchema,
  gross_salary: t.String({ description: "Annual gross salary before sacrifice" }),
  total_monthly_sacrifice: t.String({ description: "Total monthly sacrifice amount" }),
  total_annual_sacrifice: t.String({ description: "Total annual sacrifice amount" }),
  adjusted_gross_salary: t.String({ description: "Annual gross salary after sacrifice" }),
  tax_saving_monthly: t.String({ description: "Monthly income tax saving from sacrifice" }),
  ni_saving_employee_monthly: t.String({ description: "Monthly employee NI saving" }),
  ni_saving_employer_monthly: t.String({ description: "Monthly employer NI saving" }),
  total_monthly_saving: t.String({ description: "Total monthly saving (employee tax + NI)" }),
  total_annual_saving: t.String({ description: "Total annual saving (employee tax + NI)" }),
  net_cost_monthly: t.String({ description: "Actual monthly cost to employee after savings" }),
  sacrifices: t.Array(t.Object({
    id: UuidSchema,
    sacrifice_type: SacrificeTypeSchema,
    monthly_amount: t.String(),
    annual_amount: t.String(),
    status: SacrificeStatusSchema,
  })),
  below_nmw_warning: t.Boolean({
    description: "True if sacrifice would reduce hourly pay below National Minimum Wage",
  }),
});

export type SalarySacrificeImpact = Static<typeof SalarySacrificeImpactSchema>;

// =============================================================================
// Filter/Query Schemas
// =============================================================================

export const SalarySacrificeFiltersSchema = t.Object({
  status: t.Optional(SacrificeStatusSchema),
  sacrifice_type: t.Optional(SacrificeTypeSchema),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type SalarySacrificeFilters = Static<typeof SalarySacrificeFiltersSchema>;

// =============================================================================
// Path Params
// =============================================================================

export const SacrificeIdParamsSchema = t.Object({
  id: UuidSchema,
});

export type SacrificeIdParams = Static<typeof SacrificeIdParamsSchema>;

export const EmployeeSacrificeParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeSacrificeParams = Static<typeof EmployeeSacrificeParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
