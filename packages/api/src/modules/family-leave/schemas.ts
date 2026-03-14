/**
 * Family Leave Module - TypeBox Schemas
 *
 * Validation schemas for UK family leave management:
 * - Maternity Leave & Statutory Maternity Pay (SMP)
 * - Paternity Leave & Statutory Paternity Pay (SPP)
 * - Shared Parental Leave & Pay (ShPL / ShPP)
 * - Adoption Leave & Pay
 *
 * Unified API for the statutory_leave_records tables with
 * enhanced compliance tracking.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const FamilyLeaveTypeSchema = t.Union([
  t.Literal("maternity"),
  t.Literal("paternity"),
  t.Literal("shared_parental"),
  t.Literal("adoption"),
]);

export type FamilyLeaveType = Static<typeof FamilyLeaveTypeSchema>;

export const FamilyLeaveStatusSchema = t.Union([
  t.Literal("planned"),
  t.Literal("active"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export type FamilyLeaveStatus = Static<typeof FamilyLeaveStatusSchema>;

export const PayRateTypeSchema = t.Union([
  t.Literal("earnings_related"),
  t.Literal("flat_rate"),
  t.Literal("nil"),
]);

export type PayRateType = Static<typeof PayRateTypeSchema>;

export const NoticeTypeSchema = t.Union([
  t.Literal("maternity_notification"),
  t.Literal("maternity_leave_dates"),
  t.Literal("maternity_return_early"),
  t.Literal("matb1_certificate"),
  t.Literal("paternity_notification"),
  t.Literal("spl_opt_in"),
  t.Literal("spl_period_of_leave"),
  t.Literal("spl_curtailment"),
  t.Literal("adoption_notification"),
  t.Literal("adoption_matching_cert"),
]);

export type NoticeType = Static<typeof NoticeTypeSchema>;

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
// Create Entitlement Schema
// =============================================================================

/**
 * Create a family leave entitlement (pregnancy/adoption notification).
 * This is the initial notification that triggers the leave management process.
 */
export const CreateEntitlementSchema = t.Object({
  employee_id: UuidSchema,
  leave_type: FamilyLeaveTypeSchema,
  /** Expected Week of Childbirth (EWC) or placement date */
  expected_date: DateSchema,
  /** Actual birth/placement date (if known) */
  actual_date: t.Optional(DateSchema),
  /** Planned leave start date */
  start_date: DateSchema,
  /** Planned leave end date (auto-calculated if not provided) */
  end_date: t.Optional(DateSchema),
  /** Average weekly earnings over the 8-week reference period */
  average_weekly_earnings: t.Optional(t.Number({ minimum: 0 })),
  /** Date the employee formally notified the employer */
  notice_given_date: t.Optional(DateSchema),
  /** Whether MATB1 certificate has been received (maternity only) */
  matb1_received: t.Optional(t.Boolean()),
  /** Date MATB1 was received */
  matb1_date: t.Optional(DateSchema),
  /** Partner employee ID for shared parental leave */
  partner_employee_id: t.Optional(UuidSchema),
  /** Paternity: which block (1 or 2) since April 2024 */
  paternity_block_number: t.Optional(t.Number({ minimum: 1, maximum: 2 })),
  /** Additional notes */
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateEntitlement = Static<typeof CreateEntitlementSchema>;

// =============================================================================
// Eligibility Check Schema
// =============================================================================

export const EligibilityCheckSchema = t.Object({
  leave_type: FamilyLeaveTypeSchema,
  /** Expected date (EWC or placement) for qualifying week calculation */
  expected_date: t.Optional(DateSchema),
});

export type EligibilityCheck = Static<typeof EligibilityCheckSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// KIT/SPLIT Day Schema
// =============================================================================

export const CreateKITDaySchema = t.Object({
  work_date: DateSchema,
  hours_worked: t.Number({ minimum: 0.5, maximum: 24 }),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CreateKITDay = Static<typeof CreateKITDaySchema>;

// =============================================================================
// Curtailment Schema
// =============================================================================

export const CurtailLeaveSchema = t.Object({
  curtailment_date: DateSchema,
  /** Number of leave weeks to make available for ShPL */
  spl_weeks_available: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
  /** Number of pay weeks to make available for ShPL */
  spl_pay_weeks_available: t.Optional(t.Number({ minimum: 0, maximum: 37 })),
});

export type CurtailLeave = Static<typeof CurtailLeaveSchema>;

// =============================================================================
// Notice Schema
// =============================================================================

export const CreateNoticeSchema = t.Object({
  notice_type: NoticeTypeSchema,
  notice_date: DateSchema,
  received_date: t.Optional(DateSchema),
  document_reference: t.Optional(t.String({ maxLength: 255 })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CreateNotice = Static<typeof CreateNoticeSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

export const EntitlementFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  leave_type: t.Optional(FamilyLeaveTypeSchema),
  status: t.Optional(FamilyLeaveStatusSchema),
  start_date_from: t.Optional(DateSchema),
  start_date_to: t.Optional(DateSchema),
});

export type EntitlementFilters = Static<typeof EntitlementFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const PayPeriodResponseSchema = t.Object({
  id: UuidSchema,
  week_number: t.Number(),
  start_date: t.String(),
  end_date: t.String(),
  rate_type: t.String(),
  amount: t.Number(),
});

export type PayPeriodResponse = Static<typeof PayPeriodResponseSchema>;

export const KITDayResponseSchema = t.Object({
  id: UuidSchema,
  leave_record_id: UuidSchema,
  work_date: t.String(),
  hours_worked: t.Number(),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type KITDayResponse = Static<typeof KITDayResponseSchema>;

export const NoticeResponseSchema = t.Object({
  id: UuidSchema,
  leave_record_id: UuidSchema,
  employee_id: UuidSchema,
  notice_type: t.String(),
  notice_date: t.String(),
  received_date: t.Union([t.String(), t.Null()]),
  acknowledged_by: t.Union([UuidSchema, t.Null()]),
  acknowledged_date: t.Union([t.String(), t.Null()]),
  document_reference: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type NoticeResponse = Static<typeof NoticeResponseSchema>;

export const EntitlementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  leave_type: FamilyLeaveTypeSchema,
  expected_date: t.String(),
  actual_date: t.Union([t.String(), t.Null()]),
  start_date: t.String(),
  end_date: t.String(),
  total_weeks: t.Number(),
  status: FamilyLeaveStatusSchema,
  average_weekly_earnings: t.Union([t.Number(), t.Null()]),
  qualifies_for_statutory_pay: t.Boolean(),
  earnings_above_lel: t.Boolean(),
  notice_given_date: t.Union([t.String(), t.Null()]),
  qualifying_week: t.Union([t.String(), t.Null()]),
  matb1_received: t.Boolean(),
  matb1_date: t.Union([t.String(), t.Null()]),
  partner_employee_id: t.Union([UuidSchema, t.Null()]),
  curtailment_date: t.Union([t.String(), t.Null()]),
  paternity_block_number: t.Union([t.Number(), t.Null()]),
  spl_weeks_available: t.Union([t.Number(), t.Null()]),
  spl_pay_weeks_available: t.Union([t.Number(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Nested data
  kit_days_used: t.Optional(t.Number()),
  kit_days_remaining: t.Optional(t.Number()),
  pay_periods: t.Optional(t.Array(PayPeriodResponseSchema)),
  kit_days: t.Optional(t.Array(KITDayResponseSchema)),
  notices: t.Optional(t.Array(NoticeResponseSchema)),
});

export type EntitlementResponse = Static<typeof EntitlementResponseSchema>;

export const EntitlementListItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Union([t.String(), t.Null()]),
  employee_number: t.Union([t.String(), t.Null()]),
  leave_type: FamilyLeaveTypeSchema,
  expected_date: t.String(),
  start_date: t.String(),
  end_date: t.String(),
  total_weeks: t.Number(),
  status: FamilyLeaveStatusSchema,
  kit_days_used: t.Number(),
  qualifies_for_statutory_pay: t.Boolean(),
});

export type EntitlementListItem = Static<typeof EntitlementListItemSchema>;

export const PayScheduleResponseSchema = t.Object({
  leave_record_id: UuidSchema,
  leave_type: FamilyLeaveTypeSchema,
  total_weeks: t.Number(),
  paid_weeks: t.Number(),
  unpaid_weeks: t.Number(),
  total_statutory_pay: t.Number(),
  periods: t.Array(PayPeriodResponseSchema),
});

export type PayScheduleResponse = Static<typeof PayScheduleResponseSchema>;

export const EligibilityResponseSchema = t.Object({
  employee_id: UuidSchema,
  leave_type: FamilyLeaveTypeSchema,
  eligible: t.Boolean(),
  continuous_service_weeks: t.Number(),
  required_weeks: t.Number(),
  qualifying_week: t.Union([t.String(), t.Null()]),
  earnings_above_lel: t.Union([t.Boolean(), t.Null()]),
  reasons: t.Array(t.String()),
});

export type EligibilityResponse = Static<typeof EligibilityResponseSchema>;

export const DashboardResponseSchema = t.Object({
  active_leaves: t.Object({
    maternity: t.Number(),
    paternity: t.Number(),
    shared_parental: t.Number(),
    adoption: t.Number(),
    total: t.Number(),
  }),
  planned_leaves: t.Object({
    maternity: t.Number(),
    paternity: t.Number(),
    shared_parental: t.Number(),
    adoption: t.Number(),
    total: t.Number(),
  }),
  upcoming_returns: t.Array(t.Object({
    id: UuidSchema,
    employee_id: UuidSchema,
    employee_name: t.Union([t.String(), t.Null()]),
    leave_type: FamilyLeaveTypeSchema,
    expected_return_date: t.String(),
    days_until_return: t.Number(),
  })),
  kit_day_summary: t.Array(t.Object({
    id: UuidSchema,
    employee_id: UuidSchema,
    employee_name: t.Union([t.String(), t.Null()]),
    leave_type: FamilyLeaveTypeSchema,
    kit_days_used: t.Number(),
    kit_days_remaining: t.Number(),
  })),
  compliance_alerts: t.Array(t.Object({
    type: t.String(),
    severity: t.Union([t.Literal("info"), t.Literal("warning"), t.Literal("critical")]),
    message: t.String(),
    leave_record_id: t.Optional(UuidSchema),
    employee_id: t.Optional(UuidSchema),
  })),
});

export type DashboardResponse = Static<typeof DashboardResponseSchema>;
