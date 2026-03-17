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
  createdAt: Date;
}

/** Raw DB row shape for policy_acknowledgements (after camelCase transform) */
export interface AcknowledgementRow extends Row {
  id: string;
  tenantId: string;
  distributionId: string;
  employeeId: string;
  acknowledgedAt: Date;
  ipAddress: string | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class PolicyDistributionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Distribution Operations
  // ===========================================================================

  /**
   * List all distributions with cursor-based pagination
   */
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
          created_at
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

  /**
   * Get a single distribution by ID
   */
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
          created_at
        FROM policy_distributions
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create a new distribution record
   */
  async createDistribution(
    ctx: TenantContext,
    data: CreateDistribution & { distributedBy: string },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<DistributionRow> {
    const rows = await tx<DistributionRow[]>`
      INSERT INTO policy_distributions (
        tenant_id, document_id, title,
        distributed_by,
        target_departments, target_all
      ) VALUES (
        ${ctx.tenantId},
        ${data.document_id},
        ${data.title},
        ${data.distributedBy},
        ${JSON.stringify(data.target_departments ?? [])}::jsonb,
        ${data.target_all ?? false}
      )
      RETURNING
        id, tenant_id, document_id, title,
        distributed_at, distributed_by,
        target_departments, target_all,
        created_at
    `;
    return rows[0];
  }

  // ===========================================================================
  // Acknowledgement Operations
  // ===========================================================================

  /**
   * List acknowledgements for a specific distribution with cursor-based pagination
   */
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
          id, tenant_id, distribution_id, employee_id,
          acknowledged_at, ip_address, created_at
        FROM policy_acknowledgements
        WHERE distribution_id = ${distributionId}
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

  /**
   * Count total acknowledgements for a distribution
   */
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

  /**
   * Create an acknowledgement (read receipt) for a distribution
   * Returns null if the employee has already acknowledged (unique constraint violation)
   */
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
          acknowledged_at, ip_address, created_at
      `;
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get an existing acknowledgement for an employee + distribution
   */
  async getAcknowledgement(
    ctx: TenantContext,
    distributionId: string,
    employeeId: string
  ): Promise<AcknowledgementRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AcknowledgementRow[]>`
        SELECT
          id, tenant_id, distribution_id, employee_id,
          acknowledged_at, ip_address, created_at
        FROM policy_acknowledgements
        WHERE distribution_id = ${distributionId}
          AND employee_id = ${employeeId}
      `;
    });
    return rows[0] ?? null;
  }
}
