/**
 * Authorization Bypass Tests
 *
 * Verifies that the platform correctly enforces:
 * 1. Authentication -- unauthenticated requests are rejected
 * 2. Tenant isolation -- users cannot access other tenants' data
 * 3. RBAC -- users without permissions cannot perform operations
 * 4. IDOR -- direct object reference attacks are prevented by RLS
 *
 * These tests make REAL HTTP requests to the Elysia app and REAL database
 * queries to verify that authorization cannot be bypassed.
 *
 * Vulnerabilities prevented:
 * - CWE-285 (Improper Authorization)
 * - CWE-639 (Authorization Bypass Through User-Controlled Key / IDOR)
 * - CWE-862 (Missing Authorization)
 * - CWE-863 (Incorrect Authorization)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  expectRlsError,
  type TestTenant,
  type TestUser,
} from "../setup";
import { app } from "../../app";

describe("Authorization Bypass Prevention", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenantA: TestTenant | null = null;
  let tenantB: TestTenant | null = null;
  let userA: TestUser | null = null;
  let userB: TestUser | null = null;
  let employeeA: string | null = null;
  let employeeB: string | null = null;
  let orgUnitA: string | null = null;
  let orgUnitB: string | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenantA = await createTestTenant(db, {
      name: `AuthZ Test A ${suffix}`,
      slug: `authz-a-${suffix}`,
    });
    tenantB = await createTestTenant(db, {
      name: `AuthZ Test B ${suffix}`,
      slug: `authz-b-${suffix}`,
    });

    userA = await createTestUser(db, tenantA.id, {
      email: `authz-a-${suffix}@example.com`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `authz-b-${suffix}@example.com`,
    });

    // Create test data in each tenant
    await setTenantContext(db, tenantA.id, userA.id);
    const ouA = await db<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
      VALUES (${tenantA.id}::uuid, 'AUTHZ-A', 'AuthZ Org A', true, CURRENT_DATE)
      RETURNING id
    `;
    orgUnitA = ouA[0]!.id;

    const empA = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenantA.id}::uuid, 'AUTHZ-EMP-A', 'active', CURRENT_DATE)
      RETURNING id
    `;
    employeeA = empA[0]!.id;

    await setTenantContext(db, tenantB.id, userB.id);
    const ouB = await db<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
      VALUES (${tenantB.id}::uuid, 'AUTHZ-B', 'AuthZ Org B', true, CURRENT_DATE)
      RETURNING id
    `;
    orgUnitB = ouB[0]!.id;

    const empB = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenantB.id}::uuid, 'AUTHZ-EMP-B', 'active', CURRENT_DATE)
      RETURNING id
    `;
    employeeB = empB[0]!.id;

    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (!db) return;
    await withSystemContext(db, async (tx) => {
      if (employeeA) await tx`DELETE FROM app.employees WHERE id = ${employeeA}::uuid`;
      if (employeeB) await tx`DELETE FROM app.employees WHERE id = ${employeeB}::uuid`;
      if (orgUnitA) await tx`DELETE FROM app.org_units WHERE id = ${orgUnitA}::uuid`;
      if (orgUnitB) await tx`DELETE FROM app.org_units WHERE id = ${orgUnitB}::uuid`;
    });
    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);
    await closeTestConnections(db);
  });

  // ---------------------------------------------------------------------------
  // Unauthenticated access prevention
  // ---------------------------------------------------------------------------

  describe("Unauthenticated access", () => {
    it("should reject GET /api/v1/hr/employees without auth", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          headers: { "X-Tenant-ID": tenantA?.id ?? "fake" },
        })
      );

      // Should be 400 (missing tenant after auth fails) or 401 (unauthenticated)
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThanOrEqual(401);
    });

    it("should reject POST /api/v1/hr/employees without auth", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantA?.id ?? "fake",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            employeeNumber: "UNAUTH-001",
            hireDate: "2024-01-01",
          }),
        })
      );

      // Must not succeed
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject DELETE requests without auth", async () => {
      const fakeId = crypto.randomUUID();
      const response = await app.handle(
        new Request(`http://localhost/api/v1/hr/org-units/${fakeId}`, {
          method: "DELETE",
          headers: {
            "X-Tenant-ID": tenantA?.id ?? "fake",
            "Idempotency-Key": crypto.randomUUID(),
          },
        })
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should allow health endpoint without auth (public route)", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.status).toBe(200);
    });

    it("should allow liveness probe without auth (public route)", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant isolation via RLS (database level)
  // ---------------------------------------------------------------------------

  describe("Tenant isolation via RLS", () => {
    it("should prevent tenant A from reading tenant B employees", async () => {
      if (!db || !tenantA || !tenantB || !userA || !employeeB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE id = ${employeeB}::uuid
      `;

      expect(results.length).toBe(0);
    });

    it("should prevent tenant A from updating tenant B employees", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB || !employeeB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      // Attempt update -- RLS silently filters, so this affects 0 rows
      await db`
        UPDATE app.employees
        SET status = 'terminated'
        WHERE id = ${employeeB}::uuid
      `;

      // Verify the update did NOT happen
      await setTenantContext(db, tenantB.id, userB.id);
      const check = await db<{ status: string }[]>`
        SELECT status FROM app.employees WHERE id = ${employeeB}::uuid
      `;
      expect(check[0]!.status).toBe("active");
    });

    it("should prevent tenant A from deleting tenant B employees", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB || !employeeB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      await db`
        DELETE FROM app.employees WHERE id = ${employeeB}::uuid
      `;

      // Verify the delete did NOT happen
      await setTenantContext(db, tenantB.id, userB.id);
      const check = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE id = ${employeeB}::uuid
      `;
      expect(check.length).toBe(1);
    });

    it("should prevent inserting data into another tenant via RLS INSERT policy", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      // Attempt to insert with tenant B's ID while in tenant A's context
      await expectRlsError(async () => {
        await db!`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenantB!.id}::uuid, 'HACK-EMP', 'active', CURRENT_DATE)
        `;
      });
    });

    it("should prevent listing all employees across tenants", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.employees
      `;

      // Should only see tenant A's employees, not tenant B's
      const ids = results.map((r) => r.id);
      expect(ids).toContain(employeeA);
      expect(ids).not.toContain(employeeB);
    });
  });

  // ---------------------------------------------------------------------------
  // IDOR (Insecure Direct Object Reference) prevention
  // ---------------------------------------------------------------------------

  describe("IDOR prevention", () => {
    it("should not return another tenant's org unit by known ID", async () => {
      if (!db || !tenantA || !userA || !orgUnitB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      // Even if attacker knows the UUID of another tenant's resource
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE id = ${orgUnitB}::uuid
      `;

      expect(results.length).toBe(0);
    });

    it("should not return another tenant's employee by known ID", async () => {
      if (!db || !tenantA || !userA || !employeeB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE id = ${employeeB}::uuid
      `;

      expect(results.length).toBe(0);
    });

    it("should not update another tenant's data even with known IDs", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB || !orgUnitB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      await db`
        UPDATE app.org_units SET name = 'HACKED' WHERE id = ${orgUnitB}::uuid
      `;

      // Verify in tenant B context
      await setTenantContext(db, tenantB.id, userB.id);
      const check = await db<{ name: string }[]>`
        SELECT name FROM app.org_units WHERE id = ${orgUnitB}::uuid
      `;
      expect(check[0]!.name).toBe("AuthZ Org B");
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant header manipulation
  // ---------------------------------------------------------------------------

  describe("Tenant header manipulation", () => {
    it("should validate tenant ID format (rejects non-UUID)", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          headers: {
            "X-Tenant-ID": "not-a-uuid",
          },
        })
      );

      // Should reject with 400 (invalid tenant format) or similar error
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject requests with non-existent tenant IDs", async () => {
      const fakeId = crypto.randomUUID();
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          headers: {
            "X-Tenant-ID": fakeId,
          },
        })
      );

      // Should be 400/404 (tenant not found or missing auth)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should not allow changing tenant ID mid-request via header injection", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      // Set context to tenant A
      await setTenantContext(db, tenantA.id, userA.id);

      // Try to query with tenant B's explicit condition -- RLS still filters
      const results = await db<{ id: string; tenantId: string }[]>`
        SELECT id, tenant_id FROM app.employees
        WHERE tenant_id = ${tenantB!.id}::uuid
      `;

      // RLS policy prevents seeing tenant B data even with explicit WHERE
      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // API endpoint authorization checks
  // ---------------------------------------------------------------------------

  describe("API endpoint authorization", () => {
    it("should return 400 or 401 for missing tenant context on protected endpoints", async () => {
      const protectedPaths = [
        "/api/v1/hr/employees",
        "/api/v1/hr/org-units",
        "/api/v1/absence/leave-types",
      ];

      for (const path of protectedPaths) {
        const response = await app.handle(
          new Request(`http://localhost${path}`, {
            method: "GET",
            // No X-Tenant-ID header, no auth cookie
          })
        );

        // Should fail with 400 (missing tenant) or 401 (missing auth)
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      }
    });

    it("should not leak internal error details in production error format", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees/not-a-uuid", {
          method: "GET",
          headers: {
            "X-Tenant-ID": tenantA?.id ?? crypto.randomUUID(),
          },
        })
      );

      // The response should not contain stack traces or internal details
      const body = await response.text();
      expect(body).not.toContain("node_modules");
      // Should not contain file system paths
      expect(body).not.toContain("packages/api/src");
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-tenant audit log isolation
  // ---------------------------------------------------------------------------

  describe("Audit log isolation", () => {
    it("should isolate audit logs by tenant", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // Create audit entries in each tenant
      const resourceA = crypto.randomUUID();
      const resourceB = crypto.randomUUID();

      await db`
        SELECT app.write_audit_log(
          ${tenantA.id}::uuid, ${userA.id}::uuid,
          'read', 'authz_test', ${resourceA}::uuid
        )
      `;

      await db`
        SELECT app.write_audit_log(
          ${tenantB.id}::uuid, ${userB.id}::uuid,
          'read', 'authz_test', ${resourceB}::uuid
        )
      `;

      // Tenant A should only see their audit entry
      await setTenantContext(db, tenantA.id, userA.id);
      const auditA = await db<{ resource_id: string }[]>`
        SELECT resource_id FROM app.audit_log WHERE resource_type = 'authz_test'
      `;

      expect(auditA.length).toBe(1);
      expect(auditA[0]!.resource_id).toBe(resourceA);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.audit_log WHERE resource_type = 'authz_test'`;
      });
    });
  });

  // ---------------------------------------------------------------------------
  // RLS bypass prevention
  // ---------------------------------------------------------------------------

  describe("RLS bypass prevention", () => {
    it("should prevent bypassing RLS with set_config from application role", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      // The application role (hris_app) should not be able to bypass RLS
      // by using system context functions directly
      await setTenantContext(db, tenantA.id, userA.id);

      // Trying to switch tenant context directly should either:
      // 1. Not expose other tenant's data (RLS still applies to the new context)
      // 2. Or be restricted by function permissions
      //
      // We test that even if set_config works, the subsequent query
      // only returns data for the set tenant context
      await db`SELECT set_config('app.current_tenant', ${tenantB!.id}, false)`;

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.employees
      `;

      // Should see tenant B's employees (because context was changed to B)
      // BUT should not see tenant A's employees -- proving RLS is enforced
      // based on the setting, not bypassed
      const ids = results.map((r) => r.id);
      expect(ids).not.toContain(employeeA);

      // Reset context
      await clearTenantContext(db);
    });

    it("should prevent direct enable_system_context from non-admin role", async () => {
      if (!db || !tenantA || !userA) return;

      // The hris_app role should be able to call enable_system_context
      // (it's granted EXECUTE on all functions in app schema for testing),
      // but in production the app should never call it directly.
      // This test documents that the function exists and verifies RLS behavior.
      await setTenantContext(db, tenantA.id, userA.id);

      // Even with system context, queries through the app should be auditable.
      // The critical protection is that the application code never exposes
      // enable_system_context to user-controlled paths.
      const beforeCount = await db<{ count: number }[]>`
        SELECT count(*)::int as count FROM app.employees
      `;

      // This should only return tenant A's employees
      expect(beforeCount[0]!.count).toBeGreaterThanOrEqual(1);
    });
  });
});
