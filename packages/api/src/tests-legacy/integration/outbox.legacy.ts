/**
 * Outbox Pattern Integration Tests
 *
 * Tests that domain events are correctly written to the outbox table
 * atomically with business operations.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import { getTestDatabaseUrl } from "../../config/database";

// FIX: Using centralized configuration to prevent password mismatch issues
const TEST_DB_URL = getTestDatabaseUrl();

describe("Outbox - Domain Event Publishing", () => {
  let sql: postgres.Sql;
  let testTenant: string;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL);

    const [tenant] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Outbox Test', 'outbox-test', 'active')
      RETURNING id
    `;
    testTenant = tenant.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM app.domain_outbox WHERE tenant_id = ${testTenant}::uuid`;
    await sql`DELETE FROM app.employees WHERE tenant_id = ${testTenant}::uuid`;
    await sql`DELETE FROM app.tenants WHERE slug = 'outbox-test'`;
    await sql.end();
  });

  it("should write domain event to outbox on entity creation", async () => {
    const employeeId = crypto.randomUUID();

    // Simulate transactional write (employee + outbox event)
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, email, status)
        VALUES (${employeeId}::uuid, ${testTenant}::uuid, 'EMP-OUTBOX-1', 'Outbox', 'Test', 'outbox@test.com', 'active')
      `;

      await tx`
        INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          gen_random_uuid(),
          ${testTenant}::uuid,
          'employee',
          ${employeeId}::uuid,
          'hr.employee.created',
          ${JSON.stringify({ employeeId, action: "created" })}::jsonb
        )
      `;
    });

    // Verify outbox event was created
    const [event] = await sql`
      SELECT * FROM app.domain_outbox
      WHERE aggregate_id = ${employeeId}::uuid AND event_type = 'hr.employee.created'
    `;

    expect(event).toBeDefined();
    expect(event.aggregateType).toBe("employee");
    expect(event.eventType).toBe("hr.employee.created");
    expect(event.processedAt).toBeNull();
  });

  it("should mark event as processed after handling", async () => {
    const eventId = crypto.randomUUID();

    // Create unprocessed event
    await sql`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
      VALUES (
        ${eventId}::uuid,
        ${testTenant}::uuid,
        'leave_request',
        gen_random_uuid(),
        'absence.request.submitted',
        '{"status": "submitted"}'::jsonb
      )
    `;

    // Mark as processed
    await sql`
      UPDATE app.domain_outbox
      SET processed_at = now()
      WHERE id = ${eventId}::uuid
    `;

    const [processed] = await sql`
      SELECT processed_at FROM app.domain_outbox WHERE id = ${eventId}::uuid
    `;

    expect(processed.processedAt).not.toBeNull();
  });

  it("should support event ordering by created_at", async () => {
    const aggregateId = crypto.randomUUID();

    // Create multiple events
    await sql`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
      VALUES 
        (gen_random_uuid(), ${testTenant}::uuid, 'timesheet', ${aggregateId}::uuid, 'time.timesheet.created', '{}'::jsonb, now() - interval '2 hours'),
        (gen_random_uuid(), ${testTenant}::uuid, 'timesheet', ${aggregateId}::uuid, 'time.timesheet.submitted', '{}'::jsonb, now() - interval '1 hour'),
        (gen_random_uuid(), ${testTenant}::uuid, 'timesheet', ${aggregateId}::uuid, 'time.timesheet.approved', '{}'::jsonb, now())
    `;

    // Query events in order
    const events = await sql`
      SELECT event_type, created_at FROM app.domain_outbox
      WHERE aggregate_id = ${aggregateId}::uuid
      ORDER BY created_at ASC
    `;

    expect(events.length).toBe(3);
    expect(events[0].eventType).toBe("time.timesheet.created");
    expect(events[1].eventType).toBe("time.timesheet.submitted");
    expect(events[2].eventType).toBe("time.timesheet.approved");
  });

  it("should support retry count for failed processing", async () => {
    const eventId = crypto.randomUUID();

    await sql`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, retry_count)
      VALUES (
        ${eventId}::uuid,
        ${testTenant}::uuid,
        'notification',
        gen_random_uuid(),
        'system.notification.send',
        '{"to": "user@example.com"}'::jsonb,
        0
      )
    `;

    // Simulate retry increment
    await sql`
      UPDATE app.domain_outbox
      SET retry_count = retry_count + 1, last_error = 'Connection timeout'
      WHERE id = ${eventId}::uuid
    `;

    const [event] = await sql`
      SELECT retry_count, last_error FROM app.domain_outbox WHERE id = ${eventId}::uuid
    `;

    expect(event.retryCount).toBe(1);
    expect(event.lastError).toBe("Connection timeout");
  });

  it("should scope outbox events by tenant", async () => {
    // Create another tenant
    const [otherTenant] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Other Outbox Tenant', 'other-outbox', 'active')
      RETURNING id
    `;

    // Create events for both tenants
    await sql`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
      VALUES 
        (gen_random_uuid(), ${testTenant}::uuid, 'employee', gen_random_uuid(), 'hr.employee.created', '{}'::jsonb),
        (gen_random_uuid(), ${otherTenant.id}::uuid, 'employee', gen_random_uuid(), 'hr.employee.created', '{}'::jsonb)
    `;

    // Query only test tenant events
    const testTenantEvents = await sql`
      SELECT * FROM app.domain_outbox WHERE tenant_id = ${testTenant}::uuid
    `;

    const otherTenantEvents = await sql`
      SELECT * FROM app.domain_outbox WHERE tenant_id = ${otherTenant.id}::uuid
    `;

    expect(testTenantEvents.length).toBeGreaterThan(0);
    expect(otherTenantEvents.length).toBeGreaterThan(0);
    expect(testTenantEvents.every((e: any) => e.tenantId === testTenant)).toBe(true);

    // Cleanup
    await sql`DELETE FROM app.domain_outbox WHERE tenant_id = ${otherTenant.id}::uuid`;
    await sql`DELETE FROM app.tenants WHERE slug = 'other-outbox'`;
  });
});

describe("Outbox - Atomicity with Business Operations", () => {
  let sql: postgres.Sql;
  let testTenant: string;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL);

    const [tenant] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Atomicity Test', 'atomicity-test', 'active')
      RETURNING id
    `;
    testTenant = tenant.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM app.domain_outbox WHERE tenant_id = ${testTenant}::uuid`;
    await sql`DELETE FROM app.employees WHERE tenant_id = ${testTenant}::uuid`;
    await sql`DELETE FROM app.tenants WHERE slug = 'atomicity-test'`;
    await sql.end();
  });

  it("should rollback outbox event if business operation fails", async () => {
    const employeeId = crypto.randomUUID();
    let transactionFailed = false;

    try {
      await sql.begin(async (tx) => {
        // Write outbox event first
        await tx`
          INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
          VALUES (
            gen_random_uuid(),
            ${testTenant}::uuid,
            'employee',
            ${employeeId}::uuid,
            'hr.employee.created',
            '{}'::jsonb
          )
        `;

        // Simulate failure in business operation (e.g., constraint violation)
        throw new Error("Simulated business logic failure");
      });
    } catch {
      transactionFailed = true;
    }

    expect(transactionFailed).toBe(true);

    // Verify outbox event was NOT created due to rollback
    const events = await sql`
      SELECT * FROM app.domain_outbox WHERE aggregate_id = ${employeeId}::uuid
    `;

    expect(events.length).toBe(0);
  });
});
