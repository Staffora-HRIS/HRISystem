/**
 * Sickness Analytics Module - Elysia Routes
 *
 * Defines API endpoints for sickness absence trend analysis.
 * All routes require authentication and analytics:read permission.
 *
 * Endpoints:
 *   GET /analytics/sickness/trends       - Monthly sickness absence rates
 *   GET /analytics/sickness/by-reason    - Breakdown by absence reason
 *   GET /analytics/sickness/by-department - Rates per department with Bradford Factor
 *   GET /analytics/sickness/seasonal     - Month-of-year seasonal averages
 *   GET /analytics/sickness/summary      - Key sickness KPIs and cost estimate
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { SicknessAnalyticsRepository } from "./repository";
import { SicknessAnalyticsService } from "./service";
import {
  SicknessAnalyticsFiltersSchema,
  SicknessTrendsResponseSchema,
  SicknessByReasonResponseSchema,
  SicknessByDepartmentResponseSchema,
  SicknessSeasonalResponseSchema,
  SicknessSummaryResponseSchema,
} from "./schemas";

/**
 * Module-specific error code overrides
 */
const SICKNESS_ERROR_CODES: Record<string, number> = {
  INVALID_DATE_RANGE: 400,
};

/**
 * Sickness analytics routes plugin.
 * Mounted under /analytics/sickness in the API v1 group.
 */
export const sicknessAnalyticsRoutes = new Elysia({
  prefix: "/analytics/sickness",
  name: "sickness-analytics-routes",
})
  // Plugin Setup: derive service from db
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new SicknessAnalyticsRepository(db);
    const service = new SicknessAnalyticsService(repository);
    return { sicknessService: service };
  })

  // ===========================================================================
  // GET /analytics/sickness/trends - Monthly sickness trends
  // ===========================================================================
  .get(
    "/trends",
    async (ctx) => {
      const { sicknessService, query, tenantContext, error } = ctx as any;

      const result = await sicknessService.getSicknessTrends(
        tenantContext,
        query || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          SICKNESS_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(SicknessAnalyticsFiltersSchema),
      response: {
        200: SicknessTrendsResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get sickness absence trends",
        description:
          "Get monthly sickness absence rates, total days lost, spells, " +
          "and unique employees over time. Supports filtering by department, " +
          "date range, and employee group. Defaults to the last 12 months.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /analytics/sickness/by-reason - Breakdown by reason
  // ===========================================================================
  .get(
    "/by-reason",
    async (ctx) => {
      const { sicknessService, query, tenantContext, error } = ctx as any;

      const result = await sicknessService.getSicknessByReason(
        tenantContext,
        query || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          SICKNESS_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(SicknessAnalyticsFiltersSchema),
      response: {
        200: SicknessByReasonResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get sickness absence by reason",
        description:
          "Get sickness absence breakdown by reported reason. Shows total days, " +
          "spell count, unique employees, and average spell duration per reason. " +
          "Reasons are extracted from the leave request reason field.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /analytics/sickness/by-department - Department rates + Bradford Factor
  // ===========================================================================
  .get(
    "/by-department",
    async (ctx) => {
      const { sicknessService, query, tenantContext, error } = ctx as any;

      const result = await sicknessService.getSicknessByDepartment(
        tenantContext,
        query || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          SICKNESS_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(SicknessAnalyticsFiltersSchema),
      response: {
        200: SicknessByDepartmentResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get sickness absence by department",
        description:
          "Get sickness absence rates per department including headcount, " +
          "total days lost, absence rate, average days per employee, and " +
          "aggregate Bradford Factor scores. bradford_high_count indicates " +
          "the number of employees at high or serious Bradford Factor levels.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /analytics/sickness/seasonal - Seasonal patterns
  // ===========================================================================
  .get(
    "/seasonal",
    async (ctx) => {
      const { sicknessService, query, tenantContext, error } = ctx as any;

      const result = await sicknessService.getSicknessSeasonalPatterns(
        tenantContext,
        query || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          SICKNESS_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(SicknessAnalyticsFiltersSchema),
      response: {
        200: SicknessSeasonalResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get sickness seasonal patterns",
        description:
          "Get month-of-year averages for sickness absence to reveal seasonal " +
          "patterns. Averages across all available years of data. Identifies " +
          "peak and lowest months. Useful for resource planning and identifying " +
          "seasonal trends (e.g., higher sickness in winter months).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /analytics/sickness/summary - Key sickness metrics
  // ===========================================================================
  .get(
    "/summary",
    async (ctx) => {
      const { sicknessService, query, tenantContext, error } = ctx as any;

      const result = await sicknessService.getSicknessSummary(
        tenantContext,
        query || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          SICKNESS_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(SicknessAnalyticsFiltersSchema),
      response: {
        200: SicknessSummaryResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get sickness absence summary",
        description:
          "Get key sickness absence metrics: total days lost, frequency rate, " +
          "absence rate, average days per employee, cost estimate (based on " +
          "average daily salary), and short-term vs long-term breakdown. " +
          "Short-term is defined as 1-7 days; long-term as >7 days.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type SicknessAnalyticsRoutes = typeof sicknessAnalyticsRoutes;
