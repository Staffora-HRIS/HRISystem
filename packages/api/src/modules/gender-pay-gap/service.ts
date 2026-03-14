/**
 * Gender Pay Gap Module - Service Layer
 *
 * Implements business logic for UK Gender Pay Gap reporting.
 * Calculates all 6 required metrics per the Equality Act 2010
 * (Gender Pay Gap Information) Regulations 2017:
 *
 *   1. Mean gender pay gap (ordinary pay)
 *   2. Median gender pay gap (ordinary pay)
 *   3. Mean bonus gender pay gap
 *   4. Median bonus gender pay gap
 *   5. Proportion of males/females receiving bonuses
 *   6. Proportion of males/females in each pay quartile
 *
 * Snapshot dates:
 *   - Private sector: 5 April each year
 *   - Public sector: 31 March each year
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  GenderPayGapRepository,
  GpgReportRow,
  EmployeePayDataRow,
  EmployeeBonusDataRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CalculateGpg,
  GenerateReport,
  GpgReportFilters,
  PaginationQuery,
  GpgReportResponse,
  GpgReportListItem,
  GpgDashboardResponse,
  SectorType,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default working hours per week if not specified in contract.
 * UK standard full-time working week.
 */
const DEFAULT_WORKING_HOURS_PER_WEEK = 37.5;

/**
 * Weeks per year for hourly rate calculation
 */
const WEEKS_PER_YEAR = 52;

/**
 * UK GPG reporting threshold — organisations with 250+ employees must report
 */
const REPORTING_THRESHOLD = 250;

// =============================================================================
// Types
// =============================================================================

/**
 * Domain event types for gender pay gap module
 */
type GpgDomainEventType =
  | "gpg.report.calculated"
  | "gpg.report.recalculated"
  | "gpg.report.published";

/**
 * Internal structure for pay gap calculation results
 */
interface PayGapCalculation {
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
}

// =============================================================================
// Service
// =============================================================================

export class GenderPayGapService {
  constructor(
    private repository: GenderPayGapRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: GpgDomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        'gender_pay_gap_report',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Snapshot Date Helpers
  // ===========================================================================

  /**
   * Determine the statutory snapshot date for a given year and sector.
   *
   * - Private sector: 5 April of the reporting year
   * - Public sector: 31 March of the reporting year
   */
  static getSnapshotDate(reportingYear: number, sector: SectorType = "private"): string {
    if (sector === "public") {
      // 31 March of the reporting year
      return `${reportingYear}-03-31`;
    }
    // Private sector: 5 April of the reporting year
    return `${reportingYear}-04-05`;
  }

  // ===========================================================================
  // Calculation Logic
  // ===========================================================================

  /**
   * Calculate hourly rate from annual salary and working hours.
   *
   * UK GPG formula: hourly_rate = weekly_pay / weekly_working_hours
   * Where weekly_pay = annual_salary / 52
   */
  private calculateHourlyRate(
    annualSalary: number,
    workingHoursPerWeek: number | null
  ): number {
    const hours = workingHoursPerWeek || DEFAULT_WORKING_HOURS_PER_WEEK;
    const annualHours = hours * WEEKS_PER_YEAR;
    if (annualHours === 0) return 0;
    return annualSalary / annualHours;
  }

  /**
   * Calculate mean (average) of an array of numbers.
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }

  /**
   * Calculate median of a sorted array of numbers.
   */
  private median(sortedValues: number[]): number {
    if (sortedValues.length === 0) return 0;
    const mid = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
    }
    return sortedValues[mid];
  }

  /**
   * Calculate the gender pay gap percentage.
   *
   * UK GPG formula: ((male_value - female_value) / male_value) * 100
   * Positive value = men paid more on average
   * Negative value = women paid more on average
   */
  private calculateGapPercentage(maleValue: number, femaleValue: number): number | null {
    if (maleValue === 0 && femaleValue === 0) return 0;
    if (maleValue === 0) return null; // Cannot divide by zero
    return Number((((maleValue - femaleValue) / maleValue) * 100).toFixed(2));
  }

  /**
   * Calculate pay quartile distribution percentages.
   *
   * Employees are ranked by hourly rate and divided into four equal groups:
   *   - Lower quartile (lowest paid 25%)
   *   - Lower middle quartile
   *   - Upper middle quartile
   *   - Upper quartile (highest paid 25%)
   *
   * Returns the percentage of males and females in each quartile.
   */
  private calculateQuartiles(
    employees: Array<{ gender: string; hourlyRate: number }>
  ): {
    lowerQuartileMalePct: number;
    lowerQuartileFemalePct: number;
    lowerMiddleQuartileMalePct: number;
    lowerMiddleQuartileFemalePct: number;
    upperMiddleQuartileMalePct: number;
    upperMiddleQuartileFemalePct: number;
    upperQuartileMalePct: number;
    upperQuartileFemalePct: number;
  } {
    if (employees.length === 0) {
      return {
        lowerQuartileMalePct: 0,
        lowerQuartileFemalePct: 0,
        lowerMiddleQuartileMalePct: 0,
        lowerMiddleQuartileFemalePct: 0,
        upperMiddleQuartileMalePct: 0,
        upperMiddleQuartileFemalePct: 0,
        upperQuartileMalePct: 0,
        upperQuartileFemalePct: 0,
      };
    }

    // Sort by hourly rate ascending
    const sorted = [...employees].sort((a, b) => a.hourlyRate - b.hourlyRate);
    const quartileSize = Math.ceil(sorted.length / 4);

    const quartiles = [
      sorted.slice(0, quartileSize),                     // Lower
      sorted.slice(quartileSize, quartileSize * 2),       // Lower middle
      sorted.slice(quartileSize * 2, quartileSize * 3),   // Upper middle
      sorted.slice(quartileSize * 3),                     // Upper
    ];

    const calcPct = (quartile: typeof employees, gender: string): number => {
      if (quartile.length === 0) return 0;
      const count = quartile.filter((e) => e.gender === gender).length;
      return Number(((count / quartile.length) * 100).toFixed(2));
    };

    return {
      lowerQuartileMalePct: calcPct(quartiles[0], "male"),
      lowerQuartileFemalePct: calcPct(quartiles[0], "female"),
      lowerMiddleQuartileMalePct: calcPct(quartiles[1], "male"),
      lowerMiddleQuartileFemalePct: calcPct(quartiles[1], "female"),
      upperMiddleQuartileMalePct: calcPct(quartiles[2], "male"),
      upperMiddleQuartileFemalePct: calcPct(quartiles[2], "female"),
      upperQuartileMalePct: calcPct(quartiles[3], "male"),
      upperQuartileFemalePct: calcPct(quartiles[3], "female"),
    };
  }

  /**
   * Calculate bonus gap metrics from bonus payment data.
   *
   * Metrics:
   *   - Mean bonus gap: ((male_mean_bonus - female_mean_bonus) / male_mean_bonus) * 100
   *   - Median bonus gap: ((male_median_bonus - female_median_bonus) / male_median_bonus) * 100
   *   - Male bonus proportion: % of relevant male employees who received a bonus
   *   - Female bonus proportion: % of relevant female employees who received a bonus
   */
  private calculateBonusMetrics(
    bonusData: EmployeeBonusDataRow[],
    totalMaleEmployees: number,
    totalFemaleEmployees: number
  ): {
    meanBonusGap: number | null;
    medianBonusGap: number | null;
    maleBonusPct: number | null;
    femaleBonusPct: number | null;
  } {
    const maleBonuses = bonusData
      .filter((b) => b.gender === "male")
      .map((b) => Number(b.totalBonus));
    const femaleBonuses = bonusData
      .filter((b) => b.gender === "female")
      .map((b) => Number(b.totalBonus));

    // Proportion receiving bonuses
    const maleBonusPct = totalMaleEmployees > 0
      ? Number(((maleBonuses.length / totalMaleEmployees) * 100).toFixed(2))
      : null;
    const femaleBonusPct = totalFemaleEmployees > 0
      ? Number(((femaleBonuses.length / totalFemaleEmployees) * 100).toFixed(2))
      : null;

    // If no bonuses at all, return null gaps (not zero — zero means equal)
    if (maleBonuses.length === 0 && femaleBonuses.length === 0) {
      return {
        meanBonusGap: null,
        medianBonusGap: null,
        maleBonusPct: maleBonusPct ?? 0,
        femaleBonusPct: femaleBonusPct ?? 0,
      };
    }

    // Mean bonus gap
    const maleMeanBonus = this.mean(maleBonuses);
    const femaleMeanBonus = this.mean(femaleBonuses);
    const meanBonusGap = this.calculateGapPercentage(maleMeanBonus, femaleMeanBonus);

    // Median bonus gap
    const maleSortedBonuses = [...maleBonuses].sort((a, b) => a - b);
    const femaleSortedBonuses = [...femaleBonuses].sort((a, b) => a - b);
    const maleMedianBonus = this.median(maleSortedBonuses);
    const femaleMedianBonus = this.median(femaleSortedBonuses);
    const medianBonusGap = this.calculateGapPercentage(maleMedianBonus, femaleMedianBonus);

    return {
      meanBonusGap,
      medianBonusGap,
      maleBonusPct: maleBonusPct ?? 0,
      femaleBonusPct: femaleBonusPct ?? 0,
    };
  }

  /**
   * Calculate full gender pay gap statistics from employee pay and bonus data.
   * This is the core calculation engine that produces all 6 required metrics.
   */
  private calculatePayGap(
    employees: EmployeePayDataRow[],
    bonusData: EmployeeBonusDataRow[],
    totalAllEmployees: number
  ): PayGapCalculation {
    // Separate by gender
    const maleEmployees = employees.filter((e) => e.gender === "male");
    const femaleEmployees = employees.filter((e) => e.gender === "female");

    // === Metric 1 & 2: Mean and Median hourly pay gap ===

    // Calculate hourly rates for each employee
    const maleHourlyRates = maleEmployees.map((e) =>
      this.calculateHourlyRate(
        Number(e.annualSalary),
        e.workingHoursPerWeek ? Number(e.workingHoursPerWeek) : null
      )
    );
    const femaleHourlyRates = femaleEmployees.map((e) =>
      this.calculateHourlyRate(
        Number(e.annualSalary),
        e.workingHoursPerWeek ? Number(e.workingHoursPerWeek) : null
      )
    );

    // Mean hourly pay gap
    const maleMeanHourly = this.mean(maleHourlyRates);
    const femaleMeanHourly = this.mean(femaleHourlyRates);
    const meanHourlyPayGap = this.calculateGapPercentage(maleMeanHourly, femaleMeanHourly);

    // Median hourly pay gap
    const maleSortedHourly = [...maleHourlyRates].sort((a, b) => a - b);
    const femaleSortedHourly = [...femaleHourlyRates].sort((a, b) => a - b);
    const maleMedianHourly = this.median(maleSortedHourly);
    const femaleMedianHourly = this.median(femaleSortedHourly);
    const medianHourlyPayGap = this.calculateGapPercentage(maleMedianHourly, femaleMedianHourly);

    // === Metrics 3, 4, 5: Bonus gap and bonus proportions ===
    const bonusMetrics = this.calculateBonusMetrics(
      bonusData,
      maleEmployees.length,
      femaleEmployees.length
    );

    // === Metric 6: Pay quartile distributions ===
    const allWithHourly = employees.map((e) => ({
      gender: e.gender,
      hourlyRate: this.calculateHourlyRate(
        Number(e.annualSalary),
        e.workingHoursPerWeek ? Number(e.workingHoursPerWeek) : null
      ),
    }));
    const quartiles = this.calculateQuartiles(allWithHourly);

    return {
      totalEmployees: totalAllEmployees,
      maleCount: maleEmployees.length,
      femaleCount: femaleEmployees.length,
      meanHourlyPayGap,
      medianHourlyPayGap,
      ...bonusMetrics,
      ...quartiles,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Calculate gender pay gap for a given snapshot date.
   *
   * If a report already exists for the reporting year and is still in draft/calculated
   * status, it will be recalculated (overwritten). Published reports cannot be recalculated.
   *
   * Fetches employee ordinary pay data and bonus payment data, then computes
   * all 6 required GPG metrics.
   */
  async calculateReport(
    context: TenantContext,
    data: CalculateGpg,
    _idempotencyKey?: string
  ): Promise<ServiceResult<GpgReportResponse>> {
    // Check for existing report for this year
    const existing = await this.repository.findByReportingYear(
      context,
      data.reporting_year
    );

    if (existing && existing.status === "published") {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "A published report already exists for this reporting year. Published reports cannot be recalculated.",
          details: {
            reporting_year: data.reporting_year,
            existing_report_id: existing.id,
          },
        },
      };
    }

    // Fetch employee ordinary pay data as of the snapshot date
    const employeePayData = await this.repository.getEmployeePayData(
      context,
      data.snapshot_date
    );

    // Fetch bonus payment data for the 12-month reference period
    const bonusData = await this.repository.getEmployeeBonusData(
      context,
      data.snapshot_date
    );

    // Get total employee count (all genders)
    const totalAllEmployees = await this.repository.getTotalEmployeeCount(
      context,
      data.snapshot_date
    );

    // Validate minimum population
    if (employeePayData.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "No employees with gender and compensation data found for the snapshot date. Cannot calculate pay gap.",
          details: {
            snapshot_date: data.snapshot_date,
            total_employees_found: totalAllEmployees,
          },
        },
      };
    }

    // Calculate all 6 GPG metrics
    const calculation = this.calculatePayGap(employeePayData, bonusData, totalAllEmployees);

    // Create or update report in transaction with outbox event
    const report = await this.db.withTransaction(context, async (tx) => {
      let result: GpgReportRow;

      if (existing) {
        // Recalculate existing draft/calculated report
        result = await this.repository.updateReport(tx, context, existing.id, {
          ...calculation,
          status: "calculated",
          calculatedBy: context.userId || null,
          notes: data.notes !== undefined ? data.notes || null : undefined,
        });

        await this.emitEvent(
          tx,
          context,
          result.id,
          "gpg.report.recalculated",
          {
            reportId: result.id,
            reportingYear: data.reporting_year,
            snapshotDate: data.snapshot_date,
            totalEmployees: calculation.totalEmployees,
            maleCount: calculation.maleCount,
            femaleCount: calculation.femaleCount,
            meanHourlyPayGap: calculation.meanHourlyPayGap,
            medianHourlyPayGap: calculation.medianHourlyPayGap,
            meanBonusGap: calculation.meanBonusGap,
            medianBonusGap: calculation.medianBonusGap,
          }
        );
      } else {
        // Create new report
        result = await this.repository.createReport(tx, context, {
          snapshotDate: data.snapshot_date,
          reportingYear: data.reporting_year,
          ...calculation,
          status: "calculated",
          calculatedBy: context.userId || null,
          notes: data.notes || null,
        });

        await this.emitEvent(
          tx,
          context,
          result.id,
          "gpg.report.calculated",
          {
            reportId: result.id,
            reportingYear: data.reporting_year,
            snapshotDate: data.snapshot_date,
            totalEmployees: calculation.totalEmployees,
            maleCount: calculation.maleCount,
            femaleCount: calculation.femaleCount,
            meanHourlyPayGap: calculation.meanHourlyPayGap,
            medianHourlyPayGap: calculation.medianHourlyPayGap,
            meanBonusGap: calculation.meanBonusGap,
            medianBonusGap: calculation.medianBonusGap,
          }
        );
      }

      return result;
    });

    return {
      success: true,
      data: this.mapReportToResponse(report),
    };
  }

  /**
   * Generate a full GPG report for a given year.
   *
   * Automatically determines the snapshot date based on sector:
   *   - Private sector: 5 April
   *   - Public sector: 31 March
   *
   * This is the convenience wrapper around calculateReport.
   */
  async generateReport(
    context: TenantContext,
    data: GenerateReport,
    _idempotencyKey?: string
  ): Promise<ServiceResult<GpgReportResponse>> {
    const sector = data.sector || "private";
    const snapshotDate = GenderPayGapService.getSnapshotDate(data.reporting_year, sector);

    return this.calculateReport(
      context,
      {
        snapshot_date: snapshotDate,
        reporting_year: data.reporting_year,
        notes: data.notes,
      },
      _idempotencyKey
    );
  }

  /**
   * Get a single report by ID.
   */
  async getReport(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<GpgReportResponse>> {
    const report = await this.repository.findById(context, id);

    if (!report) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Gender pay gap report not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapReportToResponse(report),
    };
  }

  /**
   * List reports with pagination and optional filters.
   */
  async listReports(
    context: TenantContext,
    filters: GpgReportFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<GpgReportListItem>> {
    const result = await this.repository.listReports(context, filters, pagination);

    return {
      items: result.items.map((row) => this.mapReportToListItem(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get historical reports for trend analysis.
   * Returns all reports (any status) ordered by reporting year ascending.
   */
  async getHistoricalReports(
    context: TenantContext
  ): Promise<PaginatedServiceResult<GpgReportListItem>> {
    // Use list with no filters and high limit to get all for trends
    const result = await this.repository.listReports(
      context,
      {},
      { limit: 100 }
    );

    return {
      items: result.items.map((row) => this.mapReportToListItem(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Publish a calculated report.
   *
   * Only reports in "calculated" status can be published.
   * Once published, the report cannot be modified or recalculated.
   *
   * Snapshot date: 5 April for private sector, 31 March for public sector.
   */
  async publishReport(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<GpgReportResponse>> {
    const existing = await this.repository.findById(context, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Gender pay gap report not found",
          details: { id },
        },
      };
    }

    if (existing.status === "published") {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Report is already published",
          details: { id, status: existing.status },
        },
      };
    }

    if (existing.status === "draft") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Cannot publish a draft report. Calculate the report first.",
          details: { id, currentStatus: existing.status, requiredStatus: "calculated" },
        },
      };
    }

    // Publish in transaction with outbox event
    const report = await this.db.withTransaction(context, async (tx) => {
      const result = await this.repository.publishReport(tx, context, id);

      await this.emitEvent(
        tx,
        context,
        result.id,
        "gpg.report.published",
        {
          reportId: result.id,
          reportingYear: result.reportingYear,
          snapshotDate: result.snapshotDate instanceof Date
            ? result.snapshotDate.toISOString().split("T")[0]
            : String(result.snapshotDate),
          meanHourlyPayGap: result.meanHourlyPayGap,
          medianHourlyPayGap: result.medianHourlyPayGap,
          meanBonusGap: result.meanBonusGap,
          medianBonusGap: result.medianBonusGap,
          publishedAt: result.publishedAt,
        }
      );

      return result;
    });

    return {
      success: true,
      data: this.mapReportToResponse(report),
    };
  }

  /**
   * Get dashboard summary with trends across reporting years.
   *
   * Returns:
   *   - Latest report (if any)
   *   - Report counts (total, published)
   *   - Year-over-year trend data for key metrics
   *   - Whether the organisation meets the 250+ reporting threshold
   *   - Current employee count
   */
  async getDashboard(
    context: TenantContext
  ): Promise<ServiceResult<GpgDashboardResponse>> {
    // Fetch data in parallel where possible
    const [latestReport, counts, trendData, currentEmployeeCount] = await Promise.all([
      this.repository.getLatestReport(context),
      this.repository.getReportCounts(context),
      this.repository.getAllReportsForTrends(context),
      this.repository.getCurrentEmployeeCount(context),
    ]);

    // Build trend arrays from historical data
    const meanPayGapTrend = trendData.map((r) => ({
      reporting_year: r.reportingYear,
      value: r.meanHourlyPayGap !== null ? Number(r.meanHourlyPayGap) : null,
    }));

    const medianPayGapTrend = trendData.map((r) => ({
      reporting_year: r.reportingYear,
      value: r.medianHourlyPayGap !== null ? Number(r.medianHourlyPayGap) : null,
    }));

    const meanBonusGapTrend = trendData.map((r) => ({
      reporting_year: r.reportingYear,
      value: r.meanBonusGap !== null ? Number(r.meanBonusGap) : null,
    }));

    const medianBonusGapTrend = trendData.map((r) => ({
      reporting_year: r.reportingYear,
      value: r.medianBonusGap !== null ? Number(r.medianBonusGap) : null,
    }));

    const upperQuartileFemaleTrend = trendData.map((r) => ({
      reporting_year: r.reportingYear,
      value: r.upperQuartileFemalePct !== null ? Number(r.upperQuartileFemalePct) : null,
    }));

    const dashboard: GpgDashboardResponse = {
      latest_report: latestReport ? this.mapReportToResponse(latestReport) : null,
      total_reports: counts.totalReports,
      published_reports: counts.publishedReports,
      mean_pay_gap_trend: meanPayGapTrend,
      median_pay_gap_trend: medianPayGapTrend,
      mean_bonus_gap_trend: meanBonusGapTrend,
      median_bonus_gap_trend: medianBonusGapTrend,
      upper_quartile_female_trend: upperQuartileFemaleTrend,
      meets_reporting_threshold: currentEmployeeCount >= REPORTING_THRESHOLD,
      current_employee_count: currentEmployeeCount,
    };

    return {
      success: true,
      data: dashboard,
    };
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  /**
   * Map database row to full API response
   */
  private mapReportToResponse(row: GpgReportRow): GpgReportResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      snapshot_date: row.snapshotDate instanceof Date
        ? row.snapshotDate.toISOString().split("T")[0]
        : String(row.snapshotDate),
      reporting_year: row.reportingYear,
      total_employees: row.totalEmployees,
      male_count: row.maleCount,
      female_count: row.femaleCount,
      mean_hourly_pay_gap: row.meanHourlyPayGap !== null ? Number(row.meanHourlyPayGap) : null,
      median_hourly_pay_gap: row.medianHourlyPayGap !== null ? Number(row.medianHourlyPayGap) : null,
      mean_bonus_gap: row.meanBonusGap !== null ? Number(row.meanBonusGap) : null,
      median_bonus_gap: row.medianBonusGap !== null ? Number(row.medianBonusGap) : null,
      male_bonus_pct: row.maleBonusPct !== null ? Number(row.maleBonusPct) : null,
      female_bonus_pct: row.femaleBonusPct !== null ? Number(row.femaleBonusPct) : null,
      lower_quartile_male_pct: row.lowerQuartileMalePct !== null ? Number(row.lowerQuartileMalePct) : null,
      lower_quartile_female_pct: row.lowerQuartileFemalePct !== null ? Number(row.lowerQuartileFemalePct) : null,
      lower_middle_quartile_male_pct: row.lowerMiddleQuartileMalePct !== null ? Number(row.lowerMiddleQuartileMalePct) : null,
      lower_middle_quartile_female_pct: row.lowerMiddleQuartileFemalePct !== null ? Number(row.lowerMiddleQuartileFemalePct) : null,
      upper_middle_quartile_male_pct: row.upperMiddleQuartileMalePct !== null ? Number(row.upperMiddleQuartileMalePct) : null,
      upper_middle_quartile_female_pct: row.upperMiddleQuartileFemalePct !== null ? Number(row.upperMiddleQuartileFemalePct) : null,
      upper_quartile_male_pct: row.upperQuartileMalePct !== null ? Number(row.upperQuartileMalePct) : null,
      upper_quartile_female_pct: row.upperQuartileFemalePct !== null ? Number(row.upperQuartileFemalePct) : null,
      status: row.status,
      published_at: row.publishedAt instanceof Date
        ? row.publishedAt.toISOString()
        : row.publishedAt,
      calculated_by: row.calculatedBy,
      notes: row.notes,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  /**
   * Map database row to list item response (summary view with bonus gap included)
   */
  private mapReportToListItem(row: GpgReportRow): GpgReportListItem {
    return {
      id: row.id,
      snapshot_date: row.snapshotDate instanceof Date
        ? row.snapshotDate.toISOString().split("T")[0]
        : String(row.snapshotDate),
      reporting_year: row.reportingYear,
      total_employees: row.totalEmployees,
      male_count: row.maleCount,
      female_count: row.femaleCount,
      mean_hourly_pay_gap: row.meanHourlyPayGap !== null ? Number(row.meanHourlyPayGap) : null,
      median_hourly_pay_gap: row.medianHourlyPayGap !== null ? Number(row.medianHourlyPayGap) : null,
      mean_bonus_gap: row.meanBonusGap !== null ? Number(row.meanBonusGap) : null,
      median_bonus_gap: row.medianBonusGap !== null ? Number(row.medianBonusGap) : null,
      status: row.status,
      published_at: row.publishedAt instanceof Date
        ? row.publishedAt.toISOString()
        : row.publishedAt,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }
}
