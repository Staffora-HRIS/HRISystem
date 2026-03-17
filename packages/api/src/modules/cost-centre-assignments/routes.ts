/**
 * Cost Centre Assignments Module - Elysia Routes
 *
 * Defines the API endpoints for cost centre assignment tracking with
 * effective dating. Supports employees, departments, and positions.
 *
 * Endpoints:
 * - GET    /cost-centre-assignments                            -- List assignments (filterable)
 * - GET    /cost-centre-assignments/:id                        -- Get assignment by ID
 * - GET    /cost-centre-assignments/history/:entityType/:entityId -- Get entity history
 * - POST   /cost-centre-assignments                            -- Create assignment
 * - PATCH  /cost-centre-assignments/:id                        -- Update assignment
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { CostCentreAssignmentRepository } from "./repository";
import { CostCentreAssignmentService } from "./service";
import {
  CreateCostCentreAssignmentSchema,
  UpdateCostCentreAssignmentSchema,
  CostCentreAssignmentFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EntityHistoryParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  costCentreAssignmentService: CostCentreAssignmentService;
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

export const costCentreAssignmentRoutes = new Elysia({
  prefix: "/cost-centre-assignments",
  name: "cost-centre-assignment-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new CostCentreAssignmentRepository(db);
    const service = new CostCentreAssignmentService(repository, db);
    return { costCentreAssignmentService: service };
  })

  // GET /cost-centre-assignments -- List assignments
  .get(
    "/",
    async (ctx) => {
      const { costCentreAssignmentService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit, ...filters } = query;
      const result = await costCentreAssignmentService.listAssignments(
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
      query: t.Intersect([PaginationQuerySchema, CostCentreAssignmentFiltersSchema]),
      beforeHandle: [requirePermission("org_units", "read")],
      detail: {
        tags: ["Cost Centre Assignments"],
        summary: "List cost centre assignments",
        description:
          "List cost centre assignments with optional filters for entity type, entity ID, cost centre, current-only, and point-in-time queries.",
      },
    }
  )

  // GET /cost-centre-assignments/history/:entityType/:entityId -- Get entity history
  .get(
    "/history/:entityType/:entityId",
    async (ctx) => {
      const { costCentreAssignmentService, tenantContext, params, query, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit } = query;
      const result = await costCentreAssignmentService.getEntityHistory(
        tenantContext!,
        params.entityType as Parameters<CostCentreAssignmentService["getEntityHistory"]>[1],
        params.entityId,
        {
          cursor,
          limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
        }
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: EntityHistoryParamsSchema,
      query: PaginationQuerySchema,
      beforeHandle: [requirePermission("org_units", "read")],
      detail: {
        tags: ["Cost Centre Assignments"],
        summary: "Get cost centre assignment history for an entity",
        description:
          "Returns the full effective-dated cost centre assignment history for an employee, department, or position.",
      },
    }
  )

  // GET /cost-centre-assignments/:id -- Get assignment by ID
  .get(
    "/:id",
    async (ctx) => {
      const { costCentreAssignmentService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await costCentreAssignmentService.getAssignment(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("org_units", "read")],
      detail: {
        tags: ["Cost Centre Assignments"],
        summary: "Get cost centre assignment by ID",
      },
    }
  )

  // POST /cost-centre-assignments -- Create assignment
  .post(
    "/",
    async (ctx) => {
      const { costCentreAssignmentService, tenantContext, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await costCentreAssignmentService.createAssignment(
        tenantContext!,
        body as Parameters<CostCentreAssignmentService["createAssignment"]>[1]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      body: CreateCostCentreAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("org_units", "write")],
      detail: {
        tags: ["Cost Centre Assignments"],
        summary: "Create cost centre assignment",
        description:
          "Create a new effective-dated cost centre assignment. Automatically closes the current open assignment for the same entity+cost_centre combination.",
      },
    }
  )

  // PATCH /cost-centre-assignments/:id -- Update assignment
  .patch(
    "/:id",
    async (ctx) => {
      const { costCentreAssignmentService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await costCentreAssignmentService.updateAssignment(
        tenantContext!,
        params.id,
        body as Parameters<CostCentreAssignmentService["updateAssignment"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateCostCentreAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("org_units", "write")],
      detail: {
        tags: ["Cost Centre Assignments"],
        summary: "Update cost centre assignment",
        description:
          "Update percentage allocation or close an assignment by setting effective_to.",
      },
    }
  );

export type CostCentreAssignmentRoutes = typeof costCentreAssignmentRoutes;
