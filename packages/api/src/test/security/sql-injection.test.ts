/**
 * SQL Injection Prevention Tests
 *
 * Verifies that the API safely handles SQL injection payloads sent via HTTP
 * requests -- in query parameters, path parameters, and request bodies.
 *
 * The primary defense is postgres.js tagged template literals which
 * parameterize all user-supplied inputs. These tests confirm that sending
 * malicious SQL through the public API surface never causes 500 errors,
 * data leaks, or schema damage.
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
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../setup";
import { app } from "../../app";

describe("SQL Injection Prevention", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

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
  });

  afterAll(async () => {
    if (!db) return;
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  // ---------------------------------------------------------------------------
  // Helper: make a request to the app
  // ---------------------------------------------------------------------------

  function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
    return app.handle(
      new Request(`http://localhost${path}`, {
        ...options,
        headers: {
          "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
          ...options.headers,
        },
      })
    );
  }

  // ---------------------------------------------------------------------------
  // SQL injection in query parameters (search fields)
  // ---------------------------------------------------------------------------

  describe("Injection via query parameters", () => {
    it("should safely handle DROP TABLE payload in search query param", async () => {
      if (!tenant) return;

      const payload = "'; DROP TABLE app.employees; --";
      const response = await apiRequest(
        `/api/v1/hr/employees?search=${encodeURIComponent(payload)}`
      );

      // Should return 4xx (auth failure) or 200 empty list, never a 500
      expect(response.status).toBeLessThan(500);

      // Verify the employees table still exists
      const check = await db!<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'employees'
        ) as exists
      `;
      expect(check[0]!.exists).toBe(true);
    });

    it("should safely handle UNION SELECT payload in search query param", async () => {
      if (!tenant) return;

      const payload = "' UNION SELECT id, email, password_hash FROM app.users --";
      const response = await apiRequest(
        `/api/v1/hr/org-units?search=${encodeURIComponent(payload)}`
      );

      expect(response.status).toBeLessThan(500);

      // If the response is JSON, verify it does not contain password hashes
      if (response.headers.get("Content-Type")?.includes("application/json")) {
        const text = await response.text();
        expect(text).not.toContain("password_hash");
      }
    });

    it("should safely handle OR 1=1 boolean injection in search param", async () => {
      if (!tenant) return;

      const payload = "' OR '1'='1";
      const response = await apiRequest(
        `/api/v1/hr/employees?search=${encodeURIComponent(payload)}`
      );

      // Must not return 500
      expect(response.status).toBeLessThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // SQL injection in path parameters
  // ---------------------------------------------------------------------------

  describe("Injection via path parameters", () => {
    it("should safely handle SQL injection in UUID path parameter", async () => {
      if (!tenant) return;

      // Inject SQL where a UUID is expected
      const payload = "00000000-0000-0000-0000-000000000000' OR '1'='1";
      const response = await apiRequest(
        `/api/v1/hr/employees/${encodeURIComponent(payload)}`
      );

      // Should return 400 (validation) or 404, never 500
      expect(response.status).toBeLessThan(500);
    });

    it("should safely handle DROP TABLE in path parameter", async () => {
      if (!tenant) return;

      const payload = "'; DROP TABLE app.employees; --";
      const response = await apiRequest(
        `/api/v1/hr/org-units/${encodeURIComponent(payload)}`
      );

      expect(response.status).toBeLessThan(500);

      // Verify no damage was done
      const check = await db!<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'employees'
        ) as exists
      `;
      expect(check[0]!.exists).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // SQL injection in request bodies
  // ---------------------------------------------------------------------------

  describe("Injection via request body fields", () => {
    it("should safely handle SQL injection in POST body fields", async () => {
      if (!tenant) return;

      const response = await apiRequest("/api/v1/hr/org-units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          code: "'; DROP TABLE app.employees; --",
          name: "test'); DELETE FROM app.org_units; --",
          isActive: true,
          effectiveFrom: "2024-01-01",
        }),
      });

      // Should return a 4xx (auth/validation) not 500
      expect(response.status).toBeLessThan(500);

      // Verify database integrity
      const check = await db!<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'employees'
        ) as exists
      `;
      expect(check[0]!.exists).toBe(true);
    });

    it("should safely handle stacked query injection in body", async () => {
      if (!tenant) return;

      const response = await apiRequest("/api/v1/hr/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          employeeNumber: "EMP-001'; CREATE TABLE app.hacked (id int); --",
          hireDate: "2024-01-01",
          firstName: "'; DROP TABLE app.tenants; --",
          lastName: "Test",
        }),
      });

      expect(response.status).toBeLessThan(500);

      // Verify the injected table was NOT created
      const tableCheck = await db!<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'hacked'
        ) as exists
      `;
      expect(tableCheck[0]!.exists).toBe(false);
    });

    it("should safely handle time-based blind injection in body", async () => {
      if (!tenant) return;

      const startTime = Date.now();
      const response = await apiRequest("/api/v1/hr/org-units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          code: "TEST",
          name: "'; SELECT pg_sleep(10); --",
          isActive: true,
          effectiveFrom: "2024-01-01",
        }),
      });

      const elapsed = Date.now() - startTime;

      expect(response.status).toBeLessThan(500);
      // If injection worked, it would take ~10 seconds
      expect(elapsed).toBeLessThan(5000);
    });
  });

  // ---------------------------------------------------------------------------
  // Verify error responses are proper JSON
  // ---------------------------------------------------------------------------

  describe("Error response format", () => {
    it("should return JSON error for injection attempts, not stack traces", async () => {
      if (!tenant) return;

      const response = await apiRequest(
        `/api/v1/hr/employees?search=${encodeURIComponent("' OR 1=1 --")}`
      );

      expect(response.status).toBeLessThan(500);

      const contentType = response.headers.get("Content-Type");
      if (contentType) {
        // API should return JSON, not HTML error pages
        expect(contentType).toContain("application/json");
      }

      // If it is an error response, verify it follows the standard format
      if (response.status >= 400) {
        const body = await response.json();
        expect(body).toHaveProperty("error");
        expect(body.error).toHaveProperty("code");
        expect(body.error).toHaveProperty("message");
        // Must NOT leak internal SQL details
        expect(body.error.message).not.toMatch(/syntax error|pg_catalog|information_schema/i);
      }
    });
  });
});
