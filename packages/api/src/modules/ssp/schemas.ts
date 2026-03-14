/**
 * SSP (Statutory Sick Pay) Module - TypeBox Schemas
 *
 * Defines validation schemas for all SSP API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK SSP Rules:
 * - Weekly rate: configurable (£116.75 for 2024/25)
 * - 4+ consecutive days of incapacity required
 * - 3 waiting days before payments begin
 * - Maximum 28 weeks per PIW
 * - Lower Earnings Limit: £123/week
 * - PIW linking: periods <=8 weeks apart link together
 * - Fit note required after 7 consecutive calendar days of sickness
 */

import { t, type Static } from "elysia";

// =============================================================================
// Constants
// =============================================================================

/**
 * UK SSP configuration constants.
 * These are based on 2024/25 rates and should be updated annually.
 */
export const SSP_CONSTANTS = {
  /** Weekly SSP rate in GBP */
  WEEKLY_RATE: 116.75,
  /** Maximum weeks of SSP per PIW */
  MAX_WEEKS: 28,
  /** Number of waiting days before SSP payments begin */
  WAITING_DAYS: 3,
  /** Minimum consecutive days of incapacity to qualify */
  MIN_INCAPACITY_DAYS: 4,
  /** Lower Earnings Limit per week in GBP */
  LOWER_EARNINGS_LIMIT: 123.0,
  /** Maximum gap in weeks between PIWs for linking */
  PIW_LINKING_GAP_WEEKS: 8,
  /** Days in the PIW linking gap */
  PIW_LINKING_GAP_DAYS: 56,
  /** Calendar days after which a fit note is required */
  FIT_NOTE_REQUIRED_AFTER_DAYS: 7,
} as const;

// =============================================================================
// Enums
// =============================================================================

/**
 * SSP record status enum matching database type
 */
export const SSPRecordStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("completed"),
  t.Literal("exhausted"),
  t.Literal("ineligible"),
]);

export type SSPRecordStatus = Static<typeof SSPRecordStatusSchema>;

/**
 * SSP daily log day type enum matching database type
 */
export const SSPDayTypeSchema = t.Union([
  t.Literal("waiting"),
  t.Literal("paid"),
  t.Literal("non_qualifying"),
  t.Literal("weekend"),
  t.Literal("bank_holiday"),
]);

export type SSPDayType = Static<typeof SSPDayTypeSchema>;

/**
 * Fit note status enum matching database type
 */
export const SSPFitNoteStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("received"),
  t.Literal("self_certified"),
]);

export type SSPFitNoteStatus = Static<typeof SSPFitNoteStatusSchema>;

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
 * ID params schema
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
 * Idempotency header schema (optional)
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Qualifying Days Pattern
// =============================================================================

/**
 * Qualifying days pattern: array of ISO day numbers (1=Mon, 7=Sun)
 * Default: [1,2,3,4,5] for standard Mon-Fri
 */
export const QualifyingDaysPatternSchema = t.Array(
  t.Integer({ minimum: 1, maximum: 7 }),
  { minItems: 1, maxItems: 7, uniqueItems: true }
);

export type QualifyingDaysPattern = Static<typeof QualifyingDaysPatternSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create SSP Record request
 */
export const CreateSSPRecordSchema = t.Object({
  employee_id: UuidSchema,
  start_date: DateSchema,
  qualifying_days_pattern: t.Optional(QualifyingDaysPatternSchema),
  fit_note_required: t.Optional(t.Boolean()),
  notes: t.Optional(t.String({ maxLength: 4000 })),
});

export type CreateSSPRecord = Static<typeof CreateSSPRecordSchema>;

/**
 * Update SSP Record request
 */
export const UpdateSSPRecordSchema = t.Object({
  end_date: t.Optional(DateSchema),
  fit_note_required: t.Optional(t.Boolean()),
  notes: t.Optional(t.String({ maxLength: 4000 })),
  qualifying_days_pattern: t.Optional(QualifyingDaysPatternSchema),
});

export type UpdateSSPRecord = Static<typeof UpdateSSPRecordSchema>;

/**
 * End SSP Record request
 */
export const EndSSPRecordSchema = t.Object({
  end_date: DateSchema,
  notes: t.Optional(t.String({ maxLength: 4000 })),
});

export type EndSSPRecord = Static<typeof EndSSPRecordSchema>;

/**
 * SSP Records list query filters
 */
export const SSPRecordFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(SSPRecordStatusSchema),
  start_date_from: t.Optional(DateSchema),
  start_date_to: t.Optional(DateSchema),
});

export type SSPRecordFilters = Static<typeof SSPRecordFiltersSchema>;

/**
 * Calculate SSP entitlement request.
 * Projects what SSP would be owed for a given sickness period.
 */
export const CalculateSSPSchema = t.Object({
  employee_id: UuidSchema,
  sickness_start: DateSchema,
  sickness_end: DateSchema,
  qualifying_days_pattern: t.Optional(QualifyingDaysPatternSchema),
});

export type CalculateSSP = Static<typeof CalculateSSPSchema>;

/**
 * Create fit note request
 */
export const CreateFitNoteSchema = t.Object({
  ssp_record_id: UuidSchema,
  cover_from: DateSchema,
  cover_to: t.Optional(DateSchema),
  status: t.Optional(SSPFitNoteStatusSchema),
  document_id: t.Optional(UuidSchema),
  issuing_doctor: t.Optional(t.String({ maxLength: 500 })),
  diagnosis: t.Optional(t.String({ maxLength: 2000 })),
  notes: t.Optional(t.String({ maxLength: 4000 })),
  may_be_fit: t.Optional(t.Boolean()),
  adjustments: t.Optional(t.String({ maxLength: 2000 })),
  received_date: t.Optional(DateSchema),
});

export type CreateFitNote = Static<typeof CreateFitNoteSchema>;

/**
 * Update fit note request
 */
export const UpdateFitNoteSchema = t.Object({
  status: t.Optional(SSPFitNoteStatusSchema),
  cover_to: t.Optional(DateSchema),
  document_id: t.Optional(UuidSchema),
  issuing_doctor: t.Optional(t.String({ maxLength: 500 })),
  diagnosis: t.Optional(t.String({ maxLength: 2000 })),
  notes: t.Optional(t.String({ maxLength: 4000 })),
  may_be_fit: t.Optional(t.Boolean()),
  adjustments: t.Optional(t.String({ maxLength: 2000 })),
  received_date: t.Optional(DateSchema),
});

export type UpdateFitNote = Static<typeof UpdateFitNoteSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * SSP daily log entry response
 */
export const SSPDailyLogResponseSchema = t.Object({
  id: UuidSchema,
  ssp_record_id: UuidSchema,
  log_date: t.String(),
  day_type: SSPDayTypeSchema,
  amount: t.Number(),
  created_at: t.String(),
});

export type SSPDailyLogResponse = Static<typeof SSPDailyLogResponseSchema>;

/**
 * SSP Record response
 */
export const SSPRecordResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  qualifying_days_pattern: t.Array(t.Integer()),
  waiting_days_served: t.Integer(),
  total_days_paid: t.Integer(),
  total_amount_paid: t.Number(),
  weekly_rate: t.Number(),
  status: SSPRecordStatusSchema,
  linked_piw_id: t.Union([UuidSchema, t.Null()]),
  fit_note_required: t.Boolean(),
  notes: t.Union([t.String(), t.Null()]),
  ineligibility_reason: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type SSPRecordResponse = Static<typeof SSPRecordResponseSchema>;

/**
 * SSP Record detail response with daily log
 */
export const SSPRecordDetailResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  qualifying_days_pattern: t.Array(t.Integer()),
  waiting_days_served: t.Integer(),
  total_days_paid: t.Integer(),
  total_amount_paid: t.Number(),
  weekly_rate: t.Number(),
  status: SSPRecordStatusSchema,
  linked_piw_id: t.Union([UuidSchema, t.Null()]),
  fit_note_required: t.Boolean(),
  notes: t.Union([t.String(), t.Null()]),
  ineligibility_reason: t.Union([t.String(), t.Null()]),
  daily_log: t.Array(SSPDailyLogResponseSchema),
  created_at: t.String(),
  updated_at: t.String(),
});

export type SSPRecordDetailResponse = Static<typeof SSPRecordDetailResponseSchema>;

/**
 * SSP Eligibility check response
 */
export const SSPEligibilityResponseSchema = t.Object({
  employee_id: UuidSchema,
  eligible: t.Boolean(),
  reasons: t.Array(t.String()),
  weekly_earnings: t.Union([t.Number(), t.Null()]),
  lower_earnings_limit: t.Number(),
  has_active_ssp: t.Boolean(),
  employment_status: t.Union([t.String(), t.Null()]),
});

export type SSPEligibilityResponse = Static<typeof SSPEligibilityResponseSchema>;

/**
 * SSP Entitlement response
 */
export const SSPEntitlementResponseSchema = t.Object({
  employee_id: UuidSchema,
  max_weeks: t.Integer(),
  max_qualifying_days: t.Integer(),
  used_qualifying_days: t.Integer(),
  remaining_qualifying_days: t.Integer(),
  used_weeks: t.Number(),
  remaining_weeks: t.Number(),
  weekly_rate: t.Number(),
  daily_rate: t.Number(),
  has_active_ssp: t.Boolean(),
  active_ssp_record_id: t.Union([UuidSchema, t.Null()]),
});

export type SSPEntitlementResponse = Static<typeof SSPEntitlementResponseSchema>;

/**
 * SSP Calculation projection response.
 * Shows what SSP would be owed for a hypothetical sickness period.
 */
export const SSPCalculationResponseSchema = t.Object({
  employee_id: UuidSchema,
  sickness_start: t.String(),
  sickness_end: t.String(),
  eligible: t.Boolean(),
  ineligibility_reasons: t.Array(t.String()),
  total_calendar_days: t.Integer(),
  qualifying_days_in_period: t.Integer(),
  waiting_days: t.Integer(),
  paid_days: t.Integer(),
  total_ssp_amount: t.Number(),
  weekly_rate: t.Number(),
  daily_rate: t.Number(),
  fit_note_required: t.Boolean(),
  fit_note_required_from: t.Union([t.String(), t.Null()]),
  links_to_previous_piw: t.Boolean(),
  linked_piw_id: t.Union([UuidSchema, t.Null()]),
  remaining_weeks_after: t.Number(),
  daily_breakdown: t.Array(t.Object({
    date: t.String(),
    day_type: SSPDayTypeSchema,
    amount: t.Number(),
  })),
});

export type SSPCalculationResponse = Static<typeof SSPCalculationResponseSchema>;

/**
 * Fit note response
 */
export const SSPFitNoteResponseSchema = t.Object({
  id: UuidSchema,
  ssp_record_id: UuidSchema,
  employee_id: UuidSchema,
  status: SSPFitNoteStatusSchema,
  cover_from: t.String(),
  cover_to: t.Union([t.String(), t.Null()]),
  document_id: t.Union([UuidSchema, t.Null()]),
  issuing_doctor: t.Union([t.String(), t.Null()]),
  diagnosis: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  may_be_fit: t.Boolean(),
  adjustments: t.Union([t.String(), t.Null()]),
  received_date: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type SSPFitNoteResponse = Static<typeof SSPFitNoteResponseSchema>;

/**
 * SSP History response for an employee (summary of all PIWs)
 */
export const SSPHistoryResponseSchema = t.Object({
  employee_id: UuidSchema,
  records: t.Array(SSPRecordResponseSchema),
  fit_notes: t.Array(SSPFitNoteResponseSchema),
  total_ssp_paid: t.Number(),
  total_days_paid: t.Integer(),
  total_records: t.Integer(),
});

export type SSPHistoryResponse = Static<typeof SSPHistoryResponseSchema>;
