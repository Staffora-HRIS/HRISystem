/**
 * Case Hearings Module - TypeBox Schemas
 *
 * Validation schemas for hearing scheduling and management.
 * ACAS Code of Practice para 12: minimum 5 working days notice for hearings.
 * Right to be accompanied per s.10 TULRCA 1992, ACAS Code para 14.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Hearing Enums
// =============================================================================

export const HearingTypeSchema = t.Union([
  t.Literal("disciplinary"),
  t.Literal("grievance"),
  t.Literal("appeal"),
]);

export const HearingStatusSchema = t.Union([
  t.Literal("scheduled"),
  t.Literal("postponed"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export const HearingCompanionTypeSchema = t.Union([
  t.Literal("trade_union_rep"),
  t.Literal("colleague"),
]);

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create (schedule) a hearing for a case.
 *
 * ACAS Code para 12: employee must receive at least 5 working days notice.
 * The service layer validates: notice_sent_at + minimum_notice_days <= scheduled_date.
 */
export const CreateHearingSchema = t.Object({
  hearingType: HearingTypeSchema,
  scheduledDate: t.String({
    format: "date-time",
    description: "ISO 8601 date-time for the hearing. Must allow for minimum notice period.",
  }),
  location: t.String({
    minLength: 1,
    maxLength: 500,
    description: "Physical address or virtual meeting link for the hearing.",
  }),
  employeeId: UuidSchema,
  chairPersonId: t.Optional(UuidSchema),
  hrRepresentativeId: t.Optional(UuidSchema),
  companionId: t.Optional(UuidSchema),
  companionType: t.Optional(HearingCompanionTypeSchema),
  minimumNoticeDays: t.Optional(t.Number({
    minimum: 0,
    maximum: 30,
    default: 5,
    description: "Minimum working days notice required. Defaults to 5 per ACAS Code para 12.",
  })),
  noticeSentAt: t.Optional(t.String({
    format: "date-time",
    description: "When the hearing notice was sent. Defaults to now if not provided.",
  })),
  notes: t.Optional(t.String({
    maxLength: 10000,
    description: "Additional notes or agenda for the hearing.",
  })),
});

/**
 * Update an existing hearing.
 *
 * Can reschedule, update participants, record outcome, or change status.
 * Re-validates notice period if scheduled_date is changed.
 */
export const UpdateHearingSchema = t.Partial(
  t.Object({
    scheduledDate: t.String({
      format: "date-time",
      description: "New scheduled date-time. Re-validates notice period.",
    }),
    location: t.String({ minLength: 1, maxLength: 500 }),
    status: HearingStatusSchema,
    chairPersonId: UuidSchema,
    hrRepresentativeId: UuidSchema,
    companionId: UuidSchema,
    companionType: HearingCompanionTypeSchema,
    noticeSentAt: t.String({ format: "date-time" }),
    minimumNoticeDays: t.Number({ minimum: 0, maximum: 30 }),
    outcome: t.String({ maxLength: 10000 }),
    notes: t.String({ maxLength: 10000 }),
  })
);

// =============================================================================
// Response Schemas
// =============================================================================

export const HearingResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  caseId: UuidSchema,
  hearingType: HearingTypeSchema,
  status: HearingStatusSchema,
  scheduledDate: t.String(),
  location: t.String(),
  chairPersonId: t.Union([UuidSchema, t.Null()]),
  hrRepresentativeId: t.Union([UuidSchema, t.Null()]),
  employeeId: UuidSchema,
  companionId: t.Union([UuidSchema, t.Null()]),
  companionType: t.Union([HearingCompanionTypeSchema, t.Null()]),
  noticeSentAt: t.Union([t.String(), t.Null()]),
  minimumNoticeDays: t.Number(),
  noticeCompliant: t.Boolean({ description: "Whether the notice period meets ACAS requirements." }),
  outcome: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  createdBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const HearingListResponseSchema = t.Object({
  hearings: t.Array(HearingResponseSchema),
  count: t.Number(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type HearingType = typeof HearingTypeSchema.static;
export type HearingStatus = typeof HearingStatusSchema.static;
export type HearingCompanionType = typeof HearingCompanionTypeSchema.static;
export type CreateHearing = typeof CreateHearingSchema.static;
export type UpdateHearing = typeof UpdateHearingSchema.static;
export type HearingResponse = typeof HearingResponseSchema.static;
