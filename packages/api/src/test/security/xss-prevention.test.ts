/**
 * XSS Prevention Tests
 *
 * Verifies that the API protects against Cross-Site Scripting attacks by
 * making REAL HTTP requests to the Elysia app via `app.handle()`.
 *
 * The primary XSS defenses tested are:
 * 1. Security headers (X-Content-Type-Options: nosniff, CSP, X-XSS-Protection)
 * 2. JSON Content-Type responses (browsers will not render JSON as HTML)
 * 3. Proper error response format (no HTML reflection of user input)
 * 4. Cross-Origin policies preventing embedding attacks
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

    it("should set Content-Security-Policy with frame-ancestors", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("frame-ancestors");
    });

    it("should set Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
      expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    });

    it("should set Referrer-Policy and Permissions-Policy", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

      const permissionsPolicy = response.headers.get("Permissions-Policy");
      expect(permissionsPolicy).toBeTruthy();
      expect(permissionsPolicy).toContain("camera=()");
      expect(permissionsPolicy).toContain("microphone=()");
    });
  });

  // ---------------------------------------------------------------------------
  // XSS payloads in query parameters
  // ---------------------------------------------------------------------------

  describe("XSS payloads in query parameters", () => {
    it("should not reflect <script> tags in error responses", async () => {
      const xssPayload = "<script>alert('XSS')</script>";
      const response = await app.handle(
        new Request(
          `http://localhost/api/v1/hr/employees?search=${encodeURIComponent(xssPayload)}`,
          {
            method: "GET",
            headers: {
              "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            },
          }
        )
      );

      expect(response.status).toBeLessThan(500);

      // Response must be JSON, not HTML
      const contentType = response.headers.get("Content-Type");
      if (contentType) {
        expect(contentType).not.toContain("text/html");
      }

      // nosniff prevents browsers from interpreting JSON as HTML
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("should not reflect event handler XSS payloads", async () => {
      const xssPayload = '<img src=x onerror=alert(document.cookie)>';
      const response = await app.handle(
        new Request(
          `http://localhost/api/v1/hr/org-units?search=${encodeURIComponent(xssPayload)}`,
          {
            method: "GET",
            headers: {
              "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            },
          }
        )
      );

      expect(response.status).toBeLessThan(500);

      // Even if the payload appears in JSON, the Content-Type prevents execution
      const contentType = response.headers.get("Content-Type");
      if (contentType) {
        expect(contentType).not.toContain("text/html");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // XSS payloads in URL path
  // ---------------------------------------------------------------------------

  describe("XSS payloads in URL path", () => {
    it("should return JSON 404 for XSS payload in path, not rendered HTML", async () => {
      const xssPayload = "<script>alert(1)</script>";
      const response = await app.handle(
        new Request(
          `http://localhost/api/v1/${encodeURIComponent(xssPayload)}`,
          { method: "GET" }
        )
      );

      expect(response.status).toBe(404);

      // Verify response is JSON, not HTML
      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");

      // Verify nosniff is present
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

      // Verify the response follows the standard error format
      const body = await response.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    });

    it("should return JSON 404 for SVG XSS payload in path", async () => {
      const svgPayload = '<svg onload=alert(document.domain)>';
      const response = await app.handle(
        new Request(
          `http://localhost/api/v1/${encodeURIComponent(svgPayload)}`,
          { method: "GET" }
        )
      );

      expect(response.status).toBe(404);
      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
    });
  });

  // ---------------------------------------------------------------------------
  // XSS payloads in request bodies
  // ---------------------------------------------------------------------------

  describe("XSS payloads in request body", () => {
    it("should handle script tags in POST body without 500 error", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/org-units", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            code: "XSS-TEST",
            name: "<script>alert('xss')</script>",
            isActive: true,
            effectiveFrom: "2024-01-01",
          }),
        })
      );

      // Should not cause a server error; will be 4xx (auth) or validation
      expect(response.status).toBeLessThan(500);

      // Response must be JSON
      const contentType = response.headers.get("Content-Type");
      if (contentType) {
        expect(contentType).toContain("application/json");
      }
    });

    it("should handle multiple XSS vectors in body without 500 error", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            employeeNumber: "EMP-XSS-001",
            hireDate: "2024-01-01",
            firstName: "<img src=x onerror=alert(1)>",
            lastName: "javascript:alert('xss')",
          }),
        })
      );

      expect(response.status).toBeLessThan(500);

      const contentType = response.headers.get("Content-Type");
      if (contentType) {
        expect(contentType).toContain("application/json");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Content-Type enforcement across API routes
  // ---------------------------------------------------------------------------

  describe("Content-Type enforcement", () => {
    it("should serve JSON, not HTML, for all /api/ routes", async () => {
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

        const contentType = response.headers.get("Content-Type");
        if (contentType) {
          // Must never be text/html for API routes
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

    it("should return application/json Content-Type for health endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
    });
  });
});
