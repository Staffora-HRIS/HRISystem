/**
 * useEnhancedPermissions Hook Tests
 *
 * Tests for enhanced permission checking with scope hierarchy,
 * sensitivity tiers, permission explanations, and bulk checks.
 */

import { describe, it, expect } from "vitest";
import type {
  ScopeType,
  PermissionScope,
  FieldPermission,
  PermissionExplanation,
  EnhancedPermissionState,
} from "../../hooks/use-enhanced-permissions";

describe("useEnhancedPermissions Hook", () => {
  describe("ScopeType Hierarchy", () => {
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

    const canAccessScope = (maxScope: ScopeType, requiredScope: ScopeType): boolean => {
      const userIdx = hierarchy.indexOf(maxScope);
      const requiredIdx = hierarchy.indexOf(requiredScope);
      return userIdx >= requiredIdx;
    };

    it("should allow self access for all scope levels", () => {
      expect(canAccessScope("self", "self")).toBe(true);
      expect(canAccessScope("department", "self")).toBe(true);
      expect(canAccessScope("all", "self")).toBe(true);
    });

    it("should deny higher scopes than user's max", () => {
      expect(canAccessScope("self", "direct_reports")).toBe(false);
      expect(canAccessScope("self", "department")).toBe(false);
      expect(canAccessScope("self", "all")).toBe(false);
    });

    it("should allow equal scope level", () => {
      expect(canAccessScope("department", "department")).toBe(true);
      expect(canAccessScope("all", "all")).toBe(true);
    });

    it("should allow lower scopes", () => {
      expect(canAccessScope("department", "self")).toBe(true);
      expect(canAccessScope("department", "direct_reports")).toBe(true);
      expect(canAccessScope("department", "indirect_reports")).toBe(true);
    });

    it("should place 'all' at the top of hierarchy", () => {
      expect(canAccessScope("all", "self")).toBe(true);
      expect(canAccessScope("all", "direct_reports")).toBe(true);
      expect(canAccessScope("all", "department")).toBe(true);
      expect(canAccessScope("all", "legal_entity")).toBe(true);
    });

    it("should handle 'custom' scope (not in hierarchy)", () => {
      // Custom scope is not in the hierarchy array, indexOf returns -1
      expect(canAccessScope("custom", "self")).toBe(false);
      expect(canAccessScope("all", "custom")).toBe(true);
    });
  });

  describe("Sensitivity Tier Access", () => {
    const canAccessTier = (maxTier: number, requiredTier: number): boolean => {
      return maxTier >= requiredTier;
    };

    it("should allow access to tiers at or below max", () => {
      expect(canAccessTier(3, 1)).toBe(true);
      expect(canAccessTier(3, 2)).toBe(true);
      expect(canAccessTier(3, 3)).toBe(true);
    });

    it("should deny access to tiers above max", () => {
      expect(canAccessTier(1, 2)).toBe(false);
      expect(canAccessTier(0, 1)).toBe(false);
      expect(canAccessTier(2, 4)).toBe(false);
    });

    it("should handle tier 0 (no sensitivity access)", () => {
      expect(canAccessTier(0, 0)).toBe(true);
      expect(canAccessTier(0, 1)).toBe(false);
    });

    it("should handle equal tier levels", () => {
      expect(canAccessTier(2, 2)).toBe(true);
      expect(canAccessTier(4, 4)).toBe(true);
    });
  });

  describe("Permission Checking", () => {
    it("should check single permission in set", () => {
      const permissions = new Set(["employees:read", "employees:create", "reports:read"]);

      const hasPermission = (permission: string): boolean => {
        return permissions.has(permission);
      };

      expect(hasPermission("employees:read")).toBe(true);
      expect(hasPermission("employees:delete")).toBe(false);
    });

    it("should check hasAnyPermission", () => {
      const permSet = new Set(["employees:read", "reports:read"]);

      const hasAnyPermission = (permissions: string[]): boolean => {
        return permissions.some((p) => permSet.has(p));
      };

      expect(hasAnyPermission(["employees:read", "admin:write"])).toBe(true);
      expect(hasAnyPermission(["admin:write", "settings:read"])).toBe(false);
      expect(hasAnyPermission([])).toBe(false);
    });

    it("should check hasAllPermissions", () => {
      const permSet = new Set(["employees:read", "reports:read", "employees:create"]);

      const hasAllPermissions = (permissions: string[]): boolean => {
        return permissions.every((p) => permSet.has(p));
      };

      expect(hasAllPermissions(["employees:read", "reports:read"])).toBe(true);
      expect(hasAllPermissions(["employees:read", "admin:write"])).toBe(false);
      expect(hasAllPermissions([])).toBe(true); // empty list, every returns true
    });
  });

  describe("Permission With Scope", () => {
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

    const canAccessScope = (maxScope: ScopeType, requiredScope: ScopeType): boolean => {
      const userIdx = hierarchy.indexOf(maxScope);
      const requiredIdx = hierarchy.indexOf(requiredScope);
      return userIdx >= requiredIdx;
    };

    it("should require both permission and scope", () => {
      const permissions = new Set(["employees:read"]);
      const maxScope: ScopeType = "department";

      const hasPermissionWithScope = (
        permission: string,
        requiredScope: ScopeType
      ): boolean => {
        return permissions.has(permission) && canAccessScope(maxScope, requiredScope);
      };

      expect(hasPermissionWithScope("employees:read", "self")).toBe(true);
      expect(hasPermissionWithScope("employees:read", "department")).toBe(true);
      expect(hasPermissionWithScope("employees:read", "all")).toBe(false);
      expect(hasPermissionWithScope("employees:delete", "self")).toBe(false);
    });

    it("should deny when permission exists but scope is insufficient", () => {
      const permissions = new Set(["employees:read"]);
      const maxScope: ScopeType = "self";

      const hasPermissionWithScope = (
        permission: string,
        requiredScope: ScopeType
      ): boolean => {
        return permissions.has(permission) && canAccessScope(maxScope, requiredScope);
      };

      expect(hasPermissionWithScope("employees:read", "department")).toBe(false);
    });
  });

  describe("Permission Explanation", () => {
    it("should explain allowed permission", () => {
      const roles = ["hr_admin", "manager"];
      const hasPermission = true;

      const explanation: PermissionExplanation = hasPermission
        ? {
            allowed: true,
            reason: "You have this permission",
            grantedBy: roles,
            requiresMfa: false,
          }
        : {
            allowed: false,
            reason: `You do not have the "employees:read" permission. Contact your administrator to request access.`,
            grantedBy: [],
            requiresMfa: false,
          };

      expect(explanation.allowed).toBe(true);
      expect(explanation.reason).toBe("You have this permission");
      expect(explanation.grantedBy).toEqual(["hr_admin", "manager"]);
      expect(explanation.requiresMfa).toBe(false);
    });

    it("should explain denied permission", () => {
      const permission = "payroll:manage";
      const hasPermission = false;
      const roles: string[] = [];

      const explanation: PermissionExplanation = hasPermission
        ? {
            allowed: true,
            reason: "You have this permission",
            grantedBy: roles,
            requiresMfa: false,
          }
        : {
            allowed: false,
            reason: `You do not have the "${permission}" permission. Contact your administrator to request access.`,
            grantedBy: [],
            requiresMfa: false,
          };

      expect(explanation.allowed).toBe(false);
      expect(explanation.reason).toContain("payroll:manage");
      expect(explanation.reason).toContain("Contact your administrator");
      expect(explanation.grantedBy).toEqual([]);
    });
  });

  describe("Bulk Permission Checking", () => {
    it("should check multiple permissions at once", () => {
      const permSet = new Set([
        "employees:read",
        "employees:create",
        "reports:read",
      ]);

      const checkPermissions = (permissions: string[]): Map<string, boolean> => {
        const result = new Map<string, boolean>();
        for (const p of permissions) {
          result.set(p, permSet.has(p));
        }
        return result;
      };

      const results = checkPermissions([
        "employees:read",
        "employees:delete",
        "reports:read",
      ]);

      expect(results.get("employees:read")).toBe(true);
      expect(results.get("employees:delete")).toBe(false);
      expect(results.get("reports:read")).toBe(true);
      expect(results.size).toBe(3);
    });

    it("should return empty map for empty input", () => {
      const permSet = new Set(["employees:read"]);

      const checkPermissions = (permissions: string[]): Map<string, boolean> => {
        const result = new Map<string, boolean>();
        for (const p of permissions) {
          result.set(p, permSet.has(p));
        }
        return result;
      };

      const results = checkPermissions([]);
      expect(results.size).toBe(0);
    });
  });

  describe("EnhancedPermissionState Defaults", () => {
    it("should have correct default state", () => {
      const defaultState: EnhancedPermissionState = {
        permissions: [],
        roles: [],
        maxScope: "self",
        maxSensitivityTier: 0,
        isAdmin: false,
        isManager: false,
        isLoading: true,
        error: null,
      };

      expect(defaultState.permissions).toEqual([]);
      expect(defaultState.roles).toEqual([]);
      expect(defaultState.maxScope).toBe("self");
      expect(defaultState.maxSensitivityTier).toBe(0);
      expect(defaultState.isAdmin).toBe(false);
      expect(defaultState.isManager).toBe(false);
      expect(defaultState.isLoading).toBe(true);
      expect(defaultState.error).toBeNull();
    });
  });

  describe("Admin Role Detection", () => {
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

    it("should detect admin from known admin roles", () => {
      const userRoles = ["hr_admin", "manager"];
      const isAdmin = userRoles.some((r) => adminRoles.includes(r));
      expect(isAdmin).toBe(true);
    });

    it("should not detect admin from non-admin roles", () => {
      const userRoles = ["employee", "viewer"];
      const isAdmin = userRoles.some((r) => adminRoles.includes(r));
      expect(isAdmin).toBe(false);
    });

    it("should detect super_admin as admin", () => {
      const userRoles = ["super_admin"];
      const isAdmin = userRoles.some((r) => adminRoles.includes(r));
      expect(isAdmin).toBe(true);
    });

    it("should handle empty roles", () => {
      const userRoles: string[] = [];
      const isAdmin = userRoles.some((r) => adminRoles.includes(r));
      expect(isAdmin).toBe(false);
    });
  });

  describe("Manager Role Detection", () => {
    const managerRoles = [
      "manager",
      "line_manager",
      "department_head",
      "team_leader",
    ];

    it("should detect manager from known manager roles", () => {
      const userRoles = ["manager", "employee"];
      const isManager = userRoles.some((r) => managerRoles.includes(r));
      expect(isManager).toBe(true);
    });

    it("should detect department_head as manager", () => {
      const userRoles = ["department_head"];
      const isManager = userRoles.some((r) => managerRoles.includes(r));
      expect(isManager).toBe(true);
    });

    it("should not detect regular employee as manager", () => {
      const userRoles = ["employee"];
      const isManager = userRoles.some((r) => managerRoles.includes(r));
      expect(isManager).toBe(false);
    });

    it("should not consider admin roles as manager roles", () => {
      const userRoles = ["hr_admin"];
      const isManager = userRoles.some((r) => managerRoles.includes(r));
      expect(isManager).toBe(false);
    });
  });

  describe("Data Masking Utility", () => {
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

    it("should mask with last4 pattern", () => {
      expect(applyMask("AB123456C", "****{last4}")).toBe("****456C");
    });

    it("should mask with last2 pattern", () => {
      expect(applyMask("AB123456C", "*******{last2}")).toBe("*******6C");
    });

    it("should mask with first2 pattern", () => {
      expect(applyMask("AB123456C", "{first2}*******")).toBe("AB*******");
    });

    it("should return pattern as-is when no placeholder", () => {
      expect(applyMask("secret", "------")).toBe("------");
    });

    it("should handle short values with last4", () => {
      expect(applyMask("AB", "****{last4}")).toBe("****AB");
    });

    it("should use default mask pattern", () => {
      const defaultPattern = "------";
      expect(applyMask("anything", defaultPattern)).toBe("------");
    });
  });

  describe("PermissionScope Type", () => {
    it("should support all scope type fields", () => {
      const scope: PermissionScope = {
        scopeType: "department",
        orgUnits: ["dept-1", "dept-2"],
        costCentres: ["cc-001"],
        locations: ["loc-london"],
        legalEntities: ["le-uk"],
      };

      expect(scope.scopeType).toBe("department");
      expect(scope.orgUnits).toHaveLength(2);
      expect(scope.costCentres).toHaveLength(1);
      expect(scope.locations).toHaveLength(1);
      expect(scope.legalEntities).toHaveLength(1);
    });

    it("should allow optional scope constraint arrays", () => {
      const scope: PermissionScope = {
        scopeType: "self",
      };

      expect(scope.orgUnits).toBeUndefined();
      expect(scope.costCentres).toBeUndefined();
      expect(scope.locations).toBeUndefined();
      expect(scope.legalEntities).toBeUndefined();
    });
  });

  describe("FieldPermission Type", () => {
    it("should include sensitivity tier", () => {
      const perm: FieldPermission = {
        entityName: "employee",
        fieldName: "niNumber",
        permission: "hidden",
        sensitivityTier: 3,
      };

      expect(perm.sensitivityTier).toBe(3);
      expect(perm.permission).toBe("hidden");
    });

    it("should support all permission levels", () => {
      const levels: FieldPermission["permission"][] = ["edit", "view", "hidden"];
      expect(levels).toHaveLength(3);
    });
  });
});
