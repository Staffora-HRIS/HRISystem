/**
 * Payroll Integration Module - TypeBox Schemas
 *
 * Defines validation schemas for payroll runs, payroll lines,
 * employee tax details, and payroll export endpoints.
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Payroll run status lifecycle
 */
export const PayrollRunStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("calculating"),
  t.Literal("review"),
  t.Literal("approved"),
  t.Literal("submitted"),
  t.Literal("paid"),
]);

export type PayrollRunStatus = Static<typeof PayrollRunStatusSchema>;

/**
 * Valid payroll run status transitions
 */
export const PAYROLL_STATUS_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft: ["calculating"],
  calculating: ["review", "draft"], // can go back to draft on failure
  review: ["approved", "draft"],    // can reject back to draft
  approved: ["submitted", "review"], // can un-approve
  submitted: ["paid"],
  paid: [],
};

/**
 * Payroll run type
 */
export const PayrollRunTypeSchema = t.Union([
  t.Literal("monthly"),
  t.Literal("weekly"),
  t.Literal("supplemental"),
]);

export type PayrollRunType = Static<typeof PayrollRunTypeSchema>;

/**
 * Student loan plan
 */
export const StudentLoanPlanSchema = t.Union([
  t.Literal("none"),
  t.Literal("plan1"),
  t.Literal("plan2"),
  t.Literal("plan4"),
  t.Literal("plan5"),
  t.Literal("postgrad"),
]);

export type StudentLoanPlan = Static<typeof StudentLoanPlanSchema>;

/**
 * Payment method
 */
export const PaymentMethodSchema = t.Union([
  t.Literal("bacs"),
  t.Literal("faster_payments"),
  t.Literal("cheque"),
  t.Literal("cash"),
]);

export type PaymentMethod = Static<typeof PaymentMethodSchema>;

/**
 * NI category letter
 */
export const NiCategorySchema = t.String({
  pattern: "^[ABCFHIJLMSVZ]$",
  minLength: 1,
  maxLength: 1,
  description: "HMRC National Insurance category letter",
});

/**
 * Export format
 */
export const ExportFormatSchema = t.Union([
  t.Literal("csv"),
  t.Literal("json"),
]);

export type ExportFormat = Static<typeof ExportFormatSchema>;

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

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Payroll Run Schemas
// =============================================================================

/**
 * Create payroll run request
 */
export const CreatePayrollRunSchema = t.Object({
  pay_period_start: DateSchema,
  pay_period_end: DateSchema,
  pay_date: DateSchema,
  run_type: t.Optional(PayrollRunTypeSchema),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CreatePayrollRun = Static<typeof CreatePayrollRunSchema>;

/**
 * Payroll run filters for list endpoint
 */
export const PayrollRunFiltersSchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: t.Optional(PayrollRunStatusSchema),
  run_type: t.Optional(PayrollRunTypeSchema),
});

export type PayrollRunFilters = Static<typeof PayrollRunFiltersSchema>;

/**
 * Payroll line response (per-employee breakdown)
 */
export const PayrollLineResponseSchema = t.Object({
  id: UuidSchema,
  payroll_run_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  basic_pay: t.String(),
  overtime_pay: t.String(),
  bonus_pay: t.String(),
  total_gross: t.String(),
  tax_deduction: t.String(),
  ni_employee: t.String(),
  ni_employer: t.String(),
  pension_employee: t.String(),
  pension_employer: t.String(),
  student_loan: t.String(),
  other_deductions: t.String(),
  total_deductions: t.String(),
  net_pay: t.String(),
  tax_code: t.Union([t.String(), t.Null()]),
  ni_category: t.Union([t.String(), t.Null()]),
  payment_method: PaymentMethodSchema,
});

export type PayrollLineResponse = Static<typeof PayrollLineResponseSchema>;

/**
 * Payroll run response
 */
export const PayrollRunResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  pay_period_start: t.String(),
  pay_period_end: t.String(),
  pay_date: t.String(),
  status: PayrollRunStatusSchema,
  run_type: PayrollRunTypeSchema,
  employee_count: t.Number(),
  total_gross: t.String(),
  total_deductions: t.String(),
  total_net: t.String(),
  total_employer_costs: t.String(),
  approved_by: t.Union([UuidSchema, t.Null()]),
  approved_at: t.Union([t.String(), t.Null()]),
  submitted_at: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PayrollRunResponse = Static<typeof PayrollRunResponseSchema>;

/**
 * Payroll run detail response (run + lines)
 */
export const PayrollRunDetailResponseSchema = t.Object({
  ...PayrollRunResponseSchema.properties,
  lines: t.Array(PayrollLineResponseSchema),
});

export type PayrollRunDetailResponse = Static<typeof PayrollRunDetailResponseSchema>;

// =============================================================================
// Employee Tax Details Schemas
// =============================================================================

/**
 * Create/update employee tax details request
 */
export const UpsertTaxDetailsSchema = t.Object({
  tax_code: t.String({
    minLength: 1,
    maxLength: 10,
    description: "HMRC PAYE tax code (e.g., 1257L, BR, D0, K500L, S1257L)",
  }),
  ni_number: t.Optional(t.Union([
    t.String({
      pattern: "^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$",
      description: "National Insurance number (format: XX123456A)",
    }),
    t.Null(),
  ])),
  ni_category: t.Optional(NiCategorySchema),
  student_loan_plan: t.Optional(StudentLoanPlanSchema),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
});

export type UpsertTaxDetails = Static<typeof UpsertTaxDetailsSchema>;

/**
 * Employee tax details response
 */
export const TaxDetailsResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  tax_code: t.String(),
  ni_number: t.Union([t.String(), t.Null()]),
  ni_category: t.String(),
  student_loan_plan: StudentLoanPlanSchema,
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type TaxDetailsResponse = Static<typeof TaxDetailsResponseSchema>;

// =============================================================================
// Export Schema
// =============================================================================

/**
 * Export request body
 */
export const ExportPayrollSchema = t.Object({
  format: ExportFormatSchema,
});

export type ExportPayroll = Static<typeof ExportPayrollSchema>;

// =============================================================================
// Payslip Params
// =============================================================================

export const PayslipParamsSchema = t.Object({
  id: UuidSchema,
  runId: UuidSchema,
});

export type PayslipParams = Static<typeof PayslipParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  id: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;
