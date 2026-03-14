/**
 * Permission Resolution Engine
 *
 * Implements the 7-layer permission resolution algorithm:
 *   1. Role & Permission Collection (union of all active role permissions)
 *   2. Data Scope Resolution (what data can the user see)
 *   3. Contextual Condition Evaluation (time, workflow, employment status)
 *   4. Separation of Duties Check
 *   5. Sensitivity Tier Gating
 *   6. Field-Level Security Overlay
 *   7. Cache & Return
 *
 * Performance targets:
 *   - Cached check: < 5ms
 *   - Uncached check: < 50ms
 *   - Bulk field check: < 10ms
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScopeType =
  | "self"
  | "direct_reports"
  | "indirect_reports"
  | "department"
  | "division"
  | "location"
  | "cost_centre"
  | "legal_entity"
  | "all"
  | "custom";

export interface DataScope {
  scopeType: ScopeType;
  orgUnits?: string[];
  costCentres?: string[];
  locations?: string[];
  legalEntities?: string[];
  customScopeId?: string;
  crossEntity?: boolean;
}

export interface PermissionCondition {
  id: string;
  conditionType: string; // 'time_window' | 'workflow_state' | 'employment_status' | 'payroll_lock' | 'custom'
  resource: string;
  action: string;
  conditionParams: Record<string, unknown>;
  effect: "deny" | "require";
  priority: number;
}

export interface SoDViolation {
  ruleId: string;
  ruleName: string;
  violationType: string;
  enforcement: "block" | "warn" | "audit";
  details: string;
}

export interface ResolvedPermission {
  allowed: boolean;
  permissionKey: string;
  requiresMfa: boolean;
  scope: DataScope;
  maxSensitivityTier: number;
  conditions: PermissionCondition[];
  sodViolations: SoDViolation[];
  source: string; // which role(s) granted this
  reason?: string;
}

export interface EffectiveDataScope {
  /** Union of all employee IDs the user can access */
  employeeIds: Set<string> | "all";
  /** Highest scope type across all roles */
  maxScope: ScopeType;
  /** Per-scope detail for audit trail */
  scopeDetails: DataScope[];
}

export interface PermissionCheckContext {
  /** The resource being accessed */
  resource: string;
  /** The action being performed */
  action: string;
  /** Target entity ID (e.g., the employee being viewed) */
  targetEntityId?: string;
  /** Target entity type (e.g., 'employee', 'leave_request') */
  targetEntityType?: string;
  /** Owner user ID of the target entity (for self-scope checks) */
  targetOwnerId?: string;
  /** Current workflow state of the target entity */
  workflowState?: string;
  /** Additional context for condition evaluation */
  metadata?: Record<string, unknown>;
  /** Whether MFA has been verified this session */
  mfaVerified?: boolean;
  /** IP address for audit */
  ipAddress?: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresMfa: boolean;
  scopeAllowed: boolean;
  conditionsMet: boolean;
  sodClear: boolean;
  sensitivityAllowed: boolean;
  constraints: Record<string, unknown> | null;
  scope: DataScope | null;
  reason?: string;
  /** Which role(s) contributed to this grant */
  grantSources: string[];
  /** Any SoD violations (warn/audit level may still allow) */
  sodViolations: SoDViolation[];
}

// Scope hierarchy for comparison (higher index = broader scope)
const SCOPE_HIERARCHY: ScopeType[] = [
  "self",
  "direct_reports",
  "indirect_reports",
  "department",
  "division",
  "location",
  "cost_centre",
  "legal_entity",
  "all",
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PermissionResolutionService {
  private db: any;
  private cache: any;

  constructor(db: any, cache: any) {
    this.db = db;
    this.cache = cache;
  }

  // =========================================================================
  // Main Entry Point: Full 7-Layer Permission Check
  // =========================================================================

  async checkPermission(
    tenantId: string,
    userId: string,
    ctx: PermissionCheckContext
  ): Promise<PermissionCheckResult> {
    const permissionKey = `${ctx.resource}:${ctx.action}`;

    // Layer 1: Collect effective permissions from all active roles
    const effectivePerms = await this.getEffectivePermissions(tenantId, userId);
    if (!effectivePerms) {
      return this.denied(permissionKey, "User has no active roles");
    }

    // Super admin bypass (except SoD — always checked)
    if (effectivePerms.isSuperAdmin) {
      const sodResult = await this.checkSoD(
        tenantId,
        userId,
        ctx.resource,
        ctx.action,
        ctx.metadata
      );
      return this.granted(permissionKey, effectivePerms, sodResult, {
        scopeType: "all",
      });
    }

    // Check if user has the permission key (with wildcard support)
    const hasPermKey = this.matchPermission(
      permissionKey,
      effectivePerms.permissions
    );
    if (!hasPermKey) {
      return this.denied(permissionKey, `Missing permission: ${permissionKey}`);
    }

    // Check MFA requirement
    const requiresMfa = effectivePerms.mfaRequired.has(permissionKey);
    if (requiresMfa && !ctx.mfaVerified) {
      return {
        allowed: false,
        requiresMfa: true,
        scopeAllowed: false,
        conditionsMet: false,
        sodClear: true,
        sensitivityAllowed: false,
        constraints: null,
        scope: null,
        reason: "MFA verification required for this action",
        grantSources: [],
        sodViolations: [],
      };
    }

    // Layer 2: Data scope check
    const scope = this.resolveScope(effectivePerms);
    const scopeAllowed = ctx.targetOwnerId
      ? await this.checkDataScope(tenantId, userId, ctx.targetOwnerId, scope)
      : true; // No target = no scope check needed

    if (!scopeAllowed) {
      return this.denied(
        permissionKey,
        "Data scope does not include target entity"
      );
    }

    // Layer 3: Contextual condition evaluation
    const conditions = await this.getPermissionConditions(
      tenantId,
      ctx.resource,
      ctx.action
    );
    const conditionsMet = await this.evaluateConditions(conditions, ctx);
    if (!conditionsMet) {
      return this.denied(
        permissionKey,
        "Contextual condition not met (time/workflow/status restriction)"
      );
    }

    // Layer 4: Separation of duties
    const sodResult = await this.checkSoD(
      tenantId,
      userId,
      ctx.resource,
      ctx.action,
      ctx.metadata
    );
    const sodBlocking = sodResult.filter((v) => v.enforcement === "block");
    if (sodBlocking.length > 0) {
      return {
        allowed: false,
        requiresMfa: false,
        scopeAllowed: true,
        conditionsMet: true,
        sodClear: false,
        sensitivityAllowed: true,
        constraints: null,
        scope,
        reason: `Separation of duties violation: ${sodBlocking[0].ruleName}`,
        grantSources: effectivePerms.grantSources,
        sodViolations: sodResult,
      };
    }

    // Layer 5: Sensitivity tier gating
    // maxSensitivityTier is included in the granted result via effectivePerms
    // and enforced at field level by the FieldPermissionService

    return this.granted(permissionKey, effectivePerms, sodResult, scope);
  }

  // =========================================================================
  // Layer 1: Effective Permissions (cached)
  // =========================================================================

  private async getEffectivePermissions(
    tenantId: string,
    userId: string
  ): Promise<EffectivePermissionsCache | null> {
    const cacheKey = `perm:v2:${tenantId}:${userId}`;

    // Try cache first
    const cached = await this.cache.get(cacheKey) as EffectivePermissionsCache | null;
    if (cached) {
      return this.hydrateCachedPerms(cached);
    }

    // Load from DB
    const perms = await this.loadPermissionsFromDb(tenantId, userId);
    if (!perms) return null;

    // Cache for 15 minutes
    await this.cache.set(cacheKey, this.serializePerms(perms), 900);
    return perms;
  }

  private async loadPermissionsFromDb(
    tenantId: string,
    userId: string
  ): Promise<EffectivePermissionsCache | null> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx`
        SELECT
          r.name AS role_name,
          r.is_system,
          r.permissions AS role_permissions_cache,
          r.max_sensitivity_tier,
          r.portal_type,
          r.parent_role_id,
          ra.constraints,
          p.resource,
          p.action,
          p.requires_mfa
        FROM app.role_assignments ra
        JOIN app.roles r ON r.id = ra.role_id
        LEFT JOIN app.role_permissions rp ON rp.role_id = ra.role_id
        LEFT JOIN app.permissions p ON p.id = rp.permission_id
        WHERE ra.tenant_id = ${tenantId}::uuid
          AND ra.user_id = ${userId}::uuid
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
      `;
    });

    if (!rows || rows.length === 0) return null;

    const permissions = new Set<string>();
    const mfaRequired = new Set<string>();
    const scopes: DataScope[] = [];
    const grantSources: string[] = [];
    let isSuperAdmin = false;
    let isTenantAdmin = false;
    let maxSensitivityTier = 0;
    const portalTypes = new Set<string>();

    for (const row of rows) {
      const roleName = row.role_name;
      if (!grantSources.includes(roleName)) {
        grantSources.push(roleName);
      }

      if (roleName === "super_admin") isSuperAdmin = true;
      if (roleName === "tenant_admin") isTenantAdmin = true;
      if (row.portal_type) portalTypes.add(row.portal_type);

      maxSensitivityTier = Math.max(
        maxSensitivityTier,
        row.max_sensitivity_tier ?? 0
      );

      // Collect scope from constraints
      const constraints = row.constraints || {};
      const scopeType = (constraints.scope as ScopeType) || "self";
      scopes.push({
        scopeType,
        orgUnits: constraints.org_units,
        costCentres: constraints.cost_centers,
        locations: constraints.locations,
        legalEntities: constraints.legal_entity_ids,
        customScopeId: constraints.custom_scope_id,
        crossEntity: constraints.cross_entity,
      });

      // Collect permissions from role_permissions join
      if (row.resource && row.action) {
        const key = `${row.resource}:${row.action}`;
        permissions.add(key);
        if (row.requires_mfa) mfaRequired.add(key);
      }

      // Also collect from cached JSONB (for system roles without role_permissions rows)
      if (row.role_permissions_cache && typeof row.role_permissions_cache === "object") {
        for (const key of Object.keys(row.role_permissions_cache)) {
          if (row.role_permissions_cache[key] === true) {
            permissions.add(key);
          }
        }
      }
    }

    // Super admin and tenant admin get wildcard
    if (isSuperAdmin) permissions.add("*:*");
    if (isTenantAdmin) permissions.add("*:*");

    return {
      permissions,
      mfaRequired,
      scopes,
      grantSources,
      isSuperAdmin,
      isTenantAdmin,
      maxSensitivityTier,
      portalTypes,
    };
  }

  // =========================================================================
  // Layer 2: Data Scope Resolution
  // =========================================================================

  private resolveScope(perms: EffectivePermissionsCache): DataScope {
    // Find the broadest scope across all role assignments
    let maxScopeIdx = 0;
    let mergedScope: DataScope = { scopeType: "self" };

    for (const scope of perms.scopes) {
      const idx = SCOPE_HIERARCHY.indexOf(scope.scopeType);
      if (idx > maxScopeIdx) {
        maxScopeIdx = idx;
        mergedScope = { ...scope };
      }

      // Merge org units, locations, etc. (union)
      if (scope.orgUnits) {
        mergedScope.orgUnits = [
          ...new Set([...(mergedScope.orgUnits || []), ...scope.orgUnits]),
        ];
      }
      if (scope.costCentres) {
        mergedScope.costCentres = [
          ...new Set([
            ...(mergedScope.costCentres || []),
            ...scope.costCentres,
          ]),
        ];
      }
      if (scope.locations) {
        mergedScope.locations = [
          ...new Set([...(mergedScope.locations || []), ...scope.locations]),
        ];
      }
      if (scope.legalEntities) {
        mergedScope.legalEntities = [
          ...new Set([
            ...(mergedScope.legalEntities || []),
            ...scope.legalEntities,
          ]),
        ];
      }
    }

    mergedScope.scopeType = SCOPE_HIERARCHY[maxScopeIdx];
    return mergedScope;
  }

  private async checkDataScope(
    tenantId: string,
    userId: string,
    targetOwnerId: string,
    scope: DataScope
  ): Promise<boolean> {
    // Self always passes
    if (userId === targetOwnerId) return true;
    // 'all' scope always passes
    if (scope.scopeType === "all") return true;

    // For more specific scopes, query the DB
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx`
        SELECT EXISTS (
          SELECT 1 FROM app.resolve_user_data_scope(
            ${tenantId}::uuid, ${userId}::uuid
          ) scope
          JOIN app.employees e ON e.id = scope.employee_id
          WHERE e.user_id = ${targetOwnerId}::uuid
        ) AS in_scope
      `;
    });

    return rows?.[0]?.in_scope ?? false;
  }

  // =========================================================================
  // Layer 3: Contextual Conditions
  // =========================================================================

  private async getPermissionConditions(
    tenantId: string,
    resource: string,
    action: string
  ): Promise<PermissionCondition[]> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx`
        SELECT id, condition_type, resource, action, condition_params, effect, priority
        FROM app.permission_conditions
        WHERE (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
          AND resource = ${resource}
          AND action = ${action}
          AND is_active = true
        ORDER BY priority DESC
      `;
    });

    return (rows || []).map((r: any) => ({
      id: r.id,
      conditionType: r.condition_type,
      resource: r.resource,
      action: r.action,
      conditionParams: r.condition_params || {},
      effect: r.effect,
      priority: r.priority,
    }));
  }

  private async evaluateConditions(
    conditions: PermissionCondition[],
    ctx: PermissionCheckContext
  ): Promise<boolean> {
    for (const condition of conditions) {
      const result = this.evaluateSingleCondition(condition, ctx);
      if (condition.effect === "deny" && result) {
        // Condition matched and effect is deny → block
        return false;
      }
      if (condition.effect === "require" && !result) {
        // Condition not met and effect is require → block
        return false;
      }
    }
    return true;
  }

  private evaluateSingleCondition(
    condition: PermissionCondition,
    ctx: PermissionCheckContext
  ): boolean {
    const params = condition.conditionParams;

    switch (condition.conditionType) {
      case "workflow_state": {
        const allowedStates = params.allowed_states as string[] | undefined;
        if (!allowedStates || !ctx.workflowState) return false;
        return allowedStates.includes(ctx.workflowState);
      }

      case "employment_status": {
        const allowedStatuses = params.allowed_statuses as string[] | undefined;
        const currentStatus = ctx.metadata?.employmentStatus as
          | string
          | undefined;
        if (!allowedStatuses || !currentStatus) return false;
        return allowedStatuses.includes(currentStatus);
      }

      case "time_window": {
        const start = params.start ? new Date(params.start as string) : null;
        const end = params.end ? new Date(params.end as string) : null;
        const now = new Date();
        if (start && now < start) return false;
        if (end && now > end) return false;
        return true;
      }

      case "payroll_lock": {
        const denyWhenLocked = params.deny_when_locked as boolean;
        const isLocked = ctx.metadata?.payrollPeriodLocked as boolean;
        if (denyWhenLocked && isLocked) return true; // Condition triggers deny
        return false;
      }

      default:
        // Unknown condition type — fail-safe: don't block
        return false;
    }
  }

  // =========================================================================
  // Layer 4: Separation of Duties
  // =========================================================================

  private async checkSoD(
    tenantId: string,
    userId: string,
    resource: string,
    action: string,
    metadata?: Record<string, unknown>
  ): Promise<SoDViolation[]> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx`
        SELECT rule_id, rule_name, violation_type, enforcement, details
        FROM app.check_separation_of_duties(
          ${tenantId}::uuid,
          ${userId}::uuid,
          ${resource},
          ${action},
          ${JSON.stringify(metadata || {})}::jsonb
        )
      `;
    });

    return (rows || []).map((r: any) => ({
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      violationType: r.violation_type,
      enforcement: r.enforcement,
      details: r.details,
    }));
  }

  // =========================================================================
  // Permission Matching (with wildcards)
  // =========================================================================

  private matchPermission(key: string, permissions: Set<string>): boolean {
    // Direct match
    if (permissions.has(key)) return true;
    // Global wildcard
    if (permissions.has("*") || permissions.has("*:*")) return true;

    const parts = key.split(":");
    if (parts.length >= 2) {
      const resource = parts.slice(0, -1).join(":");
      const action = parts[parts.length - 1];
      // Resource wildcard: "employees:*"
      if (permissions.has(`${resource}:*`)) return true;
      // Action wildcard: "*:read"
      if (permissions.has(`*:${action}`)) return true;
    }

    return false;
  }

  // =========================================================================
  // Cache Helpers
  // =========================================================================

  private serializePerms(perms: EffectivePermissionsCache): object {
    return {
      permissions: Array.from(perms.permissions),
      mfaRequired: Array.from(perms.mfaRequired),
      scopes: perms.scopes,
      grantSources: perms.grantSources,
      isSuperAdmin: perms.isSuperAdmin,
      isTenantAdmin: perms.isTenantAdmin,
      maxSensitivityTier: perms.maxSensitivityTier,
      portalTypes: Array.from(perms.portalTypes),
    };
  }

  private hydrateCachedPerms(raw: any): EffectivePermissionsCache {
    return {
      permissions: new Set(raw.permissions || []),
      mfaRequired: new Set(raw.mfaRequired || []),
      scopes: raw.scopes || [],
      grantSources: raw.grantSources || [],
      isSuperAdmin: raw.isSuperAdmin || false,
      isTenantAdmin: raw.isTenantAdmin || false,
      maxSensitivityTier: raw.maxSensitivityTier || 0,
      portalTypes: new Set(raw.portalTypes || []),
    };
  }

  async invalidateUserCache(tenantId: string, userId: string): Promise<void> {
    await this.cache.del(`perm:v2:${tenantId}:${userId}`);
  }

  async invalidateTenantCache(tenantId: string): Promise<void> {
    // Scan and delete all perm:v2:{tenantId}:* keys
    const pattern = `perm:v2:${tenantId}:*`;
    const keys = await this.cache.keys?.(pattern);
    if (keys && keys.length > 0) {
      await Promise.all(keys.map((k: string) => this.cache.del(k)));
    }
  }

  // =========================================================================
  // Response Builders
  // =========================================================================

  private denied(
    permissionKey: string,
    reason: string
  ): PermissionCheckResult {
    return {
      allowed: false,
      requiresMfa: false,
      scopeAllowed: false,
      conditionsMet: false,
      sodClear: true,
      sensitivityAllowed: false,
      constraints: null,
      scope: null,
      reason,
      grantSources: [],
      sodViolations: [],
    };
  }

  private granted(
    permissionKey: string,
    perms: EffectivePermissionsCache,
    sodViolations: SoDViolation[],
    scope: DataScope
  ): PermissionCheckResult {
    return {
      allowed: true,
      requiresMfa: false,
      scopeAllowed: true,
      conditionsMet: true,
      sodClear: sodViolations.filter((v) => v.enforcement === "block").length === 0,
      sensitivityAllowed: true,
      constraints: scope as unknown as Record<string, unknown>,
      scope,
      grantSources: perms.grantSources,
      sodViolations: sodViolations.filter(
        (v) => v.enforcement === "warn" || v.enforcement === "audit"
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal Cache Type
// ---------------------------------------------------------------------------

interface EffectivePermissionsCache {
  permissions: Set<string>;
  mfaRequired: Set<string>;
  scopes: DataScope[];
  grantSources: string[];
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  maxSensitivityTier: number;
  portalTypes: Set<string>;
}
