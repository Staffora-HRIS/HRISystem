import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { DashboardRepository } from "./repository";
import { DashboardService } from "./service";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .derive((ctx) => {
    const { db, cache } = ctx as any;
    const repository = new DashboardRepository(db);
    const service = new DashboardService(repository, cache ?? null);
    return { dashboardService: service };
  })
  .get(
    "/admin/stats",
    async (ctx) => {
      const { dashboardService, tenant, user } = ctx as any;
      const tenantContext = { tenantId: tenant.id, userId: user.id };

      const result = await dashboardService.getAdminStats(tenantContext);

      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch dashboard stats");
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dashboards", "read")],
      response: {
        200: t.Object({
          totalEmployees: t.Number(),
          activeEmployees: t.Number(),
          departments: t.Number(),
          openPositions: t.Number(),
          pendingWorkflows: t.Number(),
          pendingApprovals: t.Number(),
        }),
      },
      detail: {
        tags: ["Dashboard"],
        summary: "Admin dashboard stats (cached, 60s TTL)",
      },
    }
  )
  .get(
    "/admin/activity",
    async (ctx) => {
      const { dashboardService, tenant, user, query } = ctx as any;
      const tenantContext = { tenantId: tenant.id, userId: user.id };
      const limit = query.limit ? parseInt(query.limit, 10) : 10;

      const result = await dashboardService.getRecentActivity(tenantContext, limit);

      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch recent activity");
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("dashboards", "read")],
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Dashboard"],
        summary: "Recent admin activity (cached, 60s TTL)",
      },
    }
  );

export type DashboardRoutes = typeof dashboardRoutes;
