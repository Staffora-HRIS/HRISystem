/**
 * Flexible Working Module - TypeBox Schemas
 *
 * Defines validation schemas for Flexible Working Request API endpoints.
 * Implements the Employment Relations (Flexible Working) Act 2023 requirements.
 *
 * Extended state machine:
 *   submitted -> under_review -> consultation_scheduled -> consultation_complete
 *     -> approved / rejected -> appeal -> appeal_approved / appeal_rejected
 *   Any non-terminal -> withdrawn
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Request status enum matching database type (extended)
 */
export const FlexibleWorkingStatusSchema = t.Union([
  t.Literal("submitted"),
  t.Literal("pending"),
  t.Literal("under_review"),
  t.Literal("consultation_scheduled"),
  t.Literal("consultation"),
  t.Literal("consultation_complete"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("appeal"),
  t.Literal("appeal_approved"),
  t.Literal("appeal_rejected"),
  t.Literal("withdrawn"),
]);

export type FlexibleWorkingStatus = Static<typeof FlexibleWorkingStatusSchema>;

/**
 * Statutory rejection grounds (Employment Rights Act 1996, s.80G(1)(b))
 * All 8 statutory grounds for refusal
 */
export const RejectionGroundsSchema = t.Union([
  t.Literal("burden_of_additional_costs"),
  t.Literal("detrimental_effect_customer_demand"),
  t.Literal("inability_to_reorganise"),
  t.Literal("inability_to_recruit"),
  t.Literal("detrimental_impact_quality"),
  t.Literal("detrimental_impact_performance"),
  t.Literal("insufficient_work"),
  t.Literal("planned_structural_changes"),
]);

export type RejectionGrounds = Static<typeof RejectionGroundsSchema>;

/**
 * Appeal outcome enum
 */
export const AppealOutcomeSchema = t.Union([
  t.Literal("upheld"),
  t.Literal("overturned"),
  t.Literal("pending"),
]);

export type AppealOutcome = Static<typeof AppealOutcomeSchema>;

/**
 * Type of change requested
 */
export const ChangeTypeSchema = t.Union([
  t.Literal("hours"),
  t.Literal("times"),
  t.Literal("location"),
  t.Literal("pattern"),
  t.Literal("combination"),
]);

export type ChangeType = Static<typeof ChangeTypeSchema>;

/**
 * Consultation type enum
 */
export const ConsultationTypeSchema = t.Union([
  t.Literal("meeting"),
  t.Literal("phone_call"),
  t.Literal("video_call"),
  t.Literal("written"),
]);

export type ConsultationType = Static<typeof ConsultationTypeSchema>;

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

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Submit a new flexible working request
 */
export const SubmitRequestSchema = t.Object({
  employee_id: UuidSchema,
  request_date: t.Optional(DateSchema),
  change_type: t.Optional(ChangeTypeSchema),
  current_working_pattern: t.String({ minLength: 1, maxLength: 5000 }),
  requested_working_pattern: t.String({ minLength: 1, maxLength: 5000 }),
  requested_start_date: DateSchema,
  reason: t.String({ minLength: 1, maxLength: 5000 }),
  impact_assessment: t.Optional(t.String({ maxLength: 5000 })),
});

export type SubmitRequest = Static<typeof SubmitRequestSchema>;

/** Backwards compatible alias */
export const CreateFlexibleWorkingRequestSchema = SubmitRequestSchema;
export type CreateFlexibleWorkingRequest = SubmitRequest;

/**
 * Record a consultation meeting (mandatory before refusal)
 */
export const RecordConsultationSchema = t.Object({
  consultation_date: DateSchema,
  consultation_type: t.Optional(ConsultationTypeSchema),
  attendees: t.String({ minLength: 1, maxLength: 2000 }),
  notes: t.String({ minLength: 1, maxLength: 10000 }),
  outcomes: t.Optional(t.String({ maxLength: 5000 })),
  next_steps: t.Optional(t.String({ maxLength: 5000 })),
  recorded_by: UuidSchema,
});

export type RecordConsultation = Static<typeof RecordConsultationSchema>;

/**
 * Approve a flexible working request
 */
export const ApproveRequestSchema = t.Object({
  decision_by: UuidSchema,
  effective_date: DateSchema,
  approved_modifications: t.Optional(t.String({ maxLength: 5000 })),
  contract_amendment_id: t.Optional(UuidSchema),
  trial_period_end_date: t.Optional(DateSchema),
});

export type ApproveRequest = Static<typeof ApproveRequestSchema>;

/**
 * Reject a flexible working request
 * Must specify one of the 8 statutory grounds
 */
export const RejectRequestSchema = t.Object({
  decision_by: UuidSchema,
  rejection_grounds: RejectionGroundsSchema,
  rejection_explanation: t.String({ minLength: 1, maxLength: 5000 }),
  business_justification: t.Optional(t.String({ maxLength: 5000 })),
});

export type RejectRequest = Static<typeof RejectRequestSchema>;

/**
 * Combined respond schema (kept for backwards compat)
 */
export const RespondToRequestSchema = t.Object({
  decision: t.Union([t.Literal("approved"), t.Literal("rejected")]),
  decision_by: UuidSchema,
  effective_date: t.Optional(DateSchema),
  approved_modifications: t.Optional(t.String({ maxLength: 5000 })),
  contract_amendment_id: t.Optional(UuidSchema),
  trial_period_end_date: t.Optional(DateSchema),
  rejection_grounds: t.Optional(RejectionGroundsSchema),
  rejection_explanation: t.Optional(t.String({ minLength: 1, maxLength: 5000 })),
  business_justification: t.Optional(t.String({ maxLength: 5000 })),
});

export type RespondToRequest = Static<typeof RespondToRequestSchema>;

/**
 * Appeal a rejection decision
 */
export const AppealDecisionSchema = t.Object({
  appeal_grounds: t.String({ minLength: 1, maxLength: 5000 }),
});

export type AppealDecision = Static<typeof AppealDecisionSchema>;

/**
 * Resolve an appeal
 */
export const ResolveAppealSchema = t.Object({
  outcome: t.Union([t.Literal("appeal_approved"), t.Literal("appeal_rejected")]),
  decision_by: UuidSchema,
  reason: t.String({ minLength: 1, maxLength: 5000 }),
  effective_date: t.Optional(DateSchema),
});

export type ResolveAppeal = Static<typeof ResolveAppealSchema>;

/**
 * Move request to consultation status
 */
export const MoveToConsultationSchema = t.Object({
  impact_assessment: t.Optional(t.String({ maxLength: 5000 })),
});

export type MoveToConsultation = Static<typeof MoveToConsultationSchema>;

/**
 * Withdraw flexible working request
 */
export const WithdrawRequestSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 2000 })),
});

export type WithdrawRequest = Static<typeof WithdrawRequestSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Flexible working request filters for list endpoint
 */
export const FlexibleWorkingFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(FlexibleWorkingStatusSchema),
  overdue_only: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
  date_from: t.Optional(DateSchema),
  date_to: t.Optional(DateSchema),
});

export type FlexibleWorkingFilters = Static<typeof FlexibleWorkingFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Consultation record response
 */
export const ConsultationResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  request_id: UuidSchema,
  consultation_date: t.String(),
  consultation_type: t.String(),
  attendees: t.String(),
  notes: t.String(),
  outcomes: t.Union([t.String(), t.Null()]),
  next_steps: t.Union([t.String(), t.Null()]),
  recorded_by: UuidSchema,
  created_at: t.String(),
  updated_at: t.String(),
});

export type ConsultationResponse = Static<typeof ConsultationResponseSchema>;

/**
 * Request history entry response
 */
export const RequestHistoryEntrySchema = t.Object({
  id: UuidSchema,
  request_id: UuidSchema,
  from_status: t.Union([FlexibleWorkingStatusSchema, t.Null()]),
  to_status: FlexibleWorkingStatusSchema,
  changed_by: t.Union([UuidSchema, t.Null()]),
  reason: t.Union([t.String(), t.Null()]),
  metadata: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  created_at: t.String(),
});

export type RequestHistoryEntry = Static<typeof RequestHistoryEntrySchema>;

/**
 * Flexible working request response (extended)
 */
export const FlexibleWorkingResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  request_date: t.String(),
  change_type: t.Union([t.String(), t.Null()]),
  current_working_pattern: t.String(),
  requested_working_pattern: t.String(),
  requested_start_date: t.String(),
  reason: t.String(),
  impact_assessment: t.Union([t.String(), t.Null()]),
  status: FlexibleWorkingStatusSchema,
  response_deadline: t.String(),
  decision_date: t.Union([t.String(), t.Null()]),
  decision_by: t.Union([UuidSchema, t.Null()]),
  rejection_grounds: t.Union([RejectionGroundsSchema, t.Null()]),
  rejection_explanation: t.Union([t.String(), t.Null()]),
  effective_date: t.Union([t.String(), t.Null()]),
  approved_modifications: t.Union([t.String(), t.Null()]),
  contract_amendment_id: t.Union([UuidSchema, t.Null()]),
  trial_period_end_date: t.Union([t.String(), t.Null()]),
  withdrawal_reason: t.Union([t.String(), t.Null()]),
  appeal_date: t.Union([t.String(), t.Null()]),
  appeal_grounds: t.Union([t.String(), t.Null()]),
  appeal_outcome: t.Union([AppealOutcomeSchema, t.Null()]),
  appeal_decision_by: t.Union([UuidSchema, t.Null()]),
  appeal_decision_date: t.Union([t.String(), t.Null()]),
  consultation_completed: t.Boolean(),
  request_number_in_period: t.Number(),
  is_overdue: t.Boolean(),
  consultations: t.Optional(t.Array(ConsultationResponseSchema)),
  history: t.Optional(t.Array(RequestHistoryEntrySchema)),
  created_at: t.String(),
  updated_at: t.String(),
});

export type FlexibleWorkingResponse = Static<typeof FlexibleWorkingResponseSchema>;

/**
 * Compliance summary response
 */
export const ComplianceSummarySchema = t.Object({
  total_requests: t.Number(),
  pending_requests: t.Number(),
  under_review_requests: t.Number(),
  in_consultation: t.Number(),
  approved_requests: t.Number(),
  rejected_requests: t.Number(),
  withdrawn_requests: t.Number(),
  appeal_requests: t.Number(),
  overdue_responses: t.Number(),
  overdue_requests: t.Array(
    t.Object({
      id: UuidSchema,
      employee_id: UuidSchema,
      request_date: t.String(),
      response_deadline: t.String(),
      days_overdue: t.Number(),
    })
  ),
  average_response_days: t.Union([t.Number(), t.Null()]),
  rejection_grounds_breakdown: t.Array(
    t.Object({
      grounds: t.String(),
      count: t.Number(),
    })
  ),
  consultation_compliance_rate: t.Union([t.Number(), t.Null()]),
});

export type ComplianceSummary = Static<typeof ComplianceSummarySchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Idempotency key header (optional)
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
