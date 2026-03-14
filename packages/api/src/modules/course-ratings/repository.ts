/**
 * Course Ratings Module - Repository Layer
 *
 * Database operations for course ratings and reviews.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateCourseRating,
  CourseRatingResponse,
  CourseSummaryResponse,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// DB Row Shapes
// =============================================================================

interface RatingDbRow {
  id: string;
  tenantId: string;
  courseId: string;
  employeeId: string;
  rating: number;
  reviewText: string | null;
  wouldRecommend: boolean | null;
  completedAt: Date | null;
  employeeName?: string;
  createdAt: Date;
}

interface SummaryDbRow {
  totalRatings: string;
  averageRating: string | null;
  rating1: string;
  rating2: string;
  rating3: string;
  rating4: string;
  rating5: string;
  recommendCount: string;
  respondedCount: string;
}

// =============================================================================
// Repository
// =============================================================================

export class CourseRatingRepository {
  constructor(private db: DatabaseClient) {}

  async listByCourse(
    ctx: TenantContext,
    courseId: string
  ): Promise<CourseRatingResponse[]> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<RatingDbRow[]>`
        SELECT cr.id, cr.tenant_id, cr.course_id, cr.employee_id,
               cr.rating, cr.review_text, cr.would_recommend,
               cr.completed_at, cr.created_at,
               e.first_name || ' ' || e.last_name as employee_name
        FROM app.course_ratings cr
        JOIN app.employees e ON e.id = cr.employee_id
        WHERE cr.course_id = ${courseId}::uuid AND cr.tenant_id = ${ctx.tenantId}::uuid
        ORDER BY cr.created_at DESC
      `;
    });

    return rows.map(this.mapRatingRow);
  }

  async getById(ctx: TenantContext, id: string): Promise<CourseRatingResponse | null> {
    const [row] = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<RatingDbRow[]>`
        SELECT cr.id, cr.tenant_id, cr.course_id, cr.employee_id,
               cr.rating, cr.review_text, cr.would_recommend,
               cr.completed_at, cr.created_at,
               e.first_name || ' ' || e.last_name as employee_name
        FROM app.course_ratings cr
        JOIN app.employees e ON e.id = cr.employee_id
        WHERE cr.id = ${id}::uuid AND cr.tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    return row ? this.mapRatingRow(row) : null;
  }

  async create(
    ctx: TenantContext,
    data: CreateCourseRating,
    tx: TransactionSql
  ): Promise<CourseRatingResponse> {
    const [row] = await tx<RatingDbRow[]>`
      INSERT INTO app.course_ratings (
        id, tenant_id, course_id, employee_id,
        rating, review_text, would_recommend, completed_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.courseId}::uuid,
        ${data.employeeId}::uuid, ${data.rating},
        ${data.reviewText || null}, ${data.wouldRecommend ?? null},
        ${data.completedAt || null}::timestamptz
      )
      RETURNING id, tenant_id, course_id, employee_id,
                rating, review_text, would_recommend,
                completed_at, created_at
    `;

    return this.mapRatingRow(row);
  }

  async getSummary(
    ctx: TenantContext,
    courseId: string
  ): Promise<CourseSummaryResponse> {
    const [summary] = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<SummaryDbRow[]>`
        SELECT
          COUNT(*)::text as total_ratings,
          AVG(rating)::text as average_rating,
          COUNT(*) FILTER (WHERE rating = 1)::text as rating1,
          COUNT(*) FILTER (WHERE rating = 2)::text as rating2,
          COUNT(*) FILTER (WHERE rating = 3)::text as rating3,
          COUNT(*) FILTER (WHERE rating = 4)::text as rating4,
          COUNT(*) FILTER (WHERE rating = 5)::text as rating5,
          COUNT(*) FILTER (WHERE would_recommend = true)::text as recommend_count,
          COUNT(*) FILTER (WHERE would_recommend IS NOT NULL)::text as responded_count
        FROM app.course_ratings
        WHERE course_id = ${courseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    const totalRatings = Number(summary.totalRatings);
    const respondedCount = Number(summary.respondedCount);

    return {
      courseId,
      totalRatings,
      averageRating: summary.averageRating ? Math.round(Number(summary.averageRating) * 100) / 100 : null,
      ratingDistribution: {
        "1": Number(summary.rating1),
        "2": Number(summary.rating2),
        "3": Number(summary.rating3),
        "4": Number(summary.rating4),
        "5": Number(summary.rating5),
      },
      recommendationRate: respondedCount > 0
        ? Math.round((Number(summary.recommendCount) / respondedCount) * 100)
        : null,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapRatingRow(row: RatingDbRow): CourseRatingResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      courseId: row.courseId,
      employeeId: row.employeeId,
      rating: row.rating,
      reviewText: row.reviewText,
      wouldRecommend: row.wouldRecommend,
      completedAt: row.completedAt?.toISOString() || null,
      employeeName: row.employeeName,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
    };
  }
}
