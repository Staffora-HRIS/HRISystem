/**
 * Deductions Module - TypeBox Schemas
 *
 * Defines validation schemas for deduction types and employee deduction
 * API endpoints. Supports statutory and voluntary deductions with
 * multiple calculation methods.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const DeductionCategorySchema = t.Union([
  t.Literal("tax"),
  t.Literal("ni"),
  t.Literal("pension"),
  t.Literal("student_loan"),
  t.Literal("attachment_of_earnings"),
  t.Literal("voluntary"),
  t.Literal("other"),
]);

export type DeductionCategory = Static<typeof DeductionCategorySchema>;

export const CalculationMethodSchema = t.Union([
  t.Literal("fixed"),
  t.Literal("percentage"),
  t.Literal("tiered"),
]);

export type CalculationMethod = Static<typeof CalculationMethodSchema>;

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
// Deduction Type Schemas
// =============================================================================

export const CreateDeductionTypeSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  code: t.String({ minLength: 1, maxLength: 50 }),
  category: DeductionCategorySchema,
  is_statutory: t.Optional(t.Boolean()),
  calculation_method: t.Optional(CalculationMethodSchema),
});

export type CreateDeductionType = Static<typeof CreateDeductionTypeSchema>;

export const UpdateDeductionTypeSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    code: t.String({ minLength: 1, maxLength: 50 }),
    category: DeductionCategorySchema,
    is_statutory: t.Boolean(),
    calculation_method: CalculationMethodSchema,
  })
);

export type UpdateDeductionType = Static<typeof UpdateDeductionTypeSchema>;

export const DeductionTypeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  code: t.String(),
  category: t.String(),
  is_statutory: t.Boolean(),
  calculation_method: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type DeductionTypeResponse = Static<typeof DeductionTypeResponseSchema>;

// =============================================================================
// Employee Deduction Schemas
// =============================================================================

export const CreateEmployeeDeductionSchema = t.Object({
  employee_id: UuidSchema,
  deduction_type_id: UuidSchema,
  amount: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
  percentage: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 100 }), t.Null()])),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  reference: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
});

export type CreateEmployeeDeduction = Static<typeof CreateEmployeeDeductionSchema>;

export const UpdateEmployeeDeductionSchema = t.Partial(
  t.Object({
    amount: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    percentage: t.Union([t.Number({ minimum: 0, maximum: 100 }), t.Null()]),
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
    reference: t.Union([t.String({ maxLength: 255 }), t.Null()]),
  })
);

export type UpdateEmployeeDeduction = Static<typeof UpdateEmployeeDeductionSchema>;

export const EmployeeDeductionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  deduction_type_id: UuidSchema,
  amount: t.Union([t.Number(), t.Null()]),
  percentage: t.Union([t.Number(), t.Null()]),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  reference: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Joined fields
  deduction_type_name: t.Optional(t.String()),
  deduction_type_code: t.Optional(t.String()),
  deduction_category: t.Optional(t.String()),
});

export type EmployeeDeductionResponse = Static<typeof EmployeeDeductionResponseSchema>;
