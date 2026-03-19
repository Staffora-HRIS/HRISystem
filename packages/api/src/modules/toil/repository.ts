/**
 * Time Off In Lieu (TOIL) Repository
 *
 * Data access layer for TOIL balances and transactions.
 * All operations are tenant-scoped via RLS context set by db.withTransaction.
 *
 * Tables:
 *   app.toil_balances      - Per-employee running balance (one row per employee)
 *   app.toil_transactions  - Immutable ledger of all TOIL operations
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Row types (camelCase - postgres.js auto-transforms from snake_case)
// =============================================================================

export interface ToilBalanceRow {
  id: string;
  tenantId: string;
  employeeId: string;
  accruedHours: number;
  usedHours: number;
  expiredHours: number;
  balanceHours: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToilTransactionRow {
  id: string;
  tenantId: string;
  employeeId: string;
  type: string;
  hours: number;
  referenceId: string | null;
  notes: string | null;
  createdBy: string | null;
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
  // Balance - get or create
  // ---------------------------------------------------------------------------

  async getBalance(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ToilBalanceRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilBalanceRow[]>`
        SELECT *
        FROM app.toil_balances
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND employee_id = ${employeeId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ToilBalanceRow) : null;
  }

  async getOrCreateBalance(
    ctx: TenantContext,
    employeeId: string,
    tx: TransactionSql
  ): Promise<ToilBalanceRow> {
    const [row] = await tx<ToilBalanceRow[]>`
      INSERT INTO app.toil_balances (tenant_id, employee_id)
      VALUES (${ctx.tenantId}::uuid, ${employeeId}::uuid)
      ON CONFLICT (tenant_id, employee_id) DO UPDATE
        SET updated_at = app.toil_balances.updated_at
      RETURNING *
    `;
    return row as ToilBalanceRow;
  }

  // ---------------------------------------------------------------------------
  // Accrue TOIL
  // ---------------------------------------------------------------------------

  async accrue(
    ctx: TenantContext,
    data: {
      employeeId: string;
      hours: number;
      referenceId: string | null;
      notes: string | null;
      createdBy: string | null;
    }
  ): Promise<{ transaction: ToilTransactionRow; balance: ToilBalanceRow }> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.getOrCreateBalance(ctx, data.employeeId, tx);

      const txnId = crypto.randomUUID();
      const [transaction] = await tx<ToilTransactionRow[]>`
        INSERT INTO app.toil_transactions (
          id, tenant_id, employee_id, type, hours, reference_id, notes, created_by
        ) VALUES (
          ${txnId}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          'accrual'::app.toil_transaction_type, ${data.hours},
          ${data.referenceId}::uuid, ${data.notes}, ${data.createdBy}::uuid
        )
        RETURNING *
      `;

      const [balance] = await tx<ToilBalanceRow[]>`
        UPDATE app.toil_balances SET
          accrued_hours = accrued_hours + ${data.hours},
          updated_at = now()
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND employee_id = ${data.employeeId}::uuid
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "toil_balance", balance.id, "toil.accrued", {
        transactionId: txnId, employeeId: data.employeeId, hours: data.hours,
        referenceId: data.referenceId, actor: ctx.userId,
      });

      return { transaction: transaction as ToilTransactionRow, balance: balance as ToilBalanceRow };
    });
  }

  // ---------------------------------------------------------------------------
  // Use TOIL
  // ---------------------------------------------------------------------------

  async use(
    ctx: TenantContext,
    data: {
      employeeId: string;
      hours: number;
      referenceId: string | null;
      notes: string | null;
      createdBy: string | null;
    }
  ): Promise<{ transaction: ToilTransactionRow; balance: ToilBalanceRow }> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const txnId = crypto.randomUUID();
      const [transaction] = await tx<ToilTransactionRow[]>`
        INSERT INTO app.toil_transactions (
          id, tenant_id, employee_id, type, hours, reference_id, notes, created_by
        ) VALUES (
          ${txnId}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          'usage'::app.toil_transaction_type, ${data.hours},
          ${data.referenceId}::uuid, ${data.notes}, ${data.createdBy}::uuid
        )
        RETURNING *
      `;

      const [balance] = await tx<ToilBalanceRow[]>`
        UPDATE app.toil_balances SET
          used_hours = used_hours + ${data.hours},
          updated_at = now()
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND employee_id = ${data.employeeId}::uuid
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "toil_balance", balance.id, "toil.used", {
        transactionId: txnId, employeeId: data.employeeId, hours: data.hours,
        referenceId: data.referenceId, actor: ctx.userId,
      });

      return { transaction: transaction as ToilTransactionRow, balance: balance as ToilBalanceRow };
    });
  }

  // ---------------------------------------------------------------------------
  // Adjust TOIL (manual HR correction)
  // ---------------------------------------------------------------------------

  async adjust(
    ctx: TenantContext,
    data: {
      employeeId: string;
      hours: number;
      notes: string;
      createdBy: string | null;
    }
  ): Promise<{ transaction: ToilTransactionRow; balance: ToilBalanceRow }> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.getOrCreateBalance(ctx, data.employeeId, tx);

      const txnId = crypto.randomUUID();
      const absHours = Math.abs(data.hours);
      const [transaction] = await tx<ToilTransactionRow[]>`
        INSERT INTO app.toil_transactions (
          id, tenant_id, employee_id, type, hours, notes, created_by
        ) VALUES (
          ${txnId}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          'adjustment'::app.toil_transaction_type, ${absHours},
          ${data.notes}, ${data.createdBy}::uuid
        )
        RETURNING *
      `;

      let balance: ToilBalanceRow;
      if (data.hours >= 0) {
        const [row] = await tx<ToilBalanceRow[]>`
          UPDATE app.toil_balances SET
            accrued_hours = accrued_hours + ${data.hours},
            updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${data.employeeId}::uuid
          RETURNING *
        `;
        balance = row as ToilBalanceRow;
      } else {
        const [row] = await tx<ToilBalanceRow[]>`
          UPDATE app.toil_balances SET
            used_hours = used_hours + ${absHours},
            updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${data.employeeId}::uuid
          RETURNING *
        `;
        balance = row as ToilBalanceRow;
      }

      await this.writeOutbox(tx, ctx.tenantId, "toil_balance", balance.id, "toil.adjusted", {
        transactionId: txnId, employeeId: data.employeeId, hours: data.hours,
        notes: data.notes, actor: ctx.userId,
      });

      return { transaction: transaction as ToilTransactionRow, balance: balance as ToilBalanceRow };
    });
  }

  // ---------------------------------------------------------------------------
  // Transactions list (cursor-paginated)
  // ---------------------------------------------------------------------------

  async getTransactions(
    ctx: TenantContext,
    employeeId: string,
    filters: { type?: string; cursor?: string; limit?: number }
  ): Promise<PaginatedResult<ToilTransactionRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ToilTransactionRow[]>`
        SELECT *
        FROM app.toil_transactions
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND employee_id = ${employeeId}::uuid
          ${filters.type ? tx`AND type = ${filters.type}::app.toil_transaction_type` : tx``}
          ${filters.cursor ? tx`AND created_at < (SELECT created_at FROM app.toil_transactions WHERE id = ${filters.cursor}::uuid)` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as ToilTransactionRow[], cursor, hasMore };
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
