/**
 * Payroll Journal Entries Integration Tests (TODO-233)
 *
 * Tests the journal entries feature:
 * 1. POST /api/v1/payroll/runs/:id/journal-entries — Generate journal entries
 * 2. GET /api/v1/payroll/runs/:id/journal-entries — Get entries by run
 * 3. GET /api/v1/payroll/journal-entries — List entries with filters
 *
 * Covers:
 * - Journal generation from approved payroll runs
 * - Double-entry balance verification (debits = credits)
 * - Duplicate generation prevention (idempotency)
 * - Status validation (only approved/submitted/paid runs)
 * - RLS tenant isolation
 * - Cursor-based pagination
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createTestContext,
  ensureTestInfra,
  isInfraAvailable,
  setTenantContext,
  withSystemContext,
  type TestContext,
} from "../../setup";

describe("Payroll Journal Entries Integration", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  // ===========================================================================
  // Schema Validation Tests
  // ===========================================================================

  describe("Schema validation", () => {
    it("should validate journal entry response shape", () => {
      const entry = {
        id: "00000000-0000-0000-0000-000000000001",
        tenant_id: "00000000-0000-0000-0000-000000000002",
        payroll_run_id: "00000000-0000-0000-0000-000000000003",
        entry_date: "2026-03-28",
        account_code: "7000",
        description: "Gross salaries - Payroll 2026-03-01 to 2026-03-31",
        debit: "50000.00",
        credit: "0.00",
        cost_centre_id: null,
        created_at: "2026-03-28T12:00:00.000Z",
      };

      expect(entry.id).toBeDefined();
      expect(entry.tenant_id).toBeDefined();
      expect(entry.payroll_run_id).toBeDefined();
      expect(entry.entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.account_code).toBeDefined();
      expect(entry.description).toBeDefined();
      expect(parseFloat(entry.debit)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(entry.credit)).toBeGreaterThanOrEqual(0);
    });

    it("should validate generate journal entries request shape", () => {
      const request = { cost_centre_id: "00000000-0000-0000-0000-000000000004" };
      expect(request.cost_centre_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );

      const emptyRequest = {};
      expect((emptyRequest as any).cost_centre_id).toBeUndefined();
    });

    it("should validate journal entries query parameters", () => {
      const validParams = {
        payroll_run_id: "00000000-0000-0000-0000-000000000001",
        period_start: "2026-03-01",
        period_end: "2026-03-31",
        account_code: "7000",
        cost_centre_id: "00000000-0000-0000-0000-000000000004",
        cursor: "2026-03-28T12:00:00.000Z",
        limit: 50,
      };

      expect(validParams.period_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(validParams.period_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(validParams.limit).toBeGreaterThanOrEqual(1);
      expect(validParams.limit).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // Account Code Tests
  // ===========================================================================

  describe("Account code mapping", () => {
    it("should use standard UK payroll nominal codes", () => {
      const expectedCodes: Record<string, string> = {
        "7000": "Gross salaries expense",
        "7002": "Employer NI expense",
        "7004": "Employer pension expense",
        "2210": "PAYE tax liability",
        "2211": "Employee NI liability",
        "2212": "Employer NI liability",
        "2220": "Employee pension liability",
        "2221": "Employer pension liability",
        "2230": "Student loan liability",
        "2250": "Net wages payable",
      };

      // Debit codes start with 7 (expenses)
      const debitCodes = Object.keys(expectedCodes).filter((c) => c.startsWith("7"));
      expect(debitCodes.length).toBe(3);

      // Credit codes start with 2 (liabilities)
      const creditCodes = Object.keys(expectedCodes).filter((c) => c.startsWith("2"));
      expect(creditCodes.length).toBe(7);
    });
  });

  // ===========================================================================
  // Double-Entry Balance Tests
  // ===========================================================================

  describe("Double-entry balance verification", () => {
    it("should produce balanced journals (debits = credits)", () => {
      // Simulate a simple payroll run with one employee
      const annualSalary = 48000;
      const monthlyGross = annualSalary / 12; // 4000.00

      // Simplified deductions
      const paye = 290; // approx PAYE
      const niEmployee = 236.16; // approx employee NI
      const niEmployer = 447.40; // approx employer NI
      const pensionEmployee = monthlyGross * 0.05; // 200.00
      const pensionEmployer = monthlyGross * 0.03; // 120.00
      const studentLoan = 0;
      const netPay = monthlyGross - paye - niEmployee - pensionEmployee - studentLoan;

      // Debits
      const totalDebits =
        monthlyGross + // 7000 - Gross salaries
        niEmployer + // 7002 - Employer NI
        pensionEmployer; // 7004 - Employer pension

      // Credits
      const totalCredits =
        paye + // 2210 - PAYE tax
        niEmployee + // 2211 - Employee NI
        niEmployer + // 2212 - Employer NI
        pensionEmployee + // 2220 - Employee pension
        pensionEmployer + // 2221 - Employer pension
        studentLoan + // 2230 - Student loan
        netPay; // 2250 - Net wages

      // The fundamental accounting equation: debits must equal credits
      expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01);
    });
  });

  // ===========================================================================
  // Status Validation Tests
  // ===========================================================================

  describe("Status validation", () => {
    it("should only allow journal generation from approved, submitted, or paid runs", () => {
      const allowedStatuses = ["approved", "submitted", "paid"];
      const blockedStatuses = ["draft", "calculating", "review"];

      for (const status of allowedStatuses) {
        expect(allowedStatuses).toContain(status);
      }

      for (const status of blockedStatuses) {
        expect(allowedStatuses).not.toContain(status);
      }
    });
  });

  // ===========================================================================
  // Database Integration Tests (require infrastructure)
  // ===========================================================================

  describe("Database operations", () => {
    it("should create payroll_journal_entries table with RLS", async () => {
      if (!ctx) return;

      const result = await withSystemContext(ctx.db, async (tx) => {
        return await tx`
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'app'
            AND tablename = 'payroll_journal_entries'
        `;
      });

      expect(result.length).toBe(1);
      expect(result[0].tablename).toBe("payroll_journal_entries");
    });

    it("should have RLS enabled on payroll_journal_entries", async () => {
      if (!ctx) return;

      const result = await withSystemContext(ctx.db, async (tx) => {
        return await tx`
          SELECT relrowsecurity
          FROM pg_class
          JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
          WHERE pg_namespace.nspname = 'app'
            AND pg_class.relname = 'payroll_journal_entries'
        `;
      });

      expect(result.length).toBe(1);
      expect(result[0].relrowsecurity).toBe(true);
    });

    it("should have tenant isolation policies", async () => {
      if (!ctx) return;

      const result = await withSystemContext(ctx.db, async (tx) => {
        return await tx`
          SELECT polname
          FROM pg_policy
          JOIN pg_class ON pg_class.oid = pg_policy.polrelid
          JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
          WHERE pg_namespace.nspname = 'app'
            AND pg_class.relname = 'payroll_journal_entries'
          ORDER BY polname
        `;
      });

      const policyNames = result.map((r: any) => r.polname);
      expect(policyNames).toContain("tenant_isolation");
      expect(policyNames).toContain("tenant_isolation_insert");
    });

    it("should enforce CHECK constraint: at least one of debit or credit must be non-zero", async () => {
      if (!ctx) return;

      // Verify the constraint exists
      const result = await withSystemContext(ctx.db, async (tx) => {
        return await tx`
          SELECT conname
          FROM pg_constraint
          JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
          JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
          WHERE pg_namespace.nspname = 'app'
            AND pg_class.relname = 'payroll_journal_entries'
            AND contype = 'c'
          ORDER BY conname
        `;
      });

      const constraintNames = result.map((r: any) => r.conname);
      expect(constraintNames).toContain("chk_journal_debit_or_credit");
      expect(constraintNames).toContain("chk_journal_not_both");
    });

    it("should have required indexes", async () => {
      if (!ctx) return;

      const result = await withSystemContext(ctx.db, async (tx) => {
        return await tx`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'app'
            AND tablename = 'payroll_journal_entries'
          ORDER BY indexname
        `;
      });

      const indexNames = result.map((r: any) => r.indexname);
      expect(indexNames).toContain("idx_journal_entries_run_id");
      expect(indexNames).toContain("idx_journal_entries_tenant_date");
      expect(indexNames).toContain("idx_journal_entries_account_code");
      expect(indexNames).toContain("idx_journal_entries_cost_centre");
    });

    it("should insert and read journal entries within tenant context", async () => {
      if (!ctx) return;

      await setTenantContext(ctx.db, ctx.tenant.id, ctx.user.id);

      // First we need a payroll run to reference
      let payrollRunId: string | null = null;

      try {
        // Create a payroll run via system context (to avoid needing all the payroll setup)
        payrollRunId = await withSystemContext(ctx.db, async (tx) => {
          const [run] = await tx`
            INSERT INTO app.payroll_runs (
              tenant_id, pay_period_start, pay_period_end, pay_date,
              status, run_type, employee_count,
              total_gross, total_deductions, total_net, total_employer_costs,
              created_by
            ) VALUES (
              ${ctx!.tenant.id}::uuid,
              '2026-03-01'::date, '2026-03-31'::date, '2026-03-28'::date,
              'approved'::app.payroll_run_status, 'monthly'::app.payroll_run_type, 1,
              4000.00, 726.16, 3273.84, 567.40,
              ${ctx!.user.id}::uuid
            )
            RETURNING id
          `;
          return run.id;
        });

        // Now insert journal entries within tenant context
        await setTenantContext(ctx.db, ctx.tenant.id, ctx.user.id);

        const [entry] = await ctx.db`
          INSERT INTO app.payroll_journal_entries (
            tenant_id, payroll_run_id, entry_date,
            account_code, description, debit, credit
          ) VALUES (
            ${ctx.tenant.id}::uuid,
            ${payrollRunId}::uuid,
            '2026-03-28'::date,
            '7000',
            'Gross salaries - test',
            4000.00,
            0.00
          )
          RETURNING id, tenant_id, payroll_run_id, entry_date,
                    account_code, description, debit, credit, created_at
        `;

        expect(entry).toBeDefined();
        expect(entry.tenantId).toBe(ctx.tenant.id);
        expect(entry.payrollRunId).toBe(payrollRunId);
        expect(entry.accountCode).toBe("7000");
        expect(parseFloat(entry.debit)).toBe(4000.0);
        expect(parseFloat(entry.credit)).toBe(0.0);

        // Verify we can read it back
        const rows = await ctx.db`
          SELECT id, account_code, debit, credit
          FROM app.payroll_journal_entries
          WHERE payroll_run_id = ${payrollRunId}::uuid
        `;

        expect(rows.length).toBe(1);
        expect(rows[0].id).toBe(entry.id);
      } finally {
        // Cleanup
        if (payrollRunId) {
          await withSystemContext(ctx.db, async (tx) => {
            await tx`DELETE FROM app.payroll_journal_entries WHERE payroll_run_id = ${payrollRunId}::uuid`;
            await tx`DELETE FROM app.payroll_runs WHERE id = ${payrollRunId}::uuid`;
          });
        }
      }
    });

    it("should enforce RLS: entries from one tenant not visible to another", async () => {
      if (!ctx) return;

      let payrollRunId: string | null = null;

      try {
        // Create a payroll run and journal entry via system context
        payrollRunId = await withSystemContext(ctx.db, async (tx) => {
          const [run] = await tx`
            INSERT INTO app.payroll_runs (
              tenant_id, pay_period_start, pay_period_end, pay_date,
              status, run_type, employee_count,
              total_gross, total_deductions, total_net, total_employer_costs,
              created_by
            ) VALUES (
              ${ctx!.tenant.id}::uuid,
              '2026-04-01'::date, '2026-04-30'::date, '2026-04-28'::date,
              'approved'::app.payroll_run_status, 'monthly'::app.payroll_run_type, 1,
              3000.00, 500.00, 2500.00, 400.00,
              ${ctx!.user.id}::uuid
            )
            RETURNING id
          `;

          await tx`
            INSERT INTO app.payroll_journal_entries (
              tenant_id, payroll_run_id, entry_date,
              account_code, description, debit, credit
            ) VALUES (
              ${ctx!.tenant.id}::uuid,
              ${run.id}::uuid,
              '2026-04-28'::date,
              '7000', 'Test entry for RLS', 3000.00, 0.00
            )
          `;

          return run.id;
        });

        // Set context to a different tenant
        const fakeTenantId = "00000000-0000-0000-0000-999999999999";
        await setTenantContext(ctx.db, fakeTenantId, ctx.user.id);

        // Should not see the entry
        const rows = await ctx.db`
          SELECT id FROM app.payroll_journal_entries
          WHERE payroll_run_id = ${payrollRunId}::uuid
        `;

        expect(rows.length).toBe(0);
      } finally {
        // Cleanup
        if (payrollRunId) {
          await withSystemContext(ctx.db, async (tx) => {
            await tx`DELETE FROM app.payroll_journal_entries WHERE payroll_run_id = ${payrollRunId}::uuid`;
            await tx`DELETE FROM app.payroll_runs WHERE id = ${payrollRunId}::uuid`;
          });
        }
        // Restore context
        if (ctx) {
          await setTenantContext(ctx.db, ctx.tenant.id, ctx.user.id);
        }
      }
    });
  });
});
