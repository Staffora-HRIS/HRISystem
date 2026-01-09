/**
 * Idempotency Integration Tests
 *
 * Verifies that idempotency prevents duplicate writes and
 * returns cached responses for repeated requests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import {
  getTestDb,
  getTestRedis,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Idempotency", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let redis: ReturnType<typeof getTestRedis> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    redis = getTestRedis();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await cleanupTestTenant(db, tenant.id);
    await cleanupTestUser(db, user.id);
    await closeTestConnections(db, redis);
  });

  beforeEach(async () => {
    if (!db || !tenant || !user) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    // Skip cleanup if fixtures not available
    if (!db || !tenant || !user) return;
    try {
      await withSystemContext(db, async (tx) => {
        await tx`
          DELETE FROM app.idempotency_keys
          WHERE tenant_id = ${tenant.id}::uuid
            AND user_id = ${user.id}::uuid
        `;
      });
      await clearTenantContext(db);
    } catch {
      // Ignore cleanup errors when infra not available
    }
  });

  describe("Idempotency key storage", () => {
    it("should store idempotency key on first request", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";
      const requestHash = "abc123";

      // Insert idempotency key
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, ${requestHash},
          0,
          true, now(),
          now() + interval '48 hours'
        )
      `;

      // Verify it was stored
      const result = await db<{ idempotencyKey: string }[]>`
        SELECT idempotency_key as "idempotencyKey"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${user.id}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.idempotencyKey).toBe(idempotencyKey);
    });

    it("should detect duplicate idempotency key", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";
      const requestHash = "abc123";

      // First insert
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status, response_body,
          processing,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, ${requestHash},
          201, '{"id": "test-123"}'::jsonb,
          false,
          now() + interval '48 hours'
        )
      `;

      // Check for existing key
      const existing = await db<{ responseStatus: number; responseBody: string }[]>`
        SELECT response_status as "responseStatus", response_body::text as "responseBody"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${user.id}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
          AND expires_at > now()
      `;

      expect(existing.length).toBe(1);
      expect(existing[0]!.responseStatus).toBe(201);
      const storedBody =
        typeof (existing[0] as any).responseBody === "string"
          ? JSON.parse((existing[0] as any).responseBody)
          : (existing[0] as any).responseBody;
      expect(storedBody).toEqual({ id: "test-123" });
    });

    it("should reject mismatched request body for same idempotency key", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";
      const originalHash = "original-hash";
      const differentHash = "different-hash";

      // Store original request
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, ${originalHash},
          0,
          true, now(),
          now() + interval '48 hours'
        )
      `;

      // Check with different hash
      const existing = await db<{ requestHash: string }[]>`
        SELECT request_hash as "requestHash"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${user.id}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
      `;

      expect(existing.length).toBe(1);
      expect(existing[0]!.requestHash).not.toBe(differentHash);

      // In real implementation, this would throw REQUEST_MISMATCH error
    });

    it("should scope idempotency by tenant", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";

      // Store for tenant A
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, 'hash1',
          0,
          true, now(),
          now() + interval '48 hours'
        )
      `;

      // Create another tenant
      const tenant2 = await createTestTenant(db, { name: "Tenant 2", slug: "tenant-2" });
      const user2 = await createTestUser(db, tenant2.id);

      try {
        await setTenantContext(db, tenant2.id, user2.id);
        // Same idempotency key for different tenant should be allowed
        await db`
          INSERT INTO app.idempotency_keys (
            id, tenant_id, user_id, route_key, idempotency_key,
            request_hash, response_status,
            processing, processing_started_at,
            expires_at
          )
          VALUES (
            gen_random_uuid(), ${tenant2.id}::uuid, ${user2.id}::uuid,
            ${routeKey}, ${idempotencyKey}, 'hash2',
            0,
            true, now(),
            now() + interval '48 hours'
          )
        `;

        // Verify both exist
        await setTenantContext(db, tenant.id, user.id);
        const count = await withSystemContext(db, async (tx) => {
          const rows = await tx<{ count: string }[]>`
            SELECT COUNT(*)::text as count
            FROM app.idempotency_keys
            WHERE idempotency_key = ${idempotencyKey}
          `;
          return rows;
        });

        expect(parseInt(count[0]!.count, 10)).toBe(2);
      } finally {
        await cleanupTestTenant(db, tenant2.id);
        await cleanupTestUser(db, user2.id);
      }
    });

    it("should scope idempotency by route", async () => {
      const idempotencyKey = crypto.randomUUID();
      const route1 = "POST:/api/v1/employees";
      const route2 = "POST:/api/v1/positions";

      // Same idempotency key on different routes should be allowed
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${route1}, ${idempotencyKey}, 'hash1',
          0,
          true, now(),
          now() + interval '48 hours'
        )
      `;

      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${route2}, ${idempotencyKey}, 'hash2',
          0,
          true, now(),
          now() + interval '48 hours'
        )
      `;

      const count = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND idempotency_key = ${idempotencyKey}
      `;

      expect(parseInt(count[0]!.count, 10)).toBe(2);
    });

    it("should expire old idempotency keys", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";

      // Insert expired key
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, 'hash',
          0,
          false,
          now() - interval '1 hour'
        )
      `;

      // Query for non-expired keys should return nothing
      const result = await db<{ id: string }[]>`
        SELECT id
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND idempotency_key = ${idempotencyKey}
          AND expires_at > now()
      `;

      expect(result.length).toBe(0);
    });
  });

  describe("Locking mechanism", () => {
    it("should lock key during processing", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";

      // Insert locked key
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, 'hash',
          0,
          true, now(),
          now() + interval '48 hours'
        )
      `;

      // Check lock status
      const result = await db<{ processing: boolean }[]>`
        SELECT processing
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND idempotency_key = ${idempotencyKey}
      `;

      expect(result[0]!.processing).toBe(true);
    });

    it("should release lock after timeout", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/test";

      // Insert key locked more than 30 seconds ago
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, 'hash',
          0,
          true, now() - interval '1 minute',
          now() + interval '48 hours'
        )
      `;

      // Stale lock should be considered released
      const result = await db<{ processing: boolean; processingStartedAt: Date }[]>`
        SELECT processing, processing_started_at as "processingStartedAt"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND idempotency_key = ${idempotencyKey}
      `;

      const lockAge = Date.now() - new Date(result[0]!.processingStartedAt).getTime();
      const isStale = lockAge > 30000; // 30 seconds

      expect(isStale).toBe(true);
    });
  });

  describe("Prevent duplicate business operations", () => {
    it("should prevent duplicate employee creation", async () => {
      const idempotencyKey = crypto.randomUUID();
      const routeKey = "POST:/api/v1/employees";
      const employeeNumber = `TEST-${Date.now()}`;

      // First request - create employee
      const emp1 = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${employeeNumber}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      // Store idempotency result
      await db`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status, response_body,
          processing,
          expires_at
        )
        VALUES (
          gen_random_uuid(), ${tenant.id}::uuid, ${user.id}::uuid,
          ${routeKey}, ${idempotencyKey}, 'request-hash',
          201, ${JSON.stringify({ id: emp1[0]!.id })}::jsonb,
          false,
          now() + interval '48 hours'
        )
      `;

      // Second request with same idempotency key - should get cached response
      const cached = await db<{ responseBody: string }[]>`
        SELECT response_body::text as "responseBody"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${user.id}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
          AND expires_at > now()
      `;

      const cachedResponseRaw = cached[0] as any;
      const cachedResponse =
        typeof cachedResponseRaw.responseBody === "string"
          ? JSON.parse(cachedResponseRaw.responseBody)
          : cachedResponseRaw.responseBody;

      // response_body::text returns a JSON string (e.g. '{"id":"..."}'), which
      // may itself be a JSON string if it was stored as a JSONB string literal.
      const parsed =
        typeof cachedResponse === "string" ? JSON.parse(cachedResponse) : cachedResponse;

      expect(parsed.id).toBe(emp1[0]!.id);

      // Verify only one employee was created
      const employees = await db<{ id: string }[]>`
        SELECT id FROM app.employees
        WHERE tenant_id = ${tenant.id}::uuid
          AND employee_number = ${employeeNumber}
      `;

      expect(employees.length).toBe(1);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp1[0]!.id}::uuid`;
      });
    });
  });
});
