/**
 * Shift Swap Repository
 *
 * Data access layer for shift swap operations.
 * All queries use postgres.js tagged templates with RLS enforced via
 * db.withTransaction which sets the tenant context automatically.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface ShiftSwapRow {
  id: string;
  tenantId: string;
  requesterId: string;
  requesterAssignmentId: string;
  targetEmployeeId: string;
  targetAssignmentId: string;
  status: string;
  reason: string | null;
  targetAccepted: boolean | null;
  targetResponseAt: Date | null;
  targetResponseNotes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvalNotes: string | null;
  managerResponseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository Class
// =============================================================================

export class ShiftSwapRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Create
  // ===========================================================================

  async createSwapRequest(
    ctx: TenantContext,
    data: {
      requesterId: string;
      requesterAssignmentId: string;
      targetEmployeeId: string;
      targetAssignmentId: string;
      reason?: string;
    }
  ): Promise<ShiftSwapRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<ShiftSwapRow[]>`
        INSERT INTO app.shift_swap_requests (
          id, tenant_id, requester_id, requester_assignment_id,
          target_employee_id, target_assignment_id,
          status, reason
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.requesterId}::uuid,
          ${data.requesterAssignmentId}::uuid, ${data.targetEmployeeId}::uuid,
          ${data.targetAssignmentId}::uuid,
          'pending_target', ${data.reason || null}
        )
        RETURNING *
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "shift_swap_request",
        id,
        "time.shift_swap.requested",
        {
          swapRequestId: id,
          requesterId: data.requesterId,
          targetEmployeeId: data.targetEmployeeId,
          requesterAssignmentId: data.requesterAssignmentId,
          targetAssignmentId: data.targetAssignmentId,
          actor: ctx.userId,
        }
      );

      return row as ShiftSwapRow;
    });
  }

  // ===========================================================================
  // Read
  // ===========================================================================

  async getSwapRequestById(
    ctx: TenantContext,
    id: string
  ): Promise<ShiftSwapRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ShiftSwapRow[]>`
        SELECT *
        FROM app.shift_swap_requests
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ShiftSwapRow) : null;
  }

  async listSwapRequests(
    ctx: TenantContext,
    employeeId: string,
    filters: {
      status?: string;
      asRequester?: boolean;
      asTarget?: boolean;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<ShiftSwapRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ShiftSwapRow[]>`
        SELECT *
        FROM app.shift_swap_requests
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND (
            ${filters.asRequester && !filters.asTarget ? tx`requester_id = ${employeeId}::uuid` : tx``}
            ${filters.asTarget && !filters.asRequester ? tx`target_employee_id = ${employeeId}::uuid` : tx``}
            ${(!filters.asRequester && !filters.asTarget) || (filters.asRequester && filters.asTarget) ? tx`(requester_id = ${employeeId}::uuid OR target_employee_id = ${employeeId}::uuid)` : tx``}
          )
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor =
      hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as ShiftSwapRow[], cursor, hasMore };
  }

  // ===========================================================================
  // Target Employee Actions
  // ===========================================================================

  async acceptSwapRequest(
    ctx: TenantContext,
    id: string,
    notes?: string
  ): Promise<ShiftSwapRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftSwapRow[]>`
        UPDATE app.shift_swap_requests
        SET status = 'pending_manager',
            target_accepted = true,
            target_response_at = now(),
            target_response_notes = ${notes || null},
            updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'pending_target'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "shift_swap_request",
          id,
          "time.shift_swap.target_accepted",
          {
            swapRequestId: id,
            requesterId: row.requesterId,
            targetEmployeeId: row.targetEmployeeId,
            actor: ctx.userId,
          }
        );
      }

      return row as ShiftSwapRow | null;
    });
  }

  async rejectSwapByTarget(
    ctx: TenantContext,
    id: string,
    notes?: string
  ): Promise<ShiftSwapRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftSwapRow[]>`
        UPDATE app.shift_swap_requests
        SET status = 'rejected',
            target_accepted = false,
            target_response_at = now(),
            target_response_notes = ${notes || null},
            approved_by = ${ctx.userId || null}::uuid,
            updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'pending_target'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "shift_swap_request",
          id,
          "time.shift_swap.target_rejected",
          {
            swapRequestId: id,
            requesterId: row.requesterId,
            targetEmployeeId: row.targetEmployeeId,
            actor: ctx.userId,
          }
        );
      }

      return row as ShiftSwapRow | null;
    });
  }

  // ===========================================================================
  // Manager Actions
  // ===========================================================================

  async approveSwapByManager(
    ctx: TenantContext,
    id: string,
    managerId: string,
    notes?: string
  ): Promise<ShiftSwapRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftSwapRow[]>`
        UPDATE app.shift_swap_requests
        SET status = 'approved',
            approved_by = ${managerId}::uuid,
            approved_at = now(),
            approval_notes = ${notes || null},
            manager_response_at = now(),
            updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'pending_manager'
        RETURNING *
      `;

      if (row) {
        // Execute the actual shift swap in the same transaction
        await tx`SELECT app.execute_shift_swap(${id}::uuid)`;

        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "shift_swap_request",
          id,
          "time.shift_swap.approved",
          {
            swapRequestId: id,
            requesterId: row.requesterId,
            targetEmployeeId: row.targetEmployeeId,
            approvedBy: managerId,
            actor: ctx.userId,
          }
        );
      }

      return row as ShiftSwapRow | null;
    });
  }

  async rejectSwapByManager(
    ctx: TenantContext,
    id: string,
    managerId: string,
    notes?: string
  ): Promise<ShiftSwapRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftSwapRow[]>`
        UPDATE app.shift_swap_requests
        SET status = 'rejected',
            approved_by = ${managerId}::uuid,
            approved_at = now(),
            approval_notes = ${notes || null},
            manager_response_at = now(),
            updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'pending_manager'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "shift_swap_request",
          id,
          "time.shift_swap.manager_rejected",
          {
            swapRequestId: id,
            requesterId: row.requesterId,
            targetEmployeeId: row.targetEmployeeId,
            rejectedBy: managerId,
            actor: ctx.userId,
          }
        );
      }

      return row as ShiftSwapRow | null;
    });
  }

  // ===========================================================================
  // Cancel
  // ===========================================================================

  async cancelSwapRequest(
    ctx: TenantContext,
    id: string,
    requesterId: string
  ): Promise<ShiftSwapRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftSwapRow[]>`
        UPDATE app.shift_swap_requests
        SET status = 'cancelled',
            updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND requester_id = ${requesterId}::uuid
          AND status IN ('pending_target', 'pending_manager')
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "shift_swap_request",
          id,
          "time.shift_swap.cancelled",
          {
            swapRequestId: id,
            requesterId: row.requesterId,
            targetEmployeeId: row.targetEmployeeId,
            actor: ctx.userId,
          }
        );
      }

      return row as ShiftSwapRow | null;
    });
  }

  // ===========================================================================
  // Validation Helpers
  // ===========================================================================

  async getShiftAssignment(
    ctx: TenantContext,
    assignmentId: string
  ): Promise<{
    id: string;
    tenantId: string;
    shiftId: string;
    employeeId: string;
    assignmentDate: Date;
  } | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx`
        SELECT id, tenant_id, shift_id, employee_id, assignment_date
        FROM app.shift_assignments
        WHERE id = ${assignmentId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as any) : null;
  }

  async getEmployeeForUser(
    ctx: TenantContext,
    userId: string
  ): Promise<{ id: string } | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx`
        SELECT id FROM app.employees
        WHERE user_id = ${userId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'active'
        LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as any) : null;
  }

  async hasPendingSwapForAssignment(
    ctx: TenantContext,
    assignmentId: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx`
        SELECT 1 FROM app.shift_swap_requests
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND (requester_assignment_id = ${assignmentId}::uuid
               OR target_assignment_id = ${assignmentId}::uuid)
          AND status IN ('pending_target', 'pending_manager')
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
        LIMIT 1
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async writeOutbox(
    tx: TransactionSql,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${tenantId}::uuid,
        ${aggregateType}, ${aggregateId}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb
      )
    `;
  }
}
