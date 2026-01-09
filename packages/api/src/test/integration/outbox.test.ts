/**
 * Outbox Pattern Integration Tests
 *
 * Verifies that domain events are written atomically with business writes.
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

describe("Outbox Pattern", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await cleanupTestTenant(db, tenant.id);
    await cleanupTestUser(db, user.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db || !tenant || !user) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!db || !tenant) return;
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`
        DELETE FROM app.employees
        WHERE tenant_id = ${tenant.id}::uuid
          AND employee_number LIKE 'OUTBOX%'
      `;
    });

    await clearTenantContext(db);
  });

  describe("Atomic writes", () => {
    it("should write outbox event in same transaction as business write", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const employeeNumber = `OUTBOX-${Date.now()}`;
      let employeeId: string;

      // Perform business write and outbox write in transaction
      await db.begin(async (tx) => {
        // Business write
        const empResult = await tx<{ id: string }[]>`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${employeeNumber}, 'pending', CURRENT_DATE)
          RETURNING id
        `;
        employeeId = empResult[0]!.id;

        // Outbox write in same transaction
        await tx`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          )
          VALUES (
            ${tenant.id}::uuid, 'employee', ${employeeId}::uuid,
            'hr.employee.created', ${JSON.stringify({ employeeId, employeeNumber })}::jsonb
          )
        `;
      });

      // Verify both writes succeeded
      const employee = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE employee_number = ${employeeNumber}
      `;
      expect(employee.length).toBe(1);

      const outboxEvent = await db<{ aggregateId: string }[]>`
        SELECT aggregate_id as "aggregateId"
        FROM app.domain_outbox
        WHERE aggregate_type = 'employee' AND aggregate_id = ${employeeId!}::uuid
      `;
      expect(outboxEvent.length).toBe(1);
      expect(outboxEvent[0]!.aggregateId).toBe(employeeId!);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE aggregate_id = ${employeeId!}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${employeeId!}::uuid`;
      });
    });

    it("should rollback outbox event when business write fails", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const employeeNumber = `OUTBOX-FAIL-${Date.now()}`;

      // First, create a valid employee
      const existingEmp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${employeeNumber}, 'active', CURRENT_DATE)
        RETURNING id
      `;

      const outboxEventsBefore = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid AND aggregate_type = 'employee-fail-test'
      `;
      const countBefore = parseInt(outboxEventsBefore[0]!.count, 10);

      // Try to create duplicate employee - should fail and rollback
      try {
        await db.begin(async (tx) => {
          // This will fail due to unique constraint on employee_number
          const empResult = await tx<{ id: string }[]>`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${employeeNumber}, 'pending', CURRENT_DATE)
            RETURNING id
          `;

          // Outbox write - should be rolled back
          await tx`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'employee-fail-test', ${empResult[0]!.id}::uuid,
              'hr.employee.created', '{}'::jsonb
            )
          `;
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected - duplicate key error
        expect(String(error)).toContain("duplicate");
      }

      // Verify outbox event was NOT created (rolled back)
      const outboxEventsAfter = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid AND aggregate_type = 'employee-fail-test'
      `;
      const countAfter = parseInt(outboxEventsAfter[0]!.count, 10);

      expect(countAfter).toBe(countBefore);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${existingEmp[0]!.id}::uuid`;
      });
    });

    it("should rollback business write when outbox write fails", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const employeeNumber = `OUTBOX-FAIL2-${Date.now()}`;

      const employeesBefore = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE tenant_id = ${tenant.id}::uuid AND employee_number LIKE 'OUTBOX-FAIL2%'
      `;
      const countBefore = parseInt(employeesBefore[0]!.count, 10);

      // Try transaction where outbox insert fails
      try {
        await db.begin(async (tx) => {
          // Business write - will succeed
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${employeeNumber}, 'pending', CURRENT_DATE)
          `;

          // Force outbox write to fail with invalid UUID
          await tx`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'employee', 'not-a-valid-uuid'::uuid,
              'hr.employee.created', '{}'::jsonb
            )
          `;
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        // Expected - invalid UUID error
        expect(String(error)).toContain("uuid");
      }

      // Verify employee was NOT created (rolled back)
      const employeesAfter = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE tenant_id = ${tenant.id}::uuid AND employee_number LIKE 'OUTBOX-FAIL2%'
      `;
      const countAfter = parseInt(employeesAfter[0]!.count, 10);

      expect(countAfter).toBe(countBefore);
    });
  });

  describe("Outbox event structure", () => {
    it("should store correct event metadata", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const aggregateId = crypto.randomUUID();
      const eventType = "test.event.created";
      const payload = { foo: "bar", count: 42 };

      await db`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'test', ${aggregateId}::uuid,
          ${eventType}, ${JSON.stringify(payload)}::jsonb
        )
      `;

      const event = await db<{
        tenantId: string;
        aggregateType: string;
        aggregateId: string;
        eventType: string;
        payload: any;
        processedAt: Date | null;
        retryCount: number;
      }[]>`
        SELECT
          tenant_id as "tenantId",
          aggregate_type as "aggregateType",
          aggregate_id as "aggregateId",
          event_type as "eventType",
          payload,
          processed_at as "processedAt",
          retry_count as "retryCount"
        FROM app.domain_outbox
        WHERE aggregate_id = ${aggregateId}::uuid
      `;

      expect(event.length).toBe(1);
      expect(event[0]!.tenantId).toBe(tenant.id);
      expect(event[0]!.aggregateType).toBe("test");
      expect(event[0]!.eventType).toBe(eventType);
      const storedPayload =
        typeof (event[0] as any).payload === "string"
          ? JSON.parse((event[0] as any).payload)
          : (event[0] as any).payload;
      expect(storedPayload).toEqual(payload);
      expect(event[0]!.processedAt).toBeNull();
      expect(event[0]!.retryCount).toBe(0);
    });

    it("should mark event as processed", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const aggregateId = crypto.randomUUID();

      // Create event
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'test', ${aggregateId}::uuid,
          'test.event', '{}'::jsonb
        )
        RETURNING id
      `;

      // Mark as processed
      await db`
        UPDATE app.domain_outbox
        SET processed_at = now()
        WHERE id = ${result[0]!.id}::uuid
      `;

      // Verify
      const event = await db<{ processedAt: Date | null }[]>`
        SELECT processed_at as "processedAt"
        FROM app.domain_outbox
        WHERE id = ${result[0]!.id}::uuid
      `;

      expect(event[0]!.processedAt).not.toBeNull();
    });

    it("should track retry count on failures", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const aggregateId = crypto.randomUUID();

      // Create event
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'test', ${aggregateId}::uuid,
          'test.event', '{}'::jsonb
        )
        RETURNING id
      `;

      // Simulate failures
      await db`
        UPDATE app.domain_outbox
        SET retry_count = retry_count + 1,
            error_message = 'Connection timeout',
            next_retry_at = now() + interval '1 minute'
        WHERE id = ${result[0]!.id}::uuid
      `;

      await db`
        UPDATE app.domain_outbox
        SET retry_count = retry_count + 1,
            error_message = 'Connection refused'
        WHERE id = ${result[0]!.id}::uuid
      `;

      // Verify
      const event = await db<{ retryCount: number; errorMessage: string | null }[]>`
        SELECT retry_count as "retryCount", error_message as "errorMessage"
        FROM app.domain_outbox
        WHERE id = ${result[0]!.id}::uuid
      `;

      expect(event[0]!.retryCount).toBe(2);
      expect(event[0]!.errorMessage).toBe("Connection refused");
    });
  });

  describe("Outbox isolation", () => {
    it("should isolate outbox events by tenant", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      const aggregateId = crypto.randomUUID();

      // Create event for tenant A
      await db`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'test', ${aggregateId}::uuid,
          'test.isolated.event', '{}'::jsonb
        )
      `;

      // Query as tenant A - should see event
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.domain_outbox
        WHERE event_type = 'test.isolated.event'
      `;

      expect(results.length).toBe(1);

      // Create tenant B
      const suffix = Date.now();
      const tenant2 = await createTestTenant(db, { name: "Tenant 2", slug: `tenant-2-outbox-${suffix}` });
      const user2 = await createTestUser(db, tenant2.id, { email: `outbox-user2-${suffix}@example.com` });

      try {
        // Query as tenant B - should NOT see tenant A's events
        await setTenantContext(db, tenant2.id, user2.id);

        const tenant2Results = await db<{ id: string }[]>`
          SELECT id FROM app.domain_outbox
          WHERE event_type = 'test.isolated.event'
        `;

        expect(tenant2Results.length).toBe(0);
      } finally {
        await cleanupTestUser(db, user2.id);
        await cleanupTestTenant(db, tenant2.id);
      }
    });
  });
});
