/**
 * Reasonable Adjustments Module - Service Layer
 *
 * Implements business logic for reasonable adjustment tracking.
 * Enforces status transition rules, validates input, and emits
 * domain events via the outbox pattern.
 *
 * Equality Act 2010 (ss.20-22) duty to make reasonable adjustments.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ReasonableAdjustmentsRepository,
  AdjustmentRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateAdjustment,
  AssessAdjustment,
  DecideAdjustment,
  ImplementAdjustment,
  AdjustmentFilters,
  AdjustmentResponse,
  AdjustmentListItem,
  AdjustmentStatus,
  PaginationQuery,
  DueReviewItem,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

/**
 * Valid status transitions for reasonable adjustments.
 *
 * requested     -> under_review, withdrawn
 * under_review  -> approved, rejected, withdrawn
 * approved      -> implemented
 * implemented   -> (terminal, but may get new review_date)
 * rejected      -> (terminal)
 * withdrawn     -> (terminal)
 */
const VALID_STATUS_TRANSITIONS: Record<AdjustmentStatus, AdjustmentStatus[]> = {
  requested: ["under_review", "withdrawn"],
  under_review: ["approved", "rejected", "withdrawn"],
  approved: ["implemented"],
  implemented: [],
  rejected: [],
  withdrawn: [],
};

/**
 * Domain event types
 */
type DomainEventType =
  | "hr.reasonable_adjustment.created"
  | "hr.reasonable_adjustment.assessed"
  | "hr.reasonable_adjustment.approved"
  | "hr.reasonable_adjustment.rejected"
  | "hr.reasonable_adjustment.implemented"
  | "hr.reasonable_adjustment.withdrawn";

// =============================================================================
// Service
// =============================================================================

export class ReasonableAdjustmentsService {
  constructor(
    private repository: ReasonableAdjustmentsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox (same transaction as business write)
   */
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
        'reasonable_adjustment',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Status Transition Validation
  // ===========================================================================

  /**
   * Validate that a status transition is allowed
   */
  private isValidTransition(from: AdjustmentStatus, to: AdjustmentStatus): boolean {
    return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  /**
   * Create a new reasonable adjustment request
   */
  async create(
    context: TenantContext,
    data: CreateAdjustment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<AdjustmentResponse>> {
    // Validate the employee exists
    const employeeCheck = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx`
        SELECT id FROM app.employees WHERE id = ${data.employee_id}::uuid
      `;
      return rows.length > 0;
    });

    if (!employeeCheck) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: data.employee_id },
        },
      };
    }

    // Create in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.create(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        row.id,
        "hr.reasonable_adjustment.created",
        { adjustment: this.mapRowToResponse(row) }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapRowToResponse(result),
    };
  }

  // ===========================================================================
  // Read
  // ===========================================================================

  /**
   * Get a single adjustment by ID
   */
  async getById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<AdjustmentResponse>> {
    const row = await this.repository.findById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Reasonable adjustment not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  /**
   * List adjustments with filters and pagination
   */
  async list(
    context: TenantContext,
    filters: AdjustmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<AdjustmentListItem>> {
    const result = await this.repository.findAll(context, filters, pagination);

    return {
      items: result.items.map(this.mapRowToListItem),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Find adjustments with reviews due on or before today
   */
  async getDueReviews(
    context: TenantContext
  ): Promise<ServiceResult<DueReviewItem[]>> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await this.repository.findDueReviews(context, today);

    const items: DueReviewItem[] = rows.map((row) => {
      const reviewDate = row.reviewDate
        ? new Date(row.reviewDate).toISOString().split("T")[0]
        : today;
      const daysOverdue = Math.floor(
        (new Date(today).getTime() - new Date(reviewDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      return {
        id: row.id,
        employee_id: row.employeeId,
        description: row.description,
        category: row.category,
        review_date: reviewDate,
        implementation_date: row.implementationDate
          ? new Date(row.implementationDate).toISOString().split("T")[0]
          : null,
        days_overdue: daysOverdue,
      };
    });

    return {
      success: true,
      data: items,
    };
  }

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  /**
   * Assess an adjustment (requested -> under_review)
   */
  async assess(
    context: TenantContext,
    id: string,
    data: AssessAdjustment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<AdjustmentResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, id);

      if (!existing) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Reasonable adjustment not found",
            details: { id },
          },
        };
      }

      // Validate transition: only requested -> under_review
      if (!this.isValidTransition(existing.status, "under_review")) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot assess adjustment in '${existing.status}' status. Must be 'requested'.`,
            details: {
              current_status: existing.status,
              target_status: "under_review",
              allowed_transitions: VALID_STATUS_TRANSITIONS[existing.status],
            },
          },
        };
      }

      const updated = await this.repository.assess(
        tx,
        id,
        context.userId || "system",
        data.assessment_notes
      );

      await this.emitEvent(
        tx,
        context,
        id,
        "hr.reasonable_adjustment.assessed",
        { adjustment: this.mapRowToResponse(updated) }
      );

      return {
        success: true as const,
        data: this.mapRowToResponse(updated),
      };
    });

    return result;
  }

  /**
   * Decide on an adjustment (under_review -> approved or rejected)
   */
  async decide(
    context: TenantContext,
    id: string,
    data: DecideAdjustment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<AdjustmentResponse>> {
    // Validate: rejection must include reason
    if (data.decision === "rejected" && !data.rejection_reason) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Rejection reason is required when rejecting an adjustment",
          details: { field: "rejection_reason" },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, id);

      if (!existing) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Reasonable adjustment not found",
            details: { id },
          },
        };
      }

      // Validate transition
      if (!this.isValidTransition(existing.status, data.decision)) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot ${data.decision === "approved" ? "approve" : "reject"} adjustment in '${existing.status}' status. Must be 'under_review'.`,
            details: {
              current_status: existing.status,
              target_status: data.decision,
              allowed_transitions: VALID_STATUS_TRANSITIONS[existing.status],
            },
          },
        };
      }

      const updated = await this.repository.decide(
        tx,
        id,
        context.userId || "system",
        data.decision,
        data.rejection_reason ?? null,
        data.review_date ?? null,
        data.cost_estimate ?? null
      );

      const eventType: DomainEventType =
        data.decision === "approved"
          ? "hr.reasonable_adjustment.approved"
          : "hr.reasonable_adjustment.rejected";

      await this.emitEvent(
        tx,
        context,
        id,
        eventType,
        { adjustment: this.mapRowToResponse(updated) }
      );

      return {
        success: true as const,
        data: this.mapRowToResponse(updated),
      };
    });

    return result;
  }

  /**
   * Implement an adjustment (approved -> implemented)
   */
  async implement(
    context: TenantContext,
    id: string,
    data: ImplementAdjustment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<AdjustmentResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, id);

      if (!existing) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Reasonable adjustment not found",
            details: { id },
          },
        };
      }

      // Validate transition: only approved -> implemented
      if (!this.isValidTransition(existing.status, "implemented")) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot implement adjustment in '${existing.status}' status. Must be 'approved'.`,
            details: {
              current_status: existing.status,
              target_status: "implemented",
              allowed_transitions: VALID_STATUS_TRANSITIONS[existing.status],
            },
          },
        };
      }

      const updated = await this.repository.implement(
        tx,
        id,
        data.implementation_notes ?? null,
        data.actual_cost ?? null,
        data.review_date ?? null
      );

      await this.emitEvent(
        tx,
        context,
        id,
        "hr.reasonable_adjustment.implemented",
        { adjustment: this.mapRowToResponse(updated) }
      );

      return {
        success: true as const,
        data: this.mapRowToResponse(updated),
      };
    });

    return result;
  }

  /**
   * Withdraw an adjustment (requested or under_review -> withdrawn)
   */
  async withdraw(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<AdjustmentResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const existing = await this.repository.findByIdForUpdate(tx, id);

      if (!existing) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Reasonable adjustment not found",
            details: { id },
          },
        };
      }

      // Validate transition: only requested or under_review -> withdrawn
      if (!this.isValidTransition(existing.status, "withdrawn")) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot withdraw adjustment in '${existing.status}' status. Must be 'requested' or 'under_review'.`,
            details: {
              current_status: existing.status,
              target_status: "withdrawn",
              allowed_transitions: VALID_STATUS_TRANSITIONS[existing.status],
            },
          },
        };
      }

      const updated = await this.repository.withdraw(tx, id);

      await this.emitEvent(
        tx,
        context,
        id,
        "hr.reasonable_adjustment.withdrawn",
        { adjustment: this.mapRowToResponse(updated) }
      );

      return {
        success: true as const,
        data: this.mapRowToResponse(updated),
      };
    });

    return result;
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  /**
   * Map database row to full API response
   */
  private mapRowToResponse(row: AdjustmentRow): AdjustmentResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      requested_date: row.requestedDate instanceof Date
        ? row.requestedDate.toISOString().split("T")[0]
        : String(row.requestedDate),
      requested_by: row.requestedBy,
      description: row.description,
      reason: row.reason,
      category: row.category,
      status: row.status,
      assessment_date: row.assessmentDate instanceof Date
        ? row.assessmentDate.toISOString().split("T")[0]
        : row.assessmentDate ? String(row.assessmentDate) : null,
      assessed_by: row.assessedBy,
      assessment_notes: row.assessmentNotes,
      decision_date: row.decisionDate instanceof Date
        ? row.decisionDate.toISOString().split("T")[0]
        : row.decisionDate ? String(row.decisionDate) : null,
      decided_by: row.decidedBy,
      rejection_reason: row.rejectionReason,
      implementation_date: row.implementationDate instanceof Date
        ? row.implementationDate.toISOString().split("T")[0]
        : row.implementationDate ? String(row.implementationDate) : null,
      implementation_notes: row.implementationNotes,
      review_date: row.reviewDate instanceof Date
        ? row.reviewDate.toISOString().split("T")[0]
        : row.reviewDate ? String(row.reviewDate) : null,
      cost_estimate: row.costEstimate ? Number(row.costEstimate) : null,
      actual_cost: row.actualCost ? Number(row.actualCost) : null,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  /**
   * Map database row to list item (summary)
   */
  private mapRowToListItem = (row: AdjustmentRow): AdjustmentListItem => {
    return {
      id: row.id,
      employee_id: row.employeeId,
      requested_date: row.requestedDate instanceof Date
        ? row.requestedDate.toISOString().split("T")[0]
        : String(row.requestedDate),
      requested_by: row.requestedBy,
      description: row.description,
      category: row.category,
      status: row.status,
      review_date: row.reviewDate instanceof Date
        ? row.reviewDate.toISOString().split("T")[0]
        : row.reviewDate ? String(row.reviewDate) : null,
      cost_estimate: row.costEstimate ? Number(row.costEstimate) : null,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  };
}
