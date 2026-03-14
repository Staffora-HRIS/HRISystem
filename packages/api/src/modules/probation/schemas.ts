/**
 * Probation Module - TypeBox Schemas
 *
 * Defines validation schemas for all Probation Management API endpoints.
 * Tables: probation_reviews, probation_reminders
 */

import { t, type Static } from "elysia";

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

// =============================================================================
// Enums (matching DB enums)
// =============================================================================

/**
 * Probation outcome enum — matches app.probation_outcome
 */
export const ProbationOutcomeSchema = t.Union([
  t.Literal("pending"),
  t.Literal("passed"),
  t.Literal("extended"),
  t.Literal("failed"),
  t.Literal("terminated"),
]);

export type ProbationOutcome = Static<typeof ProbationOutcomeSchema>;

/**
 * Reminder type enum — matches probation_reminders.reminder_type CHECK constraint
 */
export const ReminderTypeSchema = t.Union([
  t.Literal("30_day_warning"),
  t.Literal("14_day_warning"),
  t.Literal("review_due"),
  t.Literal("overdue"),
]);

export type ReminderType = Static<typeof ReminderTypeSchema>;

// =============================================================================
// Probation Review Schemas
// =============================================================================

/**
 * Create probation review request
 */
export const CreateProbationReviewSchema = t.Object({
  employee_id: UuidSchema,
  probation_start_date: DateSchema,
  original_end_date: DateSchema,
  current_end_date: t.Optional(DateSchema),
  reviewer_id: t.Optional(UuidSchema),
  performance_notes: t.Optional(t.String({ maxLength: 5000 })),
  areas_of_concern: t.Optional(t.String({ maxLength: 5000 })),
  development_plan: t.Optional(t.String({ maxLength: 5000 })),
  recommendation: t.Optional(t.String({ maxLength: 5000 })),
  meeting_date: t.Optional(DateSchema),
  meeting_notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type CreateProbationReview = Static<typeof CreateProbationReviewSchema>;

/**
 * Extend probation request
 */
export const ExtendProbationSchema = t.Object({
  extension_weeks: t.Number({ minimum: 1, maximum: 52 }),
  performance_notes: t.Optional(t.String({ maxLength: 5000 })),
  areas_of_concern: t.Optional(t.String({ maxLength: 5000 })),
  development_plan: t.Optional(t.String({ maxLength: 5000 })),
  recommendation: t.Optional(t.String({ maxLength: 5000 })),
});

export type ExtendProbation = Static<typeof ExtendProbationSchema>;

/**
 * Complete probation request (pass, fail, or terminate)
 */
export const CompleteProbationSchema = t.Object({
  outcome: t.Union([
    t.Literal("passed"),
    t.Literal("failed"),
    t.Literal("terminated"),
  ]),
  review_date: t.Optional(DateSchema),
  performance_notes: t.Optional(t.String({ maxLength: 5000 })),
  areas_of_concern: t.Optional(t.String({ maxLength: 5000 })),
  development_plan: t.Optional(t.String({ maxLength: 5000 })),
  recommendation: t.Optional(t.String({ maxLength: 5000 })),
  meeting_date: t.Optional(DateSchema),
  meeting_notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type CompleteProbation = Static<typeof CompleteProbationSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Probation reminder response
 */
export const ProbationReminderResponseSchema = t.Object({
  id: UuidSchema,
  probation_review_id: UuidSchema,
  reminder_type: ReminderTypeSchema,
  scheduled_date: t.String(),
  sent: t.Boolean(),
  sent_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type ProbationReminderResponse = Static<typeof ProbationReminderResponseSchema>;

/**
 * Probation review response
 */
export const ProbationReviewResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  probation_start_date: t.String(),
  original_end_date: t.String(),
  current_end_date: t.String(),
  review_date: t.Union([t.String(), t.Null()]),
  reviewer_id: t.Union([UuidSchema, t.Null()]),
  outcome: ProbationOutcomeSchema,
  extension_weeks: t.Union([t.Number(), t.Null()]),
  performance_notes: t.Union([t.String(), t.Null()]),
  areas_of_concern: t.Union([t.String(), t.Null()]),
  development_plan: t.Union([t.String(), t.Null()]),
  recommendation: t.Union([t.String(), t.Null()]),
  meeting_date: t.Union([t.String(), t.Null()]),
  meeting_notes: t.Union([t.String(), t.Null()]),
  // Joined employee info (optional, present when listed)
  employee_number: t.Optional(t.String()),
  employee_name: t.Optional(t.String()),
  days_remaining: t.Optional(t.Number()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type ProbationReviewResponse = Static<typeof ProbationReviewResponseSchema>;

/**
 * Probation review with reminders
 */
export const ProbationReviewDetailResponseSchema = t.Object({
  review: ProbationReviewResponseSchema,
  reminders: t.Array(ProbationReminderResponseSchema),
});

export type ProbationReviewDetailResponse = Static<typeof ProbationReviewDetailResponseSchema>;

/**
 * Probation review filters for list endpoints
 */
export const ProbationFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  outcome: t.Optional(ProbationOutcomeSchema),
  reviewer_id: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type ProbationFilters = Static<typeof ProbationFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
