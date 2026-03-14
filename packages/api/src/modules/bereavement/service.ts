/**
 * Parental Bereavement Leave Module - Service Layer
 *
 * Implements business logic for Parental Bereavement Leave (Jack's Law).
 * Enforces:
 * - Maximum 2 weeks (14 days) of leave per bereavement
 * - Leave must be taken within 56 weeks of the child's death
 * - Leave cannot start before the date of death
 * - SPBP rate requires eligibility
 * - Status transition enforcement
 *
 * All mutating operations write domain events to the outbox in the same
 * transaction as the business write.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  BereavementRepository,
  BereavementLeaveRow,
  TenantContext,
  PaginatedResult,
} from "./repository";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateBereavementLeave,
  UpdateBereavementLeave,
  BereavementLeaveFilters,
  BereavementStatusTransition,
  BereavementLeaveResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Maximum leave duration in days per bereavement (2 weeks) */
const MAX_LEAVE_DAYS = 14;

/** Maximum weeks after death within which leave must be taken */
const MAX_WEEKS_AFTER_DEATH = 56;

/** Valid status transitions for bereavement leave */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved"],
  approved: ["active"],
  active: ["completed"],
};

// =============================================================================
// Row to Response Mapper
// =============================================================================

/**
 * Transform a database row to the API response shape.
 * postgres.js auto-transforms column names to camelCase, so we convert
 * back to snake_case for the API response.
 */
function toResponse(row: BereavementLeaveRow): BereavementLeaveResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    child_name: row.childName,
    date_of_death: formatDate(row.dateOfDeath),
    leave_start_date: formatDate(row.leaveStartDate),
    leave_end_date: formatDate(row.leaveEndDate),
    spbp_eligible: row.spbpEligible,
    spbp_rate_weekly: row.spbpRateWeekly ? Number(row.spbpRateWeekly) : null,
    status: row.status,
    notes: row.notes,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Format a Date or string to YYYY-MM-DD.
 */
function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().split("T")[0]!;
  }
  return String(value);
}

// =============================================================================
// Service
// =============================================================================

export class BereavementService {
  constructor(
    private repository: BereavementRepository,
    private db: DatabaseClient
  ) {}

  /**
   * List parental bereavement leave records with cursor-based pagination.
   */
  async list(
    ctx: TenantContext,
    filters: BereavementLeaveFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<BereavementLeaveResponse>> {
    const result = await this.repository.list(ctx, filters, pagination);

    return {
      items: result.items.map(toResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single bereavement leave record by ID.
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<BereavementLeaveResponse>> {
    const row = await this.repository.findById(ctx, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Parental bereavement leave record with ID '${id}' not found`,
        },
      };
    }

    return { success: true, data: toResponse(row) };
  }

  /**
   * Create a new parental bereavement leave record.
   *
   * Validates:
   * - leave_end_date >= leave_start_date
   * - Leave duration <= 14 days per record
   * - leave_start_date >= date_of_death
   * - leave_start_date within 56 weeks of date_of_death
   * - Total leave days for this bereavement (across all records) <= 14 days
   * - SPBP rate requires eligibility
   */
  async create(
    ctx: TenantContext,
    data: CreateBereavementLeave
  ): Promise<ServiceResult<BereavementLeaveResponse>> {
    // --- Client-side validation (mirrors DB constraints) ---

    const startDate = new Date(data.leave_start_date);
    const endDate = new Date(data.leave_end_date);
    const deathDate = new Date(data.date_of_death);

    // leave_end_date must be on or after leave_start_date
    if (endDate < startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Leave end date must be on or after the start date",
          details: { field: "leave_end_date" },
        },
      };
    }

    // Maximum 14 days per leave block
    const durationDays = Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (durationDays > MAX_LEAVE_DAYS) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Leave duration cannot exceed ${MAX_LEAVE_DAYS} days (2 weeks). Requested: ${durationDays} days`,
          details: { field: "leave_end_date", maxDays: MAX_LEAVE_DAYS, requestedDays: durationDays },
        },
      };
    }

    // Leave cannot start before date of death
    if (startDate < deathDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Leave cannot start before the date of death",
          details: { field: "leave_start_date" },
        },
      };
    }

    // Leave must start within 56 weeks of the date of death
    const maxStartDate = new Date(deathDate);
    maxStartDate.setDate(maxStartDate.getDate() + MAX_WEEKS_AFTER_DEATH * 7);
    if (startDate > maxStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Leave must be taken within ${MAX_WEEKS_AFTER_DEATH} weeks of the child's death`,
          details: { field: "leave_start_date", maxStartDate: maxStartDate.toISOString().split("T")[0] },
        },
      };
    }

    // SPBP rate requires eligibility
    if (data.spbp_rate_weekly != null && !data.spbp_eligible) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "SPBP weekly rate can only be set when the employee is SPBP eligible",
          details: { field: "spbp_rate_weekly" },
        },
      };
    }

    // --- Transactional create with outbox and cross-block validation ---

    return this.db.withTransaction(ctx, async (tx) => {
      // Check total days across all leave blocks for this bereavement
      const existingDays = await this.repository.countLeaveDaysForBereavement(
        ctx,
        tx,
        data.employee_id,
        data.date_of_death
      );

      if (existingDays + durationDays > MAX_LEAVE_DAYS) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Total leave for this bereavement would exceed ${MAX_LEAVE_DAYS} days. Already used: ${existingDays} days, requested: ${durationDays} days`,
            details: {
              existingDays,
              requestedDays: durationDays,
              maxDays: MAX_LEAVE_DAYS,
            },
          },
        };
      }

      // Create the record
      const row = await this.repository.create(ctx, tx, data);

      // Write domain event to outbox (same transaction)
      await this.repository.writeOutboxEvent(
        tx,
        ctx.tenantId,
        row.id,
        "bereavement.leave.created",
        {
          leave: toResponse(row),
          actor: ctx.userId,
        }
      );

      return { success: true, data: toResponse(row) };
    });
  }

  /**
   * Update a parental bereavement leave record.
   * Only allowed when status is 'pending'.
   *
   * Re-validates all date/duration constraints against the updated values.
   */
  async update(
    ctx: TenantContext,
    id: string,
    data: UpdateBereavementLeave
  ): Promise<ServiceResult<BereavementLeaveResponse>> {
    // Fetch the existing record first
    const existing = await this.repository.findById(ctx, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Parental bereavement leave record with ID '${id}' not found`,
        },
      };
    }

    if (existing.status !== "pending") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot update a bereavement leave record in '${existing.status}' status. Only 'pending' records can be updated`,
          details: { currentStatus: existing.status },
        },
      };
    }

    // Compute effective values after the update
    const effectiveStartDate = data.leave_start_date
      ? new Date(data.leave_start_date)
      : existing.leaveStartDate;
    const effectiveEndDate = data.leave_end_date
      ? new Date(data.leave_end_date)
      : existing.leaveEndDate;
    const effectiveDeathDate = data.date_of_death
      ? new Date(data.date_of_death)
      : existing.dateOfDeath;
    const effectiveSpbpEligible = data.spbp_eligible ?? existing.spbpEligible;

    // Validate dates
    if (effectiveEndDate < effectiveStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Leave end date must be on or after the start date",
          details: { field: "leave_end_date" },
        },
      };
    }

    const durationDays = Math.round(
      (effectiveEndDate.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (durationDays > MAX_LEAVE_DAYS) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Leave duration cannot exceed ${MAX_LEAVE_DAYS} days`,
          details: { field: "leave_end_date", maxDays: MAX_LEAVE_DAYS, requestedDays: durationDays },
        },
      };
    }

    if (effectiveStartDate < effectiveDeathDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Leave cannot start before the date of death",
          details: { field: "leave_start_date" },
        },
      };
    }

    const maxStartDate = new Date(effectiveDeathDate);
    maxStartDate.setDate(maxStartDate.getDate() + MAX_WEEKS_AFTER_DEATH * 7);
    if (effectiveStartDate > maxStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Leave must be taken within ${MAX_WEEKS_AFTER_DEATH} weeks of the child's death`,
          details: { field: "leave_start_date" },
        },
      };
    }

    // SPBP rate requires eligibility
    const effectiveSpbpRate = data.spbp_rate_weekly !== undefined
      ? data.spbp_rate_weekly
      : (existing.spbpRateWeekly ? Number(existing.spbpRateWeekly) : null);
    if (effectiveSpbpRate != null && !effectiveSpbpEligible) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "SPBP weekly rate can only be set when the employee is SPBP eligible",
          details: { field: "spbp_rate_weekly" },
        },
      };
    }

    // Transactional update with cross-block validation
    return this.db.withTransaction(ctx, async (tx) => {
      // Check total days across all leave blocks for this bereavement (excluding current)
      const effectiveDeathDateStr = data.date_of_death ?? formatDate(existing.dateOfDeath);
      const existingDays = await this.repository.countLeaveDaysForBereavement(
        ctx,
        tx,
        existing.employeeId,
        effectiveDeathDateStr,
        id
      );

      if (existingDays + durationDays > MAX_LEAVE_DAYS) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Total leave for this bereavement would exceed ${MAX_LEAVE_DAYS} days. Other blocks: ${existingDays} days, this block: ${durationDays} days`,
            details: {
              existingDays,
              requestedDays: durationDays,
              maxDays: MAX_LEAVE_DAYS,
            },
          },
        };
      }

      const row = await this.repository.update(ctx, tx, id, data);

      if (!row) {
        // Record was modified concurrently or status changed
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Record was modified concurrently or is no longer in pending status",
          },
        };
      }

      // Write domain event to outbox (same transaction)
      await this.repository.writeOutboxEvent(
        tx,
        ctx.tenantId,
        row.id,
        "bereavement.leave.updated",
        {
          leave: toResponse(row),
          previousValues: toResponse(existing),
          actor: ctx.userId,
        }
      );

      return { success: true, data: toResponse(row) };
    });
  }

  /**
   * Transition the status of a bereavement leave record.
   *
   * Valid transitions:
   *   pending -> approved
   *   approved -> active
   *   active -> completed
   */
  async transitionStatus(
    ctx: TenantContext,
    id: string,
    transition: BereavementStatusTransition
  ): Promise<ServiceResult<BereavementLeaveResponse>> {
    // Fetch the existing record
    const existing = await this.repository.findById(ctx, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Parental bereavement leave record with ID '${id}' not found`,
        },
      };
    }

    // Validate the transition
    const allowedTargets = VALID_TRANSITIONS[existing.status];
    if (!allowedTargets || !allowedTargets.includes(transition.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${existing.status}' to '${transition.status}'. Allowed transitions from '${existing.status}': ${allowedTargets?.join(", ") || "none"}`,
          details: {
            currentStatus: existing.status,
            requestedStatus: transition.status,
            allowedTransitions: allowedTargets || [],
          },
        },
      };
    }

    // Perform the transition in a transaction with outbox
    return this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.updateStatus(
        ctx,
        tx,
        id,
        transition.status,
        existing.status
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Record was modified concurrently. The status may have changed since it was last read",
          },
        };
      }

      // Write domain event to outbox (same transaction)
      await this.repository.writeOutboxEvent(
        tx,
        ctx.tenantId,
        row.id,
        `bereavement.leave.${transition.status}`,
        {
          leave: toResponse(row),
          previousStatus: existing.status,
          reason: transition.reason,
          actor: ctx.userId,
        }
      );

      return { success: true, data: toResponse(row) };
    });
  }
}
