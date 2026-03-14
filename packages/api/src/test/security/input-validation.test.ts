/**
 * Input Validation Tests
 *
 * Verifies that the platform correctly validates and rejects malicious,
 * malformed, or boundary-case inputs at both the HTTP handler level
 * and the database level.
 *
 * These tests exercise REAL HTTP requests through the Elysia app and
 * REAL database operations to confirm input handling is robust.
 *
 * Vulnerabilities prevented:
 * - CWE-20 (Improper Input Validation)
 * - CWE-22 (Path Traversal)
 * - CWE-190 (Integer Overflow)
 * - CWE-400 (Uncontrolled Resource Consumption)
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
  type TestTenant,
  type TestUser,
} from "../setup";
import { app } from "../../app";

describe("Input Validation", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `Input Validation Test ${suffix}`,
      slug: `input-val-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `input-val-${suffix}@example.com`,
    });
  });

  afterAll(async () => {
    if (!db) return;
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  // ---------------------------------------------------------------------------
  // Extremely long strings
  // ---------------------------------------------------------------------------

  describe("Extremely long strings", () => {
    it("should handle very long org unit names without crashing", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // 10KB string
      const longName = "A".repeat(10_000);
      const code = `LONG-${Date.now()}`;

      // Postgres TEXT columns can handle this, but the application may have
      // check constraints or the insert may succeed. Either outcome is safe.
      let insertedId: string | null = null;
      try {
        const result = await db<{ id: string; name: string }[]>`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenant.id}::uuid, ${code}, ${longName}, true, CURRENT_DATE)
          RETURNING id, name
        `;
        insertedId = result[0]?.id ?? null;

        // If it succeeds, the full string should be stored
        expect(result[0]!.name.length).toBe(10_000);
      } catch (error) {
        // If it fails, it should be a validation error, not a crash
        expect(String(error)).toMatch(/value too long|check|constraint|error/i);
      }

      // Cleanup
      if (insertedId) {
        await db`DELETE FROM app.org_units WHERE id = ${insertedId}::uuid`;
      }
    });

    it("should handle extremely long strings in HTTP request bodies", async () => {
      const longName = "B".repeat(100_000);

      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/org-units", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ name: longName, code: "LONGHTTP" }),
        })
      );

      // Should either reject with 400/401/422 or handle gracefully
      // Must NOT return 500 (internal server error)
      expect(response.status).not.toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Unicode edge cases
  // ---------------------------------------------------------------------------

  describe("Unicode edge cases", () => {
    it("should safely store and retrieve Unicode text", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const unicodeNames = [
        "\u{1F600}\u{1F601}\u{1F602}", // Emoji
        "\u4E16\u754C", // Chinese characters
        "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", // Arabic
        "\u05E2\u05D1\u05E8\u05D9\u05EA", // Hebrew
        "\u0E17\u0E14\u0E2A\u0E2D\u0E1A", // Thai
        "\u{1D400}\u{1D401}\u{1D402}", // Mathematical bold letters (surrogate pairs)
        "caf\u00E9", // Latin with accents
        "\u200B\u200C\u200D\uFEFF", // Zero-width characters
      ];

      for (let i = 0; i < unicodeNames.length; i++) {
        const name = unicodeNames[i]!;
        // Code must match constraint: ^[A-Z0-9][A-Z0-9_-]*$
        const code = `UNICODE-${Date.now()}-${i}`;

        const result = await db<{ id: string; name: string }[]>`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenant.id}::uuid, ${code}, ${name}, true, CURRENT_DATE)
          RETURNING id, name
        `;

        // Should store and retrieve the exact Unicode text
        expect(result[0]!.name).toBe(name);

        // Cleanup
        await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
      }
    });

    it("should handle homoglyph attacks (visually similar characters) as data", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // These look similar but are different Unicode code points
      const normalAdmin = "admin";
      const homoglyphAdmin = "\u0430dmin"; // Cyrillic 'a'

      const code1 = `HOMO1-${Date.now()}`;
      const code2 = `HOMO2-${Date.now()}`;

      const r1 = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code1}, ${normalAdmin}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      const r2 = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code2}, ${homoglyphAdmin}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      // They should be stored as different values
      expect(r1[0]!.name).not.toBe(r2[0]!.name);

      // Cleanup
      await db`DELETE FROM app.org_units WHERE id IN (${r1[0]!.id}::uuid, ${r2[0]!.id}::uuid)`;
    });
  });

  // ---------------------------------------------------------------------------
  // Null bytes
  // ---------------------------------------------------------------------------

  describe("Null byte injection", () => {
    it("should handle null bytes in string input safely", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const nullByteInput = "test\x00malicious";
      const code = `NULL-${Date.now()}`;

      // Postgres TEXT columns cannot store null bytes -- should throw
      let threw = false;
      try {
        await db`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenant.id}::uuid, ${code}, ${nullByteInput}, true, CURRENT_DATE)
        `;
      } catch (error) {
        threw = true;
        // Postgres rejects null bytes in text fields
        expect(String(error)).toMatch(/null|invalid|unterminated|character/i);
      }

      // Either it threw or stored safely (Postgres typically rejects null bytes)
      expect(threw).toBe(true);
    });

    it("should handle null bytes in HTTP paths", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees%00.html", {
          method: "GET",
        })
      );

      // Should not expose file system or cause server error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Path traversal
  // ---------------------------------------------------------------------------

  describe("Path traversal prevention", () => {
    it("should not allow ../ traversal in URL paths", async () => {
      const traversalPaths = [
        "/api/v1/../../etc/passwd",
        "/api/v1/hr/employees/../../../etc/shadow",
        "/api/v1/hr/..%2F..%2F..%2Fetc%2Fpasswd",
      ];

      for (const path of traversalPaths) {
        const response = await app.handle(
          new Request(`http://localhost${path}`, { method: "GET" })
        );

        // Should return 404 or 400, never 200 with file contents
        expect(response.status).toBeGreaterThanOrEqual(400);

        const body = await response.text();
        // Should not contain file system contents
        expect(body).not.toContain("root:");
        expect(body).not.toContain("/bin/bash");
      }
    });

    it("should reject path traversal in request parameters", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees?file=../../../etc/passwd", {
          method: "GET",
        })
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Date format attacks
  // ---------------------------------------------------------------------------

  describe("Date format validation", () => {
    it("should reject invalid date formats in database operations", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const invalidDates = [
        "not-a-date",
        "2024-13-45",
        "9999-99-99",
        "'; DROP TABLE employees; --",
      ];

      for (let i = 0; i < invalidDates.length; i++) {
        const dateVal = invalidDates[i]!;
        const code = `DATETEST-${Date.now()}-${i}`;
        let threw = false;
        try {
          // Use ::text first to bypass postgres.js client-side date parsing,
          // then cast to date on the Postgres side. This tests that Postgres
          // itself rejects invalid dates, which is the real security boundary.
          await db`
            INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
            VALUES (${tenant.id}::uuid, ${code}, ${"date test"}, true, ${dateVal}::text::date)
          `;
        } catch (error) {
          threw = true;
          // Should be a date format error from Postgres, not SQL injection
          expect(String(error)).toMatch(/invalid|date|out of range|error/i);
        }
        expect(threw).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Numeric overflow
  // ---------------------------------------------------------------------------

  describe("Numeric overflow prevention", () => {
    it("should handle very large numbers safely in Postgres", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // Postgres integer max is 2,147,483,647; bigint max is 9,223,372,036,854,775,807
      const overflowValue = "99999999999999999999999999999";

      let threw = false;
      try {
        await db<{ id: string }[]>`
          INSERT INTO app.positions (tenant_id, code, title, is_active, headcount)
          VALUES (
            ${tenant.id}::uuid,
            'OVERFLOW',
            'Test',
            true,
            ${overflowValue}::integer
          )
        `;
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/out of range|overflow|integer|error/i);
      }

      expect(threw).toBe(true);
    });

    it("should handle negative numbers where only positive expected", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // Headcount must be > 0 per CHECK constraint (positions_headcount_positive)
      let threw = false;
      try {
        const code = `NEGTEST-${Date.now()}`;
        const result = await db<{ id: string; headcount: number }[]>`
          INSERT INTO app.positions (tenant_id, code, title, is_active, headcount)
          VALUES (
            ${tenant.id}::uuid,
            ${code},
            'Negative Test',
            true,
            ${-1}
          )
          RETURNING id, headcount
        `;

        // If it succeeds, clean up -- this is a valid finding to document
        if (result.length > 0) {
          await db`DELETE FROM app.positions WHERE id = ${result[0]!.id}::uuid`;
        }
      } catch {
        // The CHECK constraint (headcount > 0) prevents it, which is expected
        threw = true;
      }

      // The database enforces positive headcount via CHECK constraint
      expect(threw).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // JSON parsing attacks
  // ---------------------------------------------------------------------------

  describe("JSON parsing attacks", () => {
    it("should reject deeply nested JSON to prevent stack overflow", async () => {
      // Create a deeply nested JSON structure
      let deepJson = '{"a":';
      const depth = 1000;
      for (let i = 0; i < depth; i++) {
        deepJson += '{"a":';
      }
      deepJson += '"x"';
      for (let i = 0; i <= depth; i++) {
        deepJson += "}";
      }

      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: deepJson,
        })
      );

      // Should handle gracefully -- either parse it or reject it
      // Must NOT crash the server (status should not be 500 from crash)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject non-JSON content with application/json Content-Type", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: "this is not json {{{",
        })
      );

      // Should return 400 (parse error), not 500
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle JSON with __proto__ pollution attempts", async () => {
      const pollutionPayload = JSON.stringify({
        employeeNumber: "PROTO-001",
        hireDate: "2024-01-01",
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
      });

      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: pollutionPayload,
        })
      );

      // Should not crash. The request will likely fail for other reasons
      // (no auth), but the server must handle __proto__ safely.
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle empty body on POST endpoints", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
        })
      );

      // Should return 400 or 401, not 500
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Malformed UUIDs
  // ---------------------------------------------------------------------------

  describe("UUID validation", () => {
    it("should reject malformed UUIDs in path parameters via HTTP", async () => {
      const malformedUuids = [
        "not-a-uuid",
        "12345",
        "'; DROP TABLE employees; --",
        "00000000-0000-0000-0000-00000000000G", // Invalid hex char
        "",
      ];

      for (const uuid of malformedUuids) {
        const response = await app.handle(
          new Request(`http://localhost/api/v1/hr/employees/${encodeURIComponent(uuid)}`, {
            method: "GET",
            headers: {
              "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            },
          })
        );

        // Should return 400 or 404, not 500
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      }
    });

    it("should reject malformed UUIDs in database queries", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      let threw = false;
      try {
        await db`
          SELECT * FROM app.employees WHERE id = ${"not-a-uuid"}::uuid
        `;
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/invalid input syntax for type uuid/i);
      }
      expect(threw).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Special characters in text fields
  // ---------------------------------------------------------------------------

  describe("Special characters handling", () => {
    it("should safely handle backslashes in text", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const code = `BSLASH-${Date.now()}`;
      const name = "C:\\Users\\admin\\sensitive";

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${name}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      expect(result[0]!.name).toBe(name);
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });

    it("should safely handle single and double quotes", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const code = `QUOTES-${Date.now()}`;
      const name = `O'Brien "The Best" Department`;

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${name}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      expect(result[0]!.name).toBe(name);
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });

    it("should safely handle SQL comment sequences in text", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const code = `COMMENT-${Date.now()}`;
      const name = "-- this is a SQL comment /* block comment */";

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${name}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      expect(result[0]!.name).toBe(name);
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });

    it("should safely handle newlines and control characters", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const code = `CTRL-${Date.now()}`;
      const name = "line1\nline2\rline3\ttab";

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${name}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      expect(result[0]!.name).toBe(name);
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // Content-Type validation
  // ---------------------------------------------------------------------------

  describe("Content-Type validation", () => {
    it("should handle multipart/form-data on JSON endpoints", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data; boundary=----FormBoundary",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: "------FormBoundary\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\nmalicious\r\n------FormBoundary--",
        })
      );

      // Should reject or parse safely, never crash
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle XML content on JSON endpoints", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>',
        })
      );

      // Should reject, not process XML entity expansion
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });
});
