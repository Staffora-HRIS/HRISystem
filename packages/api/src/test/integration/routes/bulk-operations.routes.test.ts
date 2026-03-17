/**
 * Bulk Operations Routes Integration Tests
 *
 * Real integration tests that hit the Elysia app via app.handle().
 * Tests bulk employee create, bulk employee update, bulk leave request actions,
 * RLS isolation, outbox atomicity, and per-item error reporting.
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
  setTenantContext,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { buildCookieHeader } from "../../helpers/cookies";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Bulk Operations Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

  // Test data IDs
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
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin', 'Platform super administrator (test)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );

      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = 'a0000000-0000-0000-0000-000000000001'::uuid
         )`,
        [tenant.id, user.id]
      );

      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [user.id, user.email, user.email]
      );

      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [user.id, user.email, passwordHash]
      );
    });

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

    // Create Tenant A
    tenantA = await createTestTenant(db, {
      name: `Bulk Test Tenant A ${suffix}`,
      slug: `bulk-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `bulk-testa-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    // Create Tenant B (for RLS isolation tests)
    tenantB = await createTestTenant(db, {
      name: `Bulk Test Tenant B ${suffix}`,
      slug: `bulk-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `bulk-testb-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);

    // Create an org unit and position for tenant A
    await withSystemContext(db, async (tx) => {
      orgUnitIdA = crypto.randomUUID();
      await tx`
        INSERT INTO app.org_units (id, tenant_id, code, name, level, is_active, effective_from)
        VALUES (${orgUnitIdA}::uuid, ${tenantA!.id}::uuid, ${"BULK-OU-" + suffix}, 'Bulk Test OU', 0, true, '2024-01-01')
      `;

      positionIdA = crypto.randomUUID();
      await tx`
        INSERT INTO app.positions (id, tenant_id, code, title, org_unit_id, headcount, is_active, is_manager)
        VALUES (${positionIdA}::uuid, ${tenantA!.id}::uuid, ${"BULK-POS-" + suffix}, 'Bulk Test Position', ${orgUnitIdA}::uuid, 100, true, false)
      `;
    });
  }, 60000);

  afterAll(async () => {
    if (db) {
      if (tenantA) {
        // Clean up all data created under tenant A
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.employee_status_history WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.reporting_lines WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.employee_compensation WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.position_assignments WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.employee_contracts WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.leave_request_approvals WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.leave_requests WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.positions WHERE tenant_id = ${tenantA!.id}::uuid`;
          await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenantA!.id}::uuid`;
        }).catch(() => {});
      }

      if (tenantB) {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantB!.id}::uuid`;
          await tx`DELETE FROM app.employee_status_history WHERE tenant_id = ${tenantB!.id}::uuid`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenantB!.id}::uuid`;
        }).catch(() => {});
      }

      if (userA) await cleanupTestUser(db, userA.id);
      if (userB) await cleanupTestUser(db, userB.id);
      if (tenantA) await cleanupTestTenant(db, tenantA.id);
      if (tenantB) await cleanupTestTenant(db, tenantB.id);

      await clearTenantContext(db);
      await closeTestConnections(db);
    }
  }, 30000);

  // =========================================================================
  // POST /api/v1/bulk/employees - Bulk Create Employees
  // =========================================================================

  describe("POST /api/v1/bulk/employees", () => {
    it("should create multiple employees successfully", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "POST", sessionCookieA, tenantA.id, {
          employees: [
            {
              personal: { first_name: "Alice", last_name: "Smith" },
              contract: {
                hire_date: "2024-06-01",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 45000, currency: "GBP" },
            },
            {
              personal: { first_name: "Bob", last_name: "Jones" },
              contract: {
                hire_date: "2024-06-15",
                contract_type: "fixed_term",
                employment_type: "part_time",
                fte: 0.5,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 30000, currency: "GBP" },
            },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(2);
      expect(data.succeeded).toBe(2);
      expect(data.failed).toBe(0);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].id).toBeTruthy();
      expect(data.results[1].success).toBe(true);
      expect(data.results[1].id).toBeTruthy();
    });

    it("should return per-item errors for invalid entries", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      const fakePositionId = crypto.randomUUID();

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "POST", sessionCookieA, tenantA.id, {
          employees: [
            {
              personal: { first_name: "Charlie", last_name: "Brown" },
              contract: {
                hire_date: "2024-07-01",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 50000 },
            },
            {
              personal: { first_name: "Diana", last_name: "Prince" },
              contract: {
                hire_date: "2024-07-01",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: fakePositionId, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 60000 },
            },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(2);
      expect(data.succeeded).toBe(1);
      expect(data.failed).toBe(1);
      // First item should succeed
      expect(data.results[0].success).toBe(true);
      // Second item should fail due to invalid position
      expect(data.results[1].success).toBe(false);
      expect(data.results[1].error.code).toBe("POSITION_NOT_FOUND");
    });

    it("should reject empty employees array", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "POST", sessionCookieA, tenantA.id, {
          employees: [],
        })
      );

      // TypeBox validation should reject minItems: 1
      expect(res.status).toBe(400);
    });

    it("should write outbox events for each created employee", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA || !db) return;

      // Count outbox events before
      await setTenantContext(db, tenantA.id, userA!.id);
      const [before] = await db`
        SELECT COUNT(*)::int as count FROM app.domain_outbox
        WHERE tenant_id = ${tenantA.id}::uuid
          AND event_type = 'hr.employee.created'
      `;
      const countBefore = before?.count ?? 0;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "POST", sessionCookieA, tenantA.id, {
          employees: [
            {
              personal: { first_name: "Outbox", last_name: "Test1" },
              contract: {
                hire_date: "2024-08-01",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 40000 },
            },
            {
              personal: { first_name: "Outbox", last_name: "Test2" },
              contract: {
                hire_date: "2024-08-15",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 42000 },
            },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.succeeded).toBe(2);

      // Verify outbox events were written
      const [after] = await db`
        SELECT COUNT(*)::int as count FROM app.domain_outbox
        WHERE tenant_id = ${tenantA.id}::uuid
          AND event_type = 'hr.employee.created'
      `;
      const countAfter = after?.count ?? 0;
      expect(countAfter).toBe(countBefore + 2);
    });

    it("should require authentication", async () => {
      if (!isInfraAvailable() || !tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/bulk/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantA.id,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ employees: [] }),
        })
      );

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // PATCH /api/v1/bulk/employees - Bulk Update Employees
  // =========================================================================

  describe("PATCH /api/v1/bulk/employees", () => {
    let employeeIdForUpdate: string | null = null;

    beforeAll(async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      // Create an employee to update
      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "POST", sessionCookieA, tenantA.id, {
          employees: [
            {
              personal: { first_name: "Update", last_name: "Target" },
              contract: {
                hire_date: "2024-01-01",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 35000, currency: "GBP" },
            },
          ],
        })
      );

      const data = await res.json();
      employeeIdForUpdate = data.results?.[0]?.id ?? null;
    });

    it("should update multiple employee fields", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA || !employeeIdForUpdate) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "PATCH", sessionCookieA, tenantA.id, {
          employees: [
            {
              employee_id: employeeIdForUpdate,
              effective_from: "2024-07-01",
              personal: { first_name: "Updated", last_name: "Name" },
              compensation: { base_salary: 45000 },
            },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
      expect(data.succeeded).toBe(1);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].data.updated_dimensions).toContain("personal");
      expect(data.results[0].data.updated_dimensions).toContain("compensation");
    });

    it("should fail for non-existent employees", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      const fakeId = crypto.randomUUID();
      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "PATCH", sessionCookieA, tenantA.id, {
          employees: [
            {
              employee_id: fakeId,
              effective_from: "2024-07-01",
              personal: { first_name: "Ghost" },
            },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.failed).toBe(1);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error.code).toBe("EMPLOYEE_NOT_FOUND");
    });

    it("should reject duplicate employee IDs in the batch", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA || !employeeIdForUpdate) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "PATCH", sessionCookieA, tenantA.id, {
          employees: [
            {
              employee_id: employeeIdForUpdate,
              effective_from: "2024-08-01",
              personal: { first_name: "First" },
            },
            {
              employee_id: employeeIdForUpdate,
              effective_from: "2024-09-01",
              personal: { first_name: "Second" },
            },
          ],
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toContain("Duplicate");
    });
  });

  // =========================================================================
  // POST /api/v1/bulk/leave-requests - Bulk Leave Request Actions
  // =========================================================================

  describe("POST /api/v1/bulk/leave-requests", () => {
    let leaveRequestId1: string | null = null;
    let leaveRequestId2: string | null = null;
    let leaveRequestId3: string | null = null;
    let leaveEmployeeId: string | null = null;

    beforeAll(async () => {
      if (!isInfraAvailable() || !db || !tenantA || !userA) return;

      // Create an employee and leave requests for testing
      await withSystemContext(db, async (tx) => {
        leaveEmployeeId = crypto.randomUUID();
        await tx`
          INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
          VALUES (${leaveEmployeeId}::uuid, ${tenantA!.id}::uuid, ${"LR-" + Date.now()}, 'active', '2024-01-01')
        `;

        // Create a leave type
        const leaveTypeId = crypto.randomUUID();
        await tx`
          INSERT INTO app.leave_types (id, tenant_id, code, name, category, is_paid, requires_approval, is_active)
          VALUES (${leaveTypeId}::uuid, ${tenantA!.id}::uuid, 'BULK-AL', 'Bulk Annual Leave', 'annual', true, true, true)
        `;

        // Create pending leave requests
        leaveRequestId1 = crypto.randomUUID();
        await tx`
          INSERT INTO app.leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, duration, status)
          VALUES (${leaveRequestId1}::uuid, ${tenantA!.id}::uuid, ${leaveEmployeeId}::uuid, ${leaveTypeId}::uuid, '2024-08-01', '2024-08-02', 2, 'pending')
        `;

        leaveRequestId2 = crypto.randomUUID();
        await tx`
          INSERT INTO app.leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, duration, status)
          VALUES (${leaveRequestId2}::uuid, ${tenantA!.id}::uuid, ${leaveEmployeeId}::uuid, ${leaveTypeId}::uuid, '2024-09-01', '2024-09-03', 3, 'pending')
        `;

        // Create a draft leave request (not pending, should fail to action)
        leaveRequestId3 = crypto.randomUUID();
        await tx`
          INSERT INTO app.leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, duration, status)
          VALUES (${leaveRequestId3}::uuid, ${tenantA!.id}::uuid, ${leaveEmployeeId}::uuid, ${leaveTypeId}::uuid, '2024-10-01', '2024-10-01', 1, 'draft')
        `;
      });
    });

    it("should approve and reject leave requests in bulk", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA || !leaveRequestId1 || !leaveRequestId2) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/leave-requests", "POST", sessionCookieA, tenantA.id, {
          actions: [
            { leave_request_id: leaveRequestId1, action: "approve", comments: "Approved via bulk" },
            { leave_request_id: leaveRequestId2, action: "reject", comments: "Rejected via bulk" },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(2);
      expect(data.succeeded).toBe(2);
      expect(data.failed).toBe(0);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].data.action).toBe("approved");
      expect(data.results[1].success).toBe(true);
      expect(data.results[1].data.action).toBe("rejected");
    });

    it("should fail for non-pending leave requests", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA || !leaveRequestId3) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/leave-requests", "POST", sessionCookieA, tenantA.id, {
          actions: [
            { leave_request_id: leaveRequestId3, action: "approve" },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.failed).toBe(1);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error.code).toBe("REQUEST_NOT_PENDING");
    });

    it("should fail for non-existent leave requests", async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      const fakeId = crypto.randomUUID();
      const res = await app.handle(
        makeRequest("/api/v1/bulk/leave-requests", "POST", sessionCookieA, tenantA.id, {
          actions: [
            { leave_request_id: fakeId, action: "approve" },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.failed).toBe(1);
      expect(data.results[0].error.code).toBe("LEAVE_REQUEST_NOT_FOUND");
    });

    it("should write outbox events for approved/rejected requests", async () => {
      if (!isInfraAvailable() || !db || !tenantA || !sessionCookieA || !leaveEmployeeId) return;

      // Create new pending requests for this test
      let reqApprove: string;
      let reqReject: string;
      await withSystemContext(db, async (tx) => {
        const leaveTypeRows = await tx`
          SELECT id FROM app.leave_types WHERE tenant_id = ${tenantA!.id}::uuid AND code = 'BULK-AL' LIMIT 1
        `;
        const leaveTypeId = leaveTypeRows[0]?.id;

        reqApprove = crypto.randomUUID();
        await tx`
          INSERT INTO app.leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, duration, status)
          VALUES (${reqApprove}::uuid, ${tenantA!.id}::uuid, ${leaveEmployeeId}::uuid, ${leaveTypeId}::uuid, '2024-11-01', '2024-11-02', 2, 'pending')
        `;

        reqReject = crypto.randomUUID();
        await tx`
          INSERT INTO app.leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, duration, status)
          VALUES (${reqReject}::uuid, ${tenantA!.id}::uuid, ${leaveEmployeeId}::uuid, ${leaveTypeId}::uuid, '2024-12-01', '2024-12-01', 1, 'pending')
        `;
      });

      await setTenantContext(db, tenantA.id, userA!.id);
      const [before] = await db`
        SELECT COUNT(*)::int as count FROM app.domain_outbox
        WHERE tenant_id = ${tenantA.id}::uuid
          AND event_type IN ('absence.request.approved', 'absence.request.denied')
      `;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/leave-requests", "POST", sessionCookieA, tenantA.id, {
          actions: [
            { leave_request_id: reqApprove!, action: "approve" },
            { leave_request_id: reqReject!, action: "reject", comments: "Not this time" },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.succeeded).toBe(2);

      const [after] = await db`
        SELECT COUNT(*)::int as count FROM app.domain_outbox
        WHERE tenant_id = ${tenantA.id}::uuid
          AND event_type IN ('absence.request.approved', 'absence.request.denied')
      `;
      expect(after.count).toBe(before.count + 2);
    });
  });

  // =========================================================================
  // RLS Isolation
  // =========================================================================

  describe("RLS Isolation", () => {
    let tenantAEmployeeId: string | null = null;

    beforeAll(async () => {
      if (!isInfraAvailable() || !sessionCookieA || !tenantA) return;

      // Create an employee under tenant A
      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "POST", sessionCookieA, tenantA.id, {
          employees: [
            {
              personal: { first_name: "RLS", last_name: "Employee" },
              contract: {
                hire_date: "2024-01-01",
                contract_type: "permanent",
                employment_type: "full_time",
                fte: 1,
              },
              position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
              compensation: { base_salary: 50000 },
            },
          ],
        })
      );

      const data = await res.json();
      tenantAEmployeeId = data.results?.[0]?.id ?? null;
    });

    it("should not allow tenant B to update tenant A employees", async () => {
      if (!isInfraAvailable() || !sessionCookieB || !tenantB || !tenantAEmployeeId) return;

      const res = await app.handle(
        makeRequest("/api/v1/bulk/employees", "PATCH", sessionCookieB, tenantB.id, {
          employees: [
            {
              employee_id: tenantAEmployeeId,
              effective_from: "2024-07-01",
              personal: { first_name: "Hacked" },
            },
          ],
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      // Employee should not be found in tenant B's context
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error.code).toBe("EMPLOYEE_NOT_FOUND");
    });
  });
});
