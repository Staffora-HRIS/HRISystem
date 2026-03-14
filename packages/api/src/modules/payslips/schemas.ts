/**
 * Payslips Module - TypeBox Schemas
 *
 * Defines validation schemas for payslip templates and payslip
 * API endpoints. Payslips contain the full pay breakdown per employee
 * per pay period.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const PayslipStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("approved"),
  t.Literal("issued"),
]);

export type PayslipStatus = Static<typeof PayslipStatusSchema>;

/**
 * Valid status transitions for payslips
 */
export const PAYSLIP_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["approved"],
  approved: ["issued", "draft"],
  issued: [],
};

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
 * Create payslip request
 */
export const CreatePayslipSchema = t.Object({
  employee_id: UuidSchema,
  pay_period_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  gross_pay: t.Number({ minimum: 0 }),
  net_pay: t.Number({ minimum: 0 }),
  tax_deducted: t.Number({ minimum: 0 }),
  ni_employee: t.Number({ minimum: 0 }),
  ni_employer: t.Number({ minimum: 0 }),
  pension_employee: t.Optional(t.Number({ minimum: 0 })),
  pension_employer: t.Optional(t.Number({ minimum: 0 })),
  other_deductions: t.Optional(t.Array(PayslipLineItemSchema)),
  other_additions: t.Optional(t.Array(PayslipLineItemSchema)),
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

/**
 * Payslip response
 */
export const PayslipResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  pay_period_id: t.Union([UuidSchema, t.Null()]),
  gross_pay: t.Number(),
  net_pay: t.Number(),
  tax_deducted: t.Number(),
  ni_employee: t.Number(),
  ni_employer: t.Number(),
  pension_employee: t.Number(),
  pension_employer: t.Number(),
  other_deductions: t.Array(t.Record(t.String(), t.Unknown())),
  other_additions: t.Array(t.Record(t.String(), t.Unknown())),
  payment_date: t.String(),
  status: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PayslipResponse = Static<typeof PayslipResponseSchema>;

/**
 * Payslip filters for list queries
 */
export const PayslipFiltersSchema = t.Object({
  status: t.Optional(PayslipStatusSchema),
  payment_date_from: t.Optional(DateSchema),
  payment_date_to: t.Optional(DateSchema),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PayslipFilters = Static<typeof PayslipFiltersSchema>;
