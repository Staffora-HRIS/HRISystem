/**
 * Overtime Requests Module - Service Layer
 *
 * Implements business logic for overtime authorisation workflow.
 *
 * Enforces:
 * - State machine: pending -> approved / rejected / cancelled
 * - Only pending requests can be approved, rejected, or cancelled
 * - Approver cannot be the requesting employee
 * - Outbox pattern for domain events
 * - Planned hours must be positive
 *
 * State machine:
 *   pending -> approved  (manager approves)
 *   pending -> rejected  (manager rejects with reason)
 *   pending -> cancelled (employee withdraws)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  OvertimeRequestRepository,
  OvertimeRequestRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateOvertimeRequest,
  ApproveOvertimeRequest,
  RejectOvertimeRequest,
  OvertimeRequestFilters,
  OvertimeRequestResponse,
  OvertimeRequestStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Valid Transitions
// =============================================================================

const VALID_TRANSITIONS: Record<OvertimeRequestStatus, OvertimeRequestStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: [],
};

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "overtime_request.created"
  | "overtime_request.approved"
  | "overtime_request.rejected"
  | "overtime_request.cancelled";

// =============================================================================
// Service
// =============================================================================

export class OvertimeRequestService {
  constructor(
    private repository: OvertimeRequestRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: DomainEventType,
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
        'overtime_request',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private formatDate(value: Date | string | null): string | null {
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString().split("T")[0];
    return String(value);
  }

  private formatTimestamp(value: Date | string | null): string | null {
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private formatTimestampRequired(value: Date | string): string {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  /**
   * Map a database row to the API response shape
   */
  private mapToResponse(row: OvertimeRequestRow): OvertimeRequestResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      request_type: row.requestType,
      authorisation_type: row.authorisationType || "pre_approval",
      date: this.formatDate(row.date) || "",
      planned_hours: Number(row.plannedHours),
      actual_hours: row.actualHours !== null ? Number(row.actualHours) : null,
      reason: row.reason,
      status: row.status,
      approver_id: row.approverId,
      approved_at: this.formatTimestamp(row.approvedAt),
      rejection_reason: row.rejectionReason,
      manager_notes: row.managerNotes || null,
      created_at: this.formatTimestampRequired(row.createdAt),
      updated_at: this.formatTimestampRequired(row.updatedAt),
    };
  }

  /**
   * Build a not-found error result
   */
  private notFoundError(id: string): ServiceResult<OvertimeRequestResponse> {
    return {
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: "Overtime request not found",
        details: { id },
      },
    };
  }

  /**
   * Validate a state transition
   */
  private checkTransition(
    currentStatus: OvertimeRequestStatus,
    targetStatus: OvertimeRequestStatus
  ): ServiceResult<OvertimeRequestResponse> | null {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${currentStatus}' to '${targetStatus}'.`,
          details: {
            current_status: currentStatus,
            target_status: targetStatus,
            allowed_transitions: allowed,
          },
        },
      };
    }
    return null;
  }

  // ===========================================================================
  // createRequest
  // ===========================================================================

  /**
   * Submit a new overtime request.
   *
   * Creates the request in pending status and emits a domain event.
   */
  async createRequest(
    context: TenantContext,
    data: CreateOvertimeRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<OvertimeRequestResponse>> {
    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.create(
        context,
        {
          employeeId: data.employee_id,
          requestType: data.request_type ?? "planned",
          authorisationType: data.authorisation_type ?? "pre_approval",
          date: data.date,
          plannedHours: data.planned_hours,
          actualHours: data.actual_hours ?? null,
          reason: data.reason,
        },
        tx
      );

      // Emit domain event in same transaction
      await this.emitEvent(tx, context, row.id, "overtime_request.created", {
        request: this.mapToResponse(row),
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // getRequest
  // ===========================================================================

  async getRequest(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<OvertimeRequestResponse>> {
    const row = await this.repository.findById(context, id);
    if (!row) return this.notFoundError(id);

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // listMyRequests
  // ===========================================================================

  /**
   * List overtime requests for a specific employee (self-service).
   */
  async listMyRequests(
    context: TenantContext,
    employeeId: string,
    filters: OvertimeRequestFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<OvertimeRequestResponse>> {
    const result = await this.repository.findAll(
      context,
      { ...filters, employee_id: employeeId },
      pagination
    );

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // listPendingRequests (manager view)
  // ===========================================================================

  /**
   * List pending overtime requests visible to a manager for approval.
   */
  async listPendingRequests(
    context: TenantContext,
    approverId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<OvertimeRequestResponse>> {
    const result = await this.repository.findPendingForApprover(
      context,
      approverId,
      pagination
    );

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // approveRequest
  // ===========================================================================

  /**
   * Approve an overtime request.
   *
   * Validates:
   * - Request exists and is pending
   * - Approver is not the requesting employee
   *
   * Optionally updates actual_hours at approval time.
   */
  async approveRequest(
    context: TenantContext,
    id: string,
    data: ApproveOvertimeRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<OvertimeRequestResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    const transitionError = this.checkTransition(existing.status, "approved");
    if (transitionError) return transitionError;

    // Approver must not be the employee who made the request
    if (context.userId && context.userId === existing.employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "You cannot approve your own overtime request.",
          details: { employee_id: existing.employeeId },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const approverId = context.userId || "";
      const row = await this.repository.approve(
        context,
        id,
        approverId,
        data.actual_hours ?? null,
        data.manager_notes ?? null,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.emitEvent(tx, context, id, "overtime_request.approved", {
        request: this.mapToResponse(row),
        approver_id: approverId,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // rejectRequest
  // ===========================================================================

  /**
   * Reject an overtime request.
   *
   * Validates:
   * - Request exists and is pending
   * - Approver is not the requesting employee
   * - Rejection reason is provided
   */
  async rejectRequest(
    context: TenantContext,
    id: string,
    data: RejectOvertimeRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<OvertimeRequestResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    const transitionError = this.checkTransition(existing.status, "rejected");
    if (transitionError) return transitionError;

    // Approver must not be the employee who made the request
    if (context.userId && context.userId === existing.employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "You cannot reject your own overtime request.",
          details: { employee_id: existing.employeeId },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const approverId = context.userId || "";
      const row = await this.repository.reject(
        context,
        id,
        approverId,
        data.rejection_reason,
        data.manager_notes ?? null,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.emitEvent(tx, context, id, "overtime_request.rejected", {
        request: this.mapToResponse(row),
        approver_id: approverId,
        rejection_reason: data.rejection_reason,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // cancelRequest
  // ===========================================================================

  /**
   * Cancel an overtime request (employee self-service).
   *
   * Only the requesting employee (or someone with write permission) can cancel.
   * Only pending requests can be cancelled.
   */
  async cancelRequest(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<OvertimeRequestResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    const transitionError = this.checkTransition(existing.status, "cancelled");
    if (transitionError) return transitionError;

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.cancel(context, id, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.emitEvent(tx, context, id, "overtime_request.cancelled", {
        request: this.mapToResponse(row),
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }
}
