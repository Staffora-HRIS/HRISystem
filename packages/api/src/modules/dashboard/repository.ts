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
      // Single query with CTEs — reduces 4 round-trips to 1
      const [row] = await tx<AdminStatsData[]>`
        WITH emp AS (
          SELECT
            count(*)::int AS total_employees,
            count(*) FILTER (WHERE status = 'active')::int AS active_employees
          FROM employees
        ),
        dept AS (
          SELECT count(*)::int AS departments
          FROM org_units
          WHERE is_active = true AND level = 1
        ),
        pos AS (
          SELECT count(*)::int AS open_positions
          FROM requisitions
          WHERE status = 'open' AND filled < openings
        ),
        wf AS (
          SELECT
            (SELECT count(*)::int FROM workflow_instances WHERE status IN ('pending', 'in_progress')) AS pending_workflows,
            (SELECT count(*)::int FROM workflow_tasks WHERE status IN ('pending', 'assigned', 'in_progress')) AS pending_approvals
        )
        SELECT
          emp.total_employees,
          emp.active_employees,
          dept.departments,
          pos.open_positions,
          wf.pending_workflows,
          wf.pending_approvals
        FROM emp, dept, pos, wf
      `;

      return {
        totalEmployees: row?.totalEmployees ?? 0,
        activeEmployees: row?.activeEmployees ?? 0,
        departments: row?.departments ?? 0,
        openPositions: row?.openPositions ?? 0,
        pendingWorkflows: row?.pendingWorkflows ?? 0,
        pendingApprovals: row?.pendingApprovals ?? 0,
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
