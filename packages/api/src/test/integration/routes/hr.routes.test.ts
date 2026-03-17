/**
 * HR Routes Integration Tests
 *
 * Real integration tests that hit the Elysia app via app.handle().
 * Tests employee CRUD, list with pagination, 404 handling, and RLS isolation.
 *
 * Prerequisites: Docker containers running (postgres + redis), migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as bcrypt from "bcryptjs";
import { app } from "../../../app";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { buildCookieHeader } from "../../helpers/cookies";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("HR Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

  // Track IDs for cleanup
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];

  // Shared test data created in beforeAll
  let orgUnitIdA: string | null = null;
  let positionIdA: string | null = null;

  const password = "TestPassword123!";

  /**
   * Bootstrap a Better Auth user with credential account and super_admin role,
   * then sign in via the app to obtain a session cookie.
   */
  async function bootstrapAuthUser(
    tenant: TestTenant,
    user: TestUser
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(password, 12);

    await withSystemContext(db!, async (tx) => {
      // Ensure the super_admin role exists
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin', 'Platform super administrator (test)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );

      // Assign super_admin role to this user for the tenant
      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = 'a0000000-0000-0000-0000-000000000001'::uuid
         )`,
        [tenant.id, user.id]
      );

      // Insert into Better Auth "user" table
      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [user.id, user.email, user.email]
      );

      // Insert into Better Auth "account" table (credential provider)
      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [user.id, user.email, passwordHash]
      );
    });

    // Sign in via the app
    const signIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signIn.status).toBe(200);
    const cookie = buildCookieHeader(signIn);
    expect(cookie).toContain("staffora.session_token=");
    return cookie;
  }

  /** Build a Request with auth cookie, tenant header, and idempotency key. */
  function makeRequest(
    path: string,
    method: string,
    cookie: string,
    tenantId: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Request {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Tenant-ID": tenantId,
      ...extraHeaders,
    };
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      headers["Idempotency-Key"] = crypto.randomUUID();
    }
    return new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // =========================================================================
  // Setup / Teardown
  // =========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    // --- Tenant A ---
    tenantA = await createTestTenant(db, {
      name: `HR Test A ${suffix}`,
      slug: `hr-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `hr-test-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    // --- Tenant B (for RLS isolation tests) ---
    tenantB = await createTestTenant(db, {
      name: `HR Test B ${suffix}`,
      slug: `hr-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `hr-test-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);

    // --- Create prerequisite org unit and position for tenant A ---
    const orgUnitCode = `ORG-${suffix}`.slice(0, 50).toUpperCase();
    const orgUnitRes = await app.handle(
      makeRequest("/api/v1/hr/org-units", "POST", sessionCookieA, tenantA.id, {
        code: orgUnitCode,
        name: `HR Test Org Unit ${suffix}`,
        effective_from: "2024-01-01",
      })
    );
    expect(orgUnitRes.status).toBe(200);
    const orgUnitBody = (await orgUnitRes.json()) as { id: string };
    orgUnitIdA = orgUnitBody.id;
    createdOrgUnitIds.push(orgUnitIdA);

    const posCode = `POS-${suffix}`.slice(0, 50).toUpperCase();
    const posRes = await app.handle(
      makeRequest("/api/v1/hr/positions", "POST", sessionCookieA, tenantA.id, {
        code: posCode,
        title: `HR Test Position ${suffix}`,
        org_unit_id: orgUnitIdA,
        headcount: 10,
      })
    );
    expect(posRes.status).toBe(200);
    const posBody = (await posRes.json()) as { id: string };
    positionIdA = posBody.id;
    createdPositionIds.push(positionIdA);
  });

  afterAll(async () => {
    if (!db) return;

    // Clean up created test data in reverse order of dependency
    await withSystemContext(db, async (tx) => {
      // Clean up domain outbox entries
      for (const tId of [tenantA?.id, tenantB?.id]) {
        if (tId) {
          await tx
            .unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tId])
            .catch(() => {});
        }
      }

      // Clean up employee data (effective-dated child tables, then employees)
      for (const empId of createdEmployeeIds) {
        await tx
          .unsafe("DELETE FROM app.employee_status_history WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employee_managers WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employee_compensations WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employee_positions WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employee_contracts WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employee_personal WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employees WHERE id = $1::uuid", [empId])
          .catch(() => {});
      }

      // Clean up positions, then org units
      for (const posId of createdPositionIds) {
        await tx
          .unsafe("DELETE FROM app.positions WHERE id = $1::uuid", [posId])
          .catch(() => {});
      }
      for (const ouId of createdOrgUnitIds) {
        await tx
          .unsafe("DELETE FROM app.org_units WHERE id = $1::uuid", [ouId])
          .catch(() => {});
      }
    }).catch(() => {});

    // Clean up auth sessions and Better Auth records
    await withSystemContext(db, async (tx) => {
      for (const user of [userA, userB]) {
        if (!user) continue;
        await tx
          .unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user.id])
          .catch(() => {});
        await tx
          .unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user.id])
          .catch(() => {});
        await tx
          .unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user.id])
          .catch(() => {});
      }
    }).catch(() => {});

    // Clean up test user and tenant records
    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);

    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  // =========================================================================
  // GET /api/v1/hr/employees - List employees
  // =========================================================================

  describe("GET /api/v1/hr/employees", () => {
    it("should return 401 without authentication", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantA.id,
          },
        })
      );

      expect(res.status).toBe(401);
    });

    it("should list employees with pagination structure", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", sessionCookieA, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: unknown[];
        nextCursor: string | null;
        hasMore: boolean;
      };
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.hasMore).toBe("boolean");
    });

    it("should support status filter", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/hr/employees?status=active",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ status: string }>;
        hasMore: boolean;
      };
      // All returned items should be active (could be empty)
      for (const item of body.items) {
        expect(item.status).toBe("active");
      }
    });
  });

  // =========================================================================
  // POST /api/v1/hr/employees - Create (hire) employee
  // =========================================================================

  describe("POST /api/v1/hr/employees", () => {
    it("should create an employee with valid data", async () => {
      if (!sessionCookieA || !tenantA || !orgUnitIdA || !positionIdA) return;

      const empNumber = `EMP-IT-${Date.now()}`;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          employee_number: empNumber,
          personal: {
            first_name: "John",
            last_name: "Doe",
          },
          contract: {
            hire_date: "2024-06-15",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: {
            position_id: positionIdA,
            org_unit_id: orgUnitIdA,
          },
          compensation: {
            base_salary: 55000,
            currency: "GBP",
            pay_frequency: "monthly",
          },
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        id: string;
        employee_number: string;
        status: string;
        hire_date: string;
        tenant_id: string;
        personal?: { first_name: string; last_name: string };
      };

      expect(body.id).toBeDefined();
      expect(body.employee_number).toBe(empNumber);
      expect(body.status).toBe("pending");
      expect(body.hire_date).toBe("2024-06-15");
      expect(body.tenant_id).toBe(tenantA.id);
      expect(body.personal?.first_name).toBe("John");
      expect(body.personal?.last_name).toBe("Doe");

      createdEmployeeIds.push(body.id);
    });

    it("should reject creation with missing required fields", async () => {
      if (!sessionCookieA || !tenantA) return;

      // Missing personal, contract, position, compensation
      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {})
      );

      // Elysia validates the body via TypeBox and returns 422 (validation error)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("should reject creation with non-existent position", async () => {
      if (!sessionCookieA || !tenantA || !orgUnitIdA) return;

      const fakePositionId = crypto.randomUUID();
      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          personal: {
            first_name: "Ghost",
            last_name: "Position",
          },
          contract: {
            hire_date: "2024-06-15",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: {
            position_id: fakePositionId,
            org_unit_id: orgUnitIdA,
          },
          compensation: {
            base_salary: 30000,
          },
        })
      );

      // Should fail with a 400-level error (POSITION_NOT_FOUND)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("should reject duplicate employee number", async () => {
      if (!sessionCookieA || !tenantA || !orgUnitIdA || !positionIdA) return;

      const empNumber = `EMP-DUP-${Date.now()}`;

      // First create should succeed
      const res1 = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          employee_number: empNumber,
          personal: { first_name: "First", last_name: "Employee" },
          contract: {
            hire_date: "2024-07-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
          compensation: { base_salary: 40000 },
        })
      );
      expect(res1.status).toBe(200);
      const emp1 = (await res1.json()) as { id: string };
      createdEmployeeIds.push(emp1.id);

      // Second create with same number should fail (conflict)
      const res2 = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          employee_number: empNumber,
          personal: { first_name: "Second", last_name: "Employee" },
          contract: {
            hire_date: "2024-07-02",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
          compensation: { base_salary: 45000 },
        })
      );

      // Should be a 409 Conflict or a 400-level error
      expect(res2.status).toBeGreaterThanOrEqual(400);
      expect(res2.status).toBeLessThan(600);
    });
  });

  // =========================================================================
  // GET /api/v1/hr/employees/:id - Get employee by ID
  // =========================================================================

  describe("GET /api/v1/hr/employees/:id", () => {
    it("should return an employee by ID", async () => {
      if (!sessionCookieA || !tenantA || createdEmployeeIds.length === 0) return;

      const employeeId = createdEmployeeIds[0]!;
      const res = await app.handle(
        makeRequest(
          `/api/v1/hr/employees/${employeeId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        id: string;
        employee_number: string;
        status: string;
        tenant_id: string;
        personal?: { first_name: string; last_name: string };
        contract?: { contract_type: string };
      };

      expect(body.id).toBe(employeeId);
      expect(body.tenant_id).toBe(tenantA.id);
      expect(body.personal).toBeDefined();
      expect(body.contract).toBeDefined();
    });

    it("should return 404 for a non-existent employee ID", async () => {
      if (!sessionCookieA || !tenantA) return;

      const fakeId = crypto.randomUUID();
      const res = await app.handle(
        makeRequest(
          `/api/v1/hr/employees/${fakeId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/v1/hr/employees/:id/status - Status transitions
  // =========================================================================

  describe("POST /api/v1/hr/employees/:id/status", () => {
    let transitionEmployeeId: string | null = null;

    beforeAll(async () => {
      // Create a fresh employee for status transition tests
      if (!sessionCookieA || !tenantA || !orgUnitIdA || !positionIdA) return;

      const empNumber = `EMP-ST-${Date.now()}`;
      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          employee_number: empNumber,
          personal: { first_name: "Status", last_name: "Tester" },
          contract: {
            hire_date: "2024-01-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
          compensation: { base_salary: 50000 },
        })
      );

      if (res.status === 200) {
        const body = (await res.json()) as { id: string };
        transitionEmployeeId = body.id;
        createdEmployeeIds.push(body.id);
      }
    });

    it("should transition from pending to active", async () => {
      if (!sessionCookieA || !tenantA || !transitionEmployeeId) return;

      const res = await app.handle(
        makeRequest(
          `/api/v1/hr/employees/${transitionEmployeeId}/status`,
          "POST",
          sessionCookieA,
          tenantA.id,
          {
            to_status: "active",
            effective_date: "2024-01-15",
          }
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("active");
    });

    it("should reject invalid transition from active to pending", async () => {
      if (!sessionCookieA || !tenantA || !transitionEmployeeId) return;

      const res = await app.handle(
        makeRequest(
          `/api/v1/hr/employees/${transitionEmployeeId}/status`,
          "POST",
          sessionCookieA,
          tenantA.id,
          {
            to_status: "pending",
            effective_date: "2024-02-01",
          }
        )
      );

      // Should be rejected (400 or 409 level error for invalid transition)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // =========================================================================
  // POST /api/v1/hr/employees/:id/terminate - Terminate employee
  // =========================================================================

  describe("POST /api/v1/hr/employees/:id/terminate", () => {
    let terminateEmployeeId: string | null = null;

    beforeAll(async () => {
      // Create and activate an employee for termination tests
      if (!sessionCookieA || !tenantA || !orgUnitIdA || !positionIdA) return;

      const empNumber = `EMP-TM-${Date.now()}`;
      const createRes = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          employee_number: empNumber,
          personal: { first_name: "Terminate", last_name: "Target" },
          contract: {
            hire_date: "2024-01-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
          compensation: { base_salary: 42000 },
        })
      );

      if (createRes.status === 200) {
        const emp = (await createRes.json()) as { id: string };
        terminateEmployeeId = emp.id;
        createdEmployeeIds.push(emp.id);

        // Activate the employee first (pending -> active)
        await app.handle(
          makeRequest(
            `/api/v1/hr/employees/${terminateEmployeeId}/status`,
            "POST",
            sessionCookieA,
            tenantA.id,
            {
              to_status: "active",
              effective_date: "2024-01-15",
            }
          )
        );
      }
    });

    it("should terminate an active employee", async () => {
      if (!sessionCookieA || !tenantA || !terminateEmployeeId) return;

      const res = await app.handle(
        makeRequest(
          `/api/v1/hr/employees/${terminateEmployeeId}/terminate`,
          "POST",
          sessionCookieA,
          tenantA.id,
          {
            termination_date: "2024-12-31",
            reason: "Resignation",
          }
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        termination_date: string;
        termination_reason: string;
      };
      expect(body.status).toBe("terminated");
      expect(body.termination_date).toBe("2024-12-31");
      expect(body.termination_reason).toBe("Resignation");
    });
  });

  // =========================================================================
  // RLS Isolation
  // =========================================================================

  describe("HR RLS isolation", () => {
    let rlsEmployeeId: string | null = null;

    beforeAll(async () => {
      // Create an employee in tenant A
      if (!sessionCookieA || !tenantA || !orgUnitIdA || !positionIdA) return;

      const empNumber = `EMP-RLS-${Date.now()}`;
      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", sessionCookieA, tenantA.id, {
          employee_number: empNumber,
          personal: { first_name: "Hidden", last_name: "FromB" },
          contract: {
            hire_date: "2024-03-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
          compensation: { base_salary: 60000 },
        })
      );

      if (res.status === 200) {
        const emp = (await res.json()) as { id: string };
        rlsEmployeeId = emp.id;
        createdEmployeeIds.push(emp.id);
      }
    });

    it("should not show tenant A employees in tenant B employee list", async () => {
      if (!sessionCookieB || !tenantB || !rlsEmployeeId) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", sessionCookieB, tenantB.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string }>;
      };

      const found = body.items.find((item) => item.id === rlsEmployeeId);
      expect(found).toBeUndefined();
    });

    it("should return 404 when tenant B tries to access tenant A employee by ID", async () => {
      if (!sessionCookieB || !tenantB || !rlsEmployeeId) return;

      const res = await app.handle(
        makeRequest(
          `/api/v1/hr/employees/${rlsEmployeeId}`,
          "GET",
          sessionCookieB,
          tenantB.id
        )
      );

      expect(res.status).toBe(404);
    });
  });
});
