/**
 * Privacy Module Integration Tests
 *
 * Tests Consent Management, DSAR Requests, Data Erasure Requests,
 * Data Breach Incidents, and Privacy Notices directly against the database.
 *
 * Verifies:
 * - CRUD operations work correctly through RLS
 * - Cross-tenant isolation (tenant A cannot see tenant B's data)
 * - Status transitions (DSAR lifecycle, erasure lifecycle)
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

describe("Privacy Routes - Database Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let userA: TestUser;
  let userB: TestUser;

  // Employee IDs created for each tenant
  let employeeA1: string;
  let employeeB1: string;

  // Track which table groups are available (migrations may not have been applied)
  let hasConsentTables = false;
  let hasDsarTables = false;
  let hasErasureTables = false;
  let hasBreachTables = false;
  let hasPrivacyNoticeTables = false;

  // Track IDs for cleanup
  const cleanup = {
    consentPurposes: [] as string[],
    consentRecords: [] as string[],
    consentAuditLog: [] as string[],
    dsarRequests: [] as string[],
    dsarDataItems: [] as string[],
    dsarAuditLog: [] as string[],
    erasureRequests: [] as string[],
    erasureItems: [] as string[],
    erasureAuditLog: [] as string[],
    dataBreaches: [] as string[],
    dataBreachTimeline: [] as string[],
    privacyNotices: [] as string[],
    privacyAcknowledgements: [] as string[],
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

    // Check which privacy tables exist (migrations may be pending)
    [hasConsentTables, hasDsarTables, hasErasureTables, hasBreachTables, hasPrivacyNoticeTables] =
      await Promise.all([
        tableExists(db, "consent_purposes"),
        tableExists(db, "dsar_requests"),
        tableExists(db, "erasure_requests"),
        tableExists(db, "data_breaches"),
        tableExists(db, "privacy_notices"),
      ]);

    // Create two tenants for RLS isolation tests
    tenantA = await createTestTenant(db, {
      name: `Privacy-A-${suffix}`,
      slug: `privacy-a-${suffix}`,
    });
    tenantB = await createTestTenant(db, {
      name: `Privacy-B-${suffix}`,
      slug: `privacy-b-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `priv-a-${suffix}@example.com`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `priv-b-${suffix}@example.com`,
    });

    // Create employees for each tenant
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
        VALUES (${employeeA1}::uuid, ${tenantA.id}::uuid, ${"PRIV-A-" + suffix}, 'active', '2024-01-15')
      `;
    });
    await withSystemContext(db, async (tx) => {
      await tx`SELECT set_config('app.current_user', ${userB.id}, true)`;
      await tx`SELECT set_config('app.current_tenant', ${tenantB.id}, true)`;
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${employeeB1}::uuid, ${tenantB.id}::uuid, ${"PRIV-B-" + suffix}, 'active', '2024-02-01')
      `;
    });
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Clean up in reverse dependency order — only attempt tables that exist
      if (hasPrivacyNoticeTables) {
        for (const id of cleanup.privacyAcknowledgements) {
          await tx`DELETE FROM app.privacy_notice_acknowledgements WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.privacyNotices) {
          await tx`DELETE FROM app.privacy_notices WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasBreachTables) {
        for (const id of cleanup.dataBreachTimeline) {
          await tx`DELETE FROM app.data_breach_timeline WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.dataBreaches) {
          await tx`DELETE FROM app.data_breaches WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasErasureTables) {
        for (const id of cleanup.erasureAuditLog) {
          await tx`DELETE FROM app.erasure_audit_log WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.erasureItems) {
          await tx`DELETE FROM app.erasure_items WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.erasureRequests) {
          await tx`DELETE FROM app.erasure_requests WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasDsarTables) {
        for (const id of cleanup.dsarAuditLog) {
          await tx`DELETE FROM app.dsar_audit_log WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.dsarDataItems) {
          await tx`DELETE FROM app.dsar_data_items WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.dsarRequests) {
          await tx`DELETE FROM app.dsar_requests WHERE id = ${id}::uuid`.catch(() => {});
        }
      }
      if (hasConsentTables) {
        for (const id of cleanup.consentAuditLog) {
          await tx`DELETE FROM app.consent_audit_log WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.consentRecords) {
          await tx`DELETE FROM app.consent_records WHERE id = ${id}::uuid`.catch(() => {});
        }
        for (const id of cleanup.consentPurposes) {
          await tx`DELETE FROM app.consent_purposes WHERE id = ${id}::uuid`.catch(() => {});
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
  // Consent Purposes
  // ===========================================================================

  describe("Consent Purposes", () => {
    let purposeIdA: string;
    let purposeIdB: string;

    it("should create a consent purpose for tenant A", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const purposeId = crypto.randomUUID();
      cleanup.consentPurposes.push(purposeId);

      const rows = await db`
        INSERT INTO app.consent_purposes (
          id, tenant_id, code, name, description,
          legal_basis, data_categories, retention_period_days,
          is_required, version
        )
        VALUES (
          ${purposeId}::uuid, ${tenantA.id}::uuid,
          ${"marketing_emails_" + suffix}, 'Marketing Communications',
          'Consent to receive marketing emails and promotional offers',
          'consent', ARRAY['contact_details', 'preferences']::text[],
          365, false, 1
        )
        RETURNING id, tenant_id, code, name, is_active, version
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Marketing Communications");
      expect(rows[0].isActive).toBe(true);
      expect(rows[0].version).toBe(1);
      purposeIdA = purposeId;
    });

    it("should create a consent purpose for tenant B", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const purposeId = crypto.randomUUID();
      cleanup.consentPurposes.push(purposeId);

      const rows = await db`
        INSERT INTO app.consent_purposes (
          id, tenant_id, code, name, description,
          legal_basis, data_categories, is_required, version
        )
        VALUES (
          ${purposeId}::uuid, ${tenantB.id}::uuid,
          ${"data_analytics_" + suffix}, 'Analytics Processing',
          'Consent for internal analytics and reporting',
          'legitimate_interest', ARRAY['usage_data']::text[],
          true, 1
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      purposeIdB = purposeId;
    });

    it("should isolate consent purposes by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id, code FROM app.consent_purposes
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenantId === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === purposeIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === purposeIdB)).toBe(false);
    });

    it("should update a consent purpose and bump version", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.consent_purposes
        SET description = 'Updated description for GDPR compliance',
            version = version + 1,
            updated_at = now()
        WHERE id = ${purposeIdA}::uuid AND tenant_id = ${tenantA.id}::uuid
        RETURNING id, version, description
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe(2);
    });
  });

  // ===========================================================================
  // Consent Records (Grant & Withdraw)
  // ===========================================================================

  describe("Consent Records", () => {
    let consentRecordIdA: string;
    let purposeIdForRecords: string;

    beforeAll(async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      // Create a purpose for records tests
      purposeIdForRecords = crypto.randomUUID();
      cleanup.consentPurposes.push(purposeIdForRecords);

      await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_tenant', ${tenantA.id}, true)`;
        await tx`
          INSERT INTO app.consent_purposes (
            id, tenant_id, code, name, description,
            legal_basis, data_categories, is_required, version
          )
          VALUES (
            ${purposeIdForRecords}::uuid, ${tenantA.id}::uuid,
            ${"records_purpose_" + suffix}, 'Records Test Purpose',
            'Purpose for testing consent records',
            'consent', ARRAY['contact_details']::text[],
            false, 1
          )
        `;
      });
    });

    it("should grant consent (create consent record)", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const recordId = crypto.randomUUID();
      cleanup.consentRecords.push(recordId);

      const rows = await db`
        INSERT INTO app.consent_records (
          id, tenant_id, employee_id, consent_purpose_id,
          purpose_version, status, granted_at,
          consent_method, ip_address, user_agent
        )
        VALUES (
          ${recordId}::uuid, ${tenantA.id}::uuid,
          ${employeeA1}::uuid, ${purposeIdForRecords}::uuid,
          1, 'granted', now(),
          'web_form', '192.168.1.100', 'TestBot/1.0'
        )
        RETURNING id, tenant_id, status, consent_method
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("granted");
      expect(rows[0].consentMethod).toBe("web_form");
      consentRecordIdA = recordId;
    });

    it("should read consent records for an employee", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT cr.id, cr.status, cr.consent_method, cp.name as purpose_name
        FROM app.consent_records cr
        JOIN app.consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE cr.employee_id = ${employeeA1}::uuid
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r: Record<string, unknown>) => r.id === consentRecordIdA)).toBe(true);
    });

    it("should withdraw consent", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.consent_records
        SET status = 'withdrawn',
            withdrawn_at = now(),
            withdrawal_reason = 'Employee requested removal from mailing list',
            updated_at = now()
        WHERE id = ${consentRecordIdA}::uuid
        RETURNING id, status, withdrawn_at, withdrawal_reason
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("withdrawn");
      expect(rows[0].withdrawalReason).toBe("Employee requested removal from mailing list");
    });

    it("should write to consent audit log", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const auditId = crypto.randomUUID();
      cleanup.consentAuditLog.push(auditId);

      const rows = await db`
        INSERT INTO app.consent_audit_log (
          id, tenant_id, consent_record_id, action, performed_by, details
        )
        VALUES (
          ${auditId}::uuid, ${tenantA.id}::uuid,
          ${consentRecordIdA}::uuid, 'withdrawn',
          ${userA.id}::uuid,
          '{"reason": "Employee request"}'::jsonb
        )
        RETURNING id, action
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe("withdrawn");
    });
  });

  // ===========================================================================
  // DSAR Requests
  // ===========================================================================

  describe("DSAR Requests", () => {
    let dsarIdA: string;
    let dsarIdB: string;

    it("should create a DSAR request for tenant A", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const dsarId = crypto.randomUUID();
      cleanup.dsarRequests.push(dsarId);

      const rows = await db`
        INSERT INTO app.dsar_requests (
          id, tenant_id, employee_id, requested_by_user_id,
          request_type, status, received_date, deadline_date,
          response_format, notes
        )
        VALUES (
          ${dsarId}::uuid, ${tenantA.id}::uuid,
          ${employeeA1}::uuid, ${userA.id}::uuid,
          'access', 'received', '2025-03-01'::date,
          '2025-03-29'::date, 'electronic',
          'Employee requested full data export'
        )
        RETURNING id, tenant_id, status, request_type
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("received");
      expect(rows[0].requestType).toBe("access");
      dsarIdA = dsarId;
    });

    it("should create a DSAR request for tenant B", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const dsarId = crypto.randomUUID();
      cleanup.dsarRequests.push(dsarId);

      const rows = await db`
        INSERT INTO app.dsar_requests (
          id, tenant_id, employee_id, requested_by_user_id,
          request_type, status, received_date, deadline_date,
          response_format
        )
        VALUES (
          ${dsarId}::uuid, ${tenantB.id}::uuid,
          ${employeeB1}::uuid, ${userB.id}::uuid,
          'portability', 'received', '2025-03-05'::date,
          '2025-04-02'::date, 'electronic'
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      dsarIdB = dsarId;
    });

    it("should isolate DSAR requests by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id FROM app.dsar_requests
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenantId === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === dsarIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === dsarIdB)).toBe(false);
    });

    it("should update DSAR status (received -> in_progress)", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.dsar_requests
        SET status = 'in_progress',
            identity_verified = true,
            identity_verified_date = '2025-03-02'::date,
            identity_verified_by = ${userA.id}::uuid,
            updated_at = now()
        WHERE id = ${dsarIdA}::uuid
        RETURNING id, status, identity_verified
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("in_progress");
      expect(rows[0].identityVerified).toBe(true);
    });

    it("should complete a DSAR request", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.dsar_requests
        SET status = 'completed',
            completed_date = '2025-03-20'::date,
            updated_at = now()
        WHERE id = ${dsarIdA}::uuid
        RETURNING id, status, completed_date
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("completed");
    });

    it("should create and read DSAR data items", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const itemId = crypto.randomUUID();
      cleanup.dsarDataItems.push(itemId);

      const rows = await db`
        INSERT INTO app.dsar_data_items (
          id, tenant_id, dsar_request_id, module_name, data_category,
          status, record_count
        )
        VALUES (
          ${itemId}::uuid, ${tenantA.id}::uuid, ${dsarIdA}::uuid,
          'hr', 'personal_information',
          'gathered', 15
        )
        RETURNING id, module_name, data_category, status, record_count
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].moduleName).toBe("hr");
      expect(rows[0].recordCount).toBe(15);

      // Read back
      const retrieved = await db`
        SELECT id, module_name FROM app.dsar_data_items
        WHERE dsar_request_id = ${dsarIdA}::uuid
      `;
      expect(retrieved.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Data Erasure Requests
  // ===========================================================================

  describe("Data Erasure Requests", () => {
    let erasureIdA: string;
    let erasureIdB: string;

    it("should create an erasure request for tenant A", async () => {
      if (!isInfraAvailable() || !hasErasureTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const erasureId = crypto.randomUUID();
      cleanup.erasureRequests.push(erasureId);

      const rows = await db`
        INSERT INTO app.erasure_requests (
          id, tenant_id, employee_id, requested_by_user_id,
          status, received_date, deadline_date, notes
        )
        VALUES (
          ${erasureId}::uuid, ${tenantA.id}::uuid,
          ${employeeA1}::uuid, ${userA.id}::uuid,
          'received', '2025-03-01'::date, '2025-03-29'::date,
          'Employee leaving and requests full data erasure'
        )
        RETURNING id, tenant_id, status
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("received");
      erasureIdA = erasureId;
    });

    it("should create an erasure request for tenant B", async () => {
      if (!isInfraAvailable() || !hasErasureTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const erasureId = crypto.randomUUID();
      cleanup.erasureRequests.push(erasureId);

      const rows = await db`
        INSERT INTO app.erasure_requests (
          id, tenant_id, employee_id, requested_by_user_id,
          status, received_date, deadline_date
        )
        VALUES (
          ${erasureId}::uuid, ${tenantB.id}::uuid,
          ${employeeB1}::uuid, ${userB.id}::uuid,
          'received', '2025-03-10'::date, '2025-04-07'::date
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      erasureIdB = erasureId;
    });

    it("should isolate erasure requests by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasErasureTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id FROM app.erasure_requests
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenantId === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === erasureIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === erasureIdB)).toBe(false);
    });

    it("should update erasure request status (received -> approved)", async () => {
      if (!isInfraAvailable() || !hasErasureTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.erasure_requests
        SET status = 'approved',
            approved_by = ${userA.id}::uuid,
            approved_at = now()
        WHERE id = ${erasureIdA}::uuid
        RETURNING id, status, approved_by
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("approved");
    });

    it("should create erasure items for an erasure request", async () => {
      if (!isInfraAvailable() || !hasErasureTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const itemId = crypto.randomUUID();
      cleanup.erasureItems.push(itemId);

      const rows = await db`
        INSERT INTO app.erasure_items (
          id, tenant_id, erasure_request_id,
          table_name, module_name, record_count,
          action_taken
        )
        VALUES (
          ${itemId}::uuid, ${tenantA.id}::uuid, ${erasureIdA}::uuid,
          'employee_personal', 'hr', 3,
          'anonymized'
        )
        RETURNING id, table_name, action_taken, record_count
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].tableName).toBe("employee_personal");
      expect(rows[0].actionTaken).toBe("anonymized");
      expect(rows[0].recordCount).toBe(3);
    });
  });

  // ===========================================================================
  // Data Breach Incidents
  // ===========================================================================

  describe("Data Breach Incidents", () => {
    let breachIdA: string;
    let breachIdB: string;

    it("should create a data breach for tenant A", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const breachId = crypto.randomUUID();
      cleanup.dataBreaches.push(breachId);

      const rows = await db`
        INSERT INTO app.data_breaches (
          id, tenant_id, title, description, detected_at, detected_by,
          severity, status, breach_type, data_categories_affected,
          estimated_individuals_affected, ico_deadline
        )
        VALUES (
          ${breachId}::uuid, ${tenantA.id}::uuid,
          'Unauthorized email forwarding', 'Employee auto-forwarding sensitive data to personal email',
          '2025-03-01'::timestamptz, ${userA.id}::uuid,
          'high', 'detected', 'confidentiality',
          ARRAY['personal_data', 'contact_details']::text[],
          5, '2025-03-04'::timestamptz
        )
        RETURNING id, tenant_id, title, status, severity
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Unauthorized email forwarding");
      expect(rows[0].status).toBe("detected");
      expect(rows[0].severity).toBe("high");
      breachIdA = breachId;
    });

    it("should create a data breach for tenant B", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const breachId = crypto.randomUUID();
      cleanup.dataBreaches.push(breachId);

      const rows = await db`
        INSERT INTO app.data_breaches (
          id, tenant_id, title, description, detected_at, detected_by,
          severity, status, breach_type, ico_deadline
        )
        VALUES (
          ${breachId}::uuid, ${tenantB.id}::uuid,
          'Laptop stolen', 'Company laptop with unencrypted HR data stolen from office',
          '2025-03-05'::timestamptz, ${userB.id}::uuid,
          'critical', 'detected', 'availability',
          '2025-03-08'::timestamptz
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      breachIdB = breachId;
    });

    it("should isolate data breaches by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id, title FROM app.data_breaches
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenantId === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === breachIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === breachIdB)).toBe(false);
    });

    it("should get breach by ID within same tenant", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, title, severity, status, ico_notified
        FROM app.data_breaches
        WHERE id = ${breachIdA}::uuid
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].icoNotified).toBe(false);
    });

    it("should NOT return breach from another tenant", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.data_breaches WHERE id = ${breachIdB}::uuid
      `;

      expect(rows).toHaveLength(0);
    });

    it("should create timeline entries for a breach", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const entryId = crypto.randomUUID();
      cleanup.dataBreachTimeline.push(entryId);

      const rows = await db`
        INSERT INTO app.data_breach_timeline (
          id, tenant_id, breach_id, action, action_by, notes
        )
        VALUES (
          ${entryId}::uuid, ${tenantA.id}::uuid, ${breachIdA}::uuid,
          'breach_detected', ${userA.id}::uuid,
          'Suspicious forwarding rule detected by IT security scan'
        )
        RETURNING id, action, notes
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe("breach_detected");

      // Read timeline
      const timeline = await db`
        SELECT id, action FROM app.data_breach_timeline
        WHERE breach_id = ${breachIdA}::uuid
        ORDER BY action_at DESC
      `;
      expect(timeline.length).toBeGreaterThanOrEqual(1);
    });

    it("should update breach status to notified_ico", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.data_breaches
        SET status = 'notified_ico',
            ico_notified = true,
            ico_notification_date = now(),
            ico_reference = 'ICO-2025-001',
            updated_at = now()
        WHERE id = ${breachIdA}::uuid
        RETURNING id, status, ico_notified, ico_reference
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("notified_ico");
      expect(rows[0].icoNotified).toBe(true);
      expect(rows[0].icoReference).toBe("ICO-2025-001");
    });
  });

  // ===========================================================================
  // Privacy Notices
  // ===========================================================================

  describe("Privacy Notices", () => {
    let noticeIdA: string;
    let noticeIdB: string;

    it("should create a privacy notice for tenant A", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const noticeId = crypto.randomUUID();
      cleanup.privacyNotices.push(noticeId);

      const rows = await db`
        INSERT INTO app.privacy_notices (
          id, tenant_id, title, version, content,
          effective_from, is_current, created_by
        )
        VALUES (
          ${noticeId}::uuid, ${tenantA.id}::uuid,
          'Employee Privacy Policy', 1,
          'This privacy policy explains how we collect, use, and protect your personal data...',
          '2025-01-01'::date, true, ${userA.id}::uuid
        )
        RETURNING id, tenant_id, title, version, is_current
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Employee Privacy Policy");
      expect(rows[0].version).toBe(1);
      expect(rows[0].isCurrent).toBe(true);
      noticeIdA = noticeId;
    });

    it("should create a privacy notice for tenant B", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const noticeId = crypto.randomUUID();
      cleanup.privacyNotices.push(noticeId);

      const rows = await db`
        INSERT INTO app.privacy_notices (
          id, tenant_id, title, version, content,
          effective_from, is_current, created_by
        )
        VALUES (
          ${noticeId}::uuid, ${tenantB.id}::uuid,
          'Data Processing Notice', 1,
          'This notice describes how your employer processes your personal data...',
          '2025-02-01'::date, true, ${userB.id}::uuid
        )
        RETURNING id, tenant_id
      `;

      expect(rows).toHaveLength(1);
      noticeIdB = noticeId;
    });

    it("should isolate privacy notices by tenant via RLS", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, tenant_id, title FROM app.privacy_notices
      `;

      expect(rows.every((r: Record<string, unknown>) => r.tenantId === tenantA.id)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === noticeIdA)).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.id === noticeIdB)).toBe(false);
    });

    it("should get privacy notice by ID within same tenant", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id, title, version, content, is_current
        FROM app.privacy_notices
        WHERE id = ${noticeIdA}::uuid
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Employee Privacy Policy");
      expect(rows[0].isCurrent).toBe(true);
    });

    it("should NOT return privacy notice from another tenant", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT id FROM app.privacy_notices WHERE id = ${noticeIdB}::uuid
      `;

      expect(rows).toHaveLength(0);
    });

    it("should update a privacy notice", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        UPDATE app.privacy_notices
        SET content = 'Updated privacy policy content with new data retention section...',
            updated_at = now()
        WHERE id = ${noticeIdA}::uuid
        RETURNING id, content
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].content).toContain("Updated privacy policy");
    });

    it("should create an acknowledgement for a privacy notice", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const ackId = crypto.randomUUID();
      cleanup.privacyAcknowledgements.push(ackId);

      const rows = await db`
        INSERT INTO app.privacy_notice_acknowledgements (
          id, tenant_id, privacy_notice_id, employee_id,
          acknowledged_at, ip_address, user_agent
        )
        VALUES (
          ${ackId}::uuid, ${tenantA.id}::uuid,
          ${noticeIdA}::uuid, ${employeeA1}::uuid,
          now(), '10.0.0.1', 'Mozilla/5.0'
        )
        RETURNING id, privacy_notice_id, employee_id
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].privacyNoticeId).toBe(noticeIdA);
      expect(rows[0].employeeId).toBe(employeeA1);
    });
  });

  // ===========================================================================
  // Cross-Tenant RLS Insert Protection
  // ===========================================================================

  describe("Cross-Tenant Insert Protection", () => {
    it("should prevent inserting consent purpose with wrong tenant_id", async () => {
      if (!isInfraAvailable() || !hasConsentTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.consent_purposes (
            id, tenant_id, code, name, description,
            legal_basis, data_categories, version
          )
          VALUES (
            ${crypto.randomUUID()}::uuid, ${tenantB.id}::uuid,
            'should_fail', 'Should Fail', 'This should not insert',
            'consent', ARRAY['test']::text[], 1
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

    it("should prevent inserting DSAR request with wrong tenant_id", async () => {
      if (!isInfraAvailable() || !hasDsarTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.dsar_requests (
            id, tenant_id, employee_id, requested_by_user_id,
            request_type, status, received_date, deadline_date,
            response_format
          )
          VALUES (
            ${crypto.randomUUID()}::uuid, ${tenantB.id}::uuid,
            ${employeeB1}::uuid, ${userA.id}::uuid,
            'access', 'received', '2025-03-01'::date,
            '2025-03-29'::date, 'electronic'
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

    it("should prevent inserting data breach with wrong tenant_id", async () => {
      if (!isInfraAvailable() || !hasBreachTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.data_breaches (
            id, tenant_id, title, detected_at, detected_by,
            severity, status, ico_deadline
          )
          VALUES (
            ${crypto.randomUUID()}::uuid, ${tenantB.id}::uuid,
            'Should not insert', now(), ${userA.id}::uuid,
            'low', 'detected', now() + interval '72 hours'
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

    it("should prevent inserting privacy notice with wrong tenant_id", async () => {
      if (!isInfraAvailable() || !hasPrivacyNoticeTables) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.privacy_notices (
            id, tenant_id, title, version, content,
            effective_from, is_current
          )
          VALUES (
            ${crypto.randomUUID()}::uuid, ${tenantB.id}::uuid,
            'Should not insert', 1, 'This should fail',
            '2025-01-01'::date, false
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
