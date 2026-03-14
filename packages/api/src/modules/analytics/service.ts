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
  CompensationDashboard,
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

  async getDiversityDashboard(
    context: TenantContext,
    filters: DiversityFilters = {}
  ): Promise<ServiceResult<DiversityDashboard>> {
    const [genderRows, ageBandRows, nationalityRows, deptRows] = await Promise.all([
      this.repository.getDiversityByGender(context, filters),
      this.repository.getDiversityByAgeBand(context, filters),
      this.repository.getDiversityByNationality(context, filters),
      this.repository.getDiversityByDepartment(context, filters),
    ]);

    const totalFromGender = genderRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const totalFromAge = ageBandRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const totalFromNat = nationalityRows.reduce((s: number, r: any) => s + Number(r.count), 0);
    const total = totalFromGender || totalFromAge || totalFromNat || 0;

    const byGender = genderRows.map((r: any) => ({
      gender: r.gender,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    }));

    const byAgeBand = ageBandRows.map((r: any) => ({
      age_band: r.ageBand ?? r.age_band,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    }));

    const byNationality = nationalityRows.map((r: any) => ({
      nationality: r.nationality,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
    }));

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

    const byDepartment = Array.from(deptMap.values()).map((dept) => ({
      org_unit_id: dept.org_unit_id,
      org_unit_name: dept.org_unit_name,
      total: dept.total,
      gender_breakdown: Array.from(dept.genders.entries()).map(([gender, count]) => ({
        gender,
        count,
        percentage: dept.total > 0 ? Math.round((count / dept.total) * 1000) / 10 : 0,
      })),
    }));

    return {
      success: true,
      data: {
        total_employees: total,
        by_gender: byGender,
        by_age_band: byAgeBand,
        by_nationality: byNationality,
        by_department: byDepartment,
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
    const [summary, bandRows, deptRows, changeRows] = await Promise.all([
      this.repository.getCompensationSummary(context, filters),
      this.repository.getCompensationByBand(context, filters),
      this.repository.getCompensationByDepartment(context, filters),
      this.repository.getRecentCompensationChanges(context, filters),
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
      min_salary: Number(r.min_salary ?? r.minSalary) || 0,
      max_salary: Number(r.max_salary ?? r.maxSalary) || 0,
      total_payroll: Number(r.total_payroll ?? r.totalPayroll) || 0,
    }));

    const recentChanges = changeRows.map((r: any) => ({
      change_reason: r.change_reason ?? r.changeReason ?? "unspecified",
      count: Number(r.count) || 0,
      avg_change_percentage: Number(r.avg_change_percentage ?? r.avgChangePercentage) || 0,
    }));

    return {
      success: true,
      data: {
        summary,
        by_band: byBand,
        by_department: byDepartment,
        recent_changes: recentChanges,
      },
    };
  }
}
