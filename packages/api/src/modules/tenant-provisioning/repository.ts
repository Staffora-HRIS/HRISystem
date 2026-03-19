/**
 * Tenant Provisioning Module - Repository Layer
 *
 * Database operations for tenant provisioning.
 * Uses system context for most operations since provisioning
 * creates tenants (cannot rely on RLS during creation).
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ProvisioningLogResponse,
  ProvisioningStepResponse,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// DB Row Shapes
// =============================================================================

interface ProvisioningLogDbRow {
  id: string;
  tenantId: string;
  status: string;
  steps: ProvisioningStepResponse[];
  initiatedBy: string | null;
  config: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

interface TenantDbRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
}

// =============================================================================
// Repository
// =============================================================================

export class TenantProvisioningRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Create the tenant record.
   * Runs in system context since the tenant does not yet exist.
   */
  async createTenant(
    tx: TransactionSql,
    data: {
      name: string;
      slug: string;
      settings: Record<string, unknown>;
    }
  ): Promise<TenantDbRow> {
    const [row] = await tx<TenantDbRow[]>`
      INSERT INTO app.tenants (id, name, slug, settings, status)
      VALUES (gen_random_uuid(), ${data.name}, ${data.slug}, ${JSON.stringify(data.settings)}::jsonb, 'active')
      RETURNING id, name, slug, status, settings
    `;
    return row;
  }

  /**
   * Check if a tenant slug already exists.
   */
  async slugExists(slug: string): Promise<boolean> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return await tx<Array<{ exists: boolean }>>`
        SELECT EXISTS(SELECT 1 FROM app.tenants WHERE slug = ${slug}) AS exists
      `;
    });
    return rows[0]?.exists === true;
  }

  /**
   * Create the user_tenants association.
   */
  async createUserTenantAssociation(
    tx: TransactionSql,
    data: {
      userId: string;
      tenantId: string;
      isPrimary: boolean;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.user_tenants (id, user_id, tenant_id, is_primary)
      VALUES (gen_random_uuid(), ${data.userId}::uuid, ${data.tenantId}::uuid, ${data.isPrimary})
    `;
  }

  /**
   * Create default roles for a new tenant.
   */
  async createDefaultRoles(
    tx: TransactionSql,
    tenantId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const defaultRoles = [
      { name: "tenant_admin", description: "Full access to all tenant features", isSystem: true },
      { name: "hr_manager", description: "HR management access", isSystem: true },
      { name: "line_manager", description: "Line manager access for direct reports", isSystem: true },
      { name: "employee", description: "Standard employee self-service access", isSystem: true },
    ];

    const created: Array<{ id: string; name: string }> = [];

    for (const role of defaultRoles) {
      const [row] = await tx<Array<{ id: string; name: string }>>`
        INSERT INTO app.roles (id, tenant_id, name, description, is_system)
        VALUES (gen_random_uuid(), ${tenantId}::uuid, ${role.name}, ${role.description}, ${role.isSystem})
        ON CONFLICT (tenant_id, name) WHERE tenant_id IS NOT NULL DO NOTHING
        RETURNING id, name
      `;
      if (row) created.push(row);
    }

    return created;
  }

  /**
   * Assign a role to a user in a tenant.
   */
  async assignRoleToUser(
    tx: TransactionSql,
    data: {
      tenantId: string;
      userId: string;
      roleName: string;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.user_roles (id, tenant_id, user_id, role_id, effective_from)
      SELECT gen_random_uuid(), ${data.tenantId}::uuid, ${data.userId}::uuid, r.id, now()
      FROM app.roles r
      WHERE r.tenant_id = ${data.tenantId}::uuid AND r.name = ${data.roleName}
      ON CONFLICT DO NOTHING
    `;
  }

  /**
   * Create a provisioning log entry.
   */
  async createProvisioningLog(
    tx: TransactionSql,
    data: {
      tenantId: string;
      initiatedBy: string | null;
      config: Record<string, unknown>;
    }
  ): Promise<string> {
    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO app.provisioning_logs (id, tenant_id, status, initiated_by, config, started_at)
      VALUES (gen_random_uuid(), ${data.tenantId}::uuid, 'in_progress', ${data.initiatedBy}::uuid, ${JSON.stringify(data.config)}::jsonb, now())
      RETURNING id
    `;
    return row.id;
  }

  /**
   * Update a provisioning log with step results.
   */
  async updateProvisioningLog(
    tx: TransactionSql,
    logId: string,
    data: {
      status: string;
      steps: ProvisioningStepResponse[];
      errorMessage?: string;
      completedAt?: boolean;
    }
  ): Promise<void> {
    await tx`
      UPDATE app.provisioning_logs
      SET
        status = ${data.status},
        steps = ${JSON.stringify(data.steps)}::jsonb,
        error_message = ${data.errorMessage || null},
        completed_at = ${data.completedAt ? tx`now()` : null},
        updated_at = now()
      WHERE id = ${logId}::uuid
    `;
  }

  /**
   * List provisioning logs with cursor-based pagination.
   */
  async listProvisioningLogs(filters: {
    status?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ProvisioningLogResponse[]; nextCursor: string | null }> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<ProvisioningLogDbRow[]>`
        SELECT id, tenant_id, status, steps, initiated_by, config,
               error_message, started_at, completed_at, created_at
        FROM app.provisioning_logs
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.cursor ? tx`AND created_at < ${filters.cursor}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${filters.limit + 1}
      `;
    });

    const hasMore = rows.length > filters.limit;
    const items = (hasMore ? rows.slice(0, filters.limit) : rows).map(
      this.mapProvisioningLog
    );
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt
        : null;

    return { items, nextCursor };
  }

  /**
   * Get a single provisioning log by ID.
   */
  async getProvisioningLog(id: string): Promise<ProvisioningLogResponse | null> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<ProvisioningLogDbRow[]>`
        SELECT id, tenant_id, status, steps, initiated_by, config,
               error_message, started_at, completed_at, created_at
        FROM app.provisioning_logs
        WHERE id = ${id}::uuid
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;
    return this.mapProvisioningLog(rows[0]);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapProvisioningLog(row: ProvisioningLogDbRow): ProvisioningLogResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      status: row.status,
      steps: row.steps || [],
      initiatedBy: row.initiatedBy,
      config: row.config || {},
      errorMessage: row.errorMessage,
      startedAt: row.startedAt?.toISOString() || String(row.startedAt),
      completedAt: row.completedAt?.toISOString() || null,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
    };
  }
}
