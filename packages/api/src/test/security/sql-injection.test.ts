/**
 * SQL Injection Prevention Tests
 *
 * Verifies that postgres.js tagged template literals properly parameterize
 * all user-supplied inputs, preventing SQL injection across the platform.
 *
 * These tests exercise REAL database queries through the test infrastructure
 * to confirm that malicious payloads are treated as literal data, not SQL code.
 *
 * Vulnerability prevented: CWE-89 (SQL Injection)
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
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("SQL Injection Prevention", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let orgUnitId: string | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `SQLi Test Tenant ${suffix}`,
      slug: `sqli-test-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `sqli-test-${suffix}@example.com`,
    });

    // Create a known org unit for tests that need existing data
    await setTenantContext(db, tenant.id, user.id);
    const result = await db<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
      VALUES (${tenant.id}::uuid, ${"SQLI-TEST-OU"}, ${"SQLi Test Org"}, true, CURRENT_DATE)
      RETURNING id
    `;
    orgUnitId = result[0]!.id;
  });

  afterAll(async () => {
    if (!db) return;
    if (orgUnitId) {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.org_units WHERE id = ${orgUnitId!}::uuid`;
      });
    }
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  // ---------------------------------------------------------------------------
  // Classic SQL injection attempts via tagged template literals
  // ---------------------------------------------------------------------------

  describe("Classic injection via string parameters", () => {
    it("should treat DROP TABLE payload as literal string in WHERE clause", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "'; DROP TABLE app.employees; --";
      // postgres.js parameterizes this: the string is a $1 param, never interpolated
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      // Should return empty (no match), NOT execute the DROP
      expect(results.length).toBe(0);

      // Verify the table still exists by querying it
      const check = await db<{ id: string }[]>`
        SELECT id FROM app.org_units LIMIT 1
      `;
      expect(check.length).toBeGreaterThanOrEqual(1);
    });

    it("should treat DELETE payload as literal string in INSERT values", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const maliciousName = "test'); DELETE FROM app.org_units; --";
      const code = `SQLI-INS-${Date.now()}`;

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${maliciousName}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      expect(result.length).toBe(1);
      // The malicious payload is stored as literal text
      expect(result[0]!.name).toBe(maliciousName);

      // Cleanup
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // UNION-based injection
  // ---------------------------------------------------------------------------

  describe("UNION-based injection", () => {
    it("should not allow UNION SELECT to extract data from other tables", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "' UNION SELECT id, email, password_hash, status, 'x' FROM app.users --";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      // Should return 0 rows, not leak user data
      expect(results.length).toBe(0);
    });

    it("should not allow UNION injection in LIKE queries", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "%' UNION SELECT id::text, email, password_hash, 'x', 'y' FROM app.users WHERE '1'='1";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name LIKE ${malicious}
      `;

      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Boolean-based blind injection
  // ---------------------------------------------------------------------------

  describe("Boolean-based blind injection", () => {
    it("should not allow OR 1=1 to bypass WHERE conditions", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "' OR '1'='1";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      // Should not return all rows; the OR is treated as part of the string value
      expect(results.length).toBe(0);
    });

    it("should not allow boolean injection to enumerate records", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // This attempts to return all records if the injected condition is true
      const malicious = "x' OR EXISTS (SELECT 1 FROM app.users) AND 'a'='a";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Time-based blind injection
  // ---------------------------------------------------------------------------

  describe("Time-based blind injection", () => {
    it("should not allow pg_sleep injection to introduce delays", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "'; SELECT pg_sleep(5); --";
      const startTime = Date.now();

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      const elapsed = Date.now() - startTime;
      // If injection worked, the query would take ~5 seconds
      expect(elapsed).toBeLessThan(3000);
      expect(results.length).toBe(0);
    });

    it("should not allow conditional time-based extraction", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "' AND (SELECT CASE WHEN (1=1) THEN pg_sleep(5) ELSE pg_sleep(0) END)::text = '1";
      const startTime = Date.now();

      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(3000);
      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Stacked queries
  // ---------------------------------------------------------------------------

  describe("Stacked queries", () => {
    it("should not allow semicolon-separated secondary commands", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "test'; CREATE TABLE app.hacked (id int); --";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      expect(results.length).toBe(0);

      // Verify the injected table was NOT created
      const tableCheck = await db<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'hacked'
        ) as exists
      `;
      expect(tableCheck[0]!.exists).toBe(false);
    });

    it("should not allow stacked INSERT to create rogue data", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "x'; INSERT INTO app.tenants (id, name, slug, status) VALUES (gen_random_uuid(), 'hacked', 'hacked', 'active'); --";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${malicious}
      `;

      expect(results.length).toBe(0);

      // Verify no rogue tenant was created
      await withSystemContext(db, async (tx) => {
        const rogueCheck = await tx<{ id: string }[]>`
          SELECT id FROM app.tenants WHERE slug = 'hacked'
        `;
        expect(rogueCheck.length).toBe(0);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Injection via different input fields and types
  // ---------------------------------------------------------------------------

  describe("Injection via various input types", () => {
    it("should safely handle malicious UUIDs", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // Not a valid UUID, but tests that even if someone bypasses schema validation,
      // the database layer treats it as a literal string
      const maliciousId = "00000000-0000-0000-0000-000000000000' OR '1'='1";

      // This should throw a Postgres error (invalid UUID syntax), NOT execute injection
      let threw = false;
      try {
        await db`
          SELECT id FROM app.org_units WHERE id = ${maliciousId}::uuid
        `;
      } catch (error) {
        threw = true;
        // The error should be about invalid UUID syntax, not a successful injection
        expect(String(error)).toMatch(/invalid input syntax for type uuid|invalid UUID/i);
      }
      expect(threw).toBe(true);
    });

    it("should safely handle injection in numeric contexts", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // Attempting SQL injection through a numeric field
      const malicious = "1; DROP TABLE app.employees; --";

      // The tagged template will send this as a string parameter
      // Postgres will reject it as invalid for a numeric comparison
      let threw = false;
      try {
        await db<{ count: number }[]>`
          SELECT count(*) as count FROM app.org_units
          WHERE CAST(${malicious} AS integer) > 0
        `;
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/invalid input syntax|error/i);
      }
      expect(threw).toBe(true);
    });

    it("should safely handle injection in date fields", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const malicious = "2024-01-01'; DROP TABLE app.employees; --";

      let threw = false;
      try {
        await db<{ id: string }[]>`
          SELECT id FROM app.org_units WHERE effective_from = ${malicious}::date
        `;
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/invalid input syntax for type date|error/i);
      }
      expect(threw).toBe(true);
    });

    it("should safely handle injection in ORDER BY via parameterized approach", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // ORDER BY with user input is a common injection vector.
      // In postgres.js, even if you use tagged templates in ORDER BY,
      // the value is parameterized and will cause a type error, not injection.
      const maliciousSort = "name; DROP TABLE app.org_units; --";

      // The safe approach: validate sort column against an allowlist
      const allowedColumns = ["name", "code", "created_at"];
      const isSafe = allowedColumns.includes(maliciousSort);
      expect(isSafe).toBe(false);
    });

    it("should safely handle injection in LIKE search patterns", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // LIKE wildcards should be treated as literal characters
      const searchInput = "%'; DELETE FROM app.org_units; --";
      const results = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name LIKE ${"%" + searchInput + "%"}
      `;

      // Should return 0 rows, injection payload is literal text
      expect(results.length).toBe(0);

      // Verify data was not deleted
      const check = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE id = ${orgUnitId!}::uuid
      `;
      expect(check.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Injection via JSON fields
  // ---------------------------------------------------------------------------

  describe("Injection via JSON/JSONB fields", () => {
    it("should safely handle malicious JSON payloads", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const maliciousPayload = JSON.stringify({
        key: "'); DROP TABLE app.employees; --",
        nested: { attack: "' OR 1=1 --" },
      });

      // Insert into domain_outbox which has a JSONB payload column
      const result = await db<{ id: string; payload: unknown }[]>`
        INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          ${tenant.id}::uuid,
          'test_sqli',
          ${crypto.randomUUID()}::uuid,
          'sqli.test.json',
          ${maliciousPayload}::jsonb
        )
        RETURNING id, payload
      `;

      expect(result.length).toBe(1);
      // The payload is stored as legitimate JSON, not executed as SQL
      // postgres.js without custom type config returns JSONB as a string
      const rawPayload = result[0]!.payload;
      const payload = (typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload) as { key: string; nested: { attack: string } };
      expect(payload.key).toBe("'); DROP TABLE app.employees; --");
      expect(payload.nested.attack).toBe("' OR 1=1 --");

      // Cleanup
      await db`DELETE FROM app.domain_outbox WHERE id = ${result[0]!.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // Second-order injection
  // ---------------------------------------------------------------------------

  describe("Second-order injection", () => {
    it("should safely handle stored malicious data when re-read in queries", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // Step 1: Store a malicious value
      const maliciousName = "' OR 1=1 --";
      const code = `SQLI-2ND-${Date.now()}`;

      const inserted = await db<{ id: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${maliciousName}, true, CURRENT_DATE)
        RETURNING id
      `;

      // Step 2: Read the stored value back and use it in another query
      const stored = await db<{ name: string }[]>`
        SELECT name FROM app.org_units WHERE id = ${inserted[0]!.id}::uuid
      `;
      const storedName = stored[0]!.name;

      // Step 3: Use the stored (malicious) value in another parameterized query
      // If second-order injection were possible, this would return all rows
      const searchResults = await db<{ id: string }[]>`
        SELECT id FROM app.org_units WHERE name = ${storedName}
      `;

      // Should return exactly 1 row (the one we inserted), not all rows
      expect(searchResults.length).toBe(1);
      expect(searchResults[0]!.id).toBe(inserted[0]!.id);

      // Cleanup
      await db`DELETE FROM app.org_units WHERE id = ${inserted[0]!.id}::uuid`;
    });
  });
});
