/**
 * Usage Stats Module - Elysia Routes
 *
 * Defines the API endpoint for per-tenant usage analytics.
 * Mounted under /system prefix in the system routes group.
 *
 * Endpoints:
 *   GET /system/usage  - Retrieve usage statistics for the current tenant
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { UsageStatsRepository } from "./repository";
import { UsageStatsService } from "./service";
import {
  UsageStatsQuerySchema,
  UsageStatsRecordSchema,
  MonthlyUsageStatsSchema,
} from "./schemas";

// =============================================================================
// Routes
// =============================================================================

export const usageStatsRoutes = new Elysia({
  prefix: "/system",
  name: "usage-stats-routes",
})
  // Derive service instances from request context
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new UsageStatsRepository(db);
    const service = new UsageStatsService(repository, db);
    return { usageStatsService: service };
  })

  // GET /system/usage - Per-tenant usage analytics
  .get(
    "/usage",
    async (ctx) => {
      const { usageStatsService, query, tenantContext, error } = ctx as any;

      if (!tenantContext) {
        return error(400, {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tenant context required",
          },
        });
      }

      const result = await usageStatsService.getUsageStats(
        tenantContext,
        query
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(UsageStatsQuerySchema),
      response: {
        200: t.Object({
          items: t.Union([
            t.Array(UsageStatsRecordSchema),
            t.Array(MonthlyUsageStatsSchema),
          ]),
          period: t.String(),
          total_items: t.Number(),
        }),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["System"],
        summary: "Get tenant usage statistics",
        description:
          "Retrieve usage analytics for the current tenant. " +
          "Supports daily and monthly period granularity. " +
          "Daily stats show individual day records; monthly stats " +
          "aggregate daily rows into monthly summaries.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type UsageStatsRoutes = typeof usageStatsRoutes;
