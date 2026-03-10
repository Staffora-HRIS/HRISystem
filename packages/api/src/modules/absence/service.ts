/**
 * Absence Management Service
 */

import { AbsenceRepository, type TenantContext } from "./repository";
import type { CreateLeaveType, CreateLeavePolicy, CreateLeaveRequest, LeaveRequestFilters } from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

export const AbsenceErrorCodes = {
  LEAVE_TYPE_NOT_FOUND: "LEAVE_TYPE_NOT_FOUND",
  LEAVE_POLICY_NOT_FOUND: "LEAVE_POLICY_NOT_FOUND",
  LEAVE_REQUEST_NOT_FOUND: "LEAVE_REQUEST_NOT_FOUND",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  BLACKOUT_PERIOD: "BLACKOUT_PERIOD",
  REQUEST_NOT_PENDING: "REQUEST_NOT_PENDING",
  REQUEST_ALREADY_PROCESSED: "REQUEST_ALREADY_PROCESSED",
} as const;

export class AbsenceService {
  constructor(private repo: AbsenceRepository) {}

  // Leave Types
  async createLeaveType(ctx: TenantContext, input: CreateLeaveType): Promise<ServiceResult<unknown>> {
    try {
      const leaveType = await this.repo.createLeaveType(ctx, {
        code: input.code,
        name: input.name,
        description: input.description,
        isPaid: input.isPaid,
        requiresApproval: input.requiresApproval,
        requiresDocumentation: input.requiresDocumentation,
        maxDaysPerRequest: input.maxDaysPerRequest,
        minDaysNotice: input.minDaysNotice,
        color: input.color,
      });
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

  // Leave Policies
  async createLeavePolicy(ctx: TenantContext, input: CreateLeavePolicy): Promise<ServiceResult<unknown>> {
    try {
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
  private formatLeaveType(type: any) {
    return {
      id: type.id,
      tenantId: type.tenantId,
      code: type.code,
      name: type.name,
      description: type.description,
      isPaid: type.isPaid,
      requiresApproval: type.requiresApproval,
      requiresDocumentation: type.requiresDocumentation,
      maxDaysPerRequest: type.maxDaysPerRequest,
      minDaysNotice: type.minDaysNotice,
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
