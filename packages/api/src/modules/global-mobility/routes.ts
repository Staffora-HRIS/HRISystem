/**
 * Global Mobility Module - Elysia Routes
 *
 * Defines the API endpoints for international assignment tracking.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET    /global-mobility/assignments              — List international assignments
 * - GET    /global-mobility/assignments/expiring      — List expiring assignments
 * - GET    /global-mobility/assignments/:id           — Get assignment by ID
 * - POST   /global-mobility/assignments               — Create assignment
 * - PATCH  /global-mobility/assignments/:id           — Update assignment
 * - POST   /global-mobility/assignments/:id/transition — Transition assignment status
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { GlobalMobilityRepository } from "./repository";
import { GlobalMobilityService } from "./service";
import {
  CreateAssignmentSchema,
  UpdateAssignmentSchema,
  AssignmentStatusTransitionSchema,
  AssignmentFiltersSchema,
  PaginationQuerySchema,
  ExpiringAssignmentsQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  globalMobilityService: GlobalMobilityService;
  tenantContext: { tenantId: string; userId?: string } | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  set: { status: number };
}

// =============================================================================
// Routes
// =============================================================================

export const globalMobilityRoutes = new Elysia({
  prefix: "/global-mobility/assignments",
  name: "global-mobility-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new GlobalMobilityRepository(db);
    const service = new GlobalMobilityService(repository, db);
    return { globalMobilityService: service };
  })

  // GET /global-mobility/assignments — List international assignments
  .get(
    "/",
    async (ctx) => {
      const { globalMobilityService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit, ...filters } = query;
      const result = await globalMobilityService.listAssignments(
        tenantContext!,
        filters as Record<string, string | undefined>,
        {
          cursor,
          limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
        }
      );
      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      query: t.Intersect([PaginationQuerySchema, AssignmentFiltersSchema]),
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "List international assignments",
      },
    }
  )

  // GET /global-mobility/assignments/expiring — List assignments expiring within N days
  .get(
    "/expiring",
    async (ctx) => {
      const { globalMobilityService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.listExpiringAssignments(
        tenantContext!,
        {
          days: query.days !== undefined && query.days !== null ? Number(query.days) : undefined,
          cursor: query.cursor,
          limit: query.limit !== undefined && query.limit !== null ? Number(query.limit) : undefined,
        }
      );
      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      query: ExpiringAssignmentsQuerySchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "List expiring international assignments",
        description: "Returns active assignments with end dates within the specified number of days (default 30). Useful for proactive management of upcoming assignment completions and visa renewals.",
      },
    }
  )

  // GET /global-mobility/assignments/:id — Get assignment by ID
  .get(
    "/:id",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.getAssignment(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Get international assignment by ID",
      },
    }
  )

  // POST /global-mobility/assignments — Create assignment
  .post(
    "/",
    async (ctx) => {
      const { globalMobilityService, tenantContext, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.createAssignment(
        tenantContext!,
        body as Parameters<GlobalMobilityService["createAssignment"]>[1]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      body: CreateAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Create international assignment",
      },
    }
  )

  // PATCH /global-mobility/assignments/:id — Update assignment
  .patch(
    "/:id",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.updateAssignment(
        tenantContext!,
        params.id,
        body as Parameters<GlobalMobilityService["updateAssignment"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Update international assignment",
      },
    }
  )

  // POST /global-mobility/assignments/:id/transition — Transition assignment status
  .post(
    "/:id/transition",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.transitionStatus(
        tenantContext!,
        params.id,
        body as Parameters<GlobalMobilityService["transitionStatus"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: AssignmentStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Transition assignment status",
        description: "Transition assignment status. Valid transitions: planned->active/cancelled, active->completed/cancelled.",
      },
    }
  );

export type GlobalMobilityRoutes = typeof globalMobilityRoutes;
