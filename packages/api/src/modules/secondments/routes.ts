/**
 * Secondment Module - Elysia Routes
 *
 * Defines the API endpoints for secondment management.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET    /secondments              — List secondments
 * - GET    /secondments/:id          — Get secondment
 * - POST   /secondments              — Create secondment
 * - PATCH  /secondments/:id          — Update secondment
 * - POST   /secondments/:id/transition — Transition secondment status
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { SecondmentRepository } from "./repository";
import { SecondmentService } from "./service";
import {
  CreateSecondmentSchema,
  UpdateSecondmentSchema,
  SecondmentStatusTransitionSchema,
  SecondmentFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  secondmentService: SecondmentService;
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

export const secondmentRoutes = new Elysia({
  prefix: "/secondments",
  name: "secondment-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new SecondmentRepository(db);
    const service = new SecondmentService(repository, db);
    return { secondmentService: service };
  })

  // GET /secondments — List secondments
  .get(
    "/",
    async (ctx) => {
      const { secondmentService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit, ...filters } = query;
      const result = await secondmentService.listSecondments(
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
      query: t.Intersect([PaginationQuerySchema, SecondmentFiltersSchema]),
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Secondments"],
        summary: "List secondments",
      },
    }
  )

  // GET /secondments/:id — Get secondment
  .get(
    "/:id",
    async (ctx) => {
      const { secondmentService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await secondmentService.getSecondment(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Secondments"],
        summary: "Get secondment by ID",
      },
    }
  )

  // POST /secondments — Create secondment
  .post(
    "/",
    async (ctx) => {
      const { secondmentService, tenantContext, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await secondmentService.createSecondment(
        tenantContext!,
        body as Parameters<SecondmentService["createSecondment"]>[1]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      body: CreateSecondmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Secondments"],
        summary: "Create secondment",
      },
    }
  )

  // PATCH /secondments/:id — Update secondment
  .patch(
    "/:id",
    async (ctx) => {
      const { secondmentService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await secondmentService.updateSecondment(
        tenantContext!,
        params.id,
        body as Parameters<SecondmentService["updateSecondment"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateSecondmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Secondments"],
        summary: "Update secondment",
      },
    }
  )

  // POST /secondments/:id/transition — Transition secondment status
  .post(
    "/:id/transition",
    async (ctx) => {
      const { secondmentService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await secondmentService.transitionStatus(
        tenantContext!,
        params.id,
        body as Parameters<SecondmentService["transitionStatus"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: SecondmentStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Secondments"],
        summary: "Transition secondment status",
        description: "Transition secondment status. Valid transitions: proposed->approved/cancelled, approved->active/cancelled, active->extended/completed/cancelled, extended->completed/cancelled.",
      },
    }
  );

export type SecondmentRoutes = typeof secondmentRoutes;
