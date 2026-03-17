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
import { type SoDViolation } from "../modules/security/permission-resolution.service";

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

    // Fetch roles and permissions in a single system context transaction
    // to avoid two separate DB round-trips per cache miss
    const { roles, permissions } = await this.db.withSystemContext(async (tx) => {
      const [rolesResult, permsResult] = await Promise.all([
        tx<Role[]>`
          SELECT
            role_id as "roleId",
            role_name as "roleName",
            is_system as "isSystem",
            constraints,
            effective_from as "effectiveFrom",
            effective_to as "effectiveTo"
          FROM app.get_user_roles(${tenantId}::uuid, ${userId}::uuid)
        `,
        tx<Permission[]>`
          SELECT
            permission_key as "permissionKey",
            resource,
            action,
            requires_mfa as "requiresMfa",
            role_name as "roleName",
            constraints
          FROM app.get_user_permissions(${tenantId}::uuid, ${userId}::uuid)
        `,
      ]);
      return { roles: rolesResult, permissions: permsResult };
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

  // ===========================================================================
  // Data Scope Resolution
  // ===========================================================================

  /**
   * Resolve the set of employee IDs a user can access for a given resource.
   * Calls the DB function `app.resolve_user_data_scope()` and caches
   * the result for 15 minutes (CacheTTL.PERMISSIONS).
   */
  async resolveDataScope(
    tenantId: string,
    userId: string,
    resource: string = "employees"
  ): Promise<string[]> {
    const cacheKey = `scope:${tenantId}:${userId}:${resource}`;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.db.withSystemContext(async (tx) => {
      return await tx<{ employeeId: string }[]>`
        SELECT employee_id FROM app.resolve_user_data_scope(
          ${tenantId}::uuid, ${userId}::uuid, ${resource}
        )
      `;
    });

    const ids = rows.map((r) => r.employeeId);
    await this.cache.set(cacheKey, ids, CacheTTL.PERMISSIONS);
    return ids;
  }

  /**
   * Check whether a specific employee is within a user's data scope.
   * Uses `resolveDataScope` internally.
   */
  async isEmployeeInScope(
    tenantId: string,
    userId: string,
    employeeId: string,
    resource: string = "employees"
  ): Promise<boolean> {
    const scopedIds = await this.resolveDataScope(tenantId, userId, resource);
    return scopedIds.includes(employeeId);
  }

  // ===========================================================================
  // Separation of Duties
  // ===========================================================================

  /**
   * Check separation-of-duties rules for the given user, resource, and action.
   * Calls `app.check_separation_of_duties()` DB function.
   * Returns the list of violations and whether any are blocking.
   */
  async checkSeparationOfDuties(
    tenantId: string,
    userId: string,
    resource: string,
    action: string,
    context: Record<string, unknown> = {}
  ): Promise<{ violations: SoDViolation[]; blocked: boolean }> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return await tx`
        SELECT rule_id, rule_name, violation_type, enforcement, details
        FROM app.check_separation_of_duties(
          ${tenantId}::uuid, ${userId}::uuid, ${resource}, ${action}, ${JSON.stringify(context)}::jsonb
        )
      `;
    });

    const violations: SoDViolation[] = rows.map((r: any) => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      violationType: r.violationType,
      enforcement: r.enforcement,
      details: r.details,
    }));

    return {
      violations,
      blocked: violations.some((v) => v.enforcement === "block"),
    };
  }

  // ===========================================================================
  // Field-Level Permissions
  // ===========================================================================

  /**
   * Batch field permission check.
   * Returns a Map of field name to the effective permission level
   * ('edit' | 'view' | 'hidden'). Results are cached per entity per user
   * for 15 minutes (CacheTTL.PERMISSIONS).
   */
  async getFieldPermissions(
    tenantId: string,
    userId: string,
    entityName: string,
    fieldNames?: string[]
  ): Promise<Map<string, "edit" | "view" | "hidden">> {
    const cacheKey = `fperms:${tenantId}:${userId}:${entityName}`;
    const cached = await this.cache.get<Record<string, string>>(cacheKey);
    if (cached) {
      const map = new Map<string, "edit" | "view" | "hidden">();
      for (const [k, v] of Object.entries(cached)) {
        map.set(k, v as "edit" | "view" | "hidden");
      }
      return map;
    }

    const rows = await this.db.withSystemContext(async (tx) => {
      return await tx<{ fieldName: string; permission: string }[]>`
        SELECT fr.field_name,
               COALESCE(
                 (SELECT rfp.permission FROM app.role_field_permissions rfp
                  JOIN app.role_assignments ra ON ra.role_id = rfp.role_id
                  WHERE ra.user_id = ${userId}::uuid
                    AND ra.effective_from <= now()
                    AND (ra.effective_to IS NULL OR ra.effective_to > now())
                    AND rfp.field_id = fr.id
                  ORDER BY CASE rfp.permission WHEN 'edit' THEN 1 WHEN 'view' THEN 2 WHEN 'hidden' THEN 3 END
                  LIMIT 1),
                 fr.default_permission
               ) as permission
        FROM app.field_registry fr
        WHERE fr.entity_name = ${entityName}
          AND (fr.tenant_id = ${tenantId}::uuid OR fr.tenant_id IS NULL)
          ${fieldNames ? tx`AND fr.field_name = ANY(${fieldNames})` : tx``}
      `;
    });

    const map = new Map<string, "edit" | "view" | "hidden">();
    for (const row of rows) {
      map.set(row.fieldName, row.permission as "edit" | "view" | "hidden");
    }

    // Cache the result
    await this.cache.set(cacheKey, Object.fromEntries(map), CacheTTL.PERMISSIONS);
    return map;
  }

  // ===========================================================================
  // Scope Cache Invalidation
  // ===========================================================================

  /**
   * Invalidate the data scope cache for a user.
   * Call this when role assignments change so that
   * `resolveDataScope` re-queries the database.
   */
  async invalidateScopeCache(tenantId: string, userId: string): Promise<void> {
    // Delete all resource-specific scope keys for this user.
    // The keys follow the pattern  scope:{tenantId}:{userId}:*
    // We also delete field-permission keys since role changes affect those too.
    const scopePattern = `scope:${tenantId}:${userId}`;
    const fpermsPattern = `fperms:${tenantId}:${userId}`;

    // Best-effort: delete known common resource keys
    const commonResources = [
      "employees",
      "leave_requests",
      "timesheets",
      "cases",
      "documents",
    ];
    const keysToDelete = commonResources.map(
      (r) => `${scopePattern}:${r}`
    );

    // Also attempt pattern-based scan for any other resource keys
    try {
      const redis = this.cache.client;
      if (redis && typeof redis.keys === "function") {
        // Use SCAN via keys helper if available
        const prefix =
          (process.env["REDIS_KEY_PREFIX"] || "staffora:") + scopePattern;
        const fprefix =
          (process.env["REDIS_KEY_PREFIX"] || "staffora:") + fpermsPattern;

        let cursor = "0";
        do {
          const [nextCursor, foundKeys] = await redis.scan(
            cursor,
            "MATCH",
            `${prefix}:*`,
            "COUNT",
            50
          );
          cursor = nextCursor;
          for (const k of foundKeys) {
            const stripped = k.replace(
              process.env["REDIS_KEY_PREFIX"] || "staffora:",
              ""
            );
            if (!keysToDelete.includes(stripped)) {
              keysToDelete.push(stripped);
            }
          }
        } while (cursor !== "0");

        // Also scan fperms keys
        cursor = "0";
        do {
          const [nextCursor, foundKeys] = await redis.scan(
            cursor,
            "MATCH",
            `${fprefix}:*`,
            "COUNT",
            50
          );
          cursor = nextCursor;
          for (const k of foundKeys) {
            const stripped = k.replace(
              process.env["REDIS_KEY_PREFIX"] || "staffora:",
              ""
            );
            if (!keysToDelete.includes(stripped)) {
              keysToDelete.push(stripped);
            }
          }
        } while (cursor !== "0");
      }
    } catch {
      // Fall through to deleting known keys if scan fails
    }

    // Batch delete using delMany instead of individual del calls
    if (keysToDelete.length > 0) {
      await this.cache.delMany(keysToDelete);
    }
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

// =============================================================================
// Enhanced Permission Guard with Data Scope & SoD
// =============================================================================

/**
 * Options for the enhanced permission guard.
 */
export interface RequirePermissionWithScopeOptions {
  /** Route param name containing the target employee ID to check against data scope */
  targetEmployeeIdParam?: string;
  /** Whether to run separation-of-duties checks */
  checkSoD?: boolean;
}

/**
 * Enhanced permission guard that also checks data scope and separation of duties.
 *
 * Usage:
 * ```ts
 * app.get('/employees/:employeeId',
 *   ({ user }) => getEmployee(),
 *   {
 *     beforeHandle: [
 *       requirePermissionWithScope('employees', 'read', {
 *         targetEmployeeIdParam: 'employeeId',
 *         checkSoD: true,
 *       })
 *     ]
 *   }
 * );
 * ```
 */
export function requirePermissionWithScope(
  resource: string,
  action: string,
  options?: RequirePermissionWithScopeOptions
) {
  return async (ctx: any) => {
    // First check base permission (auth, tenant, permission key)
    await requirePermission(resource, action)(ctx);

    const { user, tenant, rbacService, params, set } = ctx as any;

    // Check data scope if a target employee param is specified
    if (options?.targetEmployeeIdParam) {
      const targetId = params?.[options.targetEmployeeIdParam];
      if (targetId) {
        const inScope = await rbacService.isEmployeeInScope(
          tenant.id,
          user.id,
          targetId,
          resource
        );
        if (!inScope) {
          set.status = 403;
          throw new RbacError(
            "PERMISSION_DENIED",
            "Target employee is not within your data scope",
            403
          );
        }
      }
    }

    // Check separation of duties if requested
    if (options?.checkSoD) {
      const sod = await rbacService.checkSeparationOfDuties(
        tenant.id,
        user.id,
        resource,
        action
      );
      if (sod.blocked) {
        set.status = 403;
        throw new RbacError(
          "PERMISSION_DENIED",
          `Separation of duties violation: ${sod.violations[0]?.details}`,
          403
        );
      }
      // Attach non-blocking violations to context for downstream handlers
      (ctx as any).sodViolations = sod.violations;
    }
  };
}
