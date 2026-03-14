/**
 * Dashboard Module - Repository Layer
 *
 * Provides data access methods for dashboard statistics.
 * All methods respect RLS through tenant context.
 * Uses explicit column lists and bare table names (search_path = app,public).
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Raw database row for employee counts
 */
interface EmployeeCountsRow {
  totalEmployees: number;
  activeEmployees: number;
}

/**
 * Raw database row for department count
 */
interface DepartmentCountRow {
  departments: number;
}

/**
 * Raw database row for open positions count
 */
interface OpenPositionsRow {
  openPositions: number;
}

/**
 * Raw database row for pending workflow counts
 */
interface PendingWorkflowsRow {
  pendingWorkflows: number;
  pendingApprovals: number;
}

/**
 * Aggregate admin stats returned from the repository
 */
export interface AdminStatsData {
  totalEmployees: number;
  activeEmployees: number;
  departments: number;
  openPositions: number;
  pendingWorkflows: number;
  pendingApprovals: number;
}

/**
 * Recent activity entry from audit_log
 */
export interface RecentActivityRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

// =============================================================================
// Repository
// =============================================================================

export class DashboardRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Fetch aggregate statistics for the admin dashboard.
   * Runs within a tenant-scoped transaction so RLS is enforced.
   *
   * Uses separate subqueries per table to keep each COUNT independent
   * and avoid cross-table join overhead. All queries run in a single
   * transaction with tenant context set.
   */
  async getAdminStats(ctx: TenantContext): Promise<AdminStatsData> {
    return await this.db.withTransaction(ctx, async (tx) => {
      // Run all counts in parallel within the same transaction
      const [employeeCounts, departmentCounts, openPositionCounts, workflowCounts] =
        await Promise.all([
          tx<EmployeeCountsRow[]>`
            SELECT
              count(*)::int AS total_employees,
              count(*) FILTER (WHERE status = 'active')::int AS active_employees
            FROM employees
          `,
          tx<DepartmentCountRow[]>`
            SELECT count(*)::int AS departments
            FROM org_units
            WHERE is_active = true
              AND level = 1
          `,
          tx<OpenPositionsRow[]>`
            SELECT count(*)::int AS open_positions
            FROM requisitions
            WHERE status = 'open'
              AND filled < openings
          `,
          tx<PendingWorkflowsRow[]>`
            SELECT
              (SELECT count(*)::int FROM workflow_instances WHERE status IN ('pending', 'in_progress')) AS pending_workflows,
              (SELECT count(*)::int FROM workflow_tasks WHERE status IN ('pending', 'assigned', 'in_progress')) AS pending_approvals
          `,
        ]);

      const empRow = employeeCounts[0];
      const deptRow = departmentCounts[0];
      const posRow = openPositionCounts[0];
      const wfRow = workflowCounts[0];

      return {
        totalEmployees: empRow?.totalEmployees ?? 0,
        activeEmployees: empRow?.activeEmployees ?? 0,
        departments: deptRow?.departments ?? 0,
        openPositions: posRow?.openPositions ?? 0,
        pendingWorkflows: wfRow?.pendingWorkflows ?? 0,
        pendingApprovals: wfRow?.pendingApprovals ?? 0,
      };
    });
  }

  /**
   * Fetch recent activity from the audit log for the tenant.
   * Returns the most recent entries, limited by the specified count.
   */
  async getRecentActivity(ctx: TenantContext, limit: number = 10): Promise<RecentActivityRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<RecentActivityRow[]>`
        SELECT
          id,
          action,
          resource_type,
          resource_id,
          user_id,
          created_at,
          metadata
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return rows;
    });
  }
}
