/**
 * Calendar Sync Module Routes
 *
 * Calendar connection management and iCal feed serving.
 *
 * Authenticated endpoints (require session):
 * - GET    /calendar/connections        — List user's calendar connections
 * - POST   /calendar/ical/enable        — Enable iCal feed (generates unique token)
 * - POST   /calendar/ical/regenerate    — Regenerate iCal feed token (invalidates old URL)
 * - DELETE /calendar/ical               — Disable iCal feed
 *
 * Public endpoint (no auth — token IS the credential):
 * - GET    /calendar/ical/:token        — Serve iCal feed (.ics)
 */

import { Elysia } from "elysia";
import {
  ErrorResponseSchema,
  DeleteSuccessSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { CalendarSyncRepository } from "./repository";
import { CalendarSyncService } from "./service";
import {
  CalendarConnectionResponseSchema,
  IcalEnableResponseSchema,
  IcalTokenParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
  request: Request;
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  calendarSyncService: CalendarSyncService;
  tenantContext: { tenantId: string; userId: string | undefined };
  currentUserId: string;
  baseUrl: string;
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number; headers: Record<string, string> };
}

export const calendarSyncRoutes = new Elysia({ prefix: "/calendar" })

  // =========================================================================
  // PUBLIC: GET /calendar/ical/:token — Serve iCal feed (no auth required)
  //
  // This route MUST be registered before the derive() that requires auth,
  // because the iCal feed is accessed by calendar apps without credentials.
  // =========================================================================
  .get(
    "/ical/:token",
    async (ctx) => {
      const { params, set } = ctx;
      const db = (ctx as unknown as { db: DatabaseClient }).db;

      const repository = new CalendarSyncRepository(db);
      const service = new CalendarSyncService(repository, db);

      const result = await service.generateIcalFeed(params.token);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error!.code);
        return { error: result.error };
      }

      // Return the iCal content with correct MIME type
      set.headers["content-type"] = "text/calendar; charset=utf-8";
      set.headers["content-disposition"] =
        'attachment; filename="staffora-leave.ics"';
      // Allow calendar apps to cache for 30 minutes
      set.headers["cache-control"] = "public, max-age=1800";

      return result.data;
    },
    {
      params: IcalTokenParamsSchema,
      detail: {
        tags: ["Calendar"],
        summary: "Get iCal feed by token (public, no auth)",
        description:
          "Returns an RFC 5545 iCal feed of the user's leave requests. " +
          "The token in the URL serves as the authentication credential. " +
          "This endpoint is designed to be subscribed to by calendar apps " +
          "(Google Calendar, Outlook, Apple Calendar, etc.).",
      },
    }
  )

  // =========================================================================
  // Derive: Wire up service for authenticated endpoints
  // =========================================================================
  .derive((ctx) => {
    const { db, tenant, user, request } = ctx as unknown as PluginContext;
    const repository = new CalendarSyncRepository(db);
    const service = new CalendarSyncService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    // Derive base URL from the request for constructing feed URLs
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    return {
      calendarSyncService: service,
      tenantContext,
      currentUserId: user?.id || "",
      baseUrl,
    };
  })

  // =========================================================================
  // GET /calendar/connections — List user's calendar connections
  // =========================================================================
  .get(
    "/connections",
    async (ctx) => {
      const { calendarSyncService, tenantContext, currentUserId, set } =
        ctx as unknown as DerivedContext;

      try {
        const connections = await calendarSyncService.listConnections(
          tenantContext,
          currentUserId
        );
        return { items: connections };
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
        tags: ["Calendar"],
        summary: "List calendar connections for current user",
      },
    }
  )

  // =========================================================================
  // POST /calendar/ical/enable — Enable iCal feed
  // =========================================================================
  .post(
    "/ical/enable",
    async (ctx) => {
      const {
        calendarSyncService,
        tenantContext,
        currentUserId,
        baseUrl,
        set,
      } = ctx as unknown as DerivedContext;

      try {
        const result = await calendarSyncService.enableIcalFeed(
          tenantContext,
          currentUserId,
          baseUrl
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
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: IcalEnableResponseSchema,
        200: IcalEnableResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Calendar"],
        summary: "Enable iCal feed for current user",
        description:
          "Generates a unique iCal feed URL. If already enabled, returns " +
          "the existing feed URL. Subscribe to this URL in any calendar app " +
          "(Google Calendar, Outlook, Apple Calendar) to see your leave.",
      },
    }
  )

  // =========================================================================
  // POST /calendar/ical/regenerate — Regenerate iCal feed token
  // =========================================================================
  .post(
    "/ical/regenerate",
    async (ctx) => {
      const {
        calendarSyncService,
        tenantContext,
        currentUserId,
        baseUrl,
        set,
      } = ctx as unknown as DerivedContext;

      try {
        const result = await calendarSyncService.regenerateIcalToken(
          tenantContext,
          currentUserId,
          baseUrl
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
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: IcalEnableResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Calendar"],
        summary: "Regenerate iCal feed token",
        description:
          "Generates a new token and invalidates the previous feed URL. " +
          "Use this if you suspect the feed URL has been shared.",
      },
    }
  )

  // =========================================================================
  // DELETE /calendar/ical — Disable iCal feed
  // =========================================================================
  .delete(
    "/ical",
    async (ctx) => {
      const { calendarSyncService, tenantContext, currentUserId, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await calendarSyncService.disableIcalFeed(
          tenantContext,
          currentUserId
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return { success: true as const, message: "iCal feed disabled" };
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
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Calendar"],
        summary: "Disable iCal feed",
        description:
          "Removes the iCal connection and invalidates the feed URL. " +
          "Calendar apps will receive an error on the next sync.",
      },
    }
  );

export type CalendarSyncRoutes = typeof calendarSyncRoutes;
