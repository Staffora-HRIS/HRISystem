/**
 * Total Reward Statement Module - TypeBox Schemas
 *
 * Defines validation schemas for total reward statement generation
 * and PDF export endpoints.
 *
 * Monetary values are stored as numeric strings (from PostgreSQL numeric type)
 * to preserve precision. Currency is always GBP.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Total reward statement status lifecycle
 */
export const TotalRewardStatementStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("generated"),
  t.Literal("pdf_requested"),
  t.Literal("pdf_generated"),
  t.Literal("published"),
]);

export type TotalRewardStatementStatus = Static<typeof TotalRewardStatementStatusSchema>;

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

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const StatementIdParamsSchema = t.Object({
  id: UuidSchema,
});

export type StatementIdParams = Static<typeof StatementIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Query Parameters
// =============================================================================

/**
 * Query parameters for generating/retrieving a total reward statement.
 * If no date range is given, defaults to the current tax year.
 */
export const TotalRewardQuerySchema = t.Object({
  period_start: t.Optional(DateSchema),
  period_end: t.Optional(DateSchema),
  /** When true, returns a cached statement if one exists for this period */
  use_cache: t.Optional(t.String({ pattern: "^(true|false)$" })),
});

export type TotalRewardQuery = Static<typeof TotalRewardQuerySchema>;

/**
 * Query parameters for listing statements
 */
export const StatementListQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: t.Optional(TotalRewardStatementStatusSchema),
});

export type StatementListQuery = Static<typeof StatementListQuerySchema>;

// =============================================================================
// Benefit Item Schema (part of breakdown detail)
// =============================================================================

/**
 * Individual benefit line item in the total reward statement
 */
export const BenefitItemSchema = t.Object({
  name: t.String(),
  category: t.String(),
  employer_contribution: t.String(),
  employee_contribution: t.String(),
  total_value: t.String(),
});

export type BenefitItem = Static<typeof BenefitItemSchema>;

// =============================================================================
// Breakdown Detail Schema
// =============================================================================

/**
 * Detailed breakdown stored as JSONB.
 * Contains arrays of individual items for each compensation component.
 */
export const BreakdownDetailSchema = t.Object({
  compensation: t.Object({
    base_salary: t.String(),
    pay_frequency: t.String(),
    currency: t.String(),
  }),
  variable_pay: t.Array(
    t.Object({
      type: t.String(),
      amount: t.String(),
      description: t.Optional(t.String()),
    })
  ),
  pension: t.Object({
    scheme_name: t.Union([t.String(), t.Null()]),
    employer_contribution_pct: t.Union([t.String(), t.Null()]),
    employee_contribution_pct: t.Union([t.String(), t.Null()]),
    employer_amount: t.String(),
    employee_amount: t.String(),
  }),
  benefits: t.Array(BenefitItemSchema),
  holiday: t.Object({
    entitlement_days: t.Number(),
    daily_rate: t.String(),
    total_value: t.String(),
  }),
});

export type BreakdownDetail = Static<typeof BreakdownDetailSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Total reward statement response
 */
export const TotalRewardStatementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),

  statement_date: t.String(),
  period_start: t.String(),
  period_end: t.String(),

  // Summary figures (as strings for numeric precision)
  base_salary: t.String(),
  bonus_pay: t.String(),
  overtime_pay: t.String(),
  pension_employer: t.String(),
  pension_employee: t.String(),
  benefits_employer: t.String(),
  benefits_employee: t.String(),
  holiday_entitlement_value: t.String(),
  total_package_value: t.String(),

  currency: t.String(),

  // Detailed breakdown
  breakdown_detail: BreakdownDetailSchema,

  status: TotalRewardStatementStatusSchema,
  pdf_document_id: t.Union([UuidSchema, t.Null()]),

  generated_by: t.Union([UuidSchema, t.Null()]),
  published_at: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),

  created_at: t.String(),
  updated_at: t.String(),
});

export type TotalRewardStatementResponse = Static<typeof TotalRewardStatementResponseSchema>;

/**
 * PDF generation request response (just confirms the event was emitted)
 */
export const PdfRequestResponseSchema = t.Object({
  statement_id: UuidSchema,
  status: t.Literal("pdf_requested"),
  message: t.String(),
});

export type PdfRequestResponse = Static<typeof PdfRequestResponseSchema>;
