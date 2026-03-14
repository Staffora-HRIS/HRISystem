/**
 * Course Ratings Module - Service Layer
 *
 * Business logic for course ratings and reviews.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  notFound,
  serviceSuccess,
  type ServiceResult,
} from "../../lib/service-errors";
import { CourseRatingRepository, type TenantContext } from "./repository";
import type {
  CreateCourseRating,
  CourseRatingResponse,
  CourseSummaryResponse,
} from "./schemas";

export class CourseRatingService {
  constructor(
    private repository: CourseRatingRepository,
    private db: DatabaseClient
  ) {}

  async listByCourse(
    ctx: TenantContext,
    courseId: string
  ): Promise<CourseRatingResponse[]> {
    return this.repository.listByCourse(ctx, courseId);
  }

  async getRating(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<CourseRatingResponse>> {
    return withServiceErrorHandling("fetching course rating", async () => {
      const rating = await this.repository.getById(ctx, id);
      if (!rating) return notFound("Course rating");
      return serviceSuccess(rating);
    });
  }

  async createRating(
    ctx: TenantContext,
    data: CreateCourseRating
  ): Promise<ServiceResult<CourseRatingResponse>> {
    return withServiceErrorHandling("creating course rating", async () => {
      const rating = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.create(ctx, data, tx);

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "course_rating",
            aggregateId: result.id,
            eventType: "lms.course.rated",
            payload: {
              rating: result,
              courseId: data.courseId,
              employeeId: data.employeeId,
            },
            userId: ctx.userId,
          });

          return result;
        }
      );

      return serviceSuccess(rating);
    }, {
      "23505": { code: "ALREADY_RATED", message: "Employee has already rated this course" },
    });
  }

  async getCourseSummary(
    ctx: TenantContext,
    courseId: string
  ): Promise<ServiceResult<CourseSummaryResponse>> {
    return withServiceErrorHandling("fetching course rating summary", async () => {
      const summary = await this.repository.getSummary(ctx, courseId);
      return serviceSuccess(summary);
    });
  }
}
