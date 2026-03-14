/**
 * Approval Delegation Repository
 *
 * Data access layer for the approval_delegations and delegation_log tables.
 * All queries use postgres.js tagged templates and respect RLS via withTransaction.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Row Types (match migration column names after camelCase transform)
// =============================================================================

export interface DelegationRow {
  id: string;
  tenantId: string;
  delegatorId: string;
  delegateId: string;
  startDate: Date | string;
  endDate: Date | string;
  scope: string;
  scopeFilters: Record<string, unknown>;
  notifyDelegator: boolean;
  includePending: boolean;
  delegationReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface DelegationListRow {
  delegationId: string;
  delegateName: string;
  scope: string;
  startDate: Date | string;
  endDate: Date | string;
  isActive: boolean;
  usageCount: number | string;
}

export interface ActiveDelegationRow {
  delegationId: string;
  delegateId: string;
  delegateName: string;
  scope: string;
  endDate: Date | string;
}

export interface DelegationLogRow {
  id: string;
  tenantId: string;
  delegationId: string;
  workflowInstanceId: string | null;
  approvalType: string;
  approvalId: string;
  action: string;
  notes: string | null;
  performedBy: string;
  performedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class DelegationRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new approval delegation.
   */
  async create(
    ctx: TenantContext,
    data: {
      delegatorId: string;
      delegateId: string;
      startDate: string;
      endDate: string;
      scope: string;
      scopeFilters?: Record<string, unknown>;
      notifyDelegator?: boolean;
      includePending?: boolean;
      delegationReason?: string;
      createdBy?: string;
    }
  ): Promise<DelegationRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<DelegationRow[]>`
        INSERT INTO app.approval_delegations (
          id, tenant_id, delegator_id, delegate_id,
          start_date, end_date, scope, scope_filters,
          notify_delegator, include_pending, delegation_reason,
          is_active, created_by
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid,
          ${data.delegatorId}::uuid, ${data.delegateId}::uuid,
          ${data.startDate}::date, ${data.endDate}::date,
          ${data.scope || "all"}, ${JSON.stringify(data.scopeFilters || {})}::jsonb,
          ${data.notifyDelegator ?? true}, ${data.includePending ?? false},
          ${data.delegationReason || null},
          true, ${data.createdBy || null}::uuid
        )
        RETURNING id, tenant_id, delegator_id, delegate_id,
                  start_date, end_date, scope, scope_filters,
                  notify_delegator, include_pending, delegation_reason,
                  is_active, created_at, updated_at, created_by
      `;

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "approval_delegation",
        id,
        "delegation.created",
        {
          delegationId: id,
          delegatorId: data.delegatorId,
          delegateId: data.delegateId,
          scope: data.scope || "all",
          startDate: data.startDate,
          endDate: data.endDate,
          actor: ctx.userId,
        }
      );

      return row as DelegationRow;
    });
  }

  /**
   * Get a single delegation by ID.
   */
  async getById(ctx: TenantContext, id: string): Promise<DelegationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<DelegationRow[]>`
        SELECT id, tenant_id, delegator_id, delegate_id,
               start_date, end_date, scope, scope_filters,
               notify_delegator, include_pending, delegation_reason,
               is_active, created_at, updated_at, created_by
        FROM app.approval_delegations
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as DelegationRow) : null;
  }

  /**
   * List delegations created by the current user (using the DB function).
   */
  async listMyDelegations(ctx: TenantContext, userId: string): Promise<DelegationListRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<DelegationListRow[]>`
        SELECT
          ad.id AS delegation_id,
          u.name AS delegate_name,
          ad.scope,
          ad.start_date,
          ad.end_date,
          ad.is_active AND ad.end_date >= CURRENT_DATE AS is_active,
          COUNT(dl.id)::int AS usage_count
        FROM app.approval_delegations ad
        INNER JOIN app.users u ON ad.delegate_id = u.id
        LEFT JOIN app.delegation_log dl ON dl.delegation_id = ad.id
        WHERE ad.delegator_id = ${userId}::uuid
          AND ad.tenant_id = ${ctx.tenantId}::uuid
        GROUP BY ad.id, u.name
        ORDER BY ad.start_date DESC
      `;
      return rows as DelegationListRow[];
    });
  }

  /**
   * Get the active delegation for a given delegator, optionally filtered by scope.
   */
  async getActiveDelegation(
    ctx: TenantContext,
    delegatorId: string,
    scope?: string
  ): Promise<ActiveDelegationRow | null> {
    const effectiveScope = scope || "all";
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ActiveDelegationRow[]>`
        SELECT
          ad.id AS delegation_id,
          ad.delegate_id,
          u.name AS delegate_name,
          ad.scope,
          ad.end_date
        FROM app.approval_delegations ad
        INNER JOIN app.users u ON ad.delegate_id = u.id
        WHERE ad.delegator_id = ${delegatorId}::uuid
          AND ad.tenant_id = ${ctx.tenantId}::uuid
          AND ad.is_active = true
          AND ad.start_date <= CURRENT_DATE
          AND ad.end_date >= CURRENT_DATE
          AND (ad.scope = 'all' OR ad.scope = ${effectiveScope})
        ORDER BY
          CASE WHEN ad.scope = ${effectiveScope} THEN 0 ELSE 1 END,
          ad.created_at DESC
        LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as ActiveDelegationRow) : null;
  }

  /**
   * Check if a circular delegation would be created.
   * A -> B exists, and now B -> A is attempted (directly or transitively).
   */
  async wouldCreateCircularDelegation(
    ctx: TenantContext,
    delegatorId: string,
    delegateId: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM app.approval_delegations
          WHERE delegator_id = ${delegateId}::uuid
            AND delegate_id = ${delegatorId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND is_active = true
            AND start_date <= CURRENT_DATE
            AND end_date >= CURRENT_DATE
        ) AS exists
      `;
    });
    return rows[0]?.exists === true;
  }

  /**
   * Check for an existing overlapping active delegation for the same delegator and scope.
   */
  async hasOverlappingDelegation(
    ctx: TenantContext,
    delegatorId: string,
    scope: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM app.approval_delegations
          WHERE delegator_id = ${delegatorId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND is_active = true
            AND (scope = ${scope} OR scope = 'all' OR ${scope} = 'all')
            AND start_date <= ${endDate}::date
            AND end_date >= ${startDate}::date
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
        ) AS exists
      `;
    });
    return rows[0]?.exists === true;
  }

  /**
   * Revoke (deactivate) a delegation.
   */
  async revoke(ctx: TenantContext, id: string, userId: string): Promise<DelegationRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<DelegationRow[]>`
        UPDATE app.approval_delegations
        SET is_active = false, updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND is_active = true
          AND delegator_id = ${userId}::uuid
        RETURNING id, tenant_id, delegator_id, delegate_id,
                  start_date, end_date, scope, scope_filters,
                  notify_delegator, include_pending, delegation_reason,
                  is_active, created_at, updated_at, created_by
      `;

      if (row) {
        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "approval_delegation",
          id,
          "delegation.revoked",
          {
            delegationId: id,
            delegatorId: row.delegatorId,
            delegateId: row.delegateId,
            actor: userId,
          }
        );
      }

      return (row as DelegationRow) || null;
    });
  }

  /**
   * Get log entries for a specific delegation.
   */
  async getLogEntries(ctx: TenantContext, delegationId: string): Promise<DelegationLogRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<DelegationLogRow[]>`
        SELECT id, tenant_id, delegation_id, workflow_instance_id,
               approval_type, approval_id, action, notes,
               performed_by, performed_at
        FROM app.delegation_log
        WHERE delegation_id = ${delegationId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        ORDER BY performed_at DESC
      `;
      return rows as DelegationLogRow[];
    });
  }

  /**
   * Write a delegation log entry.
   */
  async writeLogEntry(
    ctx: TenantContext,
    data: {
      delegationId: string;
      approvalType: string;
      approvalId: string;
      action: string;
      performedBy: string;
      notes?: string;
      workflowInstanceId?: string;
    }
  ): Promise<DelegationLogRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<DelegationLogRow[]>`
        INSERT INTO app.delegation_log (
          id, tenant_id, delegation_id, workflow_instance_id,
          approval_type, approval_id, action, notes, performed_by
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid,
          ${data.delegationId}::uuid, ${data.workflowInstanceId || null}::uuid,
          ${data.approvalType}, ${data.approvalId}::uuid,
          ${data.action}, ${data.notes || null}, ${data.performedBy}::uuid
        )
        RETURNING id, tenant_id, delegation_id, workflow_instance_id,
                  approval_type, approval_id, action, notes,
                  performed_by, performed_at
      `;
      return row as DelegationLogRow;
    });
  }

  /**
   * Auto-expire delegations whose end_date has passed.
   * Returns the count of delegations deactivated.
   */
  async autoExpirePastDelegations(ctx: TenantContext): Promise<number> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const result = await tx`
        UPDATE app.approval_delegations
        SET is_active = false, updated_at = now()
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND is_active = true
          AND end_date < CURRENT_DATE
      `;
      return result.count;
    });
  }

  // =============================================================================
  // Outbox Helper
  // =============================================================================

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
