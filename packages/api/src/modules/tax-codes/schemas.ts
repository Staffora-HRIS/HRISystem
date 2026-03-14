/**
 * Tax Codes Module - TypeBox Schemas
 *
 * Defines validation schemas for employee tax code API endpoints.
 * Supports UK HMRC tax codes with effective dating and source tracking.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Tax code source enum matching the app.tax_code_source database type
 */
export const TaxCodeSourceSchema = t.Union([
  t.Literal("hmrc"),
  t.Literal("manual"),
]);

export type TaxCodeSource = Static<typeof TaxCodeSourceSchema>;

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
// Tax Code Schemas
// =============================================================================

/**
 * Create employee tax code request
 */
export const CreateTaxCodeSchema = t.Object({
  employee_id: UuidSchema,
  tax_code: t.String({ minLength: 1, maxLength: 10 }),
  is_cumulative: t.Optional(t.Boolean()),
  week1_month1: t.Optional(t.Boolean()),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  source: t.Optional(TaxCodeSourceSchema),
});

export type CreateTaxCode = Static<typeof CreateTaxCodeSchema>;

/**
 * Update employee tax code request
 */
export const UpdateTaxCodeSchema = t.Partial(
  t.Object({
    tax_code: t.String({ minLength: 1, maxLength: 10 }),
    is_cumulative: t.Boolean(),
    week1_month1: t.Boolean(),
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
    source: TaxCodeSourceSchema,
  })
);

export type UpdateTaxCode = Static<typeof UpdateTaxCodeSchema>;

/**
 * Tax code response
 */
export const TaxCodeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  tax_code: t.String(),
  is_cumulative: t.Boolean(),
  week1_month1: t.Boolean(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  source: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type TaxCodeResponse = Static<typeof TaxCodeResponseSchema>;
