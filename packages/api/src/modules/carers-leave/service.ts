/**
 * Carer's Leave Module - Service Layer
 *
 * Business logic for managing carer's leave entitlements under the
 * Carer's Leave Act 2023 (c. 18).
 *
 * Key statutory rules enforced:
 *   - 1 week (5 days) unpaid leave per rolling 12-month period
 *   - Day-one right (no qualifying service period)
 *   - Leave year boundaries are configurable per tenant
 *   - days_used cannot exceed total_days_available
 *   - One entitlement record per employee per leave year (DB unique constraint)
 *
 * Emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  CarersLeaveRepository,
  EntitlementRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateEntitlement,
  UpdateEntitlement,
  StatusTransition,
  EntitlementFilters,
  PaginationQuery,
  EntitlementResponse,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * Statutory maximum entitlement in days per year.
 * Carer's Leave Act 2023 grants 1 week = 5 working days for full-time.
 */
const STATUTORY_MAX_DAYS = 5;

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "carers_leave.entitlement.created"
  | "carers_leave.entitlement.updated"
  | "carers_leave.entitlement.approved"
  | "carers_leave.entitlement.rejected"
  | "carers_leave.entitlement.deleted";

// =============================================================================
// Service
// =============================================================================

export class CarersLeaveService {
  constructor(
    private repository: CarersLeaveRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction as the business write.
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
        ${"carers_leave_entitlement"},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // List Entitlements
  // ===========================================================================

  /**
   * List carer's leave entitlements with filters and pagination.
   */
  async listEntitlements(
    context: TenantContext,
    filters: EntitlementFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EntitlementResponse>> {
    const result = await this.repository.findEntitlements(
      context,
      filters,
      pagination
    );

    return {
      items: result.items.map(this.mapRowToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get Entitlement
  // ===========================================================================

  /**
   * Get a single entitlement by ID.
   */
  async getEntitlement(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    const row = await this.repository.findById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Carer's leave entitlement not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  // ===========================================================================
  // Create Entitlement
  // ===========================================================================

  /**
   * Create a new carer's leave entitlement for an employee and leave year.
   *
   * Validates:
   *   - leave_year_end > leave_year_start (DB constraint also enforces)
   *   - No duplicate entitlement for the same employee + leave year start
   *   - total_days_available does not exceed statutory maximum
   */
  async createEntitlement(
    context: TenantContext,
    data: CreateEntitlement,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    // Validate leave year range
    if (data.leave_year_end <= data.leave_year_start) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Leave year end date must be after leave year start date",
          details: {
            leave_year_start: data.leave_year_start,
            leave_year_end: data.leave_year_end,
          },
        },
      };
    }

    // Validate total days does not exceed statutory max
    const totalDays = data.total_days_available ?? STATUTORY_MAX_DAYS;
    if (totalDays > STATUTORY_MAX_DAYS) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Total days available cannot exceed statutory maximum of ${STATUTORY_MAX_DAYS} days`,
          details: {
            total_days_available: totalDays,
            statutory_maximum: STATUTORY_MAX_DAYS,
          },
        },
      };
    }

    // Check for duplicate entitlement for this employee + leave year
    const existing = await this.repository.findByEmployeeAndYear(
      context,
      data.employee_id,
      data.leave_year_start
    );
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message:
            "Entitlement already exists for this employee and leave year",
          details: {
            employee_id: data.employee_id,
            leave_year_start: data.leave_year_start,
            existing_id: existing.id,
          },
        },
      };
    }

    // Create entitlement in transaction with outbox event
    const row = await this.db.withTransaction(context, async (tx) => {
      const created = await this.repository.create(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        created.id,
        "carers_leave.entitlement.created",
        { entitlement: this.mapRowToResponse(created) }
      );

      return created;
    });

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  // ===========================================================================
  // Update Entitlement
  // ===========================================================================

  /**
   * Update an existing entitlement record.
   *
   * Used for:
   *   - Adjusting total_days_available (e.g. pro-rating for part-time)
   *   - Manual corrections to days_used
   *
   * Validates:
   *   - Entitlement exists
   *   - days_used does not exceed total_days_available after update
   */
  async updateEntitlement(
    context: TenantContext,
    id: string,
    data: UpdateEntitlement,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    // Check entitlement exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Carer's leave entitlement not found",
          details: { id },
        },
      };
    }

    // Validate that days_used will not exceed total_days_available after update
    const newTotal =
      data.total_days_available ?? Number(existing.totalDaysAvailable);
    const newUsed = data.days_used ?? Number(existing.daysUsed);

    if (newUsed > newTotal) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Days used cannot exceed total days available",
          details: {
            total_days_available: newTotal,
            days_used: newUsed,
          },
        },
      };
    }

    // Update in transaction with outbox event
    const row = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.update(tx, context, id, data);
      if (!updated) {
        throw new Error("Entitlement not found during update");
      }

      await this.emitEvent(
        tx,
        context,
        updated.id,
        "carers_leave.entitlement.updated",
        {
          entitlement: this.mapRowToResponse(updated),
          changes: data,
        }
      );

      return updated;
    });

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  // ===========================================================================
  // Status Transition (Approve / Reject)
  // ===========================================================================

  /**
   * Approve or reject a carer's leave usage.
   *
   * On approval:
   *   - Deducts days_to_deduct from the entitlement's remaining balance
   *   - Validates sufficient balance exists
   *
   * On rejection:
   *   - Records the rejection reason (the Act only allows postponement
   *     in limited circumstances, so rejection should be rare)
   */
  async transitionStatus(
    context: TenantContext,
    id: string,
    transition: StatusTransition,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    // Check entitlement exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Carer's leave entitlement not found",
          details: { id },
        },
      };
    }

    if (transition.status === "approved") {
      const daysToDeduct = transition.days_to_deduct ?? 0;

      if (daysToDeduct <= 0) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message:
              "days_to_deduct is required and must be positive when approving",
            details: { days_to_deduct: daysToDeduct },
          },
        };
      }

      // Check sufficient balance
      const currentUsed = Number(existing.daysUsed);
      const totalAvailable = Number(existing.totalDaysAvailable);
      const remaining = totalAvailable - currentUsed;

      if (daysToDeduct > remaining) {
        return {
          success: false,
          error: {
            code: "INSUFFICIENT_LEAVE_BALANCE",
            message: `Insufficient carer's leave balance. Requested ${daysToDeduct} days but only ${remaining} days remaining.`,
            details: {
              days_requested: daysToDeduct,
              days_remaining: remaining,
              days_used: currentUsed,
              total_available: totalAvailable,
            },
          },
        };
      }

      // Deduct days in transaction with outbox event
      const row = await this.db.withTransaction(context, async (tx) => {
        const updated = await this.repository.deductDays(
          tx,
          context,
          id,
          daysToDeduct
        );
        if (!updated) {
          throw new Error("Entitlement not found during deduction");
        }

        await this.emitEvent(
          tx,
          context,
          updated.id,
          "carers_leave.entitlement.approved",
          {
            entitlement: this.mapRowToResponse(updated),
            days_deducted: daysToDeduct,
            reason: transition.reason,
          }
        );

        return updated;
      });

      return {
        success: true,
        data: this.mapRowToResponse(row),
      };
    }

    // Rejection — no deduction, just emit event
    const row = await this.db.withTransaction(context, async (tx) => {
      // Re-read inside transaction for consistency
      const current = await tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id,
          leave_year_start, leave_year_end,
          total_days_available, days_used,
          created_at, updated_at
        FROM app.carers_leave_entitlements
        WHERE id = ${id}::uuid
      `;

      if (!current[0]) {
        throw new Error("Entitlement not found during rejection");
      }

      await this.emitEvent(
        tx,
        context,
        id,
        "carers_leave.entitlement.rejected",
        {
          entitlement: this.mapRowToResponse(current[0]),
          reason: transition.reason,
        }
      );

      return current[0];
    });

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  // ===========================================================================
  // Delete Entitlement
  // ===========================================================================

  /**
   * Delete a carer's leave entitlement.
   * Only entitlements with zero days_used can be deleted.
   */
  async deleteEntitlement(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Carer's leave entitlement not found",
          details: { id },
        },
      };
    }

    // Prevent deletion of entitlements that have been used
    if (Number(existing.daysUsed) > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message:
            "Cannot delete an entitlement that has days already used. Set days_used to 0 first if correction is needed.",
          details: {
            id,
            days_used: Number(existing.daysUsed),
          },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      const deleted = await this.repository.delete(tx, context, id);
      if (!deleted) {
        throw new Error("Entitlement not found during deletion");
      }

      await this.emitEvent(
        tx,
        context,
        id,
        "carers_leave.entitlement.deleted",
        { entitlement: this.mapRowToResponse(existing) }
      );
    });

    return {
      success: true,
      data: { deleted: true },
    };
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  /**
   * Map a database row to an API response object.
   * Converts numeric strings to numbers and adds computed fields.
   */
  private mapRowToResponse = (row: EntitlementRow): EntitlementResponse => {
    const totalDaysAvailable = Number(row.totalDaysAvailable);
    const daysUsed = Number(row.daysUsed);

    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      leave_year_start: row.leaveYearStart instanceof Date
        ? row.leaveYearStart.toISOString().split("T")[0]!
        : String(row.leaveYearStart),
      leave_year_end: row.leaveYearEnd instanceof Date
        ? row.leaveYearEnd.toISOString().split("T")[0]!
        : String(row.leaveYearEnd),
      total_days_available: totalDaysAvailable,
      days_used: daysUsed,
      days_remaining: Math.max(0, totalDaysAvailable - daysUsed),
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  };
}
