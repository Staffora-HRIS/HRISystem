/**
 * Integrations Module - Repository Layer
 *
 * Database operations for third-party integrations.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  IntegrationFilters,
  PaginationQuery,
  ConnectIntegration,
  UpdateIntegrationConfig,
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

/** Raw DB row shape for integrations (after camelCase transform) */
export interface IntegrationRow extends Row {
  id: string;
  tenantId: string;
  provider: string;
  name: string;
  description: string | null;
  category: string;
  status: "connected" | "disconnected" | "error";
  lastSyncAt: Date | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  webhookUrl: string | null;
  enabled: boolean;
  connectedAt: Date | null;
  connectedBy: string | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class IntegrationsRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List integrations for the current tenant with cursor-based pagination
   */
  async listIntegrations(
    ctx: TenantContext,
    filters: IntegrationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<IntegrationRow>> {
    const limit = Math.min(Math.max(pagination.limit ? Number(pagination.limit) : 50, 1), 100);
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<IntegrationRow[]>`
        SELECT
          id, tenant_id, provider, name, description, category,
          status, last_sync_at, error_message,
          config, webhook_url, enabled,
          connected_at, connected_by, disconnected_at,
          created_at, created_by, updated_at
        FROM integrations
        WHERE 1=1
          ${filters.category ? tx`AND category = ${filters.category}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR description ILIKE ${"%" + filters.search + "%"} OR provider ILIKE ${"%" + filters.search + "%"})` : tx``}
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
   * Get a single integration by ID
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<IntegrationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<IntegrationRow[]>`
        SELECT
          id, tenant_id, provider, name, description, category,
          status, last_sync_at, error_message,
          config, webhook_url, enabled,
          connected_at, connected_by, disconnected_at,
          created_at, created_by, updated_at
        FROM integrations
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Get a single integration by provider key
   */
  async getByProvider(
    ctx: TenantContext,
    provider: string
  ): Promise<IntegrationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<IntegrationRow[]>`
        SELECT
          id, tenant_id, provider, name, description, category,
          status, last_sync_at, error_message,
          config, webhook_url, enabled,
          connected_at, connected_by, disconnected_at,
          created_at, created_by, updated_at
        FROM integrations
        WHERE provider = ${provider}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Connect (create or update) an integration
   */
  async connect(
    ctx: TenantContext,
    data: ConnectIntegration,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<IntegrationRow> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<IntegrationRow[]>`
        INSERT INTO integrations (
          tenant_id, provider, name, description, category,
          status, config, webhook_url,
          connected_at, connected_by, created_by
        )
        VALUES (
          ${ctx.tenantId},
          ${data.provider},
          ${data.name},
          ${data.description ?? null},
          ${data.category},
          'connected',
          ${JSON.stringify(data.config ?? {})}::jsonb,
          ${data.webhook_url ?? null},
          now(),
          ${ctx.userId ?? null},
          ${ctx.userId ?? null}
        )
        ON CONFLICT (tenant_id, provider)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          status = 'connected',
          config = EXCLUDED.config,
          webhook_url = EXCLUDED.webhook_url,
          error_message = NULL,
          connected_at = now(),
          connected_by = EXCLUDED.connected_by,
          disconnected_at = NULL,
          updated_at = now()
        RETURNING
          id, tenant_id, provider, name, description, category,
          status, last_sync_at, error_message,
          config, webhook_url, enabled,
          connected_at, connected_by, disconnected_at,
          created_at, created_by, updated_at
      `;
      return rows[0];
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Update integration configuration
   */
  async updateConfig(
    ctx: TenantContext,
    id: string,
    data: UpdateIntegrationConfig,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<IntegrationRow | null> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<IntegrationRow[]>`
        UPDATE integrations
        SET
          ${data.config !== undefined ? sql`config = ${JSON.stringify(data.config)}::jsonb,` : sql``}
          ${data.webhook_url !== undefined ? sql`webhook_url = ${data.webhook_url},` : sql``}
          updated_at = now()
        WHERE id = ${id}
        RETURNING
          id, tenant_id, provider, name, description, category,
          status, last_sync_at, error_message,
          config, webhook_url, enabled,
          connected_at, connected_by, disconnected_at,
          created_at, created_by, updated_at
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Disconnect an integration (set status to disconnected)
   */
  async disconnect(
    ctx: TenantContext,
    id: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<IntegrationRow | null> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<IntegrationRow[]>`
        UPDATE integrations
        SET
          status = 'disconnected',
          config = '{}'::jsonb,
          disconnected_at = now(),
          error_message = NULL,
          updated_at = now()
        WHERE id = ${id}
          AND status != 'disconnected'
        RETURNING
          id, tenant_id, provider, name, description, category,
          status, last_sync_at, error_message,
          config, webhook_url, enabled,
          connected_at, connected_by, disconnected_at,
          created_at, created_by, updated_at
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Delete an integration record permanently
   */
  async deleteIntegration(
    ctx: TenantContext,
    id: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql`
        DELETE FROM integrations
        WHERE id = ${id}
      `;
      return rows.count > 0;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }
}
