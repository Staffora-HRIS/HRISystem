/**
 * Constraint Validation Integration Tests
 *
 * Verifies:
 * - Unique constraints (tenant-scoped)
 * - Foreign key constraints
 * - NOT NULL constraints
 * - CHECK constraints (date ranges, enums, status-dependent fields)
 * - State machine transition triggers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
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
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Constraint Validation", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  const suffix = Date.now();

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `cv-${suffix}` });
    user = await createTestUser(db, tenant.id, { email: `cv-${suffix}@example.com` });
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.leave_requests WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
        SELECT id FROM app.employees WHERE tenant_id = ${tenant.id}::uuid
      )`.catch(() => {});
      await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
    });
    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db || !tenant || !user) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  // ===========================================================================
  // Unique Constraints
  // ===========================================================================
  describe("Unique constraints", () => {
    it("should reject duplicate employee_number within same tenant", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-UNQ-${suffix}`;

      await db`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
      `;

      try {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
        expect(String(error)).toContain("employees_number_unique");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum}`;
      });
    });

    it("should allow same employee_number in different tenants", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CROSS-${suffix}`;
      const tenant2 = await createTestTenant(db, { slug: `cv-t2-${suffix}` });
      const user2 = await createTestUser(db, tenant2.id, { email: `cv-t2-${suffix}@example.com` });

      try {
        // Insert in tenant 1
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        `;

        // Insert same number in tenant 2 (should succeed)
        await setTenantContext(db, tenant2.id, user2.id);
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant2.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        `;

        // Verify both exist
        const count = await withSystemContext(db, async (tx) => {
          return await tx<{ count: string }[]>`
            SELECT COUNT(*)::text as count FROM app.employees
            WHERE employee_number = ${empNum}
          `;
        });
        expect(parseInt(count[0]!.count, 10)).toBe(2);
      } finally {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant2.id}::uuid AND employee_number = ${empNum}`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum}`;
        });
        await cleanupTestUser(db, user2.id);
        await cleanupTestTenant(db, tenant2.id);
        // Restore context for afterEach
        await setTenantContext(db, tenant.id, user.id);
      }
    });

    it("should reject duplicate leave_type code within same tenant", async () => {
      if (!db || !tenant) return;
      const code = `ANNUAL`;

      await db`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${code}, 'Annual Leave', 'annual')
      `;

      try {
        await db`
          INSERT INTO app.leave_types (tenant_id, code, name, category)
          VALUES (${tenant.id}::uuid, ${code}, 'Annual Leave Copy', 'annual')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
        expect(String(error)).toContain("leave_types_code_unique");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenant.id}::uuid AND code = ${code}`;
      });
    });

    it("should reject duplicate org_unit code within same tenant and effective_from", async () => {
      if (!db || !tenant) return;
      const code = `CV-ORG-${suffix}`;

      await db`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, 'Test Org 1', true, CURRENT_DATE)
      `;

      try {
        await db`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenant.id}::uuid, ${code}, 'Test Org 2', true, CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenant.id}::uuid AND code = ${code}`;
      });
    });
  });

  // ===========================================================================
  // Foreign Key Constraints
  // ===========================================================================
  describe("Foreign key constraints", () => {
    it("should reject employee with non-existent tenant_id", async () => {
      if (!db || !tenant) return;
      const fakeTenantId = crypto.randomUUID();

      try {
        await withSystemContext(db, async (tx) => {
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${fakeTenantId}::uuid, 'FK-TEST-1', 'pending', CURRENT_DATE)
          `;
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("violates foreign key constraint");
      }
    });

    it("should reject employee_personal with non-existent employee_id", async () => {
      if (!db || !tenant) return;
      const fakeEmployeeId = crypto.randomUUID();

      try {
        await db`
          INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
          VALUES (${tenant.id}::uuid, ${fakeEmployeeId}::uuid, 'John', 'Doe', CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("violates foreign key constraint");
      }
    });

    it("should reject leave_balance with non-existent leave_type_id", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-FK-LB-${suffix}`;
      const fakeLeaveTypeId = crypto.randomUUID();

      // Create employee first
      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${fakeLeaveTypeId}::uuid, 2026)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("violates foreign key constraint");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should cascade delete employee_personal when employee is deleted", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-FK-CASCADE-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
        VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, 'Jane', 'Smith', CURRENT_DATE)
      `;

      // Delete employee (should cascade to personal data)
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });

      // Verify personal data was also deleted
      const personalCount = await withSystemContext(db, async (tx) => {
        return await tx<{ count: string }[]>`
          SELECT COUNT(*)::text as count FROM app.employee_personal
          WHERE employee_id = ${emp[0]!.id}::uuid
        `;
      });
      expect(parseInt(personalCount[0]!.count, 10)).toBe(0);
    });
  });

  // ===========================================================================
  // NOT NULL Constraints
  // ===========================================================================
  describe("NOT NULL constraints", () => {
    it("should reject employee without employee_number", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.employees (tenant_id, status, hire_date)
          VALUES (${tenant.id}::uuid, 'pending', CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("null");
      }
    });

    it("should reject employee without hire_date", async () => {
      if (!db || !tenant) return;

      try {
        await db.unsafe(`
          INSERT INTO app.employees (tenant_id, employee_number, status)
          VALUES ('${tenant.id}', 'CV-NOTNULL-1', 'pending')
        `);
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("null");
      }
    });

    it("should reject employee_personal without first_name", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-NOTNULL-FN-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      try {
        await db.unsafe(`
          INSERT INTO app.employee_personal (tenant_id, employee_id, last_name, effective_from)
          VALUES ('${tenant.id}', '${emp[0]!.id}', 'Doe', CURRENT_DATE)
        `);
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("null");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject leave_type without category", async () => {
      if (!db || !tenant) return;

      try {
        await db.unsafe(`
          INSERT INTO app.leave_types (tenant_id, code, name)
          VALUES ('${tenant.id}', 'NOCAT', 'No Category')
        `);
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("null");
      }
    });
  });

  // ===========================================================================
  // CHECK Constraints
  // ===========================================================================
  describe("CHECK constraints", () => {
    it("should reject termination_date before hire_date", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date, termination_date, termination_reason)
          VALUES (${tenant.id}::uuid, 'CV-CHECK-1', 'terminated', '2025-06-01', '2025-05-01', 'Test')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("employees_termination_after_hire");
      }
    });

    it("should reject terminated employee without termination_date", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date, termination_reason)
          VALUES (${tenant.id}::uuid, 'CV-CHECK-2', 'terminated', '2025-06-01', 'Test')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("employees_terminated_has_date");
      }
    });

    it("should reject terminated employee without termination_reason", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date, termination_date)
          VALUES (${tenant.id}::uuid, 'CV-CHECK-3', 'terminated', '2025-06-01', '2025-12-31')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("employees_terminated_has_reason");
      }
    });

    it("should reject leave_type code with invalid format", async () => {
      if (!db || !tenant) return;

      // Code must match ^[A-Z][A-Z0-9_]*$
      try {
        await db`
          INSERT INTO app.leave_types (tenant_id, code, name, category)
          VALUES (${tenant.id}::uuid, 'invalid-code', 'Invalid Code', 'annual')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_types_code_format");
      }
    });

    it("should reject leave_type with negative min_notice_days", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.leave_types (tenant_id, code, name, category, min_notice_days)
          VALUES (${tenant.id}::uuid, 'BADNOTICE', 'Bad Notice', 'annual', -1)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_types_min_notice_check");
      }
    });

    it("should reject leave_balance with negative opening_balance", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CHECK-LB-${suffix}`;

      // Create prerequisite data
      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'CV_CHECK_LT_' + suffix}, 'Check Leave Type', 'annual')
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2026, -10)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_balances_opening_check");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject leave_balance with year outside valid range", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CHECK-YR-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'CV_CHECK_YR_' + suffix}, 'Year Check', 'annual')
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2200)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_balances_year_check");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject leave_request with end_date before start_date", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CHECK-LR-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', '2025-01-01')
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'CV_CHECK_LR_' + suffix}, 'Leave Type Check', 'annual')
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.leave_requests (tenant_id, employee_id, leave_type_id, status, start_date, end_date, duration)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 'draft', '2026-06-15', '2026-06-10', 5)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_requests_date_range");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject leave_request with zero duration", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CHECK-DUR-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', '2025-01-01')
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'CV_CHECK_DUR_' + suffix}, 'Duration Check', 'annual')
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.leave_requests (tenant_id, employee_id, leave_type_id, status, start_date, end_date, duration)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 'draft', '2026-06-15', '2026-06-15', 0)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_requests_duration_check");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject employee_personal effective_to before effective_from", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CHECK-ED-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, effective_to)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, 'Jane', 'Doe', '2026-06-01', '2026-05-01')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("employee_personal_effective_dates");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject employee_personal with nationality format violation", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-CHECK-NAT-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      try {
        await db`
          INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, nationality)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, 'Jane', 'Doe', CURRENT_DATE, 'gb')
        `;
        expect(true).toBe(false);
      } catch (error) {
        // Should fail on the CHECK constraint for nationality format (^[A-Z]{2,3}$)
        expect(String(error)).toContain("employee_personal_nationality_format");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });
  });

  // ===========================================================================
  // State Machine Triggers
  // ===========================================================================
  describe("State machine triggers", () => {
    it("should reject invalid employee status transition: pending -> terminated", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-SM-1-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      try {
        await db`
          UPDATE app.employees
          SET status = 'terminated', termination_date = CURRENT_DATE, termination_reason = 'Test'
          WHERE id = ${emp[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Invalid status transition");
        expect(String(error)).toContain("pending can only transition to active");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject invalid employee status transition: terminated -> active", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-SM-2-${suffix}`;

      // Create active then terminate
      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      await db`UPDATE app.employees SET status = 'active' WHERE id = ${emp[0]!.id}::uuid`;
      await db`
        UPDATE app.employees
        SET status = 'terminated', termination_date = CURRENT_DATE, termination_reason = 'Test'
        WHERE id = ${emp[0]!.id}::uuid
      `;

      try {
        await db`
          UPDATE app.employees SET status = 'active' WHERE id = ${emp[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("terminated is a terminal state");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should allow valid employee status transition: pending -> active -> on_leave -> active", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-SM-VALID-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      // pending -> active
      await db`UPDATE app.employees SET status = 'active' WHERE id = ${emp[0]!.id}::uuid`;
      let result = await db<{ status: string }[]>`SELECT status FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      expect(result[0]!.status).toBe("active");

      // active -> on_leave
      await db`UPDATE app.employees SET status = 'on_leave' WHERE id = ${emp[0]!.id}::uuid`;
      result = await db<{ status: string }[]>`SELECT status FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      expect(result[0]!.status).toBe("on_leave");

      // on_leave -> active
      await db`UPDATE app.employees SET status = 'active' WHERE id = ${emp[0]!.id}::uuid`;
      result = await db<{ status: string }[]>`SELECT status FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      expect(result[0]!.status).toBe("active");

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject invalid leave_request status transition: draft -> approved", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-SM-LR-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', '2025-01-01')
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'CV_SM_LR_' + suffix}, 'SM Leave', 'annual')
        RETURNING id
      `;

      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (tenant_id, employee_id, leave_type_id, status, start_date, end_date, duration)
        VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 'draft', '2026-12-01', '2026-12-05', 5)
        RETURNING id
      `;

      try {
        await db`
          UPDATE app.leave_requests
          SET status = 'approved', approved_at = now(), approved_by = ${user.id}::uuid
          WHERE id = ${lr[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Invalid status transition");
        expect(String(error)).toContain("draft can only transition to pending or cancelled");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lr[0]!.id}::uuid`;
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should reject leave_request transition from rejected (terminal state)", async () => {
      if (!db || !tenant) return;
      const empNum = `CV-SM-LR2-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', '2025-01-01')
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'CV_SM_LR2_' + suffix}, 'SM Leave 2', 'annual')
        RETURNING id
      `;

      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (tenant_id, employee_id, leave_type_id, status, start_date, end_date, duration)
        VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 'draft', '2026-12-01', '2026-12-05', 5)
        RETURNING id
      `;

      // draft -> pending -> rejected
      await db`UPDATE app.leave_requests SET status = 'pending', submitted_at = now() WHERE id = ${lr[0]!.id}::uuid`;
      await db`
        UPDATE app.leave_requests
        SET status = 'rejected', rejected_at = now(), rejected_by = ${user.id}::uuid, rejection_reason = 'Budget constraints'
        WHERE id = ${lr[0]!.id}::uuid
      `;

      // Trying to move from rejected should fail
      try {
        await db`UPDATE app.leave_requests SET status = 'pending' WHERE id = ${lr[0]!.id}::uuid`;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("rejected is a terminal state");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lr[0]!.id}::uuid`;
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${emp[0]!.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });
  });
});
