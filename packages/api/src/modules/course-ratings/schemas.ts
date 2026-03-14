/**
 * Course Ratings Module - TypeBox Schemas
 *
 * Validation schemas for course ratings and reviews.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Course Rating Schemas
// =============================================================================

export const CreateCourseRatingSchema = t.Object({
  courseId: UuidSchema,
  employeeId: UuidSchema,
  rating: t.Integer({ minimum: 1, maximum: 5 }),
  reviewText: t.Optional(t.String({ maxLength: 5000 })),
  wouldRecommend: t.Optional(t.Boolean()),
  completedAt: t.Optional(t.String({ format: "date-time" })),
});
export type CreateCourseRating = Static<typeof CreateCourseRatingSchema>;

// =============================================================================
// Response Types
// =============================================================================

export interface CourseRatingResponse {
  id: string;
  tenantId: string;
  courseId: string;
  employeeId: string;
  rating: number;
  reviewText: string | null;
  wouldRecommend: boolean | null;
  completedAt: string | null;
  employeeName?: string;
  createdAt: string;
}

export interface CourseSummaryResponse {
  courseId: string;
  totalRatings: number;
  averageRating: number | null;
  ratingDistribution: Record<string, number>;
  recommendationRate: number | null;
}

// =============================================================================
// Common Schemas
// =============================================================================

export const IdParamsSchema = t.Object({ id: UuidSchema });
export const CourseIdParamsSchema = t.Object({ courseId: UuidSchema });
