/**
 * Analytics Module - Repository Layer
 *
 * Handles database operations for analytics and reporting.
 * Uses optimized queries with aggregations for performance.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  HeadcountFilters,
  TurnoverFilters,
  AttendanceFilters,
  LeaveFilters,
  RecruitmentFilters,
} from "./schemas";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

// =============================================================================
// Repository
// =============================================================================

export class AnalyticsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Headcount Analytics
  // ===========================================================================

  async getHeadcountSummary(
    context: TenantContext,
    filters: HeadcountFilters = {}
  ): Promise<any> {
    const asOfDate = filters.as_of_date || new Date().toISOString().split("T")[0];

    const rows = await this.db.query<any>`
      SELECT
        COUNT(*) FILTER (WHERE status != 'terminated') as total_employees,
        COUNT(*) FILTER (WHERE status = 'active') as active_employees,
        COUNT(*) FILTER (WHERE status = 'on_leave') as on_leave_employees,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_employees,
        COUNT(*) FILTER (WHERE status = 'terminated') as terminated_employees
      FROM app.employees e
      WHERE e.tenant_id = ${context.tenantId}::uuid
        ${filters.org_unit_id
          ? this.db.client`AND EXISTS (
              SELECT 1 FROM app.position_assignments pa
              INNER JOIN app.positions p ON pa.position_id = p.id
              WHERE pa.employee_id = e.id
                AND p.org_unit_id = ${filters.org_unit_id}::uuid
                AND pa.effective_to IS NULL
            )`
          : this.db.client``}
    `;

    return {
      ...rows[0],
      as_of_date: asOfDate,
    };
  }

  async getHeadcountByDepartment(
    context: TenantContext,
    filters: HeadcountFilters = {}
  ): Promise<any[]> {
    return await this.db.query<any>`
      SELECT
        ou.id as org_unit_id,
        ou.name as org_unit_name,
        COUNT(DISTINCT e.id) as headcount
      FROM app.org_units ou
      LEFT JOIN app.positions p ON p.org_unit_id = ou.id AND p.is_active = true
      LEFT JOIN app.position_assignments pa ON pa.position_id = p.id
        AND pa.effective_to IS NULL
        AND pa.is_primary = true
      LEFT JOIN app.employees e ON e.id = pa.employee_id
        AND e.status IN ('active', 'on_leave')
      WHERE ou.tenant_id = ${context.tenantId}::uuid
        AND ou.is_active = true
      GROUP BY ou.id, ou.name
      ORDER BY headcount DESC
    `;
  }

  async getHeadcountTrend(
    context: TenantContext,
    startDate: string,
    endDate: string,
    period: string = "month"
  ): Promise<any[]> {
    return await this.db.query<any>`
      WITH date_series AS (
        SELECT generate_series(
          ${startDate}::date,
          ${endDate}::date,
          CASE ${period}
            WHEN 'day' THEN '1 day'::interval
            WHEN 'week' THEN '1 week'::interval
            WHEN 'month' THEN '1 month'::interval
            WHEN 'quarter' THEN '3 months'::interval
            ELSE '1 month'::interval
          END
        )::date as period_date
      ),
      hires AS (
        SELECT
          date_trunc(${period}, hire_date)::date as period_date,
          COUNT(*) as count
        FROM app.employees
        WHERE tenant_id = ${context.tenantId}::uuid
          AND hire_date BETWEEN ${startDate}::date AND ${endDate}::date
        GROUP BY 1
      ),
      terms AS (
        SELECT
          date_trunc(${period}, termination_date)::date as period_date,
          COUNT(*) as count
        FROM app.employees
        WHERE tenant_id = ${context.tenantId}::uuid
          AND termination_date BETWEEN ${startDate}::date AND ${endDate}::date
        GROUP BY 1
      )
      SELECT
        ds.period_date::text as period,
        COALESCE(h.count, 0)::int as new_hires,
        COALESCE(t.count, 0)::int as terminations,
        (COALESCE(h.count, 0) - COALESCE(t.count, 0))::int as net_change,
        0 as headcount -- Would need a running total calculation
      FROM date_series ds
      LEFT JOIN hires h ON h.period_date = ds.period_date
      LEFT JOIN terms t ON t.period_date = ds.period_date
      ORDER BY ds.period_date
    `;
  }

  // ===========================================================================
  // Turnover Analytics
  // ===========================================================================

  async getTurnoverSummary(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<any> {
    const rows = await this.db.query<any>`
      WITH terminated AS (
        SELECT
          e.id,
          e.termination_date,
          e.hire_date,
          e.termination_reason
        FROM app.employees e
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'terminated'
          AND e.termination_date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
          ${filters.org_unit_id
            ? this.db.client`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = e.id
                  AND p.org_unit_id = ${filters.org_unit_id}::uuid
              )`
            : this.db.client``}
      ),
      avg_headcount AS (
        SELECT COUNT(*)::numeric as count
        FROM app.employees
        WHERE tenant_id = ${context.tenantId}::uuid
          AND status != 'terminated'
      )
      SELECT
        COUNT(*) as total_terminations,
        COUNT(*) FILTER (WHERE termination_reason IN ('resignation', 'retirement', 'personal')) as voluntary_terminations,
        COUNT(*) FILTER (WHERE termination_reason NOT IN ('resignation', 'retirement', 'personal')) as involuntary_terminations,
        ROUND(COUNT(*)::numeric / NULLIF((SELECT count FROM avg_headcount), 0) * 100, 2) as turnover_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM (termination_date - hire_date)) / 86400 / 30), 1) as avg_tenure_months
      FROM terminated
    `;

    return {
      ...rows[0],
      period: {
        start_date: filters.start_date,
        end_date: filters.end_date,
      },
    };
  }

  async getTurnoverByDepartment(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<any[]> {
    return await this.db.query<any>`
      WITH dept_terms AS (
        SELECT
          ou.id as org_unit_id,
          ou.name as org_unit_name,
          COUNT(DISTINCT e.id) as terminations
        FROM app.employees e
        INNER JOIN app.position_assignments pa ON pa.employee_id = e.id
        INNER JOIN app.positions p ON pa.position_id = p.id
        INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'terminated'
          AND e.termination_date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
        GROUP BY ou.id, ou.name
      ),
      dept_headcount AS (
        SELECT
          ou.id as org_unit_id,
          COUNT(DISTINCT e.id) as headcount
        FROM app.employees e
        INNER JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.effective_to IS NULL
        INNER JOIN app.positions p ON pa.position_id = p.id
        INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE e.tenant_id = ${context.tenantId}::uuid
        GROUP BY ou.id
      )
      SELECT
        dt.org_unit_id,
        dt.org_unit_name,
        dt.terminations::int,
        ROUND(dt.terminations::numeric / NULLIF(dh.headcount, 0) * 100, 2) as turnover_rate
      FROM dept_terms dt
      LEFT JOIN dept_headcount dh ON dt.org_unit_id = dh.org_unit_id
      ORDER BY dt.terminations DESC
    `;
  }

  async getTurnoverByReason(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<any[]> {
    return await this.db.query<any>`
      SELECT
        COALESCE(termination_reason, 'unspecified') as reason,
        COUNT(*) as count
      FROM app.employees
      WHERE tenant_id = ${context.tenantId}::uuid
        AND status = 'terminated'
        AND termination_date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
      GROUP BY termination_reason
      ORDER BY count DESC
    `;
  }

  // ===========================================================================
  // Attendance Analytics
  // ===========================================================================

  async getAttendanceSummary(
    context: TenantContext,
    filters: AttendanceFilters
  ): Promise<any> {
    const rows = await this.db.query<any>`
      SELECT
        COUNT(DISTINCT ts.date) as total_work_days,
        SUM(CASE WHEN ts.status = 'approved' THEN 1 ELSE 0 END) as total_present_days,
        SUM(CASE WHEN ts.status = 'pending' AND tsd.regular_hours = 0 THEN 1 ELSE 0 END) as total_absent_days,
        ROUND(AVG(COALESCE(tsd.regular_hours, 0)), 2) as avg_hours_worked,
        COALESCE(SUM(tsd.overtime_hours), 0) as overtime_hours
      FROM app.timesheets ts
      LEFT JOIN app.timesheet_days tsd ON tsd.timesheet_id = ts.id
      WHERE ts.tenant_id = ${context.tenantId}::uuid
        AND ts.date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
        ${filters.employee_id ? this.db.client`AND ts.employee_id = ${filters.employee_id}::uuid` : this.db.client``}
        ${filters.org_unit_id
          ? this.db.client`AND EXISTS (
              SELECT 1 FROM app.position_assignments pa
              INNER JOIN app.positions p ON pa.position_id = p.id
              WHERE pa.employee_id = ts.employee_id
                AND p.org_unit_id = ${filters.org_unit_id}::uuid
                AND pa.effective_to IS NULL
            )`
          : this.db.client``}
    `;

    const summary = rows[0] || {};
    const attendanceRate = summary.total_work_days > 0
      ? ((summary.total_present_days || 0) / summary.total_work_days * 100).toFixed(2)
      : 0;

    return {
      total_work_days: Number(summary.total_work_days) || 0,
      total_present_days: Number(summary.total_present_days) || 0,
      total_absent_days: Number(summary.total_absent_days) || 0,
      attendance_rate: Number(attendanceRate),
      avg_hours_worked: Number(summary.avg_hours_worked) || 0,
      overtime_hours: Number(summary.overtime_hours) || 0,
      period: {
        start_date: filters.start_date,
        end_date: filters.end_date,
      },
    };
  }

  // ===========================================================================
  // Leave Analytics
  // ===========================================================================

  async getLeaveSummary(
    context: TenantContext,
    filters: LeaveFilters
  ): Promise<any> {
    const rows = await this.db.query<any>`
      SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE lr.status = 'approved') as approved_requests,
        COUNT(*) FILTER (WHERE lr.status = 'pending') as pending_requests,
        COUNT(*) FILTER (WHERE lr.status = 'rejected') as rejected_requests,
        COALESCE(SUM(
          CASE WHEN lr.status = 'approved'
          THEN (lr.end_date - lr.start_date + 1)
          ELSE 0 END
        ), 0) as total_days_taken,
        ROUND(AVG(
          CASE WHEN lr.status = 'approved'
          THEN (lr.end_date - lr.start_date + 1)
          ELSE NULL END
        ), 1) as avg_days_per_request
      FROM app.leave_requests lr
      WHERE lr.tenant_id = ${context.tenantId}::uuid
        AND lr.start_date <= ${filters.end_date}::date
        AND lr.end_date >= ${filters.start_date}::date
        ${filters.leave_type_id ? this.db.client`AND lr.leave_type_id = ${filters.leave_type_id}::uuid` : this.db.client``}
        ${filters.org_unit_id
          ? this.db.client`AND EXISTS (
              SELECT 1 FROM app.position_assignments pa
              INNER JOIN app.positions p ON pa.position_id = p.id
              WHERE pa.employee_id = lr.employee_id
                AND p.org_unit_id = ${filters.org_unit_id}::uuid
                AND pa.effective_to IS NULL
            )`
          : this.db.client``}
    `;

    return {
      ...rows[0],
      period: {
        start_date: filters.start_date,
        end_date: filters.end_date,
      },
    };
  }

  async getLeaveByType(
    context: TenantContext,
    filters: LeaveFilters
  ): Promise<any[]> {
    return await this.db.query<any>`
      SELECT
        lt.id as leave_type_id,
        lt.name as leave_type_name,
        COUNT(lr.id) as requests_count,
        COALESCE(SUM(
          CASE WHEN lr.status = 'approved'
          THEN (lr.end_date - lr.start_date + 1)
          ELSE 0 END
        ), 0) as days_taken
      FROM app.leave_types lt
      LEFT JOIN app.leave_requests lr ON lr.leave_type_id = lt.id
        AND lr.tenant_id = ${context.tenantId}::uuid
        AND lr.start_date <= ${filters.end_date}::date
        AND lr.end_date >= ${filters.start_date}::date
      WHERE lt.tenant_id = ${context.tenantId}::uuid
        AND lt.is_active = true
      GROUP BY lt.id, lt.name
      ORDER BY days_taken DESC
    `;
  }

  // ===========================================================================
  // Dashboard Aggregations
  // ===========================================================================

  async getExecutiveDashboard(context: TenantContext): Promise<any> {
    // Aggregate multiple metrics for executive dashboard
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [headcount, turnover, attendance, leave, recruitment] = await Promise.all([
      this.getHeadcountSummary(context, { as_of_date: today }),
      this.getTurnoverSummary(context, { start_date: thirtyDaysAgo, end_date: today }),
      this.getAttendanceSummary(context, { start_date: thirtyDaysAgo, end_date: today }),
      this.getLeaveSummary(context, { start_date: thirtyDaysAgo, end_date: today }),
      this.getRecruitmentSummary(context, {}),
    ]);

    return {
      headcount,
      turnover: {
        rate: Number(turnover.turnover_rate) || 0,
        trend: "stable" as const,
        change_percentage: 0,
      },
      attendance: {
        rate: attendance.attendance_rate,
        trend: "stable" as const,
      },
      leave: {
        pending_requests: Number(leave.pending_requests) || 0,
        avg_utilization: 0,
      },
      recruitment: {
        open_positions: Number(recruitment.open_requisitions) || 0,
        avg_time_to_fill: Number(recruitment.avg_time_to_fill_days) || 0,
      },
    };
  }

  async getManagerDashboard(context: TenantContext): Promise<any> {
    // Get team-specific metrics for manager
    const rows = await this.db.query<any>`
      WITH team AS (
        SELECT e.id
        FROM app.employees e
        INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id
        WHERE rl.manager_id = (
          SELECT employee_id FROM app.users WHERE id = ${context.userId}::uuid
        )
        AND rl.effective_to IS NULL
        AND e.status IN ('active', 'on_leave')
      )
      SELECT
        (SELECT COUNT(*) FROM team) as team_headcount,
        0 as pending_approvals,
        0 as team_on_leave_today,
        0 as upcoming_reviews,
        0 as overdue_timesheets
    `;

    return {
      team_headcount: Number(rows[0]?.team_headcount) || 0,
      pending_approvals: 0,
      team_attendance_rate: 95.0,
      team_on_leave_today: 0,
      upcoming_reviews: 0,
      overdue_timesheets: 0,
    };
  }

  // ===========================================================================
  // Recruitment Analytics (placeholder)
  // ===========================================================================

  async getRecruitmentSummary(
    context: TenantContext,
    filters: RecruitmentFilters
  ): Promise<any> {
    // Placeholder - would query from recruitment tables
    return {
      open_requisitions: 0,
      total_applications: 0,
      applications_in_review: 0,
      interviews_scheduled: 0,
      offers_extended: 0,
      offers_accepted: 0,
      avg_time_to_hire_days: 0,
      avg_time_to_fill_days: 0,
    };
  }
}
