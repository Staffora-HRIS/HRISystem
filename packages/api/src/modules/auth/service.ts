/**
 * Authentication Module - Service Layer
 *
 * Implements business logic for Staffora-specific auth operations.
 * Delegates data access to the AuthService plugin (plugins/auth-better.ts)
 * and the Better Auth library for account management.
 *
 * This service orchestrates:
 * - User info retrieval with tenant associations
 * - Tenant switching with access verification
 * - CSRF token generation
 * - Admin account unlock
 */

import type { AuthService as AuthPluginService } from "../../plugins/auth-better";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { generateCsrfToken } from "../../plugins/auth-better";
import { adminUnlockAccount } from "../../lib/better-auth";
import type {
  MeResponse,
  TenantListItem,
  CsrfTokenResponse,
  SwitchTenantResponse,
  UnlockAccountResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
}

interface UserContext {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  status?: string;
  mfaEnabled?: boolean;
}

interface SessionContext {
  id: string;
  userId: string;
  expiresAt: Date | string;
}

// =============================================================================
// Service
// =============================================================================

export class AuthModuleService {
  constructor(private authService: AuthPluginService) {}

  /**
   * Get current user info with session and tenant context.
   * Resolves the current tenant from session or falls back to primary tenant.
   */
  async getMe(
    user: UserContext,
    session: SessionContext
  ): Promise<ServiceResult<MeResponse>> {
    const userWithTenants = await this.authService.getUserWithTenants(user.id);
    const currentTenantId = await this.authService.getSessionTenant(session.id, user.id);

    // Find current tenant from user's tenants
    const currentTenant =
      userWithTenants?.tenants.find(
        (tenant: TenantItem) => tenant.id === currentTenantId
      ) ||
      userWithTenants?.tenants.find(
        (tenant: TenantItem) => tenant.isPrimary
      ) ||
      null;

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          status: user.status,
          mfaEnabled: user.mfaEnabled,
        },
        session: {
          id: session.id,
          userId: session.userId,
          expiresAt:
            session.expiresAt instanceof Date
              ? session.expiresAt.toISOString()
              : session.expiresAt,
        },
        currentTenant,
        tenants: userWithTenants?.tenants || [],
      },
    };
  }

  /**
   * List tenants the user can access, with role info.
   */
  async listTenants(userId: string): Promise<ServiceResult<TenantListItem[]>> {
    const userWithTenants = await this.authService.getUserWithTenants(userId);
    const tenants = userWithTenants?.tenants ?? [];

    const items: TenantListItem[] = tenants.map((tenant: TenantItem) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      isPrimary: !!tenant.isPrimary,
      role: tenant.isPrimary ? "primary" : "member",
    }));

    return { success: true, data: items };
  }

  /**
   * Generate a CSRF token bound to the current session.
   */
  async getCsrfToken(
    sessionId: string
  ): Promise<ServiceResult<CsrfTokenResponse>> {
    const token = await generateCsrfToken(sessionId);
    return { success: true, data: { csrfToken: token } };
  }

  /**
   * Switch the current session to a different tenant.
   * Verifies the user has access before switching.
   */
  async switchTenant(
    userId: string,
    sessionId: string,
    tenantId: string
  ): Promise<ServiceResult<SwitchTenantResponse>> {
    const canSwitch = await this.authService.switchTenant(
      userId,
      sessionId,
      tenantId
    );

    if (!canSwitch) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "You do not have access to this tenant",
        },
      };
    }

    return { success: true, data: { success: true, tenantId } };
  }

  /**
   * Admin: unlock a user account that was locked due to failed login attempts.
   */
  async unlockAccount(
    userId: string
  ): Promise<ServiceResult<UnlockAccountResponse>> {
    await adminUnlockAccount(userId);

    return {
      success: true,
      data: {
        success: true,
        userId,
        message:
          "Account unlocked successfully. The user can now sign in.",
      },
    };
  }
}
