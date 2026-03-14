/**
 * Return to Work Module - TypeBox Schemas
 *
 * Defines validation schemas for return-to-work interview API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Table: app.return_to_work_interviews
 * Columns:
 *   id, tenant_id, employee_id, leave_request_id (nullable),
 *   absence_start_date, absence_end_date, interview_date,
 *   interviewer_id, fit_for_work, adjustments_needed (nullable),
 *   referral_to_occupational_health, notes (nullable),
 *   created_at, updated_at
 */

import { t, type Static } from "elysia";

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
// Create Interview Schema
// =============================================================================

/**
 * Create a return-to-work interview record
 */
export const CreateInterviewSchema = t.Object({
  employee_id: UuidSchema,
  leave_request_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  absence_start_date: DateSchema,
  absence_end_date: DateSchema,
  interview_date: DateSchema,
  interviewer_id: UuidSchema,
  fit_for_work: t.Boolean(),
  adjustments_needed: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
  referral_to_occupational_health: t.Optional(t.Boolean({ default: false })),
  notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
});

export type CreateInterview = Static<typeof CreateInterviewSchema>;

// =============================================================================
// Update Interview Schema
// =============================================================================

/**
 * Update an existing return-to-work interview.
 * All fields optional (partial update).
 */
export const UpdateInterviewSchema = t.Partial(
  t.Object({
    leave_request_id: t.Union([UuidSchema, t.Null()]),
    absence_start_date: DateSchema,
    absence_end_date: DateSchema,
    interview_date: DateSchema,
    interviewer_id: UuidSchema,
    fit_for_work: t.Boolean(),
    adjustments_needed: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    referral_to_occupational_health: t.Boolean(),
    notes: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
  })
);

export type UpdateInterview = Static<typeof UpdateInterviewSchema>;

// =============================================================================
// Complete Interview Schema
// =============================================================================

/**
 * Mark an interview as complete with final assessment.
 * Allows setting fit_for_work, adjustments, referral, and notes in one call.
 */
export const CompleteInterviewSchema = t.Object({
  fit_for_work: t.Boolean(),
  adjustments_needed: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
  referral_to_occupational_health: t.Optional(t.Boolean()),
  notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
});

export type CompleteInterview = Static<typeof CompleteInterviewSchema>;

// =============================================================================
// Response Schema
// =============================================================================

/**
 * Full interview response
 */
export const InterviewResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  leave_request_id: t.Union([UuidSchema, t.Null()]),
  absence_start_date: t.String(),
  absence_end_date: t.String(),
  interview_date: t.String(),
  interviewer_id: UuidSchema,
  fit_for_work: t.Boolean(),
  adjustments_needed: t.Union([t.String(), t.Null()]),
  referral_to_occupational_health: t.Boolean(),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type InterviewResponse = Static<typeof InterviewResponseSchema>;

/**
 * Paginated interview list response
 */
export const InterviewListResponseSchema = t.Object({
  items: t.Array(InterviewResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type InterviewListResponse = Static<typeof InterviewListResponseSchema>;

// =============================================================================
// Filter Schema
// =============================================================================

/**
 * Filters for listing interviews
 */
export const InterviewFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  interviewer_id: t.Optional(UuidSchema),
  fit_for_work: t.Optional(t.Boolean()),
  referral_to_occupational_health: t.Optional(t.Boolean()),
  interview_date_from: t.Optional(DateSchema),
  interview_date_to: t.Optional(DateSchema),
  leave_request_id: t.Optional(UuidSchema),
});

export type InterviewFilters = Static<typeof InterviewFiltersSchema>;

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

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
