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
import { Pool } from "pg";
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

// =============================================================================
// Account Lockout Helpers
// =============================================================================

/**
 * Singleton pg Pool for lockout queries.
 * Reuses the same pool configuration as Better Auth (app schema search path).
 */
let lockoutPool: Pool | null = null;

function getLockoutPool(): Pool {
  if (!lockoutPool) {
    const databaseUrl =
      process.env["DATABASE_APP_URL"] ||
      process.env["DATABASE_URL"] ||
      getDatabaseUrl();
    lockoutPool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      options: "-c search_path=app,public",
    });
  }
  return lockoutPool;
}

/**
 * Check whether the sign-in request path matches the email/password sign-in endpoint.
 */
function isEmailSignInRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  try {
    const url = new URL(request.url);
    return url.pathname === "/api/auth/sign-in/email";
  } catch {
    return false;
  }
}

/**
 * Extract the email from the request body for sign-in requests.
 * Parses the JSON body from the Elysia ctx.body (already parsed) or raw request.
 */
function extractEmailFromBody(ctx: any): string | null {
  try {
    const body = ctx.body;
    if (body && typeof body === "object" && typeof body.email === "string") {
      return body.email.trim().toLowerCase();
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Look up a user ID by email from the Better Auth "user" table.
 * Returns null if the user does not exist.
 */
async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const pool = getLockoutPool();
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM app."user" WHERE email = $1 LIMIT 1`,
      [email]
    );
    return result.rows[0]?.id ?? null;
  } catch (error) {
    console.warn("[Auth] getUserIdByEmail failed:", error);
    return null;
  }
}

/**
 * Check whether a user account is locked. Returns lockout details if locked.
 */
async function checkLockout(userId: string): Promise<{ isLocked: boolean; lockedUntil: Date | null }> {
  try {
    const pool = getLockoutPool();
    const lockResult = await pool.query<{ is_locked: boolean }>(
      `SELECT app.check_account_lockout($1::text) as is_locked`,
      [userId]
    );
    const isLocked = lockResult.rows[0]?.is_locked ?? false;
    if (!isLocked) return { isLocked: false, lockedUntil: null };

    // Fetch lock expiry for Retry-After header
    const lockInfo = await pool.query<{ locked_until: Date }>(
      `SELECT "lockedUntil" as locked_until FROM app."user" WHERE id = $1`,
      [userId]
    );
    return { isLocked: true, lockedUntil: lockInfo.rows[0]?.locked_until ?? null };
  } catch (error) {
    // If the function doesn't exist (migration not applied), treat as not locked
    console.warn("[Auth] check_account_lockout failed (migration may not be applied):", error);
    return { isLocked: false, lockedUntil: null };
  }
}

/**
 * Record a failed login attempt for a user.
 */
async function recordFailedLogin(userId: string): Promise<void> {
  try {
    const pool = getLockoutPool();
    await pool.query(`SELECT app.record_failed_login($1::text)`, [userId]);
  } catch (error) {
    // Non-fatal: don't block auth flow if recording fails
    console.warn("[Auth] record_failed_login failed:", error);
  }
}

/**
 * Build an account-locked response with proper error format and headers.
 */
function buildAccountLockedResponse(lockedUntil: Date | null): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Calculate Retry-After in seconds
  if (lockedUntil) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)
    );
    headers["Retry-After"] = String(retryAfterSeconds);
  } else {
    // Default to 5 minutes if we don't know the exact expiry
    headers["Retry-After"] = "300";
  }

  const message = lockedUntil
    ? `Account is locked until ${lockedUntil.toISOString()}. Too many failed login attempts.`
    : "Account is locked due to too many failed login attempts.";

  return new Response(
    JSON.stringify({
      error: {
        code: "ACCOUNT_LOCKED",
        message,
      },
    }),
    {
      status: 423,
      headers,
    }
  );
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
 *
 * Account Lockout Integration:
 * - Before sign-in: checks if the account is locked via app.check_account_lockout()
 * - After failed sign-in: records the failure via app.record_failed_login()
 * - After successful sign-in: resets failures via session.create.after databaseHook
 */
export function betterAuthPlugin() {
  const auth = getBetterAuth();

  return new Elysia({ name: "better-auth" })
    // Handle all /api/auth/* routes with all HTTP methods
    // The wildcard (*) captures any path after /api/auth/
    .all("/api/auth/*", async (ctx) => {
      const { request } = ctx as any;

      // --- Account Lockout: Pre-check for sign-in requests ---
      if (isEmailSignInRequest(request)) {
        const email = extractEmailFromBody(ctx);
        if (email) {
          const userId = await getUserIdByEmail(email);
          if (userId) {
            const { isLocked, lockedUntil } = await checkLockout(userId);
            if (isLocked) {
              return buildAccountLockedResponse(lockedUntil);
            }
          }
        }
      }

      try {
        const safeRequest = await buildBetterAuthRequest(ctx as any);
        const response = await auth.handler(safeRequest);
        const normalized = await normalizeBetterAuthResponse(response);

        // --- Account Lockout: Record failed login on 401 sign-in responses ---
        if (isEmailSignInRequest(request) && normalized.status === 401) {
          const email = extractEmailFromBody(ctx);
          if (email) {
            const userId = await getUserIdByEmail(email);
            if (userId) {
              await recordFailedLogin(userId);

              // After recording, check if the account is now locked
              const { isLocked, lockedUntil } = await checkLockout(userId);
              if (isLocked) {
                return buildAccountLockedResponse(lockedUntil);
              }
            }
          }
        }

        return normalized;
      } catch (error) {
        // Handle APIError thrown by databaseHooks (e.g., lockout in session.create.before)
        if (error && typeof error === "object" && "statusCode" in error) {
          const apiErr = error as { statusCode?: number; message?: string; body?: any };
          if (apiErr.statusCode === 403) {
            const message = apiErr.message ?? apiErr.body?.message ?? "Forbidden";
            // Check if this is a lockout-related error from our session.create.before hook
            if (typeof message === "string" && message.includes("locked")) {
              const email = extractEmailFromBody(ctx);
              if (email) {
                const userId = await getUserIdByEmail(email);
                if (userId) {
                  const { lockedUntil } = await checkLockout(userId);
                  return buildAccountLockedResponse(lockedUntil);
                }
              }
              // Fallback: return generic locked response
              return buildAccountLockedResponse(null);
            }
          }
        }
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
