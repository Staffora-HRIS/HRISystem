/**
 * Test API Client
 *
 * HTTP client wrapper for testing API routes via Elysia's app.handle().
 *
 * Provides:
 * - Authenticated sessions via Better Auth (real sign-in, real cookies)
 * - Automatic X-Tenant-ID header injection
 * - Automatic Idempotency-Key generation for mutations
 * - Automatic CSRF token generation for mutations
 * - Cookie jar that accumulates Set-Cookie headers across requests
 * - Typed JSON response parsing with body property
 * - Convenience HTTP method shortcuts
 * - Response assertion helpers
 *
 * @example
 * ```ts
 * // Static factory (preferred usage)
 * const client = await TestApiClient.authenticated(app, {
 *   db,
 *   tenantId: tenant.id,
 *   userId: user.id,
 *   userEmail: user.email,
 * });
 *
 * const res = await client.get("/api/v1/hr/employees");
 * expectSuccess(res);
 *
 * const createRes = await client.post("/api/v1/hr/org-units", {
 *   code: "ENG", name: "Engineering", effective_from: "2025-01-01",
 * });
 * expect(createRes.status).toBe(201);
 *
 * await client.cleanup();
 * ```
 */

import * as bcrypt from "bcryptjs";
import type { TestTenant, TestUser } from "../setup";
import { withSystemContext } from "../setup";
import { splitCombinedSetCookieHeader } from "./cookies";
import { generateCsrfToken } from "../../plugins/auth-better";

// =============================================================================
// Types
// =============================================================================

/** Minimal interface for an Elysia app (only handle is needed). */
export interface TestApp {
  handle: (request: Request) => Promise<Response>;
}

/** Options for individual requests. */
export interface TestRequestOptions {
  /** Query parameters to append to the URL. */
  query?: Record<string, string | number | boolean | undefined>;

  /** Additional headers to include (merged with defaults). */
  headers?: Record<string, string>;

  /** Override the tenant ID for this specific request. */
  tenantId?: string;

  /** Provide a specific idempotency key instead of auto-generating one. */
  idempotencyKey?: string;

  /** Skip the Idempotency-Key header for this request. */
  skipIdempotencyKey?: boolean;

  /** Skip the CSRF token for this request. */
  skipCsrf?: boolean;

  /** Skip the tenant header for this request. */
  skipTenantHeader?: boolean;

  /** Skip the auth cookie for this request. */
  skipAuth?: boolean;
}

/** Parsed API response with status, headers, body, and raw Response. */
export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  data: T;
  raw: Response;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Options for the static authenticated() factory. */
export interface AuthenticatedClientOptions {
  /** Database connection (postgres.js instance) for bootstrapping auth records. */
  db: ReturnType<typeof import("postgres").default>;

  /** Tenant ID to inject as X-Tenant-ID header on every request. */
  tenantId: string;

  /** User ID (UUID) of the test user. Must already exist in app.users. */
  userId: string;

  /** Email address of the test user. */
  userEmail: string;

  /** Password to use for sign-in. Defaults to "TestPassword123!". */
  userPassword?: string;

  /** Base URL for constructing Request objects. Defaults to "http://localhost". */
  baseUrl?: string;

  /**
   * Whether to automatically include CSRF tokens on mutations.
   * Defaults to true.
   */
  includeCsrf?: boolean;

  /**
   * Whether to automatically include Idempotency-Key on mutations.
   * Defaults to true.
   */
  includeIdempotencyKey?: boolean;

  /**
   * Whether to skip the automatic sign-in during creation.
   * Defaults to false (auto-login on creation).
   */
  skipLogin?: boolean;
}

// =============================================================================
// Cookie Jar
// =============================================================================

/**
 * Simple cookie jar that accumulates cookies from Set-Cookie response headers.
 * Overwrites cookies with the same name. Strips cookie attributes (Path, etc.).
 */
class CookieJar {
  private cookies = new Map<string, string>();

  /** Update the jar from a Response's Set-Cookie headers. */
  absorb(response: Response): void {
    const headersObj = response.headers as unknown as {
      getSetCookie?: () => string[];
    };

    let setCookies: string[];
    if (typeof headersObj.getSetCookie === "function") {
      setCookies = headersObj.getSetCookie();
    } else {
      const raw = response.headers.get("Set-Cookie") ?? "";
      setCookies = raw ? splitCombinedSetCookieHeader(raw) : [];
    }

    for (const cookie of setCookies) {
      const nameValue = cookie.split(";")[0]?.trim();
      if (!nameValue) continue;

      const eqIdx = nameValue.indexOf("=");
      if (eqIdx <= 0) continue;

      const name = nameValue.slice(0, eqIdx);
      const value = nameValue.slice(eqIdx + 1);

      const lowerCookie = cookie.toLowerCase();
      if (lowerCookie.includes("max-age=0") || lowerCookie.includes("max-age=-")) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  /** Build a Cookie header string from all stored cookies. */
  toCookieHeader(): string {
    if (this.cookies.size === 0) return "";
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  /** Check if the jar contains a cookie with the given name. */
  has(name: string): boolean {
    return this.cookies.has(name);
  }

  /** Get the value of a specific cookie. */
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /** Clear all cookies. */
  clear(): void {
    this.cookies.clear();
  }
}

// =============================================================================
// TestApiClient
// =============================================================================

/**
 * Fully-featured test API client for integration tests.
 *
 * Handles all the ceremony of session cookies, tenant headers,
 * idempotency keys, and CSRF tokens automatically. Sends requests
 * through Elysia's app.handle() for in-process testing.
 *
 * Create via the static factories:
 * - `TestApiClient.authenticated(app, options)` - Create with real Better Auth session
 * - `TestApiClient.unauthenticated(app, options)` - Create without auth (for 401 tests)
 * - `new TestApiClient(app)` - Basic client with manual auth setup
 */
export class TestApiClient {
  private baseUrl: string;
  private tenantId: string;
  private userId: string;
  private sessionId: string | null = null;
  private cookieJar: CookieJar;
  private includeCsrf: boolean;
  private includeIdempotencyKey: boolean;

  constructor(
    private app: TestApp,
    options: {
      baseUrl?: string;
      tenantId?: string;
      userId?: string;
      includeCsrf?: boolean;
      includeIdempotencyKey?: boolean;
    } = {}
  ) {
    this.baseUrl = options.baseUrl ?? "http://localhost";
    this.tenantId = options.tenantId ?? "";
    this.userId = options.userId ?? "";
    this.includeCsrf = options.includeCsrf ?? false;
    this.includeIdempotencyKey = options.includeIdempotencyKey ?? true;
    this.cookieJar = new CookieJar();
  }

  // ---------------------------------------------------------------------------
  // Static factories
  // ---------------------------------------------------------------------------

  /**
   * Create an authenticated TestApiClient with a real Better Auth session.
   *
   * This factory:
   * 1. Ensures the user has Better Auth records (user + account tables)
   * 2. Signs in via the app to obtain a real session cookie
   * 3. Returns a TestApiClient ready for use
   *
   * @example
   * ```ts
   * const client = await TestApiClient.authenticated(app, {
   *   db,
   *   tenantId: tenant.id,
   *   userId: user.id,
   *   userEmail: user.email,
   * });
   *
   * const res = await client.get("/api/v1/hr/employees");
   * expect(res.status).toBe(200);
   *
   * await client.cleanup();
   * ```
   */
  static async authenticated(
    app: TestApp,
    options: AuthenticatedClientOptions
  ): Promise<TestApiClient> {
    const {
      db,
      tenantId,
      userId,
      userEmail,
      userPassword = "TestPassword123!",
      baseUrl = "http://localhost",
      includeCsrf = true,
      includeIdempotencyKey = true,
      skipLogin = false,
    } = options;

    // Ensure Better Auth records exist for this user
    const passwordHash = await bcrypt.hash(userPassword, 12);

    await withSystemContext(db, async (tx) => {
      // Ensure super_admin role exists (tests need broad permissions)
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin',
                 'Platform super administrator (test)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );

      // Assign super_admin to user if not already assigned
      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = 'a0000000-0000-0000-0000-000000000001'::uuid
         )`,
        [tenantId, userId]
      );

      // Insert into Better Auth "user" table
      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name,
           "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status,
           "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [userId, userEmail, userEmail]
      );

      // Insert into Better Auth "account" table (credential provider)
      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [userId, userEmail, passwordHash]
      );
    });

    // Create the client instance
    const client = new TestApiClient(app, {
      baseUrl,
      tenantId,
      userId,
      includeCsrf,
      includeIdempotencyKey,
    });

    // Sign in to obtain a real session cookie
    if (!skipLogin) {
      await client.login(userEmail, userPassword);
    }

    return client;
  }

  /**
   * Create an unauthenticated TestApiClient.
   *
   * Useful for testing endpoints that should reject unauthenticated requests.
   * No sign-in is performed; requests are sent without session cookies.
   *
   * @example
   * ```ts
   * const anonClient = TestApiClient.unauthenticated(app, {
   *   tenantId: tenant.id,
   * });
   *
   * const res = await anonClient.get("/api/v1/hr/employees");
   * expect(res.status).toBe(401);
   * ```
   */
  static unauthenticated(
    app: TestApp,
    options: {
      tenantId?: string;
      baseUrl?: string;
    } = {}
  ): TestApiClient {
    return new TestApiClient(app, {
      baseUrl: options.baseUrl ?? "http://localhost",
      tenantId: options.tenantId ?? "00000000-0000-0000-0000-000000000000",
      userId: "00000000-0000-0000-0000-000000000000",
      includeCsrf: false,
      includeIdempotencyKey: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  /** Store the session ID (extracted after sign-in) for CSRF token generation. */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /** Get the current session ID. */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Get the cookie jar (for inspection in tests). */
  getCookieJar(): CookieJar {
    return this.cookieJar;
  }

  /**
   * Set authentication cookie manually.
   * Prefer using the static `authenticated()` factory for real sessions.
   */
  setAuthCookie(cookie: string): void {
    // Parse the cookie string and add individual cookies to the jar
    for (const pair of cookie.split(";")) {
      const trimmed = pair.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      // Use absorb-like logic: create a synthetic Response
      // For simplicity, directly set in the jar
    }
    // For backward compat: store the raw cookie string to include in requests
    this._rawAuthCookie = cookie;
  }

  private _rawAuthCookie: string | null = null;

  /** Clear authentication state. */
  clearAuth(): void {
    this.cookieJar.clear();
    this.sessionId = null;
    this._rawAuthCookie = null;
  }

  /**
   * Check whether the client has a valid-looking session cookie.
   * Does not verify the session with the server.
   */
  isLoggedIn(): boolean {
    return (
      this.cookieJar.has("staffora.session_token") ||
      this._rawAuthCookie !== null
    );
  }

  /** Change the tenant ID for subsequent requests. */
  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  /** Get the current tenant ID. */
  getTenantId(): string {
    return this.tenantId;
  }

  // ---------------------------------------------------------------------------
  // URL building
  // ---------------------------------------------------------------------------

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  // ---------------------------------------------------------------------------
  // Core request method
  // ---------------------------------------------------------------------------

  /**
   * Make an HTTP request through the Elysia app.
   *
   * Automatically includes:
   * - Session cookie from the cookie jar
   * - X-Tenant-ID header
   * - Idempotency-Key for mutations
   * - X-CSRF-Token for mutations (if a session is available)
   * - Content-Type: application/json
   *
   * Returns a parsed ApiResponse with both `body` and `data` properties
   * (aliased for backward compatibility).
   */
  async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    options: TestRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.query);
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Auth cookie
    if (!options.skipAuth) {
      const cookieHeader = this.cookieJar.toCookieHeader();
      if (cookieHeader) {
        headers["Cookie"] = cookieHeader;
      } else if (this._rawAuthCookie) {
        headers["Cookie"] = this._rawAuthCookie;
      }
    }

    // Tenant header
    if (!options.skipTenantHeader && this.tenantId) {
      headers["X-Tenant-ID"] = options.tenantId ?? this.tenantId;
    }

    // Idempotency key for mutations
    if (isMutation && this.includeIdempotencyKey && !options.skipIdempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey ?? crypto.randomUUID();
    }

    // CSRF token for mutations
    if (isMutation && this.includeCsrf && !options.skipCsrf && this.sessionId) {
      const csrfToken = await generateCsrfToken(this.sessionId);
      headers["X-CSRF-Token"] = csrfToken;
    }

    // Merge user-supplied headers (after defaults, so they can override)
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const request = new Request(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const response = await this.app.handle(request);

    // Absorb any Set-Cookie headers from the response
    this.cookieJar.absorb(response);

    // Parse response body
    const parsedBody = await this.parseResponse<T>(response);

    return {
      status: response.status,
      headers: response.headers,
      body: parsedBody,
      data: parsedBody,
      raw: response,
    };
  }

  /**
   * Parse response body as JSON or text.
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("Content-Type");
    try {
      if (contentType?.includes("application/json")) {
        return (await response.clone().json()) as T;
      }
      return (await response.clone().text()) as unknown as T;
    } catch {
      return undefined as unknown as T;
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP method shortcuts
  // ---------------------------------------------------------------------------

  /** Send a GET request. */
  async get<T = unknown>(
    path: string,
    options?: TestRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  /** Send a POST request with a JSON body. */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: TestRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  /** Send a PUT request with a JSON body. */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: TestRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  /** Send a PATCH request with a JSON body. */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: TestRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  /** Send a DELETE request. */
  async delete<T = unknown>(
    path: string,
    options?: TestRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  // ---------------------------------------------------------------------------
  // Authentication helpers
  // ---------------------------------------------------------------------------

  /**
   * Sign in via Better Auth's email/password endpoint.
   * Updates the cookie jar with the session token.
   *
   * @param email - User email
   * @param password - User password
   * @returns The sign-in Response
   * @throws Error if sign-in fails
   */
  async login(email: string, password: string): Promise<Response> {
    const response = await this.app.handle(
      new Request(`${this.baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
    );

    if (response.status !== 200) {
      const text = await response.clone().text().catch(() => "");
      throw new Error(
        `TestApiClient sign-in failed (status ${response.status}): ${text}`
      );
    }

    // Absorb session cookie
    this.cookieJar.absorb(response);

    // Extract session ID from the response body for CSRF token generation
    try {
      const body = (await response.clone().json()) as {
        session?: { id?: string };
      };
      if (body?.session?.id) {
        this.sessionId = body.session.id;
      }
    } catch {
      // Session ID extraction is best-effort; CSRF will be skipped if unavailable.
    }

    return response;
  }

  /**
   * Sign out the current session.
   * Clears the cookie jar and session ID.
   */
  async logout(): Promise<Response> {
    const response = await this.post("/api/auth/sign-out", undefined, {
      skipCsrf: true,
      skipTenantHeader: true,
      skipIdempotencyKey: true,
    });
    this.cookieJar.clear();
    this.sessionId = null;
    this._rawAuthCookie = null;
    return response;
  }

  /**
   * Clean up resources.
   * Clears cookies and session state. Safe to call multiple times.
   */
  async cleanup(): Promise<void> {
    this.cookieJar.clear();
    this.sessionId = null;
    this._rawAuthCookie = null;
  }
}

// =============================================================================
// Convenience factory functions
// =============================================================================

/**
 * Create an authenticated TestApiClient.
 *
 * Convenience function that wraps TestApiClient.authenticated().
 * Accepts the app, database, tenant, and user objects directly.
 *
 * @example
 * ```ts
 * const client = await createAuthenticatedClient(app, db, tenant, user);
 * const res = await client.get("/api/v1/hr/employees");
 * expectSuccess(res);
 * await client.cleanup();
 * ```
 */
export async function createAuthenticatedClient(
  app: TestApp,
  db: ReturnType<typeof import("postgres").default>,
  tenant: TestTenant,
  user: TestUser,
  options?: Partial<Pick<AuthenticatedClientOptions, "userPassword" | "baseUrl" | "includeCsrf" | "includeIdempotencyKey" | "skipLogin">>
): Promise<TestApiClient> {
  return TestApiClient.authenticated(app, {
    db,
    tenantId: tenant.id,
    userId: user.id,
    userEmail: user.email,
    ...options,
  });
}

/**
 * Authenticate a test user and get session cookie string.
 *
 * Low-level helper for tests that need the raw cookie string
 * rather than a full client. Prefer createAuthenticatedClient() or
 * TestApiClient.authenticated() for most use cases.
 */
export async function authenticateTestUser(
  app: TestApp,
  email: string,
  password: string = "TestPassword123!"
): Promise<string> {
  const response = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );

  const setCookie = response.headers.get("Set-Cookie");
  if (!setCookie) {
    throw new Error("No session cookie returned from authentication");
  }

  return setCookie;
}

// =============================================================================
// Request Builders (low-level, for tests that need raw Request objects)
// =============================================================================

/**
 * Build a request with authentication.
 */
export function buildAuthenticatedRequest(
  url: string,
  method: string,
  authCookie: string,
  body?: unknown,
  additionalHeaders?: Record<string, string>
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: authCookie,
    ...additionalHeaders,
  };

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers["Idempotency-Key"] = crypto.randomUUID();
  }

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Build request with specific tenant context.
 */
export function buildTenantRequest(
  url: string,
  method: string,
  tenantId: string,
  authCookie: string,
  body?: unknown
): Request {
  return buildAuthenticatedRequest(url, method, authCookie, body, {
    "X-Tenant-ID": tenantId,
  });
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Assert response is successful (2xx) using ApiResponse format.
 */
export function assertSuccess(response: ApiResponse): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Expected success response but got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

/**
 * Assert response is an error with specific code using ApiResponse format.
 */
export function assertError(
  response: ApiResponse<ErrorResponse>,
  expectedStatus: number,
  expectedCode?: string
): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }

  if (expectedCode && response.body.error?.code !== expectedCode) {
    throw new Error(
      `Expected error code ${expectedCode} but got ${response.body.error?.code}`
    );
  }
}

/**
 * Assert response has pagination using ApiResponse format.
 */
export function assertPaginated<T>(
  response: ApiResponse<PaginatedResponse<T>>
): void {
  if (!Array.isArray(response.body.items)) {
    throw new Error("Expected paginated response with items array");
  }

  if (typeof response.body.hasMore !== "boolean") {
    throw new Error("Expected paginated response with hasMore boolean");
  }
}

/**
 * Assert that the response indicates success (2xx status).
 * Works with both ApiResponse and plain { status, body } objects.
 */
export function expectSuccess(
  response: { status: number; [key: string]: unknown }
): void {
  if (response.status < 200 || response.status >= 300) {
    const body = (response as Record<string, unknown>).body;
    throw new Error(
      `Expected success (2xx) but got ${response.status}${body ? ": " + JSON.stringify(body) : ""}`
    );
  }
}

/**
 * Assert that the response is an error with the expected code and optional status.
 * Works with both ApiResponse and plain { status, body } objects.
 * Returns the error body for further assertions.
 */
export function expectError(
  response: { status: number; body?: Record<string, unknown>; [key: string]: unknown },
  expectedCode: string,
  expectedStatus?: number
): { error: { code: string; message: string } } {
  const body = (response as Record<string, unknown>).body as Record<string, unknown> | undefined;
  const error = body?.error as { code: string; message: string } | undefined;

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}`
    );
  }

  if (!error || error.code !== expectedCode) {
    throw new Error(
      `Expected error code ${expectedCode} but got ${error?.code ?? "undefined"}`
    );
  }

  return { error };
}

/**
 * Assert that the response is a paginated list (200 status with items array).
 * Works with both ApiResponse and plain { status, body } objects.
 * Returns the paginated data for further assertions.
 */
export function expectPaginated(
  response: { status: number; body?: Record<string, unknown>; [key: string]: unknown }
): { items: unknown[]; hasMore: boolean; nextCursor: string | null } {
  if (response.status !== 200) {
    throw new Error(`Expected 200 but got ${response.status}`);
  }

  const body = (response as Record<string, unknown>).body as Record<string, unknown>;
  return {
    items: body.items as unknown[],
    hasMore: body.hasMore as boolean,
    nextCursor: (body.nextCursor as string) ?? null,
  };
}

/**
 * Assert that the response has a specific status code.
 */
export function expectStatus(
  response: { status: number; [key: string]: unknown },
  expected: number
): void {
  if (response.status !== expected) {
    throw new Error(
      `Expected status ${expected} but got ${response.status}`
    );
  }
}

/**
 * Assert that the response body contains the expected key-value pairs.
 */
export function expectBodyContains(
  response: { status: number; body?: Record<string, unknown>; [key: string]: unknown },
  expected: Record<string, unknown>
): void {
  const body = (response as Record<string, unknown>).body as Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(expected)) {
    if (body?.[key] !== value) {
      throw new Error(
        `Expected body.${key} to be ${JSON.stringify(value)} but got ${JSON.stringify(body?.[key])}`
      );
    }
  }
}

/**
 * Parse a JSON response body from a raw Response.
 * Clones the response internally so the original can still be read.
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<T> {
  return (await response.clone().json()) as T;
}

/**
 * Assert that a raw Response has a specific status and return the parsed JSON body.
 * Throws a descriptive error if the status does not match.
 */
export async function expectJsonResponse<T = unknown>(
  response: Response,
  expectedStatus: number
): Promise<T> {
  if (response.status !== expectedStatus) {
    let bodyText = "";
    try {
      bodyText = await response.clone().text();
    } catch {
      // ignore
    }
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}. Body: ${bodyText}`
    );
  }
  return (await response.clone().json()) as T;
}
