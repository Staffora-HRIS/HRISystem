/**
 * Working Time Regulations Module - Repository Layer
 *
 * Data access methods for WTR opt-outs, alerts, and working hour calculations.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Queries timesheet_lines to calculate actual hours worked, as timesheets
 * aggregate daily entries with regular + overtime hours.
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

export interface OptOutRow {
  id: string;
  tenantId: string;
  employeeId: string;
  optedOut: boolean;
  optOutDate: Date;
  optInDate: Date | null;
  noticePeriodWeeks: number;
  signedDocumentKey: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertRow {
  id: string;
  tenantId: string;
  employeeId: string;
  alertType: string;
  referencePeriodStart: Date;
  referencePeriodEnd: Date;
  actualValue: number;
  thresholdValue: number;
  details: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

export interface WeeklyHoursRow {
  weekStart: Date;
  weekEnd: Date;
  totalHours: number;
}

export interface EmployeeHoursRow {
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  averageWeeklyHours: number;
}

// =============================================================================
// Repository Class
// =============================================================================

export class WTRRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Opt-Out CRUD
  // ===========================================================================

  async createOptOut(
    ctx: TenantContext,
    data: {
      employeeId: string;
      optOutDate: Date;
      noticePeriodWeeks?: number;
      signedDocumentKey?: string;
    }
  ): Promise<OptOutRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<OptOutRow[]>`
        INSERT INTO app.wtr_opt_outs (
          id, tenant_id, employee_id, opted_out, opt_out_date,
          notice_period_weeks, signed_document_key, status
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          true, ${data.optOutDate},
          ${data.noticePeriodWeeks ?? 0}, ${data.signedDocumentKey || null},
          'active'
        )
        RETURNING id, tenant_id, employee_id, opted_out, opt_out_date,
                  opt_in_date, notice_period_weeks, signed_document_key,
                  status, created_at, updated_at
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "wtr_opt_out",
        id,
        "wtr.opt_out.created",
        {
          optOutId: id,
          employeeId: data.employeeId,
          optOutDate: data.optOutDate,
          actor: ctx.userId,
        }
      );

      return row as OptOutRow;
    });
  }

  async getOptOutById(
    ctx: TenantContext,
    id: string
  ): Promise<OptOutRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OptOutRow[]>`
        SELECT id, tenant_id, employee_id, opted_out, opt_out_date,
               opt_in_date, notice_period_weeks, signed_document_key,
               status, created_at, updated_at
        FROM app.wtr_opt_outs
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as OptOutRow) : null;
  }

  async getActiveOptOutByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<OptOutRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OptOutRow[]>`
        SELECT id, tenant_id, employee_id, opted_out, opt_out_date,
               opt_in_date, notice_period_weeks, signed_document_key,
               status, created_at, updated_at
        FROM app.wtr_opt_outs
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'active'
        ORDER BY opt_out_date DESC
        LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as OptOutRow) : null;
  }

  async listOptOuts(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      status?: string;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<OptOutRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OptOutRow[]>`
        SELECT id, tenant_id, employee_id, opted_out, opt_out_date,
               opt_in_date, notice_period_weeks, signed_document_key,
               status, created_at, updated_at
        FROM app.wtr_opt_outs
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.status ? tx`AND status = ${filters.status}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY opt_out_date DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor =
      hasMore && data.length > 0
        ? data[data.length - 1]?.id ?? null
        : null;

    return { data: data as OptOutRow[], cursor, hasMore };
  }

  async revokeOptOut(
    ctx: TenantContext,
    id: string,
    optInDate: Date
  ): Promise<OptOutRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<OptOutRow[]>`
        UPDATE app.wtr_opt_outs SET
          status = 'revoked',
          opt_in_date = ${optInDate},
          opted_out = false,
          updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status = 'active'
        RETURNING id, tenant_id, employee_id, opted_out, opt_out_date,
                  opt_in_date, notice_period_weeks, signed_document_key,
                  status, created_at, updated_at
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "wtr_opt_out",
          id,
          "wtr.opt_out.revoked",
          {
            optOutId: id,
            employeeId: row.employeeId,
            optInDate,
            actor: ctx.userId,
          }
        );
      }

      return row as OptOutRow | null;
    });
  }

  // ===========================================================================
  // Alert CRUD
  // ===========================================================================

  async createAlert(
    ctx: TenantContext,
    data: {
      employeeId: string;
      alertType: string;
      referencePeriodStart: Date;
      referencePeriodEnd: Date;
      actualValue: number;
      thresholdValue: number;
      details: Record<string, unknown>;
    }
  ): Promise<AlertRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<AlertRow[]>`
        INSERT INTO app.wtr_alerts (
          id, tenant_id, employee_id, alert_type,
          reference_period_start, reference_period_end,
          actual_value, threshold_value, details
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.alertType}::app.wtr_alert_type,
          ${data.referencePeriodStart}, ${data.referencePeriodEnd},
          ${data.actualValue}, ${data.thresholdValue},
          ${JSON.stringify(data.details)}::jsonb
        )
        RETURNING id, tenant_id, employee_id, alert_type,
                  reference_period_start, reference_period_end,
                  actual_value, threshold_value, details,
                  acknowledged, acknowledged_by, acknowledged_at, created_at
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "wtr_alert",
        id,
        "wtr.alert.created",
        {
          alertId: id,
          employeeId: data.employeeId,
          alertType: data.alertType,
          actualValue: data.actualValue,
          thresholdValue: data.thresholdValue,
          actor: ctx.userId,
        }
      );

      return row as AlertRow;
    });
  }

  async getAlertById(
    ctx: TenantContext,
    id: string
  ): Promise<AlertRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AlertRow[]>`
        SELECT id, tenant_id, employee_id, alert_type,
               reference_period_start, reference_period_end,
               actual_value, threshold_value, details,
               acknowledged, acknowledged_by, acknowledged_at, created_at
        FROM app.wtr_alerts
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as AlertRow) : null;
  }

  async listAlerts(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      alertType?: string;
      acknowledged?: boolean;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<AlertRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AlertRow[]>`
        SELECT id, tenant_id, employee_id, alert_type,
               reference_period_start, reference_period_end,
               actual_value, threshold_value, details,
               acknowledged, acknowledged_by, acknowledged_at, created_at
        FROM app.wtr_alerts
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.alertType ? tx`AND alert_type = ${filters.alertType}::app.wtr_alert_type` : tx``}
        ${filters.acknowledged !== undefined ? tx`AND acknowledged = ${filters.acknowledged}` : tx``}
        ${filters.from ? tx`AND reference_period_start >= ${filters.from}::date` : tx``}
        ${filters.to ? tx`AND reference_period_end <= ${filters.to}::date` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor =
      hasMore && data.length > 0
        ? data[data.length - 1]?.id ?? null
        : null;

    return { data: data as AlertRow[], cursor, hasMore };
  }

  async acknowledgeAlert(
    ctx: TenantContext,
    id: string,
    userId: string
  ): Promise<AlertRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<AlertRow[]>`
        UPDATE app.wtr_alerts SET
          acknowledged = true,
          acknowledged_by = ${userId}::uuid,
          acknowledged_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND acknowledged = false
        RETURNING id, tenant_id, employee_id, alert_type,
                  reference_period_start, reference_period_end,
                  actual_value, threshold_value, details,
                  acknowledged, acknowledged_by, acknowledged_at, created_at
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "wtr_alert",
          id,
          "wtr.alert.acknowledged",
          {
            alertId: id,
            employeeId: row.employeeId,
            acknowledgedBy: userId,
            actor: ctx.userId,
          }
        );
      }

      return row as AlertRow | null;
    });
  }

  async getUnacknowledgedAlerts(ctx: TenantContext): Promise<AlertRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AlertRow[]>`
        SELECT id, tenant_id, employee_id, alert_type,
               reference_period_start, reference_period_end,
               actual_value, threshold_value, details,
               acknowledged, acknowledged_by, acknowledged_at, created_at
        FROM app.wtr_alerts
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND acknowledged = false
        ORDER BY created_at DESC
      `;
      return rows as AlertRow[];
    });
  }

  async getUnacknowledgedAlertCount(ctx: TenantContext): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM app.wtr_alerts
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND acknowledged = false
      `;
    });
    return rows[0]?.count ?? 0;
  }

  async getAlertCountsByType(
    ctx: TenantContext
  ): Promise<Record<string, number>> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ alertType: string; count: number }[]>`
        SELECT alert_type, COUNT(*)::int as count
        FROM app.wtr_alerts
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND acknowledged = false
        GROUP BY alert_type
      `;
    });

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.alertType] = row.count;
    }
    return result;
  }

  // ===========================================================================
  // Working Hours Queries
  // ===========================================================================

  /**
   * Get total hours worked for an employee in a given date range.
   * Sources data from timesheet_lines (regular_hours + overtime_hours).
   */
  async getWeeklyHours(
    ctx: TenantContext,
    employeeId: string,
    weekStart: Date,
    weekEnd: Date
  ): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ totalHours: number }[]>`
        SELECT COALESCE(
          SUM(tl.regular_hours + tl.overtime_hours), 0
        )::numeric as total_hours
        FROM app.timesheet_lines tl
        JOIN app.timesheets t ON tl.timesheet_id = t.id
        WHERE t.employee_id = ${employeeId}::uuid
          AND t.tenant_id = ${ctx.tenantId}::uuid
          AND tl.work_date >= ${weekStart}::date
          AND tl.work_date <= ${weekEnd}::date
          AND t.status IN ('submitted', 'approved', 'locked')
      `;
    });
    return Number(rows[0]?.totalHours ?? 0);
  }

  /**
   * Get average weekly hours over a reference period (default 17 weeks).
   * Returns both the average and the weekly breakdown.
   */
  async getAverageWeeklyHours(
    ctx: TenantContext,
    employeeId: string,
    referencePeriodWeeks: number = 17
  ): Promise<{ average: number; weeks: WeeklyHoursRow[] }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - referencePeriodWeeks * 7);

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<WeeklyHoursRow[]>`
        SELECT
          date_trunc('week', tl.work_date)::date as week_start,
          (date_trunc('week', tl.work_date) + interval '6 days')::date as week_end,
          COALESCE(SUM(tl.regular_hours + tl.overtime_hours), 0)::numeric as total_hours
        FROM app.timesheet_lines tl
        JOIN app.timesheets t ON tl.timesheet_id = t.id
        WHERE t.employee_id = ${employeeId}::uuid
          AND t.tenant_id = ${ctx.tenantId}::uuid
          AND tl.work_date >= ${startDate}::date
          AND tl.work_date <= ${endDate}::date
          AND t.status IN ('submitted', 'approved', 'locked')
        GROUP BY date_trunc('week', tl.work_date)
        ORDER BY week_start
      `;
    });

    const weeks = rows.map((r) => ({
      weekStart: r.weekStart,
      weekEnd: r.weekEnd,
      totalHours: Number(r.totalHours),
    }));

    const totalHours = weeks.reduce((sum, w) => sum + w.totalHours, 0);
    // Use actual number of weeks with data, minimum 1 to avoid division by zero
    const numWeeks = Math.max(weeks.length, 1);
    const average = totalHours / numWeeks;

    return { average: Math.round(average * 100) / 100, weeks };
  }

  /**
   * Find all employees whose average weekly hours exceed a threshold.
   * Used by the compliance check job.
   */
  async findEmployeesExceedingHours(
    ctx: TenantContext,
    threshold: number,
    referencePeriodWeeks: number = 17
  ): Promise<EmployeeHoursRow[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - referencePeriodWeeks * 7);

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<EmployeeHoursRow[]>`
        SELECT
          e.id as employee_id,
          ep.first_name || ' ' || ep.last_name as employee_name,
          e.employee_number,
          ROUND(
            COALESCE(SUM(tl.regular_hours + tl.overtime_hours), 0)
            / GREATEST(
              (SELECT COUNT(DISTINCT date_trunc('week', tl2.work_date))
               FROM app.timesheet_lines tl2
               JOIN app.timesheets t2 ON tl2.timesheet_id = t2.id
               WHERE t2.employee_id = e.id
                 AND tl2.work_date >= ${startDate}::date
                 AND tl2.work_date <= ${endDate}::date
                 AND t2.status IN ('submitted', 'approved', 'locked')
              ), 1
            ),
            2
          )::numeric as average_weekly_hours
        FROM app.employees e
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
          AND ep.effective_to IS NULL
        LEFT JOIN app.timesheets t ON t.employee_id = e.id
          AND t.tenant_id = ${ctx.tenantId}::uuid
          AND t.status IN ('submitted', 'approved', 'locked')
        LEFT JOIN app.timesheet_lines tl ON tl.timesheet_id = t.id
          AND tl.work_date >= ${startDate}::date
          AND tl.work_date <= ${endDate}::date
        WHERE e.tenant_id = ${ctx.tenantId}::uuid
          AND e.status = 'active'
        GROUP BY e.id, ep.first_name, ep.last_name, e.employee_number
        HAVING COALESCE(SUM(tl.regular_hours + tl.overtime_hours), 0)
          / GREATEST(
            (SELECT COUNT(DISTINCT date_trunc('week', tl3.work_date))
             FROM app.timesheet_lines tl3
             JOIN app.timesheets t3 ON tl3.timesheet_id = t3.id
             WHERE t3.employee_id = e.id
               AND tl3.work_date >= ${startDate}::date
               AND tl3.work_date <= ${endDate}::date
               AND t3.status IN ('submitted', 'approved', 'locked')
            ), 1
          ) > ${threshold}
        ORDER BY average_weekly_hours DESC
      `;
      return rows as EmployeeHoursRow[];
    });
  }

  /**
   * Get all active employee IDs with opt-outs for a tenant.
   * Used to exclude opted-out employees from the 48-hour check.
   */
  async getActiveOptOutEmployeeIds(ctx: TenantContext): Promise<Set<string>> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ employeeId: string }[]>`
        SELECT employee_id
        FROM app.wtr_opt_outs
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND status = 'active'
      `;
    });
    return new Set(rows.map((r) => r.employeeId));
  }

  /**
   * Count active employees for a tenant.
   */
  async getActiveEmployeeCount(ctx: TenantContext): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM app.employees
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND status = 'active'
      `;
    });
    return rows[0]?.count ?? 0;
  }

  /**
   * Count employees with active opt-outs for a tenant.
   */
  async getActiveOptOutCount(ctx: TenantContext): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ count: number }[]>`
        SELECT COUNT(DISTINCT employee_id)::int as count
        FROM app.wtr_opt_outs
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND status = 'active'
      `;
    });
    return rows[0]?.count ?? 0;
  }

  /**
   * Check if a recent alert of the same type already exists for an employee
   * within the same reference period to avoid duplicate alerts.
   */
  async hasRecentAlert(
    ctx: TenantContext,
    employeeId: string,
    alertType: string,
    referencePeriodStart: Date,
    referencePeriodEnd: Date
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1
          FROM app.wtr_alerts
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${employeeId}::uuid
            AND alert_type = ${alertType}::app.wtr_alert_type
            AND reference_period_start = ${referencePeriodStart}::date
            AND reference_period_end = ${referencePeriodEnd}::date
        ) as exists
      `;
    });
    return rows[0]?.exists ?? false;
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
