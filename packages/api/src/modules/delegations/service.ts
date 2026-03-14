/**
 * Approval Delegation Service
 *
 * Business logic for creating, querying, revoking, and validating
 * approval delegations. Enforces invariants such as:
 * - No self-delegation (DB constraint, but also checked here)
 * - No circular delegation chains
 * - No overlapping active delegations for the same scope
 * - Valid date ranges (end >= start)
 */

import {
  DelegationRepository,
  type DelegationRow,
  type DelegationListRow,
  type ActiveDelegationRow,
  type DelegationLogRow,
  type TenantContext,
} from "./repository";
import type { ServiceResult } from "../../types/service-result";
import type { CreateDelegation } from "./schemas";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Error Codes
// =============================================================================

export const DelegationErrorCodes = {
  DELEGATION_NOT_FOUND: "DELEGATION_NOT_FOUND",
  SELF_DELEGATION: "SELF_DELEGATION",
  CIRCULAR_DELEGATION: "CIRCULAR_DELEGATION",
  OVERLAPPING_DELEGATION: "OVERLAPPING_DELEGATION",
  INVALID_DATE_RANGE: "INVALID_DATE_RANGE",
  ALREADY_REVOKED: "ALREADY_REVOKED",
} as const;

// =============================================================================
// Formatted Types
// =============================================================================

interface FormattedDelegation {
  id: string;
  tenantId: string;
  delegatorId: string;
  delegateId: string;
  startDate: string;
  endDate: string;
  scope: string;
  scopeFilters: unknown;
  notifyDelegator: boolean;
  includePending: boolean;
  delegationReason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface FormattedDelegationListItem {
  delegationId: string;
  delegateName: string;
  scope: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  usageCount: number;
}

interface FormattedActiveDelegation {
  delegationId: string;
  delegateId: string;
  delegateName: string;
  scope: string;
  endDate: string;
}

interface FormattedLogEntry {
  id: string;
  tenantId: string;
  delegationId: string;
  workflowInstanceId: string | null;
  approvalType: string;
  approvalId: string;
  action: string;
  notes: string | null;
  performedBy: string;
  performedAt: string;
}

// =============================================================================
// Service
// =============================================================================

export class DelegationService {
  constructor(private repo: DelegationRepository) {}

  /**
   * Create a new approval delegation.
   *
   * Validations:
   * 1. delegator != delegate (no self-delegation)
   * 2. No circular delegation chain
   * 3. No overlapping active delegation for the same scope
   * 4. endDate >= startDate
   */
  async createDelegation(
    ctx: TenantContext,
    input: CreateDelegation
  ): Promise<ServiceResult<FormattedDelegation>> {
    try {
      const delegatorId = ctx.userId;
      if (!delegatorId) {
        return {
          success: false,
          error: { code: ErrorCodes.UNAUTHORIZED, message: "User context required" },
        };
      }

      // 1. No self-delegation
      if (delegatorId === input.delegateId) {
        return {
          success: false,
          error: {
            code: DelegationErrorCodes.SELF_DELEGATION,
            message: "You cannot delegate approvals to yourself",
          },
        };
      }

      // 2. Validate date range
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      if (endDate < startDate) {
        return {
          success: false,
          error: {
            code: DelegationErrorCodes.INVALID_DATE_RANGE,
            message: "End date must be on or after start date",
          },
        };
      }

      const scope = input.scope || "all";

      // 3. Check circular delegation
      const isCircular = await this.repo.wouldCreateCircularDelegation(
        ctx,
        delegatorId,
        input.delegateId
      );
      if (isCircular) {
        return {
          success: false,
          error: {
            code: DelegationErrorCodes.CIRCULAR_DELEGATION,
            message:
              "This delegation would create a circular chain. The selected delegate already has an active delegation back to you.",
          },
        };
      }

      // 4. Check overlapping delegation
      const hasOverlap = await this.repo.hasOverlappingDelegation(
        ctx,
        delegatorId,
        scope,
        input.startDate,
        input.endDate
      );
      if (hasOverlap) {
        return {
          success: false,
          error: {
            code: DelegationErrorCodes.OVERLAPPING_DELEGATION,
            message:
              "An active delegation already exists for this scope and overlapping date range",
          },
        };
      }

      // Create the delegation
      const delegation = await this.repo.create(ctx, {
        delegatorId,
        delegateId: input.delegateId,
        startDate: input.startDate,
        endDate: input.endDate,
        scope,
        scopeFilters: input.scopeFilters,
        notifyDelegator: input.notifyDelegator,
        includePending: input.includePending,
        delegationReason: input.delegationReason,
        createdBy: delegatorId,
      });

      return { success: true, data: this.formatDelegation(delegation) };
    } catch (error) {
      console.error("Error creating delegation:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create delegation" },
      };
    }
  }

  /**
   * List all delegations created by the current user.
   */
  async listMyDelegations(
    ctx: TenantContext
  ): Promise<ServiceResult<FormattedDelegationListItem[]>> {
    try {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          error: { code: ErrorCodes.UNAUTHORIZED, message: "User context required" },
        };
      }

      const rows = await this.repo.listMyDelegations(ctx, userId);
      return { success: true, data: rows.map((r) => this.formatDelegationListItem(r)) };
    } catch (error) {
      console.error("Error listing delegations:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list delegations" },
      };
    }
  }

  /**
   * Get the currently active delegation for the authenticated user.
   */
  async getActiveDelegation(
    ctx: TenantContext,
    scope?: string
  ): Promise<ServiceResult<FormattedActiveDelegation | null>> {
    try {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          error: { code: ErrorCodes.UNAUTHORIZED, message: "User context required" },
        };
      }

      const row = await this.repo.getActiveDelegation(ctx, userId, scope);
      if (!row) {
        return { success: true, data: null };
      }

      return { success: true, data: this.formatActiveDelegation(row) };
    } catch (error) {
      console.error("Error fetching active delegation:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch active delegation" },
      };
    }
  }

  /**
   * Check if a given approver has an active delegation and return the delegate.
   * Used by other modules (e.g., absence) to resolve the actual approver.
   */
  async resolveApprover(
    ctx: TenantContext,
    approverId: string,
    scope?: string
  ): Promise<ServiceResult<{ originalApproverId: string; effectiveApproverId: string; delegationId: string | null }>> {
    try {
      const delegation = await this.repo.getActiveDelegation(ctx, approverId, scope);
      if (delegation) {
        return {
          success: true,
          data: {
            originalApproverId: approverId,
            effectiveApproverId: delegation.delegateId,
            delegationId: delegation.delegationId,
          },
        };
      }
      return {
        success: true,
        data: {
          originalApproverId: approverId,
          effectiveApproverId: approverId,
          delegationId: null,
        },
      };
    } catch (error) {
      console.error("Error resolving approver:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to resolve approver" },
      };
    }
  }

  /**
   * Revoke an active delegation. Only the delegator can revoke.
   */
  async revokeDelegation(
    ctx: TenantContext,
    delegationId: string
  ): Promise<ServiceResult<FormattedDelegation>> {
    try {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          error: { code: ErrorCodes.UNAUTHORIZED, message: "User context required" },
        };
      }

      const revoked = await this.repo.revoke(ctx, delegationId, userId);
      if (!revoked) {
        return {
          success: false,
          error: {
            code: DelegationErrorCodes.DELEGATION_NOT_FOUND,
            message: "Delegation not found, already revoked, or you are not the delegator",
          },
        };
      }

      return { success: true, data: this.formatDelegation(revoked) };
    } catch (error) {
      console.error("Error revoking delegation:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to revoke delegation" },
      };
    }
  }

  /**
   * Get the log entries for a specific delegation.
   * Verifies the delegation belongs to the current user first.
   */
  async getDelegationLog(
    ctx: TenantContext,
    delegationId: string
  ): Promise<ServiceResult<FormattedLogEntry[]>> {
    try {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          error: { code: ErrorCodes.UNAUTHORIZED, message: "User context required" },
        };
      }

      // Verify delegation exists and belongs to the user (as delegator or delegate)
      const delegation = await this.repo.getById(ctx, delegationId);
      if (!delegation) {
        return {
          success: false,
          error: {
            code: DelegationErrorCodes.DELEGATION_NOT_FOUND,
            message: "Delegation not found",
          },
        };
      }

      if (delegation.delegatorId !== userId && delegation.delegateId !== userId) {
        return {
          success: false,
          error: {
            code: ErrorCodes.FORBIDDEN,
            message: "You do not have access to this delegation log",
          },
        };
      }

      const entries = await this.repo.getLogEntries(ctx, delegationId);
      return { success: true, data: entries.map((e) => this.formatLogEntry(e)) };
    } catch (error) {
      console.error("Error fetching delegation log:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch delegation log" },
      };
    }
  }

  /**
   * Auto-expire all past delegations for the given tenant.
   * Intended to be called by a scheduled job.
   */
  async autoExpire(ctx: TenantContext): Promise<ServiceResult<{ expiredCount: number }>> {
    try {
      const count = await this.repo.autoExpirePastDelegations(ctx);
      return { success: true, data: { expiredCount: count } };
    } catch (error) {
      console.error("Error auto-expiring delegations:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to auto-expire delegations" },
      };
    }
  }

  // =============================================================================
  // Formatters
  // =============================================================================

  private formatDelegation(row: DelegationRow): FormattedDelegation {
    return {
      id: row.id,
      tenantId: row.tenantId,
      delegatorId: row.delegatorId,
      delegateId: row.delegateId,
      startDate:
        row.startDate instanceof Date
          ? row.startDate.toISOString().split("T")[0]
          : String(row.startDate),
      endDate:
        row.endDate instanceof Date
          ? row.endDate.toISOString().split("T")[0]
          : String(row.endDate),
      scope: row.scope,
      scopeFilters: row.scopeFilters,
      notifyDelegator: row.notifyDelegator,
      includePending: row.includePending,
      delegationReason: row.delegationReason,
      isActive: row.isActive,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
      createdBy: row.createdBy,
    };
  }

  private formatDelegationListItem(row: DelegationListRow): FormattedDelegationListItem {
    return {
      delegationId: row.delegationId,
      delegateName: row.delegateName,
      scope: row.scope,
      startDate:
        row.startDate instanceof Date
          ? row.startDate.toISOString().split("T")[0]
          : String(row.startDate),
      endDate:
        row.endDate instanceof Date
          ? row.endDate.toISOString().split("T")[0]
          : String(row.endDate),
      isActive: row.isActive,
      usageCount: Number(row.usageCount),
    };
  }

  private formatActiveDelegation(row: ActiveDelegationRow): FormattedActiveDelegation {
    return {
      delegationId: row.delegationId,
      delegateId: row.delegateId,
      delegateName: row.delegateName,
      scope: row.scope,
      endDate:
        row.endDate instanceof Date
          ? row.endDate.toISOString().split("T")[0]
          : String(row.endDate),
    };
  }

  private formatLogEntry(row: DelegationLogRow): FormattedLogEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      delegationId: row.delegationId,
      workflowInstanceId: row.workflowInstanceId,
      approvalType: row.approvalType,
      approvalId: row.approvalId,
      action: row.action,
      notes: row.notes,
      performedBy: row.performedBy,
      performedAt:
        row.performedAt instanceof Date
          ? row.performedAt.toISOString()
          : String(row.performedAt),
    };
  }
}
