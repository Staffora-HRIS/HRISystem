/**
 * Tenant Module - Service Layer
 *
 * Business logic for tenant operations.
 * Delegates data access to TenantRepository and maps responses.
 */

import { TenantRepository, type TenantRow } from "./repository";
import type { AuthService } from "../../plugins/auth-better";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export class TenantService {
  private authService: AuthService | null = null;

  constructor(private repository: TenantRepository) {}

  /**
   * Attach the auth service so this module can resolve session tenants
   * without routes reaching into the plugin-level service directly.
   */
  setAuthService(authService: AuthService): void {
    this.authService = authService;
  }

  // ===========================================================================
  // Session Tenant Resolution
  // ===========================================================================

  /**
   * Resolve the tenant for the current session.
   * Checks the session's explicit tenant first, then falls back to the
   * user's primary tenant. Delegates to AuthService which handles caching
   * and session persistence.
   */
  async getSessionTenant(
    sessionId: string,
    userId?: string | null
  ): Promise<string | null> {
    if (!this.authService) {
      throw new Error(
        "TenantService: authService not set. Call setAuthService() during setup."
      );
    }
    return this.authService.getSessionTenant(sessionId, userId);
  }

  /**
   * Get the current tenant's full information.
   * Returns null if the tenant does not exist.
   */
  async getCurrentTenant(tenantId: string) {
    const row = await this.repository.findById(tenantId);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      settings: row.settings ?? {},
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  /**
   * Get the current tenant's settings object.
   * Returns null if the tenant does not exist.
   */
  async getTenantSettings(tenantId: string) {
    return this.repository.getSettings(tenantId);
  }
}
