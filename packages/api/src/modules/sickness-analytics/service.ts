/**
 * Sickness Analytics Module - Service Layer
 *
 * Implements business logic for sickness absence trend analysis.
 * Computes Bradford Factor scores per department, derives rates,
 * formats responses, and handles cost estimation.
 */

import type { TenantContext } from "../../types/service-result";
import type { ServiceResult } from "../../types/service-result";
import {
  calculateBradfordFactor,
  DEFAULT_THRESHOLDS,
  type AbsenceSpell,
} from "@staffora/shared";
import type { SicknessAnalyticsRepository } from "./repository";
import { logger } from "../../lib/logger";
import type {
  SicknessAnalyticsFilters,
  SicknessTrendsResponse,
  SicknessByReasonResponse,
  SicknessByDepartmentResponse,
  SicknessSeasonalResponse,
  SicknessSummaryResponse,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Month names for display */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Estimated working days per month (UK average: 260 working days / 12 months).
 * Used as denominator for absence rate calculations.
 */
const WORKING_DAYS_PER_MONTH = 21.67;

// =============================================================================
// Service
// =============================================================================

export class SicknessAnalyticsService {
  constructor(private repository: SicknessAnalyticsRepository) {}

  // ===========================================================================
  // Trends (Monthly)
  // ===========================================================================

  /**
   * Get sickness absence rates over time (monthly breakdown).
   * Returns total days, spells, unique employees, and absence rate per month.
   */
  async getSicknessTrends(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<ServiceResult<SicknessTrendsResponse>> {
    try {
      const startDate = filters.start_date || this.defaultStartDate();
      const endDate = filters.end_date || this.today();

      const [trendRows, headcount] = await Promise.all([
        this.repository.getSicknessTrends(ctx, filters),
        this.repository.getActiveHeadcount(ctx, filters),
      ]);

      const availableDaysPerMonth =
        headcount > 0 ? headcount * WORKING_DAYS_PER_MONTH : 1;

      const items = trendRows.map((row) => ({
        month: String(row.month),
        total_days_lost: Number(row.totalDaysLost) || 0,
        total_spells: Number(row.totalSpells) || 0,
        unique_employees: Number(row.uniqueEmployees) || 0,
        absence_rate: this.round(
          (Number(row.totalDaysLost) / availableDaysPerMonth) * 100,
          2
        ),
      }));

      const totalDaysLost = items.reduce((s, i) => s + i.total_days_lost, 0);
      const totalSpells = items.reduce((s, i) => s + i.total_spells, 0);

      return {
        success: true,
        data: {
          items,
          period: { start_date: startDate, end_date: endDate },
          total_days_lost: totalDaysLost,
          total_spells: totalSpells,
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId }, "Failed to fetch sickness trends");
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch sickness trends",
        },
      };
    }
  }

  // ===========================================================================
  // By Reason
  // ===========================================================================

  /**
   * Get sickness absence breakdown by reported reason.
   */
  async getSicknessByReason(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<ServiceResult<SicknessByReasonResponse>> {
    try {
      const startDate = filters.start_date || this.defaultStartDate();
      const endDate = filters.end_date || this.today();

      const reasonRows = await this.repository.getSicknessByReason(
        ctx,
        filters
      );

      const totalDays = reasonRows.reduce(
        (s, r) => s + Number(r.totalDays),
        0
      );
      const totalSpells = reasonRows.reduce(
        (s, r) => s + Number(r.totalSpells),
        0
      );

      const items = reasonRows.map((row) => ({
        reason: String(row.reason),
        total_days: Number(row.totalDays) || 0,
        total_spells: Number(row.totalSpells) || 0,
        unique_employees: Number(row.uniqueEmployees) || 0,
        percentage_of_days:
          totalDays > 0
            ? this.round((Number(row.totalDays) / totalDays) * 100, 1)
            : 0,
        avg_spell_duration: Number(row.avgSpellDuration) || 0,
      }));

      return {
        success: true,
        data: {
          items,
          total_sickness_days: totalDays,
          total_sickness_spells: totalSpells,
          period: { start_date: startDate, end_date: endDate },
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId }, "Failed to fetch sickness by reason");
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch sickness breakdown by reason",
        },
      };
    }
  }

  // ===========================================================================
  // By Department (with Bradford Factor)
  // ===========================================================================

  /**
   * Get sickness rates per department including Bradford Factor scores.
   * Bradford Factor is computed per employee in each department, then averaged.
   */
  async getSicknessByDepartment(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<ServiceResult<SicknessByDepartmentResponse>> {
    try {
      const startDate = filters.start_date || this.defaultStartDate();
      const endDate = filters.end_date || this.today();

      const [deptRows, spellRows] = await Promise.all([
        this.repository.getSicknessByDepartment(ctx, filters),
        this.repository.getDepartmentAbsenceSpells(ctx, filters),
      ]);

      // Group spells by department and employee for Bradford Factor calculation
      const deptEmployeeSpells = new Map<
        string,
        Map<string, AbsenceSpell[]>
      >();
      for (const spell of spellRows) {
        const deptId = String(spell.departmentId);
        const empId = String(spell.employeeId);

        if (!deptEmployeeSpells.has(deptId)) {
          deptEmployeeSpells.set(deptId, new Map());
        }
        const deptMap = deptEmployeeSpells.get(deptId)!;
        if (!deptMap.has(empId)) {
          deptMap.set(empId, []);
        }
        deptMap.get(empId)!.push({
          startDate: spell.startDate,
          endDate: spell.endDate,
        });
      }

      // Calculate months in the analysis period
      const periodMonths = this.monthsBetween(startDate, endDate);

      const items = deptRows.map((dept) => {
        const headcount = Number(dept.headcount) || 0;
        const totalDays = Number(dept.totalDaysLost) || 0;
        const totalSpells = Number(dept.totalSpells) || 0;
        const uniqueEmployees = Number(dept.uniqueEmployees) || 0;

        // Calculate absence rate
        const availableDays = headcount * WORKING_DAYS_PER_MONTH * periodMonths;
        const absenceRate =
          availableDays > 0
            ? this.round((totalDays / availableDays) * 100, 2)
            : 0;

        // Calculate Bradford Factor for this department
        const deptId = String(dept.departmentId);
        const employeeSpellsMap = deptEmployeeSpells.get(deptId);
        let avgBradfordFactor = 0;
        let bradfordHighCount = 0;

        if (employeeSpellsMap && employeeSpellsMap.size > 0) {
          let totalBradford = 0;
          const referenceDate = new Date(endDate);

          for (const [, spells] of employeeSpellsMap) {
            const result = calculateBradfordFactor(
              spells,
              periodMonths,
              referenceDate,
              DEFAULT_THRESHOLDS
            );
            totalBradford += result.score;
            if (
              result.level === "high" ||
              result.level === "serious"
            ) {
              bradfordHighCount++;
            }
          }

          // Average Bradford across all employees with sickness absences
          avgBradfordFactor = this.round(
            totalBradford / employeeSpellsMap.size,
            0
          );
        }

        return {
          department_id: deptId,
          department_name: String(dept.departmentName),
          headcount,
          total_days_lost: totalDays,
          total_spells: totalSpells,
          unique_employees: uniqueEmployees,
          absence_rate: absenceRate,
          avg_days_per_employee:
            headcount > 0
              ? this.round(totalDays / headcount, 1)
              : 0,
          avg_bradford_factor: avgBradfordFactor,
          bradford_high_count: bradfordHighCount,
        };
      });

      return {
        success: true,
        data: {
          items,
          period: { start_date: startDate, end_date: endDate },
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId }, "Failed to fetch sickness by department");
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch sickness breakdown by department",
        },
      };
    }
  }

  // ===========================================================================
  // Seasonal Patterns
  // ===========================================================================

  /**
   * Get seasonal sickness patterns (month-of-year averages across all years).
   * Useful for identifying patterns like higher sickness in winter.
   */
  async getSicknessSeasonalPatterns(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<ServiceResult<SicknessSeasonalResponse>> {
    try {
      const [seasonalRows, headcount] = await Promise.all([
        this.repository.getSicknessSeasonalPatterns(ctx, filters),
        this.repository.getActiveHeadcount(ctx, filters),
      ]);

      const availableDaysPerMonth =
        headcount > 0 ? headcount * WORKING_DAYS_PER_MONTH : 1;

      // Determine the number of distinct years from the data
      const maxYears = seasonalRows.reduce(
        (max, r) => Math.max(max, Number(r.yearCount) || 0),
        0
      );

      // Build full 12-month array, filling gaps with zeros
      const items = Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const found = seasonalRows.find(
          (r) => Number(r.monthOfYear) === monthNum
        );
        const yearCount = Number(found?.yearCount) || maxYears || 1;
        const totalDays = Number(found?.totalDaysLost) || 0;
        const totalSpells = Number(found?.totalSpells) || 0;

        return {
          month_of_year: monthNum,
          month_name: MONTH_NAMES[i]!,
          avg_days_lost: this.round(totalDays / yearCount, 1),
          avg_spells: this.round(totalSpells / yearCount, 1),
          avg_absence_rate: this.round(
            (totalDays / yearCount / availableDaysPerMonth) * 100,
            2
          ),
          years_of_data: yearCount,
        };
      });

      // Find peak and lowest months
      const peakItem = items.reduce((max, item) =>
        item.avg_days_lost > max.avg_days_lost ? item : max
      );
      const lowestItem = items.reduce((min, item) =>
        item.avg_days_lost < min.avg_days_lost ? item : min
      );

      return {
        success: true,
        data: {
          items,
          peak_month: peakItem.month_name,
          lowest_month: lowestItem.month_name,
          years_analysed: maxYears,
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId }, "Failed to fetch seasonal sickness patterns");
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch seasonal sickness patterns",
        },
      };
    }
  }

  // ===========================================================================
  // Summary
  // ===========================================================================

  /**
   * Get key sickness metrics: average days lost, frequency, cost estimate,
   * short-term vs long-term breakdown.
   */
  async getSicknessSummary(
    ctx: TenantContext,
    filters: SicknessAnalyticsFilters
  ): Promise<ServiceResult<SicknessSummaryResponse>> {
    try {
      const startDate = filters.start_date || this.defaultStartDate();
      const endDate = filters.end_date || this.today();

      const [summary, avgDailySalary] = await Promise.all([
        this.repository.getSicknessSummary(ctx, filters),
        this.repository.getAvgDailySalary(ctx, filters),
      ]);

      const totalDays = Number(summary.totalDaysLost) || 0;
      const totalSpells = Number(summary.totalSpells) || 0;
      const uniqueEmployees = Number(summary.uniqueEmployees) || 0;
      const totalActive = Number(summary.totalActiveEmployees) || 0;
      const shortTermDays = Number(summary.shortTermDays) || 0;
      const longTermDays = Number(summary.longTermDays) || 0;

      // Calculate months in period for frequency rate
      const periodMonths = this.monthsBetween(startDate, endDate);

      // Absence rate: (days lost / available working days) * 100
      const availableDays = totalActive * WORKING_DAYS_PER_MONTH * periodMonths;
      const absenceRate =
        availableDays > 0
          ? this.round((totalDays / availableDays) * 100, 2)
          : 0;

      // Frequency rate: spells per 100 employees per month
      const frequencyRate =
        totalActive > 0 && periodMonths > 0
          ? this.round((totalSpells / totalActive / periodMonths) * 100, 2)
          : 0;

      // Cost estimate: total days * average daily salary
      const estimatedCost = this.round(totalDays * avgDailySalary, 2);

      return {
        success: true,
        data: {
          total_sickness_days: totalDays,
          total_sickness_spells: totalSpells,
          unique_employees_absent: uniqueEmployees,
          total_active_employees: totalActive,
          absence_rate: absenceRate,
          avg_days_per_employee:
            totalActive > 0 ? this.round(totalDays / totalActive, 1) : 0,
          avg_days_per_spell:
            totalSpells > 0 ? this.round(totalDays / totalSpells, 1) : 0,
          avg_spells_per_absent_employee:
            uniqueEmployees > 0
              ? this.round(totalSpells / uniqueEmployees, 1)
              : 0,
          frequency_rate: frequencyRate,
          estimated_cost: estimatedCost,
          estimated_cost_currency: "GBP",
          short_term_days: shortTermDays,
          long_term_days: longTermDays,
          short_term_percentage:
            totalDays > 0
              ? this.round((shortTermDays / totalDays) * 100, 1)
              : 0,
          long_term_percentage:
            totalDays > 0
              ? this.round((longTermDays / totalDays) * 100, 1)
              : 0,
          period: { start_date: startDate, end_date: endDate },
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId }, "Failed to fetch sickness summary");
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch sickness summary",
        },
      };
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private today(): string {
    return new Date().toISOString().split("T")[0]!;
  }

  private defaultStartDate(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0]!;
  }

  /**
   * Calculate the number of months between two date strings (YYYY-MM-DD).
   * Returns at least 1 to avoid division by zero.
   */
  private monthsBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1;
    return Math.max(1, months);
  }
}
