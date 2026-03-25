/**
 * Rate Limiting Integration Tests
 *
 * Tests the rate limiting plugin including:
 * 1. IP-based rate limiting for unauthenticated endpoints (TODO-025)
 * 2. Redis fallback to in-memory store (TODO-026)
 * 3. Different IPs/tenants get separate buckets (TODO-024)
 * 4. 429 responses when limits are exceeded
 * 5. Auth endpoint stricter limits
 * 6. Skipped routes bypass rate limiting
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { rateLimitPlugin, InMemoryRateLimitStore } from "../../plugins/rate-limit";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * In-memory rate limit store for testing (replaces Redis).
 * Matches the CacheClient.incrementRateLimit interface.
 */
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
    /** Simulate Redis failure by throwing on every call */
    simulateFailure: false,
  };
}

/**
 * Create a mock cache that throws on every operation (simulates Redis down).
 */
function createFailingCache() {
  return {
    incrementRateLimit: async (): Promise<{ count: number; exceeded: boolean }> => {
      throw new Error("Redis connection refused");
    },
  };
}

/**
 * Create a mock Elysia server object that provides requestIP for IP-based rate limiting.
 * Returns a fixed loopback address so rate-limit tests can run without a real server.
 */
function createMockServer() {
  return {
    requestIP(_request: Request) {
      return { address: "127.0.0.1" };
    },
  };
}

/**
 * Build a test app with the given options.
 *
 * Uses `_clientIp` context override to simulate different client IPs in tests.
 * The rate limit plugin reads `_clientIp` before falling back to server.requestIP.
 * Tests that need per-request IP variation use the X-Test-IP header, which is
 * read by the derive to set `_clientIp` dynamically.
 *
 * @param maxRequests - Max requests for the general rate limit
 * @param windowMs - Window duration in ms
 * @param opts - Additional options: user, tenantId, defaultIp to simulate context
 */
function buildApp(
  maxRequests: number,
  windowMs: number,
  opts: {
    cache?: any;
    user?: { id: string } | null;
    tenantId?: string | null;
    defaultIp?: string;
  } = {}
) {
  const cache = opts.cache ?? createMockCache();
  const defaultIp = opts.defaultIp ?? "127.0.0.1";

  const app = new Elysia()
    .derive(({ request }) => ({
      cache,
      tenantId: opts.tenantId ?? "test-tenant",
      user: opts.user !== undefined ? opts.user : { id: "test-user" },
      requestId: "test-req",
      // Allow per-request IP override via X-Test-IP header for IP isolation tests
      _clientIp: request.headers.get("X-Test-IP") || defaultIp,
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
    .get("/api/v1/public/data", () => ({ data: "public" }))
    .post("/api/auth/sign-in/email", () => ({ token: "abc" }))
    .post("/api/auth/sign-up/email", () => ({ user: {} }));

  return { app, cache };
}

// =============================================================================
// Tests
// =============================================================================

describe("Rate Limiting Plugin", () => {
  // =========================================================================
  // General Rate Limiting
  // =========================================================================

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

  // =========================================================================
  // Skipped Routes
  // =========================================================================

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

  // =========================================================================
  // Auth Endpoint Stricter Limits
  // =========================================================================

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
              "X-Test-IP": "192.168.1.100",
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
            "X-Test-IP": "192.168.1.100",
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
              "X-Test-IP": "10.0.0.1",
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
            "X-Test-IP": "10.0.0.1",
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

  // =========================================================================
  // Disabled Mode
  // =========================================================================

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

  // =========================================================================
  // OPTIONS Requests
  // =========================================================================

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

  // =========================================================================
  // IP-Based Rate Limiting (TODO-025)
  // =========================================================================

  describe("IP-based rate limiting for unauthenticated endpoints", () => {
    it("should use IP-based keys for unauthenticated requests", async () => {
      // Build app with no authenticated user, fixed default IP
      const { app } = buildApp(3, 60_000, { user: null, tenantId: null, defaultIp: "1.2.3.4" });

      // Exhaust the limit from default IP
      for (let i = 0; i < 3; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/v1/public/data")
        );
        expect(res.status).toBe(200);
      }

      // Next request from same IP should be rate limited
      const blockedRes = await app.handle(
        new Request("http://localhost/api/v1/public/data")
      );
      expect(blockedRes.status).toBe(429);
    });

    it("should give different IPs separate buckets", async () => {
      // Use X-Test-IP header to simulate different client IPs via mock server
      const { app } = buildApp(2, 60_000, { user: null, tenantId: null });

      // Exhaust limit for IP-A
      for (let i = 0; i < 2; i++) {
        await app.handle(
          new Request("http://localhost/api/v1/public/data", {
            headers: { "X-Test-IP": "10.0.0.1" },
          })
        );
      }

      // IP-A should be blocked
      const blockedA = await app.handle(
        new Request("http://localhost/api/v1/public/data", {
          headers: { "X-Test-IP": "10.0.0.1" },
        })
      );
      expect(blockedA.status).toBe(429);

      // IP-B should still be allowed (different IP = different bucket)
      const allowedB = await app.handle(
        new Request("http://localhost/api/v1/public/data", {
          headers: { "X-Test-IP": "10.0.0.2" },
        })
      );
      expect(allowedB.status).toBe(200);
    });

    it("should isolate auth rate limits per IP", async () => {
      // Use X-Test-IP header to simulate different client IPs
      const { app } = buildApp(100, 60_000);

      // Exhaust sign-in limit for IP-A (limit = 5)
      for (let i = 0; i < 5; i++) {
        await app.handle(
          new Request("http://localhost/api/auth/sign-in/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Test-IP": "192.168.0.10",
            },
            body: JSON.stringify({ email: "a@a.com", password: "p" }),
          })
        );
      }

      // IP-A should be blocked
      const blockedA = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-IP": "192.168.0.10",
          },
          body: JSON.stringify({ email: "a@a.com", password: "p" }),
        })
      );
      expect(blockedA.status).toBe(429);

      // IP-B should still be allowed (different IP = separate rate limit bucket)
      const allowedB = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-IP": "192.168.0.20",
          },
          body: JSON.stringify({ email: "b@b.com", password: "p" }),
        })
      );
      expect(allowedB.status).toBe(200);
    });
  });

  // =========================================================================
  // Tenant Bucket Isolation
  // =========================================================================

  describe("Tenant/user bucket isolation", () => {
    it("should give different tenants separate rate limit buckets", async () => {
      // Tenant A app
      const cacheA = createMockCache();
      const { app: appA } = buildApp(2, 60_000, {
        cache: cacheA,
        user: { id: "user-1" },
        tenantId: "tenant-a",
      });

      // Exhaust limit for tenant A
      for (let i = 0; i < 2; i++) {
        await appA.handle(
          new Request("http://localhost/api/v1/employees")
        );
      }

      // Tenant A should be blocked
      const blockedA = await appA.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(blockedA.status).toBe(429);

      // Tenant B app with the SAME cache (same Redis)
      const { app: appB } = buildApp(2, 60_000, {
        cache: cacheA,
        user: { id: "user-1" },
        tenantId: "tenant-b",
      });

      // Tenant B should still be allowed (different tenant = different bucket)
      const allowedB = await appB.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(allowedB.status).toBe(200);
    });

    it("should give different users within same tenant separate buckets", async () => {
      const sharedCache = createMockCache();

      // User A in tenant X
      const { app: appA } = buildApp(2, 60_000, {
        cache: sharedCache,
        user: { id: "user-a" },
        tenantId: "tenant-x",
      });

      // Exhaust limit for user A
      for (let i = 0; i < 2; i++) {
        await appA.handle(
          new Request("http://localhost/api/v1/employees")
        );
      }

      // User A should be blocked
      const blockedA = await appA.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(blockedA.status).toBe(429);

      // User B in same tenant X
      const { app: appB } = buildApp(2, 60_000, {
        cache: sharedCache,
        user: { id: "user-b" },
        tenantId: "tenant-x",
      });

      // User B should still be allowed
      const allowedB = await appB.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(allowedB.status).toBe(200);
    });
  });

  // =========================================================================
  // In-Memory Fallback (TODO-026)
  // =========================================================================

  describe("In-memory fallback when Redis is unavailable", () => {
    it("should still enforce rate limits when cache is unavailable", async () => {
      // Build app with no cache at all (undefined)
      const app = new Elysia()
        .derive(() => ({
          cache: undefined,
          tenantId: "test-tenant",
          user: { id: "test-user" },
          requestId: "test-req",
          _clientIp: "127.0.0.1",
        }))
        .use(
          rateLimitPlugin({
            enabled: true,
            maxRequests: 3,
            windowMs: 60_000,
          })
        )
        .get("/api/v1/employees", () => ({ data: [] }));

      // Should still get rate limit headers and eventual 429
      // (falls back to in-memory store)
      for (let i = 0; i < 3; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/v1/employees")
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
      }

      // 4th request should be rate limited via in-memory fallback
      const blockedRes = await app.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(blockedRes.status).toBe(429);
    });

    it("should fall back to in-memory when Redis throws errors", async () => {
      const failingCache = createFailingCache();

      const app = new Elysia()
        .derive(() => ({
          cache: failingCache,
          tenantId: "test-tenant",
          user: { id: "test-user" },
          requestId: "test-req",
          _clientIp: "127.0.0.1",
        }))
        .use(
          rateLimitPlugin({
            enabled: true,
            maxRequests: 2,
            windowMs: 60_000,
          })
        )
        .get("/api/v1/employees", () => ({ data: [] }));

      // First 2 requests should succeed via in-memory fallback
      for (let i = 0; i < 2; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/v1/employees")
        );
        expect(res.status).toBe(200);
      }

      // 3rd request should be blocked via in-memory fallback
      const blockedRes = await app.handle(
        new Request("http://localhost/api/v1/employees")
      );
      expect(blockedRes.status).toBe(429);
    });

    it("should fall back to in-memory for auth endpoints when Redis fails", async () => {
      const failingCache = createFailingCache();

      const app = new Elysia()
        .derive(() => ({
          cache: failingCache,
          tenantId: null,
          user: null,
          requestId: "test-req",
          _clientIp: "127.0.0.1",
        }))
        .use(
          rateLimitPlugin({
            enabled: true,
            maxRequests: 100,
            windowMs: 60_000,
          })
        )
        .post("/api/auth/sign-in/email", () => ({ token: "abc" }));

      // Auth sign-in limit is 5. First 5 should succeed.
      for (let i = 0; i < 5; i++) {
        const res = await app.handle(
          new Request("http://localhost/api/auth/sign-in/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "x@x.com", password: "p" }),
          })
        );
        expect(res.status).toBe(200);
      }

      // 6th should be blocked
      const blockedRes = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x@x.com", password: "p" }),
        })
      );
      expect(blockedRes.status).toBe(429);
    });
  });

  // =========================================================================
  // InMemoryRateLimitStore Unit Tests
  // =========================================================================

  describe("InMemoryRateLimitStore", () => {
    let store: InMemoryRateLimitStore;

    beforeEach(() => {
      store = new InMemoryRateLimitStore(100);
    });

    it("should increment counter and detect exceeded limit", () => {
      const r1 = store.incrementRateLimit("key1", 60, 2);
      expect(r1.count).toBe(1);
      expect(r1.exceeded).toBe(false);

      const r2 = store.incrementRateLimit("key1", 60, 2);
      expect(r2.count).toBe(2);
      expect(r2.exceeded).toBe(false);

      const r3 = store.incrementRateLimit("key1", 60, 2);
      expect(r3.count).toBe(3);
      expect(r3.exceeded).toBe(true);
    });

    it("should use separate counters for different keys", () => {
      store.incrementRateLimit("key-a", 60, 1);
      store.incrementRateLimit("key-a", 60, 1);

      const resultB = store.incrementRateLimit("key-b", 60, 1);
      expect(resultB.count).toBe(1);
      expect(resultB.exceeded).toBe(false);
    });

    it("should reset counter after expiry window", async () => {
      // Use a very short window (1 second)
      store.incrementRateLimit("key-expire", 1, 1);
      store.incrementRateLimit("key-expire", 1, 1);

      // Wait for the window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = store.incrementRateLimit("key-expire", 1, 1);
      expect(result.count).toBe(1);
      expect(result.exceeded).toBe(false);
    });

    it("should evict oldest entries when at capacity", () => {
      const smallStore = new InMemoryRateLimitStore(3);

      smallStore.incrementRateLimit("a", 60, 10);
      smallStore.incrementRateLimit("b", 60, 10);
      smallStore.incrementRateLimit("c", 60, 10);
      expect(smallStore.size).toBe(3);

      // Adding a 4th should evict the oldest
      smallStore.incrementRateLimit("d", 60, 10);
      expect(smallStore.size).toBeLessThanOrEqual(3);
    });

    it("should clear all entries", () => {
      store.incrementRateLimit("x", 60, 10);
      store.incrementRateLimit("y", 60, 10);
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
    });
  });
});
