/**
 * Talent Module Schemas
 *
 * Goals, Reviews, Competencies
 */

import { t, type Static } from "elysia";

// Enums
export const GoalStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type GoalStatus = Static<typeof GoalStatusSchema>;

export const ReviewStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("self_review"),
  t.Literal("manager_review"),
  t.Literal("calibration"),
  t.Literal("completed"),
]);
export type ReviewStatus = Static<typeof ReviewStatusSchema>;

export const RatingSchema = t.Union([
  t.Literal(1),
  t.Literal(2),
  t.Literal(3),
  t.Literal(4),
  t.Literal(5),
]);
export type Rating = Static<typeof RatingSchema>;

// Common
export const UuidSchema = t.String({ format: "uuid" });
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// Goal Schemas
export const CreateGoalSchema = t.Object({
  employeeId: UuidSchema,
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String({ maxLength: 50 })),
  weight: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  targetDate: t.String({ format: "date" }),
  metrics: t.Optional(t.Array(t.Object({
    name: t.String(),
    target: t.String(),
    unit: t.Optional(t.String()),
  }))),
  parentGoalId: t.Optional(UuidSchema),
});
export type CreateGoal = Static<typeof CreateGoalSchema>;

export const UpdateGoalSchema = t.Partial(t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.String({ maxLength: 2000 }),
  category: t.String({ maxLength: 50 }),
  weight: t.Number({ minimum: 0, maximum: 100 }),
  targetDate: t.String({ format: "date" }),
  status: GoalStatusSchema,
  progress: t.Number({ minimum: 0, maximum: 100 }),
  metrics: t.Array(t.Object({
    name: t.String(),
    target: t.String(),
    actual: t.Optional(t.String()),
    unit: t.Optional(t.String()),
  })),
}));
export type UpdateGoal = Static<typeof UpdateGoalSchema>;

export const GoalFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(GoalStatusSchema),
  category: t.Optional(t.String()),
  ...PaginationQuerySchema.properties,
});
export type GoalFilters = Static<typeof GoalFiltersSchema>;

// Review Schemas
export const CreateReviewCycleSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  periodStart: t.String({ format: "date" }),
  periodEnd: t.String({ format: "date" }),
  selfReviewDeadline: t.String({ format: "date" }),
  managerReviewDeadline: t.String({ format: "date" }),
  calibrationDeadline: t.Optional(t.String({ format: "date" })),
});
export type CreateReviewCycle = Static<typeof CreateReviewCycleSchema>;

export const CreateReviewSchema = t.Object({
  reviewCycleId: UuidSchema,
  employeeId: UuidSchema,
  reviewerId: UuidSchema,
});
export type CreateReview = Static<typeof CreateReviewSchema>;

export const SubmitSelfReviewSchema = t.Object({
  accomplishments: t.String({ minLength: 1, maxLength: 5000 }),
  challenges: t.Optional(t.String({ maxLength: 5000 })),
  developmentAreas: t.Optional(t.String({ maxLength: 2000 })),
  selfRating: RatingSchema,
  goalRatings: t.Optional(t.Array(t.Object({
    goalId: UuidSchema,
    rating: RatingSchema,
    comments: t.Optional(t.String()),
  }))),
  competencyRatings: t.Optional(t.Array(t.Object({
    competencyId: UuidSchema,
    rating: RatingSchema,
    comments: t.Optional(t.String()),
  }))),
});
export type SubmitSelfReview = Static<typeof SubmitSelfReviewSchema>;

export const SubmitManagerReviewSchema = t.Object({
  feedback: t.String({ minLength: 1, maxLength: 5000 }),
  strengths: t.Optional(t.String({ maxLength: 2000 })),
  developmentAreas: t.Optional(t.String({ maxLength: 2000 })),
  managerRating: RatingSchema,
  goalRatings: t.Optional(t.Array(t.Object({
    goalId: UuidSchema,
    rating: RatingSchema,
    comments: t.Optional(t.String()),
  }))),
  competencyRatings: t.Optional(t.Array(t.Object({
    competencyId: UuidSchema,
    rating: RatingSchema,
    comments: t.Optional(t.String()),
  }))),
  promotionRecommendation: t.Optional(t.Boolean()),
});
export type SubmitManagerReview = Static<typeof SubmitManagerReviewSchema>;

// Competency Schemas
export const CreateCompetencySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  category: t.String({ minLength: 1, maxLength: 50 }),
  levels: t.Array(t.Object({
    level: t.Number({ minimum: 1, maximum: 5 }),
    name: t.String(),
    description: t.String(),
    behaviors: t.Array(t.String()),
  })),
});
export type CreateCompetency = Static<typeof CreateCompetencySchema>;

// Params
export const IdParamsSchema = t.Object({ id: UuidSchema });
export type IdParams = Static<typeof IdParamsSchema>;
