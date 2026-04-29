/**
 * Policy Distribution Module Routes
 *
 * Endpoints for distributing policy documents and tracking read receipts.
 * All routes require authentication.
 *
 * Endpoints:
 * - POST   /policy-distributions              — Distribute a policy document
 * - GET    /policy-distributions              — List all distributions
 * - GET    /policy-distributions/:id/status   — Get distribution status with acknowledgements
 * - POST   /policy-distributions/acknowledge  — Acknowledge (read receipt) a distribution
 */

import { Elysia } from "elysia";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PolicyDistributionRepository } from "./repository";
import { PolicyDistributionService } from "./service";
import {
  DistributionStatusResponseSchema,
  AcknowledgementResponseSchema,
  CreateDistributionSchema,
  AcknowledgeDistributionSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string; roles?: string[] };
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  policyDistributionService: PolicyDistributionService;
  tenantContext: { tenantId: string; userId: string | undefined };
  currentUserId: string;
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  request: Request;
}

export const policyDistributionRoutes = new Elysia({
  prefix: "/policy-distributions",
})

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new PolicyDistributionRepository(db);
    const service = new PolicyDistributionService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return {
      policyDistributionService: service,
      tenantContext,
      currentUserId: user?.id || "",
    };
  })

  // =========================================================================
  // GET /policy-distributions — List all distributions
  // =========================================================================
  .get(
    "/",
    async (ctx) => {
      const { policyDistributionService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await policyDistributionService.listDistributions(
          tenantContext,
          {
            cursor: query.cursor as string | undefined,
            limit:
              query.limit !== undefined && query.limit !== null
                ? Number(query.limit)
                : undefined,
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
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      query: PaginationQuerySchema,
      detail: {
        tags: ["Policy Distribution"],
        summary: "List all policy distributions",
      },
    }
  )

  // =========================================================================
  // POST /policy-distributions — Distribute a policy document
  // =========================================================================
  .post(
    "/",
    async (ctx) => {
      const { policyDistributionService, tenantContext, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await policyDistributionService.distribute(
          tenantContext,
          body as {
            document_id: string;
            title: string;
            target_departments?: string[];
            target_all?: boolean;
          }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      body: CreateDistributionSchema,
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Policy Distribution"],
        summary: "Distribute a policy document",
      },
    }
  )

  // =========================================================================
  // GET /policy-distributions/:id/status — Get distribution status
  // =========================================================================
  .get(
    "/:id/status",
    async (ctx) => {
      const { policyDistributionService, tenantContext, params, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await policyDistributionService.getDistributionStatus(
          tenantContext,
          params.id,
          {
            cursor: query.cursor as string | undefined,
            limit:
              query.limit !== undefined && query.limit !== null
                ? Number(query.limit)
                : undefined,
          }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      query: PaginationQuerySchema,
      response: {
        200: DistributionStatusResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Policy Distribution"],
        summary: "Get distribution status with acknowledgements",
      },
    }
  )

  // =========================================================================
  // POST /policy-distributions/acknowledge — Acknowledge a distribution
  // =========================================================================
  .post(
    "/acknowledge",
    async (ctx) => {
      const {
        policyDistributionService,
        tenantContext,
        currentUserId,
        body,
        set,
        request,
      } = ctx as unknown as DerivedContext;

      try {
        // Extract IP address from request headers
        const forwarded = request.headers.get("x-forwarded-for");
        const ipAddress = forwarded
          ? forwarded.split(",")[0].trim()
          : null;

        const { distribution_id } = body as { distribution_id: string };

        const result = await policyDistributionService.acknowledge(
          tenantContext,
          distribution_id,
          currentUserId,
          ipAddress
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      body: AcknowledgeDistributionSchema,
      headers: IdempotencyHeaderSchema,
      response: {
        201: AcknowledgementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Policy Distribution"],
        summary: "Acknowledge a policy distribution (read receipt)",
      },
    }
  );

export type PolicyDistributionRoutes = typeof policyDistributionRoutes;
