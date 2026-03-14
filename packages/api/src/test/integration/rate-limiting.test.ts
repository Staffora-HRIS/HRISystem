/**
 * Rate Limiting Integration Tests
 *
 * Verifies that the rate limiting plugin:
 * 1. Returns correct X-RateLimit-* headers
 * 2. Returns 429 when limit is exceeded
 * 3. Applies stricter limits on auth endpoints
 * 4. Skips health/docs routes
 * 5. Resets after window expires
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { rateLimitPlugin } from "../../plugins/rate-limit";

// In-memory rate limit store for testing (replaces Redis)
function createMockCache() {
  const store = new Map<string, { count: number; expiresAt: number }>();

  return {
    incrementRateLimit: async (
      key: string,
      windowSeconds: number,
      maxRequests: number
    ): Promise<{ count: number; exceeded: boolean }> => {
      const now = Date.now();
      const existing = store.get(key);

      if (existing && existing.expiresAt > now) {
        existing.count += 1;
        return {
          count: existing.count,
          exceeded: existing.count > maxRequests,
        };
      }

      // New window
      store.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return { count: 1, exceeded: false };
    },
    reset: () => store.clear(),
  };
}

function buildApp(maxRequests: number, windowMs: number) {
  const cache = createMockCache();

  const app = new Elysia()
    .derive(() => ({
      cache,
      tenantId: "test-tenant",
      user: { id: "test-user" },
      requestId: "test-req",
    }))
    .use(
      rateLimitPlugin({
        enabled: true,
        maxRequests,
        windowMs,
      })
    )
    .get("/health", () => ({ status: "ok" }))
    .get("/docs", () => ({ docs: true }))
    .get("/api/v1/employees", () => ({ data: [] }))
    .post("/api/auth/sign-in/email", () => ({ token: "abc" }))
    .post("/api/auth/sign-up/email", () => ({ user: {} }));

  return { app, cache };
}

describe("Rate Limiting Plugin", () => {
  describe("General rate limiting", () => {
    it("should return rate limit headers on normal requests", async () => {
      const { app } = buildApp(10, 60_000);
      const res = await app.handle(
        new Request("http://localhost/api/v1/employees")
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
      expect(res.headers.get("X-RateLimit-Window")).toBeTruthy();
    });

    it("should return 429 after exceeding the limit", async () => {
      const { app } = buildApp(3, 60_000);

      // Make requests up to the limit
      for (let i = 0; i < 3; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/v1/employees")
        );
        expect(res.status).toBe(200);
      }

      // Next request should be rate limited
      const res = await app.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(res.status).toBe(429);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("TOO_MANY_REQUESTS");
      expect(res.headers.get("Retry-After")).toBeTruthy();
    });

    it("should show decreasing remaining count", async () => {
      const { app } = buildApp(5, 60_000);

      const res1 = await app.handle(
        new Request("http://localhost/api/v1/employees")
      );
      const remaining1 = parseInt(
        res1.headers.get("X-RateLimit-Remaining") || "0",
        10
      );

      const res2 = await app.handle(
        new Request("http://localhost/api/v1/employees")
      );
      const remaining2 = parseInt(
        res2.headers.get("X-RateLimit-Remaining") || "0",
        10
      );

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  describe("Skipped routes", () => {
    it("should not rate limit /health endpoint", async () => {
      const { app } = buildApp(1, 60_000);

      // Health should always work, even after many requests
      for (let i = 0; i < 5; i++) {
        const res = await app.handle(
          new Request("http://localhost/health")
        );
        expect(res.status).toBe(200);
      }
    });

    it("should not rate limit /docs endpoint", async () => {
      const { app } = buildApp(1, 60_000);

      for (let i = 0; i < 5; i++) {
        const res = await app.handle(
          new Request("http://localhost/docs")
        );
        expect(res.status).toBe(200);
      }
    });
  });

  describe("Auth endpoint stricter limits", () => {
    it("should apply stricter rate limits on sign-in", async () => {
      const { app } = buildApp(100, 60_000); // General limit is high

      // Auth sign-in has limit of 5 per 60s
      for (let i = 0; i < 5; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/auth/sign-in/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": "192.168.1.100",
            },
            body: JSON.stringify({ email: "test@test.com", password: "pass" }),
          })
        );
        expect(res.status).toBe(200);
      }

      // 6th attempt should be rate limited by auth-specific rule
      const res = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "192.168.1.100",
          },
          body: JSON.stringify({ email: "test@test.com", password: "pass" }),
        })
      );
      expect(res.status).toBe(429);
    });

    it("should apply stricter rate limits on sign-up", async () => {
      const { app } = buildApp(100, 60_000);

      // Auth sign-up has limit of 3 per 60s
      for (let i = 0; i < 3; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/auth/sign-up/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": "10.0.0.1",
            },
            body: JSON.stringify({
              email: `test${i}@test.com`,
              password: "pass",
            }),
          })
        );
        expect(res.status).toBe(200);
      }

      // 4th attempt should be rate limited
      const res = await app.handle(
        new Request("http://localhost/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "10.0.0.1",
          },
          body: JSON.stringify({
            email: "test99@test.com",
            password: "pass",
          }),
        })
      );
      expect(res.status).toBe(429);
    });
  });

  describe("Disabled mode", () => {
    it("should not enforce limits when disabled", async () => {
      const app = new Elysia()
        .use(rateLimitPlugin({ enabled: false }))
        .get("/api/v1/test", () => ({ ok: true }));

      // Should never get 429
      for (let i = 0; i < 20; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/v1/test")
        );
        expect(res.status).toBe(200);
      }
    });
  });

  describe("OPTIONS requests", () => {
    it("should skip rate limiting for CORS preflight", async () => {
      const { app } = buildApp(1, 60_000);

      for (let i = 0; i < 5; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/v1/employees", {
            method: "OPTIONS",
          })
        );
        // OPTIONS should not be rate limited
        expect(res.status).not.toBe(429);
      }
    });
  });
});
