/**
 * Geofence Module Routes
 *
 * Geofence location management, proximity checks, and violation resolution.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * Locations:
 * - GET    /geofences/locations           — List geofence locations
 * - GET    /geofences/locations/:id       — Get geofence location
 * - POST   /geofences/locations           — Create geofence location
 * - PATCH  /geofences/locations/:id       — Update geofence location
 * - DELETE /geofences/locations/:id       — Deactivate geofence location
 *
 * Proximity:
 * - GET    /geofences/nearby              — Find nearby geofences
 * - POST   /geofences/check-location      — Check if location is within zone
 *
 * Violations:
 * - GET    /geofences/violations          — List violations
 * - GET    /geofences/violations/:id      — Get violation
 * - POST   /geofences/violations/:id/resolve — Resolve violation
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { GeofenceRepository } from "./repository";
import { GeofenceService } from "./service";
import {
  GeofenceLocationResponseSchema,
  GeofenceLocationFiltersSchema,
  CreateGeofenceLocationSchema,
  UpdateGeofenceLocationSchema,
  NearbyGeofencesQuerySchema,
  NearbyGeofenceSchema,
  LocationCheckSchema,
  LocationCheckResponseSchema,
  GeofenceViolationResponseSchema,
  ViolationFiltersSchema,
  ResolveViolationSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  geofenceService: GeofenceService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

/** Module-specific error code overrides */
const GEOFENCE_ERROR_CODES: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
};

export const geofenceRoutes = new Elysia({ prefix: "/geofences" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new GeofenceRepository(db);
    const service = new GeofenceService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { geofenceService: service, tenantContext };
  })

  // =========================================================================
  // Location Endpoints
  // =========================================================================

  // GET /geofences/locations — List geofence locations
  .get(
    "/locations",
    async (ctx) => {
      const { geofenceService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await geofenceService.listLocations(
          tenantContext,
          filters as Record<string, unknown>,
          {
            cursor: cursor as string | undefined,
            limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
          }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          count: result.items.length,
        };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      query: t.Intersect([PaginationQuerySchema, GeofenceLocationFiltersSchema]),
      beforeHandle: [requirePermission("geofence", "read")],
      detail: { tags: ["Geofence"], summary: "List geofence locations" },
    }
  )

  // GET /geofences/locations/:id — Get geofence location
  .get(
    "/locations/:id",
    async (ctx) => {
      const { geofenceService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await geofenceService.getLocation(tenantContext, params.id);
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, GEOFENCE_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("geofence", "read")],
      detail: { tags: ["Geofence"], summary: "Get geofence location by ID" },
    }
  )

  // POST /geofences/locations — Create geofence location
  .post(
    "/locations",
    async (ctx) => {
      const { geofenceService, tenantContext, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await geofenceService.createLocation(
          tenantContext,
          body as Parameters<GeofenceService["createLocation"]>[1]
        );
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, GEOFENCE_ERROR_CODES);
          return { error: result.error };
        }
        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      body: CreateGeofenceLocationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("geofence", "write")],
      detail: { tags: ["Geofence"], summary: "Create geofence location" },
    }
  )

  // PATCH /geofences/locations/:id — Update geofence location
  .patch(
    "/locations/:id",
    async (ctx) => {
      const { geofenceService, tenantContext, params, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await geofenceService.updateLocation(
          tenantContext,
          params.id,
          body as Parameters<GeofenceService["updateLocation"]>[2]
        );
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, GEOFENCE_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      body: UpdateGeofenceLocationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("geofence", "write")],
      detail: { tags: ["Geofence"], summary: "Update geofence location" },
    }
  )

  // DELETE /geofences/locations/:id — Deactivate geofence location
  .delete(
    "/locations/:id",
    async (ctx) => {
      const { geofenceService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await geofenceService.deleteLocation(tenantContext, params.id);
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, GEOFENCE_ERROR_CODES);
          return { error: result.error };
        }
        return { success: true as const, message: "Geofence location deactivated" };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("geofence", "delete")],
      detail: { tags: ["Geofence"], summary: "Deactivate geofence location" },
    }
  )

  // =========================================================================
  // Proximity Endpoints
  // =========================================================================

  // GET /geofences/nearby — Find nearby geofences
  .get(
    "/nearby",
    async (ctx) => {
      const { geofenceService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { latitude, longitude, max_distance_meters } = query as {
          latitude: number;
          longitude: number;
          max_distance_meters?: number;
        };

        const items = await geofenceService.findNearby(
          tenantContext,
          Number(latitude),
          Number(longitude),
          max_distance_meters !== undefined ? Number(max_distance_meters) : undefined
        );

        return { items };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      query: NearbyGeofencesQuerySchema,
      beforeHandle: [requirePermission("geofence", "read")],
      detail: { tags: ["Geofence"], summary: "Find nearby geofences for coordinates" },
    }
  )

  // POST /geofences/check-location — Check if location is within zone
  .post(
    "/check-location",
    async (ctx) => {
      const { geofenceService, tenantContext, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const { latitude, longitude, geofence_id } = body as {
          latitude: number;
          longitude: number;
          geofence_id?: string;
        };

        const result = await geofenceService.checkLocation(
          tenantContext,
          latitude,
          longitude,
          geofence_id
        );

        if (!result.success) {
          set.status = 500;
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      body: LocationCheckSchema,
      beforeHandle: [requirePermission("geofence", "read")],
      detail: { tags: ["Geofence"], summary: "Check if location is within a geofence zone" },
    }
  )

  // =========================================================================
  // Violation Endpoints
  // =========================================================================

  // GET /geofences/violations — List violations
  .get(
    "/violations",
    async (ctx) => {
      const { geofenceService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await geofenceService.listViolations(
          tenantContext,
          filters as Record<string, unknown>,
          {
            cursor: cursor as string | undefined,
            limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
          }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          count: result.items.length,
        };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      query: t.Intersect([PaginationQuerySchema, ViolationFiltersSchema]),
      beforeHandle: [requirePermission("geofence", "read")],
      detail: { tags: ["Geofence"], summary: "List geofence violations" },
    }
  )

  // GET /geofences/violations/:id — Get violation
  .get(
    "/violations/:id",
    async (ctx) => {
      const { geofenceService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await geofenceService.getViolation(tenantContext, params.id);
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, GEOFENCE_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("geofence", "read")],
      detail: { tags: ["Geofence"], summary: "Get geofence violation by ID" },
    }
  )

  // POST /geofences/violations/:id/resolve — Resolve violation
  .post(
    "/violations/:id/resolve",
    async (ctx) => {
      const { geofenceService, tenantContext, params, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await geofenceService.resolveViolation(
          tenantContext,
          params.id,
          body as Parameters<GeofenceService["resolveViolation"]>[2]
        );
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, GEOFENCE_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      body: ResolveViolationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("geofence", "write")],
      detail: { tags: ["Geofence"], summary: "Resolve a geofence violation" },
    }
  );

export type GeofenceRoutes = typeof geofenceRoutes;
