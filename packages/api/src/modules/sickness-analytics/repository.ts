/**
 * Sickness Analytics Module - Repository Layer
 *
 * Handles database operations for sickness absence trend analysis.
 * Uses aggregate SQL queries with postgres.js tagged templates.
 * All queries run through db.withTransaction for RLS enforcement.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { SicknessAnalyticsFilters } from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Row types for query results
// =============================================================================

export interface SicknessTrendRow {
  month: string;
  totalDaysLost: number;
  totalSpells: number;
  uniqueEmployees: number;
}

export interface SicknessByReasonRow {
  reason: string;
  totalDays: number;
  totalSpells: number;
  uniqueEmployees: number;
  avgSpellDuration: number;
}

export interface DepartmentSicknessRow {
  departmentId: string;
  departmentName: string;
  headcount: number;
  totalDaysLost: number;
  totalSpells: number;
  uniqueEmployees: number;
}

export interface SeasonalPatternRow {
  monthOfYear: number;
  yearCount: number;
  totalDaysLost: number;
  totalSpells: number;
}

export interface SicknessSummaryRow {
  totalDaysLost: number;
  totalSpells: number;
  uniqueEmployees: number;
  totalActiveEmployees: number;
  shortTermDays: number;
  longTermDays: number;
}

export interface AvgDailySalaryRow {
  avgDailySalary: number;
}

export interface DepartmentAbsenceSpellRow {
  employeeId: string;
  departmentId: string;
  startDate: Date;
  endDate: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class SicknessAnalyticsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Trends (Monthly)
  // ===========================================================================

  /**
   * Get monthly sickness absence data for the given date range.
   * Returns one row per month with total days, spell count, and unique employees.
   */
  async getSicknessTrends(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<SicknessTrendRow[]> {
    const startDate = filters.start_date || this.defaultStartDate();
    const endDate = filters.end_date || this.today();

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<SicknessTrendRow[]>`
        WITH sickness_requests AS (
          SELECT
            lr.id,
            lr.employee_id,
            lr.start_date,
            lr.end_date,
            lr.duration
          FROM app.leave_requests lr
          INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id AND lt.category = 'sick'
          WHERE lr.status IN ('approved', 'completed')
            AND lr.start_date <= ${endDate}::date
            AND lr.end_date >= ${startDate}::date
            ${filters.department_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.position_assignments pa
                  INNER JOIN app.positions p ON pa.position_id = p.id
                  WHERE pa.employee_id = lr.employee_id
                    AND p.org_unit_id = ${filters.department_id}::uuid
                    AND pa.effective_to IS NULL
                    AND pa.is_primary = true
                )`
              : tx``}
            ${filters.employee_group
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.employees e
                  WHERE e.id = lr.employee_id
                    AND e.employment_type = ${filters.employee_group}
                )`
              : tx``}
        ),
        month_series AS (
          SELECT generate_series(
            date_trunc('month', ${startDate}::date),
            date_trunc('month', ${endDate}::date),
            '1 month'::interval
          )::date AS month_start
        )
        SELECT
          to_char(ms.month_start, 'YYYY-MM') AS month,
          COALESCE(SUM(sr.duration), 0)::numeric AS total_days_lost,
          COUNT(sr.id)::int AS total_spells,
          COUNT(DISTINCT sr.employee_id)::int AS unique_employees
        FROM month_series ms
        LEFT JOIN sickness_requests sr
          ON sr.start_date < (ms.month_start + '1 month'::interval)::date
          AND sr.end_date >= ms.month_start
        GROUP BY ms.month_start
        ORDER BY ms.month_start
      `;
      return rows;
    });
  }

  // ===========================================================================
  // By Reason
  // ===========================================================================

  /**
   * Get sickness absence breakdown by reported reason.
   * Groups by the leave request reason text and aggregates days/spells.
   */
  async getSicknessByReason(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<SicknessByReasonRow[]> {
    const startDate = filters.start_date || this.defaultStartDate();
    const endDate = filters.end_date || this.today();

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<SicknessByReasonRow[]>`
        SELECT
          COALESCE(NULLIF(TRIM(lr.reason), ''), 'Not specified') AS reason,
          COALESCE(SUM(lr.duration), 0)::numeric AS total_days,
          COUNT(*)::int AS total_spells,
          COUNT(DISTINCT lr.employee_id)::int AS unique_employees,
          ROUND(AVG(lr.duration), 1)::numeric AS avg_spell_duration
        FROM app.leave_requests lr
        INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id AND lt.category = 'sick'
        WHERE lr.status IN ('approved', 'completed')
          AND lr.start_date >= ${startDate}::date
          AND lr.end_date <= ${endDate}::date
          ${filters.department_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = lr.employee_id
                  AND p.org_unit_id = ${filters.department_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
          ${filters.employee_group
            ? tx`AND EXISTS (
                SELECT 1 FROM app.employees e
                WHERE e.id = lr.employee_id
                  AND e.employment_type = ${filters.employee_group}
              )`
            : tx``}
        GROUP BY COALESCE(NULLIF(TRIM(lr.reason), ''), 'Not specified')
        ORDER BY total_days DESC
      `;
      return rows;
    });
  }

  // ===========================================================================
  // By Department
  // ===========================================================================

  /**
   * Get sickness data aggregated by department.
   * Includes headcount for rate calculation. Bradford Factor is computed
   * in the service layer using absence spell data.
   */
  async getSicknessByDepartment(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<DepartmentSicknessRow[]> {
    const startDate = filters.start_date || this.defaultStartDate();
    const endDate = filters.end_date || this.today();

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<DepartmentSicknessRow[]>`
        WITH dept_headcount AS (
          SELECT
            p.org_unit_id AS department_id,
            COUNT(DISTINCT e.id)::int AS headcount
          FROM app.employees e
          INNER JOIN app.position_assignments pa ON pa.employee_id = e.id
            AND pa.effective_to IS NULL
            AND pa.is_primary = true
          INNER JOIN app.positions p ON pa.position_id = p.id
          WHERE e.status IN ('active', 'on_leave')
            ${filters.employee_group
              ? tx`AND e.employment_type = ${filters.employee_group}`
              : tx``}
          GROUP BY p.org_unit_id
        ),
        dept_sickness AS (
          SELECT
            p.org_unit_id AS department_id,
            COALESCE(SUM(lr.duration), 0)::numeric AS total_days_lost,
            COUNT(lr.id)::int AS total_spells,
            COUNT(DISTINCT lr.employee_id)::int AS unique_employees
          FROM app.leave_requests lr
          INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id AND lt.category = 'sick'
          INNER JOIN app.position_assignments pa ON pa.employee_id = lr.employee_id
            AND pa.effective_to IS NULL
            AND pa.is_primary = true
          INNER JOIN app.positions p ON pa.position_id = p.id
          WHERE lr.status IN ('approved', 'completed')
            AND lr.start_date >= ${startDate}::date
            AND lr.end_date <= ${endDate}::date
            ${filters.department_id
              ? tx`AND p.org_unit_id = ${filters.department_id}::uuid`
              : tx``}
            ${filters.employee_group
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.employees e
                  WHERE e.id = lr.employee_id
                    AND e.employment_type = ${filters.employee_group}
                )`
              : tx``}
          GROUP BY p.org_unit_id
        )
        SELECT
          ou.id AS department_id,
          ou.name AS department_name,
          COALESCE(dh.headcount, 0)::int AS headcount,
          COALESCE(ds.total_days_lost, 0)::numeric AS total_days_lost,
          COALESCE(ds.total_spells, 0)::int AS total_spells,
          COALESCE(ds.unique_employees, 0)::int AS unique_employees
        FROM app.org_units ou
        LEFT JOIN dept_headcount dh ON dh.department_id = ou.id
        LEFT JOIN dept_sickness ds ON ds.department_id = ou.id
        WHERE ou.is_active = true
          AND (dh.headcount > 0 OR ds.total_spells > 0)
          ${filters.department_id
            ? tx`AND ou.id = ${filters.department_id}::uuid`
            : tx``}
        ORDER BY COALESCE(ds.total_days_lost, 0) DESC
      `;
      return rows;
    });
  }

  /**
   * Get sickness absence spells per employee per department for Bradford Factor calculation.
   * Returns raw spell data so the service can compute S^2*D per employee.
   */
  async getDepartmentAbsenceSpells(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<DepartmentAbsenceSpellRow[]> {
    const startDate = filters.start_date || this.defaultStartDate();
    const endDate = filters.end_date || this.today();

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<DepartmentAbsenceSpellRow[]>`
        SELECT
          lr.employee_id,
          p.org_unit_id AS department_id,
          lr.start_date,
          lr.end_date
        FROM app.leave_requests lr
        INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id AND lt.category = 'sick'
        INNER JOIN app.position_assignments pa ON pa.employee_id = lr.employee_id
          AND pa.effective_to IS NULL
          AND pa.is_primary = true
        INNER JOIN app.positions p ON pa.position_id = p.id
        WHERE lr.status IN ('approved', 'completed')
          AND lr.start_date >= ${startDate}::date
          AND lr.end_date <= ${endDate}::date
          ${filters.department_id
            ? tx`AND p.org_unit_id = ${filters.department_id}::uuid`
            : tx``}
          ${filters.employee_group
            ? tx`AND EXISTS (
                SELECT 1 FROM app.employees e
                WHERE e.id = lr.employee_id
                  AND e.employment_type = ${filters.employee_group}
              )`
            : tx``}
        ORDER BY p.org_unit_id, lr.employee_id, lr.start_date
      `;
      return rows;
    });
  }

  // ===========================================================================
  // Seasonal Patterns
  // ===========================================================================

  /**
   * Get sickness data aggregated by month-of-year for seasonal analysis.
   * Averages across all available years of data.
   */
  async getSicknessSeasonalPatterns(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<SeasonalPatternRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<SeasonalPatternRow[]>`
        SELECT
          EXTRACT(MONTH FROM lr.start_date)::int AS month_of_year,
          COUNT(DISTINCT EXTRACT(YEAR FROM lr.start_date))::int AS year_count,
          COALESCE(SUM(lr.duration), 0)::numeric AS total_days_lost,
          COUNT(*)::int AS total_spells
        FROM app.leave_requests lr
        INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id AND lt.category = 'sick'
        WHERE lr.status IN ('approved', 'completed')
          ${filters.department_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = lr.employee_id
                  AND p.org_unit_id = ${filters.department_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
          ${filters.employee_group
            ? tx`AND EXISTS (
                SELECT 1 FROM app.employees e
                WHERE e.id = lr.employee_id
                  AND e.employment_type = ${filters.employee_group}
              )`
            : tx``}
        GROUP BY EXTRACT(MONTH FROM lr.start_date)
        ORDER BY month_of_year
      `;
      return rows;
    });
  }

  // ===========================================================================
  // Summary
  // ===========================================================================

  /**
   * Get overall sickness absence summary metrics for the period.
   */
  async getSicknessSummary(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<SicknessSummaryRow> {
    const startDate = filters.start_date || this.defaultStartDate();
    const endDate = filters.end_date || this.today();

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<SicknessSummaryRow[]>`
        WITH sickness AS (
          SELECT
            lr.id,
            lr.employee_id,
            lr.duration,
            lr.start_date,
            lr.end_date
          FROM app.leave_requests lr
          INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id AND lt.category = 'sick'
          WHERE lr.status IN ('approved', 'completed')
            AND lr.start_date >= ${startDate}::date
            AND lr.end_date <= ${endDate}::date
            ${filters.department_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.position_assignments pa
                  INNER JOIN app.positions p ON pa.position_id = p.id
                  WHERE pa.employee_id = lr.employee_id
                    AND p.org_unit_id = ${filters.department_id}::uuid
                    AND pa.effective_to IS NULL
                    AND pa.is_primary = true
                )`
              : tx``}
            ${filters.employee_group
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.employees e
                  WHERE e.id = lr.employee_id
                    AND e.employment_type = ${filters.employee_group}
                )`
              : tx``}
        ),
        active_emps AS (
          SELECT COUNT(DISTINCT e.id)::int AS cnt
          FROM app.employees e
          WHERE e.status IN ('active', 'on_leave')
            ${filters.department_id
              ? tx`AND EXISTS (
                  SELECT 1 FROM app.position_assignments pa
                  INNER JOIN app.positions p ON pa.position_id = p.id
                  WHERE pa.employee_id = e.id
                    AND p.org_unit_id = ${filters.department_id}::uuid
                    AND pa.effective_to IS NULL
                    AND pa.is_primary = true
                )`
              : tx``}
            ${filters.employee_group
              ? tx`AND e.employment_type = ${filters.employee_group}`
              : tx``}
        )
        SELECT
          COALESCE(SUM(s.duration), 0)::numeric AS total_days_lost,
          COUNT(s.id)::int AS total_spells,
          COUNT(DISTINCT s.employee_id)::int AS unique_employees,
          (SELECT cnt FROM active_emps) AS total_active_employees,
          COALESCE(SUM(s.duration) FILTER (WHERE s.duration <= 7), 0)::numeric AS short_term_days,
          COALESCE(SUM(s.duration) FILTER (WHERE s.duration > 7), 0)::numeric AS long_term_days
        FROM sickness s
      `;
    });

    return (
      rows[0] ?? {
        totalDaysLost: 0,
        totalSpells: 0,
        uniqueEmployees: 0,
        totalActiveEmployees: 0,
        shortTermDays: 0,
        longTermDays: 0,
      }
    );
  }

  /**
   * Get average daily salary for cost estimation.
   * Uses the most recent compensation record per active employee.
   */
  async getAvgDailySalary(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AvgDailySalaryRow[]>`
        SELECT
          COALESCE(
            ROUND(AVG(cr.amount / 260), 2),
            0
          )::numeric AS avg_daily_salary
        FROM app.employees e
        INNER JOIN app.compensation_records cr ON cr.employee_id = e.id
          AND cr.effective_to IS NULL
        WHERE e.status IN ('active', 'on_leave')
          ${filters.department_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = e.id
                  AND p.org_unit_id = ${filters.department_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
          ${filters.employee_group
            ? tx`AND e.employment_type = ${filters.employee_group}`
            : tx``}
      `;
    });

    return Number(rows[0]?.avgDailySalary ?? 0);
  }

  // ===========================================================================
  // Active headcount for rate calculations
  // ===========================================================================

  /**
   * Get active employee count for the tenant (optionally filtered).
   */
  async getActiveHeadcount(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Array<{ count: number }>>`
        SELECT COUNT(DISTINCT e.id)::int AS count
        FROM app.employees e
        WHERE e.status IN ('active', 'on_leave')
          ${filters.department_id
            ? tx`AND EXISTS (
                SELECT 1 FROM app.position_assignments pa
                INNER JOIN app.positions p ON pa.position_id = p.id
                WHERE pa.employee_id = e.id
                  AND p.org_unit_id = ${filters.department_id}::uuid
                  AND pa.effective_to IS NULL
                  AND pa.is_primary = true
              )`
            : tx``}
          ${filters.employee_group
            ? tx`AND e.employment_type = ${filters.employee_group}`
            : tx``}
      `;
    });

    return Number(rows[0]?.count ?? 0);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private today(): string {
    return new Date().toISOString().split("T")[0]!;
  }

  private defaultStartDate(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0]!;
  }
}
