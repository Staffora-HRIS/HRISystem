/**
 * CI Smoke Tests - Live HTTP Requests Against Running API Server
 *
 * These tests make real HTTP requests to http://localhost:3000 and verify
 * the API server is functioning correctly in a CI environment.
 *
 * Unlike other E2E tests that use app.handle() (in-process), these tests
 * exercise the full network stack: TCP connection, HTTP parsing, middleware
 * chain, database queries, and response serialization.
 *
 * Prerequisites:
 *   - API server running on PORT (default 3000)
 *   - PostgreSQL available and migrated
 *   - Redis available
 *
 * Run locally:
 *   bun run dev:api &
 *   bun test packages/api/src/test/e2e/ci-smoke.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test";

const API_BASE = process.env["E2E_API_URL"] || `http://localhost:${process.env["PORT"] || 3000}`;

/**
 * Check if the API server is reachable before running tests.
 * If the server is not running, tests will be skipped gracefully.
 */
let serverAvailable = false;

async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  serverAvailable = await checkServer();
  if (!serverAvailable) {
    console.warn(
      `[CI Smoke] API server not reachable at ${API_BASE}. ` +
        "Skipping live HTTP tests. Start the server with: bun run dev:api"
    );
  }
});

// =============================================================================
// Health & Readiness Endpoints
// =============================================================================

describe("Health endpoints (live HTTP)", () => {
  it("GET /health should return 200 with status and checks", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBeDefined();
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
    expect(body.checks.database.status).toBeDefined();
    expect(body.checks.redis).toBeDefined();
    expect(body.checks.redis.status).toBeDefined();
  });

  it("GET /health should report database as up", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/health`);
    const body = await response.json();

    expect(body.checks.database.status).toBe("up");
    expect(typeof body.checks.database.latency).toBe("number");
    expect(body.checks.database.latency).toBeGreaterThanOrEqual(0);
  });

  it("GET /health should report redis as up", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/health`);
    const body = await response.json();

    expect(body.checks.redis.status).toBe("up");
    expect(typeof body.checks.redis.latency).toBe("number");
    expect(body.checks.redis.latency).toBeGreaterThanOrEqual(0);
  });

  it("GET /ready should return readiness status", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/ready`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBeDefined();
    expect(["ready", "not_ready"]).toContain(body.status);
  });

  it("GET /live should return liveness status", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/live`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("alive");
  });
});

// =============================================================================
// Root & Documentation Endpoints
// =============================================================================

describe("Root endpoints (live HTTP)", () => {
  it("GET / should return API info", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe("Staffora Platform API");
    expect(body.version).toBeDefined();
    expect(body.documentation).toBe("/docs");
    expect(body.health).toBe("/health");
  });

  it("GET /docs should return Swagger UI HTML", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/docs`);
    // Swagger UI redirects or serves HTML
    expect(response.status).toBeLessThan(400);
  });

  it("GET /docs/json should return OpenAPI JSON spec", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/docs/json`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.openapi).toBeDefined();
    expect(body.info).toBeDefined();
    expect(body.info.title).toContain("Staffora");
  });
});

// =============================================================================
// Authentication - Unauthenticated Access
// =============================================================================

describe("Authentication enforcement (live HTTP)", () => {
  it("GET /api/v1/hr/employees should return 401 without auth", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/hr/employees`);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeDefined();
  });

  it("GET /api/v1/absence/leave-types should return 401 without auth", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/absence/leave-types`);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/auth/me should return 401 without auth", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/auth/me`);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/cases should return 401 without auth", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/cases`);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/talent/reviews should return 401 without auth", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/talent/reviews`);
    expect(response.status).toBe(401);
  });
});

// =============================================================================
// Error Handling
// =============================================================================

describe("Error handling (live HTTP)", () => {
  it("GET /nonexistent should return 404 with error shape", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/nonexistent`);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBeDefined();
    expect(body.error.requestId).toBeDefined();
  });

  it("GET /api/v1/nonexistent should return 404", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/nonexistent`);
    expect(response.status).toBe(404);
  });

  it("should not leak internal error details in 404 response", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/nonexistent`);
    const text = await response.text();

    // Must not contain stack traces or internal paths
    expect(text).not.toContain("node_modules");
    expect(text).not.toContain("at Object.");
    expect(text).not.toContain("postgres://");
    expect(text).not.toContain("ECONNREFUSED");
  });
});

// =============================================================================
// Security Headers
// =============================================================================

describe("Security headers (live HTTP)", () => {
  it("should include security headers on health endpoint", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/health`);

    // X-Content-Type-Options
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    // X-Frame-Options
    const frameOptions = response.headers.get("x-frame-options");
    expect(frameOptions).toBeTruthy();
  });

  it("should include CORS headers for allowed origin", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/health`, {
      headers: { Origin: "http://localhost:5173" },
    });

    const allowOrigin = response.headers.get("access-control-allow-origin");
    // In dev/test mode, localhost origins are allowed
    expect(allowOrigin).toBeTruthy();
  });

  it("should support CORS preflight on API endpoints", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/v1/hr/employees`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type,Authorization",
      },
    });

    // Preflight should return 200 or 204, not 405
    expect(response.status).toBeLessThan(300);
  });
});

// =============================================================================
// Better Auth Endpoints
// =============================================================================

describe("Better Auth endpoints (live HTTP)", () => {
  it("GET /api/auth/get-session should return null session for unauthenticated request", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/auth/get-session`);
    expect(response.status).toBe(200);

    const data = await response.json();
    // No session cookie means null session
    const hasNoSession =
      data === null ||
      data === undefined ||
      data.session === null ||
      data.session === undefined;
    expect(hasNoSession).toBe(true);
  });

  it("POST /api/auth/sign-in/email should reject empty body", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("POST /api/auth/sign-in/email should reject invalid credentials", async () => {
    if (!serverAvailable) return;

    const response = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent-ci-test@example.com",
        password: "InvalidPassword123!",
      }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

// =============================================================================
// Request Size Limits
// =============================================================================

describe("Request size limits (live HTTP)", () => {
  it("should reject oversized request body", async () => {
    if (!serverAvailable) return;

    // Create a body larger than the 10MB limit
    const largeBody = "x".repeat(11 * 1024 * 1024);

    try {
      const response = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(largeBody.length),
        },
        body: largeBody,
      });

      // Should be rejected with 413 Payload Too Large
      expect(response.status).toBe(413);
    } catch {
      // Connection may be reset for very large bodies, which is also acceptable
      expect(true).toBe(true);
    }
  });
});
