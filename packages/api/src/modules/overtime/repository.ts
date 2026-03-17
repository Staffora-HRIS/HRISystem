/**
 * Overtime Repository
 *
 * Data access layer for overtime rule management and overtime calculations.
 * Uses postgres.js tagged templates with RLS-enforced tenant context.
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

export interface OvertimeRuleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  dayType: string;
  thresholdHoursWeekly: number;
  rateMultiplier: number;
  isActive: boolean;
  appliesTo: Record<string, unknown>;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OvertimeCalculationRow {
  id: string;
  tenantId: string;
  employeeId: string;
  ruleId: string;
  periodStart: Date;
  periodEnd: Date;
  totalHoursWorked: number;
  regularHours: number;
  overtimeHours: number;
  rateMultiplier: number;
  overtimePayUnits: number;
  weekdayHours: number;
  weekendHours: number;
  bankHolidayHours: number;
  calculatedAt: Date;
  calculatedBy: string | null;
  createdAt: Date;
}

export interface TimeEventForCalc {
  id: string;
  employeeId: string;
  eventType: string;
  eventTime: Date;
}

export interface BankHolidayDate {
  holidayDate: Date;
}

// =============================================================================
// Repository Class
// =============================================================================

export class OvertimeRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Overtime Rules CRUD
  // ===========================================================================

  async createOvertimeRule(
    ctx: TenantContext,
    data: {
      name: string;
      description?: string;
      dayType: string;
      thresholdHoursWeekly: number;
      rateMultiplier: number;
      isActive?: boolean;
      appliesTo?: Record<string, unknown>;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
    }
  ): Promise<OvertimeRuleRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<OvertimeRuleRow[]>`
        INSERT INTO app.overtime_rules (
          id, tenant_id, name, description, day_type,
          threshold_hours_weekly, rate_multiplier, is_active,
          applies_to, effective_from, effective_to
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.name},
          ${data.description || null}, ${data.dayType},
          ${data.thresholdHoursWeekly}, ${data.rateMultiplier},
          ${data.isActive !== false}, ${JSON.stringify(data.appliesTo || {})}::jsonb,
          ${data.effectiveFrom}, ${data.effectiveTo || null}
        )
        RETURNING *
      `;

      // Write to outbox
      await this.writeOutbox(tx, ctx.tenantId, "overtime_rule", id, "overtime.rule.created", {
        ruleId: id,
        name: data.name,
        dayType: data.dayType,
        rateMultiplier: data.rateMultiplier,
        actor: ctx.userId,
      });

      return row as OvertimeRuleRow;
    });
  }

  async getOvertimeRules(
    ctx: TenantContext,
    filters: {
      dayType?: string;
      isActive?: boolean;
      effectiveDate?: Date;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<OvertimeRuleRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OvertimeRuleRow[]>`
        SELECT
          id, tenant_id, name, description, day_type,
          threshold_hours_weekly, rate_multiplier, is_active,
          applies_to, effective_from, effective_to,
          created_at, updated_at
        FROM app.overtime_rules
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.dayType ? tx`AND day_type = ${filters.dayType}` : tx``}
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
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as OvertimeRuleRow[], cursor, hasMore };
  }

  async getOvertimeRuleById(ctx: TenantContext, id: string): Promise<OvertimeRuleRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OvertimeRuleRow[]>`
        SELECT
          id, tenant_id, name, description, day_type,
          threshold_hours_weekly, rate_multiplier, is_active,
          applies_to, effective_from, effective_to,
          created_at, updated_at
        FROM app.overtime_rules
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as OvertimeRuleRow) : null;
  }

  async updateOvertimeRule(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      dayType: string;
      thresholdHoursWeekly: number;
      rateMultiplier: number;
      isActive: boolean;
      appliesTo: Record<string, unknown>;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    }>
  ): Promise<OvertimeRuleRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Build the update dynamically; only set provided fields
      const [row] = await tx<OvertimeRuleRow[]>`
        UPDATE app.overtime_rules SET
          name = COALESCE(${data.name ?? null}, name),
          description = ${data.description !== undefined ? data.description : null},
          day_type = COALESCE(${data.dayType ?? null}, day_type),
          threshold_hours_weekly = COALESCE(${data.thresholdHoursWeekly ?? null}, threshold_hours_weekly),
          rate_multiplier = COALESCE(${data.rateMultiplier ?? null}, rate_multiplier),
          is_active = COALESCE(${data.isActive ?? null}, is_active),
          applies_to = COALESCE(${data.appliesTo ? JSON.stringify(data.appliesTo) : null}::jsonb, applies_to),
          effective_from = COALESCE(${data.effectiveFrom ?? null}, effective_from),
          effective_to = ${data.effectiveTo !== undefined ? data.effectiveTo : null},
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "overtime_rule", id, "overtime.rule.updated", {
          ruleId: id,
          changes: data,
          actor: ctx.userId,
        });
      }

      return row as OvertimeRuleRow | null;
    });
  }

  async deleteOvertimeRule(ctx: TenantContext, id: string): Promise<boolean> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        DELETE FROM app.overtime_rules
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "overtime_rule", id, "overtime.rule.deleted", {
          ruleId: id,
          actor: ctx.userId,
        });
        return true;
      }

      return false;
    });
  }

  // ===========================================================================
  // Active Rules for Calculation
  // ===========================================================================

  async getActiveRulesForDate(
    ctx: TenantContext,
    date: Date
  ): Promise<OvertimeRuleRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<OvertimeRuleRow[]>`
        SELECT
          id, tenant_id, name, description, day_type,
          threshold_hours_weekly, rate_multiplier, is_active,
          applies_to, effective_from, effective_to,
          created_at, updated_at
        FROM app.overtime_rules
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND is_active = true
          AND effective_from <= ${date}
          AND (effective_to IS NULL OR effective_to >= ${date})
        ORDER BY day_type, threshold_hours_weekly ASC
      `;
      return rows as OvertimeRuleRow[];
    });
  }

  // ===========================================================================
  // Time Events for Calculation
  // ===========================================================================

  async getTimeEventsForPeriod(
    ctx: TenantContext,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TimeEventForCalc[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<TimeEventForCalc[]>`
        SELECT id, employee_id, event_type, event_time
        FROM app.time_events
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND employee_id = ${employeeId}::uuid
          AND event_time >= ${periodStart}
          AND event_time <= ${periodEnd}
        ORDER BY event_time ASC
      `;
      return rows as TimeEventForCalc[];
    });
  }

  // ===========================================================================
  // Bank Holidays for Calculation
  // ===========================================================================

  async getBankHolidaysForPeriod(
    ctx: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<BankHolidayDate[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<BankHolidayDate[]>`
        SELECT holiday_date
        FROM app.bank_holidays
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND holiday_date >= ${periodStart}
          AND holiday_date <= ${periodEnd}
      `;
      return rows as BankHolidayDate[];
    });
  }

  // ===========================================================================
  // Save Calculation Results
  // ===========================================================================

  async saveCalculation(
    ctx: TenantContext,
    data: {
      employeeId: string;
      ruleId: string;
      periodStart: Date;
      periodEnd: Date;
      totalHoursWorked: number;
      regularHours: number;
      overtimeHours: number;
      rateMultiplier: number;
      overtimePayUnits: number;
      weekdayHours: number;
      weekendHours: number;
      bankHolidayHours: number;
    }
  ): Promise<OvertimeCalculationRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<OvertimeCalculationRow[]>`
        INSERT INTO app.overtime_calculations (
          id, tenant_id, employee_id, rule_id,
          period_start, period_end,
          total_hours_worked, regular_hours, overtime_hours,
          rate_multiplier, overtime_pay_units,
          weekday_hours, weekend_hours, bank_holiday_hours,
          calculated_by
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid, ${data.ruleId}::uuid,
          ${data.periodStart}, ${data.periodEnd},
          ${data.totalHoursWorked}, ${data.regularHours}, ${data.overtimeHours},
          ${data.rateMultiplier}, ${data.overtimePayUnits},
          ${data.weekdayHours}, ${data.weekendHours}, ${data.bankHolidayHours},
          ${ctx.userId || null}::uuid
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "overtime_calculation", id, "overtime.calculated", {
        calculationId: id,
        employeeId: data.employeeId,
        ruleId: data.ruleId,
        overtimeHours: data.overtimeHours,
        overtimePayUnits: data.overtimePayUnits,
        actor: ctx.userId,
      });

      return row as OvertimeCalculationRow;
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
