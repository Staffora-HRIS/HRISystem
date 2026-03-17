/**
 * Job Boards Module Routes
 *
 * API endpoints for publishing vacancies to external job boards.
 *
 * Endpoints:
 *   POST   /job-boards/postings        - Publish a vacancy to a job board
 *   GET    /job-boards/postings        - List postings with filters
 *   GET    /job-boards/postings/:id    - Get posting status by ID
 *   DELETE /job-boards/postings/:id    - Remove a posting from a job board
 *   GET    /job-boards/boards          - List supported job boards
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import { ErrorCodes } from "../../plugins/errors";
import { JobBoardsRepository } from "./repository";
import { JobBoardsService } from "./service";
import {
  IdParamsSchema,
  PaginationQuerySchema,
  PublishPostingSchema,
  PostingFiltersSchema,
  JobBoardPostingResponseSchema,
} from "./schemas";

// =============================================================================
// Routes
// =============================================================================

export const jobBoardRoutes = new Elysia({ prefix: "/job-boards", name: "job-boards-routes" })

  // Derive services
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new JobBoardsRepository(db);
    const service = new JobBoardsService(db);
    return { jobBoardsService: service, jobBoardsRepository: repository };
  })

  // ===========================================================================
  // GET /boards - List supported job boards
  // ===========================================================================
  .get(
    "/boards",
    async (ctx) => {
      const { jobBoardsService } = ctx as any;
      return { boards: jobBoardsService.getSupportedBoards() };
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      response: {
        200: t.Object({
          boards: t.Array(
            t.Object({
              id: t.String(),
              name: t.String(),
              baseUrl: t.String(),
              description: t.String(),
            })
          ),
        }),
      },
      detail: {
        tags: ["Recruitment - Job Boards"],
        summary: "List supported job boards",
        description:
          "Returns metadata for all supported UK job boards (Indeed, LinkedIn, Reed, Totaljobs)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /postings - Publish a vacancy to a job board
  // ===========================================================================
  .post(
    "/postings",
    async (ctx) => {
      const { jobBoardsService, body, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const posting = await jobBoardsService.publishToBoard(tenantContext, body);

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.job_board.posted",
            resourceType: "job_board_posting",
            resourceId: posting.id,
            newValues: posting,
          });
        }

        return posting;
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return error(404, {
            error: { code: ErrorCodes.NOT_FOUND, message: err.message },
          });
        }
        if (
          err.message.includes("already posted") ||
          err.message.includes("Unsupported job board")
        ) {
          return error(409, {
            error: { code: "CONFLICT", message: err.message },
          });
        }
        if (err.message.includes("must be in")) {
          return error(400, {
            error: { code: ErrorCodes.VALIDATION_ERROR, message: err.message },
          });
        }
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: PublishPostingSchema,
      response: {
        200: JobBoardPostingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Job Boards"],
        summary: "Publish vacancy to job board",
        description:
          "Publishes a requisition (vacancy) to an external job board. " +
          "The requisition must be in 'open' status. " +
          "Supported boards: Indeed, LinkedIn, Reed, Totaljobs.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /postings - List postings with filters
  // ===========================================================================
  .get(
    "/postings",
    async (ctx) => {
      const { jobBoardsService, query, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const result = await jobBoardsService.listPostings(tenantContext, {
          cursor: query.cursor,
          limit: query.limit,
          vacancyId: query.vacancyId,
          boardName: query.boardName,
          status: query.status,
        });

        return {
          postings: result.items,
          count: result.items.length,
          ...result,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(PostingFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Job Boards"],
        summary: "List job board postings",
        description:
          "List all job board postings with optional filters by vacancy, board, or status",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /postings/:id - Get posting status
  // ===========================================================================
  .get(
    "/postings/:id",
    async (ctx) => {
      const { jobBoardsService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const posting = await jobBoardsService.getPosting(tenantContext, params.id);
        if (!posting) {
          return error(404, {
            error: { code: ErrorCodes.NOT_FOUND, message: "Job board posting not found" },
          });
        }
        return posting;
      } catch (err: any) {
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      response: {
        200: JobBoardPostingResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Job Boards"],
        summary: "Get posting status",
        description: "Get the current status and details of a job board posting",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DELETE /postings/:id - Remove a posting from a job board
  // ===========================================================================
  .delete(
    "/postings/:id",
    async (ctx) => {
      const { jobBoardsService, params, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const removed = await jobBoardsService.removePosting(tenantContext, params.id);
        if (!removed) {
          return error(404, {
            error: { code: ErrorCodes.NOT_FOUND, message: "Job board posting not found" },
          });
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.job_board.removed",
            resourceType: "job_board_posting",
            resourceId: params.id,
          });
        }

        return { success: true, message: "Job board posting removed" };
      } catch (err: any) {
        if (err.message.includes("already been removed")) {
          return error(409, {
            error: { code: "CONFLICT", message: err.message },
          });
        }
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ success: t.Literal(true), message: t.String() }),
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Job Boards"],
        summary: "Remove posting from job board",
        description:
          "Removes a posting from a job board by setting its status to 'removed'. " +
          "The posting record is retained for audit purposes.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type JobBoardRoutes = typeof jobBoardRoutes;
