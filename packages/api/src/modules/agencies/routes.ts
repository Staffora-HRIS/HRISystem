/**
 * Agency Management Module - Elysia Routes
 *
 * Defines the API endpoints for recruitment agency and placement management.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET    /agencies                                — List agencies
 * - GET    /agencies/:id                            — Get agency
 * - POST   /agencies                                — Create agency
 * - PATCH  /agencies/:id                            — Update agency
 * - DELETE /agencies/:id                            — Delete agency
 * - GET    /agencies/:id/placements           — List placements
 * - POST   /agencies/:id/placements           — Create placement
 * - PATCH  /agencies/:id/placements/:placementId — Update placement
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { AgencyRepository } from "./repository";
import { AgencyService } from "./service";
import {
  CreateAgencySchema,
  UpdateAgencySchema,
  CreatePlacementSchema,
  UpdatePlacementSchema,
  AgencyFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  agencyService: AgencyService;
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

export const agencyRoutes = new Elysia({
  prefix: "/agencies",
  name: "agency-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new AgencyRepository(db);
    const service = new AgencyService(repository, db);
    return { agencyService: service };
  })

  // =========================================================================
  // Agency CRUD
  // =========================================================================

  // GET /agencies — List agencies
  .get(
    "/",
    async (ctx) => {
      const { agencyService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit, ...filters } = query;
      const result = await agencyService.listAgencies(
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
      query: t.Intersect([PaginationQuerySchema, AgencyFiltersSchema]),
      beforeHandle: [requirePermission("recruitment", "read")],
      detail: {
        tags: ["Agencies"],
        summary: "List recruitment agencies",
      },
    }
  )

  // GET /agencies/:id — Get agency
  .get(
    "/:id",
    async (ctx) => {
      const { agencyService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await agencyService.getAgency(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("recruitment", "read")],
      detail: {
        tags: ["Agencies"],
        summary: "Get recruitment agency by ID",
      },
    }
  )

  // POST /agencies — Create agency
  .post(
    "/",
    async (ctx) => {
      const { agencyService, tenantContext, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await agencyService.createAgency(
        tenantContext!,
        body as Parameters<AgencyService["createAgency"]>[1]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      body: CreateAgencySchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("recruitment", "write")],
      detail: {
        tags: ["Agencies"],
        summary: "Create recruitment agency",
      },
    }
  )

  // PATCH /agencies/:id — Update agency
  .patch(
    "/:id",
    async (ctx) => {
      const { agencyService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await agencyService.updateAgency(
        tenantContext!,
        params.id,
        body as Parameters<AgencyService["updateAgency"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateAgencySchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("recruitment", "write")],
      detail: {
        tags: ["Agencies"],
        summary: "Update recruitment agency",
      },
    }
  )

  // DELETE /agencies/:id — Delete agency
  .delete(
    "/:id",
    async (ctx) => {
      const { agencyService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await agencyService.deleteAgency(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return { success: true, message: "Agency deleted" };
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("recruitment", "delete")],
      detail: {
        tags: ["Agencies"],
        summary: "Delete recruitment agency",
      },
    }
  )

  // =========================================================================
  // Placement Operations
  // =========================================================================

  // GET /agencies/:id/placements — List placements
  .get(
    "/:id/placements",
    async (ctx) => {
      const { agencyService, tenantContext, params, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit } = query;
      const result = await agencyService.listPlacements(
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
      beforeHandle: [requirePermission("recruitment", "read")],
      detail: {
        tags: ["Agencies"],
        summary: "List agency placements",
      },
    }
  )

  // POST /agencies/:id/placements — Create placement
  .post(
    "/:id/placements",
    async (ctx) => {
      const { agencyService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const data = body as Parameters<AgencyService["createPlacement"]>[1];
      // Ensure agency_id from params is used
      const placementData = { ...data, agency_id: params.id };
      const result = await agencyService.createPlacement(tenantContext!, placementData);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: CreatePlacementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("recruitment", "write")],
      detail: {
        tags: ["Agencies"],
        summary: "Create agency placement",
      },
    }
  )

  // PATCH /agencies/:id/placements/:placementId — Update placement
  .patch(
    "/:id/placements/:placementId",
    async (ctx) => {
      const { agencyService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await agencyService.updatePlacement(
        tenantContext!,
        params.placementId,
        body as Parameters<AgencyService["updatePlacement"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), placementId: t.String({ format: "uuid" }) }),
      body: UpdatePlacementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("recruitment", "write")],
      detail: {
        tags: ["Agencies"],
        summary: "Update agency placement",
      },
    }
  );

export type AgencyRoutes = typeof agencyRoutes;
