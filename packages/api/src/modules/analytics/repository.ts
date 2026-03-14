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
      `;
    });

    const r = rows[0] || {};
    return {
      total_employees: Number(r.total_employees) || 0,
      avg_salary: Number(r.avg_salary) || 0,
      median_salary: Number(r.median_salary) || 0,
      min_salary: Number(r.min_salary) || 0,
      max_salary: Number(r.max_salary) || 0,
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
}
