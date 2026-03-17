/**
 * Tax Codes Module - TypeBox Schemas
 *
 * Defines validation schemas for employee tax code API endpoints.
 * Supports UK HMRC tax codes with effective dating and source tracking.
 *
 * UK Tax Code Format:
 *   England/NI: 1257L, BR, D0, D1, NT, 0T, K100
 *   Scotland:   S1257L, SBR, SD0, SD1, SD2, S0T, SK100
 *   Wales:      C1257L, CBR, CD0, CD1, C0T, CK100
 */

import { t, type Static } from "elysia";

// =============================================================================
// Constants
// =============================================================================

/**
 * Regex pattern for validating UK HMRC tax codes.
 *
 * Matches:
 *   Standard:  1257L, 500T, 100P, 1000M, 0T
 *   K codes:   K100, K500
 *   Fixed:     BR, D0, D1, D2, NT
 *   Scottish:  S1257L, SBR, SD0, SD1, SD2, S0T, SK100
 *   Welsh:     C1257L, CBR, CD0, CD1, C0T, CK100
 *
 * Does NOT include W1/M1/X emergency suffixes (stored as week1_month1 flag).
 */
export const UK_TAX_CODE_REGEX =
  "^(S|C)?(([0-9]{1,4}[LMNPTKY])|([0-9]{1,4})|K[0-9]{1,4}|BR|D[0-2]|NT|0T)$";

// =============================================================================
// Enums
// =============================================================================

/**
 * Tax code source enum matching the app.tax_code_source database type.
 *
 * - hmrc:                 Direct HMRC notification (P6/P9)
 * - manual:               Manually entered by payroll administrator
 * - p45:                  From P45 provided by previous employer
 * - p46:                  Legacy new-starter declaration (pre-2013)
 * - starter_declaration:  HMRC Starter Checklist (replaces P46)
 */
export const TaxCodeSourceSchema = t.Union([
  t.Literal("hmrc"),
  t.Literal("manual"),
  t.Literal("p45"),
  t.Literal("p46"),
  t.Literal("starter_declaration"),
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
 * Tax code string with UK HMRC format validation.
 * Validated at the API level to return actionable errors before hitting the DB.
 */
export const TaxCodeStringSchema = t.String({
  minLength: 1,
  maxLength: 10,
  pattern: UK_TAX_CODE_REGEX,
  description:
    "UK HMRC tax code (e.g. 1257L, BR, D0, D1, NT, S1257L, C1257L, K100)",
  error: "Invalid UK tax code format. Expected patterns: 1257L, BR, D0, D1, NT, S1257L, C1257L, K100",
});

/**
 * Create employee tax code request
 */
export const CreateTaxCodeSchema = t.Object({
  employee_id: UuidSchema,
  tax_code: TaxCodeStringSchema,
  is_cumulative: t.Optional(t.Boolean({ default: true })),
  week1_month1: t.Optional(t.Boolean({ default: false })),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  source: t.Optional(TaxCodeSourceSchema),
  notes: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
});

export type CreateTaxCode = Static<typeof CreateTaxCodeSchema>;

/**
 * Update employee tax code request
 */
export const UpdateTaxCodeSchema = t.Partial(
  t.Object({
    tax_code: TaxCodeStringSchema,
    is_cumulative: t.Boolean(),
    week1_month1: t.Boolean(),
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
    source: TaxCodeSourceSchema,
    notes: t.Union([t.String({ maxLength: 500 }), t.Null()]),
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
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type TaxCodeResponse = Static<typeof TaxCodeResponseSchema>;
