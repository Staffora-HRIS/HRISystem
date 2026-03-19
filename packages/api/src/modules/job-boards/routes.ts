/**
 * Job Boards Module Routes
 *
 * API endpoints for managing job board integrations and publishing
 * vacancies to external UK job boards.
 *
 * Integration Endpoints:
 *   GET    /job-boards/integrations        - List configured integrations
 *   POST   /job-boards/integrations        - Add a new integration
 *   GET    /job-boards/integrations/:id    - Get integration by ID
 *   PATCH  /job-boards/integrations/:id    - Update an integration
 *   DELETE /job-boards/integrations/:id    - Remove an integration
 *
 * Posting Endpoints:
 *   POST   /job-boards/postings            - Publish a vacancy to a job board
 *   GET    /job-boards/postings            - List postings with filters
 *   GET    /job-boards/postings/:id        - Get posting status by ID
 *   DELETE /job-boards/postings/:id        - Withdraw a posting
 *
 * Multi-Board:
 *   POST   /job-boards/post/:jobId         - Post a job to selected boards
 *
 * Metadata:
 *   GET    /job-boards/boards              - List supported job boards
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import { ErrorCodes } from "../../plugins/errors";
import { JobBoardsRepository } from "./repository";
import { JobBoardsService } from "./service";
import {
  IdParamsSchema,
  JobIdParamsSchema,
  PaginationQuerySchema,
  CreateIntegrationSchema,
  UpdateIntegrationSchema,
  JobBoardIntegrationResponseSchema,
  JobBoardProviderSchema,
  PublishPostingSchema,
  PostToMultipleBoardsSchema,
  PostingFiltersSchema,
  JobBoardPostingResponseSchema,
  MultiPostResponseSchema,
} from "./schemas";

// =============================================================================
// Routes
// =============================================================================

export const jobBoardRoutes = new Elysia({ prefix: "/job-boards", name: "job-boards-routes" })

  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new JobBoardsRepository(db);
    const service = new JobBoardsService(db);
    return { jobBoardsService: service, jobBoardsRepository: repository };
  })

  // GET /boards
  .get("/boards", async (ctx) => {
    const { jobBoardsService } = ctx as any;
    return { boards: jobBoardsService.getSupportedBoards() };
  }, {
    beforeHandle: [requirePermission("recruitment", "read")],
    response: { 200: t.Object({ boards: t.Array(t.Object({ id: t.String(), name: t.String(), baseUrl: t.String(), description: t.String() })) }) },
    detail: { tags: ["Recruitment - Job Boards"], summary: "List supported job boards", description: "Returns metadata for all supported UK job boards (Indeed, LinkedIn, Reed, Totaljobs, CWJobs)", security: [{ bearerAuth: [] }] },
  })

  // GET /integrations
  .get("/integrations", async (ctx) => {
    const { jobBoardsService, query, tenant, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const result = await jobBoardsService.listIntegrations(tenantContext, { cursor: query.cursor, limit: query.limit, provider: query.provider });
      return { integrations: result.items, count: result.items.length, ...result };
    } catch (err: any) {
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "read")],
    query: t.Composite([t.Partial(t.Object({ provider: JobBoardProviderSchema })), t.Partial(PaginationQuerySchema)]),
    detail: { tags: ["Recruitment - Job Boards"], summary: "List configured integrations", description: "List all job board integrations configured for this tenant. Config values are redacted.", security: [{ bearerAuth: [] }] },
  })

  // POST /integrations
  .post("/integrations", async (ctx) => {
    const { jobBoardsService, body, tenant, audit, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const integration = await jobBoardsService.createIntegration(tenantContext, body);
      if (audit) await audit.log({ action: "recruitment.job_board.integration_created", resourceType: "job_board_integration", resourceId: integration.id, newValues: { provider: integration.provider, enabled: integration.enabled } });
      return integration;
    } catch (err: any) {
      if (err.message.includes("already exists") || err.message.includes("Unsupported provider")) return error(409, { error: { code: "CONFLICT", message: err.message } });
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "write")],
    body: CreateIntegrationSchema,
    response: { 200: JobBoardIntegrationResponseSchema, 409: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Add a new integration", description: "Configure a new job board integration for this tenant. Only one integration per provider is allowed.", security: [{ bearerAuth: [] }] },
  })

  // GET /integrations/:id
  .get("/integrations/:id", async (ctx) => {
    const { jobBoardsService, params, tenant, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const integration = await jobBoardsService.getIntegration(tenantContext, params.id);
      if (!integration) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: "Job board integration not found" } });
      return integration;
    } catch (err: any) {
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "read")],
    params: IdParamsSchema,
    response: { 200: JobBoardIntegrationResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Get integration by ID", description: "Get a single job board integration. Config values are redacted.", security: [{ bearerAuth: [] }] },
  })

  // PATCH /integrations/:id
  .patch("/integrations/:id", async (ctx) => {
    const { jobBoardsService, params, body, tenant, audit, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const integration = await jobBoardsService.updateIntegration(tenantContext, params.id, body);
      if (!integration) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: "Job board integration not found" } });
      if (audit) await audit.log({ action: "recruitment.job_board.integration_updated", resourceType: "job_board_integration", resourceId: integration.id, newValues: { provider: integration.provider, enabled: integration.enabled } });
      return integration;
    } catch (err: any) {
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "write")],
    params: IdParamsSchema,
    body: UpdateIntegrationSchema,
    response: { 200: JobBoardIntegrationResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Update an integration", description: "Update an existing job board integration config, enabled status, or display name.", security: [{ bearerAuth: [] }] },
  })

  // DELETE /integrations/:id
  .delete("/integrations/:id", async (ctx) => {
    const { jobBoardsService, params, tenant, audit, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const deleted = await jobBoardsService.deleteIntegration(tenantContext, params.id);
      if (!deleted) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: "Job board integration not found" } });
      if (audit) await audit.log({ action: "recruitment.job_board.integration_deleted", resourceType: "job_board_integration", resourceId: params.id });
      return { success: true as const, message: "Integration deleted" };
    } catch (err: any) {
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "write")],
    params: IdParamsSchema,
    response: { 200: t.Object({ success: t.Literal(true), message: t.String() }), 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Remove an integration", description: "Delete a job board integration. Existing postings are retained with NULL integration_id.", security: [{ bearerAuth: [] }] },
  })

  // POST /postings
  .post("/postings", async (ctx) => {
    const { jobBoardsService, body, tenant, audit, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const posting = await jobBoardsService.publishToBoard(tenantContext, body);
      if (audit) await audit.log({ action: "recruitment.job_board.posted", resourceType: "job_board_posting", resourceId: posting.id, newValues: posting });
      return posting;
    } catch (err: any) {
      if (err.message.includes("not found")) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: err.message } });
      if (err.message.includes("already posted") || err.message.includes("Unsupported job board") || err.message.includes("disabled")) return error(409, { error: { code: "CONFLICT", message: err.message } });
      if (err.message.includes("must be in")) return error(400, { error: { code: ErrorCodes.VALIDATION_ERROR, message: err.message } });
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "write")],
    body: PublishPostingSchema,
    response: { 200: JobBoardPostingResponseSchema, 400: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Publish vacancy to job board", description: "Publishes a requisition to an external job board. The requisition must be in 'open' status. Supported: Indeed, LinkedIn, Reed, Totaljobs, CWJobs.", security: [{ bearerAuth: [] }] },
  })

  // POST /post/:jobId - Multi-board posting
  .post("/post/:jobId", async (ctx) => {
    const { jobBoardsService, params, body, tenant, audit, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const result = await jobBoardsService.postToMultipleBoards(tenantContext, params.jobId, body.boards);
      if (audit) await audit.log({ action: "recruitment.job_board.multi_posted", resourceType: "job_board_posting", resourceId: params.jobId, newValues: { boards: body.boards.map((b: any) => b.provider), successCount: result.successCount, failureCount: result.failureCount } });
      return result;
    } catch (err: any) {
      if (err.message.includes("not found")) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: err.message } });
      if (err.message.includes("must be in")) return error(400, { error: { code: ErrorCodes.VALIDATION_ERROR, message: err.message } });
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "write")],
    params: JobIdParamsSchema,
    body: PostToMultipleBoardsSchema,
    response: { 200: MultiPostResponseSchema, 400: ErrorResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Post job to selected boards", description: "Post a requisition to multiple job boards at once. Partial failures are reported without rolling back successful postings.", security: [{ bearerAuth: [] }] },
  })

  // GET /postings
  .get("/postings", async (ctx) => {
    const { jobBoardsService, query, tenant, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const result = await jobBoardsService.listPostings(tenantContext, { cursor: query.cursor, limit: query.limit, vacancyId: query.vacancyId, boardName: query.boardName, status: query.status });
      return { postings: result.items, count: result.items.length, ...result };
    } catch (err: any) {
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "read")],
    query: t.Composite([t.Partial(PostingFiltersSchema), t.Partial(PaginationQuerySchema)]),
    detail: { tags: ["Recruitment - Job Boards"], summary: "List job board postings", description: "List all job board postings with optional filters by vacancy, board, or status", security: [{ bearerAuth: [] }] },
  })

  // GET /postings/:id
  .get("/postings/:id", async (ctx) => {
    const { jobBoardsService, params, tenant, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const posting = await jobBoardsService.getPosting(tenantContext, params.id);
      if (!posting) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: "Job board posting not found" } });
      return posting;
    } catch (err: any) {
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "read")],
    params: IdParamsSchema,
    response: { 200: JobBoardPostingResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Get posting status", description: "Get the current status and details of a job board posting", security: [{ bearerAuth: [] }] },
  })

  // DELETE /postings/:id - Withdraw
  .delete("/postings/:id", async (ctx) => {
    const { jobBoardsService, params, tenant, audit, error } = ctx as any;
    const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };
    try {
      const withdrawn = await jobBoardsService.withdrawPosting(tenantContext, params.id);
      if (!withdrawn) return error(404, { error: { code: ErrorCodes.NOT_FOUND, message: "Job board posting not found" } });
      if (audit) await audit.log({ action: "recruitment.job_board.withdrawn", resourceType: "job_board_posting", resourceId: params.id });
      return { success: true as const, message: "Job board posting withdrawn" };
    } catch (err: any) {
      if (err.message.includes("already been withdrawn")) return error(409, { error: { code: "CONFLICT", message: err.message } });
      return error(500, { error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message } });
    }
  }, {
    beforeHandle: [requirePermission("recruitment", "write")],
    params: IdParamsSchema,
    response: { 200: t.Object({ success: t.Literal(true), message: t.String() }), 404: ErrorResponseSchema, 409: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["Recruitment - Job Boards"], summary: "Withdraw posting from job board", description: "Withdraws a posting from a job board. The provider is notified. The posting record is retained for audit.", security: [{ bearerAuth: [] }] },
  });

export type JobBoardRoutes = typeof jobBoardRoutes;
