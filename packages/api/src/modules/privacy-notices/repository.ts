/**
 * Privacy Notices Module - Repository Layer
 *
 * Provides data access methods for privacy notice entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePrivacyNotice,
  UpdatePrivacyNotice,
  PrivacyNoticeFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row types
 */
export interface PrivacyNoticeRow extends Row {
  id: string;
  tenantId: string;
  title: string;
  version: number;
  content: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AcknowledgementRow extends Row {
  id: string;
  tenantId: string;
  privacyNoticeId: string;
  employeeId: string;
  acknowledgedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutstandingRow extends Row {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  privacyNoticeId: string;
  privacyNoticeTitle: string;
  privacyNoticeVersion: number;
  effectiveFrom: Date;
}

export interface NoticeComplianceRow extends Row {
  noticeId: string;
  title: string;
  version: number;
  effectiveFrom: Date;
  acknowledgedCount: number;
  outstandingCount: number;
}

// =============================================================================
// Privacy Notices Repository
// =============================================================================

export class PrivacyNoticeRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Privacy Notices
  // ===========================================================================

  /**
   * Find privacy notices with filters and cursor pagination
   */
  async findNotices(
    ctx: TenantContext,
    filters: PrivacyNoticeFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<PrivacyNoticeRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      // Build dynamic WHERE conditions
      const conditions: string[] = [];

      if (filters.is_current !== undefined) {
        conditions.push(`is_current = ${filters.is_current}`);
      }

      if (filters.search) {
        // Search in title
        conditions.push(`title ILIKE '%' || ${filters.search} || '%'`);
      }

      if (pagination.cursor) {
        conditions.push(`id < ${pagination.cursor}`);
      }

      // Unfortunately we need to build query with conditions
      // Using tagged templates with optional conditions
      if (conditions.length === 0 && !pagination.cursor) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      // Filter with is_current only
      if (filters.is_current !== undefined && !filters.search && !pagination.cursor) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          WHERE is_current = ${filters.is_current}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.is_current !== undefined && !filters.search && pagination.cursor) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          WHERE is_current = ${filters.is_current}
            AND id < ${pagination.cursor}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.search && filters.is_current === undefined && !pagination.cursor) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          WHERE title ILIKE ${"%" + filters.search + "%"}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.search && filters.is_current !== undefined && !pagination.cursor) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          WHERE is_current = ${filters.is_current}
            AND title ILIKE ${"%" + filters.search + "%"}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      // Fallback: cursor with optional filters
      if (pagination.cursor && filters.is_current !== undefined && filters.search) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          WHERE is_current = ${filters.is_current}
            AND title ILIKE ${"%" + filters.search + "%"}
            AND id < ${pagination.cursor}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      if (pagination.cursor && filters.search) {
        return await tx<PrivacyNoticeRow[]>`
          SELECT id, tenant_id, title, version, content, effective_from, effective_to,
                 is_current, created_by, created_at, updated_at
          FROM privacy_notices
          WHERE title ILIKE ${"%" + filters.search + "%"}
            AND id < ${pagination.cursor}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      // Default fallback with cursor
      return await tx<PrivacyNoticeRow[]>`
        SELECT id, tenant_id, title, version, content, effective_from, effective_to,
               is_current, created_by, created_at, updated_at
        FROM privacy_notices
        WHERE id < ${pagination.cursor!}
        ORDER BY created_at DESC, id DESC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a privacy notice by ID
   */
  async findById(ctx: TenantContext, id: string): Promise<PrivacyNoticeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<PrivacyNoticeRow[]>`
        SELECT id, tenant_id, title, version, content, effective_from, effective_to,
               is_current, created_by, created_at, updated_at
        FROM privacy_notices
        WHERE id = ${id}
      `;
    });

    return rows[0] || null;
  }

  /**
   * Get the current highest version for a given title within the tenant
   */
  async getMaxVersion(tx: TransactionSql, title: string): Promise<number> {
    const rows = await tx<{ maxVersion: number }[]>`
      SELECT COALESCE(MAX(version), 0) as max_version
      FROM privacy_notices
      WHERE title = ${title}
    `;
    return rows[0]?.maxVersion || 0;
  }

  /**
   * Deactivate all current privacy notices (set is_current = false)
   */
  async deactivateCurrentNotices(tx: TransactionSql): Promise<void> {
    await tx`
      UPDATE privacy_notices
      SET is_current = false
      WHERE is_current = true
    `;
  }

  /**
   * Create a privacy notice
   */
  async create(
    tx: TransactionSql,
    ctx: TenantContext,
    data: CreatePrivacyNotice,
    version: number
  ): Promise<PrivacyNoticeRow> {
    const rows = await tx<PrivacyNoticeRow[]>`
      INSERT INTO privacy_notices (
        id, tenant_id, title, version, content,
        effective_from, effective_to, is_current, created_by,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${data.title},
        ${version},
        ${data.content},
        ${data.effective_from}::date,
        ${data.effective_to || null}::date,
        true,
        ${ctx.userId || null}::uuid,
        now(),
        now()
      )
      RETURNING id, tenant_id, title, version, content, effective_from, effective_to,
                is_current, created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update a privacy notice
   */
  async update(
    tx: TransactionSql,
    id: string,
    data: UpdatePrivacyNotice
  ): Promise<PrivacyNoticeRow | null> {
    const rows = await tx<PrivacyNoticeRow[]>`
      UPDATE privacy_notices
      SET title = COALESCE(${data.title ?? null}, title),
          content = COALESCE(${data.content ?? null}, content),
          effective_from = COALESCE(${data.effective_from ?? null}::date, effective_from),
          effective_to = CASE
            WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date
            ELSE effective_to
          END,
          is_current = COALESCE(${data.is_current ?? null}, is_current)
      WHERE id = ${id}
      RETURNING id, tenant_id, title, version, content, effective_from, effective_to,
                is_current, created_by, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Acknowledgements
  // ===========================================================================

  /**
   * Check if an employee has already acknowledged a specific notice
   */
  async findAcknowledgement(
    ctx: TenantContext,
    noticeId: string,
    employeeId: string
  ): Promise<AcknowledgementRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<AcknowledgementRow[]>`
        SELECT id, tenant_id, privacy_notice_id, employee_id,
               acknowledged_at, ip_address, user_agent, created_at, updated_at
        FROM privacy_notice_acknowledgements
        WHERE privacy_notice_id = ${noticeId}
          AND employee_id = ${employeeId}
      `;
    });

    return rows[0] || null;
  }

  /**
   * Create an acknowledgement
   */
  async createAcknowledgement(
    tx: TransactionSql,
    ctx: TenantContext,
    noticeId: string,
    employeeId: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AcknowledgementRow> {
    const rows = await tx<AcknowledgementRow[]>`
      INSERT INTO privacy_notice_acknowledgements (
        id, tenant_id, privacy_notice_id, employee_id,
        acknowledged_at, ip_address, user_agent,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${noticeId}::uuid,
        ${employeeId}::uuid,
        now(),
        ${ipAddress},
        ${userAgent},
        now(),
        now()
      )
      RETURNING id, tenant_id, privacy_notice_id, employee_id,
                acknowledged_at, ip_address, user_agent, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Get outstanding acknowledgements - employees who have NOT acknowledged
   * the current privacy notice(s)
   */
  async findOutstanding(ctx: TenantContext): Promise<OutstandingRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<OutstandingRow[]>`
        SELECT
          e.id AS employee_id,
          e.employee_number,
          e.first_name,
          e.last_name,
          e.work_email AS email,
          pn.id AS privacy_notice_id,
          pn.title AS privacy_notice_title,
          pn.version AS privacy_notice_version,
          pn.effective_from
        FROM employees e
        CROSS JOIN privacy_notices pn
        LEFT JOIN privacy_notice_acknowledgements pna
          ON pna.privacy_notice_id = pn.id
          AND pna.employee_id = e.id
        WHERE pn.is_current = true
          AND e.status = 'active'
          AND pna.id IS NULL
        ORDER BY e.last_name, e.first_name, pn.title
      `;
    });
  }

  /**
   * Get compliance summary per notice
   */
  async getComplianceStats(ctx: TenantContext): Promise<{
    notices: NoticeComplianceRow[];
    totalActiveEmployees: number;
  }> {
    return await this.db.withTransaction(ctx, async (tx) => {
      // Count active employees
      const empRows = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM employees
        WHERE status = 'active'
      `;
      const totalActiveEmployees = empRows[0]?.count || 0;

      // Get per-notice compliance stats
      const notices = await tx<NoticeComplianceRow[]>`
        SELECT
          pn.id AS notice_id,
          pn.title,
          pn.version,
          pn.effective_from,
          COUNT(pna.id)::int AS acknowledged_count,
          (${totalActiveEmployees} - COUNT(pna.id))::int AS outstanding_count
        FROM privacy_notices pn
        LEFT JOIN privacy_notice_acknowledgements pna
          ON pna.privacy_notice_id = pn.id
          AND pna.employee_id IN (
            SELECT id FROM employees WHERE status = 'active'
          )
        WHERE pn.is_current = true
        GROUP BY pn.id, pn.title, pn.version, pn.effective_from
        ORDER BY pn.effective_from DESC
      `;

      return { notices, totalActiveEmployees };
    });
  }

  /**
   * Get acknowledgements for a specific notice with cursor pagination
   */
  async findAcknowledgements(
    ctx: TenantContext,
    noticeId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AcknowledgementRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx<AcknowledgementRow[]>`
          SELECT id, tenant_id, privacy_notice_id, employee_id,
                 acknowledged_at, ip_address, user_agent, created_at, updated_at
          FROM privacy_notice_acknowledgements
          WHERE privacy_notice_id = ${noticeId}
            AND id < ${pagination.cursor}
          ORDER BY acknowledged_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx<AcknowledgementRow[]>`
        SELECT id, tenant_id, privacy_notice_id, employee_id,
               acknowledged_at, ip_address, user_agent, created_at, updated_at
        FROM privacy_notice_acknowledgements
        WHERE privacy_notice_id = ${noticeId}
        ORDER BY acknowledged_at DESC, id DESC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }
}
