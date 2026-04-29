/**
 * RLS (Row-Level Security) Integration Tests
 *
 * Verifies that RLS policies properly isolate tenant data.
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
  expectRlsError,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("RLS - Row Level Security", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenantA: TestTenant | null = null;
  let tenantB: TestTenant | null = null;
  let userA: TestUser | null = null;
  let userB: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();

    const suffix = Date.now();

    // Create two separate tenants
    tenantA = await createTestTenant(db, { name: "Tenant A", slug: `tenant-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: "Tenant B", slug: `tenant-b-${suffix}` });

    // Create users for each tenant
    userA = await createTestUser(db, tenantA.id, { email: `user-a-${suffix}@example.com` });
    userB = await createTestUser(db, tenantB.id, { email: `user-b-${suffix}@example.com` });
  });

  afterAll(async () => {
    if (!db || !userA || !userB || !tenantA || !tenantB) return;
    // Cleanup
    await cleanupTestUser(db, userA.id);
    await cleanupTestUser(db, userB.id);
    await cleanupTestTenant(db, tenantA.id);
    await cleanupTestTenant(db, tenantB.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    // Skip if db not available
    if (!db) return;
    // Clear any existing context
    await clearTenantContext(db);
  });

  afterEach(async () => {
    // Skip if db not available
    if (!db) return;
    await clearTenantContext(db);
  });

  describe("Org Units", () => {
    let orgUnitA: string;
    let orgUnitB: string;

    beforeAll(async () => {
      // Skip if fixtures not available
      if (!db || !tenantA || !tenantB || !userA || !userB) return;
      // Create org units for each tenant
      await setTenantContext(db, tenantA.id, userA.id);
      const resultA = await db<{ id: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenantA.id}::uuid, 'ORG-A', 'Org Unit A', true, CURRENT_DATE)
        RETURNING id
      `;
      orgUnitA = resultA[0]!.id;

      await setTenantContext(db, tenantB.id, userB.id);
      const resultB = await db<{ id: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenantB.id}::uuid, 'ORG-B', 'Org Unit B', true, CURRENT_DATE)
        RETURNING id
      `;
      orgUnitB = resultB[0]!.id;
    });

    afterAll(async () => {
      // Skip if fixtures not available
      if (!db || !orgUnitA || !orgUnitB) return;
      // Clean up org units
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.org_units WHERE id IN (${orgUnitA}::uuid, ${orgUnitB}::uuid)`;
      });
    });

    it("should allow tenant A to read only their org units", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units
      `;

      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe(orgUnitA);
    });

    it("should allow tenant B to read only their org units", async () => {
      if (!db || !tenantB || !userB) return;
      await setTenantContext(db, tenantB.id, userB.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units
      `;

      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe(orgUnitB);
    });

    it("should prevent tenant A from reading tenant B's org units", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE id = ${orgUnitB}::uuid
      `;

      // RLS should filter out the record
      expect(results.length).toBe(0);
    });

    it("should prevent tenant A from inserting into tenant B", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      // Attempting to insert with tenant B's ID should fail
      await expectRlsError(async () => {
        await db`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenantB.id}::uuid, 'HACK', 'Hacked Unit', true, CURRENT_DATE)
        `;
      });
    });

    it("should prevent tenant A from updating tenant B's org units", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      // This should affect 0 rows due to RLS
      await db`
        UPDATE app.org_units
        SET name = 'Hacked'
        WHERE id = ${orgUnitB}::uuid
      `;

      // Verify the update didn't happen
      await setTenantContext(db, tenantB.id, userB.id);
      const check = await db<{ name: string }[]>`
        SELECT name FROM app.org_units WHERE id = ${orgUnitB}::uuid
      `;
      expect(check[0]!.name).toBe("Org Unit B");
    });

    it("should prevent tenant A from deleting tenant B's org units", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;
      await setTenantContext(db, tenantA.id, userA.id);

      // This should affect 0 rows due to RLS
      await db`
        DELETE FROM app.org_units WHERE id = ${orgUnitB}::uuid
      `;

      // Verify the delete didn't happen
      await setTenantContext(db, tenantB.id, userB.id);
      const check = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE id = ${orgUnitB}::uuid
      `;
      expect(check.length).toBe(1);
    });
  });

  describe("Employees", () => {
    let orgUnitA: string;
    let positionA: string;
    let employeeA: string;
    let orgUnitB: string;
    let positionB: string;
    let employeeB: string;

    beforeAll(async () => {
      // Skip if fixtures not available
      if (!db || !tenantA || !tenantB || !userA || !userB) return;
      // Setup for tenant A
      await setTenantContext(db, tenantA.id, userA.id);

      const ouA = await db<{ id: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenantA.id}::uuid, 'EMP-TEST-A', 'Employee Test Org A', true, CURRENT_DATE)
        RETURNING id
      `;
      orgUnitA = ouA[0]!.id;

      const posA = await db<{ id: string }[]>`
        INSERT INTO app.positions (tenant_id, org_unit_id, code, title, is_active, headcount)
        VALUES (${tenantA.id}::uuid, ${orgUnitA}::uuid, 'POS-A', 'Position A', true, 10)
        RETURNING id
      `;
      positionA = posA[0]!.id;

      const empA = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenantA.id}::uuid, 'EMP-001-A', 'active', CURRENT_DATE)
        RETURNING id
      `;
      employeeA = empA[0]!.id;

      // Setup for tenant B
      await setTenantContext(db, tenantB.id, userB.id);

      const ouB = await db<{ id: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenantB.id}::uuid, 'EMP-TEST-B', 'Employee Test Org B', true, CURRENT_DATE)
        RETURNING id
      `;
      orgUnitB = ouB[0]!.id;

      const posB = await db<{ id: string }[]>`
        INSERT INTO app.positions (tenant_id, org_unit_id, code, title, is_active, headcount)
        VALUES (${tenantB.id}::uuid, ${orgUnitB}::uuid, 'POS-B', 'Position B', true, 10)
        RETURNING id
      `;
      positionB = posB[0]!.id;

      const empB = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenantB.id}::uuid, 'EMP-001-B', 'active', CURRENT_DATE)
        RETURNING id
      `;
      employeeB = empB[0]!.id;
    });

    afterAll(async () => {
      // Skip if fixtures not available
      if (!db || !employeeA || !employeeB) return;
      // Clean up in reverse order
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id IN (${employeeA}::uuid, ${employeeB}::uuid)`;
        await tx`DELETE FROM app.positions WHERE id IN (${positionA}::uuid, ${positionB}::uuid)`;
        await tx`DELETE FROM app.org_units WHERE id IN (${orgUnitA}::uuid, ${orgUnitB}::uuid)`;
      });
    });

    it("should isolate employees by tenant", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.employees
      `;

      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe(employeeA);
    });

    it("should prevent cross-tenant employee access", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE id = ${employeeB}::uuid
      `;

      expect(results.length).toBe(0);
    });

    it("should isolate positions by tenant", async () => {
      if (!db || !tenantB || !userB) return;
      await setTenantContext(db, tenantB.id, userB.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.positions
      `;

      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe(positionB);
    });
  });

  describe("Audit Log", () => {
    let auditIdA: string;
    let auditIdB: string;

    beforeAll(async () => {
      // Skip if fixtures not available
      if (!db || !tenantA || !tenantB || !userA || !userB) return;
      const resourceA = crypto.randomUUID();
      const resourceB = crypto.randomUUID();

      // Audit log insert policy requires system context
      const resultA = await db<{ id: string }[]>`
        SELECT app.write_audit_log(
          ${tenantA.id}::uuid,
          ${userA.id}::uuid,
          'create',
          'test',
          ${resourceA}::uuid
        ) as id
      `;
      auditIdA = resultA[0]!.id;

      const resultB = await db<{ id: string }[]>`
        SELECT app.write_audit_log(
          ${tenantB.id}::uuid,
          ${userB.id}::uuid,
          'create',
          'test',
          ${resourceB}::uuid
        ) as id
      `;
      auditIdB = resultB[0]!.id;
    });

    afterAll(async () => {
      // Skip if fixtures not available
      if (!db || !auditIdA || !auditIdB) return;
      // audit_log is immutable; cleanup requires system context
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.audit_log WHERE id IN (${auditIdA}::uuid, ${auditIdB}::uuid)`;
      });
    });

    it("should isolate audit logs by tenant", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.audit_log WHERE resource_type = 'test'
      `;

      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe(auditIdA);
    });
  });

  describe("Domain Outbox", () => {
    let outboxIdA: string;
    let outboxIdB: string;

    beforeAll(async () => {
      // Skip if fixtures not available
      if (!db || !tenantA || !tenantB || !userA || !userB) return;
      // Create outbox entries for each tenant
      await setTenantContext(db, tenantA.id, userA.id);
      const resultA = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (${tenantA.id}::uuid, 'test', ${crypto.randomUUID()}::uuid, 'test.created', '{}'::jsonb)
        RETURNING id
      `;
      outboxIdA = resultA[0]!.id;

      await setTenantContext(db, tenantB.id, userB.id);
      const resultB = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (${tenantB.id}::uuid, 'test', ${crypto.randomUUID()}::uuid, 'test.created', '{}'::jsonb)
        RETURNING id
      `;
      outboxIdB = resultB[0]!.id;
    });

    afterAll(async () => {
      // Skip if fixtures not available
      if (!db || !outboxIdA || !outboxIdB) return;
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE id IN (${outboxIdA}::uuid, ${outboxIdB}::uuid)`;
      });
    });

    it("should isolate domain outbox by tenant", async () => {
      if (!db || !tenantA || !userA) return;
      await setTenantContext(db, tenantA.id, userA.id);

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.domain_outbox WHERE aggregate_type = 'test'
      `;

      expect(results.length).toBe(1);
      expect(results[0]!.id).toBe(outboxIdA);
    });
  });
});
