/**
 * API Keys Module - Repository Layer
 *
 * Database operations for API key management.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 * Uses parameterized queries throughout — no tx.unsafe().
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { ApiKeyFilters, PaginationQuery, UpdateApiKey } from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row for api_keys */
export interface ApiKeyRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class ApiKeyRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List API keys with cursor-based pagination.
   * By default excludes revoked keys unless include_revoked is true.
   */
  async listApiKeys(
    ctx: TenantContext,
    filters: ApiKeyFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ApiKeyRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ApiKeyRow[]>`
        SELECT
          id, tenant_id, name, key_hash, key_prefix,
          scopes, expires_at, last_used_at, revoked_at,
          created_by, created_at, updated_at
        FROM api_keys
        WHERE 1=1
          ${!filters.include_revoked ? tx`AND revoked_at IS NULL` : tx``}
          ${filters.search ? tx`AND name ILIKE ${"%" + filters.search + "%"}` : tx``}
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
   * Get a single API key by ID (within tenant RLS context)
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<ApiKeyRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ApiKeyRow[]>`
        SELECT
          id, tenant_id, name, key_hash, key_prefix,
          scopes, expires_at, last_used_at, revoked_at,
          created_by, created_at, updated_at
        FROM api_keys
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Find an active (non-revoked, non-expired) API key by its SHA-256 hash.
   * This is called during authentication, so it uses system context to
   * bypass RLS (the caller does not yet have a tenant context).
   */
  async findByKeyHash(
    keyHash: string
  ): Promise<ApiKeyRow | null> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<ApiKeyRow[]>`
        SELECT
          id, tenant_id, name, key_hash, key_prefix,
          scopes, expires_at, last_used_at, revoked_at,
          created_by, created_at, updated_at
        FROM api_keys
        WHERE key_hash = ${keyHash}
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Update last_used_at timestamp for a key (fire-and-forget during auth).
   * Uses system context since this runs before tenant context is set.
   */
  async touchLastUsed(keyId: string): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        UPDATE api_keys
        SET last_used_at = now()
        WHERE id = ${keyId}
      `;
    });
  }

  /**
   * Create an API key within an existing transaction
   */
  async create(
    ctx: TenantContext,
    data: {
      name: string;
      keyHash: string;
      keyPrefix: string;
      scopes: string[];
      expiresAt: string | null;
      createdBy: string;
    },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ApiKeyRow> {
    const rows = await tx<ApiKeyRow[]>`
      INSERT INTO api_keys (
        tenant_id, name, key_hash, key_prefix,
        scopes, expires_at, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.keyHash},
        ${data.keyPrefix},
        ${JSON.stringify(data.scopes)}::jsonb,
        ${data.expiresAt ? data.expiresAt : null}::timestamptz,
        ${data.createdBy}::uuid
      )
      RETURNING
        id, tenant_id, name, key_hash, key_prefix,
        scopes, expires_at, last_used_at, revoked_at,
        created_by, created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Update an API key's name, scopes, or expiry within an existing transaction.
   * Builds SET clause using parameterized fragments.
   */
  async update(
    ctx: TenantContext,
    id: string,
    data: UpdateApiKey,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ApiKeyRow | null> {
    const updates: ReturnType<typeof tx>[] = [];

    if (data.name !== undefined) updates.push(tx`name = ${data.name}`);
    if (data.scopes !== undefined) updates.push(tx`scopes = ${JSON.stringify(data.scopes)}::jsonb`);
    if (data.expires_at !== undefined) {
      updates.push(
        data.expires_at === null
          ? tx`expires_at = NULL`
          : tx`expires_at = ${data.expires_at}::timestamptz`
      );
    }

    if (updates.length === 0) {
      return this.getById(ctx, id);
    }

    let setFragment = updates[0];
    for (let i = 1; i < updates.length; i++) {
      setFragment = tx`${setFragment}, ${updates[i]}`;
    }

    const rows = await tx<ApiKeyRow[]>`
      UPDATE api_keys
      SET ${setFragment}
      WHERE id = ${id}
        AND revoked_at IS NULL
      RETURNING
        id, tenant_id, name, key_hash, key_prefix,
        scopes, expires_at, last_used_at, revoked_at,
        created_by, created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Revoke an API key by setting revoked_at within an existing transaction
   */
  async revoke(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const result = await tx`
      UPDATE api_keys
      SET revoked_at = now()
      WHERE id = ${id}
        AND revoked_at IS NULL
    `;
    return result.count > 0;
  }
}
