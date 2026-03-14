/**
 * Leave Sub-modules & Payroll Config Integration Tests
 *
 * Real integration tests that insert data directly into the database
 * and verify RLS tenant isolation across all leave sub-modules and
 * payroll configuration tables.
 *
 * Modules tested:
 * - SSP (Statutory Sick Pay)
 * - Statutory Leave (Maternity/Paternity/Shared Parental/Adoption)
 * - Bereavement Leave (Jack's Law)
 * - Carer's Leave
 * - Parental Leave (Unpaid)
 * - Return to Work Interviews
 * - Payroll Config (Pay Schedules, NI Categories)
 * - Bank Holidays
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
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
} from "../../setup";

// =============================================================================
// Test Suite
// =============================================================================

describe("Leave & Payroll Routes Integration (RLS)", () => {
  let db: ReturnType<typeof getTestDb>;

  // Tenant A: primary tenant for insert/read tests
  let tenantA: TestTenant;
  let userA: TestUser;

  // Tenant B: used to verify cross-tenant isolation
  let tenantB: TestTenant;
  let userB: TestUser;

  // Shared employee IDs (one per tenant)
  let employeeIdA: string;
  let employeeIdB: string;
  // A second employee in tenant A (used as interviewer for RTW)
  let interviewerIdA: string;

  const suffix = Date.now();

  // Track IDs for cleanup
  const cleanupIds = {
    sspRecords: [] as string[],
    sspDailyLog: [] as string[],
    statutoryLeaveRecords: [] as string[],
    statutoryLeavePayPeriods: [] as string[],
    statutoryLeaveKitDays: [] as string[],
    bereavementLeave: [] as string[],
    carersLeaveEntitlements: [] as string[],
    parentalLeaveEntitlements: [] as string[],
    parentalLeaveBookings: [] as string[],
    returnToWorkInterviews: [] as string[],
    paySchedules: [] as string[],
    employeePayAssignments: [] as string[],
    niCategories: [] as string[],
    bankHolidays: [] as string[],
    employees: [] as string[],
  };

  // =========================================================================
  // Setup / Teardown
  // =========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();

    // Create two tenants
    tenantA = await createTestTenant(db, {
      name: `LP-Test-A-${suffix}`,
      slug: `lp-test-a-${suffix}`,
    });
    tenantB = await createTestTenant(db, {
      name: `LP-Test-B-${suffix}`,
      slug: `lp-test-b-${suffix}`,
    });

    userA = await createTestUser(db, tenantA.id, {
      email: `lp-test-a-${suffix}@example.com`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `lp-test-b-${suffix}@example.com`,
    });

    // Create employees for FK references
    employeeIdA = crypto.randomUUID();
    employeeIdB = crypto.randomUUID();
    interviewerIdA = crypto.randomUUID();

    await withSystemContext(db, async (tx) => {
      // Override dummy app.current_user with real user so employee_status_history
      // trigger can satisfy the created_by FK constraint
      await tx`SELECT set_config('app.current_user', ${userA.id}, true)`;

      // Employee in tenant A
      await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${employeeIdA}::uuid, ${tenantA.id}::uuid, ${"EMP-A-" + suffix}, 'active', '2024-01-15')
      `;
      cleanupIds.employees.push(employeeIdA);

      // Interviewer in tenant A (for RTW tests)
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${interviewerIdA}::uuid, ${tenantA.id}::uuid, ${"INT-A-" + suffix}, 'active', '2023-06-01')
      `;
      cleanupIds.employees.push(interviewerIdA);

      // Employee in tenant B
      await tx`SELECT set_config('app.current_user', ${userB.id}, true)`;
      await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${employeeIdB}::uuid, ${tenantB.id}::uuid, ${"EMP-B-" + suffix}, 'active', '2024-03-01')
      `;
      cleanupIds.employees.push(employeeIdB);
    });
  });

  afterAll(async () => {
    if (!db) return;

    try {
      await withSystemContext(db, async (tx) => {
        // Clean in reverse dependency order
        for (const id of cleanupIds.parentalLeaveBookings) {
          await tx`DELETE FROM app.parental_leave_bookings WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.parentalLeaveEntitlements) {
          await tx`DELETE FROM app.parental_leave_entitlements WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.statutoryLeaveKitDays) {
          await tx`DELETE FROM app.statutory_leave_kit_days WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.statutoryLeavePayPeriods) {
          await tx`DELETE FROM app.statutory_leave_pay_periods WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.statutoryLeaveRecords) {
          await tx`DELETE FROM app.statutory_leave_records WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.sspDailyLog) {
          await tx`DELETE FROM app.ssp_daily_log WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.sspRecords) {
          await tx`DELETE FROM app.ssp_records WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.bereavementLeave) {
          await tx`DELETE FROM app.parental_bereavement_leave WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.carersLeaveEntitlements) {
          await tx`DELETE FROM app.carers_leave_entitlements WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.returnToWorkInterviews) {
          await tx`DELETE FROM app.return_to_work_interviews WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.employeePayAssignments) {
          await tx`DELETE FROM app.employee_pay_assignments WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.niCategories) {
          await tx`DELETE FROM app.ni_categories WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.paySchedules) {
          await tx`DELETE FROM app.pay_schedules WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.bankHolidays) {
          await tx`DELETE FROM app.bank_holidays WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanupIds.employees) {
          await tx`DELETE FROM app.employees WHERE id = ${id}::uuid`.catch(() => {});
        }
      });
    } catch (e) {
      console.warn("leave-payroll cleanup warning:", e);
    }

    await cleanupTestUser(db, userA?.id);
    await cleanupTestUser(db, userB?.id);
    await cleanupTestTenant(db, tenantA?.id);
    await cleanupTestTenant(db, tenantB?.id);
    await closeTestConnections(db);
  });

  // =========================================================================
  // SSP (Statutory Sick Pay)
  // =========================================================================

  describe("SSP Records", () => {
    let sspRecordIdA: string;
    let sspRecordIdB: string;

    it("should create an SSP record for tenant A", async () => {
      sspRecordIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.ssp_records (
            id, tenant_id, employee_id, start_date,
            qualifying_days_pattern, weekly_rate, status,
            waiting_days_served, fit_note_required, created_by
          )
          VALUES (
            ${sspRecordIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            '2026-01-06'::date, '[1,2,3,4,5]'::jsonb, 116.75,
            'active'::app.ssp_record_status, 0, false, ${userA.id}::uuid
          )
          RETURNING id, tenant_id, employee_id, status, weekly_rate
        `;
        expect(row).toBeDefined();
        expect(row.id).toBe(sspRecordIdA);
        expect(row.status).toBe("active");
      });
      cleanupIds.sspRecords.push(sspRecordIdA);
    });

    it("should create an SSP record for tenant B", async () => {
      sspRecordIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.ssp_records (
            id, tenant_id, employee_id, start_date,
            qualifying_days_pattern, weekly_rate, status,
            waiting_days_served, fit_note_required
          )
          VALUES (
            ${sspRecordIdB}::uuid, ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            '2026-02-10'::date, '[1,2,3,4,5]'::jsonb, 116.75,
            'active'::app.ssp_record_status, 3, true
          )
          RETURNING id
        `;
        expect(row.id).toBe(sspRecordIdB);
      });
      cleanupIds.sspRecords.push(sspRecordIdB);
    });

    it("should read SSP records only for tenant A when context is set", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id, employee_id, status
        FROM app.ssp_records
        WHERE id IN (${sspRecordIdA}::uuid, ${sspRecordIdB}::uuid)
      `;

      // Only tenant A's record should be visible
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(sspRecordIdA);
    });

    it("should read SSP records only for tenant B when context is set", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const rows = await db`
        SELECT id, tenant_id, status
        FROM app.ssp_records
        WHERE id IN (${sspRecordIdA}::uuid, ${sspRecordIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(sspRecordIdB);
    });

    it("should end an SSP record by updating status and end_date", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const [updated] = await db`
        UPDATE app.ssp_records
        SET end_date = '2026-01-20'::date,
            status = 'completed'::app.ssp_record_status,
            total_days_paid = 8,
            total_amount_paid = 186.80,
            waiting_days_served = 3,
            updated_at = now()
        WHERE id = ${sspRecordIdA}::uuid
        RETURNING id, status, end_date, total_days_paid
      `;

      expect(updated).toBeDefined();
      expect(updated.status).toBe("completed");
      expect(updated.total_days_paid).toBe(8);
    });

    it("should NOT update tenant B SSP record from tenant A context", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const result = await db`
        UPDATE app.ssp_records
        SET notes = 'Cross-tenant attack'
        WHERE id = ${sspRecordIdB}::uuid
        RETURNING id
      `;

      // RLS should prevent this update from affecting any rows
      expect(result.length).toBe(0);
    });
  });

  // =========================================================================
  // Statutory Leave
  // =========================================================================

  describe("Statutory Leave Records", () => {
    let leaveRecordIdA: string;
    let leaveRecordIdB: string;

    it("should create a statutory leave record for tenant A", async () => {
      leaveRecordIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.statutory_leave_records (
            id, tenant_id, employee_id, leave_type,
            expected_date, start_date, end_date,
            total_weeks, matb1_received, status, created_by
          )
          VALUES (
            ${leaveRecordIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            'maternity'::app.statutory_leave_type,
            '2026-06-15'::date, '2026-04-20'::date, '2027-04-18'::date,
            52, false, 'planned'::app.statutory_leave_status,
            ${userA.id}::uuid
          )
          RETURNING id, leave_type, status, total_weeks
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(leaveRecordIdA);
        expect(row.leave_type).toBe("maternity");
        expect(row.total_weeks).toBe(52);
      });
      cleanupIds.statutoryLeaveRecords.push(leaveRecordIdA);
    });

    it("should create a statutory leave record for tenant B", async () => {
      leaveRecordIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.statutory_leave_records (
            id, tenant_id, employee_id, leave_type,
            expected_date, start_date, end_date,
            total_weeks, matb1_received, status
          )
          VALUES (
            ${leaveRecordIdB}::uuid, ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            'paternity'::app.statutory_leave_type,
            '2026-07-01'::date, '2026-07-01'::date, '2026-07-14'::date,
            2, false, 'planned'::app.statutory_leave_status
          )
          RETURNING id
        `;
        expect(row.id).toBe(leaveRecordIdB);
      });
      cleanupIds.statutoryLeaveRecords.push(leaveRecordIdB);
    });

    it("should isolate statutory leave records by tenant", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.statutory_leave_records
        WHERE id IN (${leaveRecordIdA}::uuid, ${leaveRecordIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(leaveRecordIdA);
    });

    it("should update status from planned to active", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const [row] = await db`
        UPDATE app.statutory_leave_records
        SET status = 'active'::app.statutory_leave_status,
            actual_date = '2026-06-10'::date,
            updated_at = now()
        WHERE id = ${leaveRecordIdA}::uuid
        RETURNING id, status, actual_date
      `;

      expect(row).toBeDefined();
      expect(row.status).toBe("active");
    });

    it("should NOT allow tenant B to read tenant A statutory leave", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const rows = await db`
        SELECT id FROM app.statutory_leave_records
        WHERE id = ${leaveRecordIdA}::uuid
      `;

      expect(rows.length).toBe(0);
    });
  });

  // =========================================================================
  // Bereavement Leave (Jack's Law)
  // =========================================================================

  describe("Bereavement Leave", () => {
    let bereavementIdA: string;
    let bereavementIdB: string;

    it("should create a bereavement leave record for tenant A", async () => {
      bereavementIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.parental_bereavement_leave (
            id, tenant_id, employee_id, child_name,
            date_of_death, leave_start_date, leave_end_date,
            spbp_eligible, status
          )
          VALUES (
            ${bereavementIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            'Test Child', '2026-01-10'::date, '2026-01-10'::date, '2026-01-24'::date,
            false, 'pending'::app.parental_bereavement_status
          )
          RETURNING id, status, child_name
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(bereavementIdA);
        expect(row.status).toBe("pending");
        expect(row.child_name).toBe("Test Child");
      });
      cleanupIds.bereavementLeave.push(bereavementIdA);
    });

    it("should create a bereavement leave record for tenant B", async () => {
      bereavementIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.parental_bereavement_leave (
            id, tenant_id, employee_id, child_name,
            date_of_death, leave_start_date, leave_end_date,
            spbp_eligible, status
          )
          VALUES (
            ${bereavementIdB}::uuid, ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            'Child B', '2026-02-15'::date, '2026-02-15'::date, '2026-02-22'::date,
            true, 'pending'::app.parental_bereavement_status
          )
          RETURNING id
        `;
        expect(row.id).toBe(bereavementIdB);
      });
      cleanupIds.bereavementLeave.push(bereavementIdB);
    });

    it("should isolate bereavement leave records by tenant", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.parental_bereavement_leave
        WHERE id IN (${bereavementIdA}::uuid, ${bereavementIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(bereavementIdA);
    });

    it("should approve a bereavement leave record", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const [row] = await db`
        UPDATE app.parental_bereavement_leave
        SET status = 'approved'::app.parental_bereavement_status,
            updated_at = now()
        WHERE id = ${bereavementIdA}::uuid AND status = 'pending'
        RETURNING id, status
      `;

      expect(row).toBeDefined();
      expect(row.status).toBe("approved");
    });

    it("should NOT allow tenant B to update tenant A bereavement record", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const result = await db`
        UPDATE app.parental_bereavement_leave
        SET notes = 'Cross-tenant'
        WHERE id = ${bereavementIdA}::uuid
        RETURNING id
      `;

      expect(result.length).toBe(0);
    });
  });

  // =========================================================================
  // Carer's Leave
  // =========================================================================

  describe("Carer's Leave Entitlements", () => {
    let carersEntitlementIdA: string;
    let carersEntitlementIdB: string;

    it("should create a carer's leave entitlement for tenant A", async () => {
      carersEntitlementIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.carers_leave_entitlements (
            id, tenant_id, employee_id,
            leave_year_start, leave_year_end,
            total_days_available, days_used
          )
          VALUES (
            ${carersEntitlementIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            '2026-01-01'::date, '2026-12-31'::date,
            5, 0
          )
          RETURNING id, total_days_available, days_used
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(carersEntitlementIdA);
        expect(Number(row.total_days_available)).toBe(5);
        expect(Number(row.days_used)).toBe(0);
      });
      cleanupIds.carersLeaveEntitlements.push(carersEntitlementIdA);
    });

    it("should create a carer's leave entitlement for tenant B", async () => {
      carersEntitlementIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.carers_leave_entitlements (
            id, tenant_id, employee_id,
            leave_year_start, leave_year_end,
            total_days_available, days_used
          )
          VALUES (
            ${carersEntitlementIdB}::uuid, ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            '2026-01-01'::date, '2026-12-31'::date,
            5, 2
          )
          RETURNING id
        `;
        expect(row.id).toBe(carersEntitlementIdB);
      });
      cleanupIds.carersLeaveEntitlements.push(carersEntitlementIdB);
    });

    it("should isolate carer's leave entitlements by tenant", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.carers_leave_entitlements
        WHERE id IN (${carersEntitlementIdA}::uuid, ${carersEntitlementIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(carersEntitlementIdA);
    });

    it("should deduct days from the entitlement", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const [row] = await db`
        UPDATE app.carers_leave_entitlements
        SET days_used = days_used + 2,
            updated_at = now()
        WHERE id = ${carersEntitlementIdA}::uuid
        RETURNING id, days_used, total_days_available
      `;

      expect(row).toBeDefined();
      expect(Number(row.days_used)).toBe(2);
    });

    it("should reject deduction exceeding entitlement (DB constraint)", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      // days_used is currently 2, total_days_available is 5
      // Trying to add 4 more would make it 6, violating the constraint
      try {
        await db`
          UPDATE app.carers_leave_entitlements
          SET days_used = days_used + 4
          WHERE id = ${carersEntitlementIdA}::uuid
          RETURNING id
        `;
        throw new Error("Expected constraint violation");
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("carers_leave_used_within_limit") ||
          msg.includes("check") ||
          msg.includes("violates")
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // Parental Leave (Unpaid)
  // =========================================================================

  describe("Parental Leave Entitlements & Bookings", () => {
    let entitlementIdA: string;
    let entitlementIdB: string;
    let bookingIdA: string;

    it("should create a parental leave entitlement for tenant A", async () => {
      entitlementIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.parental_leave_entitlements (
            id, tenant_id, employee_id, child_name,
            child_date_of_birth, total_weeks_entitled
          )
          VALUES (
            ${entitlementIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            'Child A', '2022-05-15'::date, 18
          )
          RETURNING id, total_weeks_entitled, weeks_used, weeks_remaining
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(entitlementIdA);
        expect(Number(row.total_weeks_entitled)).toBe(18);
        expect(Number(row.weeks_used)).toBe(0);
        expect(Number(row.weeks_remaining)).toBe(18);
      });
      cleanupIds.parentalLeaveEntitlements.push(entitlementIdA);
    });

    it("should create a parental leave entitlement for tenant B", async () => {
      entitlementIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.parental_leave_entitlements (
            id, tenant_id, employee_id, child_name,
            child_date_of_birth, total_weeks_entitled
          )
          VALUES (
            ${entitlementIdB}::uuid, ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            'Child B', '2023-08-20'::date, 18
          )
          RETURNING id
        `;
        expect(row.id).toBe(entitlementIdB);
      });
      cleanupIds.parentalLeaveEntitlements.push(entitlementIdB);
    });

    it("should isolate parental leave entitlements by tenant", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.parental_leave_entitlements
        WHERE id IN (${entitlementIdA}::uuid, ${entitlementIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(entitlementIdA);
    });

    it("should create a parental leave booking for tenant A", async () => {
      bookingIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.parental_leave_bookings (
            id, tenant_id, employee_id, entitlement_id,
            leave_year_start, weeks_booked,
            start_date, end_date, status
          )
          VALUES (
            ${bookingIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            ${entitlementIdA}::uuid, '2026-01-01'::date, 2,
            '2026-03-02'::date, '2026-03-15'::date, 'requested'
          )
          RETURNING id, status, weeks_booked
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(bookingIdA);
        expect(row.status).toBe("requested");
        expect(Number(row.weeks_booked)).toBe(2);
      });
      cleanupIds.parentalLeaveBookings.push(bookingIdA);
    });

    it("should isolate parental leave bookings by tenant", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const rows = await db`
        SELECT id FROM app.parental_leave_bookings
        WHERE id = ${bookingIdA}::uuid
      `;

      expect(rows.length).toBe(0);
    });

    it("should reject booking less than 1 week (DB constraint)", async () => {
      const badBookingId = crypto.randomUUID();

      try {
        await withSystemContext(db, async (tx) => {
          await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
          await tx`
            INSERT INTO app.parental_leave_bookings (
              id, tenant_id, employee_id, entitlement_id,
              leave_year_start, weeks_booked,
              start_date, end_date, status
            )
            VALUES (
              ${badBookingId}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
              ${entitlementIdA}::uuid, '2026-01-01'::date, 0.5,
              '2026-04-01'::date, '2026-04-04'::date, 'requested'
            )
          `;
        });
        throw new Error("Expected constraint violation");
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("chk_weeks_booked_minimum") ||
          msg.includes("check") ||
          msg.includes("violates")
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // Return to Work Interviews
  // =========================================================================

  describe("Return to Work Interviews", () => {
    let interviewIdA: string;
    let interviewIdB: string;

    it("should schedule a return-to-work interview for tenant A", async () => {
      interviewIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.return_to_work_interviews (
            id, tenant_id, employee_id,
            absence_start_date, absence_end_date, interview_date,
            interviewer_id, fit_for_work, referral_to_occupational_health
          )
          VALUES (
            ${interviewIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            '2026-01-06'::date, '2026-01-20'::date, '2026-01-20'::date,
            ${interviewerIdA}::uuid, true, false
          )
          RETURNING id, fit_for_work, referral_to_occupational_health
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(interviewIdA);
        expect(row.fit_for_work).toBe(true);
        expect(row.referral_to_occupational_health).toBe(false);
      });
      cleanupIds.returnToWorkInterviews.push(interviewIdA);
    });

    it("should create a second tenant's RTW interview and verify isolation", async () => {
      // We need an interviewer in tenant B
      const interviewerIdB = crypto.randomUUID();
      interviewIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        // Set proper user/tenant context for employee_status_history trigger
        await tx`SELECT set_config('app.current_user', ${userB.id}, true)`;
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;

        // Create interviewer for tenant B
        await tx`
          INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
          VALUES (${interviewerIdB}::uuid, ${tenantB.id}::uuid, ${"INT-B-" + suffix}, 'active', '2023-01-01')
        `;
        cleanupIds.employees.push(interviewerIdB);
        const [row] = await tx`
          INSERT INTO app.return_to_work_interviews (
            id, tenant_id, employee_id,
            absence_start_date, absence_end_date, interview_date,
            interviewer_id, fit_for_work, referral_to_occupational_health, notes
          )
          VALUES (
            ${interviewIdB}::uuid, ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            '2026-02-01'::date, '2026-02-10'::date, '2026-02-10'::date,
            ${interviewerIdB}::uuid, false, true, 'Needs phased return'
          )
          RETURNING id
        `;
        expect(row.id).toBe(interviewIdB);
      });
      cleanupIds.returnToWorkInterviews.push(interviewIdB);

      // Verify isolation from tenant A
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.return_to_work_interviews
        WHERE id IN (${interviewIdA}::uuid, ${interviewIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(interviewIdA);
    });

    it("should complete an interview by updating assessment", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const [row] = await db`
        UPDATE app.return_to_work_interviews
        SET fit_for_work = true,
            adjustments_needed = 'Phased return for 2 weeks',
            referral_to_occupational_health = false,
            notes = 'Employee recovering well',
            updated_at = now()
        WHERE id = ${interviewIdA}::uuid
        RETURNING id, fit_for_work, adjustments_needed
      `;

      expect(row).toBeDefined();
      expect(row.fit_for_work).toBe(true);
      expect(row.adjustments_needed).toBe("Phased return for 2 weeks");
    });
  });

  // =========================================================================
  // Payroll Config (Pay Schedules)
  // =========================================================================

  describe("Pay Schedules", () => {
    let scheduleIdA: string;
    let scheduleIdB: string;

    it("should create a pay schedule for tenant A", async () => {
      scheduleIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.pay_schedules (
            id, tenant_id, name, frequency,
            pay_day_of_month, is_default
          )
          VALUES (
            ${scheduleIdA}::uuid, ${tenantA.id}::uuid,
            ${"Monthly Schedule " + suffix}, 'monthly'::app.pay_frequency,
            25, true
          )
          RETURNING id, name, frequency, is_default
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(scheduleIdA);
        expect(row.frequency).toBe("monthly");
        expect(row.is_default).toBe(true);
      });
      cleanupIds.paySchedules.push(scheduleIdA);
    });

    it("should create a pay schedule for tenant B", async () => {
      scheduleIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.pay_schedules (
            id, tenant_id, name, frequency,
            pay_day_of_week, is_default
          )
          VALUES (
            ${scheduleIdB}::uuid, ${tenantB.id}::uuid,
            ${"Weekly Schedule " + suffix}, 'weekly'::app.pay_frequency,
            5, true
          )
          RETURNING id
        `;
        expect(row.id).toBe(scheduleIdB);
      });
      cleanupIds.paySchedules.push(scheduleIdB);
    });

    it("should isolate pay schedules by tenant", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, name FROM app.pay_schedules
        WHERE id IN (${scheduleIdA}::uuid, ${scheduleIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(scheduleIdA);
    });

    it("should list pay schedules only for current tenant", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const rows = await db`
        SELECT id FROM app.pay_schedules
        WHERE id IN (${scheduleIdA}::uuid, ${scheduleIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(scheduleIdB);
    });

    it("should NOT allow cross-tenant pay schedule update", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const result = await db`
        UPDATE app.pay_schedules
        SET name = 'Hijacked Schedule'
        WHERE id = ${scheduleIdB}::uuid
        RETURNING id
      `;

      expect(result.length).toBe(0);
    });

    it("should reject invalid pay_day_of_month (constraint)", async () => {
      const badId = crypto.randomUUID();

      try {
        await withSystemContext(db, async (tx) => {
          await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
          await tx`
            INSERT INTO app.pay_schedules (
              id, tenant_id, name, frequency,
              pay_day_of_month, is_default
            )
            VALUES (
              ${badId}::uuid, ${tenantA.id}::uuid,
              'Bad Schedule', 'monthly'::app.pay_frequency,
              32, false
            )
          `;
        });
        throw new Error("Expected constraint violation");
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("chk_pay_day_of_month") ||
          msg.includes("check") ||
          msg.includes("violates")
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // NI Categories
  // =========================================================================

  describe("NI Categories", () => {
    let niCatIdA: string;

    it("should create an NI category for tenant A", async () => {
      niCatIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.ni_categories (
            id, tenant_id, employee_id, category_letter,
            effective_from, notes
          )
          VALUES (
            ${niCatIdA}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
            'A', '2024-01-15'::date, 'Standard NI category'
          )
          RETURNING id, category_letter, effective_from
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(niCatIdA);
        expect(row.category_letter).toBe("A");
      });
      cleanupIds.niCategories.push(niCatIdA);
    });

    it("should isolate NI categories by tenant", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const rows = await db`
        SELECT id FROM app.ni_categories
        WHERE id = ${niCatIdA}::uuid
      `;

      expect(rows.length).toBe(0);
    });

    it("should reject invalid NI category letter (DB constraint)", async () => {
      const badId = crypto.randomUUID();

      try {
        await withSystemContext(db, async (tx) => {
          await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
          await tx`
            INSERT INTO app.ni_categories (
              id, tenant_id, employee_id, category_letter,
              effective_from
            )
            VALUES (
              ${badId}::uuid, ${tenantA.id}::uuid, ${employeeIdA}::uuid,
              'X', '2026-01-01'::date
            )
          `;
        });
        throw new Error("Expected constraint violation");
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("chk_ni_category_letter") ||
          msg.includes("check") ||
          msg.includes("violates")
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // Bank Holidays
  // =========================================================================

  describe("Bank Holidays", () => {
    let holidayIdA: string;
    let holidayIdB: string;
    const bulkHolidayIds: string[] = [];

    it("should create a bank holiday for tenant A", async () => {
      holidayIdA = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.bank_holidays (
            id, tenant_id, name, date, country_code, region
          )
          VALUES (
            ${holidayIdA}::uuid, ${tenantA.id}::uuid,
            'Christmas Day', '2026-12-25'::date, 'GB', null
          )
          RETURNING id, name, date, country_code
        `;

        expect(row).toBeDefined();
        expect(row.id).toBe(holidayIdA);
        expect(row.name).toBe("Christmas Day");
        expect(row.country_code).toBe("GB");
      });
      cleanupIds.bankHolidays.push(holidayIdA);
    });

    it("should create a bank holiday for tenant B", async () => {
      holidayIdB = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
        const [row] = await tx`
          INSERT INTO app.bank_holidays (
            id, tenant_id, name, date, country_code, region
          )
          VALUES (
            ${holidayIdB}::uuid, ${tenantB.id}::uuid,
            'Boxing Day', '2026-12-28'::date, 'GB', null
          )
          RETURNING id
        `;
        expect(row.id).toBe(holidayIdB);
      });
      cleanupIds.bankHolidays.push(holidayIdB);
    });

    it("should isolate bank holidays by tenant", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, name FROM app.bank_holidays
        WHERE id IN (${holidayIdA}::uuid, ${holidayIdB}::uuid)
      `;

      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(holidayIdA);
    });

    it("should bulk import bank holidays for tenant A", async () => {
      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;

        // Insert multiple holidays
        const holidays = [
          { name: "New Year's Day", date: "2026-01-01", country_code: "GB" },
          { name: "Good Friday", date: "2026-04-03", country_code: "GB" },
          { name: "Easter Monday", date: "2026-04-06", country_code: "GB" },
          { name: "St Andrew's Day", date: "2026-11-30", country_code: "GB", region: "SCT" },
        ];

        for (const h of holidays) {
          const hId = crypto.randomUUID();
          await tx`
            INSERT INTO app.bank_holidays (id, tenant_id, name, date, country_code, region)
            VALUES (
              ${hId}::uuid, ${tenantA.id}::uuid,
              ${h.name}, ${h.date}::date, ${h.country_code}, ${h.region ?? null}
            )
            ON CONFLICT (tenant_id, date, country_code, COALESCE(region, ''))
            DO NOTHING
          `;
          bulkHolidayIds.push(hId);
          cleanupIds.bankHolidays.push(hId);
        }
      });

      // Verify they were all inserted
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.bank_holidays
        WHERE id = ANY(${bulkHolidayIds}::uuid[])
      `;

      expect(rows.length).toBe(bulkHolidayIds.length);
    });

    it("should list bank holidays for tenant A only", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, name, date, country_code, region
        FROM app.bank_holidays
        ORDER BY date ASC
      `;

      // All rows should belong to tenant A (RLS)
      // Should have at least 5 (1 Christmas + 4 bulk imported)
      expect(rows.length).toBeGreaterThanOrEqual(5);

      // Verify none of tenant B's holidays are visible
      const tenantBHolidays = rows.filter(
        (r: { id: string }) => r.id === holidayIdB
      );
      expect(tenantBHolidays.length).toBe(0);
    });

    it("should NOT allow cross-tenant bank holiday deletion", async () => {
      await setTenantContext(db, tenantB.id, userB.id);

      const result = await db`
        DELETE FROM app.bank_holidays
        WHERE id = ${holidayIdA}::uuid
      `;

      // RLS should prevent deletion
      expect(result.count).toBe(0);

      // Verify the holiday still exists for tenant A
      await setTenantContext(db, tenantA.id, userA.id);
      const [row] = await db`
        SELECT id FROM app.bank_holidays WHERE id = ${holidayIdA}::uuid
      `;
      expect(row).toBeDefined();
    });
  });

  // =========================================================================
  // Cross-tenant INSERT isolation
  // =========================================================================

  describe("Cross-tenant INSERT isolation", () => {
    it("should reject inserting an SSP record with wrong tenant_id via RLS", async () => {
      // Set context to tenant A but try to insert with tenant B's ID
      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.ssp_records (
            tenant_id, employee_id, start_date,
            qualifying_days_pattern, weekly_rate, status,
            waiting_days_served, fit_note_required
          )
          VALUES (
            ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            '2026-05-01'::date, '[1,2,3,4,5]'::jsonb, 116.75,
            'active'::app.ssp_record_status, 0, false
          )
        `;
        throw new Error("Expected RLS violation");
      } catch (error) {
        const msg = String(error);
        // RLS insert policy should reject this
        expect(
          msg.includes("row-level security") ||
          msg.includes("violates") ||
          msg.includes("permission denied") ||
          msg.includes("new row violates")
        ).toBe(true);
      }
    });

    it("should reject inserting a bank holiday with wrong tenant_id via RLS", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.bank_holidays (tenant_id, name, date, country_code)
          VALUES (${tenantB.id}::uuid, 'Fake Holiday', '2026-06-01'::date, 'GB')
        `;
        throw new Error("Expected RLS violation");
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("row-level security") ||
          msg.includes("violates") ||
          msg.includes("permission denied") ||
          msg.includes("new row violates")
        ).toBe(true);
      }
    });

    it("should reject inserting a carer's leave entitlement with wrong tenant_id via RLS", async () => {
      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.carers_leave_entitlements (
            tenant_id, employee_id, leave_year_start, leave_year_end,
            total_days_available
          )
          VALUES (
            ${tenantB.id}::uuid, ${employeeIdB}::uuid,
            '2027-01-01'::date, '2027-12-31'::date, 5
          )
        `;
        throw new Error("Expected RLS violation");
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("row-level security") ||
          msg.includes("violates") ||
          msg.includes("permission denied") ||
          msg.includes("new row violates")
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // System Context Bypass
  // =========================================================================

  describe("System context bypass", () => {
    it("should allow system context to read all tenants data", async () => {
      // First clear any tenant context
      await clearTenantContext(db);

      await withSystemContext(db, async (tx) => {
        // System context should be able to see data across tenants
        const rows = await tx`
          SELECT id, tenant_id FROM app.bank_holidays
          WHERE tenant_id IN (${tenantA.id}::uuid, ${tenantB.id}::uuid)
        `;

        // Should see bank holidays from both tenants
        const tenantIds = new Set(rows.map((r: { tenant_id: string }) => r.tenant_id));
        expect(tenantIds.size).toBe(2);
        expect(tenantIds.has(tenantA.id)).toBe(true);
        expect(tenantIds.has(tenantB.id)).toBe(true);
      });
    });
  });
});
