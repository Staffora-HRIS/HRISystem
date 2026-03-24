/**
 * Shift Swap Service
 *
 * Business logic for the two-phase shift swap approval workflow.
 *
 * State machine:
 *   pending_target  -> pending_manager  (target employee accepts)
 *   pending_target  -> rejected          (target employee rejects)
 *   pending_target  -> cancelled         (requester cancels)
 *   pending_manager -> approved           (manager approves, shifts are swapped)
 *   pending_manager -> rejected           (manager rejects)
 *   pending_manager -> cancelled          (requester cancels)
 */

import { ShiftSwapRepository, type TenantContext } from "./repository";
import type {
  CreateShiftSwapRequest,
  RespondToSwap,
  ManagerApproval,
  ShiftSwapFilters,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { logger } from "../../lib/logger";

// =============================================================================
// Error Codes
// =============================================================================

export const ShiftSwapErrorCodes = {
  SWAP_REQUEST_NOT_FOUND: "SWAP_REQUEST_NOT_FOUND",
  ASSIGNMENT_NOT_FOUND: "ASSIGNMENT_NOT_FOUND",
  CANNOT_SWAP_OWN_SHIFT: "CANNOT_SWAP_OWN_SHIFT",
  ASSIGNMENT_OWNER_MISMATCH: "ASSIGNMENT_OWNER_MISMATCH",
  PENDING_SWAP_EXISTS: "PENDING_SWAP_EXISTS",
  NOT_TARGET_EMPLOYEE: "NOT_TARGET_EMPLOYEE",
  NOT_REQUESTER: "NOT_REQUESTER",
  INVALID_STATUS_FOR_ACCEPT: "INVALID_STATUS_FOR_ACCEPT",
  INVALID_STATUS_FOR_REJECT: "INVALID_STATUS_FOR_REJECT",
  INVALID_STATUS_FOR_APPROVE: "INVALID_STATUS_FOR_APPROVE",
  INVALID_STATUS_FOR_CANCEL: "INVALID_STATUS_FOR_CANCEL",
  STATE_MACHINE_VIOLATION: "STATE_MACHINE_VIOLATION",
  EMPLOYEE_NOT_FOUND: "EMPLOYEE_NOT_FOUND",
} as const;

// =============================================================================
// Service Class
// =============================================================================

export class ShiftSwapService {
  constructor(private repo: ShiftSwapRepository) {}

  // ===========================================================================
  // Create Swap Request
  // ===========================================================================

  async createSwapRequest(
    ctx: TenantContext,
    input: CreateShiftSwapRequest
  ): Promise<ServiceResult<unknown>> {
    try {
      // Resolve the current user's employee record
      const employee = await this.repo.getEmployeeForUser(ctx, ctx.userId!);
      if (!employee) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.EMPLOYEE_NOT_FOUND,
            message: "No active employee record found for the current user",
          },
        };
      }

      // Cannot swap with yourself
      if (employee.id === input.targetEmployeeId) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.CANNOT_SWAP_OWN_SHIFT,
            message: "Cannot request a shift swap with yourself",
          },
        };
      }

      // Validate requester's assignment exists and belongs to them
      const requesterAssignment = await this.repo.getShiftAssignment(
        ctx,
        input.requesterAssignmentId
      );
      if (!requesterAssignment) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.ASSIGNMENT_NOT_FOUND,
            message: "Requester shift assignment not found",
            details: { assignmentId: input.requesterAssignmentId },
          },
        };
      }
      if (requesterAssignment.employeeId !== employee.id) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.ASSIGNMENT_OWNER_MISMATCH,
            message: "The requester assignment does not belong to you",
          },
        };
      }

      // Validate target assignment exists and belongs to target employee
      const targetAssignment = await this.repo.getShiftAssignment(
        ctx,
        input.targetAssignmentId
      );
      if (!targetAssignment) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.ASSIGNMENT_NOT_FOUND,
            message: "Target shift assignment not found",
            details: { assignmentId: input.targetAssignmentId },
          },
        };
      }
      if (targetAssignment.employeeId !== input.targetEmployeeId) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.ASSIGNMENT_OWNER_MISMATCH,
            message:
              "The target assignment does not belong to the specified target employee",
          },
        };
      }

      // Check no pending swap already exists for either assignment
      const hasPendingRequester = await this.repo.hasPendingSwapForAssignment(
        ctx,
        input.requesterAssignmentId
      );
      if (hasPendingRequester) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.PENDING_SWAP_EXISTS,
            message:
              "A pending swap request already exists for your shift assignment",
            details: { assignmentId: input.requesterAssignmentId },
          },
        };
      }

      const hasPendingTarget = await this.repo.hasPendingSwapForAssignment(
        ctx,
        input.targetAssignmentId
      );
      if (hasPendingTarget) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.PENDING_SWAP_EXISTS,
            message:
              "A pending swap request already exists for the target shift assignment",
            details: { assignmentId: input.targetAssignmentId },
          },
        };
      }

      const swapRequest = await this.repo.createSwapRequest(ctx, {
        requesterId: employee.id,
        requesterAssignmentId: input.requesterAssignmentId,
        targetEmployeeId: input.targetEmployeeId,
        targetAssignmentId: input.targetAssignmentId,
        reason: input.reason,
      });

      return { success: true, data: this.formatSwapRequest(swapRequest) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, userId: ctx.userId }, "Failed to create shift swap request");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // List Swap Requests
  // ===========================================================================

  async listSwapRequests(
    ctx: TenantContext,
    filters: ShiftSwapFilters
  ): Promise<
    ServiceResult<{ items: unknown[]; cursor: string | null; hasMore: boolean }>
  > {
    try {
      const employee = await this.repo.getEmployeeForUser(ctx, ctx.userId!);
      if (!employee) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.EMPLOYEE_NOT_FOUND,
            message: "No active employee record found for the current user",
          },
        };
      }

      const result = await this.repo.listSwapRequests(ctx, employee.id, {
        status: filters.status,
        asRequester: filters.asRequester,
        asTarget: filters.asTarget,
        cursor: filters.cursor,
        limit: filters.limit,
      });

      return {
        success: true,
        data: {
          items: result.data.map((row) => this.formatSwapRequest(row)),
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, userId: ctx.userId }, "Failed to list shift swap requests");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to list shift swap requests",
        },
      };
    }
  }

  // ===========================================================================
  // Get Single Swap Request
  // ===========================================================================

  async getSwapRequestById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const swapRequest = await this.repo.getSwapRequestById(ctx, id);
      if (!swapRequest) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND,
            message: "Shift swap request not found",
          },
        };
      }

      return { success: true, data: this.formatSwapRequest(swapRequest) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, swapRequestId: id }, "Failed to fetch shift swap request");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // Target Employee: Accept
  // ===========================================================================

  async acceptSwapRequest(
    ctx: TenantContext,
    id: string,
    input: RespondToSwap
  ): Promise<ServiceResult<unknown>> {
    try {
      // Verify the request exists
      const existing = await this.repo.getSwapRequestById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND,
            message: "Shift swap request not found",
          },
        };
      }

      // Verify the current user is the target employee
      const employee = await this.repo.getEmployeeForUser(ctx, ctx.userId!);
      if (!employee || employee.id !== existing.targetEmployeeId) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.NOT_TARGET_EMPLOYEE,
            message: "Only the target employee can accept this swap request",
          },
        };
      }

      // Verify correct status
      if (existing.status !== "pending_target") {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot accept a swap request in '${existing.status}' status. Must be 'pending_target'.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const updated = await this.repo.acceptSwapRequest(ctx, id, input.notes);
      if (!updated) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message:
              "Failed to accept swap request. It may have been modified concurrently.",
          },
        };
      }

      return { success: true, data: this.formatSwapRequest(updated) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, swapRequestId: id }, "Failed to accept shift swap request");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to accept shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // Target Employee: Reject
  // ===========================================================================

  async rejectSwapByTarget(
    ctx: TenantContext,
    id: string,
    input: RespondToSwap
  ): Promise<ServiceResult<unknown>> {
    try {
      const existing = await this.repo.getSwapRequestById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND,
            message: "Shift swap request not found",
          },
        };
      }

      const employee = await this.repo.getEmployeeForUser(ctx, ctx.userId!);
      if (!employee || employee.id !== existing.targetEmployeeId) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.NOT_TARGET_EMPLOYEE,
            message: "Only the target employee can reject this swap request",
          },
        };
      }

      if (existing.status !== "pending_target") {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot reject a swap request in '${existing.status}' status. Must be 'pending_target'.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const updated = await this.repo.rejectSwapByTarget(ctx, id, input.notes);
      if (!updated) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message:
              "Failed to reject swap request. It may have been modified concurrently.",
          },
        };
      }

      return { success: true, data: this.formatSwapRequest(updated) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, swapRequestId: id }, "Failed to reject shift swap request by target");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to reject shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // Manager: Approve
  // ===========================================================================

  async approveSwapByManager(
    ctx: TenantContext,
    id: string,
    input: ManagerApproval
  ): Promise<ServiceResult<unknown>> {
    try {
      const existing = await this.repo.getSwapRequestById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND,
            message: "Shift swap request not found",
          },
        };
      }

      if (existing.status !== "pending_manager") {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot approve a swap request in '${existing.status}' status. Must be 'pending_manager'.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const updated = await this.repo.approveSwapByManager(
        ctx,
        id,
        ctx.userId!,
        input.notes
      );
      if (!updated) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message:
              "Failed to approve swap request. It may have been modified concurrently.",
          },
        };
      }

      return { success: true, data: this.formatSwapRequest(updated) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, swapRequestId: id }, "Failed to approve shift swap request");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to approve shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // Manager: Reject
  // ===========================================================================

  async rejectSwapByManager(
    ctx: TenantContext,
    id: string,
    input: ManagerApproval
  ): Promise<ServiceResult<unknown>> {
    try {
      const existing = await this.repo.getSwapRequestById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND,
            message: "Shift swap request not found",
          },
        };
      }

      if (existing.status !== "pending_manager") {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot reject a swap request in '${existing.status}' status. Must be 'pending_manager'.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const updated = await this.repo.rejectSwapByManager(
        ctx,
        id,
        ctx.userId!,
        input.notes
      );
      if (!updated) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message:
              "Failed to reject swap request. It may have been modified concurrently.",
          },
        };
      }

      return { success: true, data: this.formatSwapRequest(updated) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, swapRequestId: id }, "Failed to reject shift swap request by manager");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to reject shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // Requester: Cancel
  // ===========================================================================

  async cancelSwapRequest(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const existing = await this.repo.getSwapRequestById(ctx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND,
            message: "Shift swap request not found",
          },
        };
      }

      const employee = await this.repo.getEmployeeForUser(ctx, ctx.userId!);
      if (!employee || employee.id !== existing.requesterId) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.NOT_REQUESTER,
            message: "Only the requester can cancel this swap request",
          },
        };
      }

      if (
        existing.status !== "pending_target" &&
        existing.status !== "pending_manager"
      ) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot cancel a swap request in '${existing.status}' status. Must be 'pending_target' or 'pending_manager'.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const updated = await this.repo.cancelSwapRequest(
        ctx,
        id,
        employee.id
      );
      if (!updated) {
        return {
          success: false,
          error: {
            code: ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION,
            message:
              "Failed to cancel swap request. It may have been modified concurrently.",
          },
        };
      }

      return { success: true, data: this.formatSwapRequest(updated) };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, swapRequestId: id }, "Failed to cancel shift swap request");
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to cancel shift swap request",
        },
      };
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private formatSwapRequest(row: any) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      requesterId: row.requesterId,
      requesterAssignmentId: row.requesterAssignmentId,
      targetEmployeeId: row.targetEmployeeId,
      targetAssignmentId: row.targetAssignmentId,
      status: row.status,
      reason: row.reason,
      targetAccepted: row.targetAccepted,
      targetResponseAt:
        row.targetResponseAt instanceof Date
          ? row.targetResponseAt.toISOString()
          : row.targetResponseAt || null,
      targetResponseNotes: row.targetResponseNotes || null,
      approvedBy: row.approvedBy || null,
      approvedAt:
        row.approvedAt instanceof Date
          ? row.approvedAt.toISOString()
          : row.approvedAt || null,
      approvalNotes: row.approvalNotes || null,
      managerResponseAt:
        row.managerResponseAt instanceof Date
          ? row.managerResponseAt.toISOString()
          : row.managerResponseAt || null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : row.updatedAt,
    };
  }
}
