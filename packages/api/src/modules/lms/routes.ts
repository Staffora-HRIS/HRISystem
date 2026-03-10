/**
 * LMS (Learning Management System) Routes
 *
 * Courses, enrollments, completions.
 * All routes delegate to LMSService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { LMSRepository } from "./repository";
import { LMSService } from "./service";
import { CreateLearningPathSchema } from "./schemas";
import { mapErrorToStatus } from "../../lib/route-helpers";

const UuidSchema = t.String({ format: "uuid" });

/** Module-specific error code overrides */
const LMS_ERROR_CODES: Record<string, number> = {
  COURSE_NOT_FOUND: 404,
  COURSE_NOT_PUBLISHED: 409,
  ALREADY_ENROLLED: 409,
  ALREADY_PUBLISHED: 409,
  INVALID_STATUS: 409,
  INVALID_COURSE: 400,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  ENROLLMENT_FAILED: 500,
  START_FAILED: 500,
  COMPLETE_FAILED: 500,
};

export const lmsRoutes = new Elysia({ prefix: "/lms" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new LMSRepository(db);
    const service = new LMSService(repository, db);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { lmsService: service, lmsRepository: repository, tenantContext };
  })

  // Courses
  .get("/courses", async (ctx) => {
    const { lmsService, tenantContext, query, set } = ctx as any;


    try {
      const { cursor, limit, ...filters } = query;
      const result = await lmsService.listCourses(
        tenantContext,
        filters,
        { cursor, limit: limit !== undefined && limit !== null ? Number(limit) : undefined }
      );

      return {
        courses: result.items,
        count: result.items.length,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: t.Object({
      category: t.Optional(t.String()),
      status: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["LMS"], summary: "List courses" }
  })

  .post("/courses", async (ctx) => {
    const { lmsService, tenantContext, body, set } = ctx as any;


    const result = await lmsService.createCourse(tenantContext, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, LMS_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: t.Object({
      title: t.String({ minLength: 1, maxLength: 200 }),
      description: t.Optional(t.String({ maxLength: 2000 })),
      category: t.Optional(t.String()),
      durationMinutes: t.Optional(t.Number()),
      contentType: t.Optional(t.String()),
      contentUrl: t.Optional(t.String({ maxLength: 500, pattern: "^https?://" })),
      thumbnailUrl: t.Optional(t.String({ maxLength: 500, pattern: "^https?://" })),
    }),
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["LMS"], summary: "Create course" }
  })

  .get("/courses/:id", async (ctx) => {
    const { lmsService, tenantContext, params, set } = ctx as any;


    const result = await lmsService.getCourse(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, LMS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["LMS"], summary: "Get course by ID" }
  })

  // Enrollments
  .get("/enrollments", async (ctx) => {
    const { lmsService, tenantContext, query, set } = ctx as any;


    try {
      const { cursor, limit, ...filters } = query;
      const result = await lmsService.listEnrollments(
        tenantContext,
        filters,
        { cursor, limit: limit !== undefined && limit !== null ? Number(limit) : undefined }
      );

      return {
        enrollments: result.items,
        count: result.items.length,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: t.Object({
      employeeId: t.Optional(UuidSchema),
      courseId: t.Optional(UuidSchema),
      status: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["LMS"], summary: "List enrollments" }
  })

  .post("/enrollments", async (ctx) => {
    const { lmsService, tenantContext, body, set } = ctx as any;


    const result = await lmsService.enrollEmployee(tenantContext, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, LMS_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: t.Object({
      courseId: UuidSchema,
      employeeId: UuidSchema,
      dueDate: t.Optional(t.String({ format: "date" })),
    }),
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["LMS"], summary: "Create enrollment" }
  })

  .post("/enrollments/:id/start", async (ctx) => {
    const { lmsService, tenantContext, params, set } = ctx as any;


    const result = await lmsService.startCourse(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, LMS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["LMS"], summary: "Start course" }
  })

  .post("/enrollments/:id/complete", async (ctx) => {
    const { lmsService, tenantContext, params, body, set } = ctx as any;


    const result = await lmsService.completeCourse(tenantContext, params.id, (body as any)?.score);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, LMS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Optional(t.Object({
      score: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
    })),
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["LMS"], summary: "Complete course" }
  })

  // Learning Paths
  .get("/learning-paths", async (ctx) => {
    const { lmsService, tenantContext, query, set } = ctx as any;

    try {
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit ? Number(limit) : undefined;
      const result = await lmsService.listLearningPaths(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: t.Object({
      search: t.Optional(t.String()),
      status: t.Optional(t.String()),
      category: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["LMS"], summary: "List learning paths" }
  })

  .get("/learning-paths/:id", async (ctx) => {
    const { lmsService, tenantContext, params, set } = ctx as any;

    try {
      const result = await lmsService.getLearningPath(tenantContext, params.id);

      if (!result.success) {
        set.status = 404;
        return { error: { code: result.error?.code, message: result.error?.message } };
      }

      return result.data;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["LMS"], summary: "Get learning path" }
  })

  .post("/learning-paths", async (ctx) => {
    const { lmsService, tenantContext, body, set } = ctx as any;

    try {
      const result = await lmsService.createLearningPath(tenantContext, body);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", LMS_ERROR_CODES);
        return { error: { code: result.error?.code, message: result.error?.message } };
      }

      set.status = 201;
      return result.data;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    body: CreateLearningPathSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["LMS"], summary: "Create learning path" }
  })

  // My Learning
  .get("/my-learning", async (ctx) => {
    const { lmsService, lmsRepository, tenantContext, set } = ctx as any;


    try {
      const employeeId = await lmsRepository.getEmployeeIdByUserId(tenantContext);

      if (!employeeId) {
        return { enrollments: [], count: 0 };
      }

      const enrollments = await lmsService.getMyLearning(tenantContext, employeeId);
      return { enrollments, count: enrollments.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["LMS"], summary: "Get my learning" }
  });

export type LmsRoutes = typeof lmsRoutes;
