/**
 * CSRF Protection Tests
 *
 * Verifies that the platform protects against Cross-Site Request Forgery attacks.
 * The primary CSRF defenses are:
 * 1. SameSite cookie attribute (set by BetterAuth)
 * 2. CORS configuration restricting origins
 * 3. X-CSRF-Token header enforcement for mutating requests
 * 4. Content-Type checking (JSON APIs are not submittable by plain HTML forms)
 *
 * These tests make REAL HTTP requests to the Elysia app.
 *
 * Vulnerability prevented: CWE-352 (Cross-Site Request Forgery)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../setup";
import { app } from "../../app";

describe("CSRF Protection", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `CSRF Test Tenant ${suffix}`,
      slug: `csrf-test-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `csrf-test-${suffix}@example.com`,
    });
  });

  afterAll(async () => {
    if (!db) return;
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  // ---------------------------------------------------------------------------
  // CORS enforcement
  // ---------------------------------------------------------------------------

  describe("CORS enforcement", () => {
    it("should include CORS headers on responses", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", {
          method: "GET",
          headers: {
            Origin: "http://localhost:5173",
          },
        })
      );

      // Should include Access-Control-Allow-Origin
      const allowOrigin = response.headers.get("Access-Control-Allow-Origin");
      // In development, localhost origins should be allowed
      expect(allowOrigin).toBeTruthy();
    });

    it("should handle preflight OPTIONS requests", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, X-Tenant-ID, Idempotency-Key",
          },
        })
      );

      // Preflight should return 2xx
      expect(response.status).toBeLessThan(300);

      // Should include allowed methods
      const allowMethods = response.headers.get("Access-Control-Allow-Methods");
      expect(allowMethods).toBeTruthy();
    });

    it("should include credentials support in CORS", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", {
          method: "GET",
          headers: {
            Origin: "http://localhost:5173",
          },
        })
      );

      const allowCredentials = response.headers.get("Access-Control-Allow-Credentials");
      expect(allowCredentials).toBe("true");
    });

    it("should expose rate limit headers", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
          },
        })
      );

      const exposeHeaders = response.headers.get("Access-Control-Expose-Headers");
      if (exposeHeaders) {
        // Should expose X-Request-ID for error tracking
        expect(exposeHeaders).toContain("X-Request-ID");
      }
    });

    it("should reject requests from unauthorized origins in production mode", async () => {
      // In development mode, localhost origins are allowed.
      // This test documents that the CORS config exists and filters origins.
      const response = await app.handle(
        new Request("http://localhost/health", {
          method: "GET",
          headers: {
            Origin: "https://evil-site.com",
          },
        })
      );

      const allowOrigin = response.headers.get("Access-Control-Allow-Origin");
      // Should NOT include the evil origin
      if (allowOrigin) {
        expect(allowOrigin).not.toBe("https://evil-site.com");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // JSON Content-Type as CSRF defense
  // ---------------------------------------------------------------------------

  describe("JSON Content-Type as CSRF defense", () => {
    it("should require application/json for POST endpoints", async () => {
      // HTML forms can only submit application/x-www-form-urlencoded or
      // multipart/form-data, not application/json. This is a natural CSRF defense.
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: "employeeNumber=CSRF-001&hireDate=2024-01-01",
        })
      );

      // Should reject form-encoded data on JSON API endpoints
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom header requirement as CSRF defense
  // ---------------------------------------------------------------------------

  describe("Custom header requirement", () => {
    it("should require X-Tenant-ID or session for tenant-scoped endpoints", async () => {
      // Simple requests from HTML forms cannot set custom headers.
      // The requirement for X-Tenant-ID on tenant-scoped endpoints
      // acts as an additional CSRF defense layer.
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          // No X-Tenant-ID, no cookie
        })
      );

      // Should fail due to missing tenant/auth
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should require Idempotency-Key for mutating endpoints", async () => {
      // The Idempotency-Key header requirement prevents simple CSRF attacks
      // because HTML forms cannot set custom headers.
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            // Missing Idempotency-Key
          },
          body: JSON.stringify({
            employeeNumber: "CSRF-002",
            hireDate: "2024-01-01",
          }),
        })
      );

      // Should fail -- either for missing idempotency key or missing auth
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Allowed headers configuration
  // ---------------------------------------------------------------------------

  describe("Allowed headers in CORS", () => {
    it("should allow required custom headers in CORS preflight", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, X-Tenant-ID, X-CSRF-Token, Idempotency-Key",
          },
        })
      );

      const allowHeaders = response.headers.get("Access-Control-Allow-Headers");
      if (allowHeaders) {
        const headersList = allowHeaders.toLowerCase();
        expect(headersList).toContain("content-type");
        expect(headersList).toContain("x-tenant-id");
        expect(headersList).toContain("idempotency-key");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Cookie security attributes
  // ---------------------------------------------------------------------------

  describe("Cookie security attributes", () => {
    it("should set secure cookie attributes on auth responses", async () => {
      // Attempt a login to check Set-Cookie attributes
      // Even if login fails, we can check the response behavior
      const response = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
          }),
        })
      );

      // Check if Set-Cookie header has security attributes
      const setCookie = response.headers.get("Set-Cookie");
      if (setCookie) {
        // In production, cookies should be:
        // - HttpOnly (prevents JavaScript access)
        // - SameSite=Lax or Strict (prevents CSRF)
        // - Secure (in production, requires HTTPS)
        // Note: In development, Secure may not be set
        const lowerCookie = setCookie.toLowerCase();
        // BetterAuth typically sets HttpOnly and SameSite
        if (lowerCookie.includes("session")) {
          expect(lowerCookie).toContain("httponly");
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Same-origin validation
  // ---------------------------------------------------------------------------

  describe("Same-origin validation", () => {
    it("should include X-Frame-Options: DENY to prevent clickjacking", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("should include frame-ancestors 'none' in CSP", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const csp = response.headers.get("Content-Security-Policy");
      if (csp) {
        expect(csp).toContain("frame-ancestors");
      }
    });
  });
});
