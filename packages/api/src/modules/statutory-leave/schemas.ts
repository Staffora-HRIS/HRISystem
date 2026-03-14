/**
 * Statutory Leave Module - TypeBox Schemas
 *
 * Defines validation schemas for UK statutory leave endpoints:
 * maternity, paternity, shared parental, and adoption leave.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Statutory leave type matching database enum
 */
export const StatutoryLeaveTypeSchema = t.Union([
  t.Literal("maternity"),
  t.Literal("paternity"),
  t.Literal("shared_parental"),
  t.Literal("adoption"),
]);

export type StatutoryLeaveType = Static<typeof StatutoryLeaveTypeSchema>;

/**
 * Statutory leave status matching database enum
 */
export const StatutoryLeaveStatusSchema = t.Union([
  t.Literal("planned"),
  t.Literal("active"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export type StatutoryLeaveStatus = Static<typeof StatutoryLeaveStatusSchema>;

/**
 * Pay type for weekly pay periods
 */
export const StatutoryPayTypeSchema = t.Union([
  t.Literal("90_percent"),
  t.Literal("flat_rate"),
  t.Literal("unpaid"),
]);

export type StatutoryPayType = Static<typeof StatutoryPayTypeSchema>;

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
// Create Statutory Leave Request Schemas
// =============================================================================

/**
 * Create statutory leave - base fields shared across all types
 */
const CreateStatutoryLeaveBaseSchema = t.Object({
  employee_id: UuidSchema,
  leave_type: StatutoryLeaveTypeSchema,
  expected_date: DateSchema,
  actual_date: t.Optional(DateSchema),
  start_date: DateSchema,
  end_date: t.Optional(DateSchema),
  average_weekly_earnings: t.Optional(t.Number({ minimum: 0 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
  // Maternity-specific
  matb1_received: t.Optional(t.Boolean()),
  matb1_date: t.Optional(DateSchema),
  // Shared parental-specific
  partner_employee_id: t.Optional(UuidSchema),
});

export const CreateStatutoryLeaveSchema = CreateStatutoryLeaveBaseSchema;

export type CreateStatutoryLeave = Static<typeof CreateStatutoryLeaveSchema>;

/**
 * Update statutory leave request
 */
export const UpdateStatutoryLeaveSchema = t.Partial(
  t.Object({
    expected_date: DateSchema,
    actual_date: t.Union([DateSchema, t.Null()]),
    start_date: DateSchema,
    end_date: DateSchema,
    average_weekly_earnings: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    matb1_received: t.Boolean(),
    matb1_date: t.Union([DateSchema, t.Null()]),
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);

export type UpdateStatutoryLeave = Static<typeof UpdateStatutoryLeaveSchema>;

/**
 * Curtailment request (maternity -> shared parental conversion)
 */
export const CurtailLeaveSchema = t.Object({
  curtailment_date: DateSchema,
});

export type CurtailLeave = Static<typeof CurtailLeaveSchema>;

/**
 * Record a KIT (Keeping In Touch) day
 */
export const CreateKITDaySchema = t.Object({
  work_date: DateSchema,
  hours_worked: t.Number({ minimum: 0.5, maximum: 24 }),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CreateKITDay = Static<typeof CreateKITDaySchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing statutory leave records
 */
export const StatutoryLeaveFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  leave_type: t.Optional(StatutoryLeaveTypeSchema),
  status: t.Optional(StatutoryLeaveStatusSchema),
  start_date_from: t.Optional(DateSchema),
  start_date_to: t.Optional(DateSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type StatutoryLeaveFilters = Static<typeof StatutoryLeaveFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Pay period response
 */
export const PayPeriodResponseSchema = t.Object({
  id: UuidSchema,
  leave_record_id: UuidSchema,
  week_number: t.Number(),
  start_date: t.String(),
  end_date: t.String(),
  pay_type: StatutoryPayTypeSchema,
  amount: t.Number(),
  created_at: t.String(),
});

export type PayPeriodResponse = Static<typeof PayPeriodResponseSchema>;

/**
 * KIT day response
 */
export const KITDayResponseSchema = t.Object({
  id: UuidSchema,
  leave_record_id: UuidSchema,
  work_date: t.String(),
  hours_worked: t.Number(),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type KITDayResponse = Static<typeof KITDayResponseSchema>;

/**
 * Statutory leave record response
 */
export const StatutoryLeaveResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  leave_type: StatutoryLeaveTypeSchema,
  expected_date: t.String(),
  actual_date: t.Union([t.String(), t.Null()]),
  start_date: t.String(),
  end_date: t.String(),
  total_weeks: t.Number(),
  matb1_received: t.Boolean(),
  matb1_date: t.Union([t.String(), t.Null()]),
  partner_employee_id: t.Union([UuidSchema, t.Null()]),
  curtailment_date: t.Union([t.String(), t.Null()]),
  status: StatutoryLeaveStatusSchema,
  average_weekly_earnings: t.Union([t.Number(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Nested data when fetching detail
  pay_periods: t.Optional(t.Array(PayPeriodResponseSchema)),
  kit_days: t.Optional(t.Array(KITDayResponseSchema)),
  kit_days_used: t.Optional(t.Number()),
  kit_days_remaining: t.Optional(t.Number()),
});

export type StatutoryLeaveResponse = Static<typeof StatutoryLeaveResponseSchema>;

/**
 * List item (summary) for statutory leave records
 */
export const StatutoryLeaveListItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Union([t.String(), t.Null()]),
  employee_number: t.Union([t.String(), t.Null()]),
  leave_type: StatutoryLeaveTypeSchema,
  expected_date: t.String(),
  start_date: t.String(),
  end_date: t.String(),
  total_weeks: t.Number(),
  status: StatutoryLeaveStatusSchema,
  kit_days_used: t.Number(),
});

export type StatutoryLeaveListItem = Static<typeof StatutoryLeaveListItemSchema>;

/**
 * Paginated list response
 */
export const StatutoryLeaveListResponseSchema = t.Object({
  items: t.Array(StatutoryLeaveListItemSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  total: t.Optional(t.Number()),
});

export type StatutoryLeaveListResponse = Static<typeof StatutoryLeaveListResponseSchema>;

/**
 * Pay calculation response
 */
export const PayCalculationResponseSchema = t.Object({
  leave_record_id: UuidSchema,
  leave_type: StatutoryLeaveTypeSchema,
  total_weeks: t.Number(),
  paid_weeks: t.Number(),
  unpaid_weeks: t.Number(),
  total_pay: t.Number(),
  periods: t.Array(PayPeriodResponseSchema),
});

export type PayCalculationResponse = Static<typeof PayCalculationResponseSchema>;

/**
 * Eligibility check response
 */
export const EligibilityResponseSchema = t.Object({
  employee_id: UuidSchema,
  maternity: t.Object({
    eligible: t.Boolean(),
    continuous_weeks: t.Number(),
    required_weeks: t.Number(),
    reason: t.Optional(t.String()),
  }),
  paternity: t.Object({
    eligible: t.Boolean(),
    continuous_weeks: t.Number(),
    required_weeks: t.Number(),
    reason: t.Optional(t.String()),
  }),
  shared_parental: t.Object({
    eligible: t.Boolean(),
    continuous_weeks: t.Number(),
    required_weeks: t.Number(),
    reason: t.Optional(t.String()),
  }),
  adoption: t.Object({
    eligible: t.Boolean(),
    continuous_weeks: t.Number(),
    required_weeks: t.Number(),
    reason: t.Optional(t.String()),
  }),
});

export type EligibilityResponse = Static<typeof EligibilityResponseSchema>;

// =============================================================================
// Route Parameter Schemas
// =============================================================================

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;
