/**
 * Statutory Leave Module - Repository Layer
 *
 * Data access for UK statutory leave records, pay periods, and KIT days.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  StatutoryLeaveType,
  StatutoryLeaveStatus,
  StatutoryPayType,
  StatutoryLeaveFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StatutoryLeaveRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveType: StatutoryLeaveType;
  expectedDate: Date;
  actualDate: Date | null;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
  matb1Received: boolean;
  matb1Date: Date | null;
  partnerEmployeeId: string | null;
  curtailmentDate: Date | null;
  status: StatutoryLeaveStatus;
  averageWeeklyEarnings: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatutoryLeaveListRow extends StatutoryLeaveRow {
  employeeName: string | null;
  employeeNumber: string | null;
  kitDaysUsed: number;
}

export interface PayPeriodRow extends Row {
  id: string;
  tenantId: string;
  leaveRecordId: string;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  payType: StatutoryPayType;
  amount: string;
  createdAt: Date;
}

export interface KITDayRow extends Row {
  id: string;
  tenantId: string;
  leaveRecordId: string;
  workDate: Date;
  hoursWorked: string;
  notes: string | null;
  createdAt: Date;
}

export interface EmployeeServiceRow extends Row {
  id: string;
  tenantId: string;
  employeeNumber: string;
  hireDate: Date;
  status: string;
}

// =============================================================================
// Repository
// =============================================================================

export class StatutoryLeaveRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Statutory Leave Records
  // ---------------------------------------------------------------------------

  /**
   * Find statutory leave records with filters and cursor-based pagination
   */
  async findLeaveRecords(
    ctx: TenantContext,
    filters: StatutoryLeaveFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<StatutoryLeaveListRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      // Build dynamic WHERE conditions
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters.employee_id) {
        conditions.push(`slr.employee_id = $${paramIndex}::uuid`);
        params.push(filters.employee_id);
        paramIndex++;
      }

      if (filters.leave_type) {
        conditions.push(`slr.leave_type = $${paramIndex}::app.statutory_leave_type`);
        params.push(filters.leave_type);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`slr.status = $${paramIndex}::app.statutory_leave_status`);
        params.push(filters.status);
        paramIndex++;
      }

      if (filters.start_date_from) {
        conditions.push(`slr.start_date >= $${paramIndex}::date`);
        params.push(filters.start_date_from);
        paramIndex++;
      }

      if (filters.start_date_to) {
        conditions.push(`slr.start_date <= $${paramIndex}::date`);
        params.push(filters.start_date_to);
        paramIndex++;
      }

      if (cursor) {
        conditions.push(`slr.id < $${paramIndex}::uuid`);
        params.push(cursor);
        paramIndex++;
      }

      // Use postgres.js tagged templates for safe queries
      // For dynamic filter queries, we build a safe parameterized query
      const rows = await tx<StatutoryLeaveListRow[]>`
        SELECT
          slr.id,
          slr.tenant_id,
          slr.employee_id,
          slr.leave_type,
          slr.expected_date,
          slr.actual_date,
          slr.start_date,
          slr.end_date,
          slr.total_weeks,
          slr.matb1_received,
          slr.matb1_date,
          slr.partner_employee_id,
          slr.curtailment_date,
          slr.status,
          slr.average_weekly_earnings,
          slr.notes,
          slr.created_by,
          slr.created_at,
          slr.updated_at,
          CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
          e.employee_number,
          COALESCE(kit.kit_count, 0)::integer AS kit_days_used
        FROM app.statutory_leave_records slr
        JOIN app.employees e ON e.id = slr.employee_id AND e.tenant_id = slr.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = slr.employee_id
          AND ep.tenant_id = slr.tenant_id
          AND ep.effective_to IS NULL
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::integer AS kit_count
          FROM app.statutory_leave_kit_days kd
          WHERE kd.leave_record_id = slr.id AND kd.tenant_id = slr.tenant_id
        ) kit ON true
        WHERE slr.tenant_id = ${ctx.tenantId}::uuid
          ${filters.employee_id ? tx`AND slr.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.leave_type ? tx`AND slr.leave_type = ${filters.leave_type}::app.statutory_leave_type` : tx``}
          ${filters.status ? tx`AND slr.status = ${filters.status}::app.statutory_leave_status` : tx``}
          ${filters.start_date_from ? tx`AND slr.start_date >= ${filters.start_date_from}::date` : tx``}
          ${filters.start_date_to ? tx`AND slr.start_date <= ${filters.start_date_to}::date` : tx``}
          ${cursor ? tx`AND slr.created_at < (SELECT created_at FROM app.statutory_leave_records WHERE id = ${cursor}::uuid)` : tx``}
        ORDER BY slr.created_at DESC, slr.id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0
        ? items[items.length - 1]!.id
        : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Find a single statutory leave record by ID
   */
  async findLeaveRecordById(
    ctx: TenantContext,
    id: string
  ): Promise<StatutoryLeaveRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<StatutoryLeaveRow[]>`
        SELECT
          id, tenant_id, employee_id, leave_type,
          expected_date, actual_date, start_date, end_date,
          total_weeks, matb1_received, matb1_date,
          partner_employee_id, curtailment_date, status,
          average_weekly_earnings, notes, created_by,
          created_at, updated_at
        FROM app.statutory_leave_records
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
      return rows.length > 0 ? (rows[0] as StatutoryLeaveRow) : null;
    });
  }

  /**
   * Create a new statutory leave record within a transaction
   */
  async createLeaveRecord(
    tx: TransactionSql,
    ctx: TenantContext,
    data: {
      id: string;
      employeeId: string;
      leaveType: StatutoryLeaveType;
      expectedDate: string;
      actualDate?: string | null;
      startDate: string;
      endDate: string;
      totalWeeks: number;
      matb1Received: boolean;
      matb1Date?: string | null;
      partnerEmployeeId?: string | null;
      averageWeeklyEarnings?: number | null;
      notes?: string | null;
      createdBy?: string | null;
    }
  ): Promise<StatutoryLeaveRow> {
    const [row] = await tx<StatutoryLeaveRow[]>`
      INSERT INTO app.statutory_leave_records (
        id, tenant_id, employee_id, leave_type,
        expected_date, actual_date, start_date, end_date,
        total_weeks, matb1_received, matb1_date,
        partner_employee_id, average_weekly_earnings,
        notes, created_by, status
      ) VALUES (
        ${data.id}::uuid,
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.leaveType}::app.statutory_leave_type,
        ${data.expectedDate}::date,
        ${data.actualDate || null}::date,
        ${data.startDate}::date,
        ${data.endDate}::date,
        ${data.totalWeeks},
        ${data.matb1Received},
        ${data.matb1Date || null}::date,
        ${data.partnerEmployeeId || null}::uuid,
        ${data.averageWeeklyEarnings ?? null},
        ${data.notes || null},
        ${data.createdBy || null}::uuid,
        'planned'::app.statutory_leave_status
      )
      RETURNING *
    `;
    return row as StatutoryLeaveRow;
  }

  /**
   * Update a statutory leave record within a transaction
   */
  async updateLeaveRecord(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      expectedDate?: string;
      actualDate?: string | null;
      startDate?: string;
      endDate?: string;
      totalWeeks?: number;
      matb1Received?: boolean;
      matb1Date?: string | null;
      averageWeeklyEarnings?: number | null;
      notes?: string | null;
      status?: StatutoryLeaveStatus;
      curtailmentDate?: string | null;
    }
  ): Promise<StatutoryLeaveRow | null> {
    const rows = await tx<StatutoryLeaveRow[]>`
      UPDATE app.statutory_leave_records SET
        expected_date = COALESCE(${data.expectedDate ?? null}::date, expected_date),
        actual_date = CASE
          WHEN ${data.actualDate !== undefined} THEN ${data.actualDate ?? null}::date
          ELSE actual_date
        END,
        start_date = COALESCE(${data.startDate ?? null}::date, start_date),
        end_date = COALESCE(${data.endDate ?? null}::date, end_date),
        total_weeks = COALESCE(${data.totalWeeks ?? null}::integer, total_weeks),
        matb1_received = COALESCE(${data.matb1Received ?? null}::boolean, matb1_received),
        matb1_date = CASE
          WHEN ${data.matb1Date !== undefined} THEN ${data.matb1Date ?? null}::date
          ELSE matb1_date
        END,
        average_weekly_earnings = CASE
          WHEN ${data.averageWeeklyEarnings !== undefined} THEN ${data.averageWeeklyEarnings ?? null}::numeric
          ELSE average_weekly_earnings
        END,
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        status = COALESCE(${data.status ?? null}::app.statutory_leave_status, status),
        curtailment_date = CASE
          WHEN ${data.curtailmentDate !== undefined} THEN ${data.curtailmentDate ?? null}::date
          ELSE curtailment_date
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;
    return rows.length > 0 ? (rows[0] as StatutoryLeaveRow) : null;
  }

  // ---------------------------------------------------------------------------
  // Pay Periods
  // ---------------------------------------------------------------------------

  /**
   * Get pay periods for a leave record
   */
  async findPayPeriods(
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<PayPeriodRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<PayPeriodRow[]>`
        SELECT
          id, tenant_id, leave_record_id, week_number,
          start_date, end_date, pay_type, amount, created_at
        FROM app.statutory_leave_pay_periods
        WHERE leave_record_id = ${leaveRecordId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        ORDER BY week_number ASC
      `;
      return rows as PayPeriodRow[];
    });
  }

  /**
   * Create pay periods in bulk within a transaction
   */
  async createPayPeriods(
    tx: TransactionSql,
    ctx: TenantContext,
    leaveRecordId: string,
    periods: Array<{
      id: string;
      weekNumber: number;
      startDate: string;
      endDate: string;
      payType: StatutoryPayType;
      amount: number;
    }>
  ): Promise<PayPeriodRow[]> {
    if (periods.length === 0) return [];

    const results: PayPeriodRow[] = [];
    for (const period of periods) {
      const [row] = await tx<PayPeriodRow[]>`
        INSERT INTO app.statutory_leave_pay_periods (
          id, tenant_id, leave_record_id, week_number,
          start_date, end_date, pay_type, amount
        ) VALUES (
          ${period.id}::uuid,
          ${ctx.tenantId}::uuid,
          ${leaveRecordId}::uuid,
          ${period.weekNumber},
          ${period.startDate}::date,
          ${period.endDate}::date,
          ${period.payType}::app.statutory_leave_pay_type,
          ${period.amount}
        )
        RETURNING *
      `;
      results.push(row as PayPeriodRow);
    }
    return results;
  }

  /**
   * Delete pay periods for a leave record (for recalculation)
   */
  async deletePayPeriods(
    tx: TransactionSql,
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<void> {
    await tx`
      DELETE FROM app.statutory_leave_pay_periods
      WHERE leave_record_id = ${leaveRecordId}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
    `;
  }

  // ---------------------------------------------------------------------------
  // KIT Days
  // ---------------------------------------------------------------------------

  /**
   * Get KIT days for a leave record
   */
  async findKITDays(
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<KITDayRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<KITDayRow[]>`
        SELECT
          id, tenant_id, leave_record_id, work_date,
          hours_worked, notes, created_at
        FROM app.statutory_leave_kit_days
        WHERE leave_record_id = ${leaveRecordId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        ORDER BY work_date ASC
      `;
      return rows as KITDayRow[];
    });
  }

  /**
   * Count KIT days for a leave record
   */
  async countKITDays(
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<number> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<Array<{ count: string }>>`
        SELECT COUNT(*)::integer AS count
        FROM app.statutory_leave_kit_days
        WHERE leave_record_id = ${leaveRecordId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
      return Number(rows[0]?.count ?? 0);
    });
  }

  /**
   * Create a KIT day entry within a transaction
   */
  async createKITDay(
    tx: TransactionSql,
    ctx: TenantContext,
    data: {
      id: string;
      leaveRecordId: string;
      workDate: string;
      hoursWorked: number;
      notes?: string | null;
    }
  ): Promise<KITDayRow> {
    const [row] = await tx<KITDayRow[]>`
      INSERT INTO app.statutory_leave_kit_days (
        id, tenant_id, leave_record_id, work_date,
        hours_worked, notes
      ) VALUES (
        ${data.id}::uuid,
        ${ctx.tenantId}::uuid,
        ${data.leaveRecordId}::uuid,
        ${data.workDate}::date,
        ${data.hoursWorked},
        ${data.notes || null}
      )
      RETURNING *
    `;
    return row as KITDayRow;
  }

  // ---------------------------------------------------------------------------
  // Employee Lookups (for eligibility checks)
  // ---------------------------------------------------------------------------

  /**
   * Get employee record for eligibility checks
   */
  async findEmployeeById(
    ctx: TenantContext,
    employeeId: string
  ): Promise<EmployeeServiceRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<EmployeeServiceRow[]>`
        SELECT id, tenant_id, employee_number, hire_date, status
        FROM app.employees
        WHERE id = ${employeeId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
      return rows.length > 0 ? (rows[0] as EmployeeServiceRow) : null;
    });
  }

  /**
   * Check for overlapping statutory leave for an employee
   */
  async findOverlappingLeave(
    ctx: TenantContext,
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): Promise<StatutoryLeaveRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<StatutoryLeaveRow[]>`
        SELECT *
        FROM app.statutory_leave_records
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('planned', 'active')
          AND start_date <= ${endDate}::date
          AND end_date >= ${startDate}::date
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
      `;
      return rows as StatutoryLeaveRow[];
    });
  }

  // ---------------------------------------------------------------------------
  // Outbox
  // ---------------------------------------------------------------------------

  /**
   * Write a domain event to the outbox within a transaction
   */
  async writeOutbox(
    tx: TransactionSql,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify(payload)}::jsonb,
        now()
      )
    `;
  }
}
