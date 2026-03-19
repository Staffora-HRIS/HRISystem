/**
 * Webhooks Module Routes
 *
 * Endpoints for managing outbound webhook subscriptions and viewing deliveries.
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { DatabaseClient } from "../../plugins/db";
import { WebhooksRepository } from "./repository";
import { WebhooksService } from "./service";
import {
  CreateWebhookSubscriptionSchema,
  UpdateWebhookSubscriptionSchema,
  ListSubscriptionsQuerySchema,
  ListDeliveriesQuerySchema,
  IdParamsSchema,
  type CreateWebhookSubscription,
  type UpdateWebhookSubscription,
  type ListSubscriptionsQuery,
  type ListDeliveriesQuery,
} from "./schemas";
import { getHttpStatus } from "../../lib/route-errors";

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

interface DerivedContext {
  webhooksService: WebhooksService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  requestId: string;
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

function errorResponse(
  result: unknown,
  set: { status: number },
  requestId: string
) {
  const err = (
    result as { error: { code: string; message: string; details?: unknown } }
  ).error;
  set.status = getHttpStatus(err.code);
  return {
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
    },
  };
}

export const webhookRoutes = new Elysia({ prefix: "/webhooks" })

  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new WebhooksRepository(db);
    const service = new WebhooksService(repository, db);
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };
    return { webhooksService: service, tenantContext };
  })

  .post(
    "/subscriptions",
    async (ctx) => {
      const { webhooksService, tenantContext, body, set, requestId } =
        ctx as unknown as DerivedContext;
      const result = await webhooksService.createSubscription(
        tenantContext,
        body as CreateWebhookSubscription
      );
      if (!result.success) return errorResponse(result, set, requestId);
      set.status = 201;
      return result.data;
    },
    {
      body: CreateWebhookSubscriptionSchema,
      beforeHandle: [requirePermission("webhooks", "write")],
      detail: { tags: ["Webhooks"], summary: "Create a webhook subscription" },
    }
  )

  .get(
    "/subscriptions",
    async (ctx) => {
      const { webhooksService, tenantContext, query } = ctx as unknown as DerivedContext;
      const q = query as unknown as ListSubscriptionsQuery;
      return webhooksService.listSubscriptions(tenantContext, {
        cursor: q.cursor,
        limit: q.limit ? Number(q.limit) : undefined,
      });
    },
    {
      query: ListSubscriptionsQuerySchema,
      beforeHandle: [requirePermission("webhooks", "read")],
      detail: { tags: ["Webhooks"], summary: "List webhook subscriptions" },
    }
  )

  .get(
    "/subscriptions/:id",
    async (ctx) => {
      const { webhooksService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;
      const result = await webhooksService.getSubscription(tenantContext, params.id);
      if (!result.success) return errorResponse(result, set, requestId);
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("webhooks", "read")],
      detail: { tags: ["Webhooks"], summary: "Get a webhook subscription" },
    }
  )

  .put(
    "/subscriptions/:id",
    async (ctx) => {
      const { webhooksService, tenantContext, params, body, set, requestId } =
        ctx as unknown as DerivedContext;
      const result = await webhooksService.updateSubscription(
        tenantContext, params.id, body as UpdateWebhookSubscription
      );
      if (!result.success) return errorResponse(result, set, requestId);
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateWebhookSubscriptionSchema,
      beforeHandle: [requirePermission("webhooks", "write")],
      detail: { tags: ["Webhooks"], summary: "Update a webhook subscription" },
    }
  )

  .delete(
    "/subscriptions/:id",
    async (ctx) => {
      const { webhooksService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;
      const result = await webhooksService.deleteSubscription(tenantContext, params.id);
      if (!result.success) return errorResponse(result, set, requestId);
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("webhooks", "write")],
      detail: { tags: ["Webhooks"], summary: "Delete a webhook subscription" },
    }
  )

  .post(
    "/subscriptions/:id/test",
    async (ctx) => {
      const { webhooksService, tenantContext, params, set, requestId } =
        ctx as unknown as DerivedContext;
      const subResult = await webhooksService.getSubscription(tenantContext, params.id);
      if (!subResult.success) return errorResponse(subResult, set, requestId);

      const deliveryIds = await webhooksService.enqueueDeliveries(
        tenantContext.tenantId, null, "webhooks.test",
        {
          type: "webhooks.test",
          message: "This is a test webhook event from Staffora",
          timestamp: new Date().toISOString(),
          subscriptionId: params.id,
        }
      );

      if (deliveryIds.length === 0) {
        set.status = 200;
        return {
          deliveryId: null, status: "no_match",
          message: "No delivery created. Ensure event types include webhooks.test, webhooks.*, or *.",
        };
      }

      set.status = 202;
      return {
        deliveryId: deliveryIds[0], status: "queued",
        message: "Test webhook event queued for delivery",
      };
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("webhooks", "write")],
      detail: { tags: ["Webhooks"], summary: "Send a test webhook event" },
    }
  )

  .get(
    "/deliveries",
    async (ctx) => {
      const { webhooksService, tenantContext, query, set, requestId } =
        ctx as unknown as DerivedContext;
      const q = query as unknown as ListDeliveriesQuery;

      if (q.subscriptionId) {
        const subResult = await webhooksService.getSubscription(tenantContext, q.subscriptionId);
        if (!subResult.success) return errorResponse(subResult, set, requestId);
      }

      const result = await webhooksService.listDeliveries(
        tenantContext, q.subscriptionId || "",
        { status: q.status, eventType: q.eventType },
        { cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined }
      );

      if (!result.success) return errorResponse(result, set, requestId);
      return result.data;
    },
    {
      query: ListDeliveriesQuerySchema,
      beforeHandle: [requirePermission("webhooks", "read")],
      detail: { tags: ["Webhooks"], summary: "List webhook deliveries" },
    }
  );

export type WebhookRoutes = typeof webhookRoutes;
