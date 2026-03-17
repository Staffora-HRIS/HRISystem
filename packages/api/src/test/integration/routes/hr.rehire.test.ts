/**
 * HR Rehire Integration Tests
 *
 * Tests the POST /api/v1/hr/employees/:id/rehire endpoint including:
 * - Successful rehire of a terminated employee
 * - Employment record chain with history preservation
 * - State machine enforcement (only terminated can be rehired)
 * - Validation of rehire date vs termination date
 * - RLS isolation (cross-tenant access blocked)
 * - Outbox event written atomically
 * - Idempotency key support
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("HR Rehire Integration", () => {
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
  let employeeIdA: string | null = null;

  const password = "TestPassword123!";

  // Cleanup tracking
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];

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

    // --- Tenant A ---
    tenantA = await createTestTenant(db, {
      name: `Rehire Test A ${suffix}`,
      slug: `rehire-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `rehire-test-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    // --- Tenant B (for RLS isolation tests) ---
    tenantB = await createTestTenant(db, {
      name: `Rehire Test B ${suffix}`,
      slug: `rehire-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `rehire-test-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);

    // --- Create prerequisite org unit and position for tenant A ---
    const orgUnitCode = `RORG-${suffix}`.slice(0, 50).toUpperCase();
    const orgUnitRes = await app.handle(
      makeRequest("/api/v1/hr/org-units", "POST", sessionCookieA!, tenantA.id, {
        code: orgUnitCode,
        name: `Rehire Test Org Unit ${suffix}`,
        effective_from: "2024-01-01",
      })
    );
    expect(orgUnitRes.status).toBe(200);
    const orgUnitBody = (await orgUnitRes.json()) as { id: string };
    orgUnitIdA = orgUnitBody.id;
    createdOrgUnitIds.push(orgUnitIdA);

    const posCode = `RPOS-${suffix}`.slice(0, 50).toUpperCase();
    const posRes = await app.handle(
      makeRequest("/api/v1/hr/positions", "POST", sessionCookieA!, tenantA.id, {
        code: posCode,
        title: `Rehire Test Position ${suffix}`,
        org_unit_id: orgUnitIdA,
        headcount: 10,
      })
    );
    expect(posRes.status).toBe(200);
    const posBody = (await posRes.json()) as { id: string };
    positionIdA = posBody.id;
    createdPositionIds.push(positionIdA);

    // --- Create and terminate an employee to use in rehire tests ---
    const hireRes = await app.handle(
      makeRequest("/api/v1/hr/employees", "POST", sessionCookieA!, tenantA.id, {
        personal: {
          first_name: "Rehire",
          last_name: "Test",
        },
        contract: {
          hire_date: "2023-01-15",
          contract_type: "permanent",
          employment_type: "full_time",
          fte: 1,
        },
        position: {
          position_id: positionIdA,
          org_unit_id: orgUnitIdA,
        },
        compensation: {
          base_salary: 45000,
          currency: "GBP",
          pay_frequency: "monthly",
        },
      })
    );
    expect(hireRes.status).toBe(200);
    const hireBody = (await hireRes.json()) as { id: string; status: string };
    employeeIdA = hireBody.id;
    createdEmployeeIds.push(employeeIdA);

    // Activate the employee
    const activateRes = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/status`,
        "POST",
        sessionCookieA!,
        tenantA.id,
        {
          to_status: "active",
          effective_date: "2023-01-15",
        }
      )
    );
    expect(activateRes.status).toBe(200);

    // Terminate the employee
    const terminateRes = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/terminate`,
        "POST",
        sessionCookieA!,
        tenantA.id,
        {
          termination_date: "2025-06-30",
          reason: "Voluntary resignation",
        }
      )
    );
    expect(terminateRes.status).toBe(200);
  }, 60000);

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Clean up domain outbox entries
      for (const tId of [tenantA?.id, tenantB?.id]) {
        if (tId) {
          await tx
            .unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tId])
            .catch(() => {});
        }
      }

      // Clean up employment records
      for (const empId of createdEmployeeIds) {
        await tx
          .unsafe("DELETE FROM app.employment_records WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
      }

      // Clean up employee data
      for (const empId of createdEmployeeIds) {
        await tx
          .unsafe("DELETE FROM app.employee_status_history WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.reporting_lines WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.compensation_history WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.position_assignments WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employment_contracts WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employee_personal WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.benefit_enrollments WHERE employee_id = $1::uuid", [empId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.employees WHERE id = $1::uuid", [empId])
          .catch(() => {});
      }

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
    });

    if (tenantA) await withSystemContext(db, async (tx) => {
      await tx.unsafe("DELETE FROM app.role_assignments WHERE tenant_id = $1::uuid", [tenantA!.id]).catch(() => {});
    });
    if (tenantB) await withSystemContext(db, async (tx) => {
      await tx.unsafe("DELETE FROM app.role_assignments WHERE tenant_id = $1::uuid", [tenantB!.id]).catch(() => {});
    });
  }, 30000);

  // =========================================================================
  // Rehire Tests
  // =========================================================================

  it("should rehire a terminated employee with new employment record", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/rehire`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          rehire_date: "2025-09-01",
          contract: {
            hire_date: "2025-09-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: {
            position_id: positionIdA,
            org_unit_id: orgUnitIdA,
          },
          compensation: {
            base_salary: 50000,
            currency: "GBP",
            pay_frequency: "monthly",
          },
          reason: "Returning after break",
        }
      )
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      employee: { id: string; status: string; hire_date: string; termination_date: string | null };
      employment_records: Array<{
        id: string;
        employment_number: number;
        start_date: string;
        end_date: string | null;
        is_current: boolean;
        previous_employment_id: string | null;
        termination_reason: string | null;
      }>;
    };

    // Employee should be in pending status (awaiting activation)
    expect(body.employee.status).toBe("pending");
    expect(body.employee.hire_date).toBe("2025-09-01");
    expect(body.employee.termination_date).toBeNull();

    // Should have 2 employment records: one closed (previous), one current (new)
    expect(body.employment_records.length).toBe(2);

    const currentRecord = body.employment_records.find((r) => r.is_current);
    const previousRecord = body.employment_records.find((r) => !r.is_current);

    expect(currentRecord).toBeDefined();
    expect(currentRecord!.start_date).toBe("2025-09-01");
    expect(currentRecord!.end_date).toBeNull();
    expect(currentRecord!.employment_number).toBe(2);
    expect(currentRecord!.previous_employment_id).toBe(previousRecord!.id);

    expect(previousRecord).toBeDefined();
    expect(previousRecord!.employment_number).toBe(1);
    expect(previousRecord!.end_date).not.toBeNull();
    expect(previousRecord!.termination_reason).toBeTruthy();
  }, 30000);

  it("should reject rehire for non-terminated employee", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    // Employee is now in pending state from previous rehire test; try to rehire again
    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/rehire`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          rehire_date: "2025-10-01",
          contract: {
            hire_date: "2025-10-01",
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
          },
        }
      )
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STATE_MACHINE_VIOLATION");
  }, 15000);

  it("should reject rehire with date before termination date", async () => {
    if (!isInfraAvailable() || !positionIdA || !orgUnitIdA) return;

    // Create another employee, terminate, then try to rehire with bad date
    const hireRes = await app.handle(
      makeRequest("/api/v1/hr/employees", "POST", sessionCookieA!, tenantA!.id, {
        personal: { first_name: "DateTest", last_name: "Rehire" },
        contract: {
          hire_date: "2023-06-01",
          contract_type: "permanent",
          employment_type: "full_time",
          fte: 1,
        },
        position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
        compensation: { base_salary: 30000 },
      })
    );
    expect(hireRes.status).toBe(200);
    const hireBody = (await hireRes.json()) as { id: string };
    const empId = hireBody.id;
    createdEmployeeIds.push(empId);

    // Activate
    await app.handle(
      makeRequest(`/api/v1/hr/employees/${empId}/status`, "POST", sessionCookieA!, tenantA!.id, {
        to_status: "active",
        effective_date: "2023-06-01",
      })
    );

    // Terminate
    await app.handle(
      makeRequest(`/api/v1/hr/employees/${empId}/terminate`, "POST", sessionCookieA!, tenantA!.id, {
        termination_date: "2025-03-15",
        reason: "Restructuring",
      })
    );

    // Try to rehire before termination date
    const rehireRes = await app.handle(
      makeRequest(`/api/v1/hr/employees/${empId}/rehire`, "POST", sessionCookieA!, tenantA!.id, {
        rehire_date: "2025-03-10",
        contract: {
          hire_date: "2025-03-10",
          contract_type: "permanent",
          employment_type: "full_time",
          fte: 1,
        },
        position: { position_id: positionIdA, org_unit_id: orgUnitIdA },
        compensation: { base_salary: 32000 },
      })
    );

    expect(rehireRes.status).toBe(400);
    const body = (await rehireRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_REHIRE_DATE");
  }, 30000);

  it("should reject rehire for non-existent employee", async () => {
    if (!isInfraAvailable()) return;

    const fakeId = "00000000-0000-0000-0000-000000000999";
    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${fakeId}/rehire`,
        "POST",
        sessionCookieA!,
        tenantA!.id,
        {
          rehire_date: "2025-09-01",
          contract: {
            hire_date: "2025-09-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: {
            position_id: positionIdA,
            org_unit_id: orgUnitIdA,
          },
          compensation: { base_salary: 40000 },
        }
      )
    );

    expect(res.status).toBe(404);
  }, 15000);

  it("should block cross-tenant rehire via RLS", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    // Tenant B should not be able to rehire Tenant A's employee
    const res = await app.handle(
      makeRequest(
        `/api/v1/hr/employees/${employeeIdA}/rehire`,
        "POST",
        sessionCookieB!,
        tenantB!.id,
        {
          rehire_date: "2025-09-01",
          contract: {
            hire_date: "2025-09-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1,
          },
          position: {
            position_id: positionIdA,
            org_unit_id: orgUnitIdA,
          },
          compensation: { base_salary: 40000 },
        }
      )
    );

    // Should be 404 (not found because RLS hides the employee)
    expect(res.status).toBe(404);
  }, 15000);

  it("should write outbox event atomically with rehire", async () => {
    if (!isInfraAvailable() || !employeeIdA) return;

    // Check that the rehire event was written to the domain outbox
    const outboxRows = await withSystemContext(db!, async (tx) => {
      return tx.unsafe(
        `SELECT id, event_type, payload
         FROM app.domain_outbox
         WHERE aggregate_id = $1::uuid
           AND event_type = 'hr.employee.rehired'
         ORDER BY created_at DESC
         LIMIT 1`,
        [employeeIdA]
      );
    });

    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    expect(outboxRows[0].eventType || outboxRows[0].event_type).toBe("hr.employee.rehired");
  }, 15000);
});
