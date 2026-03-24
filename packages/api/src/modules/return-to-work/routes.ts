/**
 * Return to Work Module - Elysia Routes
 *
 * Defines the API endpoints for return-to-work interview operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - absence: read, write (reuses absence management permissions)
 *
 * Endpoints:
 * - GET    /return-to-work           - List interviews (paginated, filterable)
 * - GET    /return-to-work/:id       - Get interview by ID
 * - POST   /return-to-work           - Create interview
 * - PUT    /return-to-work/:id       - Update interview
 * - PATCH  /return-to-work/:id/complete - Complete interview with assessment
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ReturnToWorkRepository } from "./repository";
import { ReturnToWorkService } from "./service";
import {
  CreateInterviewSchema,
  UpdateInterviewSchema,
  CompleteInterviewSchema,
  InterviewResponseSchema,
  InterviewListResponseSchema,
  InterviewFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateInterview,
  type UpdateInterview,
  type CompleteInterview,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface RTWPluginContext {
  rtwService: ReturnToWorkService;
  rtwRepository: ReturnToWorkRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface RTWRouteContext extends RTWPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Module-specific error codes beyond the shared base set
 */
const rtwErrorStatusMap: Record<string, number> = {
  EMPLOYEE_NOT_FOUND: 400,
  INTERVIEWER_NOT_FOUND: 400,
  LEAVE_REQUEST_NOT_FOUND: 400,
  INVALID_DATE_RANGE: 400,
};

/**
 * Audit action constants for return-to-work interviews.
 * Follows the existing AuditActions pattern but scoped to absence.rtw.
 */
const RTW_AUDIT_ACTIONS = {
  CREATED: "absence.rtw.created",
  UPDATED: "absence.rtw.updated",
  COMPLETED: "absence.rtw.completed",
} as const;

/**
 * Create return-to-work routes plugin
 */
export const returnToWorkRoutes = new Elysia({ prefix: "/return-to-work", name: "return-to-work-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ReturnToWorkRepository(db);
    const service = new ReturnToWorkService(repository, db);

    return { rtwService: service, rtwRepository: repository };
  })

  // ===========================================================================
  // GET / - List interviews
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { rtwService, query, tenantContext } = ctx as unknown as RTWRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await rtwService.listInterviews(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      query: t.Composite([
        t.Partial(InterviewFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: InterviewListResponseSchema,
      detail: {
        tags: ["Return to Work"],
        summary: "List return-to-work interviews",
        description:
          "List return-to-work interviews with optional filters and cursor-based pagination. " +
          "Filter by employee, interviewer, fit-for-work status, OH referral, date range, or leave request.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get interview by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { rtwService, params, tenantContext, error } = ctx as unknown as RTWRouteContext;
      const result = await rtwService.getInterview(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: IdParamsSchema,
      response: {
        200: InterviewResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Return to Work"],
        summary: "Get return-to-work interview by ID",
        description: "Get a single return-to-work interview by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST / - Create interview
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { rtwService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as RTWRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await rtwService.createInterview(
        tenantContext,
        body as unknown as CreateInterview,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: RTW_AUDIT_ACTIONS.CREATED,
          resourceType: "return_to_work_interview",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateInterviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: InterviewResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Return to Work"],
        summary: "Create return-to-work interview",
        description:
          "Create a new return-to-work interview record. " +
          "The interview_date must be on or after the absence_end_date. " +
          "Optionally link to a leave request.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /:id - Update interview
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const { rtwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as RTWRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await rtwService.getInterview(tenantContext, params.id);

      const result = await rtwService.updateInterview(
        tenantContext,
        params.id,
        body as unknown as UpdateInterview,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: RTW_AUDIT_ACTIONS.UPDATED,
          resourceType: "return_to_work_interview",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      body: UpdateInterviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: InterviewResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Return to Work"],
        summary: "Update return-to-work interview",
        description: "Update an existing return-to-work interview record",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/complete - Complete interview with assessment
  // ===========================================================================
  .patch(
    "/:id/complete",
    async (ctx) => {
      const { rtwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as RTWRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await rtwService.getInterview(tenantContext, params.id);

      const result = await rtwService.completeInterview(
        tenantContext,
        params.id,
        body as unknown as CompleteInterview,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the completion
      if (audit) {
        await audit.log({
          action: RTW_AUDIT_ACTIONS.COMPLETED,
          resourceType: "return_to_work_interview",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      body: CompleteInterviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: InterviewResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Return to Work"],
        summary: "Complete return-to-work interview",
        description:
          "Complete a return-to-work interview with final assessment data. " +
          "Sets the fit-for-work status, any required adjustments, " +
          "occupational health referral flag, and interview notes.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Alias routes: /interviews — frontend calls /return-to-work/interviews
  // These delegate to the same service methods as the root routes above.
  // ===========================================================================

  // GET /return-to-work/interviews - Alias for GET /return-to-work/
  .get(
    "/interviews",
    async (ctx) => {
      const { rtwService, query, tenantContext } = ctx as unknown as RTWRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await rtwService.listInterviews(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      query: t.Composite([
        t.Partial(InterviewFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: InterviewListResponseSchema,
      detail: {
        tags: ["Return to Work"],
        summary: "List return-to-work interviews (alias)",
        description:
          "Alias for GET /return-to-work — list return-to-work interviews with optional filters and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /return-to-work/interviews - Alias for POST /return-to-work/
  .post(
    "/interviews",
    async (ctx) => {
      const { rtwService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as RTWRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await rtwService.createInterview(
        tenantContext,
        body as unknown as CreateInterview,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: RTW_AUDIT_ACTIONS.CREATED,
          resourceType: "return_to_work_interview",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateInterviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: InterviewResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Return to Work"],
        summary: "Create return-to-work interview (alias)",
        description:
          "Alias for POST /return-to-work — create a new return-to-work interview record. " +
          "The interview_date must be on or after the absence_end_date. " +
          "Optionally link to a leave request.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ReturnToWorkRoutes = typeof returnToWorkRoutes;
