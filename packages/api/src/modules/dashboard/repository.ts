/**
 * Dashboard Module - Repository Layer
 *
 * Provides data access methods for dashboard statistics.
 * All methods respect RLS through tenant context.
 * Uses explicit column lists and bare table names (search_path = app,public).
 *
 * Materialized View Strategy:
 * - Primary path: reads from pre-aggregated materialized views
 *   (mv_dashboard_employee_stats, mv_dashboard_leave_stats, etc.)
 * - Fallback path: if the MV is empty (first deploy, never refreshed),
 *   falls back to live COUNT queries against the source tables.
 * - MVs are refreshed every 5 minutes by the scheduler job
 *   "dashboard-stats-refresh" via app.refresh_dashboard_stats().
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import { logger } from "../../lib/logger";

// =============================================================================
// Types
// =============================================================================

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
 * Extended dashboard stats including materialized view data
 */
export interface DashboardExtendedStats extends AdminStatsData {
  /** Employee breakdown */
  pendingEmployees: number;
  terminatedEmployees: number;
  onLeaveEmployees: number;
  newHires30d: number;

  /** Leave request breakdown */
  pendingLeaveRequests: number;
  approvedUpcomingLeave: number;
  currentlyOnLeave: number;

  /** Case breakdown */
  openCases: number;
  pendingCases: number;
  slaBreachedCases: number;

  /** Onboarding breakdown */
  activeOnboardings: number;
  avgOnboardingProgress: number;

  /** Data freshness indicator -- null means MVs were not available */
  refreshedAt: Date | null;
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
   *
   * Attempts to read from the employee materialized view first (fast path).
   * Falls back to live CTE queries if the MV is empty or unavailable.
   * RLS is enforced for the live fallback; MVs filter by tenant_id in WHERE.
   */
  async getAdminStats(ctx: TenantContext): Promise<AdminStatsData> {
    // Try materialized view first (separate transaction so a failure
    // doesn't abort the fallback query).
    try {
      const mvResult = await this.db.withTransaction(ctx, async (tx) => {
        const [mvRow]: any[] = await tx`
          SELECT
            total_employees,
            active_employees,
            refreshed_at
          FROM mv_dashboard_employee_stats
          WHERE tenant_id = ${ctx.tenantId}
        `;

        if (mvRow && mvRow.refreshedAt !== null) {
          const [liveRow]: any[] = await tx`
            WITH dept AS (
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
              dept.departments,
              pos.open_positions,
              wf.pending_workflows,
              wf.pending_approvals
            FROM dept, pos, wf
          `;

          return {
            totalEmployees: mvRow.totalEmployees ?? 0,
            activeEmployees: mvRow.activeEmployees ?? 0,
            departments: liveRow?.departments ?? 0,
            openPositions: liveRow?.openPositions ?? 0,
            pendingWorkflows: liveRow?.pendingWorkflows ?? 0,
            pendingApprovals: liveRow?.pendingApprovals ?? 0,
          };
        }
        return null;
      });

      if (mvResult) return mvResult;
    } catch (err) {
      // MV might not exist yet (migration not run). Fall back gracefully.
      logger.warn(
        { err, tenantId: ctx.tenantId },
        "dashboard MV query failed, falling back to live query",
      );
    }

    // Fallback: live query (separate transaction)
    return await this.db.withTransaction(ctx, async (tx) => {
      return await this.getLiveAdminStats(tx);
    });
  }

  /**
   * Fetch extended dashboard statistics from all four materialized views.
   *
   * Returns detailed breakdowns for employees, leave, cases, and onboarding.
   * Falls back to basic admin stats (with zero values for extended fields)
   * if MVs are not populated.
   */
  async getExtendedStats(ctx: TenantContext): Promise<DashboardExtendedStats> {
    // Try materialized views first (separate transaction so a failure
    // doesn't abort the fallback query).
    try {
      const mvResult = await this.db.withTransaction(ctx, async (tx) => {
        const [row]: any[] = await tx`
          WITH emp_mv AS (
            SELECT * FROM mv_dashboard_employee_stats WHERE tenant_id = ${ctx.tenantId}
          ),
          leave_mv AS (
            SELECT * FROM mv_dashboard_leave_stats WHERE tenant_id = ${ctx.tenantId}
          ),
          case_mv AS (
            SELECT * FROM mv_dashboard_case_stats WHERE tenant_id = ${ctx.tenantId}
          ),
          onb_mv AS (
            SELECT * FROM mv_dashboard_onboarding_stats WHERE tenant_id = ${ctx.tenantId}
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
            COALESCE(emp_mv.total_employees, 0)::int       AS total_employees,
            COALESCE(emp_mv.active_employees, 0)::int       AS active_employees,
            COALESCE(emp_mv.pending_employees, 0)::int      AS pending_employees,
            COALESCE(emp_mv.terminated_employees, 0)::int   AS terminated_employees,
            COALESCE(emp_mv.on_leave_employees, 0)::int     AS on_leave_employees,
            COALESCE(emp_mv.new_hires_30d, 0)::int          AS new_hires_30d,
            emp_mv.refreshed_at                             AS emp_refreshed_at,
            COALESCE(leave_mv.pending_requests, 0)::int     AS pending_leave_requests,
            COALESCE(leave_mv.approved_upcoming, 0)::int    AS approved_upcoming_leave,
            COALESCE(leave_mv.currently_on_leave, 0)::int   AS currently_on_leave,
            COALESCE(case_mv.open_cases, 0)::int            AS open_cases,
            COALESCE(case_mv.pending_cases, 0)::int         AS pending_cases,
            COALESCE(case_mv.sla_breached_cases, 0)::int    AS sla_breached_cases,
            COALESCE(onb_mv.in_progress, 0)::int            AS active_onboardings,
            COALESCE(onb_mv.avg_progress_pct, 0)::int       AS avg_onboarding_progress,
            dept.departments,
            pos.open_positions,
            wf.pending_workflows,
            wf.pending_approvals
          FROM dept, pos, wf
          LEFT JOIN emp_mv ON true
          LEFT JOIN leave_mv ON true
          LEFT JOIN case_mv ON true
          LEFT JOIN onb_mv ON true
        `;

        if (row && row.empRefreshedAt !== null) {
          return {
            totalEmployees: row.totalEmployees ?? 0,
            activeEmployees: row.activeEmployees ?? 0,
            pendingEmployees: row.pendingEmployees ?? 0,
            terminatedEmployees: row.terminatedEmployees ?? 0,
            onLeaveEmployees: row.onLeaveEmployees ?? 0,
            newHires30d: row.newHires30d ?? 0,
            departments: row.departments ?? 0,
            openPositions: row.openPositions ?? 0,
            pendingWorkflows: row.pendingWorkflows ?? 0,
            pendingApprovals: row.pendingApprovals ?? 0,
            pendingLeaveRequests: row.pendingLeaveRequests ?? 0,
            approvedUpcomingLeave: row.approvedUpcomingLeave ?? 0,
            currentlyOnLeave: row.currentlyOnLeave ?? 0,
            openCases: row.openCases ?? 0,
            pendingCases: row.pendingCases ?? 0,
            slaBreachedCases: row.slaBreachedCases ?? 0,
            activeOnboardings: row.activeOnboardings ?? 0,
            avgOnboardingProgress: row.avgOnboardingProgress ?? 0,
            refreshedAt: row.empRefreshedAt,
          };
        }
        return null;
      });

      if (mvResult) return mvResult;
    } catch (err) {
      logger.warn(
        { err, tenantId: ctx.tenantId },
        "dashboard extended MV query failed, falling back to live query",
      );
    }

    // Fallback: use live admin stats with zero-filled extended fields
    const liveStats = await this.db.withTransaction(ctx, async (tx) => {
      return await this.getLiveAdminStats(tx);
    });
    return {
      ...liveStats,
      pendingEmployees: 0,
      terminatedEmployees: 0,
      onLeaveEmployees: 0,
      newHires30d: 0,
      pendingLeaveRequests: 0,
      approvedUpcomingLeave: 0,
      currentlyOnLeave: 0,
      openCases: 0,
      pendingCases: 0,
      slaBreachedCases: 0,
      activeOnboardings: 0,
      avgOnboardingProgress: 0,
      refreshedAt: null,
    };
  }

  /**
   * Fetch recent activity from the audit log for the tenant.
   * Returns the most recent entries, limited by the specified count.
   */
  async getRecentActivity(
    ctx: TenantContext,
    limit: number = 10,
  ): Promise<RecentActivityRow[]> {
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

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Original live query for admin stats (fallback when MVs are unavailable).
   * Uses a single CTE query to gather all counts in one round-trip.
   */
  private async getLiveAdminStats(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ): Promise<AdminStatsData> {
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
  }
}
