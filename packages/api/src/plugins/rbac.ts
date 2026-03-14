/**
 * RBAC (Role-Based Access Control) Plugin
 *
 * Provides permission checking and enforcement.
 * Features:
 * - Load user permissions from cache or DB
 * - Permission checking middleware
 * - Constraint evaluation (org scope, relationship scope)
 * - Cache permissions with TTL
 */

import { Elysia } from "elysia";
import { type DatabaseClient } from "./db";
import { type CacheClient, CacheTTL, CacheKeys } from "./cache";
import { type User, type Session, AuthError } from "./auth-better";
import { type Tenant } from "./tenant";

// =============================================================================
// Types
// =============================================================================

/**
 * Permission with role and constraints
 */
export interface Permission {
  permissionKey: string;
  resource: string;
  action: string;
  requiresMfa: boolean;
  roleName: string;
  constraints: PermissionConstraints | null;
}

/**
 * Permission constraints for scoped access
 */
export interface PermissionConstraints {
  /** Limit access to specific org units */
  orgUnits?: string[];
  /** Limit access to specific cost centers */
  costCenters?: string[];
  /** Relationship scope: self, direct_reports, org_unit, all */
  scope?: "self" | "direct_reports" | "org_unit" | "all";
  /** Module-specific custom constraints */
  custom?: Record<string, unknown>;
}

/**
 * Role with permissions
 */
export interface Role {
  roleId: string;
  roleName: string;
  isSystem: boolean;
  constraints: PermissionConstraints | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * Effective permissions for a user
 */
export interface EffectivePermissions {
  /** All permission keys the user has */
  permissions: Set<string>;
  /** Map of permission key to constraints */
  constraints: Map<string, PermissionConstraints | null>;
  /** Whether user has super admin access */
  isSuperAdmin: boolean;
  /** Whether user has tenant admin access */
  isTenantAdmin: boolean;
  /** User's roles */
  roles: Role[];
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  requiresMfa: boolean;
  constraints: PermissionConstraints | null;
  reason?: string;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * RBAC-related error codes
 */
export const RbacErrorCodes = {
  FORBIDDEN: "FORBIDDEN",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  MFA_REQUIRED_FOR_ACTION: "MFA_REQUIRED_FOR_ACTION",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
} as const;

/**
 * RBAC error
 */
export class RbacError extends Error {
  constructor(
    public code: keyof typeof RbacErrorCodes,
    message: string,
    public statusCode: number = 403
  ) {
    super(message);
    this.name = "RbacError";
  }
}

// =============================================================================
// RBAC Service
// =============================================================================

/**
 * RBAC service for permission management
 */
export class RbacService {
  constructor(
    private db: DatabaseClient,
    private cache: CacheClient
  ) {}

  /**
   * Get effective permissions for a user in a tenant
   */
  async getEffectivePermissions(
    tenantId: string,
    userId: string
  ): Promise<EffectivePermissions> {
    // Try cache first
    const cacheKey = CacheKeys.permissions(tenantId, userId);
    const cached = await this.cache.get<{
      permissions: string[];
      constraints: Record<string, PermissionConstraints | null>;
      isSuperAdmin: boolean;
      isTenantAdmin: boolean;
      roles: Role[];
    }>(cacheKey);

    if (cached) {
      return {
        permissions: new Set(cached.permissions),
        constraints: new Map(Object.entries(cached.constraints)),
        isSuperAdmin: cached.isSuperAdmin,
        isTenantAdmin: cached.isTenantAdmin,
        roles: cached.roles,
      };
    }

    // Get roles for user
    const roles = await this.db.withSystemContext(async (tx) => {
      return await tx<Role[]>`
        SELECT
          role_id as "roleId",
          role_name as "roleName",
          is_system as "isSystem",
          constraints,
          effective_from as "effectiveFrom",
          effective_to as "effectiveTo"
        FROM app.get_user_roles(${tenantId}::uuid, ${userId}::uuid)
      `;
    });

    // Get permissions from roles
    const permissions = await this.db.withSystemContext(async (tx) => {
      return await tx<Permission[]>`
        SELECT
          permission_key as "permissionKey",
          resource,
          action,
          requires_mfa as "requiresMfa",
          role_name as "roleName",
          constraints
        FROM app.get_user_permissions(${tenantId}::uuid, ${userId}::uuid)
      `;
    });

    // Check for special roles
    const roleNames = new Set(
      (roles as any[])
        .map((r) => r?.roleName ?? r?.role_name ?? r?.name)
        .filter((v): v is string => typeof v === "string")
    );
    const isSuperAdmin = roleNames.has("super_admin");
    const isTenantAdmin = roleNames.has("tenant_admin");

    // Build effective permissions
    const permissionSet = new Set<string>();
    const constraintsMap = new Map<string, PermissionConstraints | null>();

    for (const perm of permissions as Permission[]) {
      permissionSet.add(perm.permissionKey);
      // Store the least restrictive constraints (null = no constraints)
      const existing = constraintsMap.get(perm.permissionKey);
      if (existing === undefined) {
        constraintsMap.set(perm.permissionKey, perm.constraints);
      } else if (perm.constraints === null) {
        constraintsMap.set(perm.permissionKey, null);
      }
    }

    const effective: EffectivePermissions = {
      permissions: permissionSet,
      constraints: constraintsMap,
      isSuperAdmin,
      isTenantAdmin,
      roles: roles as Role[],
    };

    // Cache the result
    await this.cache.set(
      cacheKey,
      {
        permissions: Array.from(permissionSet),
        constraints: Object.fromEntries(constraintsMap),
        isSuperAdmin,
        isTenantAdmin,
        roles,
      },
      CacheTTL.PERMISSIONS
    );

    return effective;
  }

  /**
   * Check if user has a specific permission
   */
  async checkPermission(
    tenantId: string,
    userId: string,
    resource: string,
    action: string,
    mfaVerified: boolean = false
  ): Promise<PermissionCheckResult> {
    const permKey = `${resource}:${action}`;
    const effective = await this.getEffectivePermissions(tenantId, userId);

    // Super admin has all permissions
    if (effective.isSuperAdmin) {
      return {
        allowed: true,
        requiresMfa: false,
        constraints: null,
      };
    }

    // Check wildcard permissions
    if (
      effective.permissions.has("*:*") ||
      effective.permissions.has(`${resource}:*`) ||
      effective.permissions.has(`*:${action}`)
    ) {
      return {
        allowed: true,
        requiresMfa: false,
        constraints: null,
      };
    }

    // Check specific permission
    if (!effective.permissions.has(permKey)) {
      return {
        allowed: false,
        requiresMfa: false,
        constraints: null,
        reason: `Missing permission: ${permKey}`,
      };
    }

    // Check if MFA is required
    const requiresMfa = await this.permissionRequiresMfa(resource, action);
    if (requiresMfa && !mfaVerified) {
      return {
        allowed: false,
        requiresMfa: true,
        constraints: effective.constraints.get(permKey) || null,
        reason: "MFA verification required for this action",
      };
    }

    return {
      allowed: true,
      requiresMfa,
      constraints: effective.constraints.get(permKey) || null,
    };
  }

  // In-memory cache for MFA requirement lookups (config data, rarely changes)
  private mfaRequirementCache = new Map<string, { value: boolean; expiresAt: number }>();
  private static readonly MFA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if a permission requires MFA.
   * Cached in-memory since permission-MFA mappings are configuration data.
   */
  async permissionRequiresMfa(
    resource: string,
    action: string
  ): Promise<boolean> {
    const cacheKey = `${resource}:${action}`;
    const cached = this.mfaRequirementCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<{ requiresMfa: boolean }[]>`
        SELECT app.permission_requires_mfa(${resource}, ${action}) as requires_mfa
      `;
    });

    const value = results.length > 0 && results[0]?.requiresMfa === true;
    this.mfaRequirementCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + RbacService.MFA_CACHE_TTL_MS,
    });

    return value;
  }

  /**
   * Evaluate constraints for a specific context
   */
  evaluateConstraints(
    constraints: PermissionConstraints | null,
    context: {
      targetUserId?: string;
      targetOrgUnitId?: string;
      targetCostCenterId?: string;
      currentUserId: string;
      currentOrgUnitId?: string;
      directReportIds?: string[];
    }
  ): boolean {
    // No constraints = allowed
    if (!constraints) {
      return true;
    }

    // Check scope constraint
    if (constraints.scope) {
      switch (constraints.scope) {
        case "self":
          if (context.targetUserId && context.targetUserId !== context.currentUserId) {
            return false;
          }
          break;
        case "direct_reports":
          if (
            context.targetUserId &&
            context.targetUserId !== context.currentUserId &&
            !context.directReportIds?.includes(context.targetUserId)
          ) {
            return false;
          }
          break;
        case "org_unit":
          if (
            context.targetOrgUnitId &&
            context.currentOrgUnitId &&
            context.targetOrgUnitId !== context.currentOrgUnitId
          ) {
            return false;
          }
          break;
        case "all":
          // No restriction
          break;
      }
    }

    // Check org unit constraint
    if (constraints.orgUnits && constraints.orgUnits.length > 0) {
      if (
        context.targetOrgUnitId &&
        !constraints.orgUnits.includes(context.targetOrgUnitId)
      ) {
        return false;
      }
    }

    // Check cost center constraint
    if (constraints.costCenters && constraints.costCenters.length > 0) {
      if (
        context.targetCostCenterId &&
        !constraints.costCenters.includes(context.targetCostCenterId)
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Invalidate permission cache for a user
   */
  async invalidateCache(tenantId: string, userId: string): Promise<void> {
    await this.cache.del(CacheKeys.permissions(tenantId, userId));
    await this.cache.del(CacheKeys.roles(tenantId, userId));
  }

  /**
   * Invalidate permission cache for all users in a tenant (after role change)
   */
  async invalidateTenantCache(tenantId: string): Promise<void> {
    // This is expensive - use with caution
    // In production, consider using a more targeted approach
    await this.cache.invalidateTenantCache(tenantId);
  }
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * RBAC plugin for Elysia
 *
 * Provides permission checking and enforcement.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .use(cachePlugin())
 *   .use(authPlugin())
 *   .use(rbacPlugin())
 *   .get('/employees', ({ rbac }) => {
 *     return rbac.getEffectivePermissions();
 *   });
 * ```
 */
export function rbacPlugin() {
  // Singleton: created once when plugin is initialized, reused across all requests
  let rbacServiceSingleton: RbacService | null = null;

  return new Elysia({ name: "rbac" })
    // RBAC service for direct access (singleton)
    .derive({ as: "global" }, (ctx) => {
      const { db, cache } = ctx as any;
      if (!rbacServiceSingleton) {
        rbacServiceSingleton = new RbacService(db, cache);
      }
      return {
        rbacService: rbacServiceSingleton,
      };
    })

    // Lazy-load permissions for authenticated users with tenant context.
    // Permissions are only fetched from Redis/DB when first accessed,
    // then cached for the lifetime of the request.
    .derive({ as: "global" }, (ctx) => {
      const { user, tenant, rbacService } = ctx as any;

      let cached: EffectivePermissions | null | undefined;

      const permissions: {
        get: () => Promise<EffectivePermissions | null>;
      } = {
        get: async () => {
          if (cached !== undefined) return cached;
          if (!user || !tenant) {
            cached = null;
            return cached;
          }
          cached = await rbacService.getEffectivePermissions(
            tenant.id,
            user.id
          );
          return cached;
        },
      };

      return { permissions };
    })

    // Error handler for RBAC errors
    .onError(({ error, set }) => {
      if (error instanceof RbacError) {
        set.status = error.statusCode;
        return {
          error: {
            code: error.code,
            message: error.message,
            requestId: "",
          },
        };
      }
    });
}

/**
 * Create a permission guard
 *
 * Usage:
 * ```ts
 * app.get('/employees',
 *   ({ user }) => getEmployees(),
 *   { beforeHandle: [requirePermission('employees', 'read')] }
 * );
 * ```
 */
export function requirePermission(resource: string, action: string) {
  return async (ctx: any) => {
    const { user, session, tenant, rbacService, set } = ctx as any;
    if (!user || !session) {
      set.status = 401;
      throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (!tenant) {
      set.status = 400;
      throw new RbacError(
        "FORBIDDEN",
        "Tenant context required for permission check",
        400
      );
    }

    const result = await rbacService.checkPermission(
      tenant.id,
      user.id,
      resource,
      action,
      session.mfaVerified
    );

    if (!result.allowed) {
      if (result.requiresMfa) {
        set.status = 403;
        throw new RbacError(
          "MFA_REQUIRED_FOR_ACTION",
          result.reason || "MFA verification required",
          403
        );
      }

      set.status = 403;
      throw new RbacError(
        "PERMISSION_DENIED",
        result.reason || `Permission denied: ${resource}:${action}`,
        403
      );
    }

    // Make constraints available to downstream handlers if needed
    (ctx as any).permissionConstraints = result.constraints;
  };
}

/**
 * Check if user has any of the specified permissions
 */
export function requireAnyPermission(
  permissions: Array<{ resource: string; action: string }>
) {
  return async (ctx: any) => {
    const { user, session, tenant, rbacService, set } = ctx as any;
    if (!user || !session) {
      set.status = 401;
      throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (!tenant) {
      set.status = 400;
      throw new RbacError(
        "FORBIDDEN",
        "Tenant context required for permission check",
        400
      );
    }

    for (const { resource, action } of permissions) {
      const result = await rbacService.checkPermission(
        tenant.id,
        user.id,
        resource,
        action,
        session.mfaVerified
      );

      if (result.allowed) {
        (ctx as any).permissionConstraints = result.constraints;
        (ctx as any).grantedPermission = `${resource}:${action}`;
        return;
      }
    }

    set.status = 403;
    throw new RbacError(
      "PERMISSION_DENIED",
      `Permission denied. Required one of: ${permissions.map((p) => `${p.resource}:${p.action}`).join(", ")}`,
      403
    );
  };
}

/**
 * Require all specified permissions
 */
export function requireAllPermissions(
  permissions: Array<{ resource: string; action: string }>
) {
  return async (ctx: any) => {
    const { user, session, tenant, rbacService, set } = ctx as any;
    if (!user || !session) {
      set.status = 401;
      throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (!tenant) {
      set.status = 400;
      throw new RbacError(
        "FORBIDDEN",
        "Tenant context required for permission check",
        400
      );
    }

    const constraints: Array<PermissionConstraints | null> = [];

    for (const { resource, action } of permissions) {
      const result = await rbacService.checkPermission(
        tenant.id,
        user.id,
        resource,
        action,
        session.mfaVerified
      );

      if (!result.allowed) {
        if (result.requiresMfa) {
          set.status = 403;
          throw new RbacError(
            "MFA_REQUIRED_FOR_ACTION",
            `MFA required for ${resource}:${action}`,
            403
          );
        }

        set.status = 403;
        throw new RbacError(
          "PERMISSION_DENIED",
          `Permission denied: ${resource}:${action}`,
          403
        );
      }

      constraints.push(result.constraints);
    }

    (ctx as any).permissionConstraints = constraints;
  };
}

/**
 * Helper to check permission without throwing
 */
export async function hasPermission(
  rbacService: RbacService,
  tenantId: string,
  userId: string,
  resource: string,
  action: string,
  mfaVerified: boolean = false
): Promise<boolean> {
  const result = await rbacService.checkPermission(
    tenantId,
    userId,
    resource,
    action,
    mfaVerified
  );
  return result.allowed;
}
