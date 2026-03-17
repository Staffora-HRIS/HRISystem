/**
 * SSO Module - Repository Layer
 *
 * Database operations for SSO configuration management.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Client secrets are encrypted in the database using pgp_sym_encrypt.
 * The encryption key is set via the SSO_ENCRYPTION_KEY environment variable.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { SsoConfigFilters, PaginationQuery, UpdateSsoConfig } from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row for sso_configurations */
export interface SsoConfigRow extends Row {
  id: string;
  tenantId: string;
  providerType: string;
  providerName: string;
  clientId: string | null;
  clientSecretEncrypted: Buffer | null;
  issuerUrl: string | null;
  metadataUrl: string | null;
  certificate: string | null;
  attributeMapping: Record<string, string>;
  enabled: boolean;
  autoProvision: boolean;
  allowedDomains: string[];
  defaultRoleId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Raw DB row for sso_login_attempts */
export interface SsoLoginAttemptRow extends Row {
  id: string;
  tenantId: string;
  ssoConfigId: string;
  idpSubject: string;
  email: string | null;
  userId: string | null;
  status: string;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class SsoConfigRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Get the encryption key for SSO client secrets.
   * Falls back to BETTER_AUTH_SECRET if SSO_ENCRYPTION_KEY is not set.
   */
  private getEncryptionKey(): string {
    const key = process.env["SSO_ENCRYPTION_KEY"] || process.env["BETTER_AUTH_SECRET"] || process.env["SESSION_SECRET"];
    if (!key) {
      throw new Error(
        "SSO_ENCRYPTION_KEY (or BETTER_AUTH_SECRET / SESSION_SECRET) must be set to encrypt/decrypt SSO client secrets"
      );
    }
    return key;
  }

  /**
   * List SSO configurations with cursor-based pagination.
   */
  async listConfigs(
    ctx: TenantContext,
    filters: SsoConfigFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<SsoConfigRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<SsoConfigRow[]>`
        SELECT
          id, tenant_id, provider_type, provider_name,
          client_id, client_secret_encrypted,
          issuer_url, metadata_url, certificate,
          attribute_mapping, enabled, auto_provision,
          allowed_domains, default_role_id,
          created_at, updated_at, created_by, updated_by
        FROM sso_configurations
        WHERE 1=1
          ${filters.provider_type ? tx`AND provider_type = ${filters.provider_type}` : tx``}
          ${filters.enabled !== undefined ? tx`AND enabled = ${filters.enabled}` : tx``}
          ${filters.search ? tx`AND provider_name ILIKE ${"%" + filters.search + "%"}` : tx``}
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
   * Get a single SSO configuration by ID (within tenant RLS context)
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<SsoConfigRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<SsoConfigRow[]>`
        SELECT
          id, tenant_id, provider_type, provider_name,
          client_id, client_secret_encrypted,
          issuer_url, metadata_url, certificate,
          attribute_mapping, enabled, auto_provision,
          allowed_domains, default_role_id,
          created_at, updated_at, created_by, updated_by
        FROM sso_configurations
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Find an enabled SSO configuration by tenant slug and config ID.
   * Uses system context because this is called before authentication
   * (the SSO login initiation endpoint is public).
   */
  async findEnabledByTenantSlugAndConfigId(
    tenantSlug: string,
    configId: string
  ): Promise<(SsoConfigRow & { tenantIdResolved: string }) | null> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<(SsoConfigRow & { tenantIdResolved: string })[]>`
        SELECT
          sc.id, sc.tenant_id, sc.provider_type, sc.provider_name,
          sc.client_id, sc.client_secret_encrypted,
          sc.issuer_url, sc.metadata_url, sc.certificate,
          sc.attribute_mapping, sc.enabled, sc.auto_provision,
          sc.allowed_domains, sc.default_role_id,
          sc.created_at, sc.updated_at, sc.created_by, sc.updated_by,
          t.id::text AS tenant_id_resolved
        FROM sso_configurations sc
        JOIN tenants t ON t.id = sc.tenant_id
        WHERE t.slug = ${tenantSlug}
          AND sc.id = ${configId}
          AND sc.enabled = true
          AND t.status = 'active'
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Find all enabled SSO configurations for a tenant by slug.
   * Used for the public discovery endpoint.
   */
  async findEnabledByTenantSlug(
    tenantSlug: string
  ): Promise<Array<{ id: string; providerType: string; providerName: string; tenantId: string }>> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<Array<{ id: string; providerType: string; providerName: string; tenantId: string }>>`
        SELECT
          sc.id, sc.provider_type, sc.provider_name, sc.tenant_id::text
        FROM sso_configurations sc
        JOIN tenants t ON t.id = sc.tenant_id
        WHERE t.slug = ${tenantSlug}
          AND sc.enabled = true
          AND t.status = 'active'
        ORDER BY sc.provider_name ASC
      `;
    });
    return rows;
  }

  /**
   * Create an SSO configuration within an existing transaction.
   * Encrypts the client secret if provided.
   */
  async create(
    ctx: TenantContext,
    data: {
      providerType: string;
      providerName: string;
      clientId: string | null;
      clientSecret: string | null;
      issuerUrl: string | null;
      metadataUrl: string | null;
      certificate: string | null;
      attributeMapping: Record<string, string>;
      enabled: boolean;
      autoProvision: boolean;
      allowedDomains: string[];
      defaultRoleId: string | null;
      createdBy: string | null;
    },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<SsoConfigRow> {
    const encKey = this.getEncryptionKey();

    const rows = await tx<SsoConfigRow[]>`
      INSERT INTO sso_configurations (
        tenant_id, provider_type, provider_name,
        client_id, client_secret_encrypted,
        issuer_url, metadata_url, certificate,
        attribute_mapping, enabled, auto_provision,
        allowed_domains, default_role_id,
        created_by, updated_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.providerType},
        ${data.providerName},
        ${data.clientId},
        ${data.clientSecret ? tx`app.encrypt_sso_secret(${data.clientSecret}, ${encKey})` : null},
        ${data.issuerUrl},
        ${data.metadataUrl},
        ${data.certificate},
        ${JSON.stringify(data.attributeMapping)}::jsonb,
        ${data.enabled},
        ${data.autoProvision},
        ${JSON.stringify(data.allowedDomains)}::jsonb,
        ${data.defaultRoleId}::uuid,
        ${data.createdBy}::uuid,
        ${data.createdBy}::uuid
      )
      RETURNING
        id, tenant_id, provider_type, provider_name,
        client_id, client_secret_encrypted,
        issuer_url, metadata_url, certificate,
        attribute_mapping, enabled, auto_provision,
        allowed_domains, default_role_id,
        created_at, updated_at, created_by, updated_by
    `;
    return rows[0];
  }

  /**
   * Update an SSO configuration within an existing transaction.
   * Handles encryption of client_secret if provided.
   */
  async update(
    ctx: TenantContext,
    id: string,
    data: UpdateSsoConfig,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<SsoConfigRow | null> {
    const encKey = this.getEncryptionKey();
    const updates: ReturnType<typeof tx>[] = [];

    if (data.provider_name !== undefined) updates.push(tx`provider_name = ${data.provider_name}`);
    if (data.client_id !== undefined) {
      updates.push(
        data.client_id === null
          ? tx`client_id = NULL`
          : tx`client_id = ${data.client_id}`
      );
    }
    if (data.client_secret !== undefined) {
      updates.push(
        data.client_secret === null
          ? tx`client_secret_encrypted = NULL`
          : tx`client_secret_encrypted = app.encrypt_sso_secret(${data.client_secret}, ${encKey})`
      );
    }
    if (data.issuer_url !== undefined) {
      updates.push(
        data.issuer_url === null
          ? tx`issuer_url = NULL`
          : tx`issuer_url = ${data.issuer_url}`
      );
    }
    if (data.metadata_url !== undefined) {
      updates.push(
        data.metadata_url === null
          ? tx`metadata_url = NULL`
          : tx`metadata_url = ${data.metadata_url}`
      );
    }
    if (data.certificate !== undefined) {
      updates.push(
        data.certificate === null
          ? tx`certificate = NULL`
          : tx`certificate = ${data.certificate}`
      );
    }
    if (data.attribute_mapping !== undefined) {
      updates.push(tx`attribute_mapping = ${JSON.stringify(data.attribute_mapping)}::jsonb`);
    }
    if (data.enabled !== undefined) updates.push(tx`enabled = ${data.enabled}`);
    if (data.auto_provision !== undefined) updates.push(tx`auto_provision = ${data.auto_provision}`);
    if (data.allowed_domains !== undefined) {
      updates.push(tx`allowed_domains = ${JSON.stringify(data.allowed_domains)}::jsonb`);
    }
    if (data.default_role_id !== undefined) {
      updates.push(
        data.default_role_id === null
          ? tx`default_role_id = NULL`
          : tx`default_role_id = ${data.default_role_id}::uuid`
      );
    }

    // Always update updated_by and updated_at
    if (ctx.userId) {
      updates.push(tx`updated_by = ${ctx.userId}::uuid`);
    }
    updates.push(tx`updated_at = now()`);

    if (updates.length === 0) {
      return this.getById(ctx, id);
    }

    let setFragment = updates[0];
    for (let i = 1; i < updates.length; i++) {
      setFragment = tx`${setFragment}, ${updates[i]}`;
    }

    const rows = await tx<SsoConfigRow[]>`
      UPDATE sso_configurations
      SET ${setFragment}
      WHERE id = ${id}
      RETURNING
        id, tenant_id, provider_type, provider_name,
        client_id, client_secret_encrypted,
        issuer_url, metadata_url, certificate,
        attribute_mapping, enabled, auto_provision,
        allowed_domains, default_role_id,
        created_at, updated_at, created_by, updated_by
    `;
    return rows[0] ?? null;
  }

  /**
   * Delete an SSO configuration within an existing transaction.
   */
  async delete(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM sso_configurations
      WHERE id = ${id}
    `;
    return result.count > 0;
  }

  /**
   * Decrypt the client secret for a given SSO configuration.
   * Must be called within a system or tenant context.
   */
  async decryptClientSecret(
    configId: string
  ): Promise<string | null> {
    const encKey = this.getEncryptionKey();

    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<Array<{ decrypted: string | null }>>`
        SELECT app.decrypt_sso_secret(client_secret_encrypted, ${encKey}) as decrypted
        FROM sso_configurations
        WHERE id = ${configId}
          AND client_secret_encrypted IS NOT NULL
      `;
    });

    return rows[0]?.decrypted ?? null;
  }

  /**
   * Record an SSO login attempt for audit purposes.
   */
  async recordLoginAttempt(
    tenantId: string,
    data: {
      ssoConfigId: string;
      idpSubject: string;
      email: string | null;
      userId: string | null;
      status: string;
      errorMessage: string | null;
      ipAddress: string | null;
      userAgent: string | null;
    }
  ): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      // Must set tenant context for the RLS insert policy
      await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      await tx`
        INSERT INTO sso_login_attempts (
          tenant_id, sso_config_id, idp_subject, email,
          user_id, status, error_message,
          ip_address, user_agent
        ) VALUES (
          ${tenantId}::uuid,
          ${data.ssoConfigId}::uuid,
          ${data.idpSubject},
          ${data.email},
          ${data.userId}::uuid,
          ${data.status},
          ${data.errorMessage},
          ${data.ipAddress}::inet,
          ${data.userAgent}
        )
      `;
    });
  }

  /**
   * List SSO login attempts for a configuration (audit endpoint).
   */
  async listLoginAttempts(
    ctx: TenantContext,
    configId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<SsoLoginAttemptRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<SsoLoginAttemptRow[]>`
        SELECT
          id, tenant_id, sso_config_id, idp_subject, email,
          user_id, status, error_message, ip_address, user_agent,
          created_at
        FROM sso_login_attempts
        WHERE sso_config_id = ${configId}
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
}
