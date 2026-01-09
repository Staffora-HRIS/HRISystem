/**
 * Test API Client
 *
 * HTTP client wrapper for testing API routes.
 * Provides authentication helpers and request utilities.
 */

import type { TestContext } from "../setup";

// =============================================================================
// Types
// =============================================================================

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
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

// =============================================================================
// API Client
// =============================================================================

/**
 * Test API client for making HTTP requests to the app
 */
export class TestApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private authCookie: string | null = null;

  constructor(
    private app: { handle: (request: Request) => Promise<Response> },
    baseUrl: string = "http://localhost"
  ) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  /**
   * Set authentication cookie for requests
   */
  setAuthCookie(cookie: string): void {
    this.authCookie = cookie;
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.authCookie = null;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
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

  /**
   * Make a request to the API
   */
  async request<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { method = "GET", headers = {}, body, query } = options;

    const url = this.buildUrl(path, query);
    const requestHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...headers,
    };

    if (this.authCookie) {
      requestHeaders["Cookie"] = this.authCookie;
    }

    const request = new Request(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const response = await this.app.handle(request);
    const data = await this.parseResponse<T>(response);

    return {
      status: response.status,
      headers: response.headers,
      data,
      raw: response,
    };
  }

  /**
   * Parse response body
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("Content-Type");

    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  }

  // ===========================================================================
  // HTTP Method Shortcuts
  // ===========================================================================

  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: "GET", query, headers });
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const requestHeaders = {
      ...headers,
      "Idempotency-Key": crypto.randomUUID(),
    };
    return this.request<T>(path, { method: "POST", body, headers: requestHeaders });
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const requestHeaders = {
      ...headers,
      "Idempotency-Key": crypto.randomUUID(),
    };
    return this.request<T>(path, { method: "PUT", body, headers: requestHeaders });
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const requestHeaders = {
      ...headers,
      "Idempotency-Key": crypto.randomUUID(),
    };
    return this.request<T>(path, { method: "PATCH", body, headers: requestHeaders });
  }

  async delete<T = unknown>(
    path: string,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const requestHeaders = {
      ...headers,
      "Idempotency-Key": crypto.randomUUID(),
    };
    return this.request<T>(path, { method: "DELETE", headers: requestHeaders });
  }
}

// =============================================================================
// Authentication Helpers
// =============================================================================

/**
 * Authenticate a test user and get session cookie
 */
export async function authenticateTestUser(
  app: { handle: (request: Request) => Promise<Response> },
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

/**
 * Create authenticated API client from test context
 */
export async function createAuthenticatedClient(
  app: { handle: (request: Request) => Promise<Response> },
  ctx: TestContext
): Promise<TestApiClient> {
  const client = new TestApiClient(app);

  // For integration tests, we may need to create a proper session
  // This is a simplified version - actual implementation depends on auth setup
  const cookie = `better-auth.session_token=test-session-${ctx.user.id}`;
  client.setAuthCookie(cookie);

  return client;
}

// =============================================================================
// Request Builders
// =============================================================================

/**
 * Build a request with authentication
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
 * Build request with specific tenant context
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
 * Assert response is successful (2xx)
 */
export function assertSuccess(response: ApiResponse): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Expected success response but got ${response.status}: ${JSON.stringify(response.data)}`
    );
  }
}

/**
 * Assert response is an error with specific code
 */
export function assertError(
  response: ApiResponse<ErrorResponse>,
  expectedStatus: number,
  expectedCode?: string
): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}: ${JSON.stringify(response.data)}`
    );
  }

  if (expectedCode && response.data.error?.code !== expectedCode) {
    throw new Error(
      `Expected error code ${expectedCode} but got ${response.data.error?.code}`
    );
  }
}

/**
 * Assert response has pagination
 */
export function assertPaginated<T>(
  response: ApiResponse<PaginatedResponse<T>>
): void {
  if (!Array.isArray(response.data.items)) {
    throw new Error("Expected paginated response with items array");
  }

  if (typeof response.data.hasMore !== "boolean") {
    throw new Error("Expected paginated response with hasMore boolean");
  }
}
