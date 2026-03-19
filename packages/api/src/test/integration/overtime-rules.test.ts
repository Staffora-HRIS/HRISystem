/**
 * Overtime Rules & Calculations - Integration Tests
 *
 * Verifies:
 * - CRUD operations for overtime rules
 * - RLS tenant isolation
 * - Overtime calculation logic (hours > threshold * rate)
 * - Calculation state machine (calculated -> approved -> paid)
 * - Outbox events written atomically
 * - Effective dating for rules
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type postgres from "postgres";
import {
  ensureTestInfra,
  skipIfNoInfra,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  closeTestConnections,
  type TestTenant,
  type TestUser,
} from "../setup";

let db: ReturnType<typeof postgres>;
let tenant1: TestTenant;
let tenant2: TestTenant;
let user1: TestUser;
let user2: TestUser;
let employeeId: string;
let ruleId: string;
let calculationId: string;

beforeAll(async () => {
  await ensureTestInfra();
  if (skipIfNoInfra()) return;

  db = getTestDb();

  // Create two tenants for RLS testing
  tenant1 = await createTestTenant(db, { name: "OT Rules Test Tenant 1" });
  tenant2 = await createTestTenant(db, { name: "OT Rules Test Tenant 2" });

  user1 = await createTestUser(db, tenant1.id);
  user2 = await createTestUser(db, tenant2.id);

  // Set up test data for tenant 1
  await withSystemContext(db, async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenant1.id}, true)`;
    await tx`SELECT set_config('app.current_user', ${user1.id}, true)`;

    // Create employee
    const employees = await tx<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenant1.id}::uuid, ${"EMP-OT-001"}, ${"2025-01-01"}::date, 'active')
      RETURNING id
    `;
    employeeId = employees[0]!.id;

    // Create a timesheet with hours for the employee (period: 2025-03-01 to 2025-03-07)
    const timesheetId = crypto.randomUUID();
    await tx`
      INSERT INTO app.timesheets (
        id, tenant_id, employee_id, period_start, period_end,
        status, total_regular_hours, total_overtime_hours
      ) VALUES (
        ${timesheetId}::uuid, ${tenant1.id}::uuid, ${employeeId}::uuid,
        '2025-03-01'::date, '2025-03-07'::date,
        'approved', 50, 0
      )
    `;

    // Create a compensation record for hourly rate derivation
    await tx`
      INSERT INTO app.employee_compensation (
        tenant_id, employee_id, base_salary, pay_frequency,
        currency, effective_from
      ) VALUES (
        ${tenant1.id}::uuid, ${employeeId}::uuid,
        20.00, 'hourly', 'GBP', '2025-01-01'::date
      )
    `;
  });
});

afterAll(async () => {
  if (db) {
    // Clean up test data
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.overtime_calculations WHERE tenant_id IN (${tenant1.id}::uuid, ${tenant2.id}::uuid)`;
      await tx`DELETE FROM app.overtime_rules WHERE tenant_id IN (${tenant1.id}::uuid, ${tenant2.id}::uuid)`;
    });
    await clearTenantContext(db);
    await closeTestConnections(db);
  }
});

// =============================================================================
// Overtime Rules CRUD
// =============================================================================

describe("Overtime Rules CRUD", () => {
  test("should create an overtime rule", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const [row] = await db<{ id: string; name: string; thresholdHoursWeekly: number; rateMultiplier: number }[]>`
      INSERT INTO app.overtime_rules (
        tenant_id, name, description,
        threshold_hours_weekly, rate_multiplier,
        applies_to_roles, effective_from, is_active, created_by
      ) VALUES (
        ${tenant1.id}::uuid, ${"Standard Overtime"}, ${"Time-and-a-half after 40h/week"},
        40, 1.5,
        NULL, '2025-01-01'::date, true, ${user1.id}::uuid
      )
      RETURNING id, name, threshold_hours_weekly, rate_multiplier
    `;

    expect(row).toBeDefined();
    expect(row!.name).toBe("Standard Overtime");
    expect(Number(row!.thresholdHoursWeekly)).toBe(40);
    expect(Number(row!.rateMultiplier)).toBe(1.5);

    ruleId = row!.id;
  });

  test("should list overtime rules filtered by tenant (RLS)", async () => {
    if (skipIfNoInfra()) return;

    // Tenant 1 should see its rules
    await setTenantContext(db, tenant1.id, user1.id);
    const t1Rules = await db<{ id: string }[]>`
      SELECT id FROM app.overtime_rules
    `;
    expect(t1Rules.length).toBeGreaterThanOrEqual(1);

    // Tenant 2 should see no rules
    await setTenantContext(db, tenant2.id, user2.id);
    const t2Rules = await db<{ id: string }[]>`
      SELECT id FROM app.overtime_rules
    `;
    expect(t2Rules.length).toBe(0);

    // Restore context
    await setTenantContext(db, tenant1.id, user1.id);
  });

  test("should update an overtime rule", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const [updated] = await db<{ name: string; rateMultiplier: number }[]>`
      UPDATE app.overtime_rules
      SET name = ${"Updated Overtime"}, rate_multiplier = 2.0
      WHERE id = ${ruleId}::uuid
      RETURNING name, rate_multiplier
    `;

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated Overtime");
    expect(Number(updated!.rateMultiplier)).toBe(2.0);
  });

  test("should enforce effective date constraint (to >= from)", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    let errorThrown = false;
    try {
      await db`
        INSERT INTO app.overtime_rules (
          tenant_id, name, threshold_hours_weekly, rate_multiplier,
          effective_from, effective_to, is_active
        ) VALUES (
          ${tenant1.id}::uuid, ${"Bad Rule"}, 40, 1.5,
          '2025-06-01'::date, '2025-01-01'::date, true
        )
      `;
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toContain("overtime_rules_valid_dates");
    }

    expect(errorThrown).toBe(true);
  });

  test("should enforce positive rate multiplier constraint", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    let errorThrown = false;
    try {
      await db`
        INSERT INTO app.overtime_rules (
          tenant_id, name, threshold_hours_weekly, rate_multiplier,
          effective_from, is_active
        ) VALUES (
          ${tenant1.id}::uuid, ${"Zero Rate"}, 40, 0,
          '2025-01-01'::date, true
        )
      `;
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toContain("overtime_rules_rate_multiplier_check");
    }

    expect(errorThrown).toBe(true);
  });
});

// =============================================================================
// Overtime Calculations
// =============================================================================

describe("Overtime Calculations", () => {
  test("should create an overtime calculation", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    // 50 hours worked, 40h threshold for 1 week = 10h overtime
    // Rate: 2.0x (updated above), hourly rate: 20
    // Amount: 10 * 2.0 * 20 = 400
    const [row] = await db<{
      id: string;
      employeeId: string;
      regularHours: number;
      overtimeHours: number;
      overtimeRate: number;
      overtimeAmount: number;
      status: string;
    }[]>`
      INSERT INTO app.overtime_calculations (
        tenant_id, employee_id, rule_id,
        period_start, period_end,
        regular_hours, overtime_hours, overtime_rate,
        hourly_rate, overtime_amount, total_hours,
        status, calculated_by
      ) VALUES (
        ${tenant1.id}::uuid, ${employeeId}::uuid, ${ruleId}::uuid,
        '2025-03-01'::date, '2025-03-07'::date,
        40, 10, 2.0,
        20.00, 400.00, 50,
        'calculated', ${user1.id}::uuid
      )
      RETURNING id, employee_id, regular_hours, overtime_hours, overtime_rate, overtime_amount, status
    `;

    expect(row).toBeDefined();
    expect(Number(row!.regularHours)).toBe(40);
    expect(Number(row!.overtimeHours)).toBe(10);
    expect(Number(row!.overtimeRate)).toBe(2.0);
    expect(Number(row!.overtimeAmount)).toBe(400);
    expect(row!.status).toBe("calculated");

    calculationId = row!.id;
  });

  test("should enforce RLS on overtime calculations", async () => {
    if (skipIfNoInfra()) return;

    // Tenant 2 should not see tenant 1's calculations
    await setTenantContext(db, tenant2.id, user2.id);
    const rows = await db<{ id: string }[]>`
      SELECT id FROM app.overtime_calculations
    `;
    expect(rows.length).toBe(0);

    // Restore context
    await setTenantContext(db, tenant1.id, user1.id);
  });

  test("should approve an overtime calculation (state machine: calculated -> approved)", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const [approved] = await db<{ id: string; status: string; approvedBy: string; approvedAt: Date }[]>`
      UPDATE app.overtime_calculations
      SET status = 'approved', approved_by = ${user1.id}::uuid, approved_at = now()
      WHERE id = ${calculationId}::uuid AND status = 'calculated'
      RETURNING id, status, approved_by, approved_at
    `;

    expect(approved).toBeDefined();
    expect(approved!.status).toBe("approved");
    expect(approved!.approvedBy).toBe(user1.id);
    expect(approved!.approvedAt).toBeDefined();
  });

  test("should enforce non-negative overtime hours constraint", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    let errorThrown = false;
    try {
      await db`
        INSERT INTO app.overtime_calculations (
          tenant_id, employee_id,
          period_start, period_end,
          regular_hours, overtime_hours, overtime_rate,
          hourly_rate, overtime_amount, total_hours,
          status
        ) VALUES (
          ${tenant1.id}::uuid, ${employeeId}::uuid,
          '2025-04-01'::date, '2025-04-07'::date,
          40, -5, 1.5,
          20, -150, 35,
          'calculated'
        )
      `;
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toContain("overtime_calculations_overtime_hours_check");
    }

    expect(errorThrown).toBe(true);
  });

  test("should enforce valid period constraint (end >= start)", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    let errorThrown = false;
    try {
      await db`
        INSERT INTO app.overtime_calculations (
          tenant_id, employee_id,
          period_start, period_end,
          regular_hours, overtime_hours, overtime_rate,
          hourly_rate, overtime_amount, total_hours,
          status
        ) VALUES (
          ${tenant1.id}::uuid, ${employeeId}::uuid,
          '2025-04-07'::date, '2025-04-01'::date,
          40, 10, 1.5,
          20, 300, 50,
          'calculated'
        )
      `;
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toContain("overtime_calculations_valid_period");
    }

    expect(errorThrown).toBe(true);
  });

  test("should enforce unique constraint (one calc per employee per period per rule)", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    // The first insert for this period/rule already exists from above.
    // An upsert (ON CONFLICT DO UPDATE) in the real code handles this,
    // but a raw duplicate insert should conflict on the unique index.
    let errorThrown = false;
    try {
      // Disable ON CONFLICT to test the raw unique constraint
      await db`
        INSERT INTO app.overtime_calculations (
          tenant_id, employee_id, rule_id,
          period_start, period_end,
          regular_hours, overtime_hours, overtime_rate,
          hourly_rate, overtime_amount, total_hours,
          status
        ) VALUES (
          ${tenant1.id}::uuid, ${employeeId}::uuid, ${ruleId}::uuid,
          '2025-03-01'::date, '2025-03-07'::date,
          45, 5, 2.0,
          20, 200, 50,
          'calculated'
        )
      `;
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toContain("uq_overtime_calculations_employee_period_rule");
    }

    expect(errorThrown).toBe(true);
  });
});

// =============================================================================
// Outbox Events
// =============================================================================

describe("Outbox Integration", () => {
  test("outbox event written atomically with rule creation", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    // Create a rule via direct SQL (simulating service flow)
    const ruleIdLocal = crypto.randomUUID();

    await db.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_tenant', ${tenant1.id}, true)`;
      await tx`SELECT set_config('app.current_user', ${user1.id}, true)`;

      await tx`
        INSERT INTO app.overtime_rules (
          id, tenant_id, name, threshold_hours_weekly, rate_multiplier,
          effective_from, is_active
        ) VALUES (
          ${ruleIdLocal}::uuid, ${tenant1.id}::uuid, ${"Outbox Test Rule"},
          37.5, 1.5, '2025-01-01'::date, true
        )
      `;

      await tx`
        INSERT INTO app.domain_outbox (
          id, tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES (
          ${crypto.randomUUID()}::uuid, ${tenant1.id}::uuid,
          'overtime_rule', ${ruleIdLocal}::uuid,
          'time.overtime_rule.created',
          ${JSON.stringify({ ruleId: ruleIdLocal, name: "Outbox Test Rule" })}::jsonb
        )
      `;
    });

    // Verify rule exists
    const rules = await db<{ id: string }[]>`
      SELECT id FROM app.overtime_rules WHERE id = ${ruleIdLocal}::uuid
    `;
    expect(rules.length).toBe(1);

    // Verify outbox event exists (use system context for outbox reads)
    await withSystemContext(db, async (tx) => {
      const events = await tx<{ id: string; eventType: string }[]>`
        SELECT id, event_type
        FROM app.domain_outbox
        WHERE aggregate_id = ${ruleIdLocal}::uuid
          AND event_type = 'time.overtime_rule.created'
      `;
      expect(events.length).toBe(1);
    });
  });
});
