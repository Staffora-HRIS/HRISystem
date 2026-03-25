/**
 * HR Module — API Contract Tests
 *
 * Verifies that the Core HR endpoints return responses whose shapes
 * match the TypeBox schemas declared in the module's schemas.ts.
 *
 * Endpoints tested:
 *   GET  /api/v1/hr/employees      — list (paginated)
 *   GET  /api/v1/hr/employees/:id  — detail
 *   POST /api/v1/hr/employees      — create (hire)
 *   GET  /api/v1/hr/org-units      — list (paginated)
 *   GET  /api/v1/hr/positions      — list (paginated)
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
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";
import { buildCookieHeader } from "../helpers/cookies";
import {
  assertMatchesSchema,
  assertPaginatedResponse,
  assertErrorResponse,
  assertRequiredFields,
} from "./contract-helper";

// Import TypeBox schemas that define the API contract
import {
  EmployeeListResponseSchema,
  EmployeeListItemSchema,
  EmployeeResponseSchema,
  OrgUnitResponseSchema,
  PositionResponseSchema,
} from "../../modules/hr/schemas";

// ============================================================================
// Helpers
// ============================================================================

const TEST_PASSWORD = "ContractTestPass123!";

describe("HR Module — API Contract Tests", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let sessionCookie: string = "";

  // Track IDs for cleanup
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];

  // Shared prerequisite IDs
  let orgUnitId: string = "";
  let positionId: string = "";

  /**
   * Bootstrap a Better Auth user and obtain a session cookie.
   */
  async function bootstrapAuthUser(
    t: TestTenant,
    u: TestUser
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    await withSystemContext(db!, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin', 'Platform super administrator (contract tests)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );

      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = 'a0000000-0000-0000-0000-000000000001'::uuid
         )`,
        [t.id, u.id]
      );

      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [u.id, u.email, u.email]
      );

      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [u.id, u.email, passwordHash]
      );
    });

    const signIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, password: TEST_PASSWORD }),
      })
    );

    expect(signIn.status).toBe(200);
    const cookie = buildCookieHeader(signIn);
    expect(cookie).toContain("staffora.session_token=");
    return cookie;
  }

  /** Build an authenticated Request. */
  function makeRequest(
    path: string,
    method: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Request {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
      "X-Tenant-ID": tenant!.id,
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

  // ==========================================================================
  // Setup / Teardown
  // ==========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `HR Contract ${suffix}`,
      slug: `hr-contract-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `hr-contract-${suffix}@example.com`,
    });
    sessionCookie = await bootstrapAuthUser(tenant, user);

    // Create prerequisite org unit
    const orgUnitCode = `HRCO-${suffix}`.slice(0, 50).toUpperCase();
    const orgUnitRes = await app.handle(
      makeRequest("/api/v1/hr/org-units", "POST", {
        code: orgUnitCode,
        name: `HR Contract Org Unit ${suffix}`,
        effective_from: "2024-01-01",
      })
    );
    expect(orgUnitRes.status).toBeLessThan(300);
    const orgUnitBody = (await orgUnitRes.json()) as { id: string };
    orgUnitId = orgUnitBody.id;
    createdOrgUnitIds.push(orgUnitId);

    // Create prerequisite position
    const posCode = `HRCP-${suffix}`.slice(0, 50).toUpperCase();
    const posRes = await app.handle(
      makeRequest("/api/v1/hr/positions", "POST", {
        code: posCode,
        title: `HR Contract Position ${suffix}`,
        org_unit_id: orgUnitId,
        headcount: 10,
      })
    );
    expect(posRes.status).toBeLessThan(300);
    const posBody = (await posRes.json()) as { id: string };
    positionId = posBody.id;
    createdPositionIds.push(positionId);
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      if (tenant?.id) {
        await tx
          .unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tenant.id])
          .catch(() => {});
      }

      for (const empId of createdEmployeeIds) {
        await tx.unsafe("DELETE FROM app.employee_status_history WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_managers WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_compensations WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_positions WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_contracts WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_personal WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employees WHERE id = $1::uuid", [empId]).catch(() => {});
      }

      for (const posId of createdPositionIds) {
        await tx.unsafe("DELETE FROM app.positions WHERE id = $1::uuid", [posId]).catch(() => {});
      }
      for (const ouId of createdOrgUnitIds) {
        await tx.unsafe("DELETE FROM app.org_units WHERE id = $1::uuid", [ouId]).catch(() => {});
      }
    }).catch(() => {});

    await withSystemContext(db, async (tx) => {
      if (user) {
        await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user.id]).catch(() => {});
        await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user.id]).catch(() => {});
        await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user.id]).catch(() => {});
      }
    }).catch(() => {});

    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);

    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  // ==========================================================================
  // GET /api/v1/hr/employees — List Employees
  // ==========================================================================

  describe("GET /api/v1/hr/employees", () => {
    it("should return a paginated response matching EmployeeListResponseSchema", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET")
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // Validate full schema shape
      assertMatchesSchema(
        EmployeeListResponseSchema,
        body,
        "GET /api/v1/hr/employees"
      );
    });

    it("should have correct pagination envelope shape", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET")
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // Validate pagination envelope
      assertPaginatedResponse(
        EmployeeListItemSchema,
        body,
        "GET /api/v1/hr/employees"
      );
    });

    it("should return items with required list fields", async () => {
      if (!tenant) return;

      // First create an employee so we have data
      const createRes = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", {
          personal: {
            first_name: "Contract",
            last_name: "ListTest",
          },
          contract: {
            hire_date: "2024-06-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1.0,
          },
          position: {
            position_id: positionId,
            org_unit_id: orgUnitId,
          },
          compensation: {
            base_salary: 35000,
            currency: "GBP",
          },
        })
      );
      if (createRes.status < 300) {
        const emp = (await createRes.json()) as { id: string };
        createdEmployeeIds.push(emp.id);
      }

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Record<string, unknown>[] };

      if (body.items.length > 0) {
        const item = body.items[0];
        assertRequiredFields(
          item,
          {
            id: "string",
            employee_number: "string",
            status: "string",
            hire_date: "string",
            full_name: "string",
            display_name: "string",
          },
          "GET /api/v1/hr/employees — list item"
        );
      }
    });
  });

  // ==========================================================================
  // POST /api/v1/hr/employees — Create Employee
  // ==========================================================================

  describe("POST /api/v1/hr/employees", () => {
    it("should return a response matching EmployeeResponseSchema", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", {
          personal: {
            first_name: "Contract",
            last_name: "CreateTest",
            gender: "male",
          },
          contract: {
            hire_date: "2024-07-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1.0,
          },
          position: {
            position_id: positionId,
            org_unit_id: orgUnitId,
          },
          compensation: {
            base_salary: 42000,
            currency: "GBP",
            pay_frequency: "monthly",
          },
        })
      );

      expect(res.status).toBeLessThan(300);
      const body = await res.json();

      if (body && typeof body === "object" && "id" in body) {
        createdEmployeeIds.push((body as { id: string }).id);
      }

      // Validate against the declared EmployeeResponseSchema
      assertMatchesSchema(
        EmployeeResponseSchema,
        body,
        "POST /api/v1/hr/employees"
      );
    });

    it("should include required top-level fields on created employee", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", {
          personal: {
            first_name: "Contract",
            last_name: "FieldTest",
          },
          contract: {
            hire_date: "2024-08-01",
            contract_type: "fixed_term",
            employment_type: "part_time",
            fte: 0.5,
          },
          position: {
            position_id: positionId,
            org_unit_id: orgUnitId,
          },
          compensation: {
            base_salary: 25000,
          },
        })
      );

      expect(res.status).toBeLessThan(300);
      const body = (await res.json()) as Record<string, unknown>;

      if (body && "id" in body) {
        createdEmployeeIds.push(body.id as string);
      }

      assertRequiredFields(
        body,
        {
          id: "string",
          tenant_id: "string",
          employee_number: "string",
          status: "string",
          hire_date: "string",
          created_at: "string",
          updated_at: "string",
        },
        "POST /api/v1/hr/employees — required fields"
      );

      // status must be "pending" for a newly created employee
      expect(body.status).toBe("pending");
    });

    it("should return validation error for missing required fields", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", {
          personal: { first_name: "Incomplete" },
          // Missing contract, position, compensation
        })
      );

      // Should be a 4xx error
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ==========================================================================
  // GET /api/v1/hr/employees/:id — Get Employee Detail
  // ==========================================================================

  describe("GET /api/v1/hr/employees/:id", () => {
    let employeeId: string = "";

    beforeAll(async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "POST", {
          personal: {
            first_name: "Contract",
            last_name: "DetailTest",
            date_of_birth: "1990-03-15",
            gender: "female",
          },
          contract: {
            hire_date: "2024-09-01",
            contract_type: "permanent",
            employment_type: "full_time",
            fte: 1.0,
            working_hours_per_week: 37.5,
          },
          position: {
            position_id: positionId,
            org_unit_id: orgUnitId,
          },
          compensation: {
            base_salary: 50000,
            currency: "GBP",
            pay_frequency: "monthly",
          },
        })
      );

      if (res.status < 300) {
        const body = (await res.json()) as { id: string };
        employeeId = body.id;
        createdEmployeeIds.push(employeeId);
      }
    });

    it("should return a response matching EmployeeResponseSchema", async () => {
      if (!tenant || !employeeId) return;

      const res = await app.handle(
        makeRequest(`/api/v1/hr/employees/${employeeId}`, "GET")
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      assertMatchesSchema(
        EmployeeResponseSchema,
        body,
        `GET /api/v1/hr/employees/${employeeId}`
      );
    });

    it("should include nested personal, contract, position, compensation objects", async () => {
      if (!tenant || !employeeId) return;

      const res = await app.handle(
        makeRequest(`/api/v1/hr/employees/${employeeId}`, "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      // personal sub-object
      expect(body.personal).toBeDefined();
      const personal = body.personal as Record<string, unknown>;
      assertRequiredFields(personal, {
        first_name: "string",
        last_name: "string",
        full_name: "string",
        display_name: "string",
        effective_from: "string",
      });

      // contract sub-object
      expect(body.contract).toBeDefined();
      const contract = body.contract as Record<string, unknown>;
      assertRequiredFields(contract, {
        contract_type: "string",
        employment_type: "string",
        fte: "number",
        effective_from: "string",
      });

      // position sub-object
      expect(body.position).toBeDefined();
      const position = body.position as Record<string, unknown>;
      assertRequiredFields(position, {
        position_id: "string",
        position_title: "string",
        org_unit_id: "string",
        org_unit_name: "string",
        is_primary: "boolean",
        effective_from: "string",
      });

      // compensation sub-object
      expect(body.compensation).toBeDefined();
      const compensation = body.compensation as Record<string, unknown>;
      assertRequiredFields(compensation, {
        base_salary: "number",
        currency: "string",
        pay_frequency: "string",
        annual_salary: "number",
        effective_from: "string",
      });
    });

    it("should return 404 for non-existent employee with error shape", async () => {
      if (!tenant) return;

      const fakeId = "00000000-0000-0000-0000-000000000999";
      const res = await app.handle(
        makeRequest(`/api/v1/hr/employees/${fakeId}`, "GET")
      );

      expect(res.status).toBe(404);
      const body = await res.json();

      assertErrorResponse(
        body,
        `GET /api/v1/hr/employees/${fakeId}`
      );
    });
  });

  // ==========================================================================
  // GET /api/v1/hr/org-units — List Org Units
  // ==========================================================================

  describe("GET /api/v1/hr/org-units", () => {
    it("should return paginated org units matching schema", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/org-units", "GET")
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      assertPaginatedResponse(
        OrgUnitResponseSchema,
        body,
        "GET /api/v1/hr/org-units"
      );
    });

    it("should have org unit items with required fields", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/org-units", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Record<string, unknown>[] };

      if (body.items.length > 0) {
        const item = body.items[0];
        assertRequiredFields(item, {
          id: "string",
          tenant_id: "string",
          code: "string",
          name: "string",
          level: "number",
          is_active: "boolean",
          effective_from: "string",
          created_at: "string",
          updated_at: "string",
        });
      }
    });
  });

  // ==========================================================================
  // GET /api/v1/hr/positions — List Positions
  // ==========================================================================

  describe("GET /api/v1/hr/positions", () => {
    it("should return paginated positions matching schema", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/positions", "GET")
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      assertPaginatedResponse(
        PositionResponseSchema,
        body,
        "GET /api/v1/hr/positions"
      );
    });

    it("should have position items with required fields", async () => {
      if (!tenant) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/positions", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Record<string, unknown>[] };

      if (body.items.length > 0) {
        const item = body.items[0];
        assertRequiredFields(item, {
          id: "string",
          tenant_id: "string",
          code: "string",
          title: "string",
          is_manager: "boolean",
          headcount: "number",
          is_active: "boolean",
          created_at: "string",
          updated_at: "string",
        });
      }
    });
  });
});
