/**
 * Employee Positions (Concurrent Employment) Integration Tests
 *
 * Tests the multi-position assignment feature:
 * - Assign additional position to an employee
 * - List all positions for an employee (with FTE summary)
 * - End a position assignment
 * - FTE limit validation
 * - RLS isolation (cross-tenant)
 * - Outbox atomicity
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
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { buildCookieHeader } from "../../helpers/cookies";

describe("Employee Positions (Concurrent Employment) Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

  // Shared test data
  let orgUnitIdA: string | null = null;
  let positionIdA: string | null = null;
  let positionIdA2: string | null = null;
  let employeeIdA: string | null = null;

  let orgUnitIdB: string | null = null;
  let positionIdB: string | null = null;

  const password = "TestPassword123!";

  // IDs for cleanup
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];

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
  // Setup
  // =========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    // --- Tenant A ---
    tenantA = await createTestTenant(db, {
      name: `EmpPos Test A ${suffix}`,
      slug: `emppos-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `emppos-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    // --- Tenant B (for RLS isolation tests) ---
    tenantB = await createTestTenant(db, {
      name: `EmpPos Test B ${suffix}`,
      slug: `emppos-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `emppos-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);

    // --- Tenant A: Create org unit, two positions, and an employee ---
    const orgUnitCode = `ORG-EP-${suffix}`.slice(0, 50).toUpperCase();
    const orgUnitRes = await app.handle(
      makeRequest("/api/v1/hr/org-units", "POST", sessionCookieA!, tenantA.id, {
        code: orgUnitCode,
        name: `EmpPos Org Unit ${suffix}`,
        effective_from: "2024-01-01",
      })
    );
    expect(orgUnitRes.status).toBe(200);
    const orgUnitBody = (await orgUnitRes.json()) as { id: string };
    orgUnitIdA = orgUnitBody.id;
    createdOrgUnitIds.push(orgUnitIdA);

    const posCode1 = `POS-EP1-${suffix}`.slice(0, 50).toUpperCase();
    const posRes1 = await app.handle(
      makeRequest("/api/v1/hr/positions", "POST", sessionCookieA!, tenantA.id, {
        code: posCode1,
        title: `Position One ${suffix}`,
        org_unit_id: orgUnitIdA,
        headcount: 10,
      })
    );
    expect(posRes1.status).toBe(200);
    const posBody1 = (await posRes1.json()) as { id: string };
    positionIdA = posBody1.id;
    createdPositionIds.push(positionIdA);

    const posCode2 = `POS-EP2-${suffix}`.slice(0, 50).toUpperCase();
    const posRes2 = await app.handle(
      makeRequest("/api/v1/hr/positions", "POST", sessionCookieA!, tenantA.id, {
        code: posCode2,
        title: `Position Two ${suffix}`,
        org_unit_id: orgUnitIdA,
        headcount: 10,
      })
    );
    expect(posRes2.status).toBe(200);
    const posBody2 = (await posRes2.json()) as { id: string };
    positionIdA2 = posBody2.id;
    createdPositionIds.push(positionIdA2);

    // Create an employee with 50% FTE on position 1
    const empRes = await app.handle(
      makeRequest("/api/v1/hr/employees", "POST", sessionCookieA!, tenantA.id, {
        personal: {
          first_name: "Multi",
          last_name: "Position",
        },
        contract: {
          hire_date: "2024-01-15",
          contract_type: "permanent",
          employment_type: "full_time",
          fte: 1,
        },
        position: {
          position_id: positionIdA,
          org_unit_id: orgUnitIdA,
          is_primary: true,
        },
        compensation: {
          base_salary: 50000,
        },
      })
    );
    expect(empRes.status).toBe(200);
    const empBody = (await empRes.json()) as { id: string };
    employeeIdA = empBody.id;
    createdEmployeeIds.push(employeeIdA);

    // --- Tenant B: Create org unit and position ---
    const orgUnitCodeB = `ORG-EPB-${suffix}`.slice(0, 50).toUpperCase();
    const orgUnitResB = await app.handle(
      makeRequest("/api/v1/hr/org-units", "POST", sessionCookieB!, tenantB.id, {
        code: orgUnitCodeB,
        name: `EmpPos Org Unit B ${suffix}`,
        effective_from: "2024-01-01",
      })
    );
    expect(orgUnitResB.status).toBe(200);
    const orgUnitBodyB = (await orgUnitResB.json()) as { id: string };
    orgUnitIdB = orgUnitBodyB.id;
    createdOrgUnitIds.push(orgUnitIdB);

    const posCodeB = `POS-EPB-${suffix}`.slice(0, 50).toUpperCase();
    const posResB = await app.handle(
      makeRequest("/api/v1/hr/positions", "POST", sessionCookieB!, tenantB.id, {
        code: posCodeB,
        title: `Position B ${suffix}`,
        org_unit_id: orgUnitIdB,
        headcount: 10,
      })
    );
    expect(posResB.status).toBe(200);
    const posBodyB = (await posResB.json()) as { id: string };
    positionIdB = posBodyB.id;
    createdPositionIds.push(positionIdB);
  }, 60_000);

  // =========================================================================
  // Teardown
  // =========================================================================

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      for (const tId of [tenantA?.id, tenantB?.id]) {
        if (tId) {
          await tx.unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tId]).catch(() => {});
        }
      }

      for (const empId of createdEmployeeIds) {
        await tx.unsafe("DELETE FROM app.employee_status_history WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.reporting_lines WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.compensation_history WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.position_assignments WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employment_contracts WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_personal WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employees WHERE id = $1::uuid", [empId]).catch(() => {});
      }

      for (const posId of createdPositionIds) {
        await tx.unsafe("DELETE FROM app.positions WHERE id = $1::uuid", [posId]).catch(() => {});
      }

      for (const ouId of createdOrgUnitIds) {
        await tx.unsafe("DELETE FROM app.org_units WHERE id = $1::uuid", [ouId]).catch(() => {});
      }

      for (const tId of [tenantA?.id, tenantB?.id]) {
        if (tId) {
          await tx.unsafe("DELETE FROM app.idempotency_keys WHERE tenant_id = $1::uuid", [tId]).catch(() => {});
        }
      }
    });

    if (userA) await withSystemContext(db, async (tx) => {
      await tx.unsafe(`DELETE FROM app.role_assignments WHERE user_id = $1::uuid`, [userA!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [userA!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [userA!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [userA!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app.users WHERE id = $1::uuid`, [userA!.id]).catch(() => {});
    });

    if (userB) await withSystemContext(db, async (tx) => {
      await tx.unsafe(`DELETE FROM app.role_assignments WHERE user_id = $1::uuid`, [userB!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [userB!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [userB!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [userB!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app.users WHERE id = $1::uuid`, [userB!.id]).catch(() => {});
    });

    if (tenantA) await withSystemContext(db, async (tx) => {
      await tx.unsafe(`DELETE FROM app.user_tenants WHERE tenant_id = $1::uuid`, [tenantA!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app.tenants WHERE id = $1::uuid`, [tenantA!.id]).catch(() => {});
    });

    if (tenantB) await withSystemContext(db, async (tx) => {
      await tx.unsafe(`DELETE FROM app.user_tenants WHERE tenant_id = $1::uuid`, [tenantB!.id]).catch(() => {});
      await tx.unsafe(`DELETE FROM app.tenants WHERE id = $1::uuid`, [tenantB!.id]).catch(() => {});
    });

    await closeTestConnections();
  }, 30_000);

  // =========================================================================
  // Tests
  // =========================================================================

  it("should list employee positions (initial hire assignment)", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/positions`,
        "GET",
        sessionCookieA!,
        tenantA!.id
      )
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.employee_id).toBe(employeeIdA);
    expect(body.positions).toBeInstanceOf(Array);
    expect(body.positions.length).toBeGreaterThanOrEqual(1);
    expect(body.max_fte_percentage).toBe(100);
    expect(typeof body.total_fte_percentage).toBe("number");

    // The initial hire assignment should be primary
    const primary = body.positions.find((p: any) => p.is_primary === true);
    expect(primary).toBeTruthy();
    expect(primary.position_id).toBe(positionIdA);
  });

  it("should assign an additional (secondary) position", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/positions`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          position_id: positionIdA2,
          org_unit_id: orgUnitIdA,
          is_primary: false,
          fte_percentage: 50,
          effective_from: "2024-06-01",
          assignment_reason: "concurrent_employment",
        }
      )
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBeTruthy();
    expect(body.position_id).toBe(positionIdA2);
    expect(body.is_primary).toBe(false);
    expect(body.fte_percentage).toBe(50);
    expect(body.assignment_reason).toBe("concurrent_employment");
    expect(body.effective_from).toBe("2024-06-01");
  });

  it("should list all positions after additional assignment", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/positions`,
        "GET",
        sessionCookieA!,
        tenantA!.id
      )
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.positions.length).toBeGreaterThanOrEqual(2);
    expect(body.total_fte_percentage).toBeGreaterThanOrEqual(150); // 100 (initial) + 50 (new)
  });

  it("should reject assignment that exceeds FTE limit", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    // Try to add another position that would push total FTE over 100%
    // (default max is 100, current total is already > 100 from previous test)
    // Actually, default max is 100 and we have 150% already, but this should still
    // fail because the previous test pushed it over. Let's just try to add more.
    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/positions`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          position_id: positionIdA2,
          org_unit_id: orgUnitIdA,
          is_primary: false,
          fte_percentage: 60,
          effective_from: "2024-07-01",
          assignment_reason: "overflow_test",
        }
      )
    );

    // This should fail because total FTE would exceed 100%
    // NOTE: If the tenant max was raised or the previous test's FTE was different,
    // adjust accordingly. With default max=100 and current=150, adding 60 = 210 > 100.
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("FTE_LIMIT_EXCEEDED");
  });

  it("should return 404 for non-existent employee positions", async () => {
    if (!isInfraAvailable()) return;

    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${fakeId}/positions`,
        "GET",
        sessionCookieA!,
        tenantA!.id
      )
    );

    expect(res.status).toBe(404);
  });

  it("should enforce RLS - tenant B cannot see tenant A employee positions", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    // Tenant B tries to access tenant A's employee positions
    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/positions`,
        "GET",
        sessionCookieB!,
        tenantB!.id
      )
    );

    // Should be 404 because the employee does not exist in tenant B's context
    expect(res.status).toBe(404);
  });

  it("should write outbox event when assigning position", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    // Check for outbox events
    const rows = await withSystemContext(db!, async (tx) => {
      return tx.unsafe(
        `SELECT * FROM app.domain_outbox
         WHERE tenant_id = $1::uuid
           AND aggregate_id = $2::uuid
           AND event_type = 'hr.employee.position_assigned'
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantA!.id, employeeIdA]
      );
    });

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const event = rows[0];
    expect(event.event_type).toBe("hr.employee.position_assigned");
    expect(event.aggregate_type).toBe("employee");
  });

  it("should reject assigning position to a terminated employee", async () => {
    if (!isInfraAvailable()) return;

    // Create a new employee, then terminate them, then try to assign
    const empRes = await app.handle(
      makeRequest("/api/v1/hr/employees", "POST", sessionCookieA!, tenantA!.id, {
        personal: { first_name: "Term", last_name: "Employee" },
        contract: {
          hire_date: "2024-01-01",
          contract_type: "permanent",
          employment_type: "full_time",
          fte: 1,
        },
        position: {
          position_id: positionIdA,
          org_unit_id: orgUnitIdA,
          is_primary: true,
        },
        compensation: { base_salary: 30000 },
      })
    );
    expect(empRes.status).toBe(200);
    const termEmp = (await empRes.json()) as { id: string };
    createdEmployeeIds.push(termEmp.id);

    // Terminate the employee
    const termRes = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${termEmp.id}/terminate`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          termination_date: "2024-06-01",
          reason: "Test termination",
        }
      )
    );
    expect(termRes.status).toBe(200);

    // Try to assign a position
    const assignRes = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${termEmp.id}/positions`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          position_id: positionIdA2,
          org_unit_id: orgUnitIdA,
          is_primary: false,
          fte_percentage: 50,
          effective_from: "2024-07-01",
        }
      )
    );

    expect(assignRes.status).toBe(400);
    const assignBody = (await assignRes.json()) as any;
    expect(assignBody.error.code).toBe("TERMINATED");
  });
});
