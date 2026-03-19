/**
 * Overtime Rules Module - Repository Layer
 *
 * Data access layer for overtime rule configuration and overtime calculations.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Tables:
 *   - app.overtime_rules (rate configuration with effective dating)
 *   - app.overtime_calculations (calculated overtime per employee per period)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface OvertimeRuleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  thresholdHoursWeekly: number;
  rateMultiplier: number;
  appliesToRoles: string[] | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OvertimeCalculationRow {
  id: string;
  tenantId: string;
  employeeId: string;
  ruleId: string | null;
  periodStart: Date;
  periodEnd: Date;
  regularHours: number;
  overtimeHours: number;
  overtimeRate: number;
  hourlyRate: number;
  overtimeAmount: number;
  totalHours: number;
  status: string;
  notes: string | null;
  calculatedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeHoursRow {
  employeeId: string;
  totalHours: number;
}

// =============================================================================
// Repository
// =============================================================================

export class OvertimeRulesRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Overtime Rules - CRUD
  // ===========================================================================

  async createRule(
    ctx: TenantContext,
    data: {
      name: string;
      description?: string;
      thresholdHoursWeekly: number;
      rateMultiplier: number;
      appliesToRoles?: string[] | null;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
      isActive?: boolean;
    }
  ): Promise<OvertimeRuleRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<OvertimeRuleRow[]>`
        INSERT INTO app.overtime_rules (
          id, tenant_id, name, description,
          threshold_hours_weekly, rate_multiplier,
          applies_to_roles, effective_from, effective_to,
          is_active, created_by
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid,
          ${data.name}, ${data.description || null},
          ${data.thresholdHoursWeekly}, ${data.rateMultiplier},
          ${data.appliesToRoles || null}, ${data.effectiveFrom}, ${data.effectiveTo || null},
          ${data.isActive !== false}, ${ctx.userId || null}::uuid
        )
        RETURNING *
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "overtime_rule",
        id,
        "time.overtime_rule.created",
        {
          ruleId: id,
          name: data.name,
          thresholdHoursWeekly: data.thresholdHoursWeekly,
          rateMultiplier: data.rateMultiplier,
          actor: ctx.userId,
        }
      );

      return row as OvertimeRuleRow;
    });
  }

  async getRuleById(
    ctx: TenantContext,
    id: string
  ): Promise<OvertimeRuleRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OvertimeRuleRow[]>`
        SELECT *
        FROM app.overtime_rules
        WHERE id = ${id}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as OvertimeRuleRow) : null;
  }

  async getRules(
    ctx: TenantContext,
    filters: {
      isActive?: boolean;
      effectiveDate?: Date;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<OvertimeRuleRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OvertimeRuleRow[]>`
        SELECT *
        FROM app.overtime_rules
        WHERE 1=1
        ${filters.isActive !== undefined ? tx`AND is_active = ${filters.isActive}` : tx``}
        ${
          filters.effectiveDate
            ? tx`AND effective_from <= ${filters.effectiveDate} AND (effective_to IS NULL OR effective_to >= ${filters.effectiveDate})`
            : tx``
        }
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY effective_from DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor =
      hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as OvertimeRuleRow[], cursor, hasMore };
  }

  async updateRule(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      thresholdHoursWeekly: number;
      rateMultiplier: number;
      appliesToRoles: string[] | null;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      isActive: boolean;
    }>
  ): Promise<OvertimeRuleRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<OvertimeRuleRow[]>`
        UPDATE app.overtime_rules SET
          name = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          threshold_hours_weekly = COALESCE(${data.thresholdHoursWeekly ?? null}, threshold_hours_weekly),
          rate_multiplier = COALESCE(${data.rateMultiplier ?? null}, rate_multiplier),
          applies_to_roles = COALESCE(${data.appliesToRoles !== undefined ? data.appliesToRoles : null}, applies_to_roles),
          effective_from = COALESCE(${data.effectiveFrom ?? null}, effective_from),
          effective_to = ${data.effectiveTo !== undefined ? data.effectiveTo : tx`effective_to`},
          is_active = COALESCE(${data.isActive ?? null}, is_active),
          updated_by = ${ctx.userId || null}::uuid,
          updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "overtime_rule",
          id,
          "time.overtime_rule.updated",
          {
            ruleId: id,
            changes: data,
            actor: ctx.userId,
          }
        );
      }

      return (row as OvertimeRuleRow) || null;
    });
  }

  async deleteRule(
    ctx: TenantContext,
    id: string
  ): Promise<boolean> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        DELETE FROM app.overtime_rules
        WHERE id = ${id}::uuid
        RETURNING id
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "overtime_rule",
          id,
          "time.overtime_rule.deleted",
          { ruleId: id, actor: ctx.userId }
        );
      }

      return !!row;
    });
  }

  // ===========================================================================
  // Active rules lookup (for calculation)
  // ===========================================================================

  /**
   * Get all active overtime rules effective for a given date range.
   * Returns rules that overlap with the period.
   */
  async getActiveRulesForPeriod(
    ctx: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<OvertimeRuleRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<OvertimeRuleRow[]>`
        SELECT *
        FROM app.overtime_rules
        WHERE is_active = true
          AND effective_from <= ${periodEnd}
          AND (effective_to IS NULL OR effective_to >= ${periodStart})
        ORDER BY rate_multiplier DESC
      `;
      return rows as OvertimeRuleRow[];
    });
  }

  // ===========================================================================
  // Employee hours aggregation (from timesheets)
  // ===========================================================================

  /**
   * Get total hours worked for a specific employee in a period from approved/submitted timesheets.
   */
  async getEmployeeHoursForPeriod(
    ctx: TenantContext,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ totalHours: number; regularHours: number; existingOvertimeHours: number }> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [result] = await tx<{
        totalRegular: string;
        totalOvertime: string;
      }[]>`
        SELECT
          COALESCE(SUM(total_regular_hours), 0)::text AS total_regular,
          COALESCE(SUM(total_overtime_hours), 0)::text AS total_overtime
        FROM app.timesheets
        WHERE employee_id = ${employeeId}::uuid
          AND period_start >= ${periodStart}
          AND period_end <= ${periodEnd}
          AND status IN ('submitted', 'approved', 'paid')
      `;

      const regularHours = Number(result?.totalRegular ?? 0);
      const existingOvertimeHours = Number(result?.totalOvertime ?? 0);

      return {
        totalHours: regularHours + existingOvertimeHours,
        regularHours,
        existingOvertimeHours,
      };
    });
  }

  /**
   * Get total hours for all active employees in a period (for batch calculation).
   */
  async getAllEmployeeHoursForPeriod(
    ctx: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<EmployeeHoursRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<EmployeeHoursRow[]>`
        SELECT
          t.employee_id,
          COALESCE(SUM(t.total_regular_hours + t.total_overtime_hours), 0) AS total_hours
        FROM app.timesheets t
        JOIN app.employees e ON e.id = t.employee_id AND e.status = 'active'
        WHERE t.period_start >= ${periodStart}
          AND t.period_end <= ${periodEnd}
          AND t.status IN ('submitted', 'approved', 'paid')
        GROUP BY t.employee_id
      `;
      return rows as EmployeeHoursRow[];
    });
  }

  /**
   * Get the employee's hourly rate from their current compensation.
   * Falls back to 0 if no compensation record exists.
   */
  async getEmployeeHourlyRate(
    ctx: TenantContext,
    employeeId: string
  ): Promise<number> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ hourlyRate: string }[]>`
        SELECT
          CASE
            WHEN pay_frequency = 'hourly' THEN base_salary
            WHEN pay_frequency = 'annual' THEN ROUND(base_salary / 2080, 2)
            WHEN pay_frequency = 'monthly' THEN ROUND((base_salary * 12) / 2080, 2)
            WHEN pay_frequency = 'weekly' THEN ROUND(base_salary / 40, 2)
            ELSE ROUND(base_salary / 2080, 2)
          END AS hourly_rate
        FROM app.employee_compensation
        WHERE employee_id = ${employeeId}::uuid
          AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC
        LIMIT 1
      `;

      return Number(rows[0]?.hourlyRate ?? 0);
    });
  }

  // ===========================================================================
  // Overtime Calculations
  // ===========================================================================

  async createCalculation(
    ctx: TenantContext,
    data: {
      employeeId: string;
      ruleId: string | null;
      periodStart: Date;
      periodEnd: Date;
      regularHours: number;
      overtimeHours: number;
      overtimeRate: number;
      hourlyRate: number;
      overtimeAmount: number;
      totalHours: number;
      notes?: string;
    }
  ): Promise<OvertimeCalculationRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();

      const [row] = await tx<OvertimeCalculationRow[]>`
        INSERT INTO app.overtime_calculations (
          id, tenant_id, employee_id, rule_id,
          period_start, period_end,
          regular_hours, overtime_hours, overtime_rate,
          hourly_rate, overtime_amount, total_hours,
          status, notes, calculated_by
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid,
          ${data.employeeId}::uuid, ${data.ruleId}::uuid,
          ${data.periodStart}, ${data.periodEnd},
          ${data.regularHours}, ${data.overtimeHours}, ${data.overtimeRate},
          ${data.hourlyRate}, ${data.overtimeAmount}, ${data.totalHours},
          'calculated', ${data.notes || null}, ${ctx.userId || null}::uuid
        )
        ON CONFLICT (tenant_id, employee_id, period_start, period_end, rule_id)
        DO UPDATE SET
          regular_hours = EXCLUDED.regular_hours,
          overtime_hours = EXCLUDED.overtime_hours,
          overtime_rate = EXCLUDED.overtime_rate,
          hourly_rate = EXCLUDED.hourly_rate,
          overtime_amount = EXCLUDED.overtime_amount,
          total_hours = EXCLUDED.total_hours,
          notes = EXCLUDED.notes,
          calculated_by = EXCLUDED.calculated_by,
          status = 'calculated',
          updated_at = now()
        RETURNING *
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "overtime_calculation",
        id,
        "time.overtime.calculated",
        {
          calculationId: id,
          employeeId: data.employeeId,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          overtimeHours: data.overtimeHours,
          overtimeAmount: data.overtimeAmount,
          actor: ctx.userId,
        }
      );

      return row as OvertimeCalculationRow;
    });
  }

  async getCalculationById(
    ctx: TenantContext,
    id: string
  ): Promise<OvertimeCalculationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OvertimeCalculationRow[]>`
        SELECT *
        FROM app.overtime_calculations
        WHERE id = ${id}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as OvertimeCalculationRow) : null;
  }

  async getCalculations(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      status?: string;
      periodStart?: Date;
      periodEnd?: Date;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<OvertimeCalculationRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OvertimeCalculationRow[]>`
        SELECT *
        FROM app.overtime_calculations
        WHERE 1=1
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.status ? tx`AND status = ${filters.status}::app.overtime_calculation_status` : tx``}
        ${filters.periodStart ? tx`AND period_start >= ${filters.periodStart}` : tx``}
        ${filters.periodEnd ? tx`AND period_end <= ${filters.periodEnd}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY period_start DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor =
      hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as OvertimeCalculationRow[], cursor, hasMore };
  }

  async approveCalculation(
    ctx: TenantContext,
    id: string,
    notes?: string
  ): Promise<OvertimeCalculationRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<OvertimeCalculationRow[]>`
        UPDATE app.overtime_calculations SET
          status = 'approved',
          approved_by = ${ctx.userId || null}::uuid,
          approved_at = now(),
          notes = COALESCE(${notes ?? null}, notes),
          updated_at = now()
        WHERE id = ${id}::uuid
          AND status = 'calculated'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "overtime_calculation",
          id,
          "time.overtime.approved",
          {
            calculationId: id,
            employeeId: row.employeeId,
            overtimeHours: row.overtimeHours,
            overtimeAmount: row.overtimeAmount,
            approvedBy: ctx.userId,
          }
        );
      }

      return (row as OvertimeCalculationRow) || null;
    });
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
