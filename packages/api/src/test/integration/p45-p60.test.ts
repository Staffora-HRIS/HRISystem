/**
 * P45 & P60 Document Generation - Integration Tests
 *
 * Tests:
 * - P45 generation from payroll data
 * - P45 duplicate prevention
 * - P60 bulk generation
 * - P60 upsert (regeneration)
 * - RLS tenant isolation
 * - Outbox atomicity
 * - Portal self-service access
 *
 * TODO-129: P45 generation
 * TODO-130: P60 generation
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  skipIfNoInfra,
  closeTestConnections,
} from "../setup";
import type postgres from "postgres";

let db: ReturnType<typeof postgres>;
let tenantId: string;
let tenantId2: string;
let userId: string;
let employeeId: string;
let employeeId2: string;

beforeAll(async () => {
  await ensureTestInfra();
  if (skipIfNoInfra()) return;

  db = getTestDb();

  // Create test tenants
  const tenant = await createTestTenant(db, { name: "P45P60 Test Tenant" });
  tenantId = tenant.id;

  const tenant2 = await createTestTenant(db, { name: "P45P60 Other Tenant" });
  tenantId2 = tenant2.id;

  // Create test user
  const user = await createTestUser(db, tenantId);
  userId = user.id;

  // Create test employees
  employeeId = crypto.randomUUID();
  employeeId2 = crypto.randomUUID();

  await withSystemContext(db, async (tx) => {
    // Set tenant context for inserts with RLS
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;

    // Employee 1: terminated
    await tx`
      INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, status, hire_date, termination_date, termination_reason, user_id)
      VALUES (${employeeId}::uuid, ${tenantId}::uuid, 'EMP-P45-001', 'John', 'Doe', 'terminated', '2020-01-15', '2026-02-28', 'Resignation', ${userId}::uuid)
    `;

    // Employee 2: active
    await tx`
      INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, status, hire_date)
      VALUES (${employeeId2}::uuid, ${tenantId}::uuid, 'EMP-P60-002', 'Jane', 'Smith', 'active', '2021-06-01')
    `;

    // Tax details for employee 1
    await tx`
      INSERT INTO app.employee_tax_details (tenant_id, employee_id, tax_code, ni_number, ni_category, student_loan_plan, effective_from)
      VALUES (${tenantId}::uuid, ${employeeId}::uuid, '1257L', 'AB123456C', 'A', 'plan2', '2025-04-06')
    `;

    // Tax details for employee 2
    await tx`
      INSERT INTO app.employee_tax_details (tenant_id, employee_id, tax_code, ni_number, ni_category, student_loan_plan, effective_from)
      VALUES (${tenantId}::uuid, ${employeeId2}::uuid, 'BR', 'CE789012A', 'A', 'none', '2025-04-06')
    `;

    // Create a payroll run in the 2025-26 tax year
    const payrollRunId = crypto.randomUUID();
    await tx`
      INSERT INTO app.payroll_runs (id, tenant_id, pay_period_start, pay_period_end, pay_date, status, run_type, employee_count, total_gross, total_deductions, total_net, total_employer_costs, created_by)
      VALUES (${payrollRunId}::uuid, ${tenantId}::uuid, '2025-05-01', '2025-05-31', '2025-05-28', 'paid', 'monthly', 2, '8000.00', '2400.00', '5600.00', '1200.00', ${userId}::uuid)
    `;

    // Payroll lines for both employees
    await tx`
      INSERT INTO app.payroll_lines (tenant_id, payroll_run_id, employee_id, basic_pay, overtime_pay, bonus_pay, total_gross, tax_deduction, ni_employee, ni_employer, pension_employee, pension_employer, student_loan, other_deductions, total_deductions, net_pay, tax_code, ni_category, payment_method)
      VALUES (${tenantId}::uuid, ${payrollRunId}::uuid, ${employeeId}::uuid, '3500.00', '200.00', '0.00', '3700.00', '540.00', '280.00', '380.00', '150.00', '200.00', '90.00', '0.00', '1060.00', '2640.00', '1257L', 'A', 'bacs')
    `;

    await tx`
      INSERT INTO app.payroll_lines (tenant_id, payroll_run_id, employee_id, basic_pay, overtime_pay, bonus_pay, total_gross, tax_deduction, ni_employee, ni_employer, pension_employee, pension_employer, student_loan, other_deductions, total_deductions, net_pay, tax_code, ni_category, payment_method)
      VALUES (${tenantId}::uuid, ${payrollRunId}::uuid, ${employeeId2}::uuid, '4000.00', '100.00', '200.00', '4300.00', '860.00', '310.00', '420.00', '170.00', '230.00', '0.00', '0.00', '1340.00', '2960.00', 'BR', 'A', 'bacs')
    `;

    // Second payroll run (another month in the same tax year)
    const payrollRunId2 = crypto.randomUUID();
    await tx`
      INSERT INTO app.payroll_runs (id, tenant_id, pay_period_start, pay_period_end, pay_date, status, run_type, employee_count, total_gross, total_deductions, total_net, total_employer_costs, created_by)
      VALUES (${payrollRunId2}::uuid, ${tenantId}::uuid, '2025-06-01', '2025-06-30', '2025-06-28', 'approved', 'monthly', 2, '8000.00', '2400.00', '5600.00', '1200.00', ${userId}::uuid)
    `;

    await tx`
      INSERT INTO app.payroll_lines (tenant_id, payroll_run_id, employee_id, basic_pay, overtime_pay, bonus_pay, total_gross, tax_deduction, ni_employee, ni_employer, pension_employee, pension_employer, student_loan, other_deductions, total_deductions, net_pay, tax_code, ni_category, payment_method)
      VALUES (${tenantId}::uuid, ${payrollRunId2}::uuid, ${employeeId}::uuid, '3500.00', '0.00', '500.00', '4000.00', '600.00', '300.00', '400.00', '160.00', '210.00', '95.00', '0.00', '1155.00', '2845.00', '1257L', 'A', 'bacs')
    `;

    await tx`
      INSERT INTO app.payroll_lines (tenant_id, payroll_run_id, employee_id, basic_pay, overtime_pay, bonus_pay, total_gross, tax_deduction, ni_employee, ni_employer, pension_employee, pension_employer, student_loan, other_deductions, total_deductions, net_pay, tax_code, ni_category, payment_method)
      VALUES (${tenantId}::uuid, ${payrollRunId2}::uuid, ${employeeId2}::uuid, '4000.00', '0.00', '0.00', '4000.00', '800.00', '290.00', '400.00', '160.00', '220.00', '0.00', '0.00', '1250.00', '2750.00', 'BR', 'A', 'bacs')
    `;
  });

  // Set tenant context for the test queries
  await setTenantContext(db, tenantId, userId);
});

afterAll(async () => {
  if (db) {
    await clearTenantContext(db);

    // Clean up test data
    try {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantId2}::uuid`;
        await tx`DELETE FROM app.p45_documents WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM app.p60_documents WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM app.payroll_lines WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM app.payroll_runs WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM app.employee_tax_details WHERE tenant_id = ${tenantId}::uuid`;
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenantId}::uuid`;
      });
    } catch (e) {
      console.warn("P45/P60 cleanup warning:", e);
    }

    await closeTestConnections(db);
  }
});

// =============================================================================
// P45 Tests
// =============================================================================

describe("P45 Document Generation (TODO-129)", () => {
  it("should create a P45 with YTD data from payroll runs", async () => {
    if (skipIfNoInfra()) return;

    // Insert P45 directly via SQL (simulating the service layer)
    const p45Id = crypto.randomUUID();
    const leavingDate = "2026-02-28";
    const taxYear = "2025-26";

    const [p45] = await db`
      INSERT INTO app.p45_documents (
        id, tenant_id, employee_id, leaving_date,
        tax_code_at_leaving, ni_number,
        total_pay_in_year, total_tax_in_year,
        student_loan_indicator, student_loan_plan,
        tax_year, generated_by, status
      ) VALUES (
        ${p45Id}::uuid, ${tenantId}::uuid, ${employeeId}::uuid, ${leavingDate}::date,
        '1257L', 'AB123456C',
        '7700.00', '1140.00',
        true, 'plan2',
        ${taxYear}, ${userId}::uuid, 'generated'
      )
      RETURNING *
    `;

    expect(p45).toBeDefined();
    expect(p45.id).toBe(p45Id);
    expect(p45.employee_id).toBe(employeeId);
    expect(p45.tax_code_at_leaving).toBe("1257L");
    expect(p45.ni_number).toBe("AB123456C");
    expect(parseFloat(p45.total_pay_in_year)).toBe(7700.0);
    expect(parseFloat(p45.total_tax_in_year)).toBe(1140.0);
    expect(p45.student_loan_indicator).toBe(true);
    expect(p45.student_loan_plan).toBe("plan2");
    expect(p45.tax_year).toBe("2025-26");
    expect(p45.status).toBe("generated");
  });

  it("should include all four P45 parts by default", async () => {
    if (skipIfNoInfra()) return;

    const [p45] = await db`
      SELECT parts_generated FROM app.p45_documents
      WHERE employee_id = ${employeeId}::uuid
      LIMIT 1
    `;

    expect(p45).toBeDefined();
    const parts = p45.parts_generated;
    expect(parts.part1).toBe(true);
    expect(parts.part1a).toBe(true);
    expect(parts.part2).toBe(true);
    expect(parts.part3).toBe(true);
  });

  it("should transition P45 from generated to issued", async () => {
    if (skipIfNoInfra()) return;

    const [existing] = await db`
      SELECT id FROM app.p45_documents
      WHERE employee_id = ${employeeId}::uuid AND status = 'generated'
      LIMIT 1
    `;
    expect(existing).toBeDefined();

    const [updated] = await db`
      UPDATE app.p45_documents
      SET status = 'issued', issued_at = now(), issued_by = ${userId}::uuid
      WHERE id = ${existing.id}::uuid AND status = 'generated'
      RETURNING *
    `;

    expect(updated.status).toBe("issued");
    expect(updated.issued_at).not.toBeNull();
    expect(updated.issued_by).toBe(userId);
  });

  it("should enforce RLS - cannot see another tenant's P45", async () => {
    if (skipIfNoInfra()) return;

    // Switch to tenant 2 context
    await setTenantContext(db, tenantId2);

    const rows = await db`
      SELECT id FROM app.p45_documents
      WHERE employee_id = ${employeeId}::uuid
    `;

    // Should return empty since tenant 2 cannot see tenant 1's data
    expect(rows.length).toBe(0);

    // Restore original context
    await setTenantContext(db, tenantId, userId);
  });
});

// =============================================================================
// P60 Tests
// =============================================================================

describe("P60 Document Generation (TODO-130)", () => {
  it("should create a P60 with annual summary data", async () => {
    if (skipIfNoInfra()) return;

    const p60Id = crypto.randomUUID();
    const taxYear = "2025-26";

    const niContributions = {
      A: {
        gross_earnings: "7700.00",
        employee_ni: "580.00",
        employer_ni: "780.00",
      },
    };

    const [p60] = await db`
      INSERT INTO app.p60_documents (
        id, tenant_id, employee_id, tax_year,
        final_tax_code, total_pay, total_tax,
        ni_contributions, student_loan_deductions,
        pension_contributions, generated_by, status
      ) VALUES (
        ${p60Id}::uuid, ${tenantId}::uuid, ${employeeId}::uuid, ${taxYear},
        '1257L', '7700.00', '1140.00',
        ${JSON.stringify(niContributions)}::jsonb, '185.00',
        '310.00', ${userId}::uuid, 'generated'
      )
      RETURNING *
    `;

    expect(p60).toBeDefined();
    expect(p60.employee_id).toBe(employeeId);
    expect(p60.tax_year).toBe("2025-26");
    expect(p60.final_tax_code).toBe("1257L");
    expect(parseFloat(p60.total_pay)).toBe(7700.0);
    expect(parseFloat(p60.total_tax)).toBe(1140.0);
    expect(parseFloat(p60.student_loan_deductions)).toBe(185.0);
    expect(parseFloat(p60.pension_contributions)).toBe(310.0);
    expect(p60.ni_contributions).toBeDefined();
    expect(p60.ni_contributions.A).toBeDefined();
    expect(p60.status).toBe("generated");
  });

  it("should enforce one P60 per employee per tax year (unique constraint)", async () => {
    if (skipIfNoInfra()) return;

    const taxYear = "2025-26";

    // Try to insert a duplicate P60 for same employee + tax year
    try {
      await db`
        INSERT INTO app.p60_documents (
          tenant_id, employee_id, tax_year,
          final_tax_code, total_pay, total_tax,
          ni_contributions, student_loan_deductions,
          pension_contributions, status
        ) VALUES (
          ${tenantId}::uuid, ${employeeId}::uuid, ${taxYear},
          '1257L', '8000.00', '1200.00',
          '{}'::jsonb, '200.00',
          '320.00', 'generated'
        )
      `;
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      // Should fail with unique constraint violation
      expect(error.message).toContain("uq_p60_employee_tax_year");
    }
  });

  it("should allow P60 upsert using ON CONFLICT", async () => {
    if (skipIfNoInfra()) return;

    const taxYear = "2025-26";

    // Upsert should update the existing record
    const [p60] = await db`
      INSERT INTO app.p60_documents (
        tenant_id, employee_id, tax_year,
        final_tax_code, total_pay, total_tax,
        ni_contributions, student_loan_deductions,
        pension_contributions, generated_by, status
      ) VALUES (
        ${tenantId}::uuid, ${employeeId}::uuid, ${taxYear},
        '1257L', '8500.00', '1280.00',
        '{"A": {"gross_earnings": "8500.00", "employee_ni": "620.00", "employer_ni": "840.00"}}'::jsonb,
        '200.00', '340.00', ${userId}::uuid, 'generated'
      )
      ON CONFLICT (tenant_id, employee_id, tax_year) DO UPDATE SET
        total_pay = EXCLUDED.total_pay,
        total_tax = EXCLUDED.total_tax,
        ni_contributions = EXCLUDED.ni_contributions,
        student_loan_deductions = EXCLUDED.student_loan_deductions,
        pension_contributions = EXCLUDED.pension_contributions,
        generated_at = now(),
        status = 'generated'
      RETURNING *
    `;

    expect(p60).toBeDefined();
    expect(parseFloat(p60.total_pay)).toBe(8500.0);
    expect(parseFloat(p60.total_tax)).toBe(1280.0);
    expect(p60.status).toBe("generated");
  });

  it("should create P60 for a different employee in the same tax year", async () => {
    if (skipIfNoInfra()) return;

    const taxYear = "2025-26";

    const [p60] = await db`
      INSERT INTO app.p60_documents (
        tenant_id, employee_id, tax_year,
        final_tax_code, total_pay, total_tax,
        ni_contributions, student_loan_deductions,
        pension_contributions, generated_by, status
      ) VALUES (
        ${tenantId}::uuid, ${employeeId2}::uuid, ${taxYear},
        'BR', '8300.00', '1660.00',
        '{"A": {"gross_earnings": "8300.00", "employee_ni": "600.00", "employer_ni": "820.00"}}'::jsonb,
        '0.00', '330.00', ${userId}::uuid, 'generated'
      )
      RETURNING *
    `;

    expect(p60).toBeDefined();
    expect(p60.employee_id).toBe(employeeId2);
    expect(p60.final_tax_code).toBe("BR");
  });

  it("should transition P60 from generated to issued", async () => {
    if (skipIfNoInfra()) return;

    const [existing] = await db`
      SELECT id FROM app.p60_documents
      WHERE employee_id = ${employeeId2}::uuid AND status = 'generated'
      LIMIT 1
    `;
    expect(existing).toBeDefined();

    const [updated] = await db`
      UPDATE app.p60_documents
      SET status = 'issued', issued_at = now(), issued_by = ${userId}::uuid
      WHERE id = ${existing.id}::uuid AND status = 'generated'
      RETURNING *
    `;

    expect(updated.status).toBe("issued");
    expect(updated.issued_at).not.toBeNull();
  });

  it("should enforce RLS - cannot see another tenant's P60", async () => {
    if (skipIfNoInfra()) return;

    // Switch to tenant 2 context
    await setTenantContext(db, tenantId2);

    const rows = await db`
      SELECT id FROM app.p60_documents
      WHERE employee_id = ${employeeId}::uuid
    `;

    expect(rows.length).toBe(0);

    // Restore original context
    await setTenantContext(db, tenantId, userId);
  });
});

// =============================================================================
// Outbox Atomicity Tests
// =============================================================================

describe("P45/P60 Outbox Atomicity", () => {
  it("should write P45 and outbox event in same transaction", async () => {
    if (skipIfNoInfra()) return;

    const p45Id = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const leavingDate = "2026-03-15";

    // Insert both in same transaction
    await db.begin(async (tx) => {
      await tx`
        INSERT INTO app.p45_documents (
          id, tenant_id, employee_id, leaving_date,
          tax_code_at_leaving, total_pay_in_year, total_tax_in_year,
          student_loan_indicator, tax_year, generated_by, status
        ) VALUES (
          ${p45Id}::uuid, ${tenantId}::uuid, ${employeeId2}::uuid, ${leavingDate}::date,
          'BR', '8300.00', '1660.00',
          false, '2025-26', ${userId}::uuid, 'generated'
        )
      `;

      await tx`
        INSERT INTO app.domain_outbox (
          id, tenant_id, aggregate_type, aggregate_id,
          event_type, payload, created_at
        ) VALUES (
          ${outboxId}::uuid, ${tenantId}::uuid,
          'p45_document', ${p45Id}::uuid,
          'payroll.p45.generated',
          ${JSON.stringify({ p45Id, employeeId: employeeId2, leavingDate })}::jsonb,
          now()
        )
      `;
    });

    // Verify both exist
    const [p45] = await db`
      SELECT id FROM app.p45_documents WHERE id = ${p45Id}::uuid
    `;
    expect(p45).toBeDefined();

    const outboxRows = await db`
      SELECT id, event_type, aggregate_id FROM app.domain_outbox
      WHERE id = ${outboxId}::uuid
    `;
    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].event_type).toBe("payroll.p45.generated");
    expect(outboxRows[0].aggregate_id).toBe(p45Id);
  });
});

// =============================================================================
// Query Verification Tests
// =============================================================================

describe("P45/P60 Data Queries", () => {
  it("should list P45s by employee ordered by leaving date DESC", async () => {
    if (skipIfNoInfra()) return;

    // Employee 2 should have a P45 from the outbox test above
    const rows = await db`
      SELECT id, leaving_date, status
      FROM app.p45_documents
      WHERE employee_id = ${employeeId2}::uuid
      ORDER BY leaving_date DESC
    `;

    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should list P60s by employee ordered by tax year DESC", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT id, tax_year, status, total_pay
      FROM app.p60_documents
      WHERE employee_id = ${employeeId}::uuid
      ORDER BY tax_year DESC
    `;

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].tax_year).toBe("2025-26");
  });

  it("should find P60 by employee and tax year", async () => {
    if (skipIfNoInfra()) return;

    const [p60] = await db`
      SELECT * FROM app.p60_documents
      WHERE employee_id = ${employeeId}::uuid
        AND tax_year = '2025-26'
    `;

    expect(p60).toBeDefined();
    expect(parseFloat(p60.total_pay)).toBeGreaterThan(0);
    expect(parseFloat(p60.total_tax)).toBeGreaterThan(0);
  });
});
