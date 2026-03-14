/**
 * Analytics Module - Elysia Routes
 *
 * Defines the API endpoints for analytics and reporting.
 * All routes require authentication and appropriate permissions.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { AnalyticsRepository, type TenantContext } from "./repository";
import { AnalyticsService } from "./service";
import {
  HeadcountFiltersSchema,
  TurnoverFiltersSchema,
  AttendanceFiltersSchema,
  LeaveFiltersSchema,
  RecruitmentFiltersSchema,
  DiversityFiltersSchema,
  CompensationFiltersSchema,
  HeadcountSummarySchema,
  HeadcountByDepartmentSchema,
  HeadcountTrendSchema,
  TurnoverSummarySchema,
  TurnoverByDepartmentSchema,
  TurnoverByReasonSchema,
  AttendanceSummarySchema,
  LeaveSummarySchema,
  LeaveByTypeSchema,
  RecruitmentSummarySchema,
  DiversityDashboardSchema,
  CompensationDashboardSchema,
  ExecutiveDashboardSchema,
  ManagerDashboardSchema,
  PeriodSchema,
} from "./schemas";

/**
 * Module-specific error code overrides (merged into shared mapErrorToStatus)
 */
const ANALYTICS_ERROR_CODES: Record<string, number> = {
  INVALID_DATE_RANGE: 400,
  INVALID_PERIOD: 400,
};

/**
 * Create Analytics routes plugin
 */
export const analyticsRoutes = new Elysia({ prefix: "/analytics", name: "analytics-routes" })
  // Plugin Setup
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new AnalyticsRepository(db);
    const service = new AnalyticsService(repository, db);

    return { analyticsService: service, analyticsRepository: repository };
  })

  // ===========================================================================
  // Dashboard Routes
  // ===========================================================================

  // GET /analytics/dashboard/executive - Executive dashboard
  .get(
    "/dashboard/executive",
    async (ctx) => {
      const { analyticsService, tenantContext, error } = ctx as any;
      const result = await analyticsService.getExecutiveDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      response: {
        200: ExecutiveDashboardSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get executive dashboard",
        description: "Get aggregated KPIs for executive dashboard",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /analytics/dashboard/manager - Manager dashboard
  .get(
    "/dashboard/manager",
    async (ctx) => {
      const { analyticsService, tenantContext, error } = ctx as any;
      const result = await analyticsService.getManagerDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      response: {
        200: ManagerDashboardSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get manager dashboard",
        description: "Get team-specific KPIs for manager dashboard",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Headcount Analytics
  // ===========================================================================

  // GET /analytics/headcount/summary - Headcount summary
  .get(
    "/headcount/summary",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getHeadcountSummary(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(HeadcountFiltersSchema),
      response: {
        200: HeadcountSummarySchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get headcount summary",
        description: "Get current headcount summary by status",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /analytics/headcount/by-department - Headcount by department
  .get(
    "/headcount/by-department",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getHeadcountByDepartment(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(HeadcountFiltersSchema),
      response: {
        200: t.Object({ items: t.Array(HeadcountByDepartmentSchema) }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get headcount by department",
        description: "Get headcount breakdown by department",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /analytics/headcount/trend - Headcount trend
  .get(
    "/headcount/trend",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getHeadcountTrend(
        tenantContext,
        query.start_date,
        query.end_date,
        query.period || "month"
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Object({
        start_date: t.String({ format: "date" }),
        end_date: t.String({ format: "date" }),
        period: t.Optional(PeriodSchema),
      }),
      response: {
        200: t.Object({ items: t.Array(HeadcountTrendSchema) }),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get headcount trend",
        description: "Get headcount trend over time",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Turnover Analytics
  // ===========================================================================

  // GET /analytics/turnover/summary - Turnover summary
  .get(
    "/turnover/summary",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getTurnoverSummary(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: TurnoverFiltersSchema,
      response: {
        200: TurnoverSummarySchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get turnover summary",
        description: "Get turnover summary for a period",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /analytics/turnover/by-department - Turnover by department
  .get(
    "/turnover/by-department",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getTurnoverByDepartment(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: TurnoverFiltersSchema,
      response: {
        200: t.Object({ items: t.Array(TurnoverByDepartmentSchema) }),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get turnover by department",
        description: "Get turnover breakdown by department",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /analytics/turnover/by-reason - Turnover by reason
  .get(
    "/turnover/by-reason",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getTurnoverByReason(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: TurnoverFiltersSchema,
      response: {
        200: t.Object({ items: t.Array(TurnoverByReasonSchema) }),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get turnover by reason",
        description: "Get turnover breakdown by termination reason",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Attendance Analytics
  // ===========================================================================

  // GET /analytics/attendance/summary - Attendance summary
  .get(
    "/attendance/summary",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getAttendanceSummary(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: AttendanceFiltersSchema,
      response: {
        200: AttendanceSummarySchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get attendance summary",
        description: "Get attendance summary for a period",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Leave Analytics
  // ===========================================================================

  // GET /analytics/leave/summary - Leave summary
  .get(
    "/leave/summary",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getLeaveSummary(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: LeaveFiltersSchema,
      response: {
        200: LeaveSummarySchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get leave summary",
        description: "Get leave request summary for a period",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /analytics/leave/by-type - Leave by type
  .get(
    "/leave/by-type",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getLeaveByType(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: LeaveFiltersSchema,
      response: {
        200: t.Object({ items: t.Array(LeaveByTypeSchema) }),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get leave by type",
        description: "Get leave breakdown by type",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Recruitment Analytics
  // ===========================================================================

  // GET /analytics/recruitment/summary - Recruitment summary
  .get(
    "/recruitment/summary",
    async (ctx) => {
      const { analyticsService, query, tenantContext, error } = ctx as any;
      const result = await analyticsService.getRecruitmentSummary(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", ANALYTICS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(RecruitmentFiltersSchema),
      response: {
        200: RecruitmentSummarySchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get recruitment summary",
        description: "Get recruitment pipeline summary",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Reports Route - Standard Reports Catalog
  // ===========================================================================

  // GET /analytics/reports - Get list of standard reports
  .get(
    "/reports",
    async (ctx) => {
      const { tenantContext, set } = ctx as any;
      
      // Return a static catalog of available standard reports
      const reports = [
        {
          id: "headcount-summary",
          name: "Headcount Summary",
          description: "Current headcount by department, status, and employment type",
          category: "workforce",
          last_run: null,
        },
        {
          id: "turnover-analysis",
          name: "Turnover Analysis",
          description: "Employee turnover rates and trends by department and reason",
          category: "workforce",
          last_run: null,
        },
        {
          id: "new-hires",
          name: "New Hires Report",
          description: "List of new hires within a specified date range",
          category: "workforce",
          last_run: null,
        },
        {
          id: "terminations",
          name: "Terminations Report",
          description: "List of terminations with reasons and exit interview data",
          category: "workforce",
          last_run: null,
        },
        {
          id: "absence-utilization",
          name: "Absence Utilization",
          description: "Leave balance utilization and absence patterns",
          category: "absence",
          last_run: null,
        },
        {
          id: "time-attendance",
          name: "Time & Attendance Summary",
          description: "Overtime, tardiness, and attendance patterns",
          category: "time",
          last_run: null,
        },
        {
          id: "benefits-enrollment",
          name: "Benefits Enrollment",
          description: "Current benefit plan enrollments and costs",
          category: "benefits",
          last_run: null,
        },
        {
          id: "training-completion",
          name: "Training Completion",
          description: "Training and compliance course completion rates",
          category: "learning",
          last_run: null,
        },
        {
          id: "performance-ratings",
          name: "Performance Ratings Distribution",
          description: "Performance review ratings by department and manager",
          category: "talent",
          last_run: null,
        },
        {
          id: "compensation-analysis",
          name: "Compensation Analysis",
          description: "Salary distribution, comp ratios, and pay equity analysis",
          category: "compensation",
          last_run: null,
        },
        {
          id: "org-structure",
          name: "Organization Structure",
          description: "Current organizational hierarchy and spans of control",
          category: "organization",
          last_run: null,
        },
        {
          id: "audit-log",
          name: "Audit Log Export",
          description: "System activity and change audit trail",
          category: "compliance",
          last_run: null,
        },
      ];
      
      return { items: reports };
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      response: {
        200: t.Object({
          items: t.Array(t.Object({
            id: t.String(),
            name: t.String(),
            description: t.String(),
            category: t.String(),
            last_run: t.Union([t.String(), t.Null()]),
          })),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Analytics"],
        summary: "Get standard reports catalog",
        description: "Get list of available standard reports",
        security: [{ bearerAuth: [] }],
      },
    }
  );

// ===========================================================================
// Diversity Analytics
// ===========================================================================

// GET /analytics/diversity - Diversity dashboard
analyticsRoutes.get(
  "/diversity",
  async (ctx) => {
    const { analyticsService, query, set } = ctx as any;
    const { tenant, user } = ctx as any;
    const context: TenantContext = { tenantId: tenant?.id, userId: user?.id };

    try {
      const result = await analyticsService.getDiversityDashboard(context, query || {});

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, ANALYTICS_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message || "Failed to get diversity analytics" } };
    }
  },
  {
    query: DiversityFiltersSchema,
    beforeHandle: [requirePermission("analytics", "read")],
    response: {
      200: DiversityDashboardSchema,
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    detail: {
      tags: ["Analytics"],
      summary: "Get diversity dashboard",
      description: "Get diversity analytics including gender, age band, nationality, and department breakdowns for active employees.",
      security: [{ bearerAuth: [] }],
    },
  }
);

// ===========================================================================
// Compensation Analytics
// ===========================================================================

// GET /analytics/compensation - Compensation dashboard
analyticsRoutes.get(
  "/compensation",
  async (ctx) => {
    const { analyticsService, query, set } = ctx as any;
    const { tenant, user } = ctx as any;
    const context: TenantContext = { tenantId: tenant?.id, userId: user?.id };

    try {
      const result = await analyticsService.getCompensationDashboard(context, query || {});

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, ANALYTICS_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message || "Failed to get compensation analytics" } };
    }
  },
  {
    query: CompensationFiltersSchema,
    beforeHandle: [requirePermission("analytics", "read")],
    response: {
      200: CompensationDashboardSchema,
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
    detail: {
      tags: ["Analytics"],
      summary: "Get compensation dashboard",
      description: "Get compensation analytics including salary summary, salary band distribution, department breakdown, and recent compensation changes.",
      security: [{ bearerAuth: [] }],
    },
  }
);

export type AnalyticsRoutes = typeof analyticsRoutes;
