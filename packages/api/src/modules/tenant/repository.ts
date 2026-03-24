/**
 * Tenant Module - Repository Layer
 *
 * Database operations for tenant management.
 * Uses system context (RLS bypass) because tenant lookups
 * cannot rely on RLS tenant isolation — the tenant row itself
 * is what we are resolving.
 */

export type { TenantContext } from "../../types/service-result";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export class TenantRepository {
  constructor(private db: any) {}

  /**
   * Fetch a full tenant record by ID.
   * Uses system context to bypass RLS.
   */
  async findById(tenantId: string): Promise<TenantRow | null> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx<TenantRow[]>`
        SELECT id, name, slug, status, settings, created_at, updated_at
        FROM app.tenants
        WHERE id = ${tenantId}::uuid
        LIMIT 1
      `;
    });

    return (rows as TenantRow[])[0] ?? null;
  }

  /**
   * Fetch only the settings JSONB column for a tenant.
   * Uses system context to bypass RLS.
   */
  async getSettings(tenantId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx<Array<{ settings: Record<string, unknown> }>>`
        SELECT settings
        FROM app.tenants
        WHERE id = ${tenantId}::uuid
        LIMIT 1
      `;
    });

    const row = (rows as Array<{ settings: Record<string, unknown> }>)[0];
    return row ? (row.settings ?? {}) : null;
  }

  /**
   * Update a tenant's name and/or settings.
   * Uses system context to bypass RLS (tenants table is not tenant-scoped).
   * Returns the updated tenant row, or null if not found.
   */
  async updateSettings(
    tenantId: string,
    updates: { name?: string; settings?: Record<string, unknown> }
  ): Promise<TenantRow | null> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      // If both name and settings are provided
      if (updates.name !== undefined && updates.settings !== undefined) {
        return await tx<TenantRow[]>`
          UPDATE app.tenants
          SET name = ${updates.name},
              settings = ${JSON.stringify(updates.settings)}::jsonb
          WHERE id = ${tenantId}::uuid
            AND status = 'active'
          RETURNING id, name, slug, status, settings, created_at, updated_at
        `;
      }

      // Only name
      if (updates.name !== undefined) {
        return await tx<TenantRow[]>`
          UPDATE app.tenants
          SET name = ${updates.name}
          WHERE id = ${tenantId}::uuid
            AND status = 'active'
          RETURNING id, name, slug, status, settings, created_at, updated_at
        `;
      }

      // Only settings
      if (updates.settings !== undefined) {
        return await tx<TenantRow[]>`
          UPDATE app.tenants
          SET settings = ${JSON.stringify(updates.settings)}::jsonb
          WHERE id = ${tenantId}::uuid
            AND status = 'active'
          RETURNING id, name, slug, status, settings, created_at, updated_at
        `;
      }

      // Nothing to update, just return current row
      return await tx<TenantRow[]>`
        SELECT id, name, slug, status, settings, created_at, updated_at
        FROM app.tenants
        WHERE id = ${tenantId}::uuid
        LIMIT 1
      `;
    });

    return (rows as TenantRow[])[0] ?? null;
  }
}
