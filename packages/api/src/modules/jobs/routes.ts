/**
 * Jobs Catalog Module - Elysia Routes
 *
 * Defines the API endpoints for the Jobs Catalog.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - jobs: read, write
 *
 * Endpoints:
 *   GET    /jobs          - List jobs with filters and cursor-based pagination
 *   GET    /jobs/:id      - Get job by ID
 *   POST   /jobs          - Create a new job
 *   PUT    /jobs/:id      - Update an existing job
 *   PATCH  /jobs/:id/archive - Archive a job
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { JobsRepository } from "./repository";
import { JobsService } from "./service";
import {
  CreateJobSchema,
  UpdateJobSchema,
  JobResponseSchema,
  JobListItemSchema,
  JobFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateJob,
  type UpdateJob,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface JobsPluginContext {
  jobsService: JobsService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface JobsRouteContext extends JobsPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Jobs module-specific error codes beyond the shared base set
 */
const jobsErrorStatusMap: Record<string, number> = {
  DUPLICATE_CODE: 409,
  INVALID_SALARY_RANGE: 400,
};

/**
 * Jobs catalog routes plugin
 */
export const jobsRoutes = new Elysia({ prefix: "/jobs", name: "jobs-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new JobsRepository(db);
    const service = new JobsService(repository, db);

    return { jobsService: service };
  })

  // ===========================================================================
  // List Jobs
  // ===========================================================================

  // GET /jobs - List jobs with filters and cursor-based pagination
  .get(
    "/",
    async (ctx) => {
      const { jobsService, query, tenantContext } = ctx as unknown as JobsRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await jobsService.listJobs(tenantContext, filters, {
        cursor,
        limit: parsedLimit,
      });

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("jobs", "read")],
      query: t.Composite([
        t.Partial(JobFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(JobListItemSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Jobs"],
        summary: "List jobs",
        description:
          "List jobs with optional filters (status, family, job_grade, search) and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get Job by ID
  // ===========================================================================

  // GET /jobs/:id - Get a single job by ID
  .get(
    "/:id",
    async (ctx) => {
      const { jobsService, params, tenantContext, error } = ctx as unknown as JobsRouteContext;
      const result = await jobsService.getJob(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          jobsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("jobs", "read")],
      params: IdParamsSchema,
      response: {
        200: JobResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Jobs"],
        summary: "Get job by ID",
        description: "Get a single job from the catalog by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Create Job
  // ===========================================================================

  // POST /jobs - Create a new job
  .post(
    "/",
    async (ctx) => {
      const {
        jobsService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as JobsRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await jobsService.createJob(
        tenantContext,
        body as unknown as CreateJob,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          jobsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "hr.job.created",
          resourceType: "job",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("jobs", "write")],
      body: CreateJobSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: JobResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Jobs"],
        summary: "Create job",
        description:
          "Create a new job in the catalog. Code must be unique per tenant.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Update Job
  // ===========================================================================

  // PUT /jobs/:id - Update an existing job
  .put(
    "/:id",
    async (ctx) => {
      const {
        jobsService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as JobsRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await jobsService.getJob(tenantContext, params.id);

      const result = await jobsService.updateJob(
        tenantContext,
        params.id,
        body as unknown as UpdateJob,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          jobsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "hr.job.updated",
          resourceType: "job",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("jobs", "write")],
      params: IdParamsSchema,
      body: UpdateJobSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: JobResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Jobs"],
        summary: "Update job",
        description:
          "Update an existing job. Validates status transitions and salary range.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Archive Job
  // ===========================================================================

  // PATCH /jobs/:id/archive - Archive a job
  .patch(
    "/:id/archive",
    async (ctx) => {
      const {
        jobsService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as JobsRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await jobsService.getJob(tenantContext, params.id);

      const result = await jobsService.archiveJob(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          jobsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the archive
      if (audit) {
        await audit.log({
          action: "hr.job.archived",
          resourceType: "job",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("jobs", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: JobResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Jobs"],
        summary: "Archive job",
        description:
          "Archive a job. Only allowed from 'active' or 'frozen' status. Archived jobs cannot be reactivated.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type JobsRoutes = typeof jobsRoutes;
