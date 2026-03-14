/**
 * Compliance Module Integration Tests
 *
 * Tests Right to Work, Health & Safety, WTR Opt-Outs, NMW Rates,
 * Gender Pay Gap, and Employee Warnings directly against the database.
 *
 * Verifies:
 * - CRUD operations work correctly through RLS
 * - Cross-tenant isolation (tenant A cannot see tenant B's data)
 * - Data integrity (correct columns, types, defaults)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../../setup";

describe("Compliance Routes - Database Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let userA: TestUser;
  let userB: TestUser;

  // Employee IDs created for each tenant
  let employeeA1: string;
  let employeeB1: string;

  // Track which table groups are available (migrations may not have been applied)
  let hasRtwTables = false;
  let hasHsTables = false;
  let hasWtrTables = false;
  let hasNmwTables = false;
  let hasGpgTables = false;
  let hasWarningTables = false;

  // Track IDs for cleanup
  const cleanup = {
    rtwChecks: [] as string[],
    rtwDocuments: [] as string[],
    hsIncidents: [] as string[],
    hsRiskAssessments: [] as string[],
    wtrOptOuts: [] as string[],
    wtrAlerts: [] as string[],
    nmwRates: [] as string[],
    gpgReports: [] as string[],
    warnings: [] as string[],
    employees: [] as string[],
  };

  const suffix = Date.now();

  /** Helper to check if a table exists in the app schema */
  async function tableExists(db: ReturnType<typeof getTestDb>, tableName: string): Promise<boolean> {
    const rows = await db<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = ${tableName}
      ) as exists
    `;
    return rows[0]?.exists === true;
  }

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();

    // Check which compliance tables exist (migrations may be pending)
    [hasRtwTables, hasHsTables, hasWtrTables, hasNmwTables, hasGpgTables, hasWarningTables] =
      await Promise.all([
        tableExists(db, "rtw_checks"),
        tableExists(db, "hs_incidents"),
        tableExists(db, "wtr_opt_outs"),
        tableExists(db, "nmw_rates"),
        tableExists(db, "gender_pay_gap_reports"),
        tableExists(db, "employee_warnings"),
      ]);

    // Create two tenants for RLS isolation tests
    tenantA = await createTestTenant(db, {
      name: `Compliance-A-${suffix}`,
      slug: `compliance-a-${suffix}`,
    });
    tenantB = await createTestTenant(db, {
      name: `Compliance-B-${suffix}`,
      slug: `compliance-b-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `comp-a-${suffix}@example.com`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `comp-b-${suffix}@example.com`,
    });

    // Create employees for each tenant using system context
    employeeA1 = crypto.randomUUID();
    employeeB1 = crypto.randomUUID();
    cleanup.employees.push(employeeA1, employeeB1);

    // Insert employees one at a time, setting app.current_user to a real user ID
    // so the employee_status_history trigger's created_by FK doesn't fail.
    await withSystemContext(db, async (tx) => {
      await tx`SELECT set_config('app.current_user', ${userA.id}, true)`;
      await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${employeeA1}::uuid, ${tenantA.id}::uuid, ${"EMP-A-" + suffix}, 'active', '2024-01-15')
      `;
    });
    await withSystemContext(db, async (tx) => {
      await tx`SELECT set_config('app.current_user', ${userB.id}, true)`;
      await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${employeeB1}::uuid, ${tenantB.id}::uuid, ${"EMP-B-" + suffix}, 'active', '2024-02-01')
      `;
    });
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Clean up in reverse dependency order — only attempt tables that exist
      if (hasRtwTables) {
        for (const id of cleanup.rtwDocuments) {
          await tx`DELETE FROM app.rtw_documents WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.rtwChecks) {
          await tx`DELETE FROM app.rtw_checks WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasHsTables) {
        for (const id of cleanup.hsIncidents) {
          await tx`DELETE FROM app.hs_incidents WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.hsRiskAssessments) {
          await tx`DELETE FROM app.hs_risk_assessments WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasWtrTables) {
        for (const id of cleanup.wtrOptOuts) {
          await tx`DELETE FROM app.wtr_opt_outs WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.wtrAlerts) {
          await tx`DELETE FROM app.wtr_alerts WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasNmwTables) {
        for (const id of cleanup.nmwRates) {
          await tx`DELETE FROM app.nmw_rates WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasGpgTables) {
        for (const id of cleanup.gpgReports) {
          await tx`DELETE FROM app.gender_pay_gap_reports WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasWarningTables) {
        for (const id of cleanup.warnings) {
          await tx`DELETE FROM app.employee_warnings WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      for (const id of cleanup.employees) {
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${id}::uuid`.catch(() => {});
      }
    });

    await cleanupTestUser(db, userA.id);
    await cleanupTestUser(db, userB.id);
    await cleanupTestTenant(db, tenantA.id);
    await cleanupTestTenant(db, tenantB.id);
    await db.end();
  });

  // ===========================================================================
  // Right to Work
  // ===========================================================================

  describe("Right to Work", () => {
    let checkIdA: string;
    let checkIdB: string;

    it("should create an RTW check for tenant A", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const checkId = crypto.randomUUID();
      cleanup.rtwChecks.push(checkId);

      const rows = await db`
        INSERT INTO app.rtw_checks (
          id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
          document_type, document_reference, notes
        )
        VALUES (
          ${checkId}::uuid, ${tenantA.id}::uuid, ${employeeA1}::uuid,
          'manual_list_a', '2025-03-01'::date, ${userA.id}::uuid,
          'passport', 'PASS-001', 'Initial RTW check'
        )
        RETURNING id, tenant_id, employee_id, check_type, status
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(checkId);
      expect(rows[0].tenant_id).toBe(tenantA.id);
      expect(rows[0].status).toBe("pending");
      checkIdA = checkId;
    });

    it("should create an RTW check for tenant B", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const checkId = crypto.randomUUID();
      cleanup.rtwChecks.push(checkId);

      const rows = await db`
        INSERT INTO app.rtw_checks (
          id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
          document_type, notes
        )
        VALUES (
          ${checkId}::uuid, ${tenantB.id}::uuid, ${employeeB1}::uuid,
          'online_share_code', '2025-03-10'::date, ${userB.id}::uuid,
          'share_code', 'ECS check'
        )
        RETURNING id, tenant_id, employee_id
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(tenantB.id);
      checkIdB = checkId;
    });

    it("should list RTW checks only for the current tenant", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      // Set context to tenant A
      await setTenantContext(db, tenantA.id, userA.id);

      const rowsA = await db`
        SELECT id, tenant_id, employee_id FROM app.rtw_checks
        ORDER BY created_at DESC
      `;

      // Tenant A should only see its own checks
      expect(rowsA.every((r: Record<string, unknown>) => r.tenant_id === tenantA.id)).toBe(true);
      expect(rowsA.some((r: Record<string, unknown>) => r.id === checkIdA)).toBe(true);
      expect(rowsA.some((r: Record<string, unknown>) => r.id === checkIdB)).toBe(false);

      // Set context to tenant B
      await setTenantContext(db, tenantB.id, userB.id);

      const rowsB = await db`
        SELECT id, tenant_id, employee_id FROM app.rtw_checks
        ORDER BY created_at DESC
      `;

      expect(rowsB.every((r: Record<string, unknown>) => r.tenant_id === tenantB.id)).toBe(true);
      expect(rowsB.some((r: Record<string, unknown>) => r.id === checkIdB)).toBe(true);
      expect(rowsB.some((r: Record<string, unknown>) => r.id === checkIdA)).toBe(false);
    });

    it("should get an RTW check by ID within the same tenant", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, employee_id, check_type, status, document_type, notes
        FROM app.rtw_checks
        WHERE id = ${checkIdA}::uuid
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].check_type).toBe("manual_list_a");
      expect(rows[0].document_type).toBe("passport");
    });

    it("should NOT return a check from another tenant", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      // Tenant A tries to read tenant B's check
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.rtw_checks
        WHERE id = ${checkIdB}::uuid
      `;

      expect(rows).toHaveLength(0);
    });

    it("should create and retrieve RTW documents", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const docId = crypto.randomUUID();
      cleanup.rtwDocuments.push(docId);

      const docs = await db`
        INSERT INTO app.rtw_documents (
          id, tenant_id, rtw_check_id, document_name, document_type,
          file_key, uploaded_by
        )
        VALUES (
          ${docId}::uuid, ${tenantA.id}::uuid, ${checkIdA}::uuid,
          'passport_scan.pdf', 'passport',
          'uploads/rtw/passport_scan.pdf', ${userA.id}::uuid
        )
        RETURNING id, rtw_check_id, document_name
      `;

      expect(docs).toHaveLength(1);
      expect(docs[0].document_name).toBe("passport_scan.pdf");

      // Retrieve documents for the check
      const retrieved = await db`
        SELECT id, document_name FROM app.rtw_documents
        WHERE rtw_check_id = ${checkIdA}::uuid
      `;
      expect(retrieved.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Health & Safety Incidents
  // ===========================================================================

  describe("Health & Safety Incidents", () => {
    let incidentIdA: string;
    let incidentIdB: string;

    it("should create an H&S incident for tenant A", async () => {
      if (!isInfraAvailable() || !hasHsTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const incidentId = crypto.randomUUID();
      cleanup.hsIncidents.push(incidentId);

      const rows = await db`
        INSERT INTO app.hs_incidents (
          id, tenant_id, injured_employee_id, incident_date,
          reported_date, location, description, severity,
          riddor_reportable
        )
        VALUES (
          ${incidentId}::uuid, ${tenantA.id}::uuid, ${employeeA1}::uuid,
          '2025-03-01'::timestamptz, now(), 'Warehouse Floor',
          'Employee tripped over cable', 'minor',
          false
        )
        RETURNING id, tenant_id, status, severity
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].severity).toBe("minor");
      expect(rows[0].status).toBe("reported");
      incidentIdA = incidentId;
    });

    it("should create an H&S incident for tenant B", async () => {
      if (!isInfraAvailable() || !hasHsTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const incidentId = crypto.randomUUID();
      cleanup.hsIncidents.push(incidentId);

      const rows = await db`
        INSERT INTO app.hs_incidents (
          id, tenant_id, injured_employee_id, incident_date,
          reported_date, location, description, severity,
          riddor_reportable
        )
        VALUES (
          ${incidentId}::uuid, ${tenantB.id}::uuid, ${employeeB1}::uuid,
          '2025-03-05'::timestamptz, now(), 'Office Kitchen',
          'Burn from hot water', 'moderate',
          true
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      incidentIdB = incidentId;
    });

    it("should isolate incidents by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasHsTables) return;

      // Tenant A context
      await setTenantContext(db, tenantA.id, userA.id);

      const rowsA = await db`
        SELECT id, tenant_id FROM app.hs_incidents
      `;

      expect(rowsA.every((r: Record<string, unknown>) => r.tenant_id === tenantA.id)).toBe(true);
      expect(rowsA.some((r: Record<string, unknown>) => r.id === incidentIdA)).toBe(true);
      expect(rowsA.some((r: Record<string, unknown>) => r.id === incidentIdB)).toBe(false);
    });

    it("should create and read risk assessments", async () => {
      if (!isInfraAvailable() || !hasHsTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const raId = crypto.randomUUID();
      cleanup.hsRiskAssessments.push(raId);

      const rows = await db`
        INSERT INTO app.hs_risk_assessments (
          id, tenant_id, title, description, area_or_activity,
          assessment_date, review_date, hazards, overall_risk_level
        )
        VALUES (
          ${raId}::uuid, ${tenantA.id}::uuid,
          'Warehouse Cable Trip Hazard', 'Trailing cables in warehouse area',
          'Warehouse Operations',
          '2025-03-02'::date, '2025-09-02'::date,
          '[]'::jsonb, 'medium'
        )
        RETURNING id, title, status, overall_risk_level
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Warehouse Cable Trip Hazard");
      expect(rows[0].overall_risk_level).toBe("medium");

      // Read back
      const retrieved = await db`
        SELECT id, title FROM app.hs_risk_assessments WHERE id = ${raId}::uuid
      `;
      expect(retrieved).toHaveLength(1);
    });
  });

  // ===========================================================================
  // WTR Opt-Outs
  // ===========================================================================

  describe("WTR Opt-Outs", () => {
    let optOutIdA: string;
    let optOutIdB: string;

    it("should create a WTR opt-out for tenant A", async () => {
      if (!isInfraAvailable() || !hasWtrTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const optOutId = crypto.randomUUID();
      cleanup.wtrOptOuts.push(optOutId);

      const rows = await db`
        INSERT INTO app.wtr_opt_outs (
          id, tenant_id, employee_id, opted_out, opt_out_date,
          notice_period_weeks, status
        )
        VALUES (
          ${optOutId}::uuid, ${tenantA.id}::uuid, ${employeeA1}::uuid,
          true, '2025-01-15'::date,
          1, 'active'
        )
        RETURNING id, tenant_id, employee_id, status
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("active");
      optOutIdA = optOutId;
    });

    it("should create a WTR opt-out for tenant B", async () => {
      if (!isInfraAvailable() || !hasWtrTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const optOutId = crypto.randomUUID();
      cleanup.wtrOptOuts.push(optOutId);

      const rows = await db`
        INSERT INTO app.wtr_opt_outs (
          id, tenant_id, employee_id, opted_out, opt_out_date,
          notice_period_weeks, status
        )
        VALUES (
          ${optOutId}::uuid, ${tenantB.id}::uuid, ${employeeB1}::uuid,
          true, '2025-02-01'::date,
          2, 'active'
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      optOutIdB = optOutId;
    });

    it("should isolate WTR opt-outs by tenant", async () => {
      if (!isInfraAvailable() || !hasWtrTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id FROM app.wtr_opt_outs
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenant_id === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === optOutIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === optOutIdB)).toBe(false);
    });

    it("should revoke a WTR opt-out", async () => {
      if (!isInfraAvailable() || !hasWtrTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.wtr_opt_outs
        SET status = 'revoked', opt_in_date = '2025-06-01'::date, updated_at = now()
        WHERE id = ${optOutIdA}::uuid
        RETURNING id, status, opt_in_date
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("revoked");
    });
  });

  // ===========================================================================
  // NMW Rates
  // ===========================================================================

  describe("NMW Rates", () => {
    let rateIdA: string;

    it("should create a tenant-specific NMW rate", async () => {
      if (!isInfraAvailable() || !hasNmwTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rateId = crypto.randomUUID();
      cleanup.nmwRates.push(rateId);

      const rows = await db`
        INSERT INTO app.nmw_rates (
          id, tenant_id, rate_name, age_from, age_to,
          hourly_rate, effective_from, rate_type
        )
        VALUES (
          ${rateId}::uuid, ${tenantA.id}::uuid,
          'Test National Living Wage', 21, null,
          12.50, '2025-04-01'::date, 'national_living_wage'::app.nmw_rate_type
        )
        RETURNING id, tenant_id, rate_name, hourly_rate
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].rate_name).toBe("Test National Living Wage");
      rateIdA = rateId;
    });

    it("should read NMW rates within the tenant context", async () => {
      if (!isInfraAvailable() || !hasNmwTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, rate_name, hourly_rate FROM app.nmw_rates
        WHERE id = ${rateIdA}::uuid
      `;

      expect(rows).toHaveLength(1);
    });

    it("should not allow tenant B to see tenant A NMW rates (tenant-specific)", async () => {
      if (!isInfraAvailable() || !hasNmwTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      // NMW rates table may have system-wide rows (tenant_id IS NULL) that are
      // visible to all. We only check that tenant-specific rates are isolated.
      const rows = await db`
        SELECT id FROM app.nmw_rates
        WHERE id = ${rateIdA}::uuid AND tenant_id IS NOT NULL
      `;

      expect(rows).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Gender Pay Gap Reports
  // ===========================================================================

  describe("Gender Pay Gap Reports", () => {
    let reportIdA: string;
    let reportIdB: string;

    it("should create a GPG report for tenant A", async () => {
      if (!isInfraAvailable() || !hasGpgTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const reportId = crypto.randomUUID();
      cleanup.gpgReports.push(reportId);

      const rows = await db`
        INSERT INTO app.gender_pay_gap_reports (
          id, tenant_id, snapshot_date, reporting_year,
          total_employees, male_count, female_count,
          mean_hourly_pay_gap, median_hourly_pay_gap,
          status
        )
        VALUES (
          ${reportId}::uuid, ${tenantA.id}::uuid,
          '2024-04-05'::date, 2024,
          250, 130, 120,
          8.5, 7.2,
          'draft'
        )
        RETURNING id, tenant_id, reporting_year, status
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].reporting_year).toBe(2024);
      expect(rows[0].status).toBe("draft");
      reportIdA = reportId;
    });

    it("should create a GPG report for tenant B", async () => {
      if (!isInfraAvailable() || !hasGpgTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const reportId = crypto.randomUUID();
      cleanup.gpgReports.push(reportId);

      const rows = await db`
        INSERT INTO app.gender_pay_gap_reports (
          id, tenant_id, snapshot_date, reporting_year,
          total_employees, male_count, female_count,
          mean_hourly_pay_gap, median_hourly_pay_gap,
          status
        )
        VALUES (
          ${reportId}::uuid, ${tenantB.id}::uuid,
          '2024-04-05'::date, 2024,
          100, 55, 45,
          10.3, 9.1,
          'draft'
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      reportIdB = reportId;
    });

    it("should isolate GPG reports by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasGpgTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id, reporting_year FROM app.gender_pay_gap_reports
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenant_id === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === reportIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === reportIdB)).toBe(false);
    });

    it("should retrieve GPG report by ID", async () => {
      if (!isInfraAvailable() || !hasGpgTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, reporting_year, mean_hourly_pay_gap, status
        FROM app.gender_pay_gap_reports
        WHERE id = ${reportIdA}::uuid
      `;

      expect(rows).toHaveLength(1);
      expect(Number(rows[0].mean_hourly_pay_gap)).toBeCloseTo(8.5, 1);
    });
  });

  // ===========================================================================
  // Employee Warnings
  // ===========================================================================

  describe("Employee Warnings", () => {
    let warningIdA: string;
    let warningIdB: string;

    it("should issue a warning for tenant A employee", async () => {
      if (!isInfraAvailable() || !hasWarningTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const warningId = crypto.randomUUID();
      cleanup.warnings.push(warningId);

      const rows = await db`
        INSERT INTO app.employee_warnings (
          id, tenant_id, employee_id, warning_level, status,
          issued_date, expiry_date, issued_by, reason
        )
        VALUES (
          ${warningId}::uuid, ${tenantA.id}::uuid, ${employeeA1}::uuid,
          'verbal', 'active',
          '2025-02-01'::date, '2025-08-01'::date,
          ${userA.id}::uuid, 'Repeated lateness'
        )
        RETURNING id, tenant_id, warning_level, status
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].warning_level).toBe("verbal");
      expect(rows[0].status).toBe("active");
      warningIdA = warningId;
    });

    it("should issue a warning for tenant B employee", async () => {
      if (!isInfraAvailable() || !hasWarningTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const warningId = crypto.randomUUID();
      cleanup.warnings.push(warningId);

      const rows = await db`
        INSERT INTO app.employee_warnings (
          id, tenant_id, employee_id, warning_level, status,
          issued_date, expiry_date, issued_by, reason
        )
        VALUES (
          ${warningId}::uuid, ${tenantB.id}::uuid, ${employeeB1}::uuid,
          'first_written', 'active',
          '2025-02-15'::date, '2026-02-15'::date,
          ${userB.id}::uuid, 'Policy violation'
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      warningIdB = warningId;
    });

    it("should isolate warnings by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasWarningTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id, employee_id, warning_level FROM app.employee_warnings
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenant_id === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === warningIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === warningIdB)).toBe(false);
    });

    it("should get warning by ID within same tenant", async () => {
      if (!isInfraAvailable() || !hasWarningTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, warning_level, reason, status
        FROM app.employee_warnings
        WHERE id = ${warningIdA}::uuid
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe("Repeated lateness");
    });

    it("should NOT return warning from another tenant", async () => {
      if (!isInfraAvailable() || !hasWarningTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.employee_warnings WHERE id = ${warningIdB}::uuid
      `;

      expect(rows).toHaveLength(0);
    });

    it("should update warning status (rescind)", async () => {
      if (!isInfraAvailable() || !hasWarningTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.employee_warnings
        SET status = 'rescinded',
            rescinded_date = now(),
            rescinded_by = ${userA.id}::uuid,
            rescinded_reason = 'Issued in error',
            updated_at = now()
        WHERE id = ${warningIdA}::uuid
        RETURNING id, status, rescinded_reason
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("rescinded");
      expect(rows[0].rescinded_reason).toBe("Issued in error");
    });
  });

  // ===========================================================================
  // Cross-Tenant RLS Insert Protection
  // ===========================================================================

  describe("Cross-Tenant Insert Protection", () => {
    it("should prevent inserting RTW check with wrong tenant_id", async () => {
      if (!isInfraAvailable() || !hasRtwTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      // Try to insert with tenant B's ID while in tenant A's context
      try {
        await db`
          INSERT INTO app.rtw_checks (
            id, tenant_id, employee_id, check_type, check_date, checked_by_user_id
          )
          VALUES (
            ${crypto.randomUUID()}::uuid, ${tenantB.id}::uuid, ${employeeB1}::uuid,
            'manual_list_a', '2025-03-01'::date, ${userA.id}::uuid
          )
        `;
        // If we get here, RLS did not block the insert
        throw new Error("Expected RLS violation but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("violates row-level security") ||
          message.includes("new row violates") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });

    it("should prevent inserting H&S incident with wrong tenant_id", async () => {
      if (!isInfraAvailable() || !hasHsTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.hs_incidents (
            id, tenant_id, incident_date, reported_date, description, severity
          )
          VALUES (
            ${crypto.randomUUID()}::uuid, ${tenantB.id}::uuid,
            now(), now(), 'Should not insert', 'minor'
          )
        `;
        throw new Error("Expected RLS violation but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("violates row-level security") ||
          message.includes("new row violates") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });
  });
});
