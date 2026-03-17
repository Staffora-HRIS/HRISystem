/**
 * Data Archival Module - Repository Layer
 *
 * Provides data access methods for the data archival system.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  ArchivalSourceCategory,
  ArchivalStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface ArchivedRecordRow extends Row {
  id: string;
  tenantId: string;
  sourceTable: string;
  sourceId: string;
  sourceCategory: ArchivalSourceCategory;
  archivedData: unknown;
  archivedAt: Date;
  archivedBy: string | null;
  retentionUntil: Date | null;
  restoreReason: string | null;
  restoredAt: Date | null;
  restoredBy: string | null;
  status: ArchivalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArchivalRuleRow extends Row {
  id: string;
  tenantId: string;
  sourceCategory: ArchivalSourceCategory;
  sourceTable: string;
  statusColumn: string | null;
  statusValue: string | null;
  dateColumn: string;
  retentionYears: number;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CategoryStats extends Row {
  sourceCategory: string;
  archivedCount: number;
  restoredCount: number;
}

// =============================================================================
// Repository
// =============================================================================

export class DataArchivalRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Escape a SQL identifier (table or column name) to prevent SQL injection.
   * Wraps the identifier in double quotes after stripping any existing quotes.
   * Only alphanumeric characters, underscores, and dots are allowed.
   */
  private escapeIdentifier(name: string): string {
    // Validate: only allow alphanumeric, underscores, and dots (for schema.table)
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) {
      throw new Error(`Invalid SQL identifier: ${name}`);
    }
    // Split on dots to handle schema.table notation
    return name
      .split(".")
      .map((part) => `"${part}"`)
      .join(".");
  }

  // ===========================================================================
  // Archived Records
  // ===========================================================================

  /**
   * Create an archived record
   */
  async createArchivedRecord(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      sourceTable: string;
      sourceId: string;
      sourceCategory: ArchivalSourceCategory;
      archivedData: unknown;
      archivedBy: string | null;
      retentionUntil: Date | null;
    }
  ): Promise<ArchivedRecordRow> {
    const [row] = await tx<ArchivedRecordRow[]>`
      INSERT INTO archived_records (
        id, tenant_id, source_table, source_id, source_category,
        archived_data, archived_by, retention_until
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.sourceTable},
        ${data.sourceId}::uuid,
        ${data.sourceCategory}::app.archival_source_category,
        ${JSON.stringify(data.archivedData)}::jsonb,
        ${data.archivedBy}::uuid,
        ${data.retentionUntil}
      )
      RETURNING *
    `;
    return row;
  }

  /**
   * Get an archived record by ID
   */
  async getArchivedRecordById(
    ctx: TenantContext,
    recordId: string
  ): Promise<ArchivedRecordRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ArchivedRecordRow[]>`
        SELECT *
        FROM archived_records
        WHERE id = ${recordId}::uuid
      `;
    });
    return rows[0] || null;
  }

  /**
   * Check if a record is already archived (still in archived status)
   */
  async isRecordArchived(
    tx: TransactionSql,
    sourceTable: string,
    sourceId: string
  ): Promise<boolean> {
    const [row] = await tx<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM archived_records
        WHERE source_table = ${sourceTable}
          AND source_id = ${sourceId}::uuid
          AND status = 'archived'
      ) as exists
    `;
    return row?.exists === true;
  }

  /**
   * List archived records with filtering and cursor-based pagination
   */
  async listArchivedRecords(
    ctx: TenantContext,
    filters: {
      sourceTable?: string;
      sourceCategory?: ArchivalSourceCategory;
      status?: ArchivalStatus;
    },
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ArchivedRecordRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return await this.db.withTransaction(ctx, async (tx) => {
      // Build WHERE conditions dynamically using postgres.js tagged template composition
      // Each filter is conditionally applied via nested ternaries
      const rows = await tx<ArchivedRecordRow[]>`
        SELECT *
        FROM archived_records
        WHERE 1=1
          ${filters.sourceTable ? tx`AND source_table = ${filters.sourceTable}` : tx``}
          ${filters.sourceCategory ? tx`AND source_category = ${filters.sourceCategory}::app.archival_source_category` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}::app.archival_status` : tx``}
          ${cursor ? tx`AND archived_at < (SELECT archived_at FROM archived_records WHERE id = ${cursor}::uuid)` : tx``}
        ORDER BY archived_at DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Mark an archived record as restored
   */
  async restoreArchivedRecord(
    tx: TransactionSql,
    recordId: string,
    restoredBy: string,
    reason: string
  ): Promise<ArchivedRecordRow | null> {
    const [row] = await tx<ArchivedRecordRow[]>`
      UPDATE archived_records
      SET status = 'restored'::app.archival_status,
          restored_at = now(),
          restored_by = ${restoredBy}::uuid,
          restore_reason = ${reason}
      WHERE id = ${recordId}::uuid
        AND status = 'archived'
      RETURNING *
    `;
    return row || null;
  }

  /**
   * Fetch source record data for archival.
   * Reads the full row from the source table as JSONB.
   *
   * Uses tx.unsafe() because the table name is dynamic.
   * The source_table is validated against the archival_rules whitelist
   * before reaching this method, preventing SQL injection.
   */
  async fetchSourceRecord(
    tx: TransactionSql,
    sourceTable: string,
    sourceId: string
  ): Promise<unknown | null> {
    try {
      const rows = await tx.unsafe<{ data: unknown }[]>(
        `SELECT row_to_json(t.*) as data FROM ${this.escapeIdentifier(sourceTable)} t WHERE t.id = $1::uuid LIMIT 1`,
        [sourceId]
      );
      return rows[0]?.data || null;
    } catch {
      return null;
    }
  }

  /**
   * Delete the source record after archival.
   * Returns true if a row was deleted.
   */
  async deleteSourceRecord(
    tx: TransactionSql,
    sourceTable: string,
    sourceId: string
  ): Promise<boolean> {
    try {
      const result = await tx.unsafe(
        `DELETE FROM ${this.escapeIdentifier(sourceTable)} WHERE id = $1::uuid`,
        [sourceId]
      );
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Re-insert archived data back into the source table.
   * Used during restore operations.
   */
  async reinsertSourceRecord(
    tx: TransactionSql,
    sourceTable: string,
    archivedData: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const ident = this.escapeIdentifier(sourceTable);
      await tx.unsafe(
        `INSERT INTO ${ident} SELECT * FROM jsonb_populate_record(null::${ident}, $1::jsonb)`,
        [JSON.stringify(archivedData)]
      );
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Archival Rules
  // ===========================================================================

  /**
   * Create an archival rule
   */
  async createRule(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      sourceCategory: ArchivalSourceCategory;
      sourceTable: string;
      statusColumn: string | null;
      statusValue: string | null;
      dateColumn: string;
      retentionYears: number;
      enabled: boolean;
      description: string | null;
    }
  ): Promise<ArchivalRuleRow> {
    const [row] = await tx<ArchivalRuleRow[]>`
      INSERT INTO archival_rules (
        id, tenant_id, source_category, source_table,
        status_column, status_value, date_column,
        retention_years, enabled, description
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.sourceCategory}::app.archival_source_category,
        ${data.sourceTable},
        ${data.statusColumn},
        ${data.statusValue},
        ${data.dateColumn},
        ${data.retentionYears},
        ${data.enabled},
        ${data.description}
      )
      RETURNING *
    `;
    return row;
  }

  /**
   * Check if an archival rule exists for a category
   */
  async ruleExistsForCategory(
    tx: TransactionSql,
    sourceCategory: ArchivalSourceCategory
  ): Promise<boolean> {
    const [row] = await tx<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM archival_rules
        WHERE source_category = ${sourceCategory}::app.archival_source_category
          AND enabled = true
      ) as exists
    `;
    return row?.exists === true;
  }

  /**
   * List all archival rules
   */
  async listRules(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ArchivalRuleRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return await this.db.withTransaction(ctx, async (tx) => {
      let rows: ArchivalRuleRow[];

      if (cursor) {
        rows = await tx<ArchivalRuleRow[]>`
          SELECT *
          FROM archival_rules
          WHERE created_at < (
            SELECT created_at FROM archival_rules WHERE id = ${cursor}::uuid
          )
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      } else {
        rows = await tx<ArchivalRuleRow[]>`
          SELECT *
          FROM archival_rules
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      }

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get enabled archival rules, optionally filtered by category
   */
  async getEnabledRules(
    tx: TransactionSql,
    sourceCategory?: ArchivalSourceCategory
  ): Promise<ArchivalRuleRow[]> {
    if (sourceCategory) {
      return await tx<ArchivalRuleRow[]>`
        SELECT *
        FROM archival_rules
        WHERE enabled = true
          AND source_category = ${sourceCategory}::app.archival_source_category
        ORDER BY source_category ASC
      `;
    }

    return await tx<ArchivalRuleRow[]>`
      SELECT *
      FROM archival_rules
      WHERE enabled = true
      ORDER BY source_category ASC
    `;
  }

  /**
   * Find records eligible for archival based on a rule.
   * Returns source IDs of records that meet the archival criteria.
   *
   * The source table name is validated against the archival_rules whitelist
   * before reaching this method.
   */
  async findEligibleRecords(
    tx: TransactionSql,
    rule: ArchivalRuleRow,
    cutoffDate: Date,
    batchLimit: number = 500
  ): Promise<Array<{ id: string }>> {
    try {
      const table = this.escapeIdentifier(rule.sourceTable);
      const dateCol = this.escapeIdentifier(rule.dateColumn);

      if (rule.statusColumn && rule.statusValue) {
        const statusCol = this.escapeIdentifier(rule.statusColumn);
        // Records must have the specified status AND be older than cutoff
        return await tx.unsafe<Array<{ id: string }>>(
          `SELECT t.id::text as id
           FROM ${table} t
           LEFT JOIN archived_records ar
             ON ar.source_table = $1
             AND ar.source_id = t.id
             AND ar.status = 'archived'
           WHERE ar.id IS NULL
             AND t.${statusCol} = $2
             AND t.${dateCol} < $3
           LIMIT $4`,
          [rule.sourceTable, rule.statusValue, cutoffDate, batchLimit]
        );
      }

      // No status filter - just age-based
      return await tx.unsafe<Array<{ id: string }>>(
        `SELECT t.id::text as id
         FROM ${table} t
         LEFT JOIN archived_records ar
           ON ar.source_table = $1
           AND ar.source_id = t.id
           AND ar.status = 'archived'
         WHERE ar.id IS NULL
           AND t.${dateCol} < $2
         LIMIT $3`,
        [rule.sourceTable, cutoffDate, batchLimit]
      );
    } catch {
      // Table or column may not exist
      return [];
    }
  }

  // ===========================================================================
  // Dashboard / Statistics
  // ===========================================================================

  /**
   * Get archival statistics
   */
  async getStats(
    ctx: TenantContext
  ): Promise<{
    totalArchived: number;
    totalRestored: number;
  }> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const [stats] = await tx<
        { totalArchived: number; totalRestored: number }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE status = 'archived')::int AS total_archived,
          COUNT(*) FILTER (WHERE status = 'restored')::int AS total_restored
        FROM archived_records
      `;

      return {
        totalArchived: stats?.totalArchived ?? 0,
        totalRestored: stats?.totalRestored ?? 0,
      };
    });
  }

  /**
   * Get per-category breakdown
   */
  async getCategoryStats(ctx: TenantContext): Promise<CategoryStats[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<CategoryStats[]>`
        SELECT
          source_category,
          COUNT(*) FILTER (WHERE status = 'archived')::int AS archived_count,
          COUNT(*) FILTER (WHERE status = 'restored')::int AS restored_count
        FROM archived_records
        GROUP BY source_category
        ORDER BY source_category ASC
      `;
    });
  }

  /**
   * Get recent archival activity (last 10 runs/batches)
   */
  async getRecentArchivalActivity(
    ctx: TenantContext
  ): Promise<
    Array<{
      sourceCategory: string;
      recordsArchived: number;
      archivedAt: Date;
    }>
  > {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<
        Array<{
          sourceCategory: string;
          recordsArchived: number;
          archivedAt: Date;
        }>
      >`
        SELECT
          source_category,
          COUNT(*)::int AS records_archived,
          date_trunc('hour', archived_at) AS archived_at
        FROM archived_records
        WHERE status = 'archived'
        GROUP BY source_category, date_trunc('hour', archived_at)
        ORDER BY date_trunc('hour', archived_at) DESC
        LIMIT 10
      `;
    });
  }
}
