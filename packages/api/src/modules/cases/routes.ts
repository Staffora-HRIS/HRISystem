/**
 * Cases Module Routes
 *
 * HR Cases/Tickets management.
 * All routes delegate to CasesService for business logic,
 * including state machine validation for status transitions.
 */

import { Elysia, t } from "elysia";
import { CasesRepository } from "./repository";
import { CasesService } from "./service";
import { mapErrorToStatus } from "../../lib/route-helpers";
import { CaseStatusSchema, CasePrioritySchema } from "./schemas";

const UuidSchema = t.String({ format: "uuid" });

/** Module-specific error code overrides */
const CASES_ERROR_CODES: Record<string, number> = {
  CASE_CLOSED: 409,
  CANNOT_ESCALATE: 409,
  CANNOT_RESOLVE: 409,
  CANNOT_CLOSE: 409,
  INVALID_TRANSITION: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  COMMENT_FAILED: 500,
};

export const casesRoutes = new Elysia({ prefix: "/cases" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new CasesRepository(db);
    const service = new CasesService(repository, db);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { casesService: service, casesRepository: repository, tenantContext };
  })

  .get("/", async (ctx) => {
    const { tenant, user, casesService, tenantContext, query, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const { cursor, limit, ...filters } = query;
      const result = await casesService.listCases(
        tenantContext,
        filters,
        { cursor, limit: limit !== undefined && limit !== null ? Number(limit) : undefined }
      );

      return {
        cases: result.items,
        count: result.items.length,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    query: t.Object({
      category: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      assigneeId: t.Optional(UuidSchema),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    detail: { tags: ["Cases"], summary: "List cases" }
  })

  .post("/", async (ctx) => {
    const { tenant, user, casesService, tenantContext, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    const result = await casesService.createCase(tenantContext, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: t.Object({
      requesterId: UuidSchema,
      category: t.String({ minLength: 1, maxLength: 50 }),
      subject: t.String({ minLength: 1, maxLength: 200 }),
      description: t.Optional(t.String({ maxLength: 5000 })),
      priority: t.Optional(t.Union([
        t.Literal("low"),
        t.Literal("medium"),
        t.Literal("high"),
        t.Literal("urgent"),
      ])),
    }),
    detail: { tags: ["Cases"], summary: "Create case" }
  })

  .get("/:id", async (ctx) => {
    const { tenant, user, casesService, tenantContext, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    const result = await casesService.getCase(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["Cases"], summary: "Get case by ID" }
  })

  .patch("/:id", async (ctx) => {
    const { tenant, user, casesService, tenantContext, params, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    const result = await casesService.updateCase(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      status: t.Optional(CaseStatusSchema),
      priority: t.Optional(CasePrioritySchema),
      assigneeId: t.Optional(UuidSchema),
      resolution: t.Optional(t.String({ maxLength: 5000 })),
    }),
    detail: { tags: ["Cases"], summary: "Update case" }
  })

  // Case Comments
  .get("/:id/comments", async (ctx) => {
    const { tenant, user, casesService, tenantContext, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const comments = await casesService.listComments(tenantContext, params.id);
      return { comments, count: comments.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["Cases"], summary: "Get case comments" }
  })

  .post("/:id/comments", async (ctx) => {
    const { tenant, user, casesService, tenantContext, params, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    const result = await casesService.addComment(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      content: t.String({ minLength: 1, maxLength: 5000 }),
      isInternal: t.Optional(t.Boolean()),
    }),
    detail: { tags: ["Cases"], summary: "Add case comment" }
  })

  // My Cases
  .get("/my-cases", async (ctx) => {
    const { tenant, user, casesService, casesRepository, tenantContext, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const employeeId = await casesRepository.getEmployeeIdByUserId(tenantContext);

      if (!employeeId) {
        return { cases: [], count: 0 };
      }

      const cases = await casesService.getMyCases(tenantContext, employeeId);
      return { cases, count: cases.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    detail: { tags: ["Cases"], summary: "Get my cases" }
  });

export type CasesRoutes = typeof casesRoutes;
