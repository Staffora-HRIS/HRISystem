/**
 * Equipment Module - Elysia Routes
 *
 * Equipment catalog and request management for provisioning.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - equipment: read, write, delete
 *
 * Endpoints:
 * Catalog:
 * - GET    /equipment/catalog           -- List catalog items
 * - POST   /equipment/catalog           -- Create catalog item
 * - GET    /equipment/catalog/:id       -- Get catalog item
 * - PATCH  /equipment/catalog/:id       -- Update catalog item
 * - DELETE /equipment/catalog/:id       -- Deactivate catalog item
 *
 * Requests:
 * - GET    /equipment/requests           -- List equipment requests
 * - POST   /equipment/requests           -- Create equipment request
 * - GET    /equipment/requests/:id       -- Get equipment request with history
 * - PATCH  /equipment/requests/:id/status -- Update request status
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { EquipmentRepository } from "./repository";
import { EquipmentService } from "./service";
import {
  CatalogItemResponseSchema,
  CatalogFiltersSchema,
  CreateCatalogItemSchema,
  UpdateCatalogItemSchema,
  EquipmentRequestResponseSchema,
  EquipmentRequestFiltersSchema,
  CreateEquipmentRequestSchema,
  EquipmentStatusTransitionSchema,
  EquipmentRequestHistorySchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateCatalogItem,
  type CreateEquipmentRequest,
  type EquipmentStatusTransition,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & EquipmentPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface EquipmentPluginContext {
  equipmentService: EquipmentService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

/**
 * Equipment module error codes beyond the shared base set
 */
const equipmentErrorStatusMap: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
  CATALOG_ITEM_INACTIVE: 400,
};

/**
 * Equipment routes plugin
 */
export const equipmentRoutes = new Elysia({ prefix: "/equipment", name: "equipment-routes" })

  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new EquipmentRepository(db);
    const service = new EquipmentService(repository, db);

    return { equipmentService: service };
  })

  // ===========================================================================
  // Catalog Routes
  // ===========================================================================

  // GET /equipment/catalog -- List catalog items
  .get(
    "/catalog",
    async (ctx) => {
      const { equipmentService, query, tenantContext } = ctx as typeof ctx & EquipmentPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await equipmentService.listCatalogItems(
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
      beforeHandle: [requirePermission("equipment", "read")],
      query: t.Composite([
        t.Partial(CatalogFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(CatalogItemResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Equipment"],
        summary: "List equipment catalog items",
        description: "List catalog items with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /equipment/catalog -- Create catalog item
  .post(
    "/catalog",
    async (ctx) => {
      const { equipmentService, body, tenantContext, audit, requestId, set, error } = ctx as typeof ctx & EquipmentPluginContext;

      const result = await equipmentService.createCatalogItem(tenantContext, body as CreateCatalogItem);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "equipment.catalog.created",
          resourceType: "equipment_catalog",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("equipment", "write")],
      body: CreateCatalogItemSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: CatalogItemResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Create equipment catalog item",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /equipment/catalog/:id -- Get catalog item
  .get(
    "/catalog/:id",
    async (ctx) => {
      const { equipmentService, params, tenantContext, error } = ctx as typeof ctx & EquipmentPluginContext;

      const result = await equipmentService.getCatalogItem(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("equipment", "read")],
      params: IdParamsSchema,
      response: {
        200: CatalogItemResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Get equipment catalog item by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /equipment/catalog/:id -- Update catalog item
  .patch(
    "/catalog/:id",
    async (ctx) => {
      const { equipmentService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & EquipmentPluginContext;

      const result = await equipmentService.updateCatalogItem(tenantContext, params.id, body);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "equipment.catalog.updated",
          resourceType: "equipment_catalog",
          resourceId: params.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("equipment", "write")],
      params: IdParamsSchema,
      body: UpdateCatalogItemSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: CatalogItemResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Update equipment catalog item",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /equipment/catalog/:id -- Deactivate catalog item
  .delete(
    "/catalog/:id",
    async (ctx) => {
      const { equipmentService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & EquipmentPluginContext;

      const result = await equipmentService.deleteCatalogItem(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "equipment.catalog.deleted",
          resourceType: "equipment_catalog",
          resourceId: params.id,
          metadata: { requestId },
        });
      }

      return { success: true as const, message: "Catalog item deactivated" };
    },
    {
      beforeHandle: [requirePermission("equipment", "delete")],
      params: IdParamsSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Deactivate equipment catalog item",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Request Routes
  // ===========================================================================

  // GET /equipment/requests -- List equipment requests
  .get(
    "/requests",
    async (ctx) => {
      const { equipmentService, query, tenantContext } = ctx as typeof ctx & EquipmentPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await equipmentService.listRequests(
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
      beforeHandle: [requirePermission("equipment", "read")],
      query: t.Composite([
        t.Partial(EquipmentRequestFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(EquipmentRequestResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Equipment"],
        summary: "List equipment requests",
        description: "List equipment requests with optional status filter and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /equipment/requests -- Create equipment request
  .post(
    "/requests",
    async (ctx) => {
      const { equipmentService, body, tenantContext, audit, requestId, set, error } = ctx as typeof ctx & EquipmentPluginContext;

      const result = await equipmentService.createRequest(tenantContext, body as CreateEquipmentRequest);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "equipment.request.created",
          resourceType: "equipment_request",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("equipment", "write")],
      body: CreateEquipmentRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EquipmentRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Create equipment request",
        description: "Create a new equipment request. Validates catalog item exists if catalog_item_id is provided.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /equipment/requests/:id -- Get equipment request with history
  .get(
    "/requests/:id",
    async (ctx) => {
      const { equipmentService, params, tenantContext, error } = ctx as typeof ctx & EquipmentPluginContext;

      const result = await equipmentService.getRequest(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("equipment", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Intersect([
          EquipmentRequestResponseSchema,
          t.Object({ history: t.Array(EquipmentRequestHistorySchema) }),
        ]),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Get equipment request by ID with history",
        description: "Returns the equipment request details along with its full status change history",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /equipment/requests/:id/status -- Update request status
  .patch(
    "/requests/:id/status",
    async (ctx) => {
      const { equipmentService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & EquipmentPluginContext;

      const typedBody = body as EquipmentStatusTransition;
      const result = await equipmentService.transitionStatus(tenantContext, params.id, typedBody);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", equipmentErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "equipment.request.status_changed",
          resourceType: "equipment_request",
          resourceId: params.id,
          newValues: { status: typedBody.to_status },
          metadata: {
            requestId,
            fromStatus: result.data?.status,
            toStatus: typedBody.to_status,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("equipment", "write")],
      params: IdParamsSchema,
      body: EquipmentStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EquipmentRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Equipment"],
        summary: "Update equipment request status",
        description: "Transition equipment request status. Enforces state machine rules.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type EquipmentRoutes = typeof equipmentRoutes;
