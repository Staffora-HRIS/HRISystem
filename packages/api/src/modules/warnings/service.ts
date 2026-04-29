/**
 * Warnings Module - Service Layer
 *
 * Business logic for Employee Warning Management.
 * Handles validation, status transitions (active/expired/rescinded/appealed),
 * and domain events via the outbox pattern.
 *
 * Warning status transitions:
 *   active -> expired       (batch job or manual)
 *   active -> rescinded     (management decision)
 *   active -> appealed      (employee appeal submitted)
 *   appealed -> active      (appeal upheld or modified - warning reinstated)
 *   appealed -> rescinded   (appeal overturned - warning voided)
 *
 * Expiry defaults follow UK ACAS Code of Practice:
 *   verbal:        6 months
 *   first_written: 12 months
 *   final_written: 12 months (configurable up to 24)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { WarningsRepository, type TenantContext } from "./repository";
import type {
  IssueWarning,
  AppealWarning,
  ResolveAppeal,
  RescindWarning,
  WarningFilters,
  PaginationQuery,
  WarningLevel,
} from "./schemas";
import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import type { WarningRow, PaginatedResult } from "./repository";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default expiry periods by warning level (in months).
 * Follows UK ACAS Code of Practice.
 */
const DEFAULT_EXPIRY_MONTHS: Record<WarningLevel, number> = {
  verbal: 6,
  first_written: 12,
  final_written: 12,
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate the expiry date from issued date and warning level.
 * Returns ISO date string (YYYY-MM-DD).
 */
function calculateExpiryDate(issuedDate: string, level: WarningLevel): string {
  const date = new Date(issuedDate);
  date.setMonth(date.getMonth() + DEFAULT_EXPIRY_MONTHS[level]);
  return date.toISOString().split("T")[0]!;
}

/**
 * Serialise a WarningRow for API responses.
 * Converts Date objects to ISO strings for JSON serialization.
 */
function serialiseWarning(row: WarningRow): Record<string, unknown> {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    case_id: row.caseId,
    warning_level: row.warningLevel,
    status: row.status,
    issued_date: row.issuedDate instanceof Date ? row.issuedDate.toISOString().split("T")[0] : String(row.issuedDate),
    expiry_date: row.expiryDate instanceof Date ? row.expiryDate.toISOString().split("T")[0] : String(row.expiryDate),
    issued_by: row.issuedBy,
    reason: row.reason,
    details: row.details,
    hearing_date: row.hearingDate instanceof Date ? row.hearingDate.toISOString().split("T")[0] : row.hearingDate,
    companion_present: row.companionPresent,
    companion_name: row.companionName,
    appeal_deadline: row.appealDeadline instanceof Date ? row.appealDeadline.toISOString().split("T")[0] : row.appealDeadline,
    appealed: row.appealed,
    appeal_date: row.appealDate instanceof Date ? row.appealDate.toISOString().split("T")[0] : row.appealDate,
    appeal_outcome: row.appealOutcome,
    appeal_notes: row.appealNotes,
    rescinded_date: row.rescindedDate instanceof Date ? row.rescindedDate.toISOString().split("T")[0] : row.rescindedDate,
    rescinded_by: row.rescindedBy,
    rescinded_reason: row.rescindedReason,
    employee_name: row.employeeName,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class WarningsService {
  constructor(
    private repository: WarningsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * List warnings for a specific employee with optional filters and pagination
   */
  async listWarningsByEmployee(
    ctx: TenantContext,
    employeeId: string,
    filters: WarningFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<Record<string, unknown>>> {
    const result = await this.repository.findByEmployeeId(ctx, employeeId, filters, pagination);

    return {
      items: result.items.map(serialiseWarning),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single warning by ID
   */
  async getWarning(ctx: TenantContext, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const warning = await this.repository.findById(ctx, id);

      if (!warning) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Warning not found",
          },
        };
      }

      return { success: true, data: serialiseWarning(warning) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to fetch warning",
        },
      };
    }
  }

  /**
   * Get all active warnings for an employee
   */
  async getActiveWarnings(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<Record<string, unknown>[]>> {
    try {
      const warnings = await this.repository.findActiveByEmployeeId(ctx, employeeId);
      return { success: true, data: warnings.map(serialiseWarning) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to fetch active warnings",
        },
      };
    }
  }

  // ===========================================================================
  // Mutating Operations
  // ===========================================================================

  /**
   * Issue a new warning to an employee.
   *
   * Validates the employee exists, computes expiry date if not provided,
   * and writes an outbox event in the same transaction.
   */
  async issueWarning(
    ctx: TenantContext,
    data: IssueWarning,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Validate employee exists
    const employeeExists = await this.repository.employeeExists(ctx, data.employee_id);
    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
        },
      };
    }

    // Calculate expiry date if not provided
    const expiryDate = data.expiry_date || calculateExpiryDate(data.issued_date, data.warning_level);

    // Validate expiry is after issued date
    if (new Date(expiryDate) <= new Date(data.issued_date)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Expiry date must be after issued date",
        },
      };
    }

    try {
      const warning = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.create(
            tx,
            ctx,
            { ...data, expiry_date: expiryDate },
            ctx.userId || ""
          );

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "employee_warning",
            aggregateId: result.id,
            eventType: "warnings.warning.issued",
            payload: {
              warning: serialiseWarning(result),
              employeeId: data.employee_id,
              warningLevel: data.warning_level,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: serialiseWarning(warning) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to issue warning",
        },
      };
    }
  }

  /**
   * Submit an appeal against a warning.
   *
   * Only active warnings can be appealed.
   * Optionally validates against appeal_deadline.
   */
  async appealWarning(
    ctx: TenantContext,
    id: string,
    data: AppealWarning,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Verify warning exists and is in correct state
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Warning not found",
        },
      };
    }

    if (existing.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot appeal a warning with status '${existing.status}'. Only active warnings can be appealed.`,
          details: { currentStatus: existing.status, validStatuses: ["active"] },
        },
      };
    }

    // Validate appeal is within deadline if one is set
    if (existing.appealDeadline) {
      const deadline = existing.appealDeadline instanceof Date
        ? existing.appealDeadline
        : new Date(existing.appealDeadline);
      const appealDate = new Date(data.appeal_date);
      if (appealDate > deadline) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Appeal date ${data.appeal_date} is past the appeal deadline of ${deadline.toISOString().split("T")[0]}`,
          },
        };
      }
    }

    try {
      const warning = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.submitAppeal(
            tx,
            id,
            data.appeal_date,
            data.appeal_notes || null
          );

          if (!result) {
            return null;
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "employee_warning",
            aggregateId: id,
            eventType: "warnings.warning.appealed",
            payload: {
              warningId: id,
              employeeId: existing.employeeId,
              appealDate: data.appeal_date,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!warning) {
        return {
          success: false,
          error: {
            code: "APPEAL_FAILED",
            message: "Failed to submit appeal. The warning may have changed status.",
          },
        };
      }

      return { success: true, data: serialiseWarning(warning) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "APPEAL_FAILED",
          message: error instanceof Error ? error.message : "Failed to submit appeal",
        },
      };
    }
  }

  /**
   * Resolve an existing appeal.
   *
   * Outcomes: upheld (warning stays active), overturned (warning rescinded),
   * modified (warning stays active, e.g. reduced level).
   */
  async resolveAppeal(
    ctx: TenantContext,
    id: string,
    data: ResolveAppeal,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Warning not found",
        },
      };
    }

    if (existing.status !== "appealed") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot resolve appeal for a warning with status '${existing.status}'. Warning must be in 'appealed' status.`,
          details: { currentStatus: existing.status, validStatuses: ["appealed"] },
        },
      };
    }

    try {
      const warning = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.resolveAppeal(
            tx,
            id,
            data.appeal_outcome,
            data.appeal_notes || null
          );

          if (!result) {
            return null;
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "employee_warning",
            aggregateId: id,
            eventType: "warnings.appeal.resolved",
            payload: {
              warningId: id,
              employeeId: existing.employeeId,
              outcome: data.appeal_outcome,
              newStatus: result.status,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!warning) {
        return {
          success: false,
          error: {
            code: "RESOLVE_FAILED",
            message: "Failed to resolve appeal. The warning may have changed status.",
          },
        };
      }

      return { success: true, data: serialiseWarning(warning) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "RESOLVE_FAILED",
          message: error instanceof Error ? error.message : "Failed to resolve appeal",
        },
      };
    }
  }

  /**
   * Rescind a warning (management action).
   * Only active warnings can be rescinded.
   */
  async rescindWarning(
    ctx: TenantContext,
    id: string,
    data: RescindWarning,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Warning not found",
        },
      };
    }

    if (existing.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot rescind a warning with status '${existing.status}'. Only active warnings can be rescinded.`,
          details: { currentStatus: existing.status, validStatuses: ["active"] },
        },
      };
    }

    try {
      const warning = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.rescind(
            tx,
            id,
            ctx.userId || "",
            data.rescinded_reason
          );

          if (!result) {
            return null;
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "employee_warning",
            aggregateId: id,
            eventType: "warnings.warning.rescinded",
            payload: {
              warningId: id,
              employeeId: existing.employeeId,
              reason: data.rescinded_reason,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!warning) {
        return {
          success: false,
          error: {
            code: "RESCIND_FAILED",
            message: "Failed to rescind warning. The warning may have changed status.",
          },
        };
      }

      return { success: true, data: serialiseWarning(warning) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "RESCIND_FAILED",
          message: error instanceof Error ? error.message : "Failed to rescind warning",
        },
      };
    }
  }

  /**
   * Batch-expire all active warnings that have passed their expiry date.
   * Intended for use by a scheduled job.
   */
  async batchExpireWarnings(
    ctx: TenantContext
  ): Promise<ServiceResult<{ expired_count: number; warnings: Record<string, unknown>[] }>> {
    try {
      const expired = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const results = await this.repository.batchExpire(tx, ctx);

          // Emit one domain event per expired warning
          for (const warning of results) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "employee_warning",
              aggregateId: warning.id,
              eventType: "warnings.warning.expired",
              payload: {
                warningId: warning.id,
                employeeId: warning.employeeId,
                warningLevel: warning.warningLevel,
                expiryDate: warning.expiryDate instanceof Date
                  ? warning.expiryDate.toISOString().split("T")[0]
                  : String(warning.expiryDate),
              },
            });
          }

          return results;
        }
      );

      return {
        success: true,
        data: {
          expired_count: expired.length,
          warnings: expired.map((w) => ({
            id: w.id,
            employee_id: w.employeeId,
            warning_level: w.warningLevel,
            expiry_date: w.expiryDate instanceof Date
              ? w.expiryDate.toISOString().split("T")[0]
              : String(w.expiryDate),
          })),
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "BATCH_EXPIRE_FAILED",
          message: error instanceof Error ? error.message : "Failed to batch-expire warnings",
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
