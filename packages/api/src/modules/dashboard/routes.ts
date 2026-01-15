import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .get(
    "/admin/stats",
    async (ctx) => {
      const { tenant, user, db } = ctx as any;

      const [row] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{
              totalEmployees: number;
              activeEmployees: number;
              departments: number;
              openPositions: number;
              pendingWorkflows: number;
              pendingApprovals: number;
            }>
          >`
            SELECT
              (SELECT count(*)::int FROM app.employees) AS total_employees,
              (SELECT count(*)::int FROM app.employees WHERE status = 'active') AS active_employees,
              (SELECT count(*)::int FROM app.org_units WHERE is_active = true AND level = 1) AS departments,
              (SELECT count(*)::int FROM app.requisitions WHERE status = 'open' AND filled < openings) AS open_positions,
              (SELECT count(*)::int FROM app.workflow_instances WHERE status IN ('pending', 'in_progress')) AS pending_workflows,
              (SELECT count(*)::int FROM app.workflow_tasks WHERE status IN ('pending', 'assigned', 'in_progress')) AS pending_approvals
          `;
        }
      );

      return {
        totalEmployees: row?.totalEmployees ?? 0,
        activeEmployees: row?.activeEmployees ?? 0,
        departments: row?.departments ?? 0,
        openPositions: row?.openPositions ?? 0,
        pendingWorkflows: row?.pendingWorkflows ?? 0,
        pendingApprovals: row?.pendingApprovals ?? 0,
      };
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
        summary: "Admin dashboard stats",
      },
    }
  );

export type DashboardRoutes = typeof dashboardRoutes;
