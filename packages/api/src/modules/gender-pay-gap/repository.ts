/**
 * Gender Pay Gap Module - Repository Layer
 *
 * Provides data access methods for gender pay gap reports and related
 * employee compensation data.
 *
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 * Uses explicit column lists and postgres.js tagged templates.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  GpgReportStatus,
  GpgReportFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for gender_pay_gap_reports
 */
export interface GpgReportRow extends Row {
  id: string;
  tenantId: string;
  snapshotDate: Date;
  reportingYear: number;
  totalEmployees: number;
  maleCount: number;
  femaleCount: number;
  meanHourlyPayGap: number | null;
  medianHourlyPayGap: number | null;
  meanBonusGap: number | null;
  medianBonusGap: number | null;
  maleBonusPct: number | null;
  femaleBonusPct: number | null;
  lowerQuartileMalePct: number | null;
  lowerQuartileFemalePct: number | null;
  lowerMiddleQuartileMalePct: number | null;
  lowerMiddleQuartileFemalePct: number | null;
  upperMiddleQuartileMalePct: number | null;
  upperMiddleQuartileFemalePct: number | null;
  upperQuartileMalePct: number | null;
  upperQuartileFemalePct: number | null;
  status: GpgReportStatus;
  publishedAt: Date | null;
  calculatedBy: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated result shape
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Employee pay data row for ordinary pay calculation.
 * Joins employees, employee_personal, compensation_history, and employment_contracts.
 */
export interface EmployeePayDataRow extends Row {
  employeeId: string;
  gender: string;
  annualSalary: number;
  workingHoursPerWeek: number | null;
  payFrequency: string;
  baseSalary: number;
}

/**
 * Employee bonus data row for bonus gap calculation.
 * Aggregated bonus total per employee from bonus_payments table.
 */
export interface EmployeeBonusDataRow extends Row {
  employeeId: string;
  gender: string;
  totalBonus: number;
}

/**
 * Dashboard trend row returned by aggregation queries
 */
export interface TrendRow extends Row {
  reportingYear: number;
  meanHourlyPayGap: number | null;
  medianHourlyPayGap: number | null;
  meanBonusGap: number | null;
  medianBonusGap: number | null;
  upperQuartileFemalePct: number | null;
  status: GpgReportStatus;
}

/**
 * Dashboard count row
 */
export interface DashboardCountsRow extends Row {
  totalReports: string;
  publishedReports: string;
}

// =============================================================================
// Repository
// =============================================================================

export class GenderPayGapRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Find report by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<GpgReportRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<GpgReportRow[]>`
        SELECT
          id, tenant_id, snapshot_date, reporting_year,
          total_employees, male_count, female_count,
          mean_hourly_pay_gap, median_hourly_pay_gap,
          mean_bonus_gap, median_bonus_gap,
          male_bonus_pct, female_bonus_pct,
          lower_quartile_male_pct, lower_quartile_female_pct,
          lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
          upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
          upper_quartile_male_pct, upper_quartile_female_pct,
          status, published_at, calculated_by, notes,
          created_at, updated_at
        FROM gender_pay_gap_reports
        WHERE id = ${id}
      `;
    });
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find report by reporting year (unique per tenant)
   */
  async findByReportingYear(
    context: TenantContext,
    reportingYear: number
  ): Promise<GpgReportRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<GpgReportRow[]>`
        SELECT
          id, tenant_id, snapshot_date, reporting_year,
          total_employees, male_count, female_count,
          mean_hourly_pay_gap, median_hourly_pay_gap,
          mean_bonus_gap, median_bonus_gap,
          male_bonus_pct, female_bonus_pct,
          lower_quartile_male_pct, lower_quartile_female_pct,
          lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
          upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
          upper_quartile_male_pct, upper_quartile_female_pct,
          status, published_at, calculated_by, notes,
          created_at, updated_at
        FROM gender_pay_gap_reports
        WHERE reporting_year = ${reportingYear}
      `;
    });
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * List reports with cursor-based pagination and optional filters.
   * Uses postgres.js tagged template conditionals for safe parameterization.
   */
  async listReports(
    context: TenantContext,
    filters: GpgReportFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<GpgReportRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    const rows = await this.db.withTransaction(context, async (tx) => {
      // Parse cursor into components
      let cursorDate: string | null = null;
      let cursorId: string | null = null;
      if (pagination.cursor) {
        const parts = pagination.cursor.split("__");
        if (parts.length === 2) {
          cursorDate = parts[0];
          cursorId = parts[1];
        }
      }

      return await tx<GpgReportRow[]>`
        SELECT
          id, tenant_id, snapshot_date, reporting_year,
          total_employees, male_count, female_count,
          mean_hourly_pay_gap, median_hourly_pay_gap,
          mean_bonus_gap, median_bonus_gap,
          male_bonus_pct, female_bonus_pct,
          lower_quartile_male_pct, lower_quartile_female_pct,
          lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
          upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
          upper_quartile_male_pct, upper_quartile_female_pct,
          status, published_at, calculated_by, notes,
          created_at, updated_at
        FROM gender_pay_gap_reports
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.reporting_year ? tx`AND reporting_year = ${filters.reporting_year}` : tx``}
          ${cursorDate && cursorId
            ? tx`AND (created_at, id) < (${cursorDate}::timestamptz, ${cursorId}::uuid)`
            : tx``}
        ORDER BY reporting_year DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem.createdAt instanceof Date ? lastItem.createdAt.toISOString() : lastItem.createdAt}__${lastItem.id}`
      : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Get all reports ordered by year for trend analysis (no pagination).
   * Returns a lightweight projection for dashboard use.
   */
  async getAllReportsForTrends(
    context: TenantContext
  ): Promise<TrendRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<TrendRow[]>`
        SELECT
          reporting_year,
          mean_hourly_pay_gap,
          median_hourly_pay_gap,
          mean_bonus_gap,
          median_bonus_gap,
          upper_quartile_female_pct,
          status
        FROM gender_pay_gap_reports
        ORDER BY reporting_year ASC
      `;
    });
  }

  /**
   * Get report counts for dashboard
   */
  async getReportCounts(
    context: TenantContext
  ): Promise<{ totalReports: number; publishedReports: number }> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<DashboardCountsRow[]>`
        SELECT
          COUNT(*)::text AS total_reports,
          COUNT(*) FILTER (WHERE status = 'published')::text AS published_reports
        FROM gender_pay_gap_reports
      `;
    });
    const row = rows[0];
    return {
      totalReports: parseInt(row?.totalReports || "0", 10),
      publishedReports: parseInt(row?.publishedReports || "0", 10),
    };
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Create a new report (draft or calculated)
   */
  async createReport(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      snapshotDate: string;
      reportingYear: number;
      totalEmployees: number;
      maleCount: number;
      femaleCount: number;
      meanHourlyPayGap: number | null;
      medianHourlyPayGap: number | null;
      meanBonusGap: number | null;
      medianBonusGap: number | null;
      maleBonusPct: number | null;
      femaleBonusPct: number | null;
      lowerQuartileMalePct: number | null;
      lowerQuartileFemalePct: number | null;
      lowerMiddleQuartileMalePct: number | null;
      lowerMiddleQuartileFemalePct: number | null;
      upperMiddleQuartileMalePct: number | null;
      upperMiddleQuartileFemalePct: number | null;
      upperQuartileMalePct: number | null;
      upperQuartileFemalePct: number | null;
      status: GpgReportStatus;
      calculatedBy: string | null;
      notes: string | null;
    }
  ): Promise<GpgReportRow> {
    const rows = await tx<GpgReportRow[]>`
      INSERT INTO gender_pay_gap_reports (
        tenant_id, snapshot_date, reporting_year,
        total_employees, male_count, female_count,
        mean_hourly_pay_gap, median_hourly_pay_gap,
        mean_bonus_gap, median_bonus_gap,
        male_bonus_pct, female_bonus_pct,
        lower_quartile_male_pct, lower_quartile_female_pct,
        lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
        upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
        upper_quartile_male_pct, upper_quartile_female_pct,
        status, calculated_by, notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.snapshotDate}::date,
        ${data.reportingYear},
        ${data.totalEmployees},
        ${data.maleCount},
        ${data.femaleCount},
        ${data.meanHourlyPayGap},
        ${data.medianHourlyPayGap},
        ${data.meanBonusGap},
        ${data.medianBonusGap},
        ${data.maleBonusPct},
        ${data.femaleBonusPct},
        ${data.lowerQuartileMalePct},
        ${data.lowerQuartileFemalePct},
        ${data.lowerMiddleQuartileMalePct},
        ${data.lowerMiddleQuartileFemalePct},
        ${data.upperMiddleQuartileMalePct},
        ${data.upperMiddleQuartileFemalePct},
        ${data.upperQuartileMalePct},
        ${data.upperQuartileFemalePct},
        ${data.status},
        ${data.calculatedBy}::uuid,
        ${data.notes}
      )
      RETURNING
        id, tenant_id, snapshot_date, reporting_year,
        total_employees, male_count, female_count,
        mean_hourly_pay_gap, median_hourly_pay_gap,
        mean_bonus_gap, median_bonus_gap,
        male_bonus_pct, female_bonus_pct,
        lower_quartile_male_pct, lower_quartile_female_pct,
        lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
        upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
        upper_quartile_male_pct, upper_quartile_female_pct,
        status, published_at, calculated_by, notes,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Update an existing report (recalculate overwrites)
   */
  async updateReport(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: {
      totalEmployees: number;
      maleCount: number;
      femaleCount: number;
      meanHourlyPayGap: number | null;
      medianHourlyPayGap: number | null;
      meanBonusGap: number | null;
      medianBonusGap: number | null;
      maleBonusPct: number | null;
      femaleBonusPct: number | null;
      lowerQuartileMalePct: number | null;
      lowerQuartileFemalePct: number | null;
      lowerMiddleQuartileMalePct: number | null;
      lowerMiddleQuartileFemalePct: number | null;
      upperMiddleQuartileMalePct: number | null;
      upperMiddleQuartileFemalePct: number | null;
      upperQuartileMalePct: number | null;
      upperQuartileFemalePct: number | null;
      status: GpgReportStatus;
      calculatedBy: string | null;
      notes?: string | null;
    }
  ): Promise<GpgReportRow> {
    const rows = await tx<GpgReportRow[]>`
      UPDATE gender_pay_gap_reports
      SET
        total_employees = ${data.totalEmployees},
        male_count = ${data.maleCount},
        female_count = ${data.femaleCount},
        mean_hourly_pay_gap = ${data.meanHourlyPayGap},
        median_hourly_pay_gap = ${data.medianHourlyPayGap},
        mean_bonus_gap = ${data.meanBonusGap},
        median_bonus_gap = ${data.medianBonusGap},
        male_bonus_pct = ${data.maleBonusPct},
        female_bonus_pct = ${data.femaleBonusPct},
        lower_quartile_male_pct = ${data.lowerQuartileMalePct},
        lower_quartile_female_pct = ${data.lowerQuartileFemalePct},
        lower_middle_quartile_male_pct = ${data.lowerMiddleQuartileMalePct},
        lower_middle_quartile_female_pct = ${data.lowerMiddleQuartileFemalePct},
        upper_middle_quartile_male_pct = ${data.upperMiddleQuartileMalePct},
        upper_middle_quartile_female_pct = ${data.upperMiddleQuartileFemalePct},
        upper_quartile_male_pct = ${data.upperQuartileMalePct},
        upper_quartile_female_pct = ${data.upperQuartileFemalePct},
        status = ${data.status},
        calculated_by = ${data.calculatedBy}::uuid
        ${data.notes !== undefined ? tx`, notes = ${data.notes}` : tx``}
      WHERE id = ${id}
      RETURNING
        id, tenant_id, snapshot_date, reporting_year,
        total_employees, male_count, female_count,
        mean_hourly_pay_gap, median_hourly_pay_gap,
        mean_bonus_gap, median_bonus_gap,
        male_bonus_pct, female_bonus_pct,
        lower_quartile_male_pct, lower_quartile_female_pct,
        lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
        upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
        upper_quartile_male_pct, upper_quartile_female_pct,
        status, published_at, calculated_by, notes,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Publish a report (set status to published and record timestamp)
   */
  async publishReport(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<GpgReportRow> {
    const rows = await tx<GpgReportRow[]>`
      UPDATE gender_pay_gap_reports
      SET
        status = 'published',
        published_at = now()
      WHERE id = ${id}
      RETURNING
        id, tenant_id, snapshot_date, reporting_year,
        total_employees, male_count, female_count,
        mean_hourly_pay_gap, median_hourly_pay_gap,
        mean_bonus_gap, median_bonus_gap,
        male_bonus_pct, female_bonus_pct,
        lower_quartile_male_pct, lower_quartile_female_pct,
        lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
        upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
        upper_quartile_male_pct, upper_quartile_female_pct,
        status, published_at, calculated_by, notes,
        created_at, updated_at
    `;
    return rows[0];
  }

  // ===========================================================================
  // Calculation Queries
  // ===========================================================================

  /**
   * Get employee ordinary pay data for gender pay gap calculation.
   *
   * Joins employees, employee_personal, compensation_history, and employment_contracts
   * to get gender, annual salary (ordinary pay), and working hours for employees
   * active on the snapshot date.
   *
   * Ordinary pay includes: basic pay, paid leave, allowances, shift premium pay.
   * It excludes: overtime, redundancy, benefits in kind.
   *
   * Only includes employees with gender = 'male' or 'female' (as per UK GPG
   * regulations, the report is specifically about the binary gender pay gap).
   */
  async getEmployeePayData(
    context: TenantContext,
    snapshotDate: string
  ): Promise<EmployeePayDataRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<EmployeePayDataRow[]>`
        SELECT
          e.id AS employee_id,
          ep.gender,
          app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary,
          ec.working_hours_per_week,
          ch.pay_frequency,
          ch.base_salary
        FROM employees e
        INNER JOIN employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_from <= ${snapshotDate}::date
          AND (ep.effective_to IS NULL OR ep.effective_to > ${snapshotDate}::date)
        INNER JOIN compensation_history ch
          ON ch.employee_id = e.id
          AND ch.tenant_id = e.tenant_id
          AND ch.effective_from <= ${snapshotDate}::date
          AND (ch.effective_to IS NULL OR ch.effective_to > ${snapshotDate}::date)
        LEFT JOIN employment_contracts ec
          ON ec.employee_id = e.id
          AND ec.tenant_id = e.tenant_id
          AND ec.effective_from <= ${snapshotDate}::date
          AND (ec.effective_to IS NULL OR ec.effective_to > ${snapshotDate}::date)
        WHERE e.status IN ('active', 'on_leave')
          AND e.hire_date <= ${snapshotDate}::date
          AND (e.termination_date IS NULL OR e.termination_date > ${snapshotDate}::date)
          AND ep.gender IN ('male', 'female')
      `;
    });
  }

  /**
   * Get employee bonus data for the 12-month period ending on the snapshot date.
   *
   * UK GPG regulations define bonus pay as any pay relating to profit sharing,
   * productivity, performance, or incentive. The reference period is the 12 months
   * ending on the snapshot date.
   *
   * Returns aggregated total bonus per employee (only those with gender data).
   */
  async getEmployeeBonusData(
    context: TenantContext,
    snapshotDate: string
  ): Promise<EmployeeBonusDataRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      // The bonus reference period is the 12 months ending on the snapshot date
      return await tx<EmployeeBonusDataRow[]>`
        SELECT
          bp.employee_id,
          ep.gender,
          SUM(bp.amount)::numeric(15,2) AS total_bonus
        FROM bonus_payments bp
        INNER JOIN employees e
          ON e.id = bp.employee_id
          AND e.tenant_id = bp.tenant_id
        INNER JOIN employee_personal ep
          ON ep.employee_id = e.id
          AND ep.tenant_id = e.tenant_id
          AND ep.effective_from <= ${snapshotDate}::date
          AND (ep.effective_to IS NULL OR ep.effective_to > ${snapshotDate}::date)
        WHERE e.status IN ('active', 'on_leave')
          AND e.hire_date <= ${snapshotDate}::date
          AND (e.termination_date IS NULL OR e.termination_date > ${snapshotDate}::date)
          AND ep.gender IN ('male', 'female')
          AND bp.payment_date > (${snapshotDate}::date - INTERVAL '12 months')::date
          AND bp.payment_date <= ${snapshotDate}::date
        GROUP BY bp.employee_id, ep.gender
      `;
    });
  }

  /**
   * Get total employee count on snapshot date (all genders, for reference)
   */
  async getTotalEmployeeCount(
    context: TenantContext,
    snapshotDate: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM employees e
        WHERE e.status IN ('active', 'on_leave')
          AND e.hire_date <= ${snapshotDate}::date
          AND (e.termination_date IS NULL OR e.termination_date > ${snapshotDate}::date)
      `;
    });
    return parseInt(rows[0]?.count || "0", 10);
  }

  /**
   * Get current employee count (for dashboard threshold check)
   */
  async getCurrentEmployeeCount(
    context: TenantContext
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM employees e
        WHERE e.status IN ('active', 'on_leave')
      `;
    });
    return parseInt(rows[0]?.count || "0", 10);
  }

  /**
   * Get the most recent report (by reporting year, any status)
   */
  async getLatestReport(
    context: TenantContext
  ): Promise<GpgReportRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<GpgReportRow[]>`
        SELECT
          id, tenant_id, snapshot_date, reporting_year,
          total_employees, male_count, female_count,
          mean_hourly_pay_gap, median_hourly_pay_gap,
          mean_bonus_gap, median_bonus_gap,
          male_bonus_pct, female_bonus_pct,
          lower_quartile_male_pct, lower_quartile_female_pct,
          lower_middle_quartile_male_pct, lower_middle_quartile_female_pct,
          upper_middle_quartile_male_pct, upper_middle_quartile_female_pct,
          upper_quartile_male_pct, upper_quartile_female_pct,
          status, published_at, calculated_by, notes,
          created_at, updated_at
        FROM gender_pay_gap_reports
        ORDER BY reporting_year DESC
        LIMIT 1
      `;
    });
    return rows.length > 0 ? rows[0] : null;
  }
}
