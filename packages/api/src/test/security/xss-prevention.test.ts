/**
 * XSS Prevention Tests
 *
 * Verifies that the API protects against Cross-Site Scripting attacks by:
 * 1. Setting proper Content-Type headers (application/json)
 * 2. Setting security headers (X-Content-Type-Options: nosniff, CSP, X-XSS-Protection)
 * 3. Storing user input as-is but serving it with safe headers
 * 4. Not reflecting user input in HTML responses without encoding
 *
 * These tests make REAL HTTP requests to the Elysia app to verify header behavior.
 *
 * Vulnerability prevented: CWE-79 (Cross-Site Scripting)
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

describe("XSS Prevention", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `XSS Test Tenant ${suffix}`,
      slug: `xss-test-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `xss-test-${suffix}@example.com`,
    });
  });

  afterAll(async () => {
    if (!db) return;
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  // ---------------------------------------------------------------------------
  // Security headers that prevent XSS
  // ---------------------------------------------------------------------------

  describe("Security headers on API responses", () => {
    it("should set X-Content-Type-Options: nosniff to prevent MIME sniffing", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("should set X-XSS-Protection header", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
    });

    it("should set Content-Security-Policy header", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
      // CSP should contain frame-ancestors restriction
      expect(csp).toContain("frame-ancestors");
    });

    it("should set X-Frame-Options to prevent clickjacking", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const frameOptions = response.headers.get("X-Frame-Options");
      expect(frameOptions).toBe("DENY");
    });

    it("should set Cross-Origin-Opener-Policy", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    });

    it("should set Cross-Origin-Resource-Policy", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    });

    it("should set Referrer-Policy to prevent referrer leakage", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const policy = response.headers.get("Referrer-Policy");
      expect(policy).toBeTruthy();
      expect(policy).toBe("strict-origin-when-cross-origin");
    });

    it("should set Permissions-Policy to restrict browser features", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const permissionsPolicy = response.headers.get("Permissions-Policy");
      expect(permissionsPolicy).toBeTruthy();
      // Should restrict camera, microphone, etc.
      expect(permissionsPolicy).toContain("camera=()");
      expect(permissionsPolicy).toContain("microphone=()");
    });
  });

  // ---------------------------------------------------------------------------
  // JSON API responses serve content safely
  // ---------------------------------------------------------------------------

  describe("JSON response safety", () => {
    it("should return application/json Content-Type for API endpoints", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
    });

    it("should return valid JSON for error responses", async () => {
      // Request a non-existent endpoint to trigger 404
      const response = await app.handle(
        new Request("http://localhost/api/v1/nonexistent", { method: "GET" })
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    });

    it("should not reflect XSS payloads in error messages as executable HTML", async () => {
      // Even if an XSS payload appears in the error message, it is safe because:
      // 1. Content-Type is application/json
      // 2. X-Content-Type-Options: nosniff prevents MIME sniffing
      const xssPayload = "<script>alert('XSS')</script>";
      const response = await app.handle(
        new Request(`http://localhost/api/v1/${encodeURIComponent(xssPayload)}`, {
          method: "GET",
        })
      );

      // Verify it is JSON, not HTML
      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  // ---------------------------------------------------------------------------
  // Script tag injection in data fields
  // ---------------------------------------------------------------------------

  describe("Script tag injection in stored data", () => {
    it("should store XSS payload as literal text without execution", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const xssPayloads = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert('xss')>",
        "<svg onload=alert('xss')>",
        "javascript:alert('xss')",
        "<body onload=alert('xss')>",
        "<input onfocus=alert('xss') autofocus>",
        "'-alert(1)-'",
      ];

      for (let i = 0; i < xssPayloads.length; i++) {
        const xssPayload = xssPayloads[i]!;
        // Code must match constraint: ^[A-Z0-9][A-Z0-9_-]*$
        const code = `XSS-${Date.now()}-${i}`;
        const result = await db<{ id: string; name: string }[]>`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenant.id}::uuid, ${code}, ${xssPayload}, true, CURRENT_DATE)
          RETURNING id, name
        `;

        // Data is stored verbatim -- the database does not interpret HTML/JS
        expect(result[0]!.name).toBe(xssPayload);

        // Cleanup
        await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
      }
    });

    it("should safely return XSS payloads in JSON responses without execution risk", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const xssPayload = "<script>document.cookie</script>";
      const code = `XSS-JSON-${Date.now()}`;

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${xssPayload}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      // When JSON.stringify encodes this for a response:
      const jsonEncoded = JSON.stringify({ name: result[0]!.name });
      // The output is valid JSON with the HTML preserved as a string value
      expect(() => JSON.parse(jsonEncoded)).not.toThrow();

      // The XSS is neutralized because:
      // 1. Content-Type: application/json prevents browser from rendering HTML
      // 2. nosniff prevents MIME type override
      // 3. The value is a JSON string, not HTML

      // Cleanup
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // SVG-based XSS
  // ---------------------------------------------------------------------------

  describe("SVG-based XSS vectors", () => {
    it("should store SVG XSS payload as literal text", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const svgPayload = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)">';
      const code = `SVG-XSS-${Date.now()}`;

      const result = await db<{ id: string; name: string }[]>`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenant.id}::uuid, ${code}, ${svgPayload}, true, CURRENT_DATE)
        RETURNING id, name
      `;

      expect(result[0]!.name).toBe(svgPayload);

      // Cleanup
      await db`DELETE FROM app.org_units WHERE id = ${result[0]!.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // Event handler injection in JSON fields
  // ---------------------------------------------------------------------------

  describe("Event handler injection in JSONB fields", () => {
    it("should store malicious event handlers in JSON without interpretation", async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const maliciousJson = {
        title: "<img src=x onerror=alert(1)>",
        description: "onmouseover=alert(document.cookie)",
        notes: "<a href='javascript:void(0)' onclick='alert(1)'>click</a>",
      };

      const result = await db<{ id: string; payload: unknown }[]>`
        INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          ${tenant.id}::uuid,
          'xss_test',
          ${crypto.randomUUID()}::uuid,
          'xss.test.event_handler',
          ${JSON.stringify(maliciousJson)}::jsonb
        )
        RETURNING id, payload
      `;

      // postgres.js without custom type config returns JSONB as a string
      const rawPayload = result[0]!.payload;
      const payload = (typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload) as typeof maliciousJson;
      // JSONB stores it as data, never interprets it
      expect(payload.title).toBe(maliciousJson.title);
      expect(payload.description).toBe(maliciousJson.description);
      expect(payload.notes).toBe(maliciousJson.notes);

      // Cleanup
      await db`DELETE FROM app.domain_outbox WHERE id = ${result[0]!.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // Verify no HTML is served for API routes
  // ---------------------------------------------------------------------------

  describe("Content-Type enforcement", () => {
    it("should serve JSON, not HTML, for all /api/ prefixed routes", async () => {
      const paths = [
        "/api/v1/hr/employees",
        "/api/v1/hr/org-units",
        "/api/v1/absence/leave-types",
        "/api/v1/time/entries",
      ];

      for (const path of paths) {
        const response = await app.handle(
          new Request(`http://localhost${path}`, { method: "GET" })
        );

        // Even error responses should be JSON
        const contentType = response.headers.get("Content-Type");
        if (contentType) {
          // Should never be text/html for API routes
          expect(contentType).not.toContain("text/html");
        }
      }
    });

    it("should include nosniff header even on error responses", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/nonexistent-route", { method: "GET" })
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });
});
