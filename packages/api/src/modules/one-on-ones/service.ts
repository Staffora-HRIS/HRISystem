/**
 * One-on-One Meetings Module - Service Layer
 *
 * Business logic for 1:1 meeting management.
 * Emits domain events via the outbox pattern for all mutations.
 *
 * Validates:
 * - Employee existence before creating a meeting
 * - Manager cannot create a meeting with themselves
 * - Meeting date consistency (next_meeting_date > meeting_date)
 * - Only the meeting owner (manager) can update/delete
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  OneOnOneRepository,
  type OneOnOneRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateOneOnOne,
  UpdateOneOnOne,
  OneOnOneFilters,
  OneOnOneResponse,
  OneOnOneStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type OneOnOneEventType =
  | "one_on_one.meeting.created"
  | "one_on_one.meeting.updated"
  | "one_on_one.meeting.deleted"
  | "one_on_one.meeting.completed";

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function mapToResponse(row: OneOnOneRow): OneOnOneResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    manager_id: row.managerId,
    employee_id: row.employeeId,
    meeting_date: formatDate(row.meetingDate) ?? "",
    status: row.status as OneOnOneStatus,
    notes: row.notes,
    action_items: Array.isArray(row.actionItems) ? row.actionItems : [],
    next_meeting_date: formatDate(row.nextMeetingDate),
    manager_name: row.managerName,
    employee_name: row.employeeName,
    employee_number: row.employeeNumber,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class OneOnOneService {
  constructor(
    private repository: OneOnOneRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: OneOnOneEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        'one_on_one_meeting',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // List Operations
  // ===========================================================================

  /**
   * List 1:1 meetings for the current user acting as manager.
   */
  async listForManager(
    ctx: TenantContext,
    managerId: string,
    filters: OneOnOneFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<OneOnOneResponse>> {
    const result = await this.repository.listForManager(
      ctx,
      managerId,
      filters,
      pagination
    );
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * List 1:1 meeting history for a specific employee.
   */
  async listForEmployee(
    ctx: TenantContext,
    employeeId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<OneOnOneResponse>> {
    const result = await this.repository.listForEmployee(
      ctx,
      employeeId,
      pagination
    );
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get Operations
  // ===========================================================================

  /**
   * Get a single 1:1 meeting by ID.
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<OneOnOneResponse>> {
    const meeting = await this.repository.getById(ctx, id);
    if (!meeting) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "1:1 meeting not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: mapToResponse(meeting),
    };
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a 1:1 meeting.
   * The managerId is resolved from the authenticated user's linked employee record.
   *
   * Validates:
   * - Employee exists
   * - Manager is not the same as employee
   * - next_meeting_date > meeting_date (if provided)
   */
  async create(
    ctx: TenantContext,
    managerId: string,
    data: CreateOneOnOne
  ): Promise<ServiceResult<OneOnOneResponse>> {
    // Validate manager != employee
    if (managerId === data.employee_id) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Manager and employee must be different people",
          details: { manager_id: managerId, employee_id: data.employee_id },
        },
      };
    }

    // Validate next_meeting_date > meeting_date
    if (data.next_meeting_date && data.next_meeting_date <= data.meeting_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Next meeting date must be after the current meeting date",
          details: {
            meeting_date: data.meeting_date,
            next_meeting_date: data.next_meeting_date,
          },
        },
      };
    }

    // Verify employee exists
    const employeeExists = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx`
        SELECT id FROM employees WHERE id = ${data.employee_id}::uuid LIMIT 1
      `;
      return rows.length > 0;
    });

    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: data.employee_id },
        },
      };
    }

    // Verify manager exists as employee
    const managerExists = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx`
        SELECT id FROM employees WHERE id = ${managerId}::uuid LIMIT 1
      `;
      return rows.length > 0;
    });

    if (!managerExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Manager employee record not found",
          details: { manager_id: managerId },
        },
      };
    }

    // Create meeting and emit event in same transaction
    const meeting = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.create(ctx, managerId, data, tx);

      await this.emitEvent(tx, ctx, created.id, "one_on_one.meeting.created", {
        meeting: {
          id: created.id,
          managerId,
          employeeId: data.employee_id,
          meetingDate: data.meeting_date,
          status: data.status ?? "scheduled",
        },
      });

      return created;
    });

    return {
      success: true,
      data: mapToResponse(meeting),
    };
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update a 1:1 meeting.
   * Only the manager who created the meeting can update it.
   */
  async update(
    ctx: TenantContext,
    id: string,
    managerId: string,
    data: UpdateOneOnOne
  ): Promise<ServiceResult<OneOnOneResponse>> {
    // Verify the meeting exists and belongs to this manager
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "1:1 meeting not found",
          details: { id },
        },
      };
    }

    if (existing.managerId !== managerId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "Only the meeting manager can update this meeting",
          details: { id },
        },
      };
    }

    // Validate next_meeting_date > meeting_date
    const effectiveMeetingDate = data.meeting_date ?? formatDate(existing.meetingDate);
    const effectiveNextDate = data.next_meeting_date !== undefined
      ? data.next_meeting_date
      : formatDate(existing.nextMeetingDate);

    if (effectiveNextDate && effectiveMeetingDate && effectiveNextDate <= effectiveMeetingDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Next meeting date must be after the current meeting date",
          details: {
            meeting_date: effectiveMeetingDate,
            next_meeting_date: effectiveNextDate,
          },
        },
      };
    }

    const wasCompleted = existing.status !== "completed" && data.status === "completed";

    // Update and emit event in same transaction
    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.update(id, data, tx);

      if (!result) {
        return null;
      }

      const eventType: OneOnOneEventType = wasCompleted
        ? "one_on_one.meeting.completed"
        : "one_on_one.meeting.updated";

      await this.emitEvent(tx, ctx, id, eventType, {
        meeting: {
          id,
          managerId: existing.managerId,
          employeeId: existing.employeeId,
          status: data.status ?? existing.status,
          changes: Object.keys(data),
        },
      });

      return result;
    });

    if (!updated) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Failed to update 1:1 meeting",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: mapToResponse(updated),
    };
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete a 1:1 meeting.
   * Only the manager who created the meeting can delete it.
   */
  async delete(
    ctx: TenantContext,
    id: string,
    managerId: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    // Verify the meeting exists and belongs to this manager
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "1:1 meeting not found",
          details: { id },
        },
      };
    }

    if (existing.managerId !== managerId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "Only the meeting manager can delete this meeting",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.delete(id, tx);

      await this.emitEvent(tx, ctx, id, "one_on_one.meeting.deleted", {
        meeting: {
          id,
          managerId: existing.managerId,
          employeeId: existing.employeeId,
          meetingDate: formatDate(existing.meetingDate),
        },
      });
    });

    return {
      success: true,
      data: { deleted: true },
    };
  }
}
