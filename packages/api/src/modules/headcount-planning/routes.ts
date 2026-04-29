/**
 * Headcount Planning Module - Elysia Routes
 *
 * Defines the API endpoints for headcount plan management.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET    /headcount-planning/plans                    — List plans
 * - GET    /headcount-planning/plans/:id                — Get plan
 * - POST   /headcount-planning/plans                    — Create plan
 * - PATCH  /headcount-planning/plans/:id                — Update plan
 * - POST   /headcount-planning/plans/:id/approve        — Approve plan
 * - DELETE /headcount-planning/plans/:id                — Delete plan
 * - GET    /headcount-planning/plans/:id/items            — List items
 * - POST   /headcount-planning/plans/:id/items            — Add item
 * - PATCH  /headcount-planning/plans/:id/items/:itemId    — Update item
 * - DELETE /headcount-planning/plans/:id/items/:itemId    — Delete item
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { HeadcountPlanningRepository } from "./repository";
import { HeadcountPlanningService } from "./service";
import {
  CreatePlanSchema,
  UpdatePlanSchema,
  CreatePlanItemSchema,
  UpdatePlanItemSchema,
  PlanFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  PlanItemParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  headcountService: HeadcountPlanningService;
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

export const headcountPlanningRoutes = new Elysia({
  prefix: "/headcount-planning",
  name: "headcount-planning-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new HeadcountPlanningRepository(db);
    const service = new HeadcountPlanningService(repository, db);
    return { headcountService: service };
  })

  // =========================================================================
  // Plan CRUD
  // =========================================================================

  // GET /headcount-planning/plans — List plans
  .get(
    "/plans",
    async (ctx) => {
      const { headcountService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit, ...filters } = query;
      const result = await headcountService.listPlans(
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
      query: t.Intersect([PaginationQuerySchema, PlanFiltersSchema]),
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "List headcount plans",
      },
    }
  )

  // GET /headcount-planning/plans/:id — Get plan
  .get(
    "/plans/:id",
    async (ctx) => {
      const { headcountService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.getPlan(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Get headcount plan by ID",
      },
    }
  )

  // POST /headcount-planning/plans — Create plan
  .post(
    "/plans",
    async (ctx) => {
      const { headcountService, tenantContext, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.createPlan(
        tenantContext!,
        body as Parameters<HeadcountPlanningService["createPlan"]>[1]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      body: CreatePlanSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Create headcount plan",
      },
    }
  )

  // PATCH /headcount-planning/plans/:id — Update plan
  .patch(
    "/plans/:id",
    async (ctx) => {
      const { headcountService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.updatePlan(
        tenantContext!,
        params.id,
        body as Parameters<HeadcountPlanningService["updatePlan"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdatePlanSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Update headcount plan",
      },
    }
  )

  // POST /headcount-planning/plans/:id/approve — Approve plan
  .post(
    "/plans/:id/approve",
    async (ctx) => {
      const { headcountService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.approvePlan(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Approve headcount plan",
      },
    }
  )

  // DELETE /headcount-planning/plans/:id — Delete plan
  .delete(
    "/plans/:id",
    async (ctx) => {
      const { headcountService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.deletePlan(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return { success: true, message: "Headcount plan deleted" };
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "delete")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Delete headcount plan",
      },
    }
  )

  // =========================================================================
  // Plan Items
  // =========================================================================

  // GET /headcount-planning/plans/:id/items — List items
  .get(
    "/plans/:id/items",
    async (ctx) => {
      const { headcountService, tenantContext, params, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit } = query;
      const result = await headcountService.listPlanItems(
        tenantContext!,
        params.id,
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
      params: IdParamsSchema,
      query: PaginationQuerySchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "List items in headcount plan",
      },
    }
  )

  // POST /headcount-planning/plans/:id/items — Add item
  .post(
    "/plans/:id/items",
    async (ctx) => {
      const { headcountService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.createPlanItem(
        tenantContext!,
        params.id,
        body as Parameters<HeadcountPlanningService["createPlanItem"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: CreatePlanItemSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Add item to headcount plan",
      },
    }
  )

  // PATCH /headcount-planning/plans/:id/items/:itemId — Update item
  .patch(
    "/plans/:id/items/:itemId",
    async (ctx) => {
      const { headcountService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.updatePlanItem(
        tenantContext!,
        params.id,
        params.itemId,
        body as Parameters<HeadcountPlanningService["updatePlanItem"]>[3]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: PlanItemParamsSchema,
      body: UpdatePlanItemSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Update item in headcount plan",
      },
    }
  )

  // DELETE /headcount-planning/plans/:id/items/:itemId — Delete item
  .delete(
    "/plans/:id/items/:itemId",
    async (ctx) => {
      const { headcountService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await headcountService.deletePlanItem(
        tenantContext!,
        params.id,
        params.itemId
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return { success: true, message: "Plan item deleted" };
    },
    {
      params: PlanItemParamsSchema,
      beforeHandle: [requirePermission("employees", "delete")],
      detail: {
        tags: ["Headcount Planning"],
        summary: "Delete item from headcount plan",
      },
    }
  );

export type HeadcountPlanningRoutes = typeof headcountPlanningRoutes;
