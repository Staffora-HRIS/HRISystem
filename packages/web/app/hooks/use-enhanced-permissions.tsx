/**
 * Enhanced Permission Hooks & Components (v2)
 *
 * Extends the existing usePermissions() hook with:
 * - Data scope awareness (self, team, department, all)
 * - Sensitivity tier gating
 * - Field-level permission checks
 * - Permission explanation tooltips
 * - Bulk permission checking for UI rendering
 *
 * Backwards-compatible: existing usePermissions() and PermissionGate
 * continue to work. These are additive enhancements.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { usePermissions } from "./use-permissions";

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

export interface PermissionScope {
  scopeType: ScopeType;
  orgUnits?: string[];
  costCentres?: string[];
  locations?: string[];
  legalEntities?: string[];
}

export interface FieldPermission {
  entityName: string;
  fieldName: string;
  permission: "edit" | "view" | "hidden";
  sensitivityTier: number;
}

export interface PermissionExplanation {
  allowed: boolean;
  reason: string;
  grantedBy: string[];
  scope?: PermissionScope;
  requiresMfa: boolean;
}

export interface EnhancedPermissionState {
  /** All granted permission keys */
  permissions: string[];
  /** User's active role names */
  roles: string[];
  /** Maximum data scope across all roles */
  maxScope: ScopeType;
  /** Maximum sensitivity tier accessible */
  maxSensitivityTier: number;
  /** Whether the user is any kind of admin */
  isAdmin: boolean;
  /** Whether the user is a manager of any level */
  isManager: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EnhancedPermissionContext = createContext<EnhancedPermissionState>({
  permissions: [],
  roles: [],
  maxScope: "self",
  maxSensitivityTier: 0,
  isAdmin: false,
  isManager: false,
  isLoading: true,
  error: null,
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Enhanced permissions hook with scope and tier awareness.
 *
 * Usage:
 * ```tsx
 * const { hasPermission, canAccessScope, maxSensitivityTier } = useEnhancedPermissions();
 *
 * if (hasPermission('employees:read') && canAccessScope('department')) {
 *   // Show department-level employee list
 * }
 * ```
 */
export function useEnhancedPermissions() {
  const base = usePermissions();
  const ctx = useContext(EnhancedPermissionContext);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      return base.hasPermission(permission);
    },
    [base]
  );

  const hasAnyPermission = useCallback(
    (permissions: string[]): boolean => {
      return permissions.some((p) => base.hasPermission(p));
    },
    [base]
  );

  const hasAllPermissions = useCallback(
    (permissions: string[]): boolean => {
      return permissions.every((p) => base.hasPermission(p));
    },
    [base]
  );

  /**
   * Check if the user's scope includes the given scope level.
   * A scope of "all" includes everything; "department" includes
   * "direct_reports" and "self", etc.
   */
  const canAccessScope = useCallback(
    (requiredScope: ScopeType): boolean => {
      const hierarchy: ScopeType[] = [
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
      const userIdx = hierarchy.indexOf(ctx.maxScope);
      const requiredIdx = hierarchy.indexOf(requiredScope);
      return userIdx >= requiredIdx;
    },
    [ctx.maxScope]
  );

  /**
   * Check if the user can access data of the given sensitivity tier.
   */
  const canAccessTier = useCallback(
    (tier: number): boolean => {
      return ctx.maxSensitivityTier >= tier;
    },
    [ctx.maxSensitivityTier]
  );

  /**
   * Check a permission with scope requirement.
   * Returns true only if the user has both the permission AND
   * sufficient data scope.
   */
  const hasPermissionWithScope = useCallback(
    (permission: string, requiredScope: ScopeType): boolean => {
      return hasPermission(permission) && canAccessScope(requiredScope);
    },
    [hasPermission, canAccessScope]
  );

  /**
   * Get a human-readable explanation of why a permission is granted or denied.
   * Useful for tooltips on disabled buttons.
   */
  const explainPermission = useCallback(
    (permission: string): PermissionExplanation => {
      const allowed = hasPermission(permission);
      if (allowed) {
        return {
          allowed: true,
          reason: "You have this permission",
          grantedBy: ctx.roles,
          requiresMfa: false,
        };
      }
      return {
        allowed: false,
        reason: `You do not have the "${permission}" permission. Contact your administrator to request access.`,
        grantedBy: [],
        requiresMfa: false,
      };
    },
    [hasPermission, ctx.roles]
  );

  /**
   * Bulk check multiple permissions at once.
   * Returns a map of permission key → boolean.
   * Useful for rendering complex UIs where many elements
   * depend on different permissions.
   */
  const checkPermissions = useCallback(
    (permissions: string[]): Map<string, boolean> => {
      const result = new Map<string, boolean>();
      for (const p of permissions) {
        result.set(p, hasPermission(p));
      }
      return result;
    },
    [hasPermission]
  );

  return {
    ...ctx,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessScope,
    canAccessTier,
    hasPermissionWithScope,
    explainPermission,
    checkPermissions,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Enhanced permission gate with scope and tier awareness.
 *
 * Usage:
 * ```tsx
 * <EnhancedPermissionGate
 *   permission="employees:view_salary"
 *   minTier={2}
 *   scope="department"
 *   fallback={<p>You don't have access to salary data.</p>}
 * >
 *   <SalaryTable />
 * </EnhancedPermissionGate>
 * ```
 */
export function EnhancedPermissionGate({
  permission,
  permissions,
  requireAll = false,
  scope,
  minTier,
  fallback = null,
  disabledFallback,
  children,
}: {
  /** Single permission to check */
  permission?: string;
  /** Multiple permissions to check */
  permissions?: string[];
  /** If true, ALL permissions must be granted. Default: any one is sufficient */
  requireAll?: boolean;
  /** Required data scope level */
  scope?: ScopeType;
  /** Minimum sensitivity tier required */
  minTier?: number;
  /** What to render when denied (default: nothing) */
  fallback?: ReactNode;
  /** What to render as disabled state (shows children but disabled) */
  disabledFallback?: (children: ReactNode, reason: string) => ReactNode;
  children: ReactNode;
}) {
  const {
    hasAnyPermission,
    hasAllPermissions,
    canAccessScope,
    canAccessTier,
    explainPermission,
  } = useEnhancedPermissions();

  const permCheck = useMemo(() => {
    // Collect all permissions to check
    const permsToCheck = [
      ...(permission ? [permission] : []),
      ...(permissions || []),
    ];

    if (permsToCheck.length === 0) return true;

    if (requireAll) {
      return hasAllPermissions(permsToCheck);
    }
    return hasAnyPermission(permsToCheck);
  }, [permission, permissions, requireAll, hasAnyPermission, hasAllPermissions]);

  const scopeCheck = useMemo(() => {
    if (!scope) return true;
    return canAccessScope(scope);
  }, [scope, canAccessScope]);

  const tierCheck = useMemo(() => {
    if (minTier === undefined) return true;
    return canAccessTier(minTier);
  }, [minTier, canAccessTier]);

  const allowed = permCheck && scopeCheck && tierCheck;

  if (!allowed) {
    if (disabledFallback) {
      const reason = !permCheck
        ? explainPermission(permission || permissions?.[0] || "").reason
        : !scopeCheck
          ? `Requires ${scope} data access scope`
          : `Requires sensitivity tier ${minTier}`;
      return <>{disabledFallback(children, reason)}</>;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Renders a field value with masking based on sensitivity tier.
 *
 * Usage:
 * ```tsx
 * <SensitiveField
 *   value={employee.niNumber}
 *   tier={3}
 *   maskPattern="****{last4}"
 * />
 * ```
 */
export function SensitiveField({
  value,
  tier,
  maskPattern = "••••••",
  permission,
  className,
}: {
  /** The actual value to display */
  value: string | number | null | undefined;
  /** Sensitivity tier of this field (0-4) */
  tier: number;
  /** Mask pattern: use {last4} for last 4 chars, {first2} for first 2, etc. */
  maskPattern?: string;
  /** Optional: specific permission needed to view this field */
  permission?: string;
  /** CSS class */
  className?: string;
}) {
  const enhanced = useEnhancedPermissions();

  if (value === null || value === undefined) {
    return <span className={className}>—</span>;
  }

  const canView =
    enhanced.canAccessTier(tier) && (!permission || enhanced.hasPermission(permission));

  if (!canView) {
    const masked = applyMask(String(value), maskPattern);
    return (
      <span className={className} title="Insufficient access to view this field">
        {masked}
      </span>
    );
  }

  return <span className={className}>{String(value)}</span>;
}

/**
 * Provider that supplies enhanced permission context to the tree.
 * Wrap your app or a section with this to enable scope/tier checks.
 */
export function EnhancedPermissionProvider({
  children,
  maxScope = "self",
  maxSensitivityTier = 0,
}: {
  children: ReactNode;
  maxScope?: ScopeType;
  maxSensitivityTier?: number;
}) {
  const base = usePermissions();

  const state = useMemo<EnhancedPermissionState>(() => {
    const adminRoles = [
      "super_admin",
      "tenant_admin",
      "hr_admin",
      "payroll_admin",
      "recruitment_admin",
      "lms_admin",
      "compliance_officer",
      "health_safety_officer",
    ];
    const managerRoles = [
      "manager",
      "line_manager",
      "department_head",
      "team_leader",
    ];

    return {
      permissions: base.permissions,
      roles: base.roles,
      maxScope,
      maxSensitivityTier,
      isAdmin: base.roles.some((r) => adminRoles.includes(r)),
      isManager: base.roles.some((r) => managerRoles.includes(r)),
      isLoading: base.isLoading,
      error: null,
    };
  }, [base.permissions, base.roles, base.isLoading, maxScope, maxSensitivityTier]);

  return (
    <EnhancedPermissionContext.Provider value={state}>
      {children}
    </EnhancedPermissionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Utility: Data Masking
// ---------------------------------------------------------------------------

function applyMask(value: string, pattern: string): string {
  if (pattern.includes("{last4}")) {
    const last4 = value.slice(-4);
    return pattern.replace("{last4}", last4);
  }
  if (pattern.includes("{last2}")) {
    const last2 = value.slice(-2);
    return pattern.replace("{last2}", last2);
  }
  if (pattern.includes("{first2}")) {
    const first2 = value.slice(0, 2);
    return pattern.replace("{first2}", first2);
  }
  return pattern;
}
