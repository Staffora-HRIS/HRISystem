/**
 * TUPE Transfers Module - Service Layer
 *
 * Business logic for TUPE (Transfer of Undertakings Protection of Employment)
 * transfer management. Handles validation, state transitions, employee consent
 * tracking, and domain events via the outbox pattern.
 *
 * UK Legal Context:
 * TUPE Regulations 2006 (as amended 2014) impose strict obligations on both
 * transferor and transferee employers:
 * - Regulation 11: Duty to inform employee representatives
 * - Regulation 13: Duty to consult with employee representatives
 * - Regulation 4: Automatic transfer of employment contracts
 * - Regulation 7: Dismissals connected with transfer are automatically unfair
 *
 * Status transitions (state machine):
 *   planning     -> consultation
 *   consultation -> in_progress | cancelled
 *   in_progress  -> completed | cancelled
 *   completed    -> (terminal)
 *   cancelled    -> (terminal)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  TupeRepository,
  type TenantContext,
  type TupeTransferRow,
  type TupeAffectedEmployeeRow,
} from "./repository";
import type {
  CreateTupeTransfer,
  UpdateTupeTransfer,
  TupeTransferFilters,
  AddAffectedEmployee,
  UpdateConsent,
  PaginationQuery,
  TupeTransferStatus,
} from "./schemas";
import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid status transitions for TUPE transfers.
 */
const VALID_STATUS_TRANSITIONS: Record<TupeTransferStatus, TupeTransferStatus[]> = {
  planning: ["consultation"],
  consultation: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Serialise a TupeTransferRow for API responses.
 */
function serialiseTransfer(row: TupeTransferRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    transferName: row.transferName,
    transferorOrg: row.transferorOrg,
    transfereeOrg: row.transfereeOrg,
    transferDate: row.transferDate instanceof Date
      ? row.transferDate.toISOString().split("T")[0]
      : row.transferDate ?? null,
    status: row.status,
    employeeCount: Number(row.employeeCount),
    notes: row.notes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Serialise a TupeAffectedEmployeeRow for API responses.
 */
function serialiseAffectedEmployee(row: TupeAffectedEmployeeRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    transferId: row.transferId,
    employeeId: row.employeeId,
    employeeName: (row as any).employeeName ?? null,
    consentStatus: row.consentStatus,
    newTermsAccepted: row.newTermsAccepted,
    transferCompleted: row.transferCompleted,
    notes: row.notes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class TupeService {
  constructor(
    private repository: TupeRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Transfer Query Operations
  // ===========================================================================

  /**
   * List TUPE transfers with optional filters and cursor-based pagination
   */
  async listTransfers(
    ctx: TenantContext,
    filters: TupeTransferFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<Record<string, unknown>>> {
    const result = await this.repository.findAllTransfers(ctx, filters, pagination);

    return {
      items: result.items.map(serialiseTransfer),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single TUPE transfer by ID
   */
  async getTransfer(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const transfer = await this.repository.findTransferById(ctx, id);

      if (!transfer) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "TUPE transfer not found",
          },
        };
      }

      return { success: true, data: serialiseTransfer(transfer) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to fetch TUPE transfer",
        },
      };
    }
  }

  /**
   * Get status transition history for a transfer
   */
  async getStatusHistory(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<Record<string, unknown>[]>> {
    const transfer = await this.repository.findTransferById(ctx, id);
    if (!transfer) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    try {
      const history = await this.repository.getStatusHistory(ctx, id);
      return { success: true, data: history as unknown as Record<string, unknown>[] };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to fetch status history",
        },
      };
    }
  }

  // ===========================================================================
  // Transfer Mutating Operations
  // ===========================================================================

  /**
   * Create a new TUPE transfer.
   *
   * Validates input and writes an outbox event atomically.
   * Initial status is always 'planning'.
   */
  async createTransfer(
    ctx: TenantContext,
    data: CreateTupeTransfer,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const transfer = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createTransfer(tx, ctx, data);

          // Record initial status in history
          await this.repository.recordStatusChange(
            tx, ctx, result.id, null, "planning", "TUPE transfer created"
          );

          // Emit domain event atomically
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "tupe_transfer",
            aggregateId: result.id,
            eventType: "hr.tupe_transfer.created",
            payload: {
              transferId: result.id,
              transferName: data.transferName,
              transferorOrg: data.transferorOrg,
              transfereeOrg: data.transfereeOrg,
              transferDate: data.transferDate,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: serialiseTransfer(transfer) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create TUPE transfer",
        },
      };
    }
  }

  /**
   * Update a TUPE transfer.
   *
   * Validates status transitions if status is being changed.
   * Terminal-state transfers cannot be modified (except notes).
   */
  async updateTransfer(
    ctx: TenantContext,
    id: string,
    data: UpdateTupeTransfer,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Verify transfer exists
    const existing = await this.repository.findTransferById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    // Validate status transition if status is being changed
    if (data.status && data.status !== existing.status) {
      const currentStatus = existing.status as TupeTransferStatus;
      const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
      if (!validTransitions.includes(data.status as TupeTransferStatus)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition TUPE transfer from '${existing.status}' to '${data.status}'`,
            details: {
              currentStatus: existing.status,
              requestedStatus: data.status,
              validTransitions,
            },
          },
        };
      }

      // Validate: cannot move to 'in_progress' without at least one affected employee
      if (data.status === "in_progress" && existing.employeeCount === 0) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Cannot start a TUPE transfer with no affected employees. Add employees before moving to 'in_progress'.",
          },
        };
      }
    }

    // Prevent modification of terminal-state transfers (except notes)
    const terminalStatuses = ["completed", "cancelled"];
    if (terminalStatuses.includes(existing.status) && !data.status) {
      const dataKeys = Object.keys(data).filter(k => data[k as keyof UpdateTupeTransfer] !== undefined);
      const nonNotesKeys = dataKeys.filter(k => k !== "notes");
      if (nonNotesKeys.length > 0) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot modify a TUPE transfer in '${existing.status}' status (only notes can be updated)`,
            details: { currentStatus: existing.status, attemptedFields: nonNotesKeys },
          },
        };
      }
    }

    try {
      const transfer = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateTransfer(tx, id, data, ctx.userId);

          if (!result) {
            return null;
          }

          // Record status change if applicable
          if (data.status && data.status !== existing.status) {
            await this.repository.recordStatusChange(
              tx, ctx, id, existing.status, data.status
            );
          }

          // Emit domain event
          const eventType = data.status && data.status !== existing.status
            ? "hr.tupe_transfer.status_changed"
            : "hr.tupe_transfer.updated";

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "tupe_transfer",
            aggregateId: id,
            eventType,
            payload: {
              transferId: id,
              changes: data,
              previousStatus: existing.status,
              newStatus: data.status || existing.status,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!transfer) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update TUPE transfer",
          },
        };
      }

      return { success: true, data: serialiseTransfer(transfer) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update TUPE transfer",
        },
      };
    }
  }

  /**
   * Delete a TUPE transfer.
   *
   * Only transfers in 'planning' status can be deleted.
   */
  async deleteTransfer(
    ctx: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<{ message: string }>> {
    const existing = await this.repository.findTransferById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    if (existing.status !== "planning") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot delete a TUPE transfer with status '${existing.status}'. Only transfers in 'planning' status can be deleted.`,
          details: { currentStatus: existing.status, validStatuses: ["planning"] },
        },
      };
    }

    try {
      const deleted = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.deleteTransfer(tx, id);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "tupe_transfer",
              aggregateId: id,
              eventType: "hr.tupe_transfer.deleted",
              payload: {
                transferId: id,
                transferName: existing.transferName,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!deleted) {
        return {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete TUPE transfer. It may have changed status.",
          },
        };
      }

      return { success: true, data: { message: "TUPE transfer deleted successfully" } };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error instanceof Error ? error.message : "Failed to delete TUPE transfer",
        },
      };
    }
  }

  // ===========================================================================
  // Affected Employee Operations
  // ===========================================================================

  /**
   * List affected employees for a transfer
   */
  async listAffectedEmployees(
    ctx: TenantContext,
    transferId: string,
    pagination: PaginationQuery = {}
  ): Promise<ServiceResult<PaginatedServiceResult<Record<string, unknown>>>> {
    // Verify transfer exists
    const transfer = await this.repository.findTransferById(ctx, transferId);
    if (!transfer) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    const result = await this.repository.findAffectedEmployees(ctx, transferId, pagination);

    return {
      success: true,
      data: {
        items: result.items.map(serialiseAffectedEmployee),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  /**
   * Add an affected employee to a TUPE transfer.
   *
   * Validates employee exists and is not already assigned.
   * Cannot add employees to completed or cancelled transfers.
   */
  async addAffectedEmployee(
    ctx: TenantContext,
    transferId: string,
    data: AddAffectedEmployee,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Verify transfer exists
    const transfer = await this.repository.findTransferById(ctx, transferId);
    if (!transfer) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    // Cannot add to completed or cancelled transfers
    if (transfer.status === "completed" || transfer.status === "cancelled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot add employees to a TUPE transfer with status '${transfer.status}'`,
        },
      };
    }

    // Validate employee exists
    const employeeExists = await this.repository.employeeExists(ctx, data.employeeId);
    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
        },
      };
    }

    // Check if already assigned
    const alreadyAssigned = await this.repository.employeeAlreadyAssigned(
      ctx, transferId, data.employeeId
    );
    if (alreadyAssigned) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Employee is already assigned to this TUPE transfer",
        },
      };
    }

    try {
      const affectedEmployee = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.addAffectedEmployee(tx, ctx, transferId, data);

          // Update employee count on the transfer
          await this.repository.refreshEmployeeCount(tx, transferId);

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "tupe_transfer",
            aggregateId: transferId,
            eventType: "hr.tupe_transfer.employee_added",
            payload: {
              transferId,
              employeeId: data.employeeId,
              affectedEmployeeId: result.id,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: serialiseAffectedEmployee(affectedEmployee) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to add affected employee",
        },
      };
    }
  }

  /**
   * Update consent status for an affected employee.
   *
   * Under TUPE Regulation 4(7)-(9), an employee may object to the transfer.
   * If they object, their employment terminates with the transferor on the
   * transfer date (they are not dismissed -- the employment simply ends).
   */
  async updateConsent(
    ctx: TenantContext,
    transferId: string,
    employeeId: string,
    data: UpdateConsent,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Verify transfer exists
    const transfer = await this.repository.findTransferById(ctx, transferId);
    if (!transfer) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    // Cannot update consent on completed or cancelled transfers
    if (transfer.status === "completed" || transfer.status === "cancelled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot update consent on a TUPE transfer with status '${transfer.status}'`,
        },
      };
    }

    // Verify the employee is assigned to this transfer
    const existing = await this.repository.findAffectedEmployee(ctx, transferId, employeeId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee is not assigned to this TUPE transfer",
        },
      };
    }

    try {
      const updated = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateConsent(
            tx,
            transferId,
            employeeId,
            data.consentStatus,
            data.newTermsAccepted,
            data.notes,
            ctx.userId
          );

          if (!result) {
            return null;
          }

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "tupe_transfer",
            aggregateId: transferId,
            eventType: "hr.tupe_transfer.consent_updated",
            payload: {
              transferId,
              employeeId,
              previousConsentStatus: existing.consentStatus,
              newConsentStatus: data.consentStatus,
              newTermsAccepted: data.newTermsAccepted,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update consent status",
          },
        };
      }

      return { success: true, data: serialiseAffectedEmployee(updated) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update consent status",
        },
      };
    }
  }

  /**
   * Remove an affected employee from a TUPE transfer.
   *
   * Cannot remove from completed or cancelled transfers.
   */
  async removeAffectedEmployee(
    ctx: TenantContext,
    transferId: string,
    employeeId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<{ message: string }>> {
    // Verify transfer exists
    const transfer = await this.repository.findTransferById(ctx, transferId);
    if (!transfer) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "TUPE transfer not found",
        },
      };
    }

    if (transfer.status === "completed" || transfer.status === "cancelled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot remove employees from a TUPE transfer with status '${transfer.status}'`,
        },
      };
    }

    // Verify employee is assigned
    const existing = await this.repository.findAffectedEmployee(ctx, transferId, employeeId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee is not assigned to this TUPE transfer",
        },
      };
    }

    try {
      const removed = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.removeAffectedEmployee(tx, transferId, employeeId);

          if (result) {
            // Update employee count on the transfer
            await this.repository.refreshEmployeeCount(tx, transferId);

            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "tupe_transfer",
              aggregateId: transferId,
              eventType: "hr.tupe_transfer.employee_removed",
              payload: {
                transferId,
                employeeId,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!removed) {
        return {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to remove affected employee",
          },
        };
      }

      return { success: true, data: { message: "Employee removed from TUPE transfer" } };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error instanceof Error ? error.message : "Failed to remove affected employee",
        },
      };
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }
}
