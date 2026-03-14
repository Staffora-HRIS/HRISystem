/**
 * NMW (National Minimum Wage) Module - TypeBox Schemas
 *
 * Defines validation schemas for all NMW/NLW compliance API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK National Minimum Wage Act 1998:
 * - Employers must pay at least NMW/NLW based on employee age
 * - Rates are updated annually (usually each April)
 * - Non-compliance is a criminal offence
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * NMW rate type enum matching database type app.nmw_rate_type
 */
export const NMWRateTypeSchema = t.Union([
  t.Literal("national_living_wage"),
  t.Literal("national_minimum_wage"),
  t.Literal("apprentice"),
]);

export type NMWRateType = Static<typeof NMWRateTypeSchema>;

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
 * Common ID params schema
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Employee ID params schema
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

/**
 * Optional idempotency header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// NMW Rate Schemas
// =============================================================================

/**
 * Create NMW rate request body
 */
export const CreateNMWRateSchema = t.Object({
  rate_name: t.String({ minLength: 1, maxLength: 100 }),
  age_from: t.Number({ minimum: 0, maximum: 120 }),
  age_to: t.Optional(t.Union([t.Number({ minimum: 1, maximum: 120 }), t.Null()])),
  hourly_rate: t.Number({ minimum: 0.01 }),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  rate_type: NMWRateTypeSchema,
});

export type CreateNMWRate = Static<typeof CreateNMWRateSchema>;

/**
 * NMW rate filters for listing
 */
export const NMWRateFiltersSchema = t.Object({
  rate_type: t.Optional(NMWRateTypeSchema),
  effective_on: t.Optional(DateSchema),
  include_system: t.Optional(t.String({ pattern: "^(true|false)$" })),
});

export type NMWRateFilters = Static<typeof NMWRateFiltersSchema>;

/**
 * NMW rate response schema
 */
export const NMWRateResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.Union([t.String(), t.Null()]),
  rateName: t.String(),
  ageFrom: t.Number(),
  ageTo: t.Union([t.Number(), t.Null()]),
  hourlyRate: t.String(),
  effectiveFrom: t.String(),
  effectiveTo: t.Union([t.String(), t.Null()]),
  rateType: t.String(),
  createdAt: t.String(),
});

export type NMWRateResponse = Static<typeof NMWRateResponseSchema>;

// =============================================================================
// Compliance Check Schemas
// =============================================================================

/**
 * Single employee compliance check response
 */
export const ComplianceCheckResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  employeeId: t.String(),
  employeeName: t.Optional(t.String()),
  employeeNumber: t.Optional(t.String()),
  checkDate: t.String(),
  employeeAge: t.Number(),
  applicableRate: t.String(),
  actualHourlyRate: t.String(),
  compliant: t.Boolean(),
  shortfall: t.Union([t.String(), t.Null()]),
  checkedBy: t.String(),
  notes: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

export type ComplianceCheckResponse = Static<typeof ComplianceCheckResponseSchema>;

/**
 * Bulk compliance check response
 */
export const BulkComplianceResponseSchema = t.Object({
  totalChecked: t.Number(),
  compliant: t.Number(),
  nonCompliant: t.Number(),
  skipped: t.Number(),
  checkDate: t.String(),
  results: t.Array(ComplianceCheckResponseSchema),
});

export type BulkComplianceResponse = Static<typeof BulkComplianceResponseSchema>;

/**
 * Compliance report filters
 */
export const ComplianceReportFiltersSchema = t.Object({
  date_from: t.Optional(DateSchema),
  date_to: t.Optional(DateSchema),
  compliant: t.Optional(t.String({ pattern: "^(true|false)$" })),
  employee_id: t.Optional(UuidSchema),
});

export type ComplianceReportFilters = Static<typeof ComplianceReportFiltersSchema>;

/**
 * Compliance report response
 */
export const ComplianceReportResponseSchema = t.Object({
  items: t.Array(ComplianceCheckResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  summary: t.Object({
    totalChecks: t.Number(),
    compliantCount: t.Number(),
    nonCompliantCount: t.Number(),
  }),
});

export type ComplianceReportResponse = Static<typeof ComplianceReportResponseSchema>;
