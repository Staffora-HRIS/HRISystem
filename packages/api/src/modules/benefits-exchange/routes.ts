/**
 * Benefits Exchange Module - Elysia Routes
 *
 * Endpoints for benefits provider data exchange:
 *   POST /benefits-exchange/generate   - Generate outbound exchange file
 *   GET  /benefits-exchange/history    - Get exchange history
 *   GET  /benefits-exchange/:id        - Get single exchange by ID
 *   POST /benefits-exchange/inbound    - Process inbound exchange file
 *
 * Permission model:
 *   - benefits:exchanges: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { BenefitsExchangeRepository } from "./repository";
import { BenefitsExchangeService } from "./service";
import {
  GenerateExchangeFile,
  ProcessInboundFile,
  ExchangeHistoryQuery,
  DataExchangeResponse,
} from "./schemas";

// =============================================================================
// Shared Schemas
// =============================================================================

const UuidSchema = t.String({ format: "uuid" });

const IdParamsSchema = t.Object({
  id: UuidSchema,
});

const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

/**
 * Module-specific error code to HTTP status mapping.
 */
const exchangeErrorStatusMap: Record<string, number> = {
  NOT_FOUND: 404,
  PROVIDER_NOT_FOUND: 404,
  EXCHANGE_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_PAYLOAD: 400,
};

// =============================================================================
// Routes
// =============================================================================

export const benefitsExchangeRoutes = new Elysia({
  prefix: "/benefits-exchange",
  name: "benefits-exchange-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new BenefitsExchangeRepository(db);
    const service = new BenefitsExchangeService(repository, db);

    return { benefitsExchangeService: service };
  })

  // ===========================================================================
  // POST /generate - Generate outbound exchange file
  // ===========================================================================
  .post(
    "/generate",
    async (ctx) => {
      const { benefitsExchangeService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsExchangeService.generateExchangeFile(
        tenantContext,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          exchangeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "BENEFITS_EXCHANGE_GENERATED",
          resourceType: "benefits_data_exchange",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:exchanges", "write")],
      body: GenerateExchangeFile,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DataExchangeResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Exchange"],
        summary: "Generate outbound exchange file",
        description:
          "Generate an outbound data exchange file for a benefits provider",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /history - Get exchange history
  // ===========================================================================
  .get(
    "/history",
    async (ctx) => {
      const { benefitsExchangeService, query, tenantContext } = ctx as any;
      const {
        provider_id,
        exchange_type,
        direction,
        status,
        cursor,
        limit: rawLimit,
      } = query;
      const parsedLimit =
        rawLimit !== undefined && rawLimit !== null
          ? Number(rawLimit)
          : undefined;

      const result = await benefitsExchangeService.getExchangeHistory(
        tenantContext,
        { provider_id, exchange_type, direction, status },
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:exchanges", "read")],
      query: t.Partial(ExchangeHistoryQuery),
      response: t.Object({
        items: t.Array(DataExchangeResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Exchange"],
        summary: "Get exchange history",
        description:
          "List benefits data exchange history with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get single exchange by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { benefitsExchangeService, params, tenantContext, error } =
        ctx as any;
      const result = await benefitsExchangeService.getExchange(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          exchangeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:exchanges", "read")],
      params: IdParamsSchema,
      response: {
        200: DataExchangeResponse,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Exchange"],
        summary: "Get exchange by ID",
        description: "Get a single data exchange record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /inbound - Process inbound exchange file
  // ===========================================================================
  .post(
    "/inbound",
    async (ctx) => {
      const { benefitsExchangeService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsExchangeService.processInboundFile(
        tenantContext,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          exchangeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "BENEFITS_EXCHANGE_INBOUND_PROCESSED",
          resourceType: "benefits_data_exchange",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:exchanges", "write")],
      body: ProcessInboundFile,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DataExchangeResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Exchange"],
        summary: "Process inbound exchange file",
        description:
          "Process an inbound data exchange file received from a benefits provider",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BenefitsExchangeRoutes = typeof benefitsExchangeRoutes;
