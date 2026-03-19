/**
 * Manager Absence Service
 *
 * Handles team absence calendar and team overview (which includes
 * on-leave counts and pending approvals counts).
 *
 * Extracted from manager.service.ts for reduced cognitive complexity.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TeamOverview } from "./manager.schemas";
import type {
  TenantContext,
  TeamAbsenceEntry,
  TeamAbsenceEntryRow,
} from "./manager.types";
import type { ManagerHierarchyService } from "./manager.hierarchy.service";

// =============================================================================
// Absence Service
// =============================================================================

export class ManagerAbsenceService {
  constructor(
    private db: DatabaseClient,
    private hierarchy: ManagerHierarchyService
  ) {}

  /**
   * Get team overview for dashboard
   */
  async getTeamOverview(ctx: TenantContext): Promise<TeamOverview> {
    const employeeId = await this.hierarchy.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      return {
        directReportsCount: 0,
        totalSubordinatesCount: 0,
        pendingApprovalsCount: 0,
        teamOnLeaveCount: 0,
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx) => {
      // Get subordinate counts
      const subordinates = await tx<{ depth: number; count: number }[]>`
        SELECT depth, COUNT(*) as count
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND e.status IN ('active', 'on_leave')
        GROUP BY depth
      `;

      const directCount = subordinates.find((s) => s.depth === 1)?.count ?? 0;
      const totalCount = subordinates.reduce((sum, s) => sum + Number(s.count), 0);

      // Get team on leave count
      const onLeaveResult = await tx<{ count: number }[]>`
        SELECT COUNT(*) as count
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND e.status = 'on_leave'
      `;

      // Get pending approvals count
      const pendingResult = await tx<{ count: number }[]>`
        SELECT COUNT(*) as count
        FROM app.leave_requests lr
        JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND lr.status = 'pending'
      `;

      return {
        directReportsCount: Number(directCount),
        totalSubordinatesCount: totalCount,
        pendingApprovalsCount: Number(pendingResult[0]?.count ?? 0),
        teamOnLeaveCount: Number(onLeaveResult[0]?.count ?? 0),
      };
    });

    return result;
  }

  /**
   * Get team absence calendar
   */
  async getTeamAbsenceCalendar(
    ctx: TenantContext,
    startDate: string,
    endDate: string
  ): Promise<TeamAbsenceEntry[]> {
    const employeeId = await this.hierarchy.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamAbsenceEntryRow[]>`
        SELECT
          lr.id,
          lr.employee_id,
          CONCAT(ep.first_name, ' ', ep.last_name) as employee_name,
          lt.name as leave_type,
          lt.color as leave_color,
          lr.start_date::text,
          lr.end_date::text,
          lr.duration_days,
          lr.status
        FROM app.leave_requests lr
        JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
        JOIN app.employees e ON e.id = lr.employee_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.leave_types lt ON lt.id = lr.leave_type_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND lr.status IN ('approved', 'pending')
          AND lr.start_date <= ${endDate}::date
          AND lr.end_date >= ${startDate}::date
        ORDER BY lr.start_date
      `;
    });

    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      leaveType: row.leave_type,
      leaveColor: row.leave_color,
      startDate: row.start_date,
      endDate: row.end_date,
      durationDays: row.duration_days,
      status: row.status,
    }));
  }
}
