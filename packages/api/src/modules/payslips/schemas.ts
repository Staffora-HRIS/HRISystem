/**
 * Payslips Module - TypeBox Schemas
 *
 * Defines validation schemas for payslip templates, payslip generation,
 * viewing, distribution, and PDF generation endpoints.
 *
 * Payslips contain the full pay breakdown per employee per pay period,
 * including deductions, additions, YTD totals, tax code, NI number,
 * and payment method.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const PayslipStatusSchema = t.Union([
  t.Literal("generated"),
  t.Literal("draft"),
  t.Literal("approved"),
  t.Literal("issued"),
  t.Literal("distributed"),
]);

export type PayslipStatus = Static<typeof PayslipStatusSchema>;

/**
 * Valid status transitions for payslips
 */
export const PAYSLIP_STATUS_TRANSITIONS: Record<string, string[]> = {
  generated: ["approved"],
  draft: ["approved"],
  approved: ["issued", "distributed", "draft"],
  issued: ["distributed"],
  distributed: [],
};

export const PayslipPaymentMethodSchema = t.Union([
  t.Literal("bacs"),
  t.Literal("faster_payments"),
  t.Literal("cheque"),
  t.Literal("cash"),
]);

export type PayslipPaymentMethod = Static<typeof PayslipPaymentMethodSchema>;

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
// Payslip Template Schemas
// =============================================================================

export const CreatePayslipTemplateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  layout_config: t.Optional(t.Record(t.String(), t.Unknown())),
});

export type CreatePayslipTemplate = Static<typeof CreatePayslipTemplateSchema>;

export const UpdatePayslipTemplateSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    layout_config: t.Record(t.String(), t.Unknown()),
  })
);

export type UpdatePayslipTemplate = Static<typeof UpdatePayslipTemplateSchema>;

export const PayslipTemplateResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  layout_config: t.Record(t.String(), t.Unknown()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PayslipTemplateResponse = Static<typeof PayslipTemplateResponseSchema>;

// =============================================================================
// Payslip Schemas
// =============================================================================

/**
 * Line item schema for other_deductions and other_additions
 */
export const PayslipLineItemSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  amount: t.Number({ minimum: 0 }),
  code: t.Optional(t.String({ maxLength: 50 })),
});

export type PayslipLineItem = Static<typeof PayslipLineItemSchema>;

/**
 * Create payslip request (backward-compatible, extended)
 */
export const CreatePayslipSchema = t.Object({
  employee_id: UuidSchema,
  payroll_run_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  pay_period_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  pay_period_start: t.Optional(DateSchema),
  pay_period_end: t.Optional(DateSchema),
  gross_pay: t.Number({ minimum: 0 }),
  net_pay: t.Number({ minimum: 0 }),
  tax_deducted: t.Number({ minimum: 0 }),
  ni_employee: t.Number({ minimum: 0 }),
  ni_employer: t.Number({ minimum: 0 }),
  pension_employee: t.Optional(t.Number({ minimum: 0 })),
  pension_employer: t.Optional(t.Number({ minimum: 0 })),
  student_loan: t.Optional(t.Number({ minimum: 0 })),
  deductions: t.Optional(t.Array(PayslipLineItemSchema)),
  additions: t.Optional(t.Array(PayslipLineItemSchema)),
  other_deductions: t.Optional(t.Array(PayslipLineItemSchema)),
  other_additions: t.Optional(t.Array(PayslipLineItemSchema)),
  tax_code: t.Optional(t.Union([t.String({ maxLength: 10 }), t.Null()])),
  ni_number: t.Optional(t.Union([t.String({ maxLength: 13 }), t.Null()])),
  ni_category: t.Optional(t.Union([t.String({ maxLength: 1 }), t.Null()])),
  payment_method: t.Optional(PayslipPaymentMethodSchema),
  payment_date: DateSchema,
  status: t.Optional(PayslipStatusSchema),
});

export type CreatePayslip = Static<typeof CreatePayslipSchema>;

/**
 * Update payslip status request
 */
export const UpdatePayslipStatusSchema = t.Object({
  status: PayslipStatusSchema,
});

export type UpdatePayslipStatus = Static<typeof UpdatePayslipStatusSchema>;

// =============================================================================
// Bulk Generate Payslips (from a payroll run)
// =============================================================================

export const GeneratePayslipsSchema = t.Object({
  payroll_run_id: UuidSchema,
});

export type GeneratePayslips = Static<typeof GeneratePayslipsSchema>;

export const GeneratePayslipsResponseSchema = t.Object({
  payroll_run_id: UuidSchema,
  payslips_generated: t.Number(),
  payslips_skipped: t.Number(),
  status: t.String(),
});

export type GeneratePayslipsResponse = Static<typeof GeneratePayslipsResponseSchema>;

// =============================================================================
// Distribute Payslips
// =============================================================================

export const DistributePayslipsSchema = t.Object({
  payslip_ids: t.Optional(t.Array(UuidSchema, { minItems: 1, maxItems: 500 })),
  payroll_run_id: t.Optional(UuidSchema),
});

export type DistributePayslips = Static<typeof DistributePayslipsSchema>;

export const DistributePayslipsResponseSchema = t.Object({
  distributed_count: t.Number(),
  already_distributed: t.Number(),
  status: t.String(),
});

export type DistributePayslipsResponse = Static<typeof DistributePayslipsResponseSchema>;

// =============================================================================
// Payslip Response (enhanced)
// =============================================================================

export const PayslipResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  payroll_run_id: t.Union([UuidSchema, t.Null()]),
  pay_period_id: t.Union([UuidSchema, t.Null()]),
  pay_period_start: t.Union([t.String(), t.Null()]),
  pay_period_end: t.Union([t.String(), t.Null()]),
  employee_name: t.Union([t.String(), t.Null()]),
  employee_number: t.Union([t.String(), t.Null()]),
  gross_pay: t.Number(),
  net_pay: t.Number(),
  tax_deducted: t.Number(),
  ni_employee: t.Number(),
  ni_employer: t.Number(),
  pension_employee: t.Number(),
  pension_employer: t.Number(),
  student_loan: t.Number(),
  deductions: t.Array(t.Record(t.String(), t.Unknown())),
  additions: t.Array(t.Record(t.String(), t.Unknown())),
  other_deductions: t.Array(t.Record(t.String(), t.Unknown())),
  other_additions: t.Array(t.Record(t.String(), t.Unknown())),
  tax_code: t.Union([t.String(), t.Null()]),
  ni_number: t.Union([t.String(), t.Null()]),
  ni_category: t.Union([t.String(), t.Null()]),
  payment_method: t.Union([t.String(), t.Null()]),
  payment_date: t.String(),
  status: t.String(),
  ytd_gross_pay: t.Number(),
  ytd_tax_deducted: t.Number(),
  ytd_ni_employee: t.Number(),
  ytd_ni_employer: t.Number(),
  ytd_pension_employee: t.Number(),
  ytd_pension_employer: t.Number(),
  ytd_student_loan: t.Number(),
  ytd_net_pay: t.Number(),
  generated_at: t.Union([t.String(), t.Null()]),
  distributed_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PayslipResponse = Static<typeof PayslipResponseSchema>;

// =============================================================================
// Payslip Filters
// =============================================================================

export const PayslipFiltersSchema = t.Object({
  status: t.Optional(PayslipStatusSchema),
  payroll_run_id: t.Optional(UuidSchema),
  employee_id: t.Optional(UuidSchema),
  payment_date_from: t.Optional(DateSchema),
  payment_date_to: t.Optional(DateSchema),
  pay_period_start: t.Optional(DateSchema),
  pay_period_end: t.Optional(DateSchema),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PayslipFilters = Static<typeof PayslipFiltersSchema>;
