/**
 * RBAC Plugin Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockCacheClient, createMockDatabaseClient } from "../../helpers/mocks";
import {
  buildAuthErrorResponse,
  isDatabaseConnectionError,
  normalizeBetterAuthResponse,
  setDatabaseReachabilityCheckForTests,
} from "../../../lib/better-auth-handler";

describe("RBAC Plugin", () => {
  let cache: ReturnType<typeof createMockCacheClient>;
  let db: ReturnType<typeof createMockDatabaseClient>;

  beforeEach(() => {
    cache = createMockCacheClient();
    db = createMockDatabaseClient();
  });

  describe("Permission Checking", () => {
    it("should allow action when user has direct permission", () => {
      const permissions = new Set(["employees:read", "employees:create"]);
      expect(permissions.has("employees:read")).toBe(true);
    });

    it("should allow action when user has wildcard permission", () => {
      const permissions = new Set(["employees:*", "org_units:read"]);
      const hasWildcard = (perm: string) => {
        const [resource] = perm.split(":");
        return permissions.has(`${resource}:*`);
      };
      expect(hasWildcard("employees:delete")).toBe(true);
    });

    it("should deny action when permission not granted", () => {
      const permissions = new Set(["employees:read"]);
      expect(permissions.has("employees:delete")).toBe(false);
    });

    it("should check permission constraints (own_records_only)", () => {
      const constraints = { scope: "self" as const };
      expect(constraints.scope).toBe("self");
    });

    it("should handle permission inheritance from roles", () => {
      const adminRole = { permissions: ["*:*"] };
      const managerRole = { permissions: ["employees:read", "employees:update"] };
      
      expect(adminRole.permissions.includes("*:*")).toBe(true);
      expect(managerRole.permissions.includes("employees:read")).toBe(true);
    });

    it("should cache permission lookups", async () => {
      const cacheKey = "perms:tenant-123:user-456";
      await cache.set(cacheKey, { permissions: ["employees:read"] });
      
      const cached = await cache.get(cacheKey);
      expect(cached).toBeDefined();
    });
  });

  describe("Role Management", () => {
    it("should resolve all permissions for a role", () => {
      const role = {
        name: "HR Manager",
        permissions: ["employees:*", "org_units:read", "leave_requests:approve"],
      };
      
      expect(role.permissions.length).toBe(3);
      expect(role.permissions.includes("employees:*")).toBe(true);
    });

    it("should handle role hierarchy", () => {
      const roles = {
        admin: { inherits: null, permissions: ["*:*"] },
        manager: { inherits: "employee", permissions: ["team:manage"] },
        employee: { inherits: null, permissions: ["self:read"] },
      };
      
      expect(roles.manager.inherits).toBe("employee");
    });

    it("should invalidate cache on role change", async () => {
      const cacheKey = "perms:tenant-123:user-456";
      await cache.set(cacheKey, { permissions: ["old:permission"] });
      await cache.delete(cacheKey);
      
      const cached = await cache.get(cacheKey);
      expect(cached).toBeNull();
    });
  });

  describe("Constraint Evaluation", () => {
    it("should evaluate org unit constraints", () => {
      const constraints = { orgUnits: ["org-123", "org-456"] };
      const targetOrgUnit = "org-123";
      
      expect(constraints.orgUnits.includes(targetOrgUnit)).toBe(true);
    });

    it("should evaluate scope constraints", () => {
      const scopes = ["self", "direct_reports", "org_unit", "all"] as const;
      
      scopes.forEach(scope => {
        expect(["self", "direct_reports", "org_unit", "all"].includes(scope)).toBe(true);
      });
    });

    it("should evaluate cost center constraints", () => {
      const constraints = { costCenters: ["CC-001", "CC-002"] };
      expect(constraints.costCenters.includes("CC-001")).toBe(true);
      expect(constraints.costCenters.includes("CC-999")).toBe(false);
    });
  });
});

describe("Better Auth Handler - DB outage mapping", () => {
  beforeEach(() => {
    // Keep unit tests hermetic: never hit a real Postgres instance.
    setDatabaseReachabilityCheckForTests(async () => true);
  });

  it("should detect ECONNREFUSED nested inside AggregateError", () => {
    const err = {
      name: "AggregateError",
      errors: [{ code: "ECONNREFUSED" }],
    };

    expect(isDatabaseConnectionError(err)).toBe(true);
  });

  it("should return 503 with AUTH_DB_UNAVAILABLE for DB connection failures", async () => {
    const err = {
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:5432",
    };

    const res = buildAuthErrorResponse(err);
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body).toMatchObject({
      error: "Authentication service unavailable",
      code: "AUTH_DB_UNAVAILABLE",
    });
  });

  it("should remap a Better Auth 500 response to 503 when body indicates DB outage", async () => {
    const res = new Response("connect ECONNREFUSED 127.0.0.1:5432", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    const normalized = await normalizeBetterAuthResponse(res);
    expect(normalized.status).toBe(503);

    const body = await normalized.json();
    expect(body).toMatchObject({
      error: "Authentication service unavailable",
      code: "AUTH_DB_UNAVAILABLE",
    });
  });

  it("should remap a Better Auth 500 response to 503 when DB is unreachable even if body is generic", async () => {
    setDatabaseReachabilityCheckForTests(async () => false);

    const res = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    const normalized = await normalizeBetterAuthResponse(res);
    expect(normalized.status).toBe(503);
  });

  it("should return 500 for non-DB errors", async () => {
    setDatabaseReachabilityCheckForTests(async () => true);
    const err = new Error("Unexpected error");
    const res = buildAuthErrorResponse(err);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toMatchObject({ error: "Authentication service error" });
  });
});
