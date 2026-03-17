/**
 * TOIL (Time Off In Lieu) Repository
 *
 * Data access layer for TOIL balances and transactions.
 * All operations are tenant-scoped via RLS context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Row types (camelCase — postgres.js auto-transforms from snake_case)
// =============================================================================

export interface ToilBalanceRow {
  id: string;
  tenantId: string;
  employeeId: string;
  accruedHours: number;
  usedHours: number;
  balanceHours: number;
  periodStart: Date;
  periodEnd: Date;
  expiryDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToilTransactionRow {
  id: string;
  tenantId: string;
  employeeId: string;
  balanceId: string;
  type: string;
  hours: number;
  reason: string | null;
  authorizedBy: string | null;
  date: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ToilRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async createBalance(
    ctx: TenantContext,
    data: {
      employeeId: string;
      periodStart: string;
      periodEnd: string;
      expiryDays?: number;
    }
  ): Promise<ToilBalanceRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<ToilBalanceRow[]>`
        INSERT INTO app.toil_balances (
          id, tenant_id, employee_id, period_start, period_end, expiry_days
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.periodStart}, ${data.periodEnd}, ${data.expiryDays ?? 90}
        )
        RETURNING *
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "toil_balance",
        id,
        "toil.balance.created",
        { balanceId: id, employeeId: data.employeeId, actor: ctx.userId }
      );

      return row as ToilBalanceRow;
    });
  }

  async getBalanceById(ctx: TenantContext, id: string): Promise<ToilBalanceRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilBalanceRow[]>`
        SELECT *
        FROM app.toil_balances
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ToilBalanceRow) : null;
  }

  async getBalances(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      activeOnly?: boolean;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<ToilBalanceRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilBalanceRow[]>`
        SELECT *
        FROM app.toil_balances
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.activeOnly ? tx`AND period_end >= CURRENT_DATE` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY period_start DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as ToilBalanceRow[], cursor, hasMore };
  }

  async getEmployeeBalance(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ToilBalanceRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilBalanceRow[]>`
        SELECT *
        FROM app.toil_balances
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND employee_id = ${employeeId}::uuid
          AND period_start <= CURRENT_DATE
          AND period_end >= CURRENT_DATE
        ORDER BY period_start DESC
        LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as ToilBalanceRow) : null;
  }

  // ---------------------------------------------------------------------------
  // Accrual (manager adds TOIL hours for overtime worked)
  // ---------------------------------------------------------------------------

  async createAccrual(
    ctx: TenantContext,
    data: {
      employeeId: string;
      balanceId: string;
      hours: number;
      reason: string;
      date: string;
      authorizedBy: string;
      expiresAt: string | null;
    }
  ): Promise<{ transaction: ToilTransactionRow; balance: ToilBalanceRow }> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const txnId = crypto.randomUUID();

      // Insert the transaction
      const [transaction] = await tx<ToilTransactionRow[]>`
        INSERT INTO app.toil_transactions (
          id, tenant_id, employee_id, balance_id, type, hours, reason,
          authorized_by, date, expires_at
        ) VALUES (
          ${txnId}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.balanceId}::uuid, 'accrual', ${data.hours}, ${data.reason},
          ${data.authorizedBy}::uuid, ${data.date}, ${data.expiresAt}
        )
        RETURNING *
      `;

      // Update the balance
      const [balance] = await tx<ToilBalanceRow[]>`
        UPDATE app.toil_balances SET
          accrued_hours = accrued_hours + ${data.hours},
          updated_at = now()
        WHERE id = ${data.balanceId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "toil_balance",
        data.balanceId,
        "toil.accrual.created",
        {
          transactionId: txnId,
          balanceId: data.balanceId,
          employeeId: data.employeeId,
          hours: data.hours,
          actor: ctx.userId,
        }
      );

      return {
        transaction: transaction as ToilTransactionRow,
        balance: balance as ToilBalanceRow,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Usage (employee uses TOIL hours)
  // ---------------------------------------------------------------------------

  async createUsage(
    ctx: TenantContext,
    data: {
      employeeId: string;
      balanceId: string;
      hours: number;
      reason: string | null;
      date: string;
      authorizedBy: string | null;
    }
  ): Promise<{ transaction: ToilTransactionRow; balance: ToilBalanceRow }> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const txnId = crypto.randomUUID();

      // Insert the transaction
      const [transaction] = await tx<ToilTransactionRow[]>`
        INSERT INTO app.toil_transactions (
          id, tenant_id, employee_id, balance_id, type, hours, reason,
          authorized_by, date
        ) VALUES (
          ${txnId}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.balanceId}::uuid, 'usage', ${data.hours}, ${data.reason},
          ${data.authorizedBy ? tx`${data.authorizedBy}::uuid` : null}, ${data.date}
        )
        RETURNING *
      `;

      // Update the balance
      const [balance] = await tx<ToilBalanceRow[]>`
        UPDATE app.toil_balances SET
          used_hours = used_hours + ${data.hours},
          updated_at = now()
        WHERE id = ${data.balanceId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "toil_balance",
        data.balanceId,
        "toil.usage.created",
        {
          transactionId: txnId,
          balanceId: data.balanceId,
          employeeId: data.employeeId,
          hours: data.hours,
          actor: ctx.userId,
        }
      );

      return {
        transaction: transaction as ToilTransactionRow,
        balance: balance as ToilBalanceRow,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async getTransactions(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      balanceId?: string;
      type?: string;
      from?: Date;
      to?: Date;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<ToilTransactionRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilTransactionRow[]>`
        SELECT *
        FROM app.toil_transactions
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.balanceId ? tx`AND balance_id = ${filters.balanceId}::uuid` : tx``}
        ${filters.type ? tx`AND type = ${filters.type}` : tx``}
        ${filters.from ? tx`AND date >= ${filters.from}` : tx``}
        ${filters.to ? tx`AND date <= ${filters.to}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY date DESC, created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as ToilTransactionRow[], cursor, hasMore };
  }

  async getTransactionById(
    ctx: TenantContext,
    id: string
  ): Promise<ToilTransactionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilTransactionRow[]>`
        SELECT *
        FROM app.toil_transactions
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ToilTransactionRow) : null;
  }

  // ---------------------------------------------------------------------------
  // Expiry query — get expired, unconsumed accrual hours
  // ---------------------------------------------------------------------------

  async getExpiredAccruals(
    ctx: TenantContext,
    balanceId: string
  ): Promise<{ totalExpiredHours: number }> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<{ totalExpiredHours: number }[]>`
        SELECT COALESCE(SUM(hours), 0) as total_expired_hours
        FROM app.toil_transactions
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND balance_id = ${balanceId}::uuid
          AND type = 'accrual'
          AND expires_at IS NOT NULL
          AND expires_at < CURRENT_DATE
      `;
    });
    return rows[0] as { totalExpiredHours: number };
  }

  // ---------------------------------------------------------------------------
  // Outbox helper
  // ---------------------------------------------------------------------------

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
