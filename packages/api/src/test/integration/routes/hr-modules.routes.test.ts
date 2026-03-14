/**
 * HR Sub-Modules Integration Tests
 *
 * REAL integration tests against the database with RLS enforcement.
 * Tests create, read, and cross-tenant isolation for:
 *   - Equipment (equipment_catalog, equipment_requests)
 *   - Jobs (jobs)
 *   - Employee Contacts (employee_contacts)
 *   - Employee Addresses (employee_addresses)
 *   - Employee Identifiers (employee_identifiers)
 *   - Compensation History (compensation_history)
 *   - Right to Work Checks (rtw_checks)
 *
 * Uses the hris_app role (NOBYPASSRLS) so RLS policies are enforced.
 *
 * NOTE: The test DB connection does NOT use postgres.js toCamel transform,
 * so column names from RETURNING clauses are in snake_case.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
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
} from "../../setup";

/**
 * After createTestTenant / createTestUser (which use withSystemContext internally),
 * PostgreSQL leaves app.system_context as '' (empty string) at the session level.
 * The jobs table RLS policy casts this to boolean, and ''::boolean is invalid.
 * This helper resets it to 'false' at session level to avoid the error.
 */
async function resetSystemContext(db: ReturnType<typeof import("postgres")>): Promise<void> {
  await db`SELECT set_config('app.system_context', 'false', false)`;
}

describe("HR Sub-Modules Integration (RLS)", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let userA: TestUser;
  let userB: TestUser;

  // Employees -- one per tenant, required as FK target for most sub-modules
  let employeeA: string;
  let employeeB: string;

  const suffix = Date.now();

  // Track all IDs for cleanup
  const cleanup = {
    catalogItems: [] as string[],
    equipmentRequests: [] as string[],
    jobs: [] as string[],
    contacts: [] as string[],
    addresses: [] as string[],
    identifiers: [] as string[],
    compensationRecords: [] as string[],
    rtwChecks: [] as string[],
    employees: [] as string[],
    personalRecords: [] as string[],
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
      name: `HR-Mods-A-${suffix}`,
      slug: `hr-mods-a-${suffix}`,
    });
    tenantB = await createTestTenant(db, {
      name: `HR-Mods-B-${suffix}`,
      slug: `hr-mods-b-${suffix}`,
    });

    userA = await createTestUser(db, tenantA.id, {
      email: `hr-mods-a-${suffix}@test.com`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `hr-mods-b-${suffix}@test.com`,
    });

    // Reset system context after withSystemContext calls in createTestTenant/createTestUser
    // leave app.system_context as '' (empty string) at session level, which breaks
    // the jobs table RLS policy that casts it to boolean.
    await resetSystemContext(db);

    // Create employees in each tenant (needed as FK targets)
    await setTenantContext(db, tenantA.id, userA.id);
    const empRowsA = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenantA.id}::uuid, ${"HRMOD-A-" + suffix}, 'active', '2024-01-15')
      RETURNING id
    `;
    employeeA = empRowsA[0]!.id;
    cleanup.employees.push(employeeA);

    // Also create employee_personal row (needed for joins)
    const personalA = await db<{ id: string }[]>`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenantA.id}::uuid, ${employeeA}::uuid, 'Alice', 'TestA', '2024-01-15')
      RETURNING id
    `;
    cleanup.personalRecords.push(personalA[0]!.id);

    await setTenantContext(db, tenantB.id, userB.id);
    const empRowsB = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenantB.id}::uuid, ${"HRMOD-B-" + suffix}, 'active', '2024-02-01')
      RETURNING id
    `;
    employeeB = empRowsB[0]!.id;
    cleanup.employees.push(employeeB);

    const personalB = await db<{ id: string }[]>`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenantB.id}::uuid, ${employeeB}::uuid, 'Bob', 'TestB', '2024-02-01')
      RETURNING id
    `;
    cleanup.personalRecords.push(personalB[0]!.id);

    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Delete in reverse dependency order
      for (const id of cleanup.rtwChecks) {
        await tx`DELETE FROM app.rtw_checks WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.compensationRecords) {
        await tx`DELETE FROM app.compensation_history WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.contacts) {
        await tx`DELETE FROM app.employee_contacts WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.addresses) {
        await tx`DELETE FROM app.employee_addresses WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.identifiers) {
        await tx`DELETE FROM app.employee_identifiers WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.jobs) {
        await tx`DELETE FROM app.jobs WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.equipmentRequests) {
        await tx`DELETE FROM app.equipment_request_history WHERE request_id = ${id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.equipment_requests WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.catalogItems) {
        await tx`DELETE FROM app.equipment_catalog WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.personalRecords) {
        await tx`DELETE FROM app.employee_personal WHERE id = ${id}::uuid`.catch(() => {});
      }
      for (const id of cleanup.employees) {
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${id}::uuid`.catch(() => {});
      }
    });

    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);

    await closeTestConnections(db);
  });

  // =========================================================================
  // Equipment
  // =========================================================================

  describe("Equipment (equipment_catalog & equipment_requests)", () => {
    let catalogItemA: string;
    let requestIdA: string;

    it("should create a catalog item under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string; name: string; equipment_type: string }[]>`
        INSERT INTO app.equipment_catalog (
          tenant_id, name, equipment_type, description, is_standard_issue
        )
        VALUES (
          ${tenantA.id}::uuid, 'MacBook Pro 16', 'laptop',
          'Standard dev machine', true
        )
        RETURNING id, name, equipment_type
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe("MacBook Pro 16");
      expect(rows[0]!.equipment_type).toBe("laptop");

      catalogItemA = rows[0]!.id;
      cleanup.catalogItems.push(catalogItemA);
    });

    it("should create an equipment request under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string; status: string; equipment_type: string }[]>`
        INSERT INTO app.equipment_requests (
          tenant_id, employee_id, catalog_item_id, equipment_type,
          quantity, priority, notes
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, ${catalogItemA}::uuid,
          'laptop', 1, 'high', 'New hire setup'
        )
        RETURNING id, status, equipment_type
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("pending");
      expect(rows[0]!.equipment_type).toBe("laptop");

      requestIdA = rows[0]!.id;
      cleanup.equipmentRequests.push(requestIdA);
    });

    it("should list equipment catalog items for tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.equipment_catalog WHERE is_active = true
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === catalogItemA)).toBe(true);
    });

    it("RLS: tenant B cannot see tenant A catalog items", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.equipment_catalog WHERE id = ${catalogItemA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot see tenant A equipment requests", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.equipment_requests WHERE id = ${requestIdA}
      `;

      expect(rows).toHaveLength(0);
    });
  });

  // =========================================================================
  // Jobs
  // =========================================================================

  describe("Jobs (jobs)", () => {
    let jobIdA: string;

    it("should create a job under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string; code: string; title: string; status: string }[]>`
        INSERT INTO app.jobs (
          tenant_id, code, title, family, job_level,
          status, effective_date, created_by
        )
        VALUES (
          ${tenantA.id}::uuid, ${"SWE-" + suffix}, 'Software Engineer',
          'Engineering', 3, 'active', '2025-01-01', ${userA.id}::uuid
        )
        RETURNING id, code, title, status
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.title).toBe("Software Engineer");
      expect(rows[0]!.status).toBe("active");

      jobIdA = rows[0]!.id;
      cleanup.jobs.push(jobIdA);
    });

    it("should list jobs for tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string; title: string }[]>`
        SELECT id, title FROM app.jobs WHERE status = 'active'
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === jobIdA)).toBe(true);
    });

    it("should update a job title", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ title: string }[]>`
        UPDATE app.jobs
        SET title = 'Senior Software Engineer', updated_by = ${userA.id}::uuid
        WHERE id = ${jobIdA}
        RETURNING title
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.title).toBe("Senior Software Engineer");
    });

    it("RLS: tenant B cannot see tenant A jobs", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.jobs WHERE id = ${jobIdA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot update tenant A jobs", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const result = await db`
        UPDATE app.jobs
        SET title = 'Hacked Title'
        WHERE id = ${jobIdA}
      `;

      // RLS silently filters -- 0 rows updated
      expect(result.count).toBe(0);
    });
  });

  // =========================================================================
  // Employee Contacts
  // =========================================================================

  describe("Employee Contacts (employee_contacts)", () => {
    let contactIdA: string;

    it("should create an employee contact under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{
        id: string;
        contact_type: string;
        value: string;
        is_primary: boolean;
      }[]>`
        INSERT INTO app.employee_contacts (
          tenant_id, employee_id, contact_type, value,
          is_primary, effective_from
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, 'emergency', '+441234567890',
          true, '2024-01-15'
        )
        RETURNING id, contact_type, value, is_primary
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.contact_type).toBe("emergency");
      expect(rows[0]!.value).toBe("+441234567890");
      expect(rows[0]!.is_primary).toBe(true);

      contactIdA = rows[0]!.id;
      cleanup.contacts.push(contactIdA);
    });

    it("should list employee contacts for the correct employee", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_contacts
        WHERE employee_id = ${employeeA}::uuid
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === contactIdA)).toBe(true);
    });

    it("should update an employee contact value", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ value: string }[]>`
        UPDATE app.employee_contacts
        SET value = '+449876543210'
        WHERE id = ${contactIdA}
        RETURNING value
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.value).toBe("+449876543210");
    });

    it("RLS: tenant B cannot see tenant A employee contacts", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_contacts WHERE id = ${contactIdA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot insert employee contacts with tenant A's ID", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      try {
        await db`
          INSERT INTO app.employee_contacts (
            tenant_id, employee_id, contact_type, value, effective_from
          )
          VALUES (
            ${tenantA.id}::uuid, ${employeeA}::uuid, 'phone',
            '+440000000000', '2024-01-15'
          )
        `;
        throw new Error("Expected RLS error but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("new row violates") ||
          message.includes("violates row-level security") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });
  });

  // =========================================================================
  // Employee Addresses
  // =========================================================================

  describe("Employee Addresses (employee_addresses)", () => {
    let addressIdA: string;

    it("should create an employee address under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{
        id: string;
        address_type: string;
        city: string;
        is_primary: boolean;
      }[]>`
        INSERT INTO app.employee_addresses (
          tenant_id, employee_id, address_type, street_line1,
          city, postal_code, country, is_primary, effective_from
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, 'home', '123 High Street',
          'London', 'SW1A 1AA', 'GBR', true, '2024-01-15'
        )
        RETURNING id, address_type, city, is_primary
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.address_type).toBe("home");
      expect(rows[0]!.city).toBe("London");
      expect(rows[0]!.is_primary).toBe(true);

      addressIdA = rows[0]!.id;
      cleanup.addresses.push(addressIdA);
    });

    it("should list employee addresses for the correct employee", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_addresses
        WHERE employee_id = ${employeeA}::uuid
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === addressIdA)).toBe(true);
    });

    it("should update an employee address", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ city: string; postal_code: string }[]>`
        UPDATE app.employee_addresses
        SET city = 'Manchester', postal_code = 'M1 1AA'
        WHERE id = ${addressIdA}
        RETURNING city, postal_code
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.city).toBe("Manchester");
      expect(rows[0]!.postal_code).toBe("M1 1AA");
    });

    it("RLS: tenant B cannot see tenant A employee addresses", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_addresses WHERE id = ${addressIdA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot insert employee addresses with tenant A's ID", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      try {
        await db`
          INSERT INTO app.employee_addresses (
            tenant_id, employee_id, address_type, street_line1,
            city, country, effective_from
          )
          VALUES (
            ${tenantA.id}::uuid, ${employeeA}::uuid, 'work', '456 Fake Road',
            'Birmingham', 'GBR', '2024-01-15'
          )
        `;
        throw new Error("Expected RLS error but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("new row violates") ||
          message.includes("violates row-level security") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });
  });

  // =========================================================================
  // Employee Identifiers
  // =========================================================================

  describe("Employee Identifiers (employee_identifiers)", () => {
    let identifierIdA: string;

    it("should create an employee identifier under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{
        id: string;
        identifier_type: string;
        identifier_value: string;
        is_primary: boolean;
      }[]>`
        INSERT INTO app.employee_identifiers (
          tenant_id, employee_id, identifier_type, identifier_value,
          issuing_country, issue_date, expiry_date,
          is_primary, effective_from
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, 'passport', 'AB1234567',
          'GBR', '2020-06-01', '2030-06-01',
          true, '2024-01-15'
        )
        RETURNING id, identifier_type, identifier_value, is_primary
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.identifier_type).toBe("passport");
      expect(rows[0]!.identifier_value).toBe("AB1234567");
      expect(rows[0]!.is_primary).toBe(true);

      identifierIdA = rows[0]!.id;
      cleanup.identifiers.push(identifierIdA);
    });

    it("should list employee identifiers for the correct employee", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_identifiers
        WHERE employee_id = ${employeeA}::uuid
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === identifierIdA)).toBe(true);
    });

    it("should update an employee identifier", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ identifier_value: string; expiry_date: string }[]>`
        UPDATE app.employee_identifiers
        SET identifier_value = 'CD9876543', expiry_date = '2035-12-31'
        WHERE id = ${identifierIdA}
        RETURNING identifier_value, expiry_date
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.identifier_value).toBe("CD9876543");
    });

    it("RLS: tenant B cannot see tenant A employee identifiers", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_identifiers WHERE id = ${identifierIdA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot insert employee identifiers with tenant A's ID", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      try {
        await db`
          INSERT INTO app.employee_identifiers (
            tenant_id, employee_id, identifier_type, identifier_value,
            effective_from
          )
          VALUES (
            ${tenantA.id}::uuid, ${employeeA}::uuid, 'tax_id', 'HACK123',
            '2024-01-15'
          )
        `;
        throw new Error("Expected RLS error but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("new row violates") ||
          message.includes("violates row-level security") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });
  });

  // =========================================================================
  // Compensation History
  // =========================================================================

  describe("Compensation History (compensation_history)", () => {
    let compIdA: string;

    it("should create a compensation record under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{
        id: string;
        base_salary: string;
        currency: string;
        pay_frequency: string;
      }[]>`
        INSERT INTO app.compensation_history (
          tenant_id, employee_id, effective_from,
          base_salary, currency, pay_frequency, change_reason
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, '2024-01-15',
          45000.00, 'GBP', 'monthly', 'New hire'
        )
        RETURNING id, base_salary, currency, pay_frequency
      `;

      expect(rows).toHaveLength(1);
      expect(parseFloat(rows[0]!.base_salary)).toBe(45000.00);
      expect(rows[0]!.currency).toBe("GBP");
      expect(rows[0]!.pay_frequency).toBe("monthly");

      compIdA = rows[0]!.id;
      cleanup.compensationRecords.push(compIdA);
    });

    it("should list compensation records for the correct employee", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.compensation_history
        WHERE employee_id = ${employeeA}::uuid
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === compIdA)).toBe(true);
    });

    it("should update compensation with a pay rise", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      // Close off the current record
      await db`
        UPDATE app.compensation_history
        SET effective_to = '2025-03-31'
        WHERE id = ${compIdA}
      `;

      // Create a new record for the pay rise
      const rows = await db<{
        id: string;
        base_salary: string;
        change_reason: string;
        change_percentage: string;
      }[]>`
        INSERT INTO app.compensation_history (
          tenant_id, employee_id, effective_from,
          base_salary, currency, pay_frequency,
          change_reason, change_percentage
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, '2025-04-01',
          49500.00, 'GBP', 'monthly',
          'Annual review', 10.00
        )
        RETURNING id, base_salary, change_reason, change_percentage
      `;

      expect(rows).toHaveLength(1);
      expect(parseFloat(rows[0]!.base_salary)).toBe(49500.00);
      expect(rows[0]!.change_reason).toBe("Annual review");
      expect(parseFloat(rows[0]!.change_percentage)).toBe(10.00);

      cleanup.compensationRecords.push(rows[0]!.id);
    });

    it("RLS: tenant B cannot see tenant A compensation records", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.compensation_history WHERE id = ${compIdA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot insert compensation records with tenant A's ID", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      try {
        await db`
          INSERT INTO app.compensation_history (
            tenant_id, employee_id, effective_from,
            base_salary, currency, pay_frequency
          )
          VALUES (
            ${tenantA.id}::uuid, ${employeeA}::uuid, '2025-06-01',
            99999.00, 'GBP', 'monthly'
          )
        `;
        throw new Error("Expected RLS error but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("new row violates") ||
          message.includes("violates row-level security") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });
  });

  // =========================================================================
  // Right to Work Checks
  // =========================================================================

  describe("Right to Work Checks (rtw_checks)", () => {
    let rtwIdA: string;

    it("should create a RTW check under tenant A", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{
        id: string;
        check_type: string;
        status: string;
        right_to_work_confirmed: boolean;
      }[]>`
        INSERT INTO app.rtw_checks (
          tenant_id, employee_id, check_type, check_date,
          checked_by_user_id, status, document_type,
          document_reference, right_to_work_confirmed
        )
        VALUES (
          ${tenantA.id}::uuid, ${employeeA}::uuid, 'manual_list_a', '2024-01-15',
          ${userA.id}::uuid, 'pending', 'UK Passport',
          'ABC123456', false
        )
        RETURNING id, check_type, status, right_to_work_confirmed
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.check_type).toBe("manual_list_a");
      expect(rows[0]!.status).toBe("pending");
      expect(rows[0]!.right_to_work_confirmed).toBe(false);

      rtwIdA = rows[0]!.id;
      cleanup.rtwChecks.push(rtwIdA);
    });

    it("should list RTW checks for the correct employee", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.rtw_checks
        WHERE employee_id = ${employeeA}::uuid
      `;

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r) => r.id === rtwIdA)).toBe(true);
    });

    it("should verify a RTW check", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ status: string; right_to_work_confirmed: boolean }[]>`
        UPDATE app.rtw_checks
        SET status = 'verified', right_to_work_confirmed = true
        WHERE id = ${rtwIdA}
        RETURNING status, right_to_work_confirmed
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("verified");
      expect(rows[0]!.right_to_work_confirmed).toBe(true);
    });

    it("RLS: tenant B cannot see tenant A RTW checks", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.rtw_checks WHERE id = ${rtwIdA}
      `;

      expect(rows).toHaveLength(0);
    });

    it("RLS: tenant B cannot insert RTW checks with tenant A's ID", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);
      try {
        await db`
          INSERT INTO app.rtw_checks (
            tenant_id, employee_id, check_type, check_date,
            checked_by_user_id, status
          )
          VALUES (
            ${tenantA.id}::uuid, ${employeeA}::uuid, 'online_share_code', '2025-01-01',
            ${userB.id}::uuid, 'pending'
          )
        `;
        throw new Error("Expected RLS error but insert succeeded");
      } catch (error) {
        const message = String(error);
        const isRlsError =
          message.includes("new row violates") ||
          message.includes("violates row-level security") ||
          message.includes("permission denied");
        expect(isRlsError).toBe(true);
      }
    });
  });

  // =========================================================================
  // Cross-module RLS: verify tenant B data is isolated when querying broadly
  // =========================================================================

  describe("Cross-module RLS isolation", () => {
    let jobIdB: string;
    let contactIdB: string;
    let addressIdB: string;
    let identifierIdB: string;
    let compIdB: string;
    let rtwIdB: string;

    beforeAll(async () => {
      if (!isInfraAvailable()) return;

      // Create data in tenant B to verify isolation works both directions
      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);

      const jB = await db<{ id: string }[]>`
        INSERT INTO app.jobs (
          tenant_id, code, title, family, status, effective_date, created_by
        )
        VALUES (
          ${tenantB.id}::uuid, ${"PM-" + suffix}, 'Product Manager',
          'Product', 'active', '2025-01-01', ${userB.id}::uuid
        )
        RETURNING id
      `;
      jobIdB = jB[0]!.id;
      cleanup.jobs.push(jobIdB);

      const cB = await db<{ id: string }[]>`
        INSERT INTO app.employee_contacts (
          tenant_id, employee_id, contact_type, value, effective_from
        )
        VALUES (
          ${tenantB.id}::uuid, ${employeeB}::uuid, 'phone', '+440000111222', '2024-02-01'
        )
        RETURNING id
      `;
      contactIdB = cB[0]!.id;
      cleanup.contacts.push(contactIdB);

      const addrB = await db<{ id: string }[]>`
        INSERT INTO app.employee_addresses (
          tenant_id, employee_id, address_type, street_line1,
          city, country, effective_from
        )
        VALUES (
          ${tenantB.id}::uuid, ${employeeB}::uuid, 'home', '789 Oak Lane',
          'Edinburgh', 'GBR', '2024-02-01'
        )
        RETURNING id
      `;
      addressIdB = addrB[0]!.id;
      cleanup.addresses.push(addressIdB);

      const idB = await db<{ id: string }[]>`
        INSERT INTO app.employee_identifiers (
          tenant_id, employee_id, identifier_type, identifier_value,
          effective_from
        )
        VALUES (
          ${tenantB.id}::uuid, ${employeeB}::uuid, 'national_id', 'NI-999999',
          '2024-02-01'
        )
        RETURNING id
      `;
      identifierIdB = idB[0]!.id;
      cleanup.identifiers.push(identifierIdB);

      const compB = await db<{ id: string }[]>`
        INSERT INTO app.compensation_history (
          tenant_id, employee_id, effective_from,
          base_salary, currency, pay_frequency, change_reason
        )
        VALUES (
          ${tenantB.id}::uuid, ${employeeB}::uuid, '2024-02-01',
          38000.00, 'GBP', 'monthly', 'New hire'
        )
        RETURNING id
      `;
      compIdB = compB[0]!.id;
      cleanup.compensationRecords.push(compIdB);

      const rtwB = await db<{ id: string }[]>`
        INSERT INTO app.rtw_checks (
          tenant_id, employee_id, check_type, check_date,
          checked_by_user_id, status
        )
        VALUES (
          ${tenantB.id}::uuid, ${employeeB}::uuid, 'manual_list_b', '2024-02-01',
          ${userB.id}::uuid, 'pending'
        )
        RETURNING id
      `;
      rtwIdB = rtwB[0]!.id;
      cleanup.rtwChecks.push(rtwIdB);
    });

    it("tenant A sees only its own jobs", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.jobs
      `;

      for (const row of rows) {
        expect(row.id).not.toBe(jobIdB);
      }
    });

    it("tenant A sees only its own employee contacts", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_contacts
      `;

      for (const row of rows) {
        expect(row.id).not.toBe(contactIdB);
      }
    });

    it("tenant A sees only its own employee addresses", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_addresses
      `;

      for (const row of rows) {
        expect(row.id).not.toBe(addressIdB);
      }
    });

    it("tenant A sees only its own employee identifiers", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.employee_identifiers
      `;

      for (const row of rows) {
        expect(row.id).not.toBe(identifierIdB);
      }
    });

    it("tenant A sees only its own compensation records", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.compensation_history
      `;

      for (const row of rows) {
        expect(row.id).not.toBe(compIdB);
      }
    });

    it("tenant A sees only its own RTW checks", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantA.id, userA.id);
      await resetSystemContext(db);
      const rows = await db<{ id: string }[]>`
        SELECT id FROM app.rtw_checks
      `;

      for (const row of rows) {
        expect(row.id).not.toBe(rtwIdB);
      }
    });

    it("tenant B sees only its own data when querying all tables", async () => {
      if (!isInfraAvailable()) return;

      await setTenantContext(db, tenantB.id, userB.id);
      await resetSystemContext(db);

      const jobs = await db<{ id: string }[]>`SELECT id FROM app.jobs`;
      const contacts = await db<{ id: string }[]>`SELECT id FROM app.employee_contacts`;
      const addresses = await db<{ id: string }[]>`SELECT id FROM app.employee_addresses`;
      const identifiers = await db<{ id: string }[]>`SELECT id FROM app.employee_identifiers`;
      const comp = await db<{ id: string }[]>`SELECT id FROM app.compensation_history`;
      const rtw = await db<{ id: string }[]>`SELECT id FROM app.rtw_checks`;

      // Tenant B should see its own data
      expect(jobs.some((r) => r.id === jobIdB)).toBe(true);
      expect(contacts.some((r) => r.id === contactIdB)).toBe(true);
      expect(addresses.some((r) => r.id === addressIdB)).toBe(true);
      expect(identifiers.some((r) => r.id === identifierIdB)).toBe(true);
      expect(comp.some((r) => r.id === compIdB)).toBe(true);
      expect(rtw.some((r) => r.id === rtwIdB)).toBe(true);
    });
  });

  // =========================================================================
  // System context bypass verification
  // =========================================================================

  describe("System context bypass", () => {
    it("withSystemContext can read all equipment across tenants", async () => {
      if (!isInfraAvailable()) return;

      const allCatalog = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string; tenant_id: string }[]>`
          SELECT id, tenant_id FROM app.equipment_catalog
          WHERE tenant_id IN (${tenantA.id}::uuid, ${tenantB.id}::uuid)
        `;
      });
      // Reset system context after withSystemContext call
      await resetSystemContext(db);

      // System context should see data from tenant A at minimum
      expect(allCatalog.length).toBeGreaterThanOrEqual(1);
      expect(allCatalog.some((r) => r.tenant_id === tenantA.id)).toBe(true);
    });

    it("withSystemContext can read all jobs across tenants", async () => {
      if (!isInfraAvailable()) return;

      const allJobs = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string; tenant_id: string }[]>`
          SELECT id, tenant_id FROM app.jobs
          WHERE tenant_id IN (${tenantA.id}::uuid, ${tenantB.id}::uuid)
        `;
      });
      // Reset system context after withSystemContext call
      await resetSystemContext(db);

      const tenantIds = new Set(allJobs.map((r) => r.tenant_id));
      expect(tenantIds.size).toBe(2);
    });
  });
});
