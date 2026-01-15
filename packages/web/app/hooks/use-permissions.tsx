/**
 * Permission Hooks
 *
 * Features:
 * - useHasPermission(resource, action) - check single permission
 * - usePermissions() - get all permissions
 * - useCanAccessRoute(route) - check route access
 */

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { queryKeys } from "../lib/query-client";
import { useSession } from "../lib/auth";

// Permission string format: "resource:action" or "resource:subresource:action"
// Examples: "employees:read", "employees:salary:read", "admin:settings:write"

export interface PermissionsResponse {
  permissions: string[];
  roles: string[];
}

/**
 * Fetch user permissions from API
 */
async function fetchPermissions(): Promise<PermissionsResponse> {
  return api.get<PermissionsResponse>("/security/my-permissions");
}

/**
 * usePermissions hook - fetch and cache all user permissions
 */
export function usePermissions() {
  const { isAuthenticated } = useSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.auth.permissions(),
    queryFn: fetchPermissions,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const permissions = useMemo(() => data?.permissions ?? [], [data?.permissions]);
  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);

  /**
   * Check if user has a specific permission key.
   * Supports wildcards returned by the backend ("*", "resource:*", "*:*").
   */
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (permissions.includes("*")) return true;
      if (permissions.includes("*:*")) return true;
      if (permissions.includes(permission)) return true;

      const parts = permission.split(":");
      if (parts.length >= 2) {
        const resource = parts.slice(0, -1).join(":");
        const action = parts[parts.length - 1];

        if (permissions.includes(`${resource}:*`)) return true;
        if (permissions.includes(`*:${action}`)) return true;
      }

      return false;
    },
    [permissions]
  );

  /**
   * Check if user has permission for resource and action
   */
  const can = useCallback(
    (resource: string, action: string): boolean => {
      return hasPermission(`${resource}:${action}`);
    },
    [hasPermission]
  );

  /**
   * Check if user has any of the specified permissions
   */
  const canAny = useCallback(
    (permissionList: string[]): boolean => {
      return permissionList.some((p) => hasPermission(p));
    },
    [hasPermission]
  );

  /**
   * Check if user has all of the specified permissions
   */
  const canAll = useCallback(
    (permissionList: string[]): boolean => {
      return permissionList.every((p) => hasPermission(p));
    },
    [hasPermission]
  );

  /**
   * Check if user has a specific role
   */
  const hasRole = useCallback(
    (role: string): boolean => {
      return roles.includes(role);
    },
    [roles]
  );

  /**
   * Check if user has any of the specified roles
   */
  const hasAnyRole = useCallback(
    (roleList: string[]): boolean => {
      return roleList.some((r) => roles.includes(r));
    },
    [roles]
  );

  /**
   * Check if user is admin
   */
  const isAdmin = useMemo(() => {
    return (
      hasRole("super_admin") ||
      hasRole("tenant_admin") ||
      hasRole("hr_admin") ||
      hasPermission("*")
    );
  }, [hasRole, hasPermission]);

  /**
   * Check if user is manager
   */
  const isManager = useMemo(() => {
    return (
      hasRole("manager") ||
      hasRole("hr_admin") ||
      hasRole("tenant_admin") ||
      hasRole("super_admin")
    );
  }, [hasRole]);

  return {
    permissions,
    roles,
    isLoading,
    error,
    refetch,

    // Permission checks
    hasPermission,
    can,
    canAny,
    canAll,

    // Role checks
    hasRole,
    hasAnyRole,
    isAdmin,
    isManager,
  };
}

/**
 * useHasPermission hook - check a single permission
 */
export function useHasPermission(resource: string, action: string): boolean {
  const { can } = usePermissions();
  return can(resource, action);
}

/**
 * Route permission mapping
 */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Employee self-service - all authenticated users
  "/dashboard": [],
  "/me": [],
  "/me/profile": [],
  "/me/time": [],
  "/me/leave": [],
  "/me/benefits": [],
  "/me/documents": [],
  "/me/learning": [],
  "/me/cases": [],

  // Manager portal - requires manager role or specific permissions
  "/manager": ["team:read"],
  "/manager/team": ["team:read"],
  "/manager/approvals": ["time:approve", "absence:approve"],
  "/manager/schedules": ["time:read"],
  "/manager/performance": ["reports:read"],

  // Admin - HR
  "/admin/dashboard": ["dashboards:read"],
  "/admin/hr": ["employees:read", "org:read", "positions:read"],
  "/admin/hr/employees": ["employees:read"],
  "/admin/hr/positions": ["positions:read"],
  "/admin/hr/departments": ["org:read"],
  "/admin/hr/organization": ["org:read"],

  // Admin - Workflows
  "/admin/workflows": ["workflows:read"],
  "/admin/workflows/builder": ["workflows:write"],
  "/admin/workflows/templates": ["workflows:read"],

  // Admin - Security
  "/admin/security": ["users:read", "roles:read", "audit:read"],
  "/admin/security/users": ["users:read"],
  "/admin/security/roles": ["roles:read"],
  "/admin/security/permissions": ["roles:read"],
  "/admin/security/audit-log": ["audit:read"],

  // Admin - Reports
  "/admin/reports": ["reports:read"],

  // Admin - LMS
  "/admin/lms": ["courses:read"],
  "/admin/lms/courses": ["courses:read"],
  "/admin/lms/assignments": ["learning:assign"],

  // Admin - Settings
  "/admin/settings": ["settings:read"],
  "/admin/settings/tenant": ["tenant:read"],
  "/admin/settings/integrations": ["settings:read"],
};

/**
 * useCanAccessRoute hook - check if user can access a route
 */
export function useCanAccessRoute(route: string): { canAccess: boolean; isLoading: boolean } {
  const { canAny, isLoading, isAdmin } = usePermissions();

  const canAccess = useMemo(() => {
    // Admins can access everything
    if (isAdmin) return true;

    // Find matching route permission
    const requiredPermissions = ROUTE_PERMISSIONS[route];

    // If no permissions defined, route is public to authenticated users
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Check if user has any of the required permissions
    return canAny(requiredPermissions);
  }, [route, canAny, isAdmin]);

  return { canAccess, isLoading };
}

/**
 * useRoutePermissions hook - get permissions for route
 */
export function useRoutePermissions(route: string): string[] {
  return ROUTE_PERMISSIONS[route] ?? [];
}

/**
 * Permission component - conditionally render based on permissions
 */
interface PermissionGateProps {
  permission?: string;
  permissions?: string[];
  resource?: string;
  action?: string;
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  permission,
  permissions,
  resource,
  action,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { hasPermission, can, canAny, canAll, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (resource && action) {
    hasAccess = can(resource, action);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll ? canAll(permissions) : canAny(permissions);
  } else {
    // No permission specified, allow access
    hasAccess = true;
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
