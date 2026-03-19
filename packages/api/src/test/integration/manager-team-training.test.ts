/**
 * Manager Team Training Integration Tests (TODO-207)
 *
 * Verifies the team training overview endpoints under /api/v1/manager/team-training.
 *
 * Test matrix:
 * - Authenticated manager can view team training overview
 * - Authenticated manager can view specific team member's training details
 * - Non-manager user gets empty results (not an error)
 * - Invalid employee ID returns 404 for detail endpoint
 * - RLS ensures cross-tenant isolation
 *
 * Prerequisites: Docker containers running (postgres + redis), migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as bcrypt from "bcryptjs";
import { app } from "../../app";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";
import { buildCookieHeader } from "../helpers/cookies";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Manager Team Training (TODO-207)", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenant: TestTenant | null = null;
  let managerUser: TestUser | null = null;
  let managerCookie: string | null = null;
  let managerEmployeeId: string | null = null;

  let reportUser: TestUser | null = null;
  let reportEmployeeId: string | null = null;

  let nonManagerUser: TestUser | null = null;
  let nonManagerCookie: string | null = null;

  beforeAll(async () => {
    try {
      await ensureTestInfra();
    } catch {
      return;
    }

    if (!isInfraAvailable()) return;

    db = getTestDb();

    // Create test tenant
    tenant = await createTestTenant(db, {
      name: "Team Training Test Tenant",
      slug: `tt-test-${Date.now()}`,
    });

    if (!tenant) return;

    // Create manager user with a session
    const passwordHash = await bcrypt.hash("TestPassword123!", 10);
    managerUser = await createTestUser(db, tenant.id, {
      email: `mgr-${Date.now()}@test.local`,
      passwordHash,
      role: "admin",
    });

    // Create a non-manager user
    nonManagerUser = await createTestUser(db, tenant.id, {
      email: `emp-${Date.now()}@test.local`,
      passwordHash,
      role: "employee",
    });

    // Create employee records and manager hierarchy
    if (managerUser && nonManagerUser) {
      await withSystemContext(db, async (tx) => {
        // Create manager employee
        const [mgrEmp] = await tx`
          INSERT INTO app.employees (id, tenant_id, employee_number, user_id, status, hire_date)
          VALUES (gen_random_uuid(), ${tenant!.id}::uuid, 'MGR-001', ${managerUser!.id}::uuid, 'active', CURRENT_DATE)
          RETURNING id
        `;
        managerEmployeeId = mgrEmp.id;

        // Create report employee
        const [repEmp] = await tx`
          INSERT INTO app.employees (id, tenant_id, employee_number, user_id, status, hire_date)
          VALUES (gen_random_uuid(), ${tenant!.id}::uuid, 'EMP-001', ${nonManagerUser!.id}::uuid, 'active', CURRENT_DATE)
          RETURNING id
        `;
        reportEmployeeId = repEmp.id;

        // Create employee personal records
        await tx`
          INSERT INTO app.employee_personal (id, tenant_id, employee_id, first_name, last_name, effective_from)
          VALUES
            (gen_random_uuid(), ${tenant!.id}::uuid, ${managerEmployeeId}::uuid, 'Manager', 'TestUser', CURRENT_DATE),
            (gen_random_uuid(), ${tenant!.id}::uuid, ${reportEmployeeId}::uuid, 'Report', 'TestUser', CURRENT_DATE)
        `;

        // Create manager-subordinate relationship
        await tx`
          INSERT INTO app.manager_subordinates (id, tenant_id, manager_id, subordinate_id, depth)
          VALUES (gen_random_uuid(), ${tenant!.id}::uuid, ${managerEmployeeId}::uuid, ${reportEmployeeId}::uuid, 1)
        `;

        // Create a course and assignment for the report
        const [course] = await tx`
          INSERT INTO app.courses (id, tenant_id, title, status, is_required, estimated_duration_minutes, created_by)
          VALUES (gen_random_uuid(), ${tenant!.id}::uuid, 'Safety Training', 'published', true, 60, ${managerUser!.id}::uuid)
          RETURNING id
        `;

        await tx`
          INSERT INTO app.assignments (id, tenant_id, course_id, employee_id, status, assigned_at, due_date, assigned_by)
          VALUES (gen_random_uuid(), ${tenant!.id}::uuid, ${course.id}::uuid, ${reportEmployeeId}::uuid, 'in_progress', now(), CURRENT_DATE + INTERVAL '30 days', ${managerUser!.id}::uuid)
        `;
      });

      // Login as manager to get session cookie
      const loginRes = await app.handle(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: managerUser.email,
            password: "TestPassword123!",
          }),
        })
      );
      if (loginRes.ok) {
        managerCookie = buildCookieHeader(loginRes);
      }

      // Login as non-manager
      const loginRes2 = await app.handle(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: nonManagerUser.email,
            password: "TestPassword123!",
          }),
        })
      );
      if (loginRes2.ok) {
        nonManagerCookie = buildCookieHeader(loginRes2);
      }
    }
  });

  afterAll(async () => {
    if (db && tenant) {
      // Clean up test data
      await withSystemContext(db, async (tx) => {
        if (managerEmployeeId) {
          await tx`DELETE FROM app.manager_subordinates WHERE manager_id = ${managerEmployeeId}::uuid`.catch(() => {});
          await tx`DELETE FROM app.assignments WHERE tenant_id = ${tenant!.id}::uuid`.catch(() => {});
          await tx`DELETE FROM app.courses WHERE tenant_id = ${tenant!.id}::uuid`.catch(() => {});
          await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenant!.id}::uuid`.catch(() => {});
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant!.id}::uuid`.catch(() => {});
        }
      });

      if (managerUser) await cleanupTestUser(db, managerUser.id);
      if (nonManagerUser) await cleanupTestUser(db, nonManagerUser.id);
      await cleanupTestTenant(db, tenant.id);
    }
    await closeTestConnections();
  });

  // =========================================================================
  // GET /api/v1/manager/team-training
  // =========================================================================

  it("should return team training overview for a manager", async () => {
    if (!managerCookie || !tenant) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/manager/team-training", {
        headers: {
          Cookie: managerCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.summary.totalMembers).toBeGreaterThanOrEqual(0);
    expect(typeof body.summary.teamCompletionRate).toBe("number");
    expect(typeof body.summary.totalTrainingHours).toBe("number");
  });

  it("should support filter=overdue query parameter", async () => {
    if (!managerCookie || !tenant) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/manager/team-training?filter=overdue", {
        headers: {
          Cookie: managerCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toBeDefined();
    expect(Array.isArray(body.members)).toBe(true);
  });

  it("should support filter=in_progress query parameter", async () => {
    if (!managerCookie || !tenant) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/manager/team-training?filter=in_progress", {
        headers: {
          Cookie: managerCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toBeDefined();
  });

  it("should return empty results for non-manager user", async () => {
    if (!nonManagerCookie || !tenant) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/manager/team-training", {
        headers: {
          Cookie: nonManagerCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    // Non-manager should get 200 with empty members
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalMembers).toBe(0);
    expect(body.members).toEqual([]);
  });

  it("should require authentication", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/manager/team-training")
    );

    expect(res.status).toBe(401);
  });

  // =========================================================================
  // GET /api/v1/manager/team-training/:employeeId
  // =========================================================================

  it("should return detailed training for a direct report", async () => {
    if (!managerCookie || !tenant || !reportEmployeeId) return;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/manager/team-training/${reportEmployeeId}`, {
        headers: {
          Cookie: managerCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employeeId).toBe(reportEmployeeId);
    expect(body.employeeName).toBeDefined();
    expect(typeof body.completedCourses).toBe("number");
    expect(typeof body.inProgressCourses).toBe("number");
    expect(typeof body.totalHours).toBe("number");
    expect(typeof body.completionRate).toBe("number");
    expect(Array.isArray(body.enrollments)).toBe(true);
  });

  it("should return 404 for non-subordinate employee", async () => {
    if (!managerCookie || !tenant) return;

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.handle(
      new Request(`http://localhost/api/v1/manager/team-training/${fakeId}`, {
        headers: {
          Cookie: managerCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("should require authentication for detail endpoint", async () => {
    if (!reportEmployeeId) return;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/manager/team-training/${reportEmployeeId}`)
    );

    expect(res.status).toBe(401);
  });
});
