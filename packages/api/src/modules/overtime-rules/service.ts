/**
 * Overtime Rules Module - Service Layer
 *
 * Business logic for overtime rule configuration and overtime calculations.
 *
 * Responsibilities:
 *   - Validate business rules before delegating to the repository
 *   - Enforce effective-date overlap prevention for overtime rules
 *   - Calculate overtime for individual employees or batch periods
 *   - Enforce the calculation status lifecycle: calculated -> approved -> paid
 */

import {
  OvertimeRulesRepository,
  type TenantContext,
  type OvertimeRuleRow,
  type OvertimeCalculationRow,
} from "./repository";
import type {
  CreateOvertimeRule,
  UpdateOvertimeRule,
  OvertimeRuleFilters,
  OvertimeCalculationFilters,
  BatchCalculateOvertime,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Error Codes
// =============================================================================

export const OvertimeRuleErrorCodes = {
  RULE_NOT_FOUND: "NOT_FOUND",
  CALCULATION_NOT_FOUND: "NOT_FOUND",
  EFFECTIVE_DATE_OVERLAP: "EFFECTIVE_DATE_OVERLAP",
  STATE_MACHINE_VIOLATION: "STATE_MACHINE_VIOLATION",
  NO_ACTIVE_RULES: "NO_ACTIVE_RULES",
  INVALID_DATE_RANGE: "INVALID_DATE_RANGE",
  EMPLOYEE_NOT_FOUND: "EMPLOYEE_NOT_FOUND",
} as const;

// =============================================================================
// Service Class
// =============================================================================

export class OvertimeRulesService {
  constructor(private repo: OvertimeRulesRepository) {}

  // ===========================================================================
  // Overtime Rules - CRUD
  // ===========================================================================

  /**
   * Create a new overtime rule.
   *
   * Validates:
   *   - effectiveFrom <= effectiveTo when both are provided
   *   - No overlapping active rules for the same effective date range
   */
  async createRule(
    ctx: TenantContext,
    input: CreateOvertimeRule
  ): Promise<ServiceResult<OvertimeRuleRow>> {
    try {
      // Validate date range
      if (input.effectiveTo && input.effectiveFrom > input.effectiveTo) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.INVALID_DATE_RANGE,
            message:
              "effectiveFrom must be on or before effectiveTo",
            details: {
              effectiveFrom: input.effectiveFrom,
              effectiveTo: input.effectiveTo,
            },
          },
        };
      }

      // Check for overlapping active rules
      const overlapCheck = await this.checkRuleOverlap(
        ctx,
        new Date(input.effectiveFrom),
        input.effectiveTo ? new Date(input.effectiveTo) : null
      );
      if (!overlapCheck.success) {
        return overlapCheck as ServiceResult<OvertimeRuleRow>;
      }

      const rule = await this.repo.createRule(ctx, {
        name: input.name,
        description: input.description,
        thresholdHoursWeekly: input.thresholdHoursWeekly,
        rateMultiplier: input.rateMultiplier,
        appliesToRoles: input.appliesToRoles,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        isActive: input.isActive,
      });

      return { success: true, data: rule };
    } catch (error) {
      console.error("Error creating overtime rule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create overtime rule",
        },
      };
    }
  }

  /**
   * Get an overtime rule by ID.
   */
  async getRuleById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<OvertimeRuleRow>> {
    try {
      const rule = await this.repo.getRuleById(ctx, id);
      if (!rule) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.RULE_NOT_FOUND,
            message: "Overtime rule not found",
            details: { ruleId: id },
          },
        };
      }

      return { success: true, data: rule };
    } catch (error) {
      console.error("Error fetching overtime rule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch overtime rule",
        },
      };
    }
  }

  /**
   * List overtime rules with filters and cursor-based pagination.
   */
  async listRules(
    ctx: TenantContext,
    filters: OvertimeRuleFilters
  ): Promise<
    ServiceResult<{
      items: OvertimeRuleRow[];
      cursor: string | null;
      hasMore: boolean;
    }>
  > {
    try {
      const result = await this.repo.getRules(ctx, {
        isActive: filters.isActive,
        effectiveDate: filters.effectiveDate
          ? new Date(filters.effectiveDate)
          : undefined,
        cursor: filters.cursor,
        limit: filters.limit,
      });

      return {
        success: true,
        data: {
          items: result.data,
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error listing overtime rules:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to list overtime rules",
        },
      };
    }
  }

  /**
   * Update an existing overtime rule.
   *
   * Validates:
   *   - The rule exists
   *   - effectiveFrom <= effectiveTo when both are provided
   *   - No overlapping active rules for the new effective date range
   */
  async updateRule(
    ctx: TenantContext,
    id: string,
    input: UpdateOvertimeRule
  ): Promise<ServiceResult<OvertimeRuleRow>> {
    try {
      // Verify the rule exists
      const existing = await this.repo.getRuleById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.RULE_NOT_FOUND,
            message: "Overtime rule not found",
            details: { ruleId: id },
          },
        };
      }

      // Resolve the final effective dates for validation
      const effectiveFrom = input.effectiveFrom
        ? new Date(input.effectiveFrom)
        : existing.effectiveFrom;
      const effectiveTo =
        input.effectiveTo !== undefined
          ? input.effectiveTo
            ? new Date(input.effectiveTo)
            : null
          : existing.effectiveTo;

      // Validate date range
      if (effectiveTo && effectiveFrom > effectiveTo) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.INVALID_DATE_RANGE,
            message:
              "effectiveFrom must be on or before effectiveTo",
            details: {
              effectiveFrom: effectiveFrom.toISOString(),
              effectiveTo: effectiveTo.toISOString(),
            },
          },
        };
      }

      // Check for overlapping active rules, excluding the current rule
      const overlapCheck = await this.checkRuleOverlap(
        ctx,
        effectiveFrom,
        effectiveTo,
        id
      );
      if (!overlapCheck.success) {
        return overlapCheck as ServiceResult<OvertimeRuleRow>;
      }

      const updated = await this.repo.updateRule(ctx, id, {
        name: input.name,
        description: input.description,
        thresholdHoursWeekly: input.thresholdHoursWeekly,
        rateMultiplier: input.rateMultiplier,
        appliesToRoles: input.appliesToRoles,
        effectiveFrom: input.effectiveFrom
          ? new Date(input.effectiveFrom)
          : undefined,
        effectiveTo:
          input.effectiveTo !== undefined
            ? input.effectiveTo
              ? new Date(input.effectiveTo)
              : null
            : undefined,
        isActive: input.isActive,
      });

      if (!updated) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.RULE_NOT_FOUND,
            message: "Overtime rule not found or could not be updated",
            details: { ruleId: id },
          },
        };
      }

      return { success: true, data: updated };
    } catch (error) {
      console.error("Error updating overtime rule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update overtime rule",
        },
      };
    }
  }

  /**
   * Delete an overtime rule.
   */
  async deleteRule(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    try {
      const existing = await this.repo.getRuleById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.RULE_NOT_FOUND,
            message: "Overtime rule not found",
            details: { ruleId: id },
          },
        };
      }

      const deleted = await this.repo.deleteRule(ctx, id);
      return { success: true, data: { deleted } };
    } catch (error) {
      console.error("Error deleting overtime rule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to delete overtime rule",
        },
      };
    }
  }

  // ===========================================================================
  // Overtime Calculations
  // ===========================================================================

  /**
   * Calculate overtime for a single employee over a period.
   *
   * Steps:
   *   1. Look up active rules for the period
   *   2. Get the employee's total hours from approved/submitted timesheets
   *   3. Get the employee's hourly rate from compensation records
   *   4. Apply the matching overtime rule (highest multiplier first)
   *   5. Persist the calculation with an outbox event
   */
  async calculateForEmployee(
    ctx: TenantContext,
    employeeId: string,
    periodStart: string,
    periodEnd: string,
    hourlyRateOverride?: number
  ): Promise<ServiceResult<OvertimeCalculationRow>> {
    try {
      const pStart = new Date(periodStart);
      const pEnd = new Date(periodEnd);

      if (pStart >= pEnd) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.INVALID_DATE_RANGE,
            message: "periodStart must be before periodEnd",
            details: { periodStart, periodEnd },
          },
        };
      }

      // Get active rules for the period
      const rules = await this.repo.getActiveRulesForPeriod(ctx, pStart, pEnd);
      if (rules.length === 0) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.NO_ACTIVE_RULES,
            message:
              "No active overtime rules found for the given period",
            details: { periodStart, periodEnd },
          },
        };
      }

      // Get employee hours
      const hours = await this.repo.getEmployeeHoursForPeriod(
        ctx,
        employeeId,
        pStart,
        pEnd
      );

      // Get hourly rate (override or from compensation)
      const hourlyRate =
        hourlyRateOverride ?? (await this.repo.getEmployeeHourlyRate(ctx, employeeId));

      // Apply rules — use the first matching rule (highest multiplier, as returned by repo)
      const calculation = this.applyOvertimeRule(
        rules,
        hours.totalHours,
        hours.regularHours,
        hourlyRate,
        pStart,
        pEnd
      );

      // Persist the calculation
      const result = await this.repo.createCalculation(ctx, {
        employeeId,
        ruleId: calculation.ruleId,
        periodStart: pStart,
        periodEnd: pEnd,
        regularHours: calculation.regularHours,
        overtimeHours: calculation.overtimeHours,
        overtimeRate: calculation.overtimeRate,
        hourlyRate,
        overtimeAmount: calculation.overtimeAmount,
        totalHours: hours.totalHours,
      });

      return { success: true, data: result };
    } catch (error) {
      console.error("Error calculating overtime for employee:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to calculate overtime",
        },
      };
    }
  }

  /**
   * Batch calculate overtime for all active employees in a period.
   */
  async batchCalculate(
    ctx: TenantContext,
    input: BatchCalculateOvertime
  ): Promise<
    ServiceResult<{
      periodStart: string;
      periodEnd: string;
      employeesProcessed: number;
      calculationsCreated: number;
      calculations: OvertimeCalculationRow[];
    }>
  > {
    try {
      const pStart = new Date(input.periodStart);
      const pEnd = new Date(input.periodEnd);

      if (pStart >= pEnd) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.INVALID_DATE_RANGE,
            message: "periodStart must be before periodEnd",
            details: { periodStart: input.periodStart, periodEnd: input.periodEnd },
          },
        };
      }

      // Get active rules for the period
      const rules = await this.repo.getActiveRulesForPeriod(ctx, pStart, pEnd);
      if (rules.length === 0) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.NO_ACTIVE_RULES,
            message:
              "No active overtime rules found for the given period",
            details: { periodStart: input.periodStart, periodEnd: input.periodEnd },
          },
        };
      }

      // Get all employee hours
      const allEmployeeHours = await this.repo.getAllEmployeeHoursForPeriod(
        ctx,
        pStart,
        pEnd
      );

      const calculations: OvertimeCalculationRow[] = [];

      for (const empHours of allEmployeeHours) {
        // Get hourly rate for each employee
        const hourlyRate = await this.repo.getEmployeeHourlyRate(
          ctx,
          empHours.employeeId
        );

        // Apply overtime rules
        const calc = this.applyOvertimeRule(
          rules,
          empHours.totalHours,
          empHours.totalHours, // Regular hours approximated from total
          hourlyRate,
          pStart,
          pEnd
        );

        // Only create a calculation if there are overtime hours
        if (calc.overtimeHours > 0) {
          const result = await this.repo.createCalculation(ctx, {
            employeeId: empHours.employeeId,
            ruleId: calc.ruleId,
            periodStart: pStart,
            periodEnd: pEnd,
            regularHours: calc.regularHours,
            overtimeHours: calc.overtimeHours,
            overtimeRate: calc.overtimeRate,
            hourlyRate,
            overtimeAmount: calc.overtimeAmount,
            totalHours: empHours.totalHours,
          });

          calculations.push(result);
        }
      }

      return {
        success: true,
        data: {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          employeesProcessed: allEmployeeHours.length,
          calculationsCreated: calculations.length,
          calculations,
        },
      };
    } catch (error) {
      console.error("Error in batch overtime calculation:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to batch calculate overtime",
        },
      };
    }
  }

  /**
   * List overtime calculations with filters and cursor-based pagination.
   */
  async listCalculations(
    ctx: TenantContext,
    filters: OvertimeCalculationFilters
  ): Promise<
    ServiceResult<{
      items: OvertimeCalculationRow[];
      cursor: string | null;
      hasMore: boolean;
    }>
  > {
    try {
      const result = await this.repo.getCalculations(ctx, {
        employeeId: filters.employeeId,
        status: filters.status,
        periodStart: filters.periodStart
          ? new Date(filters.periodStart)
          : undefined,
        periodEnd: filters.periodEnd
          ? new Date(filters.periodEnd)
          : undefined,
        cursor: filters.cursor,
        limit: filters.limit,
      });

      return {
        success: true,
        data: {
          items: result.data,
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error listing overtime calculations:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to list overtime calculations",
        },
      };
    }
  }

  /**
   * Get an overtime calculation by ID.
   */
  async getCalculationById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<OvertimeCalculationRow>> {
    try {
      const calculation = await this.repo.getCalculationById(ctx, id);
      if (!calculation) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.CALCULATION_NOT_FOUND,
            message: "Overtime calculation not found",
            details: { calculationId: id },
          },
        };
      }

      return { success: true, data: calculation };
    } catch (error) {
      console.error("Error fetching overtime calculation:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch overtime calculation",
        },
      };
    }
  }

  /**
   * Approve an overtime calculation.
   *
   * Enforces the status lifecycle: only "calculated" status can be approved.
   */
  async approveCalculation(
    ctx: TenantContext,
    id: string,
    notes?: string
  ): Promise<ServiceResult<OvertimeCalculationRow>> {
    try {
      // Verify the calculation exists and is in correct status
      const existing = await this.repo.getCalculationById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.CALCULATION_NOT_FOUND,
            message: "Overtime calculation not found",
            details: { calculationId: id },
          },
        };
      }

      if (existing.status !== "calculated") {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot approve a calculation in '${existing.status}' status. Must be 'calculated'.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const approved = await this.repo.approveCalculation(ctx, id, notes);
      if (!approved) {
        return {
          success: false,
          error: {
            code: OvertimeRuleErrorCodes.STATE_MACHINE_VIOLATION,
            message:
              "Failed to approve calculation. It may have been modified concurrently.",
          },
        };
      }

      return { success: true, data: approved };
    } catch (error) {
      console.error("Error approving overtime calculation:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to approve overtime calculation",
        },
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Check for overlapping active overtime rules in the same date range.
   * Optionally excludes a specific rule (for updates).
   */
  private async checkRuleOverlap(
    ctx: TenantContext,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId?: string
  ): Promise<ServiceResult<void>> {
    // Use a far-future date for open-ended ranges when checking overlap
    const overlapEnd = effectiveTo || new Date("9999-12-31");

    const overlapping = await this.repo.getActiveRulesForPeriod(
      ctx,
      effectiveFrom,
      overlapEnd
    );

    const hasOverlap = overlapping.some(
      (rule) => rule.id !== excludeId && rule.isActive
    );

    if (hasOverlap) {
      return {
        success: false,
        error: {
          code: OvertimeRuleErrorCodes.EFFECTIVE_DATE_OVERLAP,
          message:
            "An active overtime rule already exists that overlaps with the given effective date range",
          details: {
            effectiveFrom: effectiveFrom.toISOString(),
            effectiveTo: effectiveTo?.toISOString() || null,
            overlappingRuleIds: overlapping
              .filter((r) => r.id !== excludeId && r.isActive)
              .map((r) => r.id),
          },
        },
      };
    }

    return { success: true };
  }

  /**
   * Apply overtime rules to determine overtime hours and amount.
   *
   * Rules are ordered by rate_multiplier DESC from the repository.
   * The first rule whose weekly threshold is exceeded gets applied.
   */
  private applyOvertimeRule(
    rules: OvertimeRuleRow[],
    totalHours: number,
    regularHours: number,
    hourlyRate: number,
    _periodStart: Date,
    _periodEnd: Date
  ): {
    ruleId: string | null;
    regularHours: number;
    overtimeHours: number;
    overtimeRate: number;
    overtimeAmount: number;
  } {
    // Calculate the number of weeks in the period for threshold comparison
    const periodMs = _periodEnd.getTime() - _periodStart.getTime();
    const periodWeeks = Math.max(periodMs / (7 * 24 * 60 * 60 * 1000), 1);

    for (const rule of rules) {
      const weeklyThreshold = rule.thresholdHoursWeekly;
      const totalThresholdForPeriod = weeklyThreshold * periodWeeks;

      if (totalHours > totalThresholdForPeriod) {
        const overtimeHours = Math.round(
          (totalHours - totalThresholdForPeriod) * 100
        ) / 100;
        const effectiveRegularHours = Math.round(totalThresholdForPeriod * 100) / 100;
        const overtimeRate = Math.round(rule.rateMultiplier * 100) / 100;
        const overtimeAmount =
          Math.round(overtimeHours * hourlyRate * overtimeRate * 100) / 100;

        return {
          ruleId: rule.id,
          regularHours: effectiveRegularHours,
          overtimeHours,
          overtimeRate,
          overtimeAmount,
        };
      }
    }

    // No overtime — total hours within all thresholds
    return {
      ruleId: null,
      regularHours: totalHours,
      overtimeHours: 0,
      overtimeRate: 0,
      overtimeAmount: 0,
    };
  }
}
