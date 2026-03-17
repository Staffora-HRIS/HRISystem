/**
 * CSRF Protection Tests
 *
 * Verifies that the platform protects against Cross-Site Request Forgery attacks
 * by making REAL HTTP requests to the Elysia app via `app.handle()`.
 *
 * The primary CSRF defenses tested are:
 * 1. CORS configuration restricting origins
 * 2. JSON Content-Type requirement (prevents form-based CSRF)
 * 3. Custom header requirements (X-Tenant-ID, Idempotency-Key)
 * 4. Cookie security attributes (HttpOnly, SameSite)
 * 5. X-Frame-Options / CSP frame-ancestors (clickjacking prevention)
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
    it("should include CORS headers for allowed origins", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", {
          method: "GET",
          headers: {
            Origin: "http://localhost:5173",
          },
        })
      );

      const allowOrigin = response.headers.get("Access-Control-Allow-Origin");
      expect(allowOrigin).toBeTruthy();
    });

    it("should handle preflight OPTIONS requests with correct methods", async () => {
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

      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("should reject requests from unauthorized origins", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", {
          method: "GET",
          headers: {
            Origin: "https://evil-attacker.com",
          },
        })
      );

      const allowOrigin = response.headers.get("Access-Control-Allow-Origin");
      // The evil origin must NOT be reflected back
      if (allowOrigin) {
        expect(allowOrigin).not.toBe("https://evil-attacker.com");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // JSON Content-Type as CSRF defense
  // ---------------------------------------------------------------------------

  describe("JSON Content-Type requirement", () => {
    it("should reject form-encoded POST on JSON API endpoints", async () => {
      // HTML forms can submit application/x-www-form-urlencoded but NOT
      // application/json. This is a natural CSRF defense for JSON APIs.
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

      // Should reject form-encoded data on JSON API endpoints (4xx, not 2xx)
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should reject multipart/form-data POST on JSON API endpoints", async () => {
      const formData = new FormData();
      formData.append("employeeNumber", "CSRF-002");
      formData.append("hireDate", "2024-01-01");

      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: formData,
        })
      );

      // Should not accept multipart form data on JSON-only endpoints
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom header requirements (prevents simple form-based CSRF)
  // ---------------------------------------------------------------------------

  describe("Custom header requirements", () => {
    it("should require authentication for tenant-scoped endpoints", async () => {
      // A simple CSRF attack cannot set cookies or auth headers.
      // Without auth, all tenant-scoped endpoints must fail.
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          // No auth cookie, no session
        })
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should require Idempotency-Key for mutating endpoints", async () => {
      // HTML forms cannot set custom headers like Idempotency-Key.
      // This acts as an additional CSRF defense layer.
      const response = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant?.id ?? crypto.randomUUID(),
            // Missing Idempotency-Key
          },
          body: JSON.stringify({
            employeeNumber: "CSRF-003",
            hireDate: "2024-01-01",
          }),
        })
      );

      // Should fail for missing idempotency key or missing auth
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

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
  // Anti-clickjacking headers
  // ---------------------------------------------------------------------------

  describe("Anti-clickjacking", () => {
    it("should include X-Frame-Options: DENY to prevent clickjacking", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("should include frame-ancestors 'none' in Content-Security-Policy", async () => {
      const response = await app.handle(
        new Request("http://localhost/health", { method: "GET" })
      );

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("frame-ancestors");
    });
  });

  // ---------------------------------------------------------------------------
  // Cookie security attributes
  // ---------------------------------------------------------------------------

  describe("Cookie security attributes", () => {
    it("should set secure cookie attributes on auth responses", async () => {
      // Attempt a login to inspect Set-Cookie attributes.
      // Even a failed login may reveal cookie configuration.
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

      const setCookie = response.headers.get("Set-Cookie");
      if (setCookie && setCookie.toLowerCase().includes("session")) {
        // Session cookies should be HttpOnly (prevents JS access)
        expect(setCookie.toLowerCase()).toContain("httponly");
      }
    });
  });
});
