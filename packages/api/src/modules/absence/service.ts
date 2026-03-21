/**
 * Absence Management Service
 */

import { AbsenceRepository, type TenantContext } from "./repository";
import type { CreateLeaveType, CreateLeavePolicy, CreateLeaveRequest, LeaveRequestFilters } from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { calculateBradfordFactor, getBradfordLevelDescription, type AbsenceSpell } from "@staffora/shared";

/** UK statutory minimum leave entitlement (Working Time Regulations 1998) */
export const UK_STATUTORY = {
  FULL_TIME_DAYS_PER_WEEK: 5,
  FULL_TIME_DAYS: 5,
  FULL_TIME_HOURS: 40,
  STATUTORY_MINIMUM_DAYS: 28,
  FULL_TIME_MIN_DAYS: 28,
  WEEKS_ENTITLEMENT: 5.6,
} as const;

/**
 * Calculate UK statutory minimum annual leave entitlement.
 * Full-time (5 days/week) = 28 days. Part-time is pro-rated and rounded up.
 * Capped at 28 days (the statutory maximum).
 */
export function calculateMinimumEntitlement(daysPerWeek: number, fullTimeDays?: number): number {
  const ftDays = fullTimeDays ?? UK_STATUTORY.FULL_TIME_DAYS_PER_WEEK;
  const raw = (daysPerWeek / ftDays) * UK_STATUTORY.STATUTORY_MINIMUM_DAYS;
  return Math.min(Math.ceil(raw), UK_STATUTORY.STATUTORY_MINIMUM_DAYS);
}

export const AbsenceErrorCodes = {
  LEAVE_TYPE_NOT_FOUND: "LEAVE_TYPE_NOT_FOUND",
  LEAVE_POLICY_NOT_FOUND: "LEAVE_POLICY_NOT_FOUND",
  LEAVE_REQUEST_NOT_FOUND: "LEAVE_REQUEST_NOT_FOUND",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  BLACKOUT_PERIOD: "BLACKOUT_PERIOD",
  REQUEST_NOT_PENDING: "REQUEST_NOT_PENDING",
  REQUEST_ALREADY_PROCESSED: "REQUEST_ALREADY_PROCESSED",
  BELOW_STATUTORY_MINIMUM: "BELOW_STATUTORY_MINIMUM",
} as const;

export class AbsenceService {
  constructor(private repo: AbsenceRepository) {}

  // Leave Types
  async createLeaveType(ctx: TenantContext, input: CreateLeaveType): Promise<ServiceResult<unknown>> {
    try {
      // Uppercase the code to match DB constraint: ^[A-Z][A-Z0-9_]*$
      const normalizedCode = input.code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (!normalizedCode || !/^[A-Z][A-Z0-9_]*$/.test(normalizedCode)) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Code must start with a letter and contain only uppercase letters, numbers, and underscores",
          },
        };
      }

      const leaveType = await this.repo.createLeaveType(ctx, {
        code: normalizedCode,
        name: input.name,
        category: (input as any).category,
        description: input.description,
        isPaid: input.isPaid,
        requiresApproval: input.requiresApproval,
        requiresAttachment: input.requiresAttachment,
        maxConsecutiveDays: input.maxConsecutiveDays,
        minNoticeDays: input.minNoticeDays,
        color: input.color,
      } as any);
      return { success: true, data: this.formatLeaveType(leaveType) };
    } catch (error) {
      console.error("Error creating leave type:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create leave type" } };
    }
  }

  async getLeaveTypes(ctx: TenantContext): Promise<ServiceResult<unknown[]>> {
    try {
      const types = await this.repo.getLeaveTypes(ctx);
      return { success: true, data: types.map(this.formatLeaveType) };
    } catch (error) {
      console.error("Error fetching leave types:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch leave types" } };
    }
  }

  async getLeaveTypeById(ctx: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const type = await this.repo.getLeaveTypeById(ctx, id);
      if (!type) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND, message: "Leave type not found" } };
      }
      return { success: true, data: this.formatLeaveType(type) };
    } catch (error) {
      console.error("Error fetching leave type:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch leave type" } };
    }
  }

  async deleteLeaveType(ctx: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const result = await this.repo.deactivateLeaveType(ctx, id);
      if (!result) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND, message: "Leave type not found or already inactive" } };
      }
      return { success: true, data: { message: "Leave type deactivated" } };
    } catch (error) {
      console.error("Error deleting leave type:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to delete leave type" } };
    }
  }

  async updateLeaveType(ctx: TenantContext, id: string, input: Partial<CreateLeaveType>): Promise<ServiceResult<unknown>> {
    try {
      // Uppercase the code if provided to match DB constraint: ^[A-Z][A-Z0-9_]*$
      let normalizedCode = input.code;
      if (normalizedCode) {
        normalizedCode = normalizedCode.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedCode)) {
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Code must start with a letter and contain only uppercase letters, numbers, and underscores",
            },
          };
        }
      }

      const updated = await this.repo.updateLeaveType(ctx, id, {
        code: normalizedCode,
        name: input.name,
        description: input.description,
        isPaid: input.isPaid,
        requiresApproval: input.requiresApproval,
        requiresAttachment: input.requiresAttachment,
        maxConsecutiveDays: input.maxConsecutiveDays,
        minNoticeDays: input.minNoticeDays,
        color: input.color,
      });
      if (!updated) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND, message: "Leave type not found" } };
      }
      return { success: true, data: this.formatLeaveType(updated) };
    } catch (error) {
      console.error("Error updating leave type:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to update leave type" } };
    }
  }

  // Leave Policies
  async createLeavePolicy(ctx: TenantContext, input: CreateLeavePolicy): Promise<ServiceResult<unknown>> {
    try {
      // Look up leave type to determine category for statutory validation
      const leaveType = await this.repo.getLeaveTypeById(ctx, input.leaveTypeId);
      if (!leaveType) {
        return {
          success: false,
          error: { code: AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND, message: "Leave type not found" },
        };
      }

      // Enforce UK statutory minimum for annual leave policies
      const category = (leaveType as unknown as Record<string, unknown>).category as string | undefined;
      if (category === "annual") {
        const daysPerWeek = (input as Record<string, unknown>).daysPerWeek as number | undefined;
        const effectiveDaysPerWeek = daysPerWeek ?? UK_STATUTORY.FULL_TIME_DAYS_PER_WEEK;
        const minimumEntitlement = calculateMinimumEntitlement(effectiveDaysPerWeek);

        if (input.annualAllowance < minimumEntitlement) {
          const isFullTime = effectiveDaysPerWeek === UK_STATUTORY.FULL_TIME_DAYS_PER_WEEK;
          const description = isFullTime
            ? `Annual leave policy entitlement of ${input.annualAllowance} days is below the UK statutory minimum of ${minimumEntitlement} days for full-time workers.`
            : `Annual leave policy entitlement of ${input.annualAllowance} days is below the UK pro-rata statutory minimum of ${minimumEntitlement} days for a ${effectiveDaysPerWeek}-day working week.`;

          return {
            success: false,
            error: {
              code: AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM,
              message: description,
              details: {
                entitlementDays: input.annualAllowance,
                minimumEntitlementDays: minimumEntitlement,
                daysPerWeek: effectiveDaysPerWeek,
                fullTimeMinimumDays: UK_STATUTORY.STATUTORY_MINIMUM_DAYS,
                weeksEntitlement: UK_STATUTORY.WEEKS_ENTITLEMENT,
              },
            },
          };
        }
      }

      const policy = await this.repo.createLeavePolicy(ctx, {
        name: input.name,
        description: input.description,
        leaveTypeId: input.leaveTypeId,
        annualAllowance: input.annualAllowance,
        maxCarryover: input.maxCarryover,
        accrualFrequency: input.accrualFrequency,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
        eligibleAfterMonths: input.eligibleAfterMonths,
        appliesTo: input.appliesTo,
      });
      return { success: true, data: this.formatLeavePolicy(policy) };
    } catch (error) {
      console.error("Error creating leave policy:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create leave policy" } };
    }
  }

  async getLeavePolicies(ctx: TenantContext): Promise<ServiceResult<unknown[]>> {
    try {
      const policies = await this.repo.getLeavePolicies(ctx);
      return { success: true, data: policies.map(this.formatLeavePolicy) };
    } catch (error) {
      console.error("Error fetching leave policies:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch leave policies" } };
    }
  }

  async updateLeavePolicy(ctx: TenantContext, id: string, input: Partial<CreateLeavePolicy>): Promise<ServiceResult<unknown>> {
    try {
      // If leaveTypeId is being updated, validate it and enforce statutory minimum
      const leaveTypeId = input.leaveTypeId;
      if (leaveTypeId && input.annualAllowance !== undefined) {
        const leaveType = await this.repo.getLeaveTypeById(ctx, leaveTypeId);
        if (!leaveType) {
          return {
            success: false,
            error: { code: AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND, message: "Leave type not found" },
          };
        }

        const category = (leaveType as unknown as Record<string, unknown>).category as string | undefined;
        if (category === "annual") {
          const daysPerWeek = (input as Record<string, unknown>).daysPerWeek as number | undefined;
          const effectiveDaysPerWeek = daysPerWeek ?? UK_STATUTORY.FULL_TIME_DAYS_PER_WEEK;
          const minimumEntitlement = calculateMinimumEntitlement(effectiveDaysPerWeek);

          if (input.annualAllowance < minimumEntitlement) {
            const isFullTime = effectiveDaysPerWeek === UK_STATUTORY.FULL_TIME_DAYS_PER_WEEK;
            const description = isFullTime
              ? `Annual leave policy entitlement of ${input.annualAllowance} days is below the UK statutory minimum of ${minimumEntitlement} days for full-time workers.`
              : `Annual leave policy entitlement of ${input.annualAllowance} days is below the UK pro-rata statutory minimum of ${minimumEntitlement} days for a ${effectiveDaysPerWeek}-day working week.`;

            return {
              success: false,
              error: {
                code: AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM,
                message: description,
                details: {
                  entitlementDays: input.annualAllowance,
                  minimumEntitlementDays: minimumEntitlement,
                  daysPerWeek: effectiveDaysPerWeek,
                  fullTimeMinimumDays: UK_STATUTORY.STATUTORY_MINIMUM_DAYS,
                  weeksEntitlement: UK_STATUTORY.WEEKS_ENTITLEMENT,
                },
              },
            };
          }
        }
      }

      const updated = await this.repo.updateLeavePolicy(ctx, id, {
        name: input.name,
        description: input.description,
        leaveTypeId: input.leaveTypeId,
        annualAllowance: input.annualAllowance,
        maxCarryover: input.maxCarryover,
        accrualFrequency: input.accrualFrequency,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        eligibleAfterMonths: input.eligibleAfterMonths,
        appliesTo: input.appliesTo,
      } as any);
      if (!updated) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_POLICY_NOT_FOUND, message: "Leave policy not found" } };
      }
      return { success: true, data: this.formatLeavePolicy(updated) };
    } catch (error) {
      console.error("Error updating leave policy:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to update leave policy" } };
    }
  }

  async deleteLeavePolicy(ctx: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const result = await this.repo.deactivateLeavePolicy(ctx, id);
      if (!result) {
        return { success: false, error: { code: "LEAVE_POLICY_NOT_FOUND", message: "Leave policy not found or already inactive" } };
      }
      return { success: true, data: { message: "Leave policy deactivated" } };
    } catch (error) {
      console.error("Error deleting leave policy:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to delete leave policy" } };
    }
  }

  // Leave Requests
  async createLeaveRequest(ctx: TenantContext, input: CreateLeaveRequest): Promise<ServiceResult<unknown>> {
    try {
      const request = await this.repo.createLeaveRequest(ctx, {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        startHalfDay: input.startHalfDay,
        endHalfDay: input.endHalfDay,
        reason: input.reason,
        contactInfo: input.contactInfo,
      });
      return { success: true, data: this.formatLeaveRequest(request) };
    } catch (error) {
      console.error("Error creating leave request:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create leave request" } };
    }
  }

  async getLeaveRequests(ctx: TenantContext, filters: LeaveRequestFilters): Promise<ServiceResult<{ items: unknown[]; cursor: string | null; hasMore: boolean }>> {
    try {
      const result = await this.repo.getLeaveRequests(ctx, {
        employeeId: filters.employeeId,
        leaveTypeId: filters.leaveTypeId,
        status: filters.status,
        from: filters.from ? new Date(filters.from) : undefined,
        to: filters.to ? new Date(filters.to) : undefined,
        cursor: filters.cursor,
        limit: filters.limit,
      });
      return {
        success: true,
        data: { items: result.data.map(this.formatLeaveRequest), cursor: result.cursor, hasMore: result.hasMore },
      };
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch leave requests" } };
    }
  }

  async getLeaveRequestById(ctx: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const request = await this.repo.getLeaveRequestById(ctx, id);
      if (!request) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND, message: "Leave request not found" } };
      }
      return { success: true, data: this.formatLeaveRequest(request) };
    } catch (error) {
      console.error("Error fetching leave request:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch leave request" } };
    }
  }

  async submitLeaveRequest(ctx: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const request = await this.repo.submitLeaveRequest(ctx, id);
      if (!request) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND, message: "Leave request not found or not in draft status" } };
      }
      return { success: true, data: this.formatLeaveRequest(request) };
    } catch (error) {
      console.error("Error submitting leave request:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to submit leave request" } };
    }
  }

  async approveLeaveRequest(ctx: TenantContext, id: string, approverId: string, comments?: string): Promise<ServiceResult<unknown>> {
    try {
      const request = await this.repo.approveLeaveRequest(ctx, id, approverId, comments);
      if (!request) {
        return { success: false, error: { code: AbsenceErrorCodes.REQUEST_NOT_PENDING, message: "Leave request not found or not pending" } };
      }
      return { success: true, data: this.formatLeaveRequest(request) };
    } catch (error) {
      console.error("Error approving leave request:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to approve leave request" } };
    }
  }

  async rejectLeaveRequest(ctx: TenantContext, id: string, approverId: string, reason?: string): Promise<ServiceResult<unknown>> {
    try {
      const request = await this.repo.rejectLeaveRequest(ctx, id, approverId, reason);
      if (!request) {
        return { success: false, error: { code: AbsenceErrorCodes.REQUEST_NOT_PENDING, message: "Leave request not found or not pending" } };
      }
      return { success: true, data: this.formatLeaveRequest(request) };
    } catch (error) {
      console.error("Error rejecting leave request:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to reject leave request" } };
    }
  }

  async cancelLeaveRequest(ctx: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const request = await this.repo.cancelLeaveRequest(ctx, id);
      if (!request) {
        return { success: false, error: { code: AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND, message: "Leave request not found or cannot be cancelled" } };
      }
      return { success: true, data: this.formatLeaveRequest(request) };
    } catch (error) {
      console.error("Error cancelling leave request:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to cancel leave request" } };
    }
  }

  // Leave Balances
  async getLeaveBalances(ctx: TenantContext, employeeId: string, year?: number): Promise<ServiceResult<unknown[]>> {
    try {
      const balances = await this.repo.getLeaveBalances(ctx, employeeId, year);
      return { success: true, data: balances.map(this.formatLeaveBalance) };
    } catch (error) {
      console.error("Error fetching leave balances:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch leave balances" } };
    }
  }

  // Formatters
  // Bradford Factor
  async getBradfordFactor(
    ctx: TenantContext,
    employeeId: string,
    periodMonths: number = 12
  ): Promise<ServiceResult<unknown>> {
    try {
      const spells = await this.repo.getCompletedAbsenceSpells(ctx, employeeId, periodMonths);

      const absenceSpells: AbsenceSpell[] = spells.map((s: any) => ({
        startDate: s.startDate,
        endDate: s.endDate,
      }));

      const result = calculateBradfordFactor(absenceSpells, periodMonths);

      return {
        success: true,
        data: {
          employeeId,
          score: result.score,
          spells: result.spells,
          totalDays: result.totalDays,
          level: result.level,
          levelDescription: getBradfordLevelDescription(result.level),
          periodStart: result.periodStart.toISOString().split("T")[0],
          periodEnd: result.periodEnd.toISOString().split("T")[0],
          periodMonths,
        },
      };
    } catch (error) {
      console.error("Error calculating Bradford Factor:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to calculate Bradford Factor" },
      };
    }
  }

  private formatLeaveType(type: any) {
    return {
      id: type.id,
      tenantId: type.tenantId,
      code: type.code,
      name: type.name,
      category: type.category ?? "other",
      description: type.description,
      isPaid: type.isPaid,
      requiresApproval: type.requiresApproval,
      requiresAttachment: type.requiresAttachment,
      maxConsecutiveDays: type.maxConsecutiveDays,
      minNoticeDays: type.minNoticeDays,
      color: type.color,
      isActive: type.isActive,
      createdAt: type.createdAt instanceof Date ? type.createdAt.toISOString() : type.createdAt,
      updatedAt: type.updatedAt instanceof Date ? type.updatedAt.toISOString() : type.updatedAt,
    };
  }

  private formatLeavePolicy(policy: any) {
    return {
      id: policy.id,
      tenantId: policy.tenantId,
      name: policy.name,
      description: policy.description,
      leaveTypeId: policy.leaveTypeId,
      annualAllowance: policy.annualAllowance,
      maxCarryover: policy.maxCarryover,
      accrualFrequency: policy.accrualFrequency,
      effectiveFrom: policy.effectiveFrom instanceof Date ? policy.effectiveFrom.toISOString().split("T")[0] : policy.effectiveFrom,
      effectiveTo: policy.effectiveTo instanceof Date ? policy.effectiveTo.toISOString().split("T")[0] : policy.effectiveTo,
      eligibleAfterMonths: policy.eligibleAfterMonths,
      appliesTo: policy.appliesTo,
      isActive: policy.isActive,
      createdAt: policy.createdAt instanceof Date ? policy.createdAt.toISOString() : policy.createdAt,
      updatedAt: policy.updatedAt instanceof Date ? policy.updatedAt.toISOString() : policy.updatedAt,
    };
  }

  private formatLeaveRequest(request: any) {
    return {
      id: request.id,
      tenantId: request.tenantId,
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      startDate: request.startDate instanceof Date ? request.startDate.toISOString().split("T")[0] : request.startDate,
      endDate: request.endDate instanceof Date ? request.endDate.toISOString().split("T")[0] : request.endDate,
      startHalfDay: request.startHalfDay,
      endHalfDay: request.endHalfDay,
      totalDays: request.totalDays,
      reason: request.reason,
      contactInfo: request.contactInfo,
      status: request.status,
      submittedAt: request.submittedAt instanceof Date ? request.submittedAt.toISOString() : request.submittedAt,
      approvedAt: request.approvedAt instanceof Date ? request.approvedAt.toISOString() : request.approvedAt,
      approvedById: request.approvedById,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt instanceof Date ? request.createdAt.toISOString() : request.createdAt,
      updatedAt: request.updatedAt instanceof Date ? request.updatedAt.toISOString() : request.updatedAt,
    };
  }

  private formatLeaveBalance(balance: any) {
    return {
      id: balance.id,
      tenantId: balance.tenantId,
      employeeId: balance.employeeId,
      leaveTypeId: balance.leaveTypeId,
      leaveTypeName: balance.leaveTypeName,
      year: balance.year,
      entitled: balance.entitled,
      used: balance.used,
      pending: balance.pending,
      available: balance.available,
      carryover: balance.carryover,
      updatedAt: balance.updatedAt instanceof Date ? balance.updatedAt.toISOString() : balance.updatedAt,
    };
  }
}
