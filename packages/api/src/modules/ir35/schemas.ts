/**
 * IR35 Off-Payroll Compliance Module - TypeBox Schemas
 *
 * Defines validation schemas for all IR35 assessment API endpoints.
 *
 * Since April 2021 (off-payroll working rules), medium and large UK employers
 * must determine the IR35 status of contractor engagements and issue a
 * Status Determination Statement (SDS) with reasons. Contractors have a
 * legal right to dispute the determination.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * IR35 status determination matching database enum.
 *
 * - inside: engagement is inside IR35 (tax/NICs deducted at source)
 * - outside: engagement is outside IR35 (contractor manages own tax)
 * - undetermined: assessment not yet completed
 */
export const IR35StatusDeterminationSchema = t.Union([
  t.Literal("inside"),
  t.Literal("outside"),
  t.Literal("undetermined"),
]);

export type IR35StatusDetermination = Static<typeof IR35StatusDeterminationSchema>;

/**
 * IR35 dispute status matching database enum.
 *
 * - none: no dispute raised
 * - pending: contractor has raised a dispute, awaiting review
 * - upheld: dispute upheld, determination changed
 * - rejected: dispute reviewed and rejected, determination stands
 */
export const IR35DisputeStatusSchema = t.Union([
  t.Literal("none"),
  t.Literal("pending"),
  t.Literal("upheld"),
  t.Literal("rejected"),
]);

export type IR35DisputeStatus = Static<typeof IR35DisputeStatusSchema>;

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
// Request Schemas
// =============================================================================

/**
 * Create IR35 assessment request.
 *
 * The determination_reasons field stores the SDS reasoning as an array of
 * structured reason objects. This is mandatory under UK off-payroll rules
 * when the determination is inside or outside.
 */
export const CreateIR35AssessmentSchema = t.Object({
  contractor_id: UuidSchema,
  engagement_id: t.String({ minLength: 1, maxLength: 255 }),
  assessment_date: DateSchema,
  status_determination: IR35StatusDeterminationSchema,
  determination_reasons: t.Array(
    t.Object({
      factor: t.String({ minLength: 1, maxLength: 255 }),
      detail: t.String({ minLength: 1, maxLength: 2000 }),
      supports: t.Union([t.Literal("inside"), t.Literal("outside")]),
    }),
    { minItems: 0 }
  ),
  client_led: t.Optional(t.Boolean({ default: true })),
});

export type CreateIR35Assessment = Static<typeof CreateIR35AssessmentSchema>;

/**
 * Update IR35 assessment (PATCH).
 * Allows updating the determination and reasons but not contractor/engagement.
 * Only assessments that have not been disputed can be freely updated.
 */
export const UpdateIR35AssessmentSchema = t.Partial(
  t.Object({
    assessment_date: DateSchema,
    status_determination: IR35StatusDeterminationSchema,
    determination_reasons: t.Array(
      t.Object({
        factor: t.String({ minLength: 1, maxLength: 255 }),
        detail: t.String({ minLength: 1, maxLength: 2000 }),
        supports: t.Union([t.Literal("inside"), t.Literal("outside")]),
      })
    ),
    client_led: t.Boolean(),
  })
);

export type UpdateIR35Assessment = Static<typeof UpdateIR35AssessmentSchema>;

/**
 * Dispute an IR35 determination.
 * Under the off-payroll rules, a contractor has the right to dispute
 * the SDS. The client must respond within 45 days.
 */
export const DisputeIR35AssessmentSchema = t.Object({
  dispute_reason: t.String({ minLength: 1, maxLength: 5000 }),
});

export type DisputeIR35Assessment = Static<typeof DisputeIR35AssessmentSchema>;

// =============================================================================
// Query / Filter Schemas
// =============================================================================

/**
 * IR35 assessment list filters
 */
export const IR35AssessmentFiltersSchema = t.Object({
  contractor_id: t.Optional(UuidSchema),
  engagement_id: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  status_determination: t.Optional(IR35StatusDeterminationSchema),
  dispute_status: t.Optional(IR35DisputeStatusSchema),
  assessment_date_from: t.Optional(DateSchema),
  assessment_date_to: t.Optional(DateSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type IR35AssessmentFilters = Static<typeof IR35AssessmentFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Full IR35 assessment response
 */
export const IR35AssessmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  contractor_id: UuidSchema,
  engagement_id: t.String(),
  assessment_date: t.String(),
  status_determination: IR35StatusDeterminationSchema,
  determination_reasons: t.Array(
    t.Object({
      factor: t.String(),
      detail: t.String(),
      supports: t.Union([t.Literal("inside"), t.Literal("outside")]),
    })
  ),
  assessor_id: UuidSchema,
  client_led: t.Boolean(),
  dispute_status: IR35DisputeStatusSchema,
  dispute_reason: t.Union([t.String(), t.Null()]),
  reviewed_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type IR35AssessmentResponse = Static<typeof IR35AssessmentResponseSchema>;

/**
 * IR35 assessment list item (summary for list endpoints)
 */
export const IR35AssessmentListItemSchema = t.Object({
  id: UuidSchema,
  contractor_id: UuidSchema,
  contractor_name: t.Union([t.String(), t.Null()]),
  employee_number: t.Union([t.String(), t.Null()]),
  engagement_id: t.String(),
  assessment_date: t.String(),
  status_determination: IR35StatusDeterminationSchema,
  client_led: t.Boolean(),
  dispute_status: IR35DisputeStatusSchema,
  created_at: t.String(),
});

export type IR35AssessmentListItem = Static<typeof IR35AssessmentListItemSchema>;

// =============================================================================
// Param Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
