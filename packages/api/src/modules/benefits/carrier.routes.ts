/**
 * Benefits Module - Carrier Routes
 *
 * Carrier/provider CRUD endpoints.
 * Mounted under /benefits by the parent routes.ts.
 *
 * Routes:
 *   GET    /carriers      - List carriers
 *   GET    /carriers/:id  - Get carrier by ID
 *   POST   /carriers      - Create carrier
 *   PUT    /carriers/:id  - Update carrier
 *   DELETE /carriers/:id  - Deactivate carrier
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import {
  CreateCarrier,
  UpdateCarrier,
  CarrierResponse,
  PaginationQuery,
} from "./schemas";
import {
  SuccessSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  benefitsErrorStatusMap,
} from "./routes.shared";

export const carrierRoutes = new Elysia({ name: "benefits-carrier-routes" })

  // GET /carriers - List carriers
  .get(
    "/carriers",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listCarriers(
        tenantContext,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "read")],
      query: t.Partial(PaginationQuery),
      response: t.Object({
        items: t.Array(CarrierResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "List carriers",
        description: "List benefit carriers with pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /carriers/:id - Get carrier by ID
  .get(
    "/carriers/:id",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.getCarrier(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "read")],
      params: IdParamsSchema,
      response: {
        200: CarrierResponse,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Get carrier by ID",
        description: "Get a single carrier by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /carriers - Create carrier
  .post(
    "/carriers",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createCarrier(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "CARRIER_CREATED",
          resourceType: "benefit_carrier",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "write")],
      body: CreateCarrier,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: CarrierResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Create carrier",
        description: "Create a new benefit carrier",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /carriers/:id - Update carrier
  .put(
    "/carriers/:id",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getCarrier(tenantContext, params.id);

      const result = await benefitsService.updateCarrier(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "CARRIER_UPDATED",
          resourceType: "benefit_carrier",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "write")],
      params: IdParamsSchema,
      body: UpdateCarrier,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: CarrierResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Update carrier",
        description: "Update an existing carrier",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /carriers/:id - Deactivate carrier
  .delete(
    "/carriers/:id",
    async (ctx) => {
      const { benefitsService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getCarrier(tenantContext, params.id);

      const result = await benefitsService.deleteCarrier(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "CARRIER_DEACTIVATED",
          resourceType: "benefit_carrier",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Carrier deactivated successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Deactivate carrier",
        description: "Soft delete (deactivate) a carrier",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type CarrierRoutes = typeof carrierRoutes;
