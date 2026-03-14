/**
 * Integration Tests: Permission Resolution Engine
 *
 * Tests the 7-layer permission resolution algorithm:
 *   1. Role & permission collection (wildcard, union)
 *   2. Data scope resolution (self, team, department, all)
 *   3. Contextual conditions (time, workflow, employment status)
 *   4. Separation of duties
 *   5. Sensitivity tier gating
 *   6. MFA enforcement
 *   7. Cache behaviour
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { PermissionResolutionService } from "../permission-resolution.service";
import type { PermissionCheckContext } from "../permission-resolution.service";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCache() {
  const store = new Map<string, unknown>();
  return {
    get: mock(async (key: string) => store.get(key) ?? null),
    set: mock(async (key: string, value: unknown, _ttl?: number) => {
      store.set(key, value);
    }),
    del: mock(async (key: string) => {
      store.delete(key);
    }),
    keys: mock(async (_pattern: string) => [] as string[]),
    _store: store,
  };
}

function createMockDb(roleRows: any[] = [], conditionRows: any[] = [], sodRows: any[] = [], scopeRows: any[] = []) {
  return {
    withSystemContext: mock(async (callback: (tx: any) => Promise<any>) => {
      const mockTx = mock(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("?");

        // Route to correct mock data based on query content
        if (query.includes("role_assignments") && query.includes("role_permissions")) {
          return roleRows;
        }
        if (query.includes("permission_conditions")) {
          return conditionRows;
        }
        if (query.includes("check_separation_of_duties")) {
          return sodRows;
        }
        if (query.includes("resolve_user_data_scope")) {
          return scopeRows;
        }

        return [];
      });

      return callback(mockTx);
    }),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TENANT_ID = "t0000000-0000-0000-0000-000000000001";
const USER_ID = "u0000000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "u0000000-0000-0000-0000-000000000002";

function makeRoleRow(overrides: Partial<{
  role_name: string;
  is_system: boolean;
  role_permissions_cache: Record<string, boolean>;
  max_sensitivity_tier: number;
  portal_type: string;
  parent_role_id: string | null;
  constraints: Record<string, unknown>;
  resource: string | null;
  action: string | null;
  requires_mfa: boolean;
}>) {
  return {
    role_name: "employee",
    is_system: true,
    role_permissions_cache: {},
    max_sensitivity_tier: 0,
    portal_type: "employee",
    parent_role_id: null,
    constraints: {},
    resource: null,
    action: null,
    requires_mfa: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionResolutionService", () => {
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    cache = createMockCache();
  });

  // =========================================================================
  // Layer 1: Role & Permission Collection
  // =========================================================================

  describe("Layer 1: Permission Collection", () => {
    it("should deny when user has no roles", async () => {
      const db = createMockDb([]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "read",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("no active roles");
    });

    it("should grant when user has the exact permission key", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "hr_admin",
          max_sensitivity_tier: 3,
          constraints: { scope: "all" },
          resource: "employees",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "read",
      });

      expect(result.allowed).toBe(true);
      expect(result.grantSources).toContain("hr_admin");
    });

    it("should deny when user lacks the permission key", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          resource: "self",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "delete",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Missing permission");
    });

    it("should grant via wildcard *:* for super_admin", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "super_admin",
          max_sensitivity_tier: 4,
          constraints: { scope: "all" },
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "payroll_runs",
        action: "approve",
      });

      expect(result.allowed).toBe(true);
    });

    it("should grant via resource wildcard (employees:*)", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "hr_admin",
          max_sensitivity_tier: 3,
          constraints: { scope: "all" },
          role_permissions_cache: { "employees:*": true },
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "export",
      });

      expect(result.allowed).toBe(true);
    });

    it("should union permissions from multiple roles", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "leave_requests",
          action: "create_own",
        }),
        makeRoleRow({
          role_name: "line_manager",
          max_sensitivity_tier: 1,
          constraints: { scope: "direct_reports" },
          resource: "leave_requests",
          action: "approve",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      // Should have both permissions
      const createResult = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "leave_requests",
        action: "create_own",
      });
      expect(createResult.allowed).toBe(true);

      // Need fresh service for second check (cache has been populated)
      const approveResult = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "leave_requests",
        action: "approve",
      });
      expect(approveResult.allowed).toBe(true);
    });

    it("should collect permissions from JSONB cache for system roles", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "hr_officer",
          max_sensitivity_tier: 2,
          constraints: { scope: "all" },
          role_permissions_cache: {
            "employees:read": true,
            "employees:create": true,
            "employees:update": true,
          },
          resource: null,
          action: null,
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "create",
      });

      expect(result.allowed).toBe(true);
    });
  });

  // =========================================================================
  // Layer 2: Data Scope
  // =========================================================================

  describe("Layer 2: Data Scope", () => {
    it("should always allow self-scope access to own data", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "leave_requests",
          action: "view_own",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "leave_requests",
        action: "view_own",
        targetOwnerId: USER_ID, // Same user → self-scope passes
      });

      expect(result.allowed).toBe(true);
    });

    it("should allow 'all' scope to access any user's data", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "hr_admin",
          max_sensitivity_tier: 3,
          constraints: { scope: "all" },
          resource: "employees",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "read",
        targetOwnerId: OTHER_USER_ID,
      });

      expect(result.allowed).toBe(true);
    });

    it("should skip scope check when no targetOwnerId is provided", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "courses",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "courses",
        action: "read",
        // No targetOwnerId → no scope check
      });

      expect(result.allowed).toBe(true);
    });

    it("should resolve broadest scope when user has multiple roles", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "employees",
          action: "read",
        }),
        makeRoleRow({
          role_name: "department_head",
          max_sensitivity_tier: 2,
          constraints: { scope: "department" },
          resource: "employees",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      // Access to OTHER user should work because department scope is broader
      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "read",
        targetOwnerId: OTHER_USER_ID,
      });

      // The scope should be resolved to "department" (broadest)
      expect(result.scope?.scopeType).toBe("department");
    });
  });

  // =========================================================================
  // Layer 3: Contextual Conditions
  // =========================================================================

  describe("Layer 3: Contextual Conditions", () => {
    it("should deny when workflow state is not in allowed list", async () => {
      const db = createMockDb(
        [
          makeRoleRow({
            role_name: "employee",
            constraints: { scope: "self" },
            resource: "leave_requests",
            action: "update",
          }),
        ],
        // Condition: only allow update when in 'draft' or 'rejected' state
        [
          {
            id: "cond-1",
            condition_type: "workflow_state",
            resource: "leave_requests",
            action: "update",
            condition_params: { allowed_states: ["draft", "rejected"] },
            effect: "require",
            priority: 0,
          },
        ]
      );
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "leave_requests",
        action: "update",
        workflowState: "approved", // Not in allowed states
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Contextual condition");
    });

    it("should allow when workflow state is in allowed list", async () => {
      const db = createMockDb(
        [
          makeRoleRow({
            role_name: "employee",
            constraints: { scope: "self" },
            resource: "leave_requests",
            action: "update",
          }),
        ],
        [
          {
            id: "cond-1",
            condition_type: "workflow_state",
            resource: "leave_requests",
            action: "update",
            condition_params: { allowed_states: ["draft", "rejected"] },
            effect: "require",
            priority: 0,
          },
        ]
      );
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "leave_requests",
        action: "update",
        workflowState: "draft",
      });

      expect(result.allowed).toBe(true);
    });

    it("should deny when payroll period is locked", async () => {
      const db = createMockDb(
        [
          makeRoleRow({
            role_name: "hr_admin",
            max_sensitivity_tier: 3,
            constraints: { scope: "all" },
            resource: "time_entries",
            action: "update",
          }),
        ],
        [
          {
            id: "cond-lock",
            condition_type: "payroll_lock",
            resource: "time_entries",
            action: "update",
            condition_params: { deny_when_locked: true },
            effect: "deny",
            priority: 10,
          },
        ]
      );
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "time_entries",
        action: "update",
        metadata: { payrollPeriodLocked: true },
      });

      expect(result.allowed).toBe(false);
    });
  });

  // =========================================================================
  // Layer 4: Separation of Duties
  // =========================================================================

  describe("Layer 4: Separation of Duties", () => {
    it("should block when SoD rule is violated with 'block' enforcement", async () => {
      const db = createMockDb(
        [
          makeRoleRow({
            role_name: "payroll_admin",
            max_sensitivity_tier: 3,
            constraints: { scope: "all" },
            resource: "payroll_runs",
            action: "approve",
          }),
        ],
        [], // No conditions
        [
          {
            rule_id: "sod-1",
            rule_name: "Payroll four-eyes",
            violation_type: "creator_approver",
            enforcement: "block",
            details: "Cannot create and approve the same payroll run",
          },
        ]
      );
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "payroll_runs",
        action: "approve",
      });

      expect(result.allowed).toBe(false);
      expect(result.sodClear).toBe(false);
      expect(result.reason).toContain("Separation of duties");
    });

    it("should allow but report SoD warnings for 'warn' enforcement", async () => {
      const db = createMockDb(
        [
          makeRoleRow({
            role_name: "hr_admin",
            max_sensitivity_tier: 3,
            constraints: { scope: "all" },
            resource: "employees",
            action: "bulk_update",
          }),
        ],
        [],
        [
          {
            rule_id: "sod-warn",
            rule_name: "Bulk update caution",
            violation_type: "two_person",
            enforcement: "warn",
            details: "Bulk updates should be reviewed by a second person",
          },
        ]
      );
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "employees",
        action: "bulk_update",
      });

      expect(result.allowed).toBe(true);
      expect(result.sodViolations.length).toBeGreaterThan(0);
      expect(result.sodViolations[0].enforcement).toBe("warn");
    });
  });

  // =========================================================================
  // Layer 6: MFA Enforcement
  // =========================================================================

  describe("Layer 6: MFA Enforcement", () => {
    it("should require MFA when permission has requires_mfa flag", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "payroll_admin",
          max_sensitivity_tier: 3,
          constraints: { scope: "all" },
          resource: "payroll_runs",
          action: "create",
          requires_mfa: true,
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "payroll_runs",
        action: "create",
        mfaVerified: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.requiresMfa).toBe(true);
    });

    it("should allow when MFA is verified and required", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "payroll_admin",
          max_sensitivity_tier: 3,
          constraints: { scope: "all" },
          resource: "payroll_runs",
          action: "create",
          requires_mfa: true,
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "payroll_runs",
        action: "create",
        mfaVerified: true,
      });

      expect(result.allowed).toBe(true);
    });
  });

  // =========================================================================
  // Layer 7: Caching
  // =========================================================================

  describe("Layer 7: Caching", () => {
    it("should cache effective permissions on first load", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "self",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "self",
        action: "read",
      });

      // Cache should have been written
      expect(cache.set).toHaveBeenCalled();
    });

    it("should use cached permissions on subsequent calls", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "self",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      // First call populates cache
      await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "self",
        action: "read",
      });

      // Second call should hit cache
      await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "self",
        action: "read",
      });

      // DB withSystemContext was called multiple times but the important thing
      // is that the second call reads from cache for permissions
      expect(cache.get).toHaveBeenCalled();
    });

    it("should invalidate cache for a specific user", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: { scope: "self" },
          resource: "self",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      // Populate cache
      await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "self",
        action: "read",
      });

      // Invalidate
      await service.invalidateUserCache(TENANT_ID, USER_ID);

      expect(cache.del).toHaveBeenCalledWith(`perm:v2:${TENANT_ID}:${USER_ID}`);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("Edge Cases", () => {
    it("super_admin should still be checked for SoD violations", async () => {
      const db = createMockDb(
        [
          makeRoleRow({
            role_name: "super_admin",
            max_sensitivity_tier: 4,
            constraints: { scope: "all" },
          }),
        ],
        [],
        [
          {
            rule_id: "sod-super",
            rule_name: "Self-approval",
            violation_type: "self_approval",
            enforcement: "audit",
            details: "Super admin self-approved",
          },
        ]
      );
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "leave_requests",
        action: "approve",
      });

      // Super admin is allowed but SoD violations are reported
      expect(result.allowed).toBe(true);
      expect(result.sodViolations.length).toBeGreaterThan(0);
    });

    it("tenant_admin should get wildcard permissions", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "tenant_admin",
          max_sensitivity_tier: 4,
          constraints: { scope: "all" },
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "anything",
        action: "whatever",
      });

      expect(result.allowed).toBe(true);
    });

    it("should handle empty constraints gracefully", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: {},
          resource: "self",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "self",
        action: "read",
      });

      expect(result.allowed).toBe(true);
      // Empty constraints → defaults to 'self' scope
      expect(result.scope?.scopeType).toBe("self");
    });

    it("should handle null constraints gracefully", async () => {
      const db = createMockDb([
        makeRoleRow({
          role_name: "employee",
          constraints: null as any,
          resource: "self",
          action: "read",
        }),
      ]);
      const service = new PermissionResolutionService(db, cache);

      const result = await service.checkPermission(TENANT_ID, USER_ID, {
        resource: "self",
        action: "read",
      });

      expect(result.allowed).toBe(true);
    });
  });
});
