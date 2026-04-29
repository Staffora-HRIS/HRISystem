/**
 * Notifications Module Routes
 *
 * User-scoped notification management.
 * Each user can only see and manage their own notifications.
 * All routes require authentication.
 *
 * Endpoints:
 * - GET    /notifications                  — List user's notifications
 * - GET    /notifications/unread-count     — Get unread count
 * - GET    /notifications/:id              — Get single notification
 * - POST   /notifications/:id/read        — Mark single notification as read
 * - POST   /notifications/read-all        — Mark all as read
 * - POST   /notifications/:id/dismiss     — Dismiss notification
 * - DELETE /notifications/:id              — Delete notification
 * - GET    /notifications/push-tokens      — List push tokens (FCM)
 * - POST   /notifications/push-tokens      — Register push token (FCM)
 * - DELETE /notifications/push-tokens/:id  — Remove push token (FCM)
 * - GET    /notifications/push/vapid-key   — Get VAPID public key
 * - GET    /notifications/push/subscriptions       — List Web Push subscriptions
 * - POST   /notifications/push/subscribe           — Subscribe to Web Push
 * - DELETE /notifications/push/unsubscribe         — Unsubscribe from Web Push (by endpoint)
 * - DELETE /notifications/push/subscriptions/:id   — Unsubscribe from Web Push (by ID)
 */

import { Elysia, t } from "elysia";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { NotificationsRepository } from "./repository";
import { NotificationsService } from "./service";
import {
  NotificationResponseSchema,
  NotificationFiltersSchema,
  UnreadCountResponseSchema,
  MarkAllReadResponseSchema,
  RegisterPushTokenSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  WebPushSubscribeSchema,
  WebPushUnsubscribeSchema,
  WebPushSubscriptionResponseSchema,
  VapidPublicKeyResponseSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  notificationsService: NotificationsService;
  tenantContext: { tenantId: string; userId: string | undefined };
  currentUserId: string;
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new NotificationsRepository(db);
    const service = new NotificationsService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return {
      notificationsService: service,
      tenantContext,
      currentUserId: user?.id || "",
    };
  })

  // =========================================================================
  // GET /notifications — List user's notifications
  // =========================================================================
  .get(
    "/",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await notificationsService.listNotifications(
          tenantContext,
          currentUserId,
          filters as { type?: string; unread_only?: boolean; search?: string },
          {
            cursor: cursor as string | undefined,
            limit:
              limit !== undefined && limit !== null ? Number(limit) : undefined,
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
      query: t.Intersect([
        PaginationQuerySchema,
        NotificationFiltersSchema,
      ]),
      detail: {
        tags: ["Notifications"],
        summary: "List notifications for current user",
      },
    }
  )

  // =========================================================================
  // GET /notifications/unread-count — Unread count
  // =========================================================================
  .get(
    "/unread-count",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.getUnreadCount(
          tenantContext,
          currentUserId
        );

        if (!result.success) {
          set.status = 500;
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
      response: {
        200: UnreadCountResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Get unread notification count",
      },
    }
  )

  // =========================================================================
  // GET /notifications/push-tokens — List push tokens
  // =========================================================================
  .get(
    "/push-tokens",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, set } =
        ctx as unknown as DerivedContext;

      try {
        const tokens = await notificationsService.listPushTokens(
          tenantContext,
          currentUserId
        );
        return { items: tokens };
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
      detail: {
        tags: ["Notifications"],
        summary: "List push tokens for current user",
      },
    }
  )

  // =========================================================================
  // POST /notifications/push-tokens — Register push token
  // =========================================================================
  .post(
    "/push-tokens",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.registerPushToken(
          tenantContext,
          currentUserId,
          body as { token: string; platform: "ios" | "android" | "web"; device_name?: string; device_model?: string }
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
      body: RegisterPushTokenSchema,
      headers: OptionalIdempotencyHeaderSchema,
      detail: {
        tags: ["Notifications"],
        summary: "Register a push notification token",
      },
    }
  )

  // =========================================================================
  // DELETE /notifications/push-tokens/:id — Remove push token
  // =========================================================================
  .delete(
    "/push-tokens/:id",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.removePushToken(
          tenantContext,
          currentUserId,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return { success: true as const, message: "Push token removed" };
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
      detail: {
        tags: ["Notifications"],
        summary: "Remove a push notification token",
      },
    }
  )

  // =========================================================================
  // POST /notifications/read-all — Mark all as read
  // =========================================================================
  .post(
    "/read-all",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.markAllAsRead(
          tenantContext,
          currentUserId
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
      response: {
        200: MarkAllReadResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: OptionalIdempotencyHeaderSchema,
      detail: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
      },
    }
  )

  // =========================================================================
  // GET /notifications/:id — Get single notification
  // =========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.getNotification(
          tenantContext,
          currentUserId,
          params.id
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
      response: {
        200: NotificationResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Get a notification by ID",
      },
    }
  )

  // =========================================================================
  // POST /notifications/:id/read — Mark single as read
  // =========================================================================
  .post(
    "/:id/read",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.markAsRead(
          tenantContext,
          currentUserId,
          params.id
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
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: NotificationResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Mark a notification as read",
      },
    }
  )

  // =========================================================================
  // POST /notifications/:id/dismiss — Dismiss notification
  // =========================================================================
  .post(
    "/:id/dismiss",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.dismissNotification(
          tenantContext,
          currentUserId,
          params.id
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
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: NotificationResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Dismiss a notification",
      },
    }
  )

  // =========================================================================
  // DELETE /notifications/:id — Delete notification
  // =========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.deleteNotification(
          tenantContext,
          currentUserId,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return { success: true as const, message: "Notification deleted" };
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
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Delete a notification",
      },
    }
  )

  // =========================================================================
  // GET /notifications/push/vapid-key — Get VAPID public key
  // =========================================================================
  .get(
    "/push/vapid-key",
    async (ctx) => {
      const { set } = ctx as unknown as DerivedContext;

      const publicKey = process.env["VAPID_PUBLIC_KEY"];
      if (!publicKey) {
        set.status = 503;
        return {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Web Push notifications are not configured",
          },
        };
      }

      return { public_key: publicKey };
    },
    {
      response: {
        200: VapidPublicKeyResponseSchema,
        503: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Get VAPID public key for Web Push subscription",
      },
    }
  )

  // =========================================================================
  // GET /notifications/push/subscriptions — List Web Push subscriptions
  // =========================================================================
  .get(
    "/push/subscriptions",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, set } =
        ctx as unknown as DerivedContext;

      try {
        const subscriptions = await notificationsService.listPushSubscriptions(
          tenantContext,
          currentUserId
        );
        return { items: subscriptions };
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
      detail: {
        tags: ["Notifications"],
        summary: "List Web Push subscriptions for current user",
      },
    }
  )

  // =========================================================================
  // POST /notifications/push/subscribe — Subscribe to Web Push
  // =========================================================================
  .post(
    "/push/subscribe",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.subscribePush(
          tenantContext,
          currentUserId,
          body as {
            endpoint: string;
            auth_key: string;
            p256dh_key: string;
            device_type?: "web" | "mobile_web" | "pwa";
            user_agent?: string;
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
      body: WebPushSubscribeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: WebPushSubscriptionResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Subscribe to Web Push notifications",
      },
    }
  )

  // =========================================================================
  // DELETE /notifications/push/unsubscribe — Unsubscribe from Web Push (by endpoint)
  // =========================================================================
  .delete(
    "/push/unsubscribe",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const { endpoint } = body as { endpoint: string };
        const result = await notificationsService.unsubscribePush(
          tenantContext,
          currentUserId,
          endpoint
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return { success: true as const, message: "Push subscription removed" };
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
      body: WebPushUnsubscribeSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Unsubscribe from Web Push notifications by endpoint",
      },
    }
  )

  // =========================================================================
  // DELETE /notifications/push/subscriptions/:id — Unsubscribe by ID
  // =========================================================================
  .delete(
    "/push/subscriptions/:id",
    async (ctx) => {
      const { notificationsService, tenantContext, currentUserId, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await notificationsService.unsubscribePushById(
          tenantContext,
          currentUserId,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return { success: true as const, message: "Push subscription removed" };
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
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Notifications"],
        summary: "Unsubscribe from Web Push notifications by subscription ID",
      },
    }
  );

export type NotificationsRoutes = typeof notificationsRoutes;
