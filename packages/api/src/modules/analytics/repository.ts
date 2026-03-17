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
  DiversityFilters,
  CompensationFilters,
  WorkforcePlanningFilters,
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

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COUNT(*) FILTER (WHERE status != 'terminated') as total_employees,
          COUNT(*) FILTER (WHERE status = 'active') as active_employees,
          COUNT(*) FILTER (WHERE status = 'on_leave') as on_leave_employees,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_employees,
          COUNT(*) FILTER (WHERE status = 'terminated') as terminated_employees
        FROM app.employees e
        WHERE true
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = e.id
                  AND p.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
              )`
            : tx``}
      `;
    });

    return {
      ...rows[0],
      as_of_date: asOfDate,
    };
  }

  async getHeadcountByDepartment(
    context: TenantContext,
    filters: HeadcountFilters = {}
  ): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
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
        WHERE ou.is_active = true
        GROUP BY ou.id, ou.name
        ORDER BY headcount DESC
      `;
    });
  }

  async getHeadcountTrend(
    context: TenantContext,
    startDate: string,
    endDate: string,
    period: string = "month"
  ): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
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
          WHERE hire_date BETWEEN ${startDate}::date AND ${endDate}::date
          GROUP BY 1
        ),
        terms AS (
          SELECT
            date_trunc(${period}, termination_date)::date as period_date,
            COUNT(*) as count
          FROM app.employees
          WHERE termination_date BETWEEN ${startDate}::date AND ${endDate}::date
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
    });
  }

  // ===========================================================================
  // Turnover Analytics
  // ===========================================================================

  async getTurnoverSummary(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<any> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH terminated AS (
          SELECT
            e.id,
            e.termination_date,
            e.hire_date,
            e.termination_reason
          FROM app.employees e
          WHERE e.status = 'terminated'
            AND e.termination_date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
            ${filters.org_unit_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.position_assignments pa
                  INNER JOIN app.positions p ON pa.position_id = p.id
                  WHERE pa.employee_id = e.id
                    AND p.org_unit_id = ${filters.org_unit_id}::uuid
                )`
              : tx``}
        ),
        avg_headcount AS (
          SELECT COUNT(*)::numeric as count
          FROM app.employees
          WHERE status != 'terminated'
        )
        SELECT
          COUNT(*) as total_terminations,
          COUNT(*) FILTER (WHERE termination_reason IN ('resignation', 'retirement', 'personal')) as voluntary_terminations,
          COUNT(*) FILTER (WHERE termination_reason NOT IN ('resignation', 'retirement', 'personal')) as involuntary_terminations,
          ROUND(COUNT(*)::numeric / NULLIF((SELECT count FROM avg_headcount), 0) * 100, 2) as turnover_rate,
          ROUND(AVG(EXTRACT(EPOCH FROM (termination_date - hire_date)) / 86400 / 30), 1) as avg_tenure_months
        FROM terminated
      `;
    });

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
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH dept_terms AS (
          SELECT
            ou.id as org_unit_id,
            ou.name as org_unit_name,
            COUNT(DISTINCT e.id) as terminations
          FROM app.employees e
          INNER JOIN app.position_assignments pa ON pa.employee_id = e.id
          INNER JOIN app.positions p ON pa.position_id = p.id
          INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
          WHERE e.status = 'terminated'
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
    });
  }

  async getTurnoverByReason(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(termination_reason, 'unspecified') as reason,
          COUNT(*) as count
        FROM app.employees
        WHERE status = 'terminated'
          AND termination_date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
        GROUP BY termination_reason
        ORDER BY count DESC
      `;
    });
  }

  // ===========================================================================
  // Attendance Analytics
  // ===========================================================================

  async getAttendanceSummary(
    context: TenantContext,
    filters: AttendanceFilters
  ): Promise<any> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COUNT(DISTINCT tl.work_date) as total_work_days,
          SUM(CASE WHEN ts.status = 'approved' THEN 1 ELSE 0 END) as total_present_days,
          SUM(CASE WHEN ts.status = 'submitted' AND tl.regular_hours = 0 THEN 1 ELSE 0 END) as total_absent_days,
          ROUND(AVG(COALESCE(tl.regular_hours, 0)), 2) as avg_hours_worked,
          COALESCE(SUM(tl.overtime_hours), 0) as overtime_hours
        FROM app.timesheets ts
        LEFT JOIN app.timesheet_lines tl ON tl.timesheet_id = ts.id
        WHERE tl.work_date BETWEEN ${filters.start_date}::date AND ${filters.end_date}::date
          ${filters.employee_id ? tx`AND ts.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = ts.employee_id
                  AND p.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
              )`
            : tx``}
      `;
    });

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
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
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
        WHERE lr.start_date <= ${filters.end_date}::date
          AND lr.end_date >= ${filters.start_date}::date
          ${filters.leave_type_id ? tx`AND lr.leave_type_id = ${filters.leave_type_id}::uuid` : tx``}
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = lr.employee_id
                  AND p.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
              )`
            : tx``}
      `;
    });

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
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
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
          AND lr.start_date <= ${filters.end_date}::date
          AND lr.end_date >= ${filters.start_date}::date
        WHERE lt.is_active = true
        GROUP BY lt.id, lt.name
        ORDER BY days_taken DESC
      `;
    });
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
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
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
    });

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
  // Recruitment Analytics
  // ===========================================================================

  async getRecruitmentSummary(
    context: TenantContext,
    filters: RecruitmentFilters
  ): Promise<any> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH req_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE r.status = 'open') AS open_requisitions,
            COUNT(*) FILTER (WHERE r.status = 'filled') AS filled_requisitions
          FROM app.requisitions r
          WHERE r.tenant_id = ${context.tenantId}::uuid
            ${filters.org_unit_id
              ? tx`AND r.org_unit_id = ${filters.org_unit_id}::uuid`
              : tx``}
            ${filters.start_date
              ? tx`AND r.created_at >= ${filters.start_date}::date`
              : tx``}
            ${filters.end_date
              ? tx`AND r.created_at <= ${filters.end_date}::date`
              : tx``}
        ),
        cand_stats AS (
          SELECT
            COUNT(*) AS total_applications,
            COUNT(*) FILTER (WHERE c.current_stage IN ('screening', 'phone_screen')) AS applications_in_review,
            COUNT(*) FILTER (WHERE c.current_stage = 'interview') AS interviews_scheduled,
            COUNT(*) FILTER (WHERE c.current_stage = 'offer') AS offers_extended,
            COUNT(*) FILTER (WHERE c.current_stage = 'hired') AS offers_accepted,
            ROUND(AVG(
              CASE WHEN c.current_stage = 'hired'
                THEN EXTRACT(DAY FROM c.updated_at - c.created_at)
              END
            ), 1) AS avg_time_to_hire_days
          FROM app.candidates c
          JOIN app.requisitions r ON r.id = c.requisition_id
          WHERE c.tenant_id = ${context.tenantId}::uuid
            ${filters.org_unit_id
              ? tx`AND r.org_unit_id = ${filters.org_unit_id}::uuid`
              : tx``}
            ${filters.start_date
              ? tx`AND c.created_at >= ${filters.start_date}::date`
              : tx``}
            ${filters.end_date
              ? tx`AND c.created_at <= ${filters.end_date}::date`
              : tx``}
        ),
        fill_time AS (
          SELECT
            ROUND(AVG(
              EXTRACT(DAY FROM r.updated_at - r.created_at)
            ), 1) AS avg_time_to_fill_days
          FROM app.requisitions r
          WHERE r.tenant_id = ${context.tenantId}::uuid
            AND r.status = 'filled'
            ${filters.org_unit_id
              ? tx`AND r.org_unit_id = ${filters.org_unit_id}::uuid`
              : tx``}
            ${filters.start_date
              ? tx`AND r.created_at >= ${filters.start_date}::date`
              : tx``}
            ${filters.end_date
              ? tx`AND r.created_at <= ${filters.end_date}::date`
              : tx``}
        )
        SELECT
          rs.open_requisitions,
          cs.total_applications,
          cs.applications_in_review,
          cs.interviews_scheduled,
          cs.offers_extended,
          cs.offers_accepted,
          cs.avg_time_to_hire_days,
          ft.avg_time_to_fill_days
        FROM req_stats rs, cand_stats cs, fill_time ft
      `;
    });

    const r = rows[0] || {};
    return {
      open_requisitions: Number(r.open_requisitions ?? r.openRequisitions) || 0,
      total_applications: Number(r.total_applications ?? r.totalApplications) || 0,
      applications_in_review: Number(r.applications_in_review ?? r.applicationsInReview) || 0,
      interviews_scheduled: Number(r.interviews_scheduled ?? r.interviewsScheduled) || 0,
      offers_extended: Number(r.offers_extended ?? r.offersExtended) || 0,
      offers_accepted: Number(r.offers_accepted ?? r.offersAccepted) || 0,
      avg_time_to_hire_days: Number(r.avg_time_to_hire_days ?? r.avgTimeToHireDays) || 0,
      avg_time_to_fill_days: Number(r.avg_time_to_fill_days ?? r.avgTimeToFillDays) || 0,
    };
  }

  // ===========================================================================
  // Diversity Analytics
  // ===========================================================================

  async getDiversityByGender(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(ep.gender::text, 'not_specified') AS gender,
          COUNT(*)::int AS count
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_to IS NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY ep.gender
        ORDER BY count DESC
      `;
    });
  }

  async getDiversityByAgeBand(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          CASE
            WHEN ep.date_of_birth IS NULL THEN 'Unknown'
            WHEN EXTRACT(YEAR FROM age(ep.date_of_birth)) < 25 THEN 'Under 25'
            WHEN EXTRACT(YEAR FROM age(ep.date_of_birth)) < 35 THEN '25-34'
            WHEN EXTRACT(YEAR FROM age(ep.date_of_birth)) < 45 THEN '35-44'
            WHEN EXTRACT(YEAR FROM age(ep.date_of_birth)) < 55 THEN '45-54'
            WHEN EXTRACT(YEAR FROM age(ep.date_of_birth)) < 65 THEN '55-64'
            ELSE '65+'
          END AS age_band,
          COUNT(*)::int AS count
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_to IS NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY age_band
        ORDER BY
          CASE age_band
            WHEN 'Under 25' THEN 1
            WHEN '25-34' THEN 2
            WHEN '35-44' THEN 3
            WHEN '45-54' THEN 4
            WHEN '55-64' THEN 5
            WHEN '65+' THEN 6
            ELSE 7
          END
      `;
    });
  }

  async getDiversityByNationality(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(ep.nationality, 'Unknown') AS nationality,
          COUNT(*)::int AS count
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_to IS NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY ep.nationality
        ORDER BY count DESC
        LIMIT 20
      `;
    });
  }

  async getDiversityByDepartment(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          o.id AS org_unit_id,
          o.name AS org_unit_name,
          COALESCE(ep.gender::text, 'not_specified') AS gender,
          COUNT(*)::int AS count
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
        LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          ${filters.org_unit_id
            ? tx`AND o.id = ${filters.org_unit_id}::uuid`
            : tx``}
        GROUP BY o.id, o.name, ep.gender
        ORDER BY o.name, count DESC
      `;
    });
  }

  // ===========================================================================
  // Diversity Analytics - Protected Characteristics (from diversity_data)
  // ===========================================================================

  async getDiversityByEthnicity(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(dd.ethnicity, 'Not provided') AS ethnicity,
          COUNT(*)::int AS count
        FROM app.employees e
        INNER JOIN app.diversity_data dd
          ON dd.employee_id = e.id
          AND dd.tenant_id = e.tenant_id
          AND dd.consent_given = true
          AND dd.ethnicity IS NOT NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY dd.ethnicity
        ORDER BY count DESC
      `;
    });
  }

  async getDiversityByDisability(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(dd.disability_status, 'Not provided') AS disability_status,
          COUNT(*)::int AS count
        FROM app.employees e
        INNER JOIN app.diversity_data dd
          ON dd.employee_id = e.id
          AND dd.tenant_id = e.tenant_id
          AND dd.consent_given = true
          AND dd.disability_status IS NOT NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY dd.disability_status
        ORDER BY count DESC
      `;
    });
  }

  // ===========================================================================
  // Diversity Analytics - Hiring/Leaving Trends by Gender
  // ===========================================================================

  async getDiversityHiringTrends(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          to_char(date_trunc('month', e.hire_date), 'YYYY-MM') AS period,
          'gender' AS characteristic,
          COALESCE(ep.gender::text, 'not_specified') AS value,
          COUNT(*)::int AS hires
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_to IS NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.hire_date >= (CURRENT_DATE - INTERVAL '12 months')
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY period, characteristic, value
        ORDER BY period, value
      `;
    });
  }

  async getDiversityLeavingTrends(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          to_char(date_trunc('month', e.termination_date), 'YYYY-MM') AS period,
          'gender' AS characteristic,
          COALESCE(ep.gender::text, 'not_specified') AS value,
          COUNT(*)::int AS leavers
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_to IS NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'terminated'
          AND e.termination_date >= (CURRENT_DATE - INTERVAL '12 months')
          AND e.termination_date IS NOT NULL
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
              )`
            : tx``}
        GROUP BY period, characteristic, value
        ORDER BY period, value
      `;
    });
  }

  // ===========================================================================
  // Diversity Analytics - Completion Rate
  // ===========================================================================

  async getDiversityCompletionRate(
    context: TenantContext
  ): Promise<{ totalEmployees: number; totalSubmissions: number; completionRate: number }> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          (SELECT COUNT(*)::int FROM app.employees
           WHERE tenant_id = ${context.tenantId}::uuid
             AND status IN ('active', 'on_leave')
          ) AS total_employees,
          (SELECT COUNT(*)::int FROM app.diversity_data
           WHERE tenant_id = ${context.tenantId}::uuid
             AND consent_given = true
          ) AS total_submissions
      `;
    });

    const r = rows[0] || {};
    const totalEmployees = Number(r.totalEmployees ?? r.total_employees) || 0;
    const totalSubmissions = Number(r.totalSubmissions ?? r.total_submissions) || 0;
    const completionRate = totalEmployees > 0
      ? Math.round((totalSubmissions / totalEmployees) * 10000) / 100
      : 0;

    return { totalEmployees, totalSubmissions, completionRate };
  }

  // ===========================================================================
  // Gender Pay Gap Summary (for diversity dashboard)
  // ===========================================================================

  async getGenderPayGapSummary(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<any> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COUNT(*) FILTER (WHERE ep.gender = 'male')::int AS male_count,
          COUNT(*) FILTER (WHERE ep.gender = 'female')::int AS female_count,
          ROUND(AVG(CASE WHEN ep.gender = 'male' THEN ch.base_salary END), 2) AS male_avg,
          ROUND(AVG(CASE WHEN ep.gender = 'female' THEN ch.base_salary END), 2) AS female_avg,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN ep.gender = 'male' THEN ch.base_salary END), 2) AS male_median,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN ep.gender = 'female' THEN ch.base_salary END), 2) AS female_median
        FROM app.employees e
        INNER JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_to IS NULL
        INNER JOIN app.compensation_history ch
          ON ch.employee_id = e.id
          AND ch.tenant_id = e.tenant_id
          AND ch.effective_to IS NULL
        WHERE e.tenant_id = ${context.tenantId}::uuid
          AND e.status = 'active'
          AND ep.gender IN ('male', 'female')
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
      `;
    });

    const r = rows[0] || {};
    const maleAvg = Number(r.maleAvg ?? r.male_avg) || 0;
    const femaleAvg = Number(r.femaleAvg ?? r.female_avg) || 0;
    const maleMedian = Number(r.maleMedian ?? r.male_median) || 0;
    const femaleMedian = Number(r.femaleMedian ?? r.female_median) || 0;
    const maleCount = Number(r.maleCount ?? r.male_count) || 0;
    const femaleCount = Number(r.femaleCount ?? r.female_count) || 0;

    const meanGap = maleAvg > 0 ? Math.round(((maleAvg - femaleAvg) / maleAvg) * 10000) / 100 : null;
    const medianGap = maleMedian > 0 ? Math.round(((maleMedian - femaleMedian) / maleMedian) * 10000) / 100 : null;

    return {
      mean_gap_percentage: meanGap,
      median_gap_percentage: medianGap,
      male_count: maleCount,
      female_count: femaleCount,
    };
  }

  // ===========================================================================
  // Compensation Analytics
  // ===========================================================================

  async getCompensationSummary(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any> {
    const currency = filters.currency || "GBP";

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COUNT(*)::int AS total_employees,
          ROUND(AVG(ch.base_salary), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ch.base_salary), 2) AS median_salary,
          ROUND(MIN(ch.base_salary), 2) AS min_salary,
          ROUND(MAX(ch.base_salary), 2) AS max_salary,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ch.base_salary), 2) AS p25_salary,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ch.base_salary), 2) AS p75_salary,
          ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY ch.base_salary), 2) AS p90_salary,
          ROUND(SUM(ch.base_salary), 2) AS total_payroll
        FROM app.compensation_history ch
        INNER JOIN app.employees e
          ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        WHERE ch.tenant_id = ${context.tenantId}::uuid
          AND ch.effective_to IS NULL
          AND e.status = 'active'
          AND ch.currency = ${currency}
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
          ${filters.job_grade
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa2
                INNER JOIN app.positions p2 ON p2.id = pa2.position_id
                WHERE pa2.employee_id = e.id
                  AND p2.job_grade = ${filters.job_grade}
                  AND pa2.effective_to IS NULL
                  AND pa2.is_primary = true
              )`
            : tx``}
      `;
    });

    const r = rows[0] || {};
    return {
      total_employees: Number(r.total_employees) || 0,
      avg_salary: Number(r.avg_salary) || 0,
      median_salary: Number(r.median_salary) || 0,
      min_salary: Number(r.min_salary) || 0,
      max_salary: Number(r.max_salary) || 0,
      p25_salary: Number(r.p25_salary) || 0,
      p75_salary: Number(r.p75_salary) || 0,
      p90_salary: Number(r.p90_salary) || 0,
      total_payroll: Number(r.total_payroll) || 0,
      currency,
    };
  }

  async getCompensationByBand(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any[]> {
    const currency = filters.currency || "GBP";

    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          CASE
            WHEN ch.base_salary < 25000 THEN 'Under £25k'
            WHEN ch.base_salary < 35000 THEN '£25k-£35k'
            WHEN ch.base_salary < 50000 THEN '£35k-£50k'
            WHEN ch.base_salary < 75000 THEN '£50k-£75k'
            WHEN ch.base_salary < 100000 THEN '£75k-£100k'
            ELSE '£100k+'
          END AS band,
          COUNT(*)::int AS count,
          ROUND(AVG(ch.base_salary), 2) AS avg_salary
        FROM app.compensation_history ch
        INNER JOIN app.employees e
          ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        WHERE ch.tenant_id = ${context.tenantId}::uuid
          AND ch.effective_to IS NULL
          AND e.status = 'active'
          AND ch.currency = ${currency}
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY band
        ORDER BY
          CASE band
            WHEN 'Under £25k' THEN 1
            WHEN '£25k-£35k' THEN 2
            WHEN '£35k-£50k' THEN 3
            WHEN '£50k-£75k' THEN 4
            WHEN '£75k-£100k' THEN 5
            WHEN '£100k+' THEN 6
          END
      `;
    });
  }

  async getCompensationByDepartment(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any[]> {
    const currency = filters.currency || "GBP";

    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(o.id::text, 'unassigned') AS org_unit_id,
          COALESCE(o.name, 'Unassigned') AS org_unit_name,
          COUNT(*)::int AS headcount,
          ROUND(AVG(ch.base_salary), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ch.base_salary), 2) AS median_salary,
          ROUND(MIN(ch.base_salary), 2) AS min_salary,
          ROUND(MAX(ch.base_salary), 2) AS max_salary,
          ROUND(SUM(ch.base_salary), 2) AS total_payroll
        FROM app.compensation_history ch
        INNER JOIN app.employees e
          ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        LEFT JOIN app.position_assignments pa
          ON pa.employee_id = e.id
          AND pa.tenant_id = e.tenant_id
          AND pa.is_primary = true
          AND pa.effective_to IS NULL
        LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
        WHERE ch.tenant_id = ${context.tenantId}::uuid
          AND ch.effective_to IS NULL
          AND e.status = 'active'
          AND ch.currency = ${currency}
          ${filters.org_unit_id
            ? tx`AND o.id = ${filters.org_unit_id}::uuid`
            : tx``}
        GROUP BY o.id, o.name
        ORDER BY avg_salary DESC
      `;
    });
  }

  async getRecentCompensationChanges(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          COALESCE(ch.change_reason, 'unspecified') AS change_reason,
          COUNT(*)::int AS count,
          ROUND(AVG(ch.change_percentage), 2) AS avg_change_percentage
        FROM app.compensation_history ch
        INNER JOIN app.employees e
          ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        WHERE ch.tenant_id = ${context.tenantId}::uuid
          AND ch.effective_from >= (CURRENT_DATE - INTERVAL '12 months')
          AND e.status = 'active'
          AND ch.change_reason IS NOT NULL
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
        GROUP BY ch.change_reason
        ORDER BY count DESC
      `;
    });
  }

  // ===========================================================================
  // Compa-Ratio Analytics
  // ===========================================================================

  /**
   * Compa-ratio by job grade.
   *
   * Compa-ratio = employee salary / midpoint of position pay range
   *
   * Only includes employees whose position has both min_salary and max_salary defined.
   * The midpoint is (min_salary + max_salary) / 2.
   *
   * A compa-ratio of 1.0 means the employee is paid at the midpoint.
   * Below 1.0 means below midpoint, above 1.0 means above midpoint.
   */
  async getCompaRatioByGrade(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any[]> {
    const currency = filters.currency || "GBP";

    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH employee_compa AS (
          SELECT
            p.job_grade,
            p.min_salary AS range_min,
            p.max_salary AS range_max,
            (p.min_salary + p.max_salary) / 2.0 AS range_midpoint,
            app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary,
            CASE
              WHEN (p.min_salary + p.max_salary) / 2.0 > 0
              THEN app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) / ((p.min_salary + p.max_salary) / 2.0)
              ELSE NULL
            END AS compa_ratio
          FROM app.compensation_history ch
          INNER JOIN app.employees e
            ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.position_assignments pa
            ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          INNER JOIN app.positions p
            ON p.id = pa.position_id
          WHERE ch.tenant_id = ${context.tenantId}::uuid
            AND ch.effective_to IS NULL
            AND e.status = 'active'
            AND ch.currency = ${currency}
            AND p.job_grade IS NOT NULL
            AND p.min_salary IS NOT NULL
            AND p.max_salary IS NOT NULL
            AND p.min_salary > 0
            AND p.max_salary > 0
            ${filters.org_unit_id
              ? tx`AND pa.org_unit_id = ${filters.org_unit_id}::uuid`
              : tx``}
            ${filters.job_grade
              ? tx`AND p.job_grade = ${filters.job_grade}`
              : tx``}
        )
        SELECT
          job_grade,
          COUNT(*)::int AS headcount,
          ROUND(MIN(range_min), 2) AS range_min,
          ROUND(MAX(range_max), 2) AS range_max,
          ROUND(AVG(range_midpoint), 2) AS range_midpoint,
          ROUND(AVG(annual_salary), 2) AS avg_salary,
          ROUND(AVG(compa_ratio), 4) AS avg_compa_ratio,
          COUNT(*) FILTER (WHERE annual_salary < range_min)::int AS below_range_count,
          COUNT(*) FILTER (WHERE annual_salary >= range_min AND annual_salary <= range_max)::int AS within_range_count,
          COUNT(*) FILTER (WHERE annual_salary > range_max)::int AS above_range_count
        FROM employee_compa
        WHERE compa_ratio IS NOT NULL
        GROUP BY job_grade
        ORDER BY job_grade
      `;
    });
  }

  // ===========================================================================
  // Pay Equity Analytics
  // ===========================================================================

  /**
   * Gender pay equity analysis by job level/grade.
   *
   * Compares male vs. female average and median salary within each job grade.
   * Pay gap = ((male_avg - female_avg) / male_avg) * 100
   * A positive gap means men are paid more on average.
   *
   * Only includes employees with gender data (male/female) from employee_personal.
   */
  async getPayEquityByGrade(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any[]> {
    const currency = filters.currency || "GBP";

    return this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH employee_pay AS (
          SELECT
            COALESCE(p.job_grade, 'Ungraded') AS job_grade,
            ep.gender,
            app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary
          FROM app.compensation_history ch
          INNER JOIN app.employees e
            ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa
            ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          LEFT JOIN app.positions p
            ON p.id = pa.position_id
          WHERE ch.tenant_id = ${context.tenantId}::uuid
            AND ch.effective_to IS NULL
            AND e.status = 'active'
            AND ch.currency = ${currency}
            AND ep.gender IN ('male', 'female')
            ${filters.org_unit_id
              ? tx`AND pa.org_unit_id = ${filters.org_unit_id}::uuid`
              : tx``}
            ${filters.job_grade
              ? tx`AND p.job_grade = ${filters.job_grade}`
              : tx``}
        ),
        by_grade_gender AS (
          SELECT
            job_grade,
            gender,
            COUNT(*)::int AS employee_count,
            ROUND(AVG(annual_salary), 2) AS avg_salary,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary), 2) AS median_salary
          FROM employee_pay
          GROUP BY job_grade, gender
        )
        SELECT
          g.job_grade,
          COALESCE(m.employee_count, 0)::int AS male_count,
          COALESCE(f.employee_count, 0)::int AS female_count,
          COALESCE(m.avg_salary, 0) AS male_avg_salary,
          COALESCE(f.avg_salary, 0) AS female_avg_salary,
          CASE
            WHEN COALESCE(m.avg_salary, 0) > 0 AND f.avg_salary IS NOT NULL
            THEN ROUND(((m.avg_salary - f.avg_salary) / m.avg_salary) * 100, 2)
            ELSE NULL
          END AS pay_gap_percentage,
          COALESCE(m.median_salary, 0) AS male_median_salary,
          COALESCE(f.median_salary, 0) AS female_median_salary,
          CASE
            WHEN COALESCE(m.median_salary, 0) > 0 AND f.median_salary IS NOT NULL
            THEN ROUND(((m.median_salary - f.median_salary) / m.median_salary) * 100, 2)
            ELSE NULL
          END AS median_pay_gap_percentage
        FROM (SELECT DISTINCT job_grade FROM by_grade_gender) g
        LEFT JOIN by_grade_gender m ON m.job_grade = g.job_grade AND m.gender = 'male'
        LEFT JOIN by_grade_gender f ON f.job_grade = g.job_grade AND f.gender = 'female'
        ORDER BY g.job_grade
      `;
    });
  }

  /**
   * Overall gender pay equity totals across all grades.
   *
   * Returns total male/female counts and overall average/median salaries.
   */
  async getPayEquityOverall(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<any> {
    const currency = filters.currency || "GBP";

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH employee_pay AS (
          SELECT
            ep.gender,
            app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary
          FROM app.compensation_history ch
          INNER JOIN app.employees e
            ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          ${filters.org_unit_id
            ? tx`INNER JOIN app.position_assignments pa
                ON pa.employee_id = e.id
                AND pa.tenant_id = e.tenant_id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL`
            : tx``}
          WHERE ch.tenant_id = ${context.tenantId}::uuid
            AND ch.effective_to IS NULL
            AND e.status = 'active'
            AND ch.currency = ${currency}
            AND ep.gender IN ('male', 'female')
            ${filters.org_unit_id
              ? tx`AND pa.org_unit_id = ${filters.org_unit_id}::uuid`
              : tx``}
        )
        SELECT
          COUNT(*) FILTER (WHERE gender = 'male')::int AS total_male,
          COUNT(*) FILTER (WHERE gender = 'female')::int AS total_female,
          ROUND(AVG(annual_salary) FILTER (WHERE gender = 'male'), 2) AS overall_male_avg_salary,
          ROUND(AVG(annual_salary) FILTER (WHERE gender = 'female'), 2) AS overall_female_avg_salary,
          ROUND(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary)
            FILTER (WHERE gender = 'male'), 2
          ) AS overall_male_median_salary,
          ROUND(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary)
            FILTER (WHERE gender = 'female'), 2
          ) AS overall_female_median_salary
        FROM employee_pay
      `;
    });

    const r = rows[0] || {};
    const maleAvg = Number(r.overall_male_avg_salary) || 0;
    const femaleAvg = Number(r.overall_female_avg_salary) || 0;
    const maleMedian = Number(r.overall_male_median_salary) || 0;
    const femaleMedian = Number(r.overall_female_median_salary) || 0;

    return {
      total_male: Number(r.total_male) || 0,
      total_female: Number(r.total_female) || 0,
      overall_male_avg_salary: maleAvg,
      overall_female_avg_salary: femaleAvg,
      overall_mean_pay_gap_percentage:
        maleAvg > 0 && femaleAvg > 0
          ? Number(((maleAvg - femaleAvg) / maleAvg * 100).toFixed(2))
          : null,
      overall_median_pay_gap_percentage:
        maleMedian > 0 && femaleMedian > 0
          ? Number(((maleMedian - femaleMedian) / maleMedian * 100).toFixed(2))
          : null,
    };
  }

  // ===========================================================================
  // Workforce Planning Analytics
  // ===========================================================================

  /**
   * Get current active headcount (excludes terminated).
   */
  async getActiveHeadcount(
    context: TenantContext,
    filters: WorkforcePlanningFilters = {}
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<{ count: string }[]>`
        SELECT COUNT(*) as count
        FROM employees e
        WHERE e.status IN ('active', 'on_leave')
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
              )`
            : tx``}
      `;
    });
    return Number(rows[0]?.count) || 0;
  }

  /**
   * Get monthly headcount changes (hires and terminations) for a lookback period.
   * Returns one row per month with hires, terminations, and end-of-month headcount.
   */
  async getMonthlyHeadcountHistory(
    context: TenantContext,
    lookbackMonths: number,
    filters: WorkforcePlanningFilters = {}
  ): Promise<
    Array<{
      period: string;
      hires: number;
      terminations: number;
      endHeadcount: number;
    }>
  > {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', CURRENT_DATE - (${lookbackMonths} || ' months')::interval),
            date_trunc('month', CURRENT_DATE),
            '1 month'::interval
          )::date AS month_start
        ),
        emp_base AS (
          SELECT e.id, e.hire_date, e.termination_date, e.status
          FROM employees e
          WHERE true
            ${filters.org_unit_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM position_assignments pa
                  WHERE pa.employee_id = e.id
                    AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                    AND pa.effective_to IS NULL
                )`
              : tx``}
        ),
        monthly_data AS (
          SELECT
            m.month_start,
            COUNT(*) FILTER (
              WHERE eb.hire_date >= m.month_start
                AND eb.hire_date < m.month_start + '1 month'::interval
            ) AS hires,
            COUNT(*) FILTER (
              WHERE eb.termination_date >= m.month_start
                AND eb.termination_date < m.month_start + '1 month'::interval
            ) AS terminations,
            COUNT(*) FILTER (
              WHERE eb.hire_date <= (m.month_start + '1 month'::interval - '1 day'::interval)
                AND (eb.termination_date IS NULL
                     OR eb.termination_date > (m.month_start + '1 month'::interval - '1 day'::interval))
            ) AS end_headcount
          FROM months m
          CROSS JOIN emp_base eb
          GROUP BY m.month_start
        )
        SELECT
          to_char(month_start, 'YYYY-MM-DD') AS period,
          hires,
          terminations,
          end_headcount
        FROM monthly_data
        ORDER BY month_start
      `;
    });

    return rows.map((r: any) => ({
      period: r.period,
      hires: Number(r.hires) || 0,
      terminations: Number(r.terminations) || 0,
      endHeadcount: Number(r.endHeadcount) || 0,
    }));
  }

  /**
   * Get employees approaching UK state pension age.
   * UK state pension age: 66 (born before 6 Apr 1960), rising to 67 (6 Apr 1960-5 Mar 1961),
   * then 68 (after 5 Mar 1961). Simplified: we use 66 for born before 1960-04-06,
   * 67 for 1960-04-06 to 1961-03-05, 68 for after 1961-03-05.
   *
   * For workforce planning, the key question is: how many years until each employee
   * reaches state pension age? We bucket them into risk bands.
   */
  async getRetirementProjectionData(
    context: TenantContext,
    horizonYears: number,
    filters: WorkforcePlanningFilters = {}
  ): Promise<
    Array<{
      employeeId: string;
      dateOfBirth: string;
      yearsToRetirement: number;
      orgUnitId: string | null;
      orgUnitName: string | null;
    }>
  > {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH active_employees AS (
          SELECT e.id AS employee_id
          FROM employees e
          WHERE e.status IN ('active', 'on_leave')
            ${filters.org_unit_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM position_assignments pa
                  WHERE pa.employee_id = e.id
                    AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                    AND pa.effective_to IS NULL
                )`
              : tx``}
        ),
        personal AS (
          SELECT DISTINCT ON (ep.employee_id)
            ep.employee_id,
            ep.date_of_birth
          FROM employee_personal ep
          INNER JOIN active_employees ae ON ae.employee_id = ep.employee_id
          WHERE ep.effective_to IS NULL
            AND ep.date_of_birth IS NOT NULL
          ORDER BY ep.employee_id, ep.effective_from DESC
        ),
        with_pension_age AS (
          SELECT
            p.employee_id,
            p.date_of_birth,
            CASE
              WHEN p.date_of_birth < '1960-04-06'::date THEN 66
              WHEN p.date_of_birth <= '1961-03-05'::date THEN 67
              ELSE 68
            END AS pension_age,
            CASE
              WHEN p.date_of_birth < '1960-04-06'::date
                THEN p.date_of_birth + interval '66 years'
              WHEN p.date_of_birth <= '1961-03-05'::date
                THEN p.date_of_birth + interval '67 years'
              ELSE p.date_of_birth + interval '68 years'
            END AS pension_date
          FROM personal p
        ),
        with_years AS (
          SELECT
            wpa.employee_id,
            wpa.date_of_birth,
            EXTRACT(YEAR FROM age(wpa.pension_date, CURRENT_DATE))
              + EXTRACT(MONTH FROM age(wpa.pension_date, CURRENT_DATE)) / 12.0 AS years_to_retirement
          FROM with_pension_age wpa
          WHERE wpa.pension_date >= CURRENT_DATE
            AND wpa.pension_date <= CURRENT_DATE + (${horizonYears} || ' years')::interval
        )
        SELECT
          wy.employee_id,
          to_char(wy.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
          wy.years_to_retirement,
          pa.org_unit_id,
          ou.name AS org_unit_name
        FROM with_years wy
        LEFT JOIN LATERAL (
          SELECT pa2.org_unit_id
          FROM position_assignments pa2
          WHERE pa2.employee_id = wy.employee_id
            AND pa2.is_primary = true
            AND pa2.effective_to IS NULL
          LIMIT 1
        ) pa ON true
        LEFT JOIN org_units ou ON ou.id = pa.org_unit_id
        ORDER BY wy.years_to_retirement ASC
      `;
    });

    return rows.map((r: any) => ({
      employeeId: r.employeeId,
      dateOfBirth: r.dateOfBirth,
      yearsToRetirement: Number(r.yearsToRetirement) || 0,
      orgUnitId: r.orgUnitId || null,
      orgUnitName: r.orgUnitName || null,
    }));
  }

  /**
   * Count of active employees with date_of_birth on file.
   */
  async getEmployeesWithDobCount(
    context: TenantContext,
    filters: WorkforcePlanningFilters = {}
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<{ count: string }[]>`
        SELECT COUNT(DISTINCT ep.employee_id) AS count
        FROM employee_personal ep
        INNER JOIN employees e ON e.id = ep.employee_id
        WHERE e.status IN ('active', 'on_leave')
          AND ep.effective_to IS NULL
          AND ep.date_of_birth IS NOT NULL
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
              )`
            : tx``}
      `;
    });
    return Number(rows[0]?.count) || 0;
  }

  /**
   * Skills gap analysis: compare position-required competencies vs employee assessments.
   * Returns aggregated gap data per competency.
   */
  async getSkillsGapData(
    context: TenantContext,
    filters: WorkforcePlanningFilters = {}
  ): Promise<{
    totalEmployeesWithAssessments: number;
    gaps: Array<{
      competencyId: string;
      competencyName: string;
      competencyCategory: string;
      employeesAssessed: number;
      employeesRequired: number;
      avgCurrentLevel: number;
      avgRequiredLevel: number;
      avgGap: number;
      employeesBelowRequired: number;
      coverageRate: number;
    }>;
  }> {
    // Count of employees who have at least one competency assessment
    const countRows = await this.db.withTransaction(context, async (tx) => {
      return tx<{ count: string }[]>`
        SELECT COUNT(DISTINCT ec.employee_id) AS count
        FROM employee_competencies ec
        INNER JOIN employees e ON e.id = ec.employee_id
        WHERE e.status IN ('active', 'on_leave')
          AND ec.current_level IS NOT NULL
          ${filters.org_unit_id
            ? tx`AND EXISTS (
                SELECT 1 FROM position_assignments pa
                WHERE pa.employee_id = e.id
                  AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                  AND pa.effective_to IS NULL
              )`
            : tx``}
      `;
    });

    const totalEmployeesWithAssessments = Number(countRows[0]?.count) || 0;

    // Get the gap analysis data per competency
    const gapRows = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        WITH active_emp AS (
          SELECT e.id AS employee_id
          FROM employees e
          WHERE e.status IN ('active', 'on_leave')
            ${filters.org_unit_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM position_assignments pa
                  WHERE pa.employee_id = e.id
                    AND pa.org_unit_id = ${filters.org_unit_id}::uuid
                    AND pa.effective_to IS NULL
                )`
              : tx``}
        ),
        -- Aggregate required competencies from position_competencies
        required_competencies AS (
          SELECT
            pc.competency_id,
            COUNT(DISTINCT pa.employee_id) AS employees_required,
            AVG(pc.required_level) AS avg_required_level
          FROM position_competencies pc
          INNER JOIN position_assignments pa
            ON pa.position_id = pc.position_id
            AND pa.effective_to IS NULL
            AND pa.is_primary = true
          INNER JOIN active_emp ae ON ae.employee_id = pa.employee_id
          GROUP BY pc.competency_id
        ),
        -- Aggregate actual employee competency levels
        assessed_competencies AS (
          SELECT
            ec.competency_id,
            COUNT(*) AS employees_assessed,
            AVG(ec.current_level) AS avg_current_level
          FROM employee_competencies ec
          INNER JOIN active_emp ae ON ae.employee_id = ec.employee_id
          WHERE ec.current_level IS NOT NULL
          GROUP BY ec.competency_id
        ),
        -- Count employees below required level per competency
        below_required AS (
          SELECT
            pc.competency_id,
            COUNT(*) AS below_count,
            COUNT(*) FILTER (
              WHERE COALESCE(ec.current_level, 0) >= pc.required_level
            ) AS meets_requirement_count
          FROM position_competencies pc
          INNER JOIN position_assignments pa
            ON pa.position_id = pc.position_id
            AND pa.effective_to IS NULL
            AND pa.is_primary = true
          INNER JOIN active_emp ae ON ae.employee_id = pa.employee_id
          LEFT JOIN employee_competencies ec
            ON ec.competency_id = pc.competency_id
            AND ec.employee_id = pa.employee_id
          WHERE COALESCE(ec.current_level, 0) < pc.required_level
          GROUP BY pc.competency_id
        ),
        meets_count AS (
          SELECT
            pc.competency_id,
            COUNT(*) FILTER (
              WHERE COALESCE(ec.current_level, 0) >= pc.required_level
            ) AS meets_count,
            COUNT(*) AS total_required
          FROM position_competencies pc
          INNER JOIN position_assignments pa
            ON pa.position_id = pc.position_id
            AND pa.effective_to IS NULL
            AND pa.is_primary = true
          INNER JOIN active_emp ae ON ae.employee_id = pa.employee_id
          LEFT JOIN employee_competencies ec
            ON ec.competency_id = pc.competency_id
            AND ec.employee_id = pa.employee_id
          GROUP BY pc.competency_id
        )
        SELECT
          c.id AS competency_id,
          c.name AS competency_name,
          c.category::text AS competency_category,
          COALESCE(ac.employees_assessed, 0) AS employees_assessed,
          COALESCE(rc.employees_required, 0) AS employees_required,
          COALESCE(ac.avg_current_level, 0) AS avg_current_level,
          COALESCE(rc.avg_required_level, 0) AS avg_required_level,
          COALESCE(rc.avg_required_level, 0) - COALESCE(ac.avg_current_level, 0) AS avg_gap,
          COALESCE(br.below_count, 0) AS employees_below_required,
          CASE
            WHEN COALESCE(mc.total_required, 0) > 0
            THEN ROUND(COALESCE(mc.meets_count, 0)::numeric / mc.total_required * 100, 1)
            ELSE 100
          END AS coverage_rate
        FROM competencies c
        LEFT JOIN required_competencies rc ON rc.competency_id = c.id
        LEFT JOIN assessed_competencies ac ON ac.competency_id = c.id
        LEFT JOIN below_required br ON br.competency_id = c.id
        LEFT JOIN meets_count mc ON mc.competency_id = c.id
        WHERE c.is_active = true
          AND (rc.competency_id IS NOT NULL OR ac.competency_id IS NOT NULL)
        ORDER BY avg_gap DESC NULLS LAST, c.name
      `;
    });

    return {
      totalEmployeesWithAssessments,
      gaps: gapRows.map((r: any) => ({
        competencyId: r.competencyId,
        competencyName: r.competencyName,
        competencyCategory: r.competencyCategory,
        employeesAssessed: Number(r.employeesAssessed) || 0,
        employeesRequired: Number(r.employeesRequired) || 0,
        avgCurrentLevel: Number(Number(r.avgCurrentLevel).toFixed(2)),
        avgRequiredLevel: Number(Number(r.avgRequiredLevel).toFixed(2)),
        avgGap: Number(Number(r.avgGap).toFixed(2)),
        employeesBelowRequired: Number(r.employeesBelowRequired) || 0,
        coverageRate: Number(r.coverageRate) || 0,
      })),
    };
  }
}
