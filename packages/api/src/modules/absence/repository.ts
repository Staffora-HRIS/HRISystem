/**
 * Absence Management Repository
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface LeaveTypeRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  maxConsecutiveDays: number | null;
  minNoticeDays: number;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeavePolicyRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  leaveTypeId: string;
  annualAllowance: number;
  maxCarryover: number;
  accrualFrequency: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  eligibleAfterMonths: number;
  appliesTo: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveRequestRow {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  startHalfDay: boolean;
  endHalfDay: boolean;
  totalDays: number;
  reason: string | null;
  contactInfo: string | null;
  status: string;
  submittedAt: Date | null;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveBalanceRow {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  year: number;
  entitled: number;
  used: number;
  pending: number;
  available: number;
  carryover: number;
  updatedAt: Date;
}

export class AbsenceRepository {
  constructor(private db: DatabaseClient) {}

  // Leave Types
  async createLeaveType(ctx: TenantContext, data: Partial<LeaveTypeRow>): Promise<LeaveTypeRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<LeaveTypeRow[]>`
        INSERT INTO app.leave_types (
          id, tenant_id, code, name, description, is_paid,
          requires_approval, requires_attachment, max_consecutive_days,
          min_notice_days, color, is_active
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.code}, ${data.name},
          ${data.description || null}, ${data.isPaid ?? true},
          ${data.requiresApproval ?? true}, ${data.requiresAttachment ?? false},
          ${data.maxConsecutiveDays || null}, ${data.minNoticeDays ?? 0},
          ${data.color || null}, true
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "leave_type", id, "absence.leave_type.created", { leaveTypeId: id });
      return row as LeaveTypeRow;
    });
  }

  async getLeaveTypes(ctx: TenantContext): Promise<LeaveTypeRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<LeaveTypeRow[]>`
        SELECT
          id, tenant_id, code, name, description, is_paid,
          requires_approval, requires_attachment, max_consecutive_days,
          min_notice_days, color, is_active, created_at, updated_at
        FROM app.leave_types
        WHERE tenant_id = ${ctx.tenantId}::uuid AND is_active = true
        ORDER BY name
      `;
      return rows as LeaveTypeRow[];
    });
  }

  async getLeaveTypeById(ctx: TenantContext, id: string): Promise<LeaveTypeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<LeaveTypeRow[]>`
        SELECT
          id, tenant_id, code, name, description, is_paid,
          requires_approval, requires_attachment, max_consecutive_days,
          min_notice_days, color, is_active, created_at, updated_at
        FROM app.leave_types
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as LeaveTypeRow) : null;
  }

  async deactivateLeaveType(ctx: TenantContext, id: string): Promise<LeaveTypeRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeaveTypeRow[]>`
        UPDATE app.leave_types SET
          is_active = false,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND is_active = true
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "leave_type", id, "absence.leave_type.deactivated", { leaveTypeId: id });
      }
      return row as LeaveTypeRow | null;
    });
  }

  async updateLeaveType(ctx: TenantContext, id: string, data: Partial<LeaveTypeRow>): Promise<LeaveTypeRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeaveTypeRow[]>`
        UPDATE app.leave_types SET
          name = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          is_paid = COALESCE(${data.isPaid ?? null}, is_paid),
          requires_approval = COALESCE(${data.requiresApproval ?? null}, requires_approval),
          requires_attachment = COALESCE(${data.requiresAttachment ?? null}, requires_attachment),
          max_consecutive_days = ${data.maxConsecutiveDays ?? null},
          min_notice_days = COALESCE(${data.minNoticeDays ?? null}, min_notice_days),
          color = COALESCE(${data.color ?? null}, color),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "leave_type", id, "absence.leave_type.updated", { leaveTypeId: id });
      }
      return row as LeaveTypeRow | null;
    });
  }

  // Leave Policies
  async createLeavePolicy(ctx: TenantContext, data: Partial<LeavePolicyRow>): Promise<LeavePolicyRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<LeavePolicyRow[]>`
        INSERT INTO app.leave_policies (
          id, tenant_id, name, description, leave_type_id, annual_allowance,
          max_carryover, accrual_frequency, effective_from, effective_to,
          eligible_after_months, applies_to, is_active
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.name}, ${data.description || null},
          ${data.leaveTypeId}::uuid, ${data.annualAllowance}, ${data.maxCarryover ?? 0},
          ${data.accrualFrequency || null}, ${data.effectiveFrom}, ${data.effectiveTo || null},
          ${data.eligibleAfterMonths ?? 0}, ${data.appliesTo ? JSON.stringify(data.appliesTo) : null}::jsonb, true
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "leave_policy", id, "absence.leave_policy.created", { policyId: id });
      return row as LeavePolicyRow;
    });
  }

  async getLeavePolicies(ctx: TenantContext): Promise<LeavePolicyRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<LeavePolicyRow[]>`
        SELECT
          id, tenant_id, name, description, leave_type_id, annual_allowance,
          max_carryover, accrual_frequency, effective_from, effective_to,
          eligible_after_months, applies_to, is_active, created_at, updated_at
        FROM app.leave_policies
        WHERE tenant_id = ${ctx.tenantId}::uuid AND is_active = true
        ORDER BY name
      `;
      return rows as LeavePolicyRow[];
    });
  }

  async deactivateLeavePolicy(ctx: TenantContext, id: string): Promise<LeavePolicyRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeavePolicyRow[]>`
        UPDATE app.leave_policies SET
          is_active = false,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND is_active = true
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "leave_policy", id, "absence.leave_policy.deactivated", { policyId: id });
      }
      return row as LeavePolicyRow | null;
    });
  }

  // Leave Requests
  async createLeaveRequest(ctx: TenantContext, data: Partial<LeaveRequestRow>): Promise<LeaveRequestRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      
      // Calculate total days
      const startDate = new Date(data.startDate!);
      const endDate = new Date(data.endDate!);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (data.startHalfDay) totalDays -= 0.5;
      if (data.endHalfDay) totalDays -= 0.5;

      const [row] = await tx<LeaveRequestRow[]>`
        INSERT INTO app.leave_requests (
          id, tenant_id, employee_id, leave_type_id, start_date, end_date,
          start_half_day, end_half_day, duration, reason, status
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.leaveTypeId}::uuid, ${data.startDate}, ${data.endDate},
          ${data.startHalfDay ?? false}, ${data.endHalfDay ?? false},
          ${totalDays}, ${data.reason || null}, 'draft'
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "leave_request", id, "absence.request.created", {
        requestId: id,
        employeeId: data.employeeId,
        totalDays,
      });
      return row as LeaveRequestRow;
    });
  }

  async getLeaveRequests(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      leaveTypeId?: string;
      status?: string;
      from?: Date;
      to?: Date;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<LeaveRequestRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<LeaveRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, leave_type_id, start_date, end_date,
          start_half_day, end_half_day, total_days, reason, contact_info,
          status, submitted_at, approved_at, approved_by_id, rejection_reason,
          created_at, updated_at
        FROM app.leave_requests
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.leaveTypeId ? tx`AND leave_type_id = ${filters.leaveTypeId}::uuid` : tx``}
        ${filters.status ? tx`AND status = ${filters.status}` : tx``}
        ${filters.from ? tx`AND start_date >= ${filters.from}` : tx``}
        ${filters.to ? tx`AND end_date <= ${filters.to}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as LeaveRequestRow[], cursor, hasMore };
  }

  async getLeaveRequestById(ctx: TenantContext, id: string): Promise<LeaveRequestRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<LeaveRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, leave_type_id, start_date, end_date,
          start_half_day, end_half_day, total_days, reason, contact_info,
          status, submitted_at, approved_at, approved_by_id, rejection_reason,
          created_at, updated_at
        FROM app.leave_requests
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as LeaveRequestRow) : null;
  }

  async submitLeaveRequest(ctx: TenantContext, id: string): Promise<LeaveRequestRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeaveRequestRow[]>`
        UPDATE app.leave_requests SET
          status = 'pending',
          submitted_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'draft'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "leave_request", id, "absence.request.submitted", {
          requestId: id,
          employeeId: row.employeeId,
        });
      }
      return row as LeaveRequestRow | null;
    });
  }

  async approveLeaveRequest(ctx: TenantContext, id: string, approverId: string, comments?: string): Promise<LeaveRequestRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeaveRequestRow[]>`
        UPDATE app.leave_requests SET
          status = 'approved',
          approved_at = now(),
          approved_by = ${approverId}::uuid,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'pending'
        RETURNING *
      `;

      if (row) {
        await tx`
          INSERT INTO app.leave_request_approvals (id, tenant_id, request_id, actor_id, action, comment)
          VALUES (${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${id}::uuid, ${approverId}::uuid, 'approve', ${comments || null})
        `;

        await this.writeOutbox(tx, ctx.tenantId, "leave_request", id, "absence.request.approved", {
          requestId: id,
          employeeId: row.employeeId,
          approverId,
        });
      }
      return row as LeaveRequestRow | null;
    });
  }

  async rejectLeaveRequest(ctx: TenantContext, id: string, approverId: string, reason?: string): Promise<LeaveRequestRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeaveRequestRow[]>`
        UPDATE app.leave_requests SET
          status = 'rejected',
          rejection_reason = ${reason || null},
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'pending'
        RETURNING *
      `;

      if (row) {
        await tx`
          INSERT INTO app.leave_request_approvals (id, tenant_id, request_id, actor_id, action, comment)
          VALUES (${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${id}::uuid, ${approverId}::uuid, 'reject', ${reason || null})
        `;

        await this.writeOutbox(tx, ctx.tenantId, "leave_request", id, "absence.request.denied", {
          requestId: id,
          employeeId: row.employeeId,
          approverId,
          reason,
        });
      }
      return row as LeaveRequestRow | null;
    });
  }

  async cancelLeaveRequest(ctx: TenantContext, id: string): Promise<LeaveRequestRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<LeaveRequestRow[]>`
        UPDATE app.leave_requests SET
          status = 'cancelled',
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('draft', 'pending')
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "leave_request", id, "absence.request.cancelled", {
          requestId: id,
          employeeId: row.employeeId,
        });
      }
      return row as LeaveRequestRow | null;
    });
  }

  // Leave Balances
  async getLeaveBalances(ctx: TenantContext, employeeId: string, year?: number): Promise<LeaveBalanceRow[]> {
    const currentYear = year || new Date().getFullYear();
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<LeaveBalanceRow[]>`
        SELECT
          lb.id, lb.tenant_id, lb.employee_id, lb.leave_type_id,
          lt.name as leave_type_name, lb.year,
          (lb.opening_balance + lb.accrued + lb.carryover + lb.adjustments) as entitled,
          lb.used, lb.pending, lb.available_balance as available,
          lb.carryover, lb.updated_at
        FROM app.leave_balances lb
        JOIN app.leave_types lt ON lt.id = lb.leave_type_id
        WHERE lb.tenant_id = ${ctx.tenantId}::uuid
          AND lb.employee_id = ${employeeId}::uuid
          AND lb.year = ${currentYear}
        ORDER BY lt.name
      `;
      return rows as LeaveBalanceRow[];
    });
  }

  // Bradford Factor - get completed absence spells within a rolling period
  async getCompletedAbsenceSpells(
    ctx: TenantContext,
    employeeId: string,
    periodMonths: number = 12
  ): Promise<Array<{ startDate: Date; endDate: Date }>> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<Array<{ startDate: Date; endDate: Date }>>`
        SELECT lr.start_date, lr.end_date
        FROM app.leave_requests lr
        WHERE lr.tenant_id = ${ctx.tenantId}::uuid
          AND lr.employee_id = ${employeeId}::uuid
          AND lr.status IN ('approved', 'completed')
          AND lr.start_date >= (CURRENT_DATE - (${periodMonths} || ' months')::interval)
        ORDER BY lr.start_date
      `;
      return rows;
    });
  }

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
