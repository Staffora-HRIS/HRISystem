/**
 * Portal Routes - Self-service aggregations
 *
 * Provides /me, /my-team, /tasks, /approvals endpoints.
 */

import { Elysia } from "elysia";

export const portalRoutes = new Elysia({ prefix: "/portal" })
  // My profile and dashboard
  .get("/me", async (ctx) => {
    const { user, tenant, db, set } = ctx as any;
    if (!user || !tenant) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId: "" } };
    }

    try {
      // Get employee record for current user
      const [employee] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx) => {
        return tx`
          SELECT e.*, p.title as position_title, o.name as org_unit_name
          FROM app.employees e
          LEFT JOIN app.positions p ON p.id = e.position_id
          LEFT JOIN app.org_units o ON o.id = e.org_unit_id
          WHERE e.user_id = ${user.id}::uuid AND e.tenant_id = ${tenant.id}::uuid
          LIMIT 1
        `;
      });

      if (!employee) {
        return {
          user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
          employee: null,
          tenant: { id: tenant.id, name: tenant.name },
        };
      }

      return {
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
        employee: {
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          firstName: employee.firstName,
          lastName: employee.lastName,
          positionTitle: employee.positionTitle,
          orgUnitName: employee.orgUnitName,
          status: employee.status,
          hireDate: employee.hireDate,
        },
        tenant: { id: tenant.id, name: tenant.name },
      };
    } catch (error) {
      console.error("Portal /me error:", error);
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: "Failed to get profile", requestId: "" } };
    }
  }, { detail: { tags: ["Portal"], summary: "Get my profile" } })

  // My team (direct reports)
  .get("/my-team", async (ctx) => {
    const { user, tenant, db, set } = ctx as any;
    if (!user || !tenant) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId: "" } };
    }

    try {
      const team = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx) => {
        return tx`
          SELECT e.id, e.employee_number, e.first_name, e.last_name, 
                 e.status, p.title as position_title
          FROM app.employees e
          LEFT JOIN app.positions p ON p.id = e.position_id
          WHERE e.manager_id = (
            SELECT id FROM app.employees WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
          )
          AND e.tenant_id = ${tenant.id}::uuid
          AND e.status = 'active'
          ORDER BY e.last_name, e.first_name
        `;
      });

      return {
        team: team.map((m: any) => ({
          id: m.id,
          employeeNumber: m.employeeNumber,
          firstName: m.firstName,
          lastName: m.lastName,
          positionTitle: m.positionTitle,
          status: m.status,
        })),
        count: team.length,
      };
    } catch (error) {
      console.error("Portal /my-team error:", error);
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: "Failed to get team", requestId: "" } };
    }
  }, { detail: { tags: ["Portal"], summary: "Get my direct reports" } })

  // My pending tasks
  .get("/tasks", async (ctx) => {
    const { user, tenant, db, set } = ctx as any;
    if (!user || !tenant) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId: "" } };
    }

    try {
      const tasks = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx) => {
        return tx`
          SELECT t.id, t.task_type, t.title, t.description, t.due_date,
                 t.priority, t.status, t.created_at
          FROM app.tasks t
          WHERE t.assignee_id = ${user.id}::uuid
            AND t.tenant_id = ${tenant.id}::uuid
            AND t.status IN ('pending', 'in_progress')
          ORDER BY t.priority DESC, t.due_date ASC
          LIMIT 50
        `;
      });

      return {
        tasks: tasks.map((t: any) => ({
          id: t.id,
          taskType: t.taskType,
          title: t.title,
          description: t.description,
          dueDate: t.dueDate,
          priority: t.priority,
          status: t.status,
          createdAt: t.createdAt,
        })),
        count: tasks.length,
      };
    } catch (error) {
      console.error("Portal /tasks error:", error);
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: "Failed to get tasks", requestId: "" } };
    }
  }, { detail: { tags: ["Portal"], summary: "Get my pending tasks" } })

  // My pending approvals
  .get("/approvals", async (ctx) => {
    const { user, tenant, db, set } = ctx as any;
    if (!user || !tenant) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId: "" } };
    }

    try {
      // Get pending leave requests for approval
      const leaveApprovals = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx) => {
        return tx`
          SELECT lr.id, lr.employee_id, e.first_name, e.last_name,
                 lt.name as leave_type, lr.start_date, lr.end_date, lr.total_days,
                 lr.reason, lr.created_at, 'leave_request' as approval_type
          FROM app.leave_requests lr
          JOIN app.employees e ON e.id = lr.employee_id
          JOIN app.leave_types lt ON lt.id = lr.leave_type_id
          WHERE lr.status = 'pending'
            AND lr.tenant_id = ${tenant.id}::uuid
            AND e.manager_id = (
              SELECT id FROM app.employees WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
            )
          ORDER BY lr.created_at ASC
          LIMIT 50
        `;
      });

      // Get pending timesheet approvals
      const timesheetApprovals = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx) => {
        return tx`
          SELECT ts.id, ts.employee_id, e.first_name, e.last_name,
                 ts.period_start, ts.period_end, ts.total_regular_hours,
                 ts.submitted_at, 'timesheet' as approval_type
          FROM app.timesheets ts
          JOIN app.employees e ON e.id = ts.employee_id
          WHERE ts.status = 'submitted'
            AND ts.tenant_id = ${tenant.id}::uuid
            AND e.manager_id = (
              SELECT id FROM app.employees WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
            )
          ORDER BY ts.submitted_at ASC
          LIMIT 50
        `;
      });

      return {
        approvals: [
          ...leaveApprovals.map((a: any) => ({
            id: a.id,
            type: "leave_request",
            employeeId: a.employeeId,
            employeeName: `${a.firstName} ${a.lastName}`,
            details: {
              leaveType: a.leaveType,
              startDate: a.startDate,
              endDate: a.endDate,
              totalDays: a.totalDays,
              reason: a.reason,
            },
            createdAt: a.createdAt,
          })),
          ...timesheetApprovals.map((a: any) => ({
            id: a.id,
            type: "timesheet",
            employeeId: a.employeeId,
            employeeName: `${a.firstName} ${a.lastName}`,
            details: {
              periodStart: a.periodStart,
              periodEnd: a.periodEnd,
              totalHours: a.totalRegularHours,
            },
            createdAt: a.submittedAt,
          })),
        ],
        count: leaveApprovals.length + timesheetApprovals.length,
      };
    } catch (error) {
      console.error("Portal /approvals error:", error);
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: "Failed to get approvals", requestId: "" } };
    }
  }, { detail: { tags: ["Portal"], summary: "Get my pending approvals" } })

  // Dashboard summary
  .get("/dashboard", async (ctx) => {
    const { user, tenant, db, set } = ctx as any;
    if (!user || !tenant) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId: "" } };
    }

    try {
      const ctx = { tenantId: tenant.id, userId: user.id };

      // Get counts
      const [taskCount] = await db.withTransaction(ctx, async (tx) => {
        return tx`
          SELECT COUNT(*) as count FROM app.tasks
          WHERE assignee_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
            AND status IN ('pending', 'in_progress')
        `;
      });

      const [approvalCount] = await db.withTransaction(ctx, async (tx) => {
        return tx`
          SELECT COUNT(*) as count FROM app.leave_requests lr
          JOIN app.employees e ON e.id = lr.employee_id
          WHERE lr.status = 'pending' AND lr.tenant_id = ${tenant.id}::uuid
            AND e.manager_id = (SELECT id FROM app.employees WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid)
        `;
      });

      const [teamCount] = await db.withTransaction(ctx, async (tx) => {
        return tx`
          SELECT COUNT(*) as count FROM app.employees
          WHERE manager_id = (SELECT id FROM app.employees WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid)
            AND tenant_id = ${tenant.id}::uuid AND status = 'active'
        `;
      });

      return {
        summary: {
          pendingTasks: Number(taskCount?.count || 0),
          pendingApprovals: Number(approvalCount?.count || 0),
          teamMembers: Number(teamCount?.count || 0),
        },
      };
    } catch (error) {
      console.error("Portal /dashboard error:", error);
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: "Failed to get dashboard", requestId: "" } };
    }
  }, { detail: { tags: ["Portal"], summary: "Get dashboard summary" } });

export type PortalRoutes = typeof portalRoutes;
