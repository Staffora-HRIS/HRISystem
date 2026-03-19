/**
 * Policy Distribution Module - Repository Layer
 *
 * Database operations for policy distributions and acknowledgements.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { CreateDistribution, PaginationQuery } from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row shape for policy_distributions (after camelCase transform) */
export interface DistributionRow extends Row {
  id: string;
  tenantId: string;
  documentId: string;
  title: string;
  distributedAt: Date;
  distributedBy: string;
  targetDepartments: string[];
  targetAll: boolean;
  deadlineAt: Date | null;
  createdAt: Date;
}

/** Raw DB row shape for policy_acknowledgements (after camelCase transform) */
export interface AcknowledgementRow extends Row {
  id: string;
  tenantId: string;
  distributionId: string;
  employeeId: string;
  employeeName: string | null;
  acknowledgedAt: Date;
  ipAddress: string | null;
  createdAt: Date;
}

/** Raw DB row for pending policies query */
export interface PendingPolicyRow extends Row {
  distributionId: string;
  documentId: string;
  title: string;
  distributedAt: Date;
  deadlineAt: Date | null;
  isOverdue: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class PolicyDistributionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Distribution Operations
  // ===========================================================================

  async listDistributions(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<DistributionRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<DistributionRow[]>`
        SELECT
          id, tenant_id, document_id, title,
          distributed_at, distributed_by,
          target_departments, target_all,
          deadline_at, created_at
        FROM policy_distributions
        WHERE 1=1
          ${pagination.cursor ? tx`AND created_at < ${pagination.cursor}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getDistributionById(
    ctx: TenantContext,
    id: string
  ): Promise<DistributionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<DistributionRow[]>`
        SELECT
          id, tenant_id, document_id, title,
          distributed_at, distributed_by,
          target_departments, target_all,
          deadline_at, created_at
        FROM policy_distributions
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  async createDistribution(
    ctx: TenantContext,
    data: CreateDistribution & { distributedBy: string },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<DistributionRow> {
    const rows = await tx<DistributionRow[]>`
      INSERT INTO policy_distributions (
        tenant_id, document_id, title,
        distributed_by,
        target_departments, target_all,
        deadline_at
      ) VALUES (
        ${ctx.tenantId},
        ${data.document_id},
        ${data.title},
        ${data.distributedBy},
        ${JSON.stringify(data.target_departments ?? [])}::jsonb,
        ${data.target_all ?? false},
        ${data.deadline_at ?? null}::timestamptz
      )
      RETURNING
        id, tenant_id, document_id, title,
        distributed_at, distributed_by,
        target_departments, target_all,
        deadline_at, created_at
    `;
    return rows[0];
  }

  // ===========================================================================
  // Acknowledgement Operations
  // ===========================================================================

  async listAcknowledgements(
    ctx: TenantContext,
    distributionId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AcknowledgementRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AcknowledgementRow[]>`
        SELECT
          pa.id, pa.tenant_id, pa.distribution_id, pa.employee_id,
          COALESCE(
            e.first_name || ' ' || e.last_name,
            pa.employee_id::text
          ) AS employee_name,
          pa.acknowledged_at, pa.ip_address, pa.created_at
        FROM policy_acknowledgements pa
        LEFT JOIN employees e ON e.id = pa.employee_id AND e.tenant_id = pa.tenant_id
        WHERE pa.distribution_id = ${distributionId}
          ${pagination.cursor ? tx`AND pa.created_at < ${pagination.cursor}::timestamptz` : tx``}
        ORDER BY pa.created_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  async countAcknowledgements(
    ctx: TenantContext,
    distributionId: string
  ): Promise<number> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM policy_acknowledgements
        WHERE distribution_id = ${distributionId}
      `;
      return parseInt(rows[0]?.count ?? "0", 10);
    });
  }

  async createAcknowledgement(
    ctx: TenantContext,
    distributionId: string,
    employeeId: string,
    ipAddress: string | null,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<AcknowledgementRow | null> {
    try {
      const rows = await tx<AcknowledgementRow[]>`
        INSERT INTO policy_acknowledgements (
          tenant_id, distribution_id, employee_id, ip_address
        ) VALUES (
          ${ctx.tenantId},
          ${distributionId},
          ${employeeId},
          ${ipAddress}
        )
        ON CONFLICT (distribution_id, employee_id) DO NOTHING
        RETURNING
          id, tenant_id, distribution_id, employee_id,
          NULL::text AS employee_name,
          acknowledged_at, ip_address, created_at
      `;
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  async getAcknowledgement(
    ctx: TenantContext,
    distributionId: string,
    employeeId: string
  ): Promise<AcknowledgementRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AcknowledgementRow[]>`
        SELECT
          id, tenant_id, distribution_id, employee_id,
          NULL::text AS employee_name,
          acknowledged_at, ip_address, created_at
        FROM policy_acknowledgements
        WHERE distribution_id = ${distributionId}
          AND employee_id = ${employeeId}
      `;
    });
    return rows[0] ?? null;
  }

  // ===========================================================================
  // Pending Policies (Employee Self-Service)
  // ===========================================================================

  async getEmployeeIdForUser(
    ctx: TenantContext
  ): Promise<string | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        SELECT id FROM employees
        WHERE user_id = ${ctx.userId!}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        LIMIT 1
      `;
    });
    return rows[0]?.id ?? null;
  }

  async getPendingForEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<PendingPolicyRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<PendingPolicyRow[]>`
        SELECT
          pd.id AS distribution_id,
          pd.document_id,
          pd.title,
          pd.distributed_at,
          pd.deadline_at,
          CASE
            WHEN pd.deadline_at IS NOT NULL AND pd.deadline_at < now()
            THEN true
            ELSE false
          END AS is_overdue
        FROM policy_distributions pd
        WHERE pd.tenant_id = ${ctx.tenantId}::uuid
          AND (
            pd.target_all = true
            OR EXISTS (
              SELECT 1 FROM employees e
              LEFT JOIN org_units ou ON ou.id = e.department_id AND ou.tenant_id = e.tenant_id
              WHERE e.id = ${employeeId}::uuid
                AND e.tenant_id = ${ctx.tenantId}::uuid
                AND pd.target_departments @> to_jsonb(ARRAY[ou.id::text])
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM policy_acknowledgements pa
            WHERE pa.distribution_id = pd.id
              AND pa.employee_id = ${employeeId}::uuid
              AND pa.tenant_id = ${ctx.tenantId}::uuid
          )
        ORDER BY
          CASE WHEN pd.deadline_at IS NOT NULL AND pd.deadline_at < now() THEN 0 ELSE 1 END,
          pd.deadline_at ASC NULLS LAST,
          pd.distributed_at DESC
      `;
    });
  }
}
