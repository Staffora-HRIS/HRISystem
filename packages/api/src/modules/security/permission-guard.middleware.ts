/**
 * Enhanced Permission Guard Middleware
 *
 * Drop-in replacement / enhancement for the existing requirePermission() guard.
 * Adds data-scope enforcement, contextual conditions, SoD checks, and
 * sensitivity tier gating on top of the existing RBAC plugin.
 *
 * Backwards-compatible: existing requirePermission('resource', 'action')
 * calls continue to work unchanged.
 */

import { RbacError } from "../../plugins/rbac";
import { AuthError } from "../../plugins/auth-better";
import { logger } from "../../lib/logger";
import type {
  PermissionCheckContext,
  PermissionCheckResult,
  SoDViolation,
} from "./permission-resolution.service";
import { PermissionResolutionService } from "./permission-resolution.service";

// ---------------------------------------------------------------------------
// Singleton holder for the resolution service
// ---------------------------------------------------------------------------
let resolutionServiceSingleton: PermissionResolutionService | null = null;

function getResolutionService(ctx: any): PermissionResolutionService {
  if (!resolutionServiceSingleton) {
    const { db, cache } = ctx;
    resolutionServiceSingleton = new PermissionResolutionService(db, cache);
  }
  return resolutionServiceSingleton;
}

// ---------------------------------------------------------------------------
// Enhanced Permission Guard (v2)
// ---------------------------------------------------------------------------

export interface EnhancedPermissionOptions {
  /** The resource being accessed */
  resource: string;
  /** The action being performed */
  action: string;
  /**
   * Extract the target entity owner's user ID from the request context.
   * When provided, the guard enforces data-scope checks (Layer 2).
   * Return null to skip scope checking.
   */
  getTargetOwnerId?: (ctx: any) => string | null | Promise<string | null>;
  /**
   * Extract the current workflow state of the target entity.
   * When provided, the guard evaluates workflow-based conditions (Layer 3).
   */
  getWorkflowState?: (ctx: any) => string | null | Promise<string | null>;
  /**
   * Additional metadata for condition evaluation (e.g., payrollPeriodLocked).
   */
  getMetadata?: (ctx: any) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * If true, log the permission check result to the audit trail
   * even when allowed. By default only denials are logged.
   */
  auditOnSuccess?: boolean;
}

/**
 * Enhanced permission guard with full 7-layer enforcement.
 *
 * Usage:
 * ```ts
 * app.get('/employees/:id', handler, {
 *   beforeHandle: [
 *     requirePermissionV2({
 *       resource: 'employees',
 *       action: 'read',
 *       getTargetOwnerId: (ctx) => ctx.params.id,
 *     }),
 *   ],
 * });
 * ```
 */
export function requirePermissionV2(opts: EnhancedPermissionOptions) {
  return async (ctx: any) => {
    const { user, session, tenant, set } = ctx;

    // Auth check
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

    const service = getResolutionService(ctx);

    // Build the check context
    const checkCtx: PermissionCheckContext = {
      resource: opts.resource,
      action: opts.action,
      mfaVerified: session.mfaVerified ?? false,
      ipAddress: ctx.request?.headers?.get("x-forwarded-for") ??
                 ctx.request?.headers?.get("x-real-ip") ?? undefined,
    };

    // Optional: target owner for scope checks
    if (opts.getTargetOwnerId) {
      const ownerId = await opts.getTargetOwnerId(ctx);
      if (ownerId) checkCtx.targetOwnerId = ownerId;
    }

    // Optional: workflow state for condition checks
    if (opts.getWorkflowState) {
      const state = await opts.getWorkflowState(ctx);
      if (state) checkCtx.workflowState = state;
    }

    // Optional: additional metadata
    if (opts.getMetadata) {
      checkCtx.metadata = await opts.getMetadata(ctx);
    }

    // Run the 7-layer check
    const result: PermissionCheckResult = await service.checkPermission(
      tenant.id,
      user.id,
      checkCtx
    );

    // Handle MFA requirement
    if (result.requiresMfa) {
      set.status = 403;
      throw new RbacError(
        "MFA_REQUIRED_FOR_ACTION",
        result.reason || "MFA verification required",
        403
      );
    }

    // Handle SoD violations that are warn/audit level (allowed but logged)
    if (result.sodViolations.length > 0) {
      logSoDWarnings(ctx, result.sodViolations);
    }

    // Handle denial
    if (!result.allowed) {
      // Audit the denial
      await logPermissionDenial(ctx, opts.resource, opts.action, result);

      set.status = 403;
      throw new RbacError(
        "PERMISSION_DENIED",
        result.reason || `Permission denied: ${opts.resource}:${opts.action}`,
        403
      );
    }

    // Audit success if requested
    if (opts.auditOnSuccess) {
      await logPermissionGrant(ctx, opts.resource, opts.action, result);
    }

    // Pass constraints and scope downstream
    ctx.permissionConstraints = result.constraints;
    ctx.permissionScope = result.scope;
    ctx.permissionResult = result;
  };
}

// ---------------------------------------------------------------------------
// Require any of several permissions (enhanced v2)
// ---------------------------------------------------------------------------

export function requireAnyPermissionV2(
  permissions: EnhancedPermissionOptions[]
) {
  return async (ctx: any) => {
    const { user, session, tenant, set } = ctx;

    if (!user || !session) {
      set.status = 401;
      throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
    }
    if (!tenant) {
      set.status = 400;
      throw new RbacError("FORBIDDEN", "Tenant context required", 400);
    }

    const service = getResolutionService(ctx);
    let lastResult: PermissionCheckResult | null = null;

    for (const opts of permissions) {
      const checkCtx: PermissionCheckContext = {
        resource: opts.resource,
        action: opts.action,
        mfaVerified: session.mfaVerified ?? false,
      };

      if (opts.getTargetOwnerId) {
        const ownerId = await opts.getTargetOwnerId(ctx);
        if (ownerId) checkCtx.targetOwnerId = ownerId;
      }

      const result = await service.checkPermission(
        tenant.id,
        user.id,
        checkCtx
      );

      if (result.allowed) {
        ctx.permissionConstraints = result.constraints;
        ctx.permissionScope = result.scope;
        ctx.permissionResult = result;
        ctx.grantedPermission = `${opts.resource}:${opts.action}`;
        return;
      }

      lastResult = result;
    }

    set.status = 403;
    throw new RbacError(
      "PERMISSION_DENIED",
      lastResult?.reason ||
        `Permission denied. Required one of: ${permissions.map((p) => `${p.resource}:${p.action}`).join(", ")}`,
      403
    );
  };
}

// ---------------------------------------------------------------------------
// Require sensitivity tier access
// ---------------------------------------------------------------------------

/**
 * Guard that ensures the user's maximum sensitivity tier is sufficient.
 * Use for endpoints that return Tier 2+ data.
 */
export function requireSensitivityTier(minTier: number) {
  return async (ctx: any) => {
    const { user, tenant, set } = ctx;
    if (!user || !tenant) {
      set.status = 401;
      throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
    }

    const service = getResolutionService(ctx);
    // Quick check: load cached effective permissions to read maxSensitivityTier
    const perms = await (service as any).getEffectivePermissions(
      tenant.id,
      user.id
    );

    if (!perms || perms.maxSensitivityTier < minTier) {
      set.status = 403;
      throw new RbacError(
        "PERMISSION_DENIED",
        `Insufficient data classification clearance (requires tier ${minTier})`,
        403
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Self-or-Permission Guard
// ---------------------------------------------------------------------------

/**
 * Allows access if the user is accessing their own data (self-scope)
 * OR if they have the specified permission with appropriate scope.
 *
 * Common pattern: employee can view own payslip, payroll_admin can view all.
 */
export function requireSelfOrPermission(
  resource: string,
  action: string,
  getTargetUserId: (ctx: any) => string | null | Promise<string | null>
) {
  return async (ctx: any) => {
    const { user, set } = ctx;
    if (!user) {
      set.status = 401;
      throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
    }

    const targetUserId = await getTargetUserId(ctx);

    // Self-access: always allowed (the user IS the target)
    if (targetUserId && targetUserId === user.id) {
      ctx.permissionScope = { scopeType: "self" };
      return;
    }

    // Otherwise, check permission with scope
    return requirePermissionV2({
      resource,
      action,
      getTargetOwnerId: () => targetUserId,
    })(ctx);
  };
}

// ---------------------------------------------------------------------------
// Audit Helpers
// ---------------------------------------------------------------------------

async function logPermissionDenial(
  ctx: any,
  resource: string,
  action: string,
  result: PermissionCheckResult
): Promise<void> {
  try {
    const { tenant, user } = ctx;
    if (!tenant || !user) return;

    // Use the existing audit service if available
    const securityService = ctx.securityService;
    if (securityService?.writeAuditLog) {
      await securityService.writeAuditLog({
        tenantId: tenant.id,
        userId: user.id,
        action: "security.permission.denied",
        resourceType: resource,
        metadata: {
          permissionKey: `${resource}:${action}`,
          reason: result.reason,
          grantSources: result.grantSources,
          sodViolations: result.sodViolations.map((v) => v.ruleName),
        },
      });
    }
  } catch {
    // Audit logging should never break the request flow
  }
}

async function logPermissionGrant(
  ctx: any,
  resource: string,
  action: string,
  result: PermissionCheckResult
): Promise<void> {
  try {
    const { tenant, user } = ctx;
    if (!tenant || !user) return;

    const securityService = ctx.securityService;
    if (securityService?.writeAuditLog) {
      await securityService.writeAuditLog({
        tenantId: tenant.id,
        userId: user.id,
        action: "security.permission.granted",
        resourceType: resource,
        metadata: {
          permissionKey: `${resource}:${action}`,
          grantSources: result.grantSources,
          scope: result.scope,
        },
      });
    }
  } catch {
    // Audit logging should never break the request flow
  }
}

function logSoDWarnings(ctx: any, violations: SoDViolation[]): void {
  // Log SoD violations; in production, push to security_alerts table
  for (const v of violations) {
    logger.warn({ module: "security", userId: ctx.user?.id, enforcement: v.enforcement, ruleName: v.ruleName, details: v.details }, "SoD violation detected");
  }
}
