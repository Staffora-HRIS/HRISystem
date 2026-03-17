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
   * Check if user is manager (includes all management-level roles)
   */
  const isManager = useMemo(() => {
    return (
      hasRole("manager") ||
      hasRole("line_manager") ||
      hasRole("team_leader") ||
      hasRole("department_head") ||
      hasRole("hr_admin") ||
      hasRole("hr_officer") ||
      hasRole("tenant_admin") ||
      hasRole("super_admin")
    );
  }, [hasRole]);

  /**
   * Check if user has a compliance role
   */
  const isComplianceOfficer = useMemo(() => {
    return hasRole("compliance_officer") || hasRole("tenant_admin") || hasRole("super_admin");
  }, [hasRole]);

  /**
   * Check if user has a payroll role
   */
  const isPayrollAdmin = useMemo(() => {
    return hasRole("payroll_admin") || hasRole("tenant_admin") || hasRole("super_admin");
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
    isComplianceOfficer,
    isPayrollAdmin,
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
  "/me/permissions": [],

  // Manager portal - requires manager role or specific permissions
  "/manager": ["team:read"],
  "/manager/team": ["team:read"],
  "/manager/approvals": ["time_entries:approve", "leave_requests:approve"],
  "/manager/schedules": ["schedules:read"],
  "/manager/performance": ["performance_reviews:read", "goals:read"],
  "/manager/team/access": ["employees:read"],

  // Admin - HR
  "/admin/dashboard": ["dashboards:read"],
  "/admin/hr": ["employees:read", "org_structure:view", "positions:read"],
  "/admin/hr/employees": ["employees:read"],
  "/admin/hr/positions": ["positions:read"],
  "/admin/hr/departments": ["departments:read"],
  "/admin/hr/organization": ["org_structure:view"],
  "/admin/hr/contracts": ["contracts:read"],
  "/admin/hr/probation": ["probation:read"],
  "/admin/hr/right-to-work": ["right_to_work:read"],
  "/admin/hr/warnings": ["warnings:read"],

  // Admin - Time & Attendance
  "/admin/time": ["time_entries:read", "timesheets:view_all"],
  "/admin/time/entries": ["time_entries:read"],
  "/admin/time/timesheets": ["timesheets:view_all"],
  "/admin/time/schedules": ["schedules:read"],
  "/admin/time/overtime": ["overtime:view_reports"],

  // Admin - Absence
  "/admin/absence": ["leave_requests:view_all"],
  "/admin/absence/requests": ["leave_requests:view_all"],
  "/admin/absence/types": ["leave_types:read"],
  "/admin/absence/policies": ["leave_policies:read"],
  "/admin/absence/balances": ["leave_balances:view_all"],
  "/admin/absence/ssp": ["ssp:read"],

  // Admin - Payroll
  "/admin/payroll": ["payroll_runs:read"],
  "/admin/payroll/runs": ["payroll_runs:read"],
  "/admin/payroll/elements": ["pay_elements:read"],
  "/admin/payroll/tax": ["tax_codes:view"],
  "/admin/payroll/pension": ["pension:view"],
  "/admin/payroll/payslips": ["payslips:view_all"],

  // Admin - Talent
  "/admin/talent": ["performance_reviews:read", "goals:read"],
  "/admin/talent/reviews": ["performance_reviews:read"],
  "/admin/talent/goals": ["goals:read"],
  "/admin/talent/competencies": ["competencies:view_matrix"],
  "/admin/talent/succession": ["succession:view_plans"],

  // Admin - Recruitment
  "/admin/recruitment": ["job_postings:read", "candidates:read"],
  "/admin/recruitment/postings": ["job_postings:read"],
  "/admin/recruitment/candidates": ["candidates:read"],
  "/admin/recruitment/interviews": ["interviews:view_feedback"],
  "/admin/recruitment/offers": ["offers:create"],
  "/admin/recruitment/agencies": ["agencies:read"],

  // Admin - LMS
  "/admin/lms": ["courses:read"],
  "/admin/lms/courses": ["courses:read"],
  "/admin/lms/paths": ["learning_paths:read"],
  "/admin/lms/certifications": ["certifications:verify"],
  "/admin/lms/mandatory": ["mandatory_training:track_compliance"],

  // Admin - Cases
  "/admin/cases": ["cases:read", "cases:view_all"],
  "/admin/cases/disciplinary": ["disciplinary:view"],
  "/admin/cases/grievances": ["grievances:view"],

  // Admin - Onboarding
  "/admin/onboarding": ["onboarding_templates:read"],
  "/admin/onboarding/templates": ["onboarding_templates:read"],
  "/admin/onboarding/instances": ["onboarding_instances:view"],

  // Admin - Documents
  "/admin/documents": ["documents:read"],
  "/admin/documents/templates": ["document_templates:read"],

  // Admin - Benefits
  "/admin/benefits": ["benefit_plans:read"],
  "/admin/benefits/plans": ["benefit_plans:read"],
  "/admin/benefits/enrollments": ["enrollments:view_all"],

  // Admin - Compliance
  "/admin/compliance": ["dsar:view", "data_breach:view_all", "audit_log:view"],
  "/admin/compliance/dsar": ["dsar:view"],
  "/admin/compliance/breaches": ["data_breach:view_all"],
  "/admin/compliance/consent": ["consent:view_audit"],
  "/admin/compliance/erasure": ["data_erasure:view_log"],
  "/admin/compliance/retention": ["data_retention:view_policies"],
  "/admin/compliance/gender-pay-gap": ["gender_pay_gap:view"],
  "/admin/compliance/diversity": ["diversity_monitoring:view_reports"],

  // Admin - Workflows
  "/admin/workflows": ["workflows:read"],
  "/admin/workflows/builder": ["workflows:write"],
  "/admin/workflows/templates": ["workflows:read"],

  // Admin - Reports & Analytics
  "/admin/reports": ["reports:view_standard"],
  "/admin/analytics": ["analytics:view_workforce"],

  // Admin - H&S
  "/admin/health-safety": ["incidents:view", "risk_assessments:view"],
  "/admin/health-safety/incidents": ["incidents:view"],
  "/admin/health-safety/risk": ["risk_assessments:view"],

  // Admin - Equipment
  "/admin/equipment": ["equipment:view"],

  // Admin - Headcount
  "/admin/headcount": ["headcount:view_plans"],

  // Admin - Security
  "/admin/security": ["users:read", "roles:read", "audit_log:view"],
  "/admin/security/users": ["users:read"],
  "/admin/security/roles": ["roles:read"],
  "/admin/security/permissions": ["roles:read"],
  "/admin/security/audit-log": ["audit_log:view"],
  "/admin/security/access-reviews": ["audit_log:view"],
  "/admin/security/alerts": ["audit_log:view"],
  "/admin/security/delegations": ["delegations:view"],
  "/admin/security/field-permissions": ["field_permissions:view"],

  // Admin - Settings
  "/admin/settings": ["settings:read"],
  "/admin/settings/tenant": ["settings:view"],
  "/admin/settings/integrations": ["settings:manage_integrations"],
  "/admin/settings/api-keys": ["api_keys:view"],
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
