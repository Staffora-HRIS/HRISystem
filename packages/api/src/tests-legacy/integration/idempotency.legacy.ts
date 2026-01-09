/**
 * Idempotency Integration Tests
 *
 * Tests that duplicate requests with the same idempotency key return cached results.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import { getTestDatabaseUrl } from "../../config/database";

// FIX: Using centralized configuration to prevent password mismatch issues
const TEST_DB_URL = getTestDatabaseUrl();

describe("Idempotency - Request Deduplication", () => {
  let sql: postgres.Sql;
  let testTenant: string;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL);

    const [tenant] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Idempotency Test', 'idempotency-test', 'active')
      RETURNING id
    `;
    testTenant = tenant.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM app.idempotency_keys WHERE tenant_id = ${testTenant}::uuid`;
    await sql`DELETE FROM app.tenants WHERE slug = 'idempotency-test'`;
    await sql.end();
  });

  it("should store idempotency key on first request", async () => {
    const idempotencyKey = `test-key-${Date.now()}`;
    const response = { id: "test-123", status: "created" };

    await sql`
      INSERT INTO app.idempotency_keys (id, tenant_id, key, method, path, response_code, response_body, expires_at)
      VALUES (
        gen_random_uuid(),
        ${testTenant}::uuid,
        ${idempotencyKey},
        'POST',
        '/api/v1/employees',
        201,
        ${JSON.stringify(response)}::jsonb,
        now() + interval '24 hours'
      )
    `;

    const [stored] = await sql`
      SELECT * FROM app.idempotency_keys WHERE key = ${idempotencyKey}
    `;

    expect(stored).toBeDefined();
    expect(stored.key).toBe(idempotencyKey);
    expect(stored.responseCode).toBe(201);
  });

  it("should return cached response for duplicate key", async () => {
    const idempotencyKey = `duplicate-key-${Date.now()}`;
    const originalResponse = { id: "emp-456", name: "Test Employee" };

    // Store first request
    await sql`
      INSERT INTO app.idempotency_keys (id, tenant_id, key, method, path, response_code, response_body, expires_at)
      VALUES (
        gen_random_uuid(),
        ${testTenant}::uuid,
        ${idempotencyKey},
        'POST',
        '/api/v1/employees',
        201,
        ${JSON.stringify(originalResponse)}::jsonb,
        now() + interval '24 hours'
      )
    `;

    // Query for cached response
    const [cached] = await sql`
      SELECT response_code, response_body FROM app.idempotency_keys
      WHERE tenant_id = ${testTenant}::uuid AND key = ${idempotencyKey}
        AND expires_at > now()
    `;

    expect(cached).toBeDefined();
    expect(cached.responseBody).toEqual(originalResponse);
  });

  it("should not return expired idempotency keys", async () => {
    const idempotencyKey = `expired-key-${Date.now()}`;

    // Store expired key
    await sql`
      INSERT INTO app.idempotency_keys (id, tenant_id, key, method, path, response_code, response_body, expires_at)
      VALUES (
        gen_random_uuid(),
        ${testTenant}::uuid,
        ${idempotencyKey},
        'POST',
        '/api/v1/employees',
        201,
        '{"status": "expired"}'::jsonb,
        now() - interval '1 hour'
      )
    `;

    // Query should not return expired key
    const cached = await sql`
      SELECT * FROM app.idempotency_keys
      WHERE tenant_id = ${testTenant}::uuid AND key = ${idempotencyKey}
        AND expires_at > now()
    `;

    expect(cached.length).toBe(0);
  });

  it("should scope idempotency keys by tenant", async () => {
    const sharedKey = `shared-key-${Date.now()}`;

    // Create another tenant
    const [otherTenant] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Other Tenant', 'other-idempotency', 'active')
      RETURNING id
    `;

    // Store key for test tenant
    await sql`
      INSERT INTO app.idempotency_keys (id, tenant_id, key, method, path, response_code, response_body, expires_at)
      VALUES (
        gen_random_uuid(),
        ${testTenant}::uuid,
        ${sharedKey},
        'POST',
        '/api/v1/employees',
        201,
        '{"tenant": "test"}'::jsonb,
        now() + interval '24 hours'
      )
    `;

    // Query from other tenant should not find it
    const otherTenantResult = await sql`
      SELECT * FROM app.idempotency_keys
      WHERE tenant_id = ${otherTenant.id}::uuid AND key = ${sharedKey}
    `;

    expect(otherTenantResult.length).toBe(0);

    // Cleanup
    await sql`DELETE FROM app.tenants WHERE slug = 'other-idempotency'`;
  });
});
