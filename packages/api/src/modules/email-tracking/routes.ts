/**
 * Email Tracking Module Routes
 *
 * Email delivery monitoring endpoints for tenant administrators.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET  /email-tracking/deliveries       -- List email delivery log with filters
 * - GET  /email-tracking/deliveries/stats  -- Get delivery statistics
 * - GET  /email-tracking/deliveries/:id    -- Get single delivery log entry
 * - POST /email-tracking/deliveries/bounce -- Record a bounce event (webhook)
 */

import { Elysia, t } from "elysia";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { EmailTrackingRepository } from "./repository";
import { EmailTrackingService } from "./service";
import {
  EmailDeliveryLogResponseSchema,
  EmailDeliveryFiltersSchema,
  EmailDeliveryStatsResponseSchema,
  EmailDeliveryStatsQuerySchema,
  RecordBounceSchema,
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
  emailTrackingService: EmailTrackingService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

export const emailTrackingRoutes = new Elysia({
  prefix: "/email-tracking",
})

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new EmailTrackingRepository(db);
    const service = new EmailTrackingService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return {
      emailTrackingService: service,
      tenantContext,
    };
  })

  // ===========================================================================
  // GET /email-tracking/deliveries -- List email delivery log
  // ===========================================================================
  .get(
    "/deliveries",
    async (ctx) => {
      const { emailTrackingService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await emailTrackingService.listDeliveryLog(
          tenantContext,
          filters as {
            status?: "queued" | "sent" | "delivered" | "bounced" | "failed";
            to_address?: string;
            template_name?: string;
            date_from?: string;
            date_to?: string;
            search?: string;
          },
          {
            cursor: cursor as string | undefined,
            limit:
              limit !== undefined && limit !== null
                ? Number(limit)
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
      query: t.Intersect([PaginationQuerySchema, EmailDeliveryFiltersSchema]),
      detail: {
        tags: ["Email Tracking"],
        summary: "List email delivery log entries with filters",
        description:
          "Returns a paginated list of email delivery log entries. " +
          "Supports filtering by status, recipient address, template, " +
          "date range, and free-text search.",
      },
    }
  )

  // ===========================================================================
  // GET /email-tracking/deliveries/stats -- Get delivery statistics
  // ===========================================================================
  .get(
    "/deliveries/stats",
    async (ctx) => {
      const { emailTrackingService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await emailTrackingService.getDeliveryStats(
          tenantContext,
          query as {
            date_from?: string;
            date_to?: string;
            template_name?: string;
          }
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
      query: EmailDeliveryStatsQuerySchema,
      response: {
        200: EmailDeliveryStatsResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Email Tracking"],
        summary: "Get email delivery statistics",
        description:
          "Returns aggregate delivery statistics (counts by status and " +
          "delivery/bounce/failure rates) for a given time period. " +
          "Defaults to the last 30 days if no date range is specified.",
      },
    }
  )

  // ===========================================================================
  // GET /email-tracking/deliveries/:id -- Get single delivery log entry
  // ===========================================================================
  .get(
    "/deliveries/:id",
    async (ctx) => {
      const { emailTrackingService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await emailTrackingService.getDeliveryLogEntry(
          tenantContext,
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
        200: EmailDeliveryLogResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Email Tracking"],
        summary: "Get a single email delivery log entry",
        description:
          "Returns the full details of a single email delivery log entry " +
          "including status, bounce information, and metadata.",
      },
    }
  )

  // ===========================================================================
  // POST /email-tracking/deliveries/bounce -- Record bounce event
  // ===========================================================================
  .post(
    "/deliveries/bounce",
    async (ctx) => {
      const { emailTrackingService, set, body } =
        ctx as unknown as DerivedContext;

      try {
        const bounceData = body as {
          message_id: string;
          bounce_type: "hard" | "soft" | "complaint";
          bounce_reason?: string;
        };

        const result = await emailTrackingService.recordBounce(
          bounceData.message_id,
          bounceData.bounce_type,
          bounceData.bounce_reason
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
      body: RecordBounceSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmailDeliveryLogResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Email Tracking"],
        summary: "Record an email bounce event",
        description:
          "Called by email provider webhooks to record a bounce event. " +
          "Looks up the delivery log entry by provider message_id and " +
          "updates its status to bounced with the bounce classification.",
      },
    }
  );

export type EmailTrackingRoutes = typeof emailTrackingRoutes;
