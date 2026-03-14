/**
 * Bank Holiday Module - Repository Layer
 *
 * Provides data access methods for the bank_holidays table.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Table: app.bank_holidays
 * Columns: id, tenant_id, name, date, country_code, region, created_at
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateBankHoliday,
  UpdateBankHoliday,
  BankHolidayFilters,
  BulkBankHolidayItem,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for bank_holidays
 *
 * Note: postgres.js transform converts snake_case DB columns to camelCase
 * properties automatically (e.g., tenant_id -> tenantId, country_code -> countryCode).
 */
export interface BankHolidayRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  date: Date;
  countryCode: string;
  region: string | null;
  createdAt: Date;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Bank Holiday Repository
// =============================================================================

export class BankHolidayRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Read Methods
  // ===========================================================================

  /**
   * Find bank holidays with filters and cursor-based pagination.
   *
   * Supports filtering by country_code, region, year, and name search.
   * Ordered by date ascending, then id for stable cursor pagination.
   */
  async findAll(
    context: TenantContext,
    filters: BankHolidayFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<BankHolidayRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<BankHolidayRow[]>`
        SELECT
          id, tenant_id, name, date, country_code, region, created_at
        FROM app.bank_holidays
        WHERE 1=1
          ${filters.country_code ? tx`AND country_code = ${filters.country_code}` : tx``}
          ${filters.region ? tx`AND region = ${filters.region}` : tx``}
          ${filters.year ? tx`AND EXTRACT(YEAR FROM date) = ${filters.year}` : tx``}
          ${filters.search ? tx`AND name ILIKE ${"%" + filters.search + "%"}` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY date ASC, id ASC
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a single bank holiday by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<BankHolidayRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<BankHolidayRow[]>`
        SELECT
          id, tenant_id, name, date, country_code, region, created_at
        FROM app.bank_holidays
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Check if a bank holiday already exists for the same tenant, date,
   * country_code, and region combination (the UNIQUE constraint key).
   *
   * The database constraint uses COALESCE(region, '') for NULL handling,
   * so we mirror that here for the lookup.
   */
  async findDuplicate(
    context: TenantContext,
    date: string,
    countryCode: string,
    region: string | null,
    excludeId?: string
  ): Promise<BankHolidayRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<BankHolidayRow[]>`
        SELECT
          id, tenant_id, name, date, country_code, region, created_at
        FROM app.bank_holidays
        WHERE date = ${date}::date
          AND country_code = ${countryCode}
          AND COALESCE(region, '') = COALESCE(${region}, '')
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
      `;
      return rows;
    });

    return result[0] || null;
  }

  // ===========================================================================
  // Write Methods (all accept a transaction handle)
  // ===========================================================================

  /**
   * Create a single bank holiday within a transaction
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateBankHoliday
  ): Promise<BankHolidayRow> {
    const rows = await tx<BankHolidayRow[]>`
      INSERT INTO app.bank_holidays (
        tenant_id, name, date, country_code, region
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.name},
        ${data.date}::date,
        ${data.country_code || "GB"},
        ${data.region || null}
      )
      RETURNING
        id, tenant_id, name, date, country_code, region, created_at
    `;

    return rows[0]!;
  }

  /**
   * Update a bank holiday within a transaction
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateBankHoliday
  ): Promise<BankHolidayRow | null> {
    // region requires special handling: undefined means "don't change",
    // null means "clear region" (apply to whole country).
    const regionProvided = "region" in data;

    const rows = await tx<BankHolidayRow[]>`
      UPDATE app.bank_holidays
      SET
        name = COALESCE(${data.name ?? null}, name),
        date = COALESCE(${data.date ?? null}::date, date),
        country_code = COALESCE(${data.country_code ?? null}, country_code)
        ${regionProvided ? tx`, region = ${data.region ?? null}` : tx``}
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, date, country_code, region, created_at
    `;

    return rows[0] || null;
  }

  /**
   * Delete a bank holiday (hard delete) within a transaction.
   *
   * Bank holidays are configuration data, not employee records, so
   * hard delete is appropriate here rather than soft delete.
   */
  async delete(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.bank_holidays
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  /**
   * Bulk insert bank holidays within a transaction.
   *
   * Uses ON CONFLICT DO NOTHING to skip duplicates (matching
   * the UNIQUE constraint on tenant_id + date + country_code + COALESCE(region, '')).
   *
   * Returns only the rows that were actually inserted.
   */
  async bulkCreate(
    tx: TransactionSql,
    context: TenantContext,
    items: BulkBankHolidayItem[]
  ): Promise<BankHolidayRow[]> {
    if (items.length === 0) return [];

    // Build values for batch insert
    const values = items.map((item) => ({
      tenant_id: context.tenantId,
      name: item.name,
      date: item.date,
      country_code: item.country_code || "GB",
      region: item.region || null,
    }));

    // Use a CTE to insert and return only successfully inserted rows.
    // ON CONFLICT DO NOTHING skips rows that violate the unique constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await tx<BankHolidayRow[]>`
      INSERT INTO app.bank_holidays ${(tx as any)(values)}
      ON CONFLICT (tenant_id, date, country_code, COALESCE(region, ''))
      DO NOTHING
      RETURNING
        id, tenant_id, name, date, country_code, region, created_at
    `;

    return rows as BankHolidayRow[];
  }
}
