/**
 * Announcements Module - Repository Layer
 *
 * Database operations for announcements.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  AnnouncementFilters,
  PaginationQuery,
  CreateAnnouncement,
  UpdateAnnouncement,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row shape for announcements (after camelCase transform) */
export interface AnnouncementRow extends Row {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  priority: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  authorId: string;
  authorName?: string | null;
  targetDepartments: string[];
  targetRoles: string[];
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class AnnouncementsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Admin Operations
  // ===========================================================================

  /**
   * List all announcements (admin) with cursor-based pagination
   */
  async listAnnouncements(
    ctx: TenantContext,
    filters: AnnouncementFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AnnouncementRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AnnouncementRow[]>`
        SELECT
          a.id, a.tenant_id, a.title, a.content, a.priority,
          a.published_at, a.expires_at, a.author_id,
          a.target_departments, a.target_roles,
          a.created_at, a.updated_at,
          u.name AS author_name
        FROM announcements a
        LEFT JOIN "user" u ON u.id = a.author_id::text
        WHERE 1=1
          ${filters.priority ? tx`AND a.priority = ${filters.priority}` : tx``}
          ${filters.search ? tx`AND (a.title ILIKE ${"%" + filters.search + "%"} OR a.content ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${filters.published === true ? tx`AND a.published_at IS NOT NULL AND a.published_at <= now()` : tx``}
          ${filters.published === false ? tx`AND (a.published_at IS NULL OR a.published_at > now())` : tx``}
          ${pagination.cursor ? tx`AND a.created_at < ${pagination.cursor}::timestamptz` : tx``}
        ORDER BY a.created_at DESC
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
   * Get a single announcement by ID
   */
  async getAnnouncementById(
    ctx: TenantContext,
    id: string
  ): Promise<AnnouncementRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AnnouncementRow[]>`
        SELECT
          a.id, a.tenant_id, a.title, a.content, a.priority,
          a.published_at, a.expires_at, a.author_id,
          a.target_departments, a.target_roles,
          a.created_at, a.updated_at,
          u.name AS author_name
        FROM announcements a
        LEFT JOIN "user" u ON u.id = a.author_id::text
        WHERE a.id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create a new announcement
   */
  async createAnnouncement(
    ctx: TenantContext,
    data: CreateAnnouncement & { authorId: string },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<AnnouncementRow> {
    const rows = await tx<AnnouncementRow[]>`
      INSERT INTO announcements (
        tenant_id, title, content, priority,
        published_at, expires_at, author_id,
        target_departments, target_roles
      ) VALUES (
        ${ctx.tenantId},
        ${data.title},
        ${data.content},
        ${data.priority ?? "info"},
        ${data.published_at ? new Date(data.published_at) : null},
        ${data.expires_at ? new Date(data.expires_at) : null},
        ${data.authorId},
        ${JSON.stringify(data.target_departments ?? [])}::jsonb,
        ${JSON.stringify(data.target_roles ?? [])}::jsonb
      )
      RETURNING
        id, tenant_id, title, content, priority,
        published_at, expires_at, author_id,
        target_departments, target_roles,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Update an existing announcement
   */
  async updateAnnouncement(
    ctx: TenantContext,
    id: string,
    data: UpdateAnnouncement,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<AnnouncementRow | null> {
    const rows = await tx<AnnouncementRow[]>`
      UPDATE announcements
      SET
        title = COALESCE(${data.title ?? null}, title),
        content = COALESCE(${data.content ?? null}, content),
        priority = COALESCE(${data.priority ?? null}, priority),
        published_at = ${data.published_at !== undefined ? (data.published_at ? new Date(data.published_at) : null) : tx`published_at`},
        expires_at = ${data.expires_at !== undefined ? (data.expires_at ? new Date(data.expires_at) : null) : tx`expires_at`},
        target_departments = ${data.target_departments !== undefined ? tx`${JSON.stringify(data.target_departments)}::jsonb` : tx`target_departments`},
        target_roles = ${data.target_roles !== undefined ? tx`${JSON.stringify(data.target_roles)}::jsonb` : tx`target_roles`},
        updated_at = now()
      WHERE id = ${id}
      RETURNING
        id, tenant_id, title, content, priority,
        published_at, expires_at, author_id,
        target_departments, target_roles,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Delete an announcement
   */
  async deleteAnnouncement(
    ctx: TenantContext,
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const rows = await tx`
      DELETE FROM announcements
      WHERE id = ${id}
    `;
    return rows.count > 0;
  }

  // ===========================================================================
  // Employee-Facing Operations
  // ===========================================================================

  /**
   * List active announcements visible to an employee.
   * Filters: published, not expired, matching department/role or no targeting.
   */
  async listActiveAnnouncements(
    ctx: TenantContext,
    options: {
      departmentId?: string;
      roleNames?: string[];
      limit?: number;
      cursor?: string;
    }
  ): Promise<PaginatedResult<AnnouncementRow>> {
    const limit = options.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AnnouncementRow[]>`
        SELECT
          a.id, a.tenant_id, a.title, a.content, a.priority,
          a.published_at, a.expires_at, a.author_id,
          a.target_departments, a.target_roles,
          a.created_at, a.updated_at,
          u.name AS author_name
        FROM announcements a
        LEFT JOIN "user" u ON u.id = a.author_id::text
        WHERE a.published_at IS NOT NULL
          AND a.published_at <= now()
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND (
            -- No targeting = visible to everyone
            (a.target_departments = '[]'::jsonb AND a.target_roles = '[]'::jsonb)
            -- Department targeting
            ${options.departmentId ? tx`OR a.target_departments @> ${JSON.stringify([options.departmentId])}::jsonb` : tx`OR FALSE`}
            -- Role targeting
            ${options.roleNames && options.roleNames.length > 0
              ? tx`OR a.target_roles ?| ${options.roleNames}`
              : tx`OR FALSE`}
          )
          ${options.cursor ? tx`AND a.published_at < ${options.cursor}::timestamptz` : tx``}
        ORDER BY
          CASE a.priority
            WHEN 'urgent' THEN 0
            WHEN 'important' THEN 1
            WHEN 'info' THEN 2
          END,
          a.published_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].publishedAt?.toISOString() ?? null
          : null;

      return { items, nextCursor, hasMore };
    });
  }
}
