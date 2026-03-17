/**
 * Feedback 360 Module Schemas
 *
 * TypeBox validation schemas for 360-degree feedback cycles and responses.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const Feedback360CycleStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("nominating"),
  t.Literal("collecting"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type Feedback360CycleStatus = Static<typeof Feedback360CycleStatusSchema>;

export const Feedback360ReviewerTypeSchema = t.Union([
  t.Literal("self"),
  t.Literal("manager"),
  t.Literal("peer"),
  t.Literal("direct_report"),
]);
export type Feedback360ReviewerType = Static<typeof Feedback360ReviewerTypeSchema>;

export const Feedback360ResponseStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("submitted"),
  t.Literal("declined"),
]);
export type Feedback360ResponseStatus = Static<typeof Feedback360ResponseStatusSchema>;

// =============================================================================
// Common
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const IdParamsSchema = t.Object({ id: UuidSchema });
export type IdParams = Static<typeof IdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// =============================================================================
// Rating Item (used in responses)
// =============================================================================

export const RatingItemSchema = t.Object({
  competencyId: UuidSchema,
  rating: t.Number({ minimum: 1, maximum: 5 }),
  comment: t.Optional(t.String({ maxLength: 2000 })),
});

// =============================================================================
// Cycle Schemas
// =============================================================================

export const CreateFeedback360CycleSchema = t.Object({
  employeeId: UuidSchema,
  reviewCycleId: t.Optional(UuidSchema),
  deadline: t.Optional(t.String({ format: "date" })),
  minResponses: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 3 })),
});
export type CreateFeedback360Cycle = Static<typeof CreateFeedback360CycleSchema>;

export const UpdateFeedback360CycleSchema = t.Partial(
  t.Object({
    status: Feedback360CycleStatusSchema,
    deadline: t.String({ format: "date" }),
    minResponses: t.Number({ minimum: 1, maximum: 50 }),
  })
);
export type UpdateFeedback360Cycle = Static<typeof UpdateFeedback360CycleSchema>;

// =============================================================================
// Nominate Reviewers Schema
// =============================================================================

export const NominateReviewersSchema = t.Object({
  reviewers: t.Array(
    t.Object({
      reviewerId: UuidSchema,
      reviewerType: Feedback360ReviewerTypeSchema,
    }),
    { minItems: 1, maxItems: 30 }
  ),
});
export type NominateReviewers = Static<typeof NominateReviewersSchema>;

// =============================================================================
// Submit Feedback Schema
// =============================================================================

export const SubmitFeedback360Schema = t.Object({
  ratings: t.Array(RatingItemSchema, { minItems: 1 }),
  strengths: t.Optional(t.String({ maxLength: 5000 })),
  developmentAreas: t.Optional(t.String({ maxLength: 5000 })),
  comments: t.Optional(t.String({ maxLength: 5000 })),
});
export type SubmitFeedback360 = Static<typeof SubmitFeedback360Schema>;

// =============================================================================
// Decline Feedback Schema
// =============================================================================

export const DeclineFeedback360Schema = t.Object({
  reason: t.Optional(t.String({ maxLength: 500 })),
});
export type DeclineFeedback360 = Static<typeof DeclineFeedback360Schema>;

// =============================================================================
// Query / Filter Schemas
// =============================================================================

export const Feedback360CycleFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  reviewCycleId: t.Optional(UuidSchema),
  status: t.Optional(Feedback360CycleStatusSchema),
  ...PaginationQuerySchema.properties,
});
export type Feedback360CycleFilters = Static<typeof Feedback360CycleFiltersSchema>;

export const ResponseIdParamsSchema = t.Object({
  id: UuidSchema,
  responseId: UuidSchema,
});
export type ResponseIdParams = Static<typeof ResponseIdParamsSchema>;
