/**
 * Integrations Module Routes
 *
 * Tenant-scoped integration management for third-party services.
 * All routes require authentication.
 *
 * Endpoints:
 * - GET    /integrations                    - List all integrations for the tenant
 * - GET    /integrations/:id                - Get a single integration
 * - POST   /integrations/connect            - Connect (create/update) an integration
 * - PATCH  /integrations/:id/config         - Update integration configuration
 * - POST   /integrations/:id/disconnect     - Disconnect an integration
 * - POST   /integrations/:provider/test     - Test an integration connection
 * - DELETE /integrations/:id                - Delete an integration
 */

import { Elysia, t } from "elysia";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { IntegrationsRepository } from "./repository";
import { IntegrationsService } from "./service";
import {
  IntegrationStatusSchema,
  ConnectIntegrationSchema,
  UpdateIntegrationConfigSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  TestConnectionResponseSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
  requestId: string;
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  integrationsService: IntegrationsService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  requestId: string;
}

export const integrationsRoutes = new Elysia({ prefix: "/integrations" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new IntegrationsRepository(db);
    const service = new IntegrationsService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return {
      integrationsService: service,
      tenantContext,
    };
  })

  // =========================================================================
  // GET /integrations - List integrations
  // =========================================================================
  .get(
    "/",
    async (ctx) => {
      const { integrationsService, tenantContext, query, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await integrationsService.listIntegrations(
          tenantContext,
          filters as { category?: string; status?: "connected" | "disconnected" | "error"; search?: string },
          {
            cursor: cursor as string | undefined,
            limit: limit as string | undefined,
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
            requestId,
          },
        };
      }
    },
    {
      query: t.Object({
        cursor: t.Optional(t.String({ minLength: 1 })),
        limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
        category: t.Optional(t.String({ minLength: 1 })),
        status: t.Optional(IntegrationStatusSchema),
        search: t.Optional(t.String({ minLength: 1 })),
      }),
      detail: {
        tags: ["Integrations"],
        summary: "List integrations for the current tenant",
      },
    }
  )

  // =========================================================================
  // GET /integrations/:id - Get a single integration
  // =========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { integrationsService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const result = await integrationsService.getIntegration(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: { ...result.error!, requestId } };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
            requestId,
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      detail: {
        tags: ["Integrations"],
        summary: "Get a single integration by ID",
      },
    }
  )

  // =========================================================================
  // POST /integrations/connect - Connect an integration
  // =========================================================================
  .post(
    "/connect",
    async (ctx) => {
      const { integrationsService, tenantContext, body, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const result = await integrationsService.connectIntegration(
          tenantContext,
          body as {
            provider: string;
            name: string;
            description?: string;
            category: string;
            config?: { api_key?: string; api_secret?: string; webhook_url?: string };
            webhook_url?: string;
          }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: { ...result.error!, requestId } };
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
            requestId,
          },
        };
      }
    },
    {
      body: ConnectIntegrationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      detail: {
        tags: ["Integrations"],
        summary: "Connect (create or update) an integration",
      },
    }
  )

  // =========================================================================
  // PATCH /integrations/:id/config - Update integration configuration
  // =========================================================================
  .patch(
    "/:id/config",
    async (ctx) => {
      const { integrationsService, tenantContext, params, body, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const result = await integrationsService.updateConfig(
          tenantContext,
          params.id,
          body as { config?: Record<string, unknown>; webhook_url?: string }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: { ...result.error!, requestId } };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
            requestId,
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      body: UpdateIntegrationConfigSchema,
      headers: OptionalIdempotencyHeaderSchema,
      detail: {
        tags: ["Integrations"],
        summary: "Update integration configuration",
      },
    }
  )

  // =========================================================================
  // POST /integrations/:id/disconnect - Disconnect an integration
  // =========================================================================
  .post(
    "/:id/disconnect",
    async (ctx) => {
      const { integrationsService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const result = await integrationsService.disconnectIntegration(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: { ...result.error!, requestId } };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
            requestId,
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      detail: {
        tags: ["Integrations"],
        summary: "Disconnect an integration",
      },
    }
  )

  // =========================================================================
  // POST /integrations/:id/test - Test an integration connection
  // =========================================================================
  .post(
    "/:id/test",
    async (ctx) => {
      const { integrationsService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const result = await integrationsService.testConnection(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: { ...result.error!, requestId } };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
            requestId,
          },
        };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: TestConnectionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Integrations"],
        summary: "Test an integration connection",
      },
    }
  )

  // =========================================================================
  // DELETE /integrations/:id - Delete an integration
  // =========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const { integrationsService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;

      try {
        const result = await integrationsService.deleteIntegration(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: { ...result.error!, requestId } };
        }

        return { success: true as const, message: "Integration deleted" };
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
            requestId,
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Integrations"],
        summary: "Delete an integration",
      },
    }
  );

export type IntegrationsRoutes = typeof integrationsRoutes;
