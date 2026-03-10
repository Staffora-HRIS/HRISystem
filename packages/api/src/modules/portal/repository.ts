/**
 * Portal Module - Repository Layer
 *
 * Database operations for the self-service portal.
 * All queries respect RLS via tenant context.
 */

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export class PortalRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Profile
  // ===========================================================================

  async getEmployeeProfile(ctx: TenantContext): Promise<any | null> {
    const [employee] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            e.*,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            o.name as org_unit_name
          FROM app.employees e
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa
            ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
          WHERE e.user_id = ${ctx.userId}::uuid AND e.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return employee || null;
  }

  // ===========================================================================
  // Team
  // ===========================================================================

  async getDirectReports(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH manager_employee AS (
            SELECT id
            FROM app.employees
            WHERE user_id = ${ctx.userId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
            LIMIT 1
          )
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            e.status,
            p.title as position_title
          FROM app.reporting_lines rl
          INNER JOIN manager_employee me ON me.id = rl.manager_id
          INNER JOIN app.employees e ON e.id = rl.employee_id
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa
            ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          WHERE rl.tenant_id = ${ctx.tenantId}::uuid
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
            AND e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status = 'active'
          ORDER BY ep.last_name, ep.first_name
        `;
      }
    );
  }

  // ===========================================================================
  // Tasks
  // ===========================================================================

  async getPendingTasks(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT t.id, t.task_type, t.title, t.description, t.due_date,
                 t.priority, t.status, t.created_at
          FROM app.tasks t
          WHERE t.assignee_id = ${ctx.userId}::uuid
            AND t.tenant_id = ${ctx.tenantId}::uuid
            AND t.status IN ('pending', 'in_progress')
          ORDER BY t.priority DESC, t.due_date ASC
          LIMIT 50
        `;
      }
    );
  }

  // ===========================================================================
  // Approvals
  // ===========================================================================

  async getPendingLeaveApprovals(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH manager_employee AS (
            SELECT id
            FROM app.employees
            WHERE user_id = ${ctx.userId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
            LIMIT 1
          )
          SELECT
            lr.id,
            lr.employee_id,
            ep.first_name,
            ep.last_name,
            lt.name as leave_type,
            lr.start_date,
            lr.end_date,
            lr.duration as total_days,
            lr.reason,
            lr.created_at,
            'leave_request' as approval_type
          FROM app.leave_requests lr
          INNER JOIN app.employees e ON e.id = lr.employee_id
          INNER JOIN app.reporting_lines rl
            ON rl.employee_id = e.id
            AND rl.tenant_id = e.tenant_id
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
          INNER JOIN manager_employee me ON me.id = rl.manager_id
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id
          WHERE lr.status = 'pending'
            AND lr.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY lr.created_at ASC
          LIMIT 50
        `;
      }
    );
  }

  async getPendingTimesheetApprovals(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH manager_employee AS (
            SELECT id
            FROM app.employees
            WHERE user_id = ${ctx.userId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
            LIMIT 1
          )
          SELECT
            ts.id,
            ts.employee_id,
            ep.first_name,
            ep.last_name,
            ts.period_start,
            ts.period_end,
            ts.total_regular_hours,
            ts.submitted_at,
            'timesheet' as approval_type
          FROM app.timesheets ts
          INNER JOIN app.employees e ON e.id = ts.employee_id
          INNER JOIN app.reporting_lines rl
            ON rl.employee_id = e.id
            AND rl.tenant_id = e.tenant_id
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
          INNER JOIN manager_employee me ON me.id = rl.manager_id
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          WHERE ts.status = 'submitted'
            AND ts.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY ts.submitted_at ASC
          LIMIT 50
        `;
      }
    );
  }

  // ===========================================================================
  // Dashboard Counts
  // ===========================================================================

  async getPendingTaskCount(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as count FROM app.tasks
          WHERE assignee_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            AND status IN ('pending', 'in_progress')
        `;
      }
    );

    return Number(result?.count || 0);
  }

  async getPendingApprovalCount(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as count FROM app.leave_requests lr
          JOIN app.employees e ON e.id = lr.employee_id
          JOIN app.reporting_lines rl
            ON rl.employee_id = e.id
            AND rl.tenant_id = e.tenant_id
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
          WHERE lr.status = 'pending'
            AND lr.tenant_id = ${ctx.tenantId}::uuid
            AND rl.manager_id = (SELECT id FROM app.employees WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid)
        `;
      }
    );

    return Number(result?.count || 0);
  }

  async getTeamMemberCount(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as count
          FROM app.reporting_lines rl
          JOIN app.employees e ON e.id = rl.employee_id
          WHERE rl.tenant_id = ${ctx.tenantId}::uuid
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
            AND rl.manager_id = (SELECT id FROM app.employees WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid)
            AND e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status = 'active'
        `;
      }
    );

    return Number(result?.count || 0);
  }

  // ===========================================================================
  // Portal Access
  // ===========================================================================

  async getUserRoles(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT r.id, r.name as role_name
          FROM app.user_roles ur
          JOIN app.roles r ON r.id = ur.role_id
          WHERE ur.user_id = ${ctx.userId}::uuid
            AND ur.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
  }

  async hasDirectReports(ctx: TenantContext): Promise<boolean> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT EXISTS(
            SELECT 1 FROM app.reporting_lines rl
            WHERE rl.tenant_id = ${ctx.tenantId}::uuid
              AND rl.effective_to IS NULL
              AND rl.is_primary = true
              AND rl.manager_id = (
                SELECT id FROM app.employees
                WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
                LIMIT 1
              )
          ) as has_reports
        `;
      }
    );

    return result?.hasReports ?? false;
  }
}
