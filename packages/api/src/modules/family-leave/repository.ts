/**
 * Family Leave Module - Repository Layer
 *
 * Data access for UK family leave records, pay periods, KIT days, and notices.
 * Built on top of the statutory_leave_records schema with family-leave
 * enhancement columns from migration 0159.
 *
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  FamilyLeaveType,
  FamilyLeaveStatus,
  EntitlementFilters,
  PaginationQuery,
  NoticeType,
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

export interface EntitlementRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveType: FamilyLeaveType;
  expectedDate: Date;
  actualDate: Date | null;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
  matb1Received: boolean;
  matb1Date: Date | null;
  partnerEmployeeId: string | null;
  curtailmentDate: Date | null;
  status: FamilyLeaveStatus;
  averageWeeklyEarnings: string | null;
  notes: string | null;
  createdBy: string | null;
  noticeGivenDate: Date | null;
  qualifyingWeek: Date | null;
  qualifiesForStatutoryPay: boolean;
  earningsAboveLel: boolean;
  paternityBlockNumber: number | null;
  splWeeksAvailable: number | null;
  splPayWeeksAvailable: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntitlementListRow extends EntitlementRow {
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
  payType: string;
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

export interface NoticeRow extends Row {
  id: string;
  tenantId: string;
  leaveRecordId: string;
  employeeId: string;
  noticeType: string;
  noticeDate: Date;
  receivedDate: Date | null;
  acknowledgedBy: string | null;
  acknowledgedDate: Date | null;
  documentReference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeServiceRow extends Row {
  id: string;
  tenantId: string;
  employeeNumber: string;
  hireDate: Date;
  status: string;
}

export interface DashboardCountRow extends Row {
  leaveType: FamilyLeaveType;
  status: FamilyLeaveStatus;
  count: string;
}

export interface UpcomingReturnRow extends Row {
  id: string;
  employeeId: string;
  employeeName: string | null;
  leaveType: FamilyLeaveType;
  endDate: Date;
}

export interface KITDaySummaryRow extends Row {
  id: string;
  employeeId: string;
  employeeName: string | null;
  leaveType: FamilyLeaveType;
  kitDaysUsed: number;
}

// =============================================================================
// Repository
// =============================================================================

export class FamilyLeaveRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Entitlement Records
  // ---------------------------------------------------------------------------

  /**
   * Find family leave records with filters and cursor-based pagination
   */
  async findEntitlements(
    ctx: TenantContext,
    filters: EntitlementFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EntitlementListRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<EntitlementListRow[]>`
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
          slr.notice_given_date,
          slr.qualifying_week,
          slr.qualifies_for_statutory_pay,
          slr.earnings_above_lel,
          slr.paternity_block_number,
          slr.spl_weeks_available,
          slr.spl_pay_weeks_available,
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
   * Find a single entitlement by ID
   */
  async findEntitlementById(
    ctx: TenantContext,
    id: string
  ): Promise<EntitlementRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id, leave_type,
          expected_date, actual_date, start_date, end_date,
          total_weeks, matb1_received, matb1_date,
          partner_employee_id, curtailment_date, status,
          average_weekly_earnings, notes, created_by,
          notice_given_date, qualifying_week,
          qualifies_for_statutory_pay, earnings_above_lel,
          paternity_block_number, spl_weeks_available,
          spl_pay_weeks_available,
          created_at, updated_at
        FROM app.statutory_leave_records
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
      return rows.length > 0 ? rows[0]! : null;
    });
  }

  /**
   * Create a new family leave entitlement
   */
  async createEntitlement(
    tx: TransactionSql,
    ctx: TenantContext,
    data: {
      id: string;
      employeeId: string;
      leaveType: FamilyLeaveType;
      expectedDate: string;
      actualDate?: string | null;
      startDate: string;
      endDate: string;
      totalWeeks: number;
      matb1Received: boolean;
      matb1Date?: string | null;
      partnerEmployeeId?: string | null;
      averageWeeklyEarnings?: number | null;
      noticeGivenDate?: string | null;
      qualifyingWeek?: string | null;
      qualifiesForStatutoryPay: boolean;
      earningsAboveLel: boolean;
      paternityBlockNumber?: number | null;
      notes?: string | null;
      createdBy?: string | null;
    }
  ): Promise<EntitlementRow> {
    const [row] = await tx<EntitlementRow[]>`
      INSERT INTO app.statutory_leave_records (
        id, tenant_id, employee_id, leave_type,
        expected_date, actual_date, start_date, end_date,
        total_weeks, matb1_received, matb1_date,
        partner_employee_id, average_weekly_earnings,
        notice_given_date, qualifying_week,
        qualifies_for_statutory_pay, earnings_above_lel,
        paternity_block_number,
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
        ${data.noticeGivenDate || null}::date,
        ${data.qualifyingWeek || null}::date,
        ${data.qualifiesForStatutoryPay},
        ${data.earningsAboveLel},
        ${data.paternityBlockNumber ?? null},
        ${data.notes || null},
        ${data.createdBy || null}::uuid,
        'planned'::app.statutory_leave_status
      )
      RETURNING *
    `;
    return row!;
  }

  /**
   * Update entitlement fields
   */
  async updateEntitlement(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      status?: FamilyLeaveStatus;
      curtailmentDate?: string | null;
      endDate?: string;
      totalWeeks?: number;
      splWeeksAvailable?: number | null;
      splPayWeeksAvailable?: number | null;
      qualifiesForStatutoryPay?: boolean;
      earningsAboveLel?: boolean;
    }
  ): Promise<EntitlementRow | null> {
    const rows = await tx<EntitlementRow[]>`
      UPDATE app.statutory_leave_records SET
        status = COALESCE(${data.status ?? null}::app.statutory_leave_status, status),
        curtailment_date = CASE
          WHEN ${data.curtailmentDate !== undefined} THEN ${data.curtailmentDate ?? null}::date
          ELSE curtailment_date
        END,
        end_date = COALESCE(${data.endDate ?? null}::date, end_date),
        total_weeks = COALESCE(${data.totalWeeks ?? null}::integer, total_weeks),
        spl_weeks_available = CASE
          WHEN ${data.splWeeksAvailable !== undefined} THEN ${data.splWeeksAvailable ?? null}
          ELSE spl_weeks_available
        END,
        spl_pay_weeks_available = CASE
          WHEN ${data.splPayWeeksAvailable !== undefined} THEN ${data.splPayWeeksAvailable ?? null}
          ELSE spl_pay_weeks_available
        END,
        qualifies_for_statutory_pay = COALESCE(${data.qualifiesForStatutoryPay ?? null}::boolean, qualifies_for_statutory_pay),
        earnings_above_lel = COALESCE(${data.earningsAboveLel ?? null}::boolean, earnings_above_lel),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;
    return rows.length > 0 ? rows[0]! : null;
  }

  // ---------------------------------------------------------------------------
  // Pay Periods
  // ---------------------------------------------------------------------------

  async findPayPeriods(
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<PayPeriodRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<PayPeriodRow[]>`
        SELECT
          id, tenant_id, leave_record_id, week_number,
          start_date, end_date, pay_type, amount, created_at
        FROM app.statutory_leave_pay_periods
        WHERE leave_record_id = ${leaveRecordId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        ORDER BY week_number ASC
      `;
    });
  }

  async createPayPeriods(
    tx: TransactionSql,
    ctx: TenantContext,
    leaveRecordId: string,
    periods: Array<{
      id: string;
      weekNumber: number;
      startDate: string;
      endDate: string;
      payType: string;
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
      results.push(row!);
    }
    return results;
  }

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

  async findKITDays(
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<KITDayRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<KITDayRow[]>`
        SELECT
          id, tenant_id, leave_record_id, work_date,
          hours_worked, notes, created_at
        FROM app.statutory_leave_kit_days
        WHERE leave_record_id = ${leaveRecordId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        ORDER BY work_date ASC
      `;
    });
  }

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
    return row!;
  }

  // ---------------------------------------------------------------------------
  // Notices
  // ---------------------------------------------------------------------------

  async findNotices(
    ctx: TenantContext,
    leaveRecordId: string
  ): Promise<NoticeRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<NoticeRow[]>`
        SELECT
          id, tenant_id, leave_record_id, employee_id,
          notice_type, notice_date, received_date,
          acknowledged_by, acknowledged_date,
          document_reference, notes, created_at, updated_at
        FROM app.family_leave_notices
        WHERE leave_record_id = ${leaveRecordId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        ORDER BY notice_date ASC
      `;
    });
  }

  async createNotice(
    tx: TransactionSql,
    ctx: TenantContext,
    data: {
      id: string;
      leaveRecordId: string;
      employeeId: string;
      noticeType: NoticeType;
      noticeDate: string;
      receivedDate?: string | null;
      documentReference?: string | null;
      notes?: string | null;
    }
  ): Promise<NoticeRow> {
    const [row] = await tx<NoticeRow[]>`
      INSERT INTO app.family_leave_notices (
        id, tenant_id, leave_record_id, employee_id,
        notice_type, notice_date, received_date,
        document_reference, notes
      ) VALUES (
        ${data.id}::uuid,
        ${ctx.tenantId}::uuid,
        ${data.leaveRecordId}::uuid,
        ${data.employeeId}::uuid,
        ${data.noticeType},
        ${data.noticeDate}::date,
        ${data.receivedDate || null}::date,
        ${data.documentReference || null},
        ${data.notes || null}
      )
      RETURNING *
    `;
    return row!;
  }

  // ---------------------------------------------------------------------------
  // Employee Lookups
  // ---------------------------------------------------------------------------

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
      return rows.length > 0 ? rows[0]! : null;
    });
  }

  async findOverlappingLeave(
    ctx: TenantContext,
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): Promise<EntitlementRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<EntitlementRow[]>`
        SELECT *
        FROM app.statutory_leave_records
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('planned', 'active')
          AND start_date <= ${endDate}::date
          AND end_date >= ${startDate}::date
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
      `;
    });
  }

  // ---------------------------------------------------------------------------
  // Dashboard Queries
  // ---------------------------------------------------------------------------

  async getLeaveCountsByStatus(
    ctx: TenantContext
  ): Promise<DashboardCountRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<DashboardCountRow[]>`
        SELECT leave_type, status, COUNT(*)::text AS count
        FROM app.statutory_leave_records
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('active', 'planned')
        GROUP BY leave_type, status
      `;
    });
  }

  async getUpcomingReturns(
    ctx: TenantContext,
    withinDays: number = 30
  ): Promise<UpcomingReturnRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<UpcomingReturnRow[]>`
        SELECT
          slr.id,
          slr.employee_id,
          CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
          slr.leave_type,
          slr.end_date
        FROM app.statutory_leave_records slr
        JOIN app.employees e ON e.id = slr.employee_id AND e.tenant_id = slr.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = slr.employee_id
          AND ep.tenant_id = slr.tenant_id
          AND ep.effective_to IS NULL
        WHERE slr.tenant_id = ${ctx.tenantId}::uuid
          AND slr.status = 'active'
          AND slr.end_date >= CURRENT_DATE
          AND slr.end_date <= CURRENT_DATE + ${withinDays}::integer * INTERVAL '1 day'
        ORDER BY slr.end_date ASC
        LIMIT 20
      `;
    });
  }

  async getActiveLeaveKITSummary(
    ctx: TenantContext
  ): Promise<KITDaySummaryRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<KITDaySummaryRow[]>`
        SELECT
          slr.id,
          slr.employee_id,
          CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
          slr.leave_type,
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
          AND slr.status = 'active'
          AND slr.leave_type != 'paternity'
        ORDER BY slr.start_date ASC
      `;
    });
  }

  /**
   * Find active/planned leaves missing required notices
   * (compliance alert generation)
   */
  async findLeavesWithoutNotices(
    ctx: TenantContext
  ): Promise<Array<EntitlementRow & { hasNotice: boolean }>> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<Array<EntitlementRow & { hasNotice: boolean }>>`
        SELECT
          slr.*,
          EXISTS(
            SELECT 1 FROM app.family_leave_notices fln
            WHERE fln.leave_record_id = slr.id
              AND fln.tenant_id = slr.tenant_id
          ) AS has_notice
        FROM app.statutory_leave_records slr
        WHERE slr.tenant_id = ${ctx.tenantId}::uuid
          AND slr.status IN ('planned', 'active')
          AND slr.notice_given_date IS NULL
        ORDER BY slr.start_date ASC
        LIMIT 50
      `;
    });
  }

  // ---------------------------------------------------------------------------
  // Outbox
  // ---------------------------------------------------------------------------

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
