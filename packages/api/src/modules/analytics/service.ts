/**
 * Analytics Module - Service Layer
 *
 * Implements business logic for analytics and reporting.
 * Provides caching and optimization for expensive queries.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { AnalyticsRepository, TenantContext } from "./repository";
import type {
  HeadcountFilters,
  TurnoverFilters,
  AttendanceFilters,
  LeaveFilters,
  RecruitmentFilters,
  DiversityFilters,
  CompensationFilters,
  WorkforcePlanningFilters,
  WorkforceAnalyticsFilters,
  HeadcountSummary,
  HeadcountByDepartment,
  HeadcountTrend,
  TurnoverSummary,
  TurnoverByDepartment,
  TurnoverByReason,
  AttendanceSummary,
  LeaveSummary,
  LeaveByType,
  RecruitmentSummary,
  ExecutiveDashboard,
  ManagerDashboard,
  DiversityDashboard,
  DiversityAnalyticsFilters,
  DiversityOverview,
  DiversityByDepartmentResponse,
  DiversityByGradeResponse,
  DiversityTrendsResponse,
  CharacteristicBreakdownItem,
  CompensationDashboard,
  WorkforcePlanningDashboard,
  HeadcountProjection,
  RetirementProjection,
  AttritionForecast,
  SkillsGapAnalysis,
  WorkforceHeadcountTrendsResponse,
  WorkforceTurnoverRateResponse,
  WorkforceRetirementProjectionResponse,
  WorkforceTenureDistributionResponse,
  WorkforceVacancyRateResponse,
  WorkforceSummaryResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

import type { ServiceResult } from "../../types/service-result";

// =============================================================================
// Service
// =============================================================================

export class AnalyticsService {
  constructor(
    private repository: AnalyticsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Headcount Analytics
  // ===========================================================================

  async getHeadcountSummary(
    context: TenantContext,
    filters: HeadcountFilters = {}
  ): Promise<ServiceResult<HeadcountSummary>> {
    const data = await this.repository.getHeadcountSummary(context, filters);

    return {
      success: true,
      data: {
        total_employees: Number(data.total_employees) || 0,
        active_employees: Number(data.active_employees) || 0,
        on_leave_employees: Number(data.on_leave_employees) || 0,
        pending_employees: Number(data.pending_employees) || 0,
        terminated_employees: Number(data.terminated_employees) || 0,
        as_of_date: data.as_of_date,
      },
    };
  }

  async getHeadcountByDepartment(
    context: TenantContext,
    filters: HeadcountFilters = {}
  ): Promise<ServiceResult<HeadcountByDepartment[]>> {
    const data = await this.repository.getHeadcountByDepartment(context, filters);

    const total = data.reduce((sum, d) => sum + Number(d.headcount), 0);

    return {
      success: true,
      data: data.map((d) => ({
        org_unit_id: d.org_unit_id,
        org_unit_name: d.org_unit_name,
        headcount: Number(d.headcount) || 0,
        percentage: total > 0 ? Math.round((Number(d.headcount) / total) * 100 * 10) / 10 : 0,
      })),
    };
  }

  async getHeadcountTrend(
    context: TenantContext,
    startDate: string,
    endDate: string,
    period: string = "month"
  ): Promise<ServiceResult<HeadcountTrend[]>> {
    const data = await this.repository.getHeadcountTrend(
      context,
      startDate,
      endDate,
      period
    );

    return {
      success: true,
      data: data.map((d) => ({
        period: d.period,
        headcount: Number(d.headcount) || 0,
        new_hires: Number(d.new_hires) || 0,
        terminations: Number(d.terminations) || 0,
        net_change: Number(d.net_change) || 0,
      })),
    };
  }

  // ===========================================================================
  // Turnover Analytics
  // ===========================================================================

  async getTurnoverSummary(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<ServiceResult<TurnoverSummary>> {
    const data = await this.repository.getTurnoverSummary(context, filters);

    return {
      success: true,
      data: {
        total_terminations: Number(data.total_terminations) || 0,
        voluntary_terminations: Number(data.voluntary_terminations) || 0,
        involuntary_terminations: Number(data.involuntary_terminations) || 0,
        turnover_rate: Number(data.turnover_rate) || 0,
        avg_tenure_months: Number(data.avg_tenure_months) || 0,
        period: data.period,
      },
    };
  }

  async getTurnoverByDepartment(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<ServiceResult<TurnoverByDepartment[]>> {
    const data = await this.repository.getTurnoverByDepartment(context, filters);

    return {
      success: true,
      data: data.map((d) => ({
        org_unit_id: d.org_unit_id,
        org_unit_name: d.org_unit_name,
        terminations: Number(d.terminations) || 0,
        turnover_rate: Number(d.turnover_rate) || 0,
      })),
    };
  }

  async getTurnoverByReason(
    context: TenantContext,
    filters: TurnoverFilters
  ): Promise<ServiceResult<TurnoverByReason[]>> {
    const data = await this.repository.getTurnoverByReason(context, filters);

    const total = data.reduce((sum, d) => sum + Number(d.count), 0);

    return {
      success: true,
      data: data.map((d) => ({
        reason: d.reason,
        count: Number(d.count) || 0,
        percentage: total > 0 ? Math.round((Number(d.count) / total) * 100 * 10) / 10 : 0,
      })),
    };
  }

  // ===========================================================================
  // Attendance Analytics
  // ===========================================================================

  async getAttendanceSummary(
    context: TenantContext,
    filters: AttendanceFilters
  ): Promise<ServiceResult<AttendanceSummary>> {
    const data = await this.repository.getAttendanceSummary(context, filters);

    return {
      success: true,
      data,
    };
  }

  // ===========================================================================
  // Leave Analytics
  // ===========================================================================

  async getLeaveSummary(
    context: TenantContext,
    filters: LeaveFilters
  ): Promise<ServiceResult<LeaveSummary>> {
    const data = await this.repository.getLeaveSummary(context, filters);

    return {
      success: true,
      data: {
        total_requests: Number(data.total_requests) || 0,
        approved_requests: Number(data.approved_requests) || 0,
        pending_requests: Number(data.pending_requests) || 0,
        rejected_requests: Number(data.rejected_requests) || 0,
        total_days_taken: Number(data.total_days_taken) || 0,
        avg_days_per_request: Number(data.avg_days_per_request) || 0,
        period: data.period,
      },
    };
  }

  async getLeaveByType(
    context: TenantContext,
    filters: LeaveFilters
  ): Promise<ServiceResult<LeaveByType[]>> {
    const data = await this.repository.getLeaveByType(context, filters);

    const total = data.reduce((sum, d) => sum + Number(d.days_taken), 0);

    return {
      success: true,
      data: data.map((d) => ({
        leave_type_id: d.leave_type_id,
        leave_type_name: d.leave_type_name,
        requests_count: Number(d.requests_count) || 0,
        days_taken: Number(d.days_taken) || 0,
        percentage: total > 0 ? Math.round((Number(d.days_taken) / total) * 100 * 10) / 10 : 0,
      })),
    };
  }

  // ===========================================================================
  // Recruitment Analytics
  // ===========================================================================

  async getRecruitmentSummary(
    context: TenantContext,
    filters: RecruitmentFilters
  ): Promise<ServiceResult<RecruitmentSummary>> {
    const data = await this.repository.getRecruitmentSummary(context, filters);

    return {
      success: true,
      data,
    };
  }

  // ===========================================================================
  // Dashboard Aggregations
  // ===========================================================================

  async getExecutiveDashboard(
    context: TenantContext
  ): Promise<ServiceResult<ExecutiveDashboard>> {
    const data = await this.repository.getExecutiveDashboard(context);

    return {
      success: true,
      data,
    };
  }

  async getManagerDashboard(
    context: TenantContext
  ): Promise<ServiceResult<ManagerDashboard>> {
    const data = await this.repository.getManagerDashboard(context);

    return {
      success: true,
      data,
    };
  }

  // ===========================================================================
  // Diversity Analytics
  // ===========================================================================

  /**
   * Minimum group size threshold for diversity data.
   * Groups with fewer than this number of members are suppressed
   * to prevent re-identification of individuals (Equality Act 2010 data protection).
   */
  private static readonly MIN_THRESHOLD = 5;

  /**
   * Apply minimum threshold: filter out groups where count < MIN_THRESHOLD
   * to prevent re-identification of individuals in small groups.
   */
  private applyThreshold<T extends { count: number }>(
    items: T[]
  ): T[] {
    return items.filter((item) => item.count >= AnalyticsService.MIN_THRESHOLD);
  }

  async getDiversityDashboard(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<ServiceResult<DiversityDashboard>> {
    const [
      genderRows,
      ageBandRows,
      nationalityRows,
      ethnicityRows,
      disabilityRows,
      deptRows,
      hiringTrends,
      leavingTrends,
      completionRate,
      payGapSummary,
    ] = await Promise.all([
      this.repository.getDiversityByGender(context, filters),
      this.repository.getDiversityByAgeBand(context, filters),
      this.repository.getDiversityByNationality(context, filters),
      this.repository.getDiversityByEthnicity(context, filters),
      this.repository.getDiversityByDisability(context, filters),
      this.repository.getDiversityByDepartment(context, filters),
      this.repository.getDiversityHiringTrends(context, filters),
      this.repository.getDiversityLeavingTrends(context, filters),
      this.repository.getDiversityCompletionRate(context),
      this.repository.getGenderPayGapSummary(context, filters),
    ]);

    const totalFromGender = genderRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const totalFromAge = ageBandRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const totalFromNat = nationalityRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const total = totalFromGender || totalFromAge || totalFromNat || 0;

    // Map and apply minimum threshold to all breakdowns
    const byGender = this.applyThreshold(
      genderRows.map((r: any) => ({
        gender: r.gender,
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
      }))
    );

    const byAgeBand = this.applyThreshold(
      ageBandRows.map((r: any) => ({
        age_band: r.ageBand ?? r.age_band,
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
      }))
    );

    const byNationality = this.applyThreshold(
      nationalityRows.map((r: any) => ({
        nationality: r.nationality,
        count: Number(r.count),
        percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
      }))
    );

    const ethnicityTotal = ethnicityRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const byEthnicity = this.applyThreshold(
      ethnicityRows.map((r: any) => ({
        ethnicity: r.ethnicity,
        count: Number(r.count),
        percentage: ethnicityTotal > 0 ? Math.round((Number(r.count) / ethnicityTotal) * 1000) / 10 : 0,
      }))
    );

    const disabilityTotal = disabilityRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const byDisability = this.applyThreshold(
      disabilityRows.map((r: any) => ({
        disability_status: r.disabilityStatus ?? r.disability_status,
        count: Number(r.count),
        percentage: disabilityTotal > 0 ? Math.round((Number(r.count) / disabilityTotal) * 1000) / 10 : 0,
      }))
    );

    // Group department rows by org_unit
    const deptMap = new Map<string, { org_unit_id: string; org_unit_name: string; total: number; genders: Map<string, number> }>();
    for (const r of deptRows) {
      const id = r.orgUnitId ?? r.org_unit_id ?? "unassigned";
      const name = r.orgUnitName ?? r.org_unit_name ?? "Unassigned";
      if (!deptMap.has(id)) {
        deptMap.set(id, { org_unit_id: id, org_unit_name: name, total: 0, genders: new Map() });
      }
      const dept = deptMap.get(id)!;
      const count = Number(r.count);
      const gender = r.gender ?? "not_specified";
      dept.total += count;
      dept.genders.set(gender, (dept.genders.get(gender) || 0) + count);
    }

    // Apply threshold to department breakdowns
    const byDepartment = Array.from(deptMap.values())
      .filter((dept) => dept.total >= AnalyticsService.MIN_THRESHOLD)
      .map((dept) => ({
        org_unit_id: dept.org_unit_id,
        org_unit_name: dept.org_unit_name,
        total: dept.total,
        gender_breakdown: Array.from(dept.genders.entries())
          .filter(([, count]) => count >= AnalyticsService.MIN_THRESHOLD)
          .map(([gender, count]) => ({
            gender,
            count,
            percentage: dept.total > 0 ? Math.round((count / dept.total) * 1000) / 10 : 0,
          })),
      }));

    // Map hiring trends (apply threshold per period+value group)
    const mappedHiringTrends = hiringTrends
      .filter((r: any) => Number(r.hires) >= AnalyticsService.MIN_THRESHOLD)
      .map((r: any) => ({
        period: r.period,
        characteristic: r.characteristic ?? "gender",
        value: r.value,
        hires: Number(r.hires) || 0,
        leavers: 0,
      }));

    // Map leaving trends (apply threshold per period+value group)
    const mappedLeavingTrends = leavingTrends
      .filter((r: any) => Number(r.leavers) >= AnalyticsService.MIN_THRESHOLD)
      .map((r: any) => ({
        period: r.period,
        characteristic: r.characteristic ?? "gender",
        value: r.value,
        hires: 0,
        leavers: Number(r.leavers) || 0,
      }));

    return {
      success: true,
      data: {
        total_employees: total,
        by_gender: byGender,
        by_age_band: byAgeBand,
        by_nationality: byNationality,
        by_ethnicity: byEthnicity,
        by_disability: byDisability,
        by_department: byDepartment,
        hiring_trends: mappedHiringTrends,
        leaving_trends: mappedLeavingTrends,
        diversity_completion: {
          total_employees: completionRate.totalEmployees,
          total_submissions: completionRate.totalSubmissions,
          completion_rate: completionRate.completionRate,
        },
        gender_pay_gap_summary: payGapSummary,
        minimum_threshold: AnalyticsService.MIN_THRESHOLD,
        as_of_date: filters.as_of_date || new Date().toISOString().split("T")[0]!,
      },
    };
  }

  // ===========================================================================
  // Compensation Analytics
  // ===========================================================================

  async getCompensationDashboard(
    context: TenantContext,
    filters: CompensationFilters = {}
  ): Promise<ServiceResult<CompensationDashboard>> {
    const [summary, bandRows, deptRows, changeRows, compaRows, equityByGrade, equityOverall] =
      await Promise.all([
        this.repository.getCompensationSummary(context, filters),
        this.repository.getCompensationByBand(context, filters),
        this.repository.getCompensationByDepartment(context, filters),
        this.repository.getRecentCompensationChanges(context, filters),
        this.repository.getCompaRatioByGrade(context, filters),
        this.repository.getPayEquityByGrade(context, filters),
        this.repository.getPayEquityOverall(context, filters),
      ]);

    const totalBand = bandRows.reduce((s: number, r: any) => s + Number(r.count), 0);

    const byBand = bandRows.map((r: any) => ({
      band: r.band,
      count: Number(r.count),
      percentage: totalBand > 0 ? Math.round((Number(r.count) / totalBand) * 1000) / 10 : 0,
      avg_salary: Number(r.avg_salary ?? r.avgSalary) || 0,
    }));

    const byDepartment = deptRows.map((r: any) => ({
      org_unit_id: r.org_unit_id ?? r.orgUnitId ?? "unassigned",
      org_unit_name: r.org_unit_name ?? r.orgUnitName ?? "Unassigned",
      headcount: Number(r.headcount) || 0,
      avg_salary: Number(r.avg_salary ?? r.avgSalary) || 0,
      median_salary: Number(r.median_salary ?? r.medianSalary) || 0,
      min_salary: Number(r.min_salary ?? r.minSalary) || 0,
      max_salary: Number(r.max_salary ?? r.maxSalary) || 0,
      total_payroll: Number(r.total_payroll ?? r.totalPayroll) || 0,
    }));

    const recentChanges = changeRows.map((r: any) => ({
      change_reason: r.change_reason ?? r.changeReason ?? "unspecified",
      count: Number(r.count) || 0,
      avg_change_percentage: Number(r.avg_change_percentage ?? r.avgChangePercentage) || 0,
    }));

    // Build compa-ratio summary
    const byGradeCompa = compaRows.map((r: any) => ({
      job_grade: r.job_grade ?? r.jobGrade,
      headcount: Number(r.headcount) || 0,
      range_min: Number(r.range_min ?? r.rangeMin) || 0,
      range_max: Number(r.range_max ?? r.rangeMax) || 0,
      range_midpoint: Number(r.range_midpoint ?? r.rangeMidpoint) || 0,
      avg_salary: Number(r.avg_salary ?? r.avgSalary) || 0,
      avg_compa_ratio: Number(r.avg_compa_ratio ?? r.avgCompaRatio) || 0,
      below_range_count: Number(r.below_range_count ?? r.belowRangeCount) || 0,
      within_range_count: Number(r.within_range_count ?? r.withinRangeCount) || 0,
      above_range_count: Number(r.above_range_count ?? r.aboveRangeCount) || 0,
    }));

    const totalWithRange = byGradeCompa.reduce((s, r) => s + r.headcount, 0);
    const totalBelow = byGradeCompa.reduce((s, r) => s + r.below_range_count, 0);
    const totalWithin = byGradeCompa.reduce((s, r) => s + r.within_range_count, 0);
    const totalAbove = byGradeCompa.reduce((s, r) => s + r.above_range_count, 0);

    const weightedCompaSum = byGradeCompa.reduce(
      (s, r) => s + r.avg_compa_ratio * r.headcount, 0
    );
    const overallCompaRatio = totalWithRange > 0
      ? Number((weightedCompaSum / totalWithRange).toFixed(4))
      : 0;

    const compaRatio = {
      overall_avg_compa_ratio: overallCompaRatio,
      total_employees_with_range: totalWithRange,
      total_below_range: totalBelow,
      total_within_range: totalWithin,
      total_above_range: totalAbove,
      by_grade: byGradeCompa,
    };

    // Build pay equity summary
    const byLevel = equityByGrade.map((r: any) => ({
      job_grade: r.job_grade ?? r.jobGrade ?? "Ungraded",
      male_count: Number(r.male_count ?? r.maleCount) || 0,
      female_count: Number(r.female_count ?? r.femaleCount) || 0,
      male_avg_salary: Number(r.male_avg_salary ?? r.maleAvgSalary) || 0,
      female_avg_salary: Number(r.female_avg_salary ?? r.femaleAvgSalary) || 0,
      pay_gap_percentage: r.pay_gap_percentage != null
        ? Number(r.pay_gap_percentage ?? r.payGapPercentage)
        : null,
      male_median_salary: Number(r.male_median_salary ?? r.maleMedianSalary) || 0,
      female_median_salary: Number(r.female_median_salary ?? r.femaleMedianSalary) || 0,
      median_pay_gap_percentage: r.median_pay_gap_percentage != null
        ? Number(r.median_pay_gap_percentage ?? r.medianPayGapPercentage)
        : null,
    }));

    const payEquity = {
      total_male: Number(equityOverall.total_male) || 0,
      total_female: Number(equityOverall.total_female) || 0,
      overall_male_avg_salary: Number(equityOverall.overall_male_avg_salary) || 0,
      overall_female_avg_salary: Number(equityOverall.overall_female_avg_salary) || 0,
      overall_mean_pay_gap_percentage: equityOverall.overall_mean_pay_gap_percentage ?? null,
      overall_median_pay_gap_percentage: equityOverall.overall_median_pay_gap_percentage ?? null,
      by_level: byLevel,
    };

    return {
      success: true,
      data: {
        summary,
        by_band: byBand,
        by_department: byDepartment,
        recent_changes: recentChanges,
        compa_ratio: compaRatio,
        pay_equity: payEquity,
      },
    };
  }

  // ===========================================================================
  // Workforce Planning Analytics
  // ===========================================================================

  /**
   * Parse a horizon string like "12m", "24m", "3y" into months.
   * Defaults to 12 months if missing or invalid.
   */
  private parseHorizonMonths(horizon?: string): number {
    if (!horizon) return 12;

    const match = horizon.match(/^(\d+)(m|y)$/);
    if (!match) return 12;

    const value = parseInt(match[1]!, 10);
    const unit = match[2];

    if (unit === "y") return value * 12;
    return value;
  }

  /**
   * Build headcount projections based on observed monthly growth rate.
   * Uses the trailing historical data to compute average monthly net change,
   * then projects forward for the requested horizon.
   */
  private buildHeadcountProjection(
    currentHeadcount: number,
    history: Array<{ period: string; hires: number; terminations: number; endHeadcount: number }>,
    horizonMonths: number
  ): HeadcountProjection {
    // Calculate monthly growth rate from history
    // Use only months that have meaningful data (exclude the most recent partial month)
    const completedMonths = history.slice(0, -1); // drop current (potentially partial) month
    const observationMonths = completedMonths.length;

    let monthlyGrowthRate = 0;
    if (observationMonths >= 2) {
      const firstHeadcount = completedMonths[0]?.endHeadcount || 0;
      const lastHeadcount = completedMonths[completedMonths.length - 1]?.endHeadcount || 0;

      if (firstHeadcount > 0) {
        // Compound monthly growth rate: (last/first)^(1/n) - 1
        monthlyGrowthRate =
          Math.pow(lastHeadcount / firstHeadcount, 1 / (observationMonths - 1)) - 1;
      }
    }

    // Average monthly hires and terminations for projection
    const totalHires = completedMonths.reduce((s, m) => s + m.hires, 0);
    const totalTerminations = completedMonths.reduce((s, m) => s + m.terminations, 0);
    const avgMonthlyHires = observationMonths > 0 ? totalHires / observationMonths : 0;
    const avgMonthlyTerminations =
      observationMonths > 0 ? totalTerminations / observationMonths : 0;

    // Build projection points
    const projections = [];
    let runningHeadcount = currentHeadcount;

    const today = new Date();
    for (let i = 1; i <= horizonMonths; i++) {
      const projDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const periodStr = projDate.toISOString().split("T")[0]!;

      const projectedHires = Math.round(avgMonthlyHires);
      const projectedTerminations = Math.round(avgMonthlyTerminations);
      const netChange = projectedHires - projectedTerminations;
      runningHeadcount = Math.max(0, runningHeadcount + netChange);

      projections.push({
        period: periodStr,
        projected_headcount: runningHeadcount,
        projected_hires: projectedHires,
        projected_terminations: projectedTerminations,
        net_change: netChange,
      });
    }

    return {
      current_headcount: currentHeadcount,
      monthly_growth_rate: Number(monthlyGrowthRate.toFixed(4)),
      observation_months: observationMonths,
      projections,
    };
  }

  /**
   * Build retirement projection by bucketing employees into risk bands.
   */
  private buildRetirementProjection(
    totalActive: number,
    employeesWithDob: number,
    retirementData: Array<{
      employeeId: string;
      dateOfBirth: string;
      yearsToRetirement: number;
      orgUnitId: string | null;
      orgUnitName: string | null;
    }>
  ): RetirementProjection {
    // Define risk bands
    const bands: Array<{
      label: string;
      minYears: number;
      maxYears: number;
      employees: typeof retirementData;
    }> = [
      { label: "0-2 years", minYears: 0, maxYears: 2, employees: [] },
      { label: "3-5 years", minYears: 2, maxYears: 5, employees: [] },
      { label: "6-10 years", minYears: 5, maxYears: 10, employees: [] },
      { label: "11-15 years", minYears: 10, maxYears: 15, employees: [] },
      { label: "16-20 years", minYears: 15, maxYears: 20, employees: [] },
    ];

    // Bucket employees
    for (const emp of retirementData) {
      for (const band of bands) {
        if (emp.yearsToRetirement >= band.minYears && emp.yearsToRetirement < band.maxYears) {
          band.employees.push(emp);
          break;
        }
      }
    }

    const riskBands = bands
      .filter((b) => b.employees.length > 0)
      .map((band) => {
        // Aggregate departments within this band
        const deptMap = new Map<
          string,
          { org_unit_id: string; org_unit_name: string; count: number }
        >();
        for (const emp of band.employees) {
          const id = emp.orgUnitId || "unassigned";
          const name = emp.orgUnitName || "Unassigned";
          if (!deptMap.has(id)) {
            deptMap.set(id, { org_unit_id: id, org_unit_name: name, count: 0 });
          }
          deptMap.get(id)!.count++;
        }

        return {
          years_to_retirement: band.label,
          employee_count: band.employees.length,
          percentage:
            totalActive > 0
              ? Number(((band.employees.length / totalActive) * 100).toFixed(1))
              : 0,
          departments: Array.from(deptMap.values()).sort((a, b) => b.count - a.count),
        };
      });

    return {
      total_active_employees: totalActive,
      employees_with_dob: employeesWithDob,
      state_pension_age_note:
        "UK State Pension age: 66 (born before 6 Apr 1960), 67 (6 Apr 1960 - 5 Mar 1961), 68 (after 5 Mar 1961). " +
        "Employees within the planning horizon whose estimated pension date falls within range are included.",
      risk_bands: riskBands,
    };
  }

  /**
   * Build attrition forecast from historical monthly data.
   * Uses trailing average to project forward.
   */
  private buildAttritionForecast(
    history: Array<{ period: string; hires: number; terminations: number; endHeadcount: number }>,
    horizonMonths: number
  ): AttritionForecast {
    // Build history points with annualised turnover rates
    const completedMonths = history.slice(0, -1); // drop potentially partial current month

    const historyPoints = completedMonths.map((m) => ({
      period: m.period.substring(0, 7), // YYYY-MM
      terminations: m.terminations,
      avg_headcount: m.endHeadcount,
      turnover_rate:
        m.endHeadcount > 0
          ? Number(((m.terminations / m.endHeadcount) * 12 * 100).toFixed(1))
          : 0,
    }));

    const observationMonths = completedMonths.length;
    const totalTerminations = completedMonths.reduce((s, m) => s + m.terminations, 0);
    const avgMonthlyTerminations =
      observationMonths > 0 ? totalTerminations / observationMonths : 0;

    // Trailing 12-month turnover rate
    const last12 = completedMonths.slice(-12);
    const last12Terminations = last12.reduce((s, m) => s + m.terminations, 0);
    const avgHeadcountLast12 =
      last12.length > 0 ? last12.reduce((s, m) => s + m.endHeadcount, 0) / last12.length : 0;
    const trailing12mRate =
      avgHeadcountLast12 > 0
        ? Number(((last12Terminations / avgHeadcountLast12) * 100).toFixed(1))
        : 0;

    // Build forecast points
    const forecast = [];
    const lastHeadcount =
      completedMonths.length > 0
        ? completedMonths[completedMonths.length - 1]!.endHeadcount
        : 0;

    const today = new Date();
    for (let i = 1; i <= horizonMonths; i++) {
      const projDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const periodStr = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, "0")}`;

      const projectedTerminations = Math.round(avgMonthlyTerminations);
      const projectedRate =
        lastHeadcount > 0
          ? Number(((projectedTerminations / lastHeadcount) * 12 * 100).toFixed(1))
          : 0;

      forecast.push({
        period: periodStr,
        projected_turnover_rate: projectedRate,
        projected_terminations: projectedTerminations,
      });
    }

    return {
      trailing_12m_turnover_rate: trailing12mRate,
      avg_monthly_terminations: Number(avgMonthlyTerminations.toFixed(1)),
      observation_months: observationMonths,
      history: historyPoints,
      forecast,
    };
  }

  /**
   * Build skills gap analysis response from repository data.
   */
  private buildSkillsGapAnalysis(data: {
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
  }): SkillsGapAnalysis {
    return {
      total_competencies_analysed: data.gaps.length,
      total_employees_with_assessments: data.totalEmployeesWithAssessments,
      gaps: data.gaps.map((g) => ({
        competency_id: g.competencyId,
        competency_name: g.competencyName,
        competency_category: g.competencyCategory,
        employees_assessed: g.employeesAssessed,
        employees_required: g.employeesRequired,
        avg_current_level: g.avgCurrentLevel,
        avg_required_level: g.avgRequiredLevel,
        avg_gap: g.avgGap,
        employees_below_required: g.employeesBelowRequired,
        coverage_rate: g.coverageRate,
      })),
    };
  }

  /**
   * Main workforce planning analytics endpoint.
   * Aggregates four sub-analyses: headcount projection, retirement projection,
   * attrition forecast, and skills gap analysis.
   */
  async getWorkforcePlanning(
    context: TenantContext,
    filters: WorkforcePlanningFilters = {}
  ): Promise<ServiceResult<WorkforcePlanningDashboard>> {
    const horizonMonths = this.parseHorizonMonths(filters.horizon);
    const horizonYears = Math.ceil(horizonMonths / 12);

    // Use 24 months of lookback for historical analysis (or at least horizonMonths)
    const lookbackMonths = Math.max(24, horizonMonths);

    // Execute all four sub-analyses in parallel
    const [currentHeadcount, monthlyHistory, retirementData, employeesWithDob, skillsGapData] =
      await Promise.all([
        this.repository.getActiveHeadcount(context, filters),
        this.repository.getMonthlyHeadcountHistory(context, lookbackMonths, filters),
        this.repository.getRetirementProjectionData(context, horizonYears, filters),
        this.repository.getEmployeesWithDobCount(context, filters),
        this.repository.getSkillsGapData(context, filters),
      ]);

    const headcountProjection = this.buildHeadcountProjection(
      currentHeadcount,
      monthlyHistory,
      horizonMonths
    );

    const retirementProjection = this.buildRetirementProjection(
      currentHeadcount,
      employeesWithDob,
      retirementData
    );

    const attritionForecast = this.buildAttritionForecast(monthlyHistory, horizonMonths);

    const skillsGapAnalysis = this.buildSkillsGapAnalysis(skillsGapData);

    return {
      success: true,
      data: {
        headcount_projection: headcountProjection,
        retirement_projection: retirementProjection,
        attrition_forecast: attritionForecast,
        skills_gap_analysis: skillsGapAnalysis,
        generated_at: new Date().toISOString(),
        horizon_months: horizonMonths,
      },
    };
  }

  // ===========================================================================
  // Workforce Analytics - Individual Endpoints (TODO-198)
  // ===========================================================================

  /**
   * Headcount trends over time: monthly hires vs terminations.
   */
  async getWorkforceHeadcountTrends(
    context: TenantContext,
    filters: WorkforceAnalyticsFilters = {}
  ): Promise<ServiceResult<WorkforceHeadcountTrendsResponse>> {
    const data = await this.repository.getWorkforceHeadcountTrends(context, filters);

    return {
      success: true,
      data: {
        currentHeadcount: data.currentHeadcount,
        trends: data.trends.map((t) => ({
          period: t.period,
          totalHeadcount: t.totalHeadcount,
          hires: t.hires,
          terminations: t.terminations,
          netChange: t.netChange,
        })),
      },
    };
  }

  /**
   * Voluntary/involuntary turnover rate by department.
   */
  async getWorkforceTurnoverRate(
    context: TenantContext,
    filters: WorkforceAnalyticsFilters = {}
  ): Promise<ServiceResult<WorkforceTurnoverRateResponse>> {
    const data = await this.repository.getWorkforceTurnoverRate(context, filters);

    return {
      success: true,
      data: {
        totalTerminations: data.totalTerminations,
        overallTurnoverRate: data.overallTurnoverRate,
        overallVoluntaryRate: data.overallVoluntaryRate,
        overallInvoluntaryRate: data.overallInvoluntaryRate,
        byDepartment: data.byDepartment.map((d) => ({
          orgUnitId: d.orgUnitId,
          orgUnitName: d.orgUnitName,
          totalTerminations: d.totalTerminations,
          voluntaryTerminations: d.voluntaryTerminations,
          involuntaryTerminations: d.involuntaryTerminations,
          headcount: d.headcount,
          turnoverRate: d.turnoverRate,
        })),
      },
    };
  }

  /**
   * Retirement projection: employees approaching retirement at configurable ages.
   */
  async getWorkforceRetirementProjection(
    context: TenantContext,
    filters: WorkforceAnalyticsFilters = {},
    retirementAges: number[] = [55, 60, 65, 67]
  ): Promise<ServiceResult<WorkforceRetirementProjectionResponse>> {
    const data = await this.repository.getWorkforceRetirementProjection(
      context,
      filters,
      retirementAges
    );

    return {
      success: true,
      data: {
        totalActive: data.totalActive,
        employeesWithDob: data.employeesWithDob,
        projections: data.projections.map((p) => ({
          retirementAge: p.retirementAge,
          yearsToRetirement: p.yearsToRetirement,
          employeeCount: p.employeeCount,
          percentage: p.percentage,
          departments: p.departments.map((d) => ({
            orgUnitId: d.orgUnitId,
            orgUnitName: d.orgUnitName,
            count: d.count,
          })),
        })),
      },
    };
  }

  /**
   * Employee tenure distribution across bands.
   */
  async getWorkforceTenureDistribution(
    context: TenantContext,
    filters: WorkforceAnalyticsFilters = {}
  ): Promise<ServiceResult<WorkforceTenureDistributionResponse>> {
    const data = await this.repository.getWorkforceTenureDistribution(context, filters);

    return {
      success: true,
      data: {
        totalEmployees: data.totalEmployees,
        averageTenureMonths: data.averageTenureMonths,
        medianTenureMonths: data.medianTenureMonths,
        bands: data.bands.map((b) => ({
          band: b.band,
          employeeCount: b.employeeCount,
          percentage: b.percentage,
        })),
      },
    };
  }

  /**
   * Vacancy rate: open positions vs headcount budget.
   */
  async getWorkforceVacancyRate(
    context: TenantContext,
    filters: WorkforceAnalyticsFilters = {}
  ): Promise<ServiceResult<WorkforceVacancyRateResponse>> {
    const data = await this.repository.getWorkforceVacancyRate(context, filters);

    return {
      success: true,
      data: {
        totalBudgeted: data.totalBudgeted,
        totalFilled: data.totalFilled,
        totalOpenRequisitions: data.totalOpenRequisitions,
        overallVacancyRate: data.overallVacancyRate,
        byDepartment: data.byDepartment.map((d) => ({
          orgUnitId: d.orgUnitId,
          orgUnitName: d.orgUnitName,
          budgetedHeadcount: d.budgetedHeadcount,
          filledPositions: d.filledPositions,
          openRequisitions: d.openRequisitions,
          vacancyRate: d.vacancyRate,
        })),
      },
    };
  }

  /**
   * Key workforce metrics summary (headcount, turnover, tenure, retirement risk, vacancy).
   */
  async getWorkforceSummary(
    context: TenantContext,
    filters: WorkforceAnalyticsFilters = {}
  ): Promise<ServiceResult<WorkforceSummaryResponse>> {
    const data = await this.repository.getWorkforceSummary(context, filters);

    return {
      success: true,
      data: {
        headcount: {
          total: data.headcount.total,
          active: data.headcount.active,
          onLeave: data.headcount.onLeave,
          pending: data.headcount.pending,
        },
        turnover: {
          rate12m: data.turnover.rate12m,
          voluntaryRate12m: data.turnover.voluntaryRate12m,
          involuntaryRate12m: data.turnover.involuntaryRate12m,
        },
        tenure: {
          averageMonths: data.tenure.averageMonths,
          medianMonths: data.tenure.medianMonths,
        },
        retirementRisk: {
          within2Years: data.retirementRisk.within2Years,
          within5Years: data.retirementRisk.within5Years,
        },
        vacancy: {
          budgetedHeadcount: data.vacancy.budgetedHeadcount,
          filled: data.vacancy.filled,
          vacancyRate: data.vacancy.vacancyRate,
          openRequisitions: data.vacancy.openRequisitions,
        },
      },
    };
  }

  // ===========================================================================
  // Diversity Analytics - Extended Endpoints (TODO-147)
  // ===========================================================================

  /** Apply minimum threshold to a breakdown array for GDPR/Equality Act compliance. */
  private applyThresholdToBreakdown(items: Array<{ label: string; count: number }>, total: number): CharacteristicBreakdownItem[] {
    return items.filter((item) => item.count >= AnalyticsService.MIN_THRESHOLD).map((item) => ({ label: item.label, count: item.count, percentage: total > 0 ? Math.round((item.count / total) * 1000) / 10 : 0 }));
  }

  /** GET /analytics/diversity/overview - Headcount by all protected characteristics with threshold enforcement. */
  async getDiversityOverviewAnalytics(context: TenantContext, filters: DiversityAnalyticsFilters = {}): Promise<ServiceResult<DiversityOverview>> {
    const data = await this.repository.getDiversityOverview(context, { org_unit_id: filters.org_unit_id });
    const total = data.totalEmployees;
    return { success: true, data: { total_employees: total, by_gender: this.applyThresholdToBreakdown(data.byGender, total), by_ethnicity: this.applyThresholdToBreakdown(data.byEthnicity, total), by_disability: this.applyThresholdToBreakdown(data.byDisability, total), by_age_band: this.applyThresholdToBreakdown(data.byAgeBand, total), diversity_completion: { total_employees: data.completionRate.totalEmployees, total_submissions: data.completionRate.totalSubmissions, completion_rate: data.completionRate.completionRate }, minimum_threshold: AnalyticsService.MIN_THRESHOLD, as_of_date: new Date().toISOString().split("T")[0]! } };
  }

  /** GET /analytics/diversity/by-department - Diversity per department with threshold enforcement. */
  async getDiversityByDepartmentAnalytics(context: TenantContext, filters: DiversityAnalyticsFilters = {}): Promise<ServiceResult<DiversityByDepartmentResponse>> {
    const data = await this.repository.getDiversityByDepartmentDetailed(context, { org_unit_id: filters.org_unit_id });
    const items = data.filter((dept: any) => dept.totalEmployees >= AnalyticsService.MIN_THRESHOLD).map((dept: any) => ({ org_unit_id: dept.orgUnitId, org_unit_name: dept.orgUnitName, total_employees: dept.totalEmployees, by_gender: this.applyThresholdToBreakdown(dept.byGender, dept.totalEmployees), by_ethnicity: this.applyThresholdToBreakdown(dept.byEthnicity, dept.totalEmployees), by_disability: this.applyThresholdToBreakdown(dept.byDisability, dept.totalEmployees), by_age_band: this.applyThresholdToBreakdown(dept.byAgeBand, dept.totalEmployees) }));
    return { success: true, data: { items, minimum_threshold: AnalyticsService.MIN_THRESHOLD, as_of_date: new Date().toISOString().split("T")[0]! } };
  }

  /** GET /analytics/diversity/by-grade - Diversity per job grade with threshold enforcement. */
  async getDiversityByGradeAnalytics(context: TenantContext, filters: DiversityAnalyticsFilters = {}): Promise<ServiceResult<DiversityByGradeResponse>> {
    const data = await this.repository.getDiversityByGradeDetailed(context, { org_unit_id: filters.org_unit_id });
    const items = data.filter((grade: any) => grade.totalEmployees >= AnalyticsService.MIN_THRESHOLD).map((grade: any) => ({ job_grade: grade.jobGrade, total_employees: grade.totalEmployees, by_gender: this.applyThresholdToBreakdown(grade.byGender, grade.totalEmployees), by_ethnicity: this.applyThresholdToBreakdown(grade.byEthnicity, grade.totalEmployees), by_disability: this.applyThresholdToBreakdown(grade.byDisability, grade.totalEmployees), by_age_band: this.applyThresholdToBreakdown(grade.byAgeBand, grade.totalEmployees) }));
    return { success: true, data: { items, minimum_threshold: AnalyticsService.MIN_THRESHOLD, as_of_date: new Date().toISOString().split("T")[0]! } };
  }

  /** GET /analytics/diversity/trends - Diversity metrics over time with threshold enforcement. */
  async getDiversityTrendsAnalytics(context: TenantContext, filters: DiversityAnalyticsFilters = {}): Promise<ServiceResult<DiversityTrendsResponse>> {
    const startDate = filters.start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = filters.end_date || new Date().toISOString().split("T")[0];
    const data = await this.repository.getDiversityTrendsDetailed(context, { org_unit_id: filters.org_unit_id, start_date: startDate, end_date: endDate });
    const periodTotals = new Map<string, number>();
    for (const pt of data.genderTrends) { periodTotals.set(pt.period, (periodTotals.get(pt.period) || 0) + pt.headcount); }
    const items: Array<{ period: string; characteristic: string; label: string; headcount: number; percentage: number }> = [];
    const addTrends = (trends: Array<{ period: string; label: string; headcount: number }>, characteristic: string) => { for (const t of trends) { if (t.headcount >= AnalyticsService.MIN_THRESHOLD) { const tot = periodTotals.get(t.period) || 0; items.push({ period: t.period, characteristic, label: t.label, headcount: t.headcount, percentage: tot > 0 ? Math.round((t.headcount / tot) * 1000) / 10 : 0 }); } } };
    addTrends(data.genderTrends, "gender"); addTrends(data.ethnicityTrends, "ethnicity"); addTrends(data.disabilityTrends, "disability"); addTrends(data.ageBandTrends, "age_band");
    const hiringTrends = data.hiringTrends.filter((t) => t.hires >= AnalyticsService.MIN_THRESHOLD).map((t) => ({ period: t.period, characteristic: t.characteristic, value: t.value, hires: t.hires, leavers: 0 }));
    const leavingTrends = data.leavingTrends.filter((t) => t.leavers >= AnalyticsService.MIN_THRESHOLD).map((t) => ({ period: t.period, characteristic: t.characteristic, value: t.value, hires: 0, leavers: t.leavers }));
    return { success: true, data: { items, hiring_trends: hiringTrends, leaving_trends: leavingTrends, minimum_threshold: AnalyticsService.MIN_THRESHOLD, period: { start_date: startDate!, end_date: endDate! } } };
  }
}
