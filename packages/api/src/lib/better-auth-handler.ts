/**
 * Better Auth Elysia Handler
 *
 * Integrates Better Auth with Elysia framework.
 * Exposes auth endpoints at /api/auth/*
 *
 * FIX: Ensures all HTTP methods (GET, POST, OPTIONS, etc.) are properly handled
 * to prevent 405 Method Not Allowed errors.
 */

import { Elysia } from "elysia";
import { getBetterAuth } from "./better-auth";
import postgres from "postgres";
import { getDatabaseUrl } from "../config/database";

let lastDbReachabilityCheckAt = 0;
let lastDbReachable: boolean | null = null;

async function isDatabaseReachable(): Promise<boolean> {
  const now = Date.now();
  if (lastDbReachable !== null && now - lastDbReachabilityCheckAt < 5_000) {
    return lastDbReachable;
  }

  lastDbReachabilityCheckAt = now;

  try {
    const sql = postgres(getDatabaseUrl(), {
      max: 1,
      connect_timeout: 1,
      idle_timeout: 1,
    });
    await sql`SELECT 1 as ok`;
    await sql.end({ timeout: 1 });
    lastDbReachable = true;
    return true;
  } catch {
    lastDbReachable = false;
    return false;
  }
}

type DatabaseReachabilityCheck = () => Promise<boolean>;
let databaseReachabilityCheck: DatabaseReachabilityCheck = isDatabaseReachable;

export function setDatabaseReachabilityCheckForTests(
  fn: DatabaseReachabilityCheck | null
): void {
  databaseReachabilityCheck = fn ?? isDatabaseReachable;
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "string") {
    const message = error;
    return (
      /connect\s+ECONNREFUSED/i.test(message) ||
      /password authentication failed/i.test(message) ||
      /could not connect to server/i.test(message) ||
      /connection terminated unexpectedly/i.test(message)
    );
  }

  if (typeof error !== "object") return false;
  const anyErr = error as any;

  const code = anyErr.code;
  if (
    typeof code === "string" &&
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ENOTFOUND",
    ].includes(code)
  ) {
    return true;
  }

  if (Array.isArray(anyErr.errors) && anyErr.errors.some(isDatabaseConnectionError)) {
    return true;
  }

  if (anyErr.cause && isDatabaseConnectionError(anyErr.cause)) {
    return true;
  }

  const message = typeof anyErr.message === "string" ? anyErr.message : "";
  if (
    /connect\s+ECONNREFUSED/i.test(message) ||
    /password authentication failed/i.test(message) ||
    /could not connect to server/i.test(message) ||
    /connection terminated unexpectedly/i.test(message)
  ) {
    return true;
  }

  return false;
 }

export function buildAuthErrorResponse(error: unknown): Response {
  const dbUnavailable = isDatabaseConnectionError(error);
  const status = dbUnavailable ? 503 : 500;
  const payload = dbUnavailable
    ? { error: "Authentication service unavailable", code: "AUTH_DB_UNAVAILABLE" }
    : { error: "Authentication service error" };

  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
 }

 export async function normalizeBetterAuthResponse(response: Response): Promise<Response> {
  if (response.status !== 500) return response;

  // Better Auth sometimes returns a 500 Response instead of throwing.
  // When the root cause is a DB outage, we remap to 503 so clients/tests
  // can distinguish "service unavailable" from "server bug".
  try {
    const bodyText = await response.clone().text();
    if (isDatabaseConnectionError({ message: bodyText })) {
      return buildAuthErrorResponse({
        code: "ECONNREFUSED",
        message: bodyText,
      });
    }
  } catch {
    // If we can't inspect the body, fall back to returning the original response.
  }

  if (!(await databaseReachabilityCheck())) {
    return buildAuthErrorResponse({
      code: "ECONNREFUSED",
      message: "Database unavailable",
    });
  }

  return response;
 }

async function buildBetterAuthRequest(ctx: { request: Request; body?: unknown }): Promise<Request> {
  const { request } = ctx;
  if (!request.bodyUsed) return request;

  const headers = new Headers(request.headers);
  const method = request.method;

  // Only attempt to rehydrate body for methods that can have a body.
  if (method === "GET" || method === "HEAD") {
    return new Request(request.url, { method, headers });
  }

  const contentType = headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    const body = (ctx as any).body ?? null;
    const bodyText = body === null || body === undefined ? "" : JSON.stringify(body);
    return new Request(request.url, {
      method,
      headers,
      body: bodyText,
    });
  }

  // Fallback: if we can't safely reconstruct, forward a bodiless request.
  return new Request(request.url, { method, headers });
}

/**
 * Better Auth plugin for Elysia
 *
 * Mounts Better Auth endpoints at /api/auth/*
 * Handles:
 * - POST /api/auth/sign-up/email - Register new user
 * - POST /api/auth/sign-in/email - Email/password login
 * - POST /api/auth/sign-out - Logout
 * - GET /api/auth/get-session - Get current session
 * - POST /api/auth/two-factor/* - MFA endpoints
 *
 * IMPORTANT: Uses .all() to handle ALL HTTP methods including OPTIONS for CORS preflight.
 * This prevents 405 Method Not Allowed errors when the browser sends preflight requests.
 */
export function betterAuthPlugin() {
  const auth = getBetterAuth();

  return new Elysia({ name: "better-auth" })
    // Handle all /api/auth/* routes with all HTTP methods
    // The wildcard (*) captures any path after /api/auth/
    .all("/api/auth/*", async (ctx) => {
      const { request } = ctx as any;
      try {
        const safeRequest = await buildBetterAuthRequest(ctx as any);
        const response = await auth.handler(safeRequest);
        return await normalizeBetterAuthResponse(response);
      } catch (error) {
        console.error("Better Auth handler error:", error instanceof Error ? error.message : "Unknown error");
        return buildAuthErrorResponse(error);
      }
    })

    // Handle exact /api/auth path (without trailing path)
    .all("/api/auth", async (ctx) => {
      const { request } = ctx as any;
      try {
        const safeRequest = await buildBetterAuthRequest(ctx as any);
        const response = await auth.handler(safeRequest);
        return await normalizeBetterAuthResponse(response);
      } catch (error) {
        console.error("Better Auth handler error:", error instanceof Error ? error.message : "Unknown error");
        return buildAuthErrorResponse(error);
      }
    });
}

/**
 * Session middleware for Elysia
 *
 * Adds session and user to request context if authenticated.
 * Use this on routes that need to check authentication.
 */
export function betterAuthSession() {
  const auth = getBetterAuth();

  return new Elysia({ name: "better-auth-session" }).derive(
    async ({ request, set }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session) {
          return {
            session: null,
            user: null,
            isAuthenticated: false as const,
          };
        }

        return {
          session: session.session,
          user: session.user,
          isAuthenticated: true as const,
        };
      } catch (error) {
        console.error("Session validation error:", error instanceof Error ? error.message : "Unknown error");
        return {
          session: null,
          user: null,
          isAuthenticated: false as const,
        };
      }
    }
  );
}

/**
 * Auth guard for protected routes
 *
 * Returns 401 if not authenticated.
 * Must be used after betterAuthSession() middleware.
 */
export function requireBetterAuth() {
  return new Elysia({ name: "require-better-auth" }).derive(
    (ctx) => {
      const { session, user, isAuthenticated, set } = ctx as any;
      if (!isAuthenticated || !session || !user) {
        set.status = 401;
        throw new Error("Authentication required");
      }
      return { session, user };
    }
  );
}

export { getBetterAuth };
