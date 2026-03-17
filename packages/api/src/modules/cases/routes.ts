/**
 * Cases Module Routes
 *
 * HR Cases/Tickets management.
 * All routes delegate to CasesService for business logic,
 * including state machine validation for status transitions.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
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
  INVALID_STATUS: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  COMMENT_FAILED: 500,
  APPEAL_FAILED: 500,
  APPEAL_DECISION_FAILED: 500,
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
    const { casesService, tenantContext, query, set } = ctx as any;

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
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
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
    beforeHandle: [requirePermission("cases", "read")],
    detail: { tags: ["Cases"], summary: "List cases" }
  })

  .post("/", async (ctx) => {
    const { casesService, tenantContext, body, set } = ctx as any;

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
    beforeHandle: [requirePermission("cases", "write")],
    detail: { tags: ["Cases"], summary: "Create case" }
  })

  .get("/:id", async (ctx) => {
    const { casesService, tenantContext, params, set } = ctx as any;

    const result = await casesService.getCase(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: { tags: ["Cases"], summary: "Get case by ID" }
  })

  .patch("/:id", async (ctx) => {
    const { casesService, tenantContext, params, body, set } = ctx as any;

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
    beforeHandle: [requirePermission("cases", "write")],
    detail: { tags: ["Cases"], summary: "Update case" }
  })

  // Case Comments
  .get("/:id/comments", async (ctx) => {
    const { casesService, tenantContext, params, set } = ctx as any;

    try {
      const comments = await casesService.listComments(tenantContext, params.id);
      return { comments, count: comments.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: { tags: ["Cases"], summary: "Get case comments" }
  })

  .post("/:id/comments", async (ctx) => {
    const { casesService, tenantContext, params, body, set } = ctx as any;

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
    beforeHandle: [requirePermission("cases", "write")],
    detail: { tags: ["Cases"], summary: "Add case comment" }
  })

  // ===========================================================================
  // Appeal Routes (ACAS Code of Practice compliant)
  //
  // ACAS Code para 26-27: right to appeal, heard by different manager.
  // ===========================================================================

  // POST /:id/appeals - File an appeal against a resolved case
  .post("/:id/appeals", async (ctx) => {
    const { casesService, tenantContext, params, body, set } = ctx as any;

    const result = await casesService.fileAppeal(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      reason: t.String({ minLength: 1, maxLength: 5000 }),
      appealGrounds: t.Optional(t.String({ maxLength: 10000 })),
      hearingOfficerId: t.Optional(UuidSchema),
      hearingDate: t.Optional(t.String({ format: "date-time" })),
    }),
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "File case appeal",
      description: "File an appeal against a resolved case. The hearing officer (if specified) must be a different person from the original decision maker per ACAS Code para 27.",
    },
  })

  // GET /:id/appeals - Get all appeals for a case
  .get("/:id/appeals", async (ctx) => {
    const { casesService, tenantContext, params, set } = ctx as any;

    const result = await casesService.listAppeals(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return { appeals: result.data, count: result.data!.length };
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: {
      tags: ["Cases"],
      summary: "List case appeals",
      description: "Get all appeals for a case, ordered by most recent first.",
    },
  })

  // GET /:id/appeals/latest - Get the most recent appeal for a case
  .get("/:id/appeals/latest", async (ctx) => {
    const { casesService, tenantContext, params, set } = ctx as any;

    const result = await casesService.getAppeal(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: {
      tags: ["Cases"],
      summary: "Get latest case appeal",
      description: "Get the most recent appeal for a case.",
    },
  })

  // PATCH /:id/appeals/decide - Decide an appeal outcome
  .patch("/:id/appeals/decide", async (ctx) => {
    const { casesService, tenantContext, params, body, set } = ctx as any;

    const result = await casesService.decideAppeal(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      decision: t.Union([
        t.Literal("upheld"),
        t.Literal("overturned"),
        t.Literal("partially_upheld"),
      ]),
      outcomeNotes: t.String({ minLength: 1, maxLength: 5000 }),
      hearingOfficerId: t.Optional(UuidSchema),
    }),
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Decide case appeal",
      description: "Decide the outcome of a pending appeal. The deciding officer must NOT be the original decision maker (ACAS Code para 27). Overturned appeals reopen the case; upheld/partially upheld close it.",
    },
  })

  // Keep backward-compatible aliases for the old routes
  // POST /:id/appeal -> redirect to /:id/appeals
  .post("/:id/appeal", async (ctx) => {
    const { casesService, tenantContext, params, body, set } = ctx as any;

    const result = await casesService.fileAppeal(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      reason: t.String({ minLength: 1, maxLength: 5000 }),
      appealGrounds: t.Optional(t.String({ maxLength: 10000 })),
      hearingOfficerId: t.Optional(UuidSchema),
      hearingDate: t.Optional(t.String({ format: "date-time" })),
    }),
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "File case appeal (legacy)",
      description: "Legacy route. Use POST /:id/appeals instead.",
    },
  })

  // GET /:id/appeal -> redirect to /:id/appeals/latest
  .get("/:id/appeal", async (ctx) => {
    const { casesService, tenantContext, params, set } = ctx as any;

    const result = await casesService.getAppeal(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, CASES_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: {
      tags: ["Cases"],
      summary: "Get case appeal (legacy)",
      description: "Legacy route. Use GET /:id/appeals/latest instead.",
    },
  })

  // My Cases
  .get("/my-cases", async (ctx) => {
    const { casesService, casesRepository, tenantContext, set } = ctx as any;

    try {
      const employeeId = await casesRepository.getEmployeeIdByUserId(tenantContext);

      if (!employeeId) {
        return { cases: [], count: 0 };
      }

      const cases = await casesService.getMyCases(tenantContext, employeeId);
      return { cases, count: cases.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    beforeHandle: [requirePermission("cases", "read")],
    detail: { tags: ["Cases"], summary: "Get my cases" }
  });

export type CasesRoutes = typeof casesRoutes;
