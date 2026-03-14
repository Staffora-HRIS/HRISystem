/**
 * Course Ratings Module Routes
 *
 * Endpoints for course ratings and reviews.
 * All routes delegate to CourseRatingService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import type { DatabaseClient } from "../../plugins/db";
import { CourseRatingRepository } from "./repository";
import { CourseRatingService } from "./service";
import { CreateCourseRatingSchema, type CreateCourseRating } from "./schemas";
import { getHttpStatus } from "../../lib/route-errors";

const UuidSchema = t.String({ format: "uuid" });

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

interface DerivedContext {
  ratingService: CourseRatingService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  requestId: string;
}

function errorResponse(result: unknown, set: { status: number }, requestId: string) {
  const err = (result as { error: { code: string; message: string; details?: unknown } }).error;
  set.status = getHttpStatus(err.code);
  return { error: { code: err.code, message: err.message, details: err.details, requestId } };
}

export const courseRatingRoutes = new Elysia({ prefix: "/course-ratings" })

  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new CourseRatingRepository(db);
    const service = new CourseRatingService(repository, db);
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };
    return { ratingService: service, tenantContext };
  })

  // ===========================================================================
  // Course Rating Endpoints
  // ===========================================================================

  .get("/course/:courseId", async (ctx) => {
    const { ratingService, tenantContext, params, set } = ctx as unknown as DerivedContext;

    try {
      const ratings = await ratingService.listByCourse(tenantContext, params.courseId);
      return { ratings, count: ratings.length };
    } catch (error: unknown) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) } };
    }
  }, {
    params: t.Object({ courseId: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["Course Ratings"], summary: "List ratings for a course" },
  })

  .get("/summary/:courseId", async (ctx) => {
    const { ratingService, tenantContext, params, set, requestId } = ctx as unknown as DerivedContext;

    const result = await ratingService.getCourseSummary(tenantContext, params.courseId);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ courseId: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["Course Ratings"], summary: "Get rating summary for a course" },
  })

  .post("/", async (ctx) => {
    const { ratingService, tenantContext, body, set, requestId } = ctx as unknown as DerivedContext;

    const result = await ratingService.createRating(tenantContext, body as CreateCourseRating);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    set.status = 201;
    return result.data;
  }, {
    body: CreateCourseRatingSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["Course Ratings"], summary: "Submit a course rating" },
  });

export type CourseRatingRoutes = typeof courseRatingRoutes;
