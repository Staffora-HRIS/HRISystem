/**
 * API Client for Staffora
 *
 * Features:
 * - Automatic tenant header injection
 * - Idempotency key generation for mutations
 * - Error handling with typed errors
 * - Request/response interceptors
 */

// API Error class for typed error handling
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(response: {
    code: string;
    message: string;
    status?: number;
    details?: Record<string, unknown>;
  }) {
    super(response.message);
    this.name = "ApiError";
    this.code = response.code;
    this.status = response.status ?? 500;
    this.details = response.details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidationError(): boolean {
    return this.status === 422 || this.code === "VALIDATION_ERROR";
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

// Retry configuration
interface RetryConfig {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 500) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number;
  /** HTTP status codes that trigger a retry (default: [429, 502, 503]) */
  retryableStatuses?: number[];
}

// Request configuration type
interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
  /** Override retry behaviour for this request. Set to false to disable retries. */
  retry?: RetryConfig | false;
}

// Response types
interface ApiResponse<T> {
  data: T;
  meta?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

// Pagination types
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

// Request interceptor type
type RequestInterceptor = (
  url: string,
  config: RequestInit
) => { url: string; config: RequestInit } | Promise<{ url: string; config: RequestInit }>;

// Response interceptor type
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

// Error interceptor type
type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;

/**
 * Get the API base URL from environment or default
 *
 * FIX: Always return a full URL pointing to the API server.
 * Relative URLs like "/api/v1" cause requests to go to the frontend origin,
 * resulting in 405 Method Not Allowed errors.
 *
 * For server-side rendering (SSR) in Docker, we need to use the Docker
 * internal hostname (staffora-api) instead of localhost.
 */
function getApiBaseUrl(): string {
  // Check if we're running server-side (SSR)
  const isServer = typeof window === "undefined";

  // Server-side: Check for internal API URL first (Docker networking)
  if (isServer) {
    const internalUrl = process.env.INTERNAL_API_URL;
    if (internalUrl && internalUrl.trim() !== "") {
      const baseUrl = internalUrl.trim();
      return baseUrl.endsWith("/api/v1") ? baseUrl : `${baseUrl}/api/v1`;
    }
  }

  // Client-side or fallback: Use VITE_API_URL
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    // Append /api/v1 if the env URL doesn't already include it
    const baseUrl = envUrl.trim();
    return baseUrl.endsWith("/api/v1") ? baseUrl : `${baseUrl}/api/v1`;
  }

  // Default to localhost:3000 for development
  // This ensures requests go to the API server, not the frontend
  return "http://localhost:3000/api/v1";
}

/** Default retry configuration */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 500,
  maxDelay: 10_000,
  retryableStatuses: [429, 502, 503],
};

/**
 * Parse a Retry-After header value into milliseconds.
 * Supports both integer seconds ("120") and HTTP-date format.
 * Returns null if the header is missing or unparseable.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  // Integer seconds
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  // HTTP-date
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : 0;
  }

  return null;
}

/**
 * Calculate the delay for an exponential back-off retry attempt.
 * Adds jitter (0-25% of the computed delay) to avoid thundering herd.
 */
function calculateBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const clamped = Math.min(exponentialDelay, maxDelay);
  // Add jitter: random 0-25% of clamped delay
  const jitter = clamped * 0.25 * Math.random();
  return clamped + jitter;
}

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private tenantId: string | null = null;

  constructor(baseUrl: string = getApiBaseUrl()) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Set the current tenant ID for all requests
   */
  setTenantId(tenantId: string | null): void {
    this.tenantId = tenantId;
  }

  /**
   * Get the current tenant ID
   */
  getTenantId(): string | null {
    return this.tenantId;
  }

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Generate a unique idempotency key
   */
  private generateIdempotencyKey(): string {
    return crypto.randomUUID();
  }

  /**
   * Build URL with query parameters
   *
   * FIX: Use baseUrl directly without window.location.origin fallback.
   * The baseUrl is now always a full URL (e.g., http://localhost:3000/api/v1)
   * so we don't need the origin fallback which caused 405 errors.
   */
  private buildUrl(endpoint: string, params?: RequestConfig["params"]): string {
    // If endpoint is already a full URL, use it directly
    // Otherwise, append to baseUrl
    if (endpoint.startsWith("http")) {
      const url = new URL(endpoint);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
          }
        });
      }
      return url.toString();
    }

    // Defensive normalization:
    // - this.baseUrl already includes `/api/v1`
    // - some call sites historically passed `/api/v1/...` which produced `/api/v1/api/v1/...`
    const apiPrefix = "/api/v1";
    const apiPrefixNoLeadingSlash = "api/v1";
    let normalizedEndpoint = endpoint;

    if (normalizedEndpoint === apiPrefix) {
      normalizedEndpoint = "";
    } else if (normalizedEndpoint.startsWith(`${apiPrefix}/`)) {
      normalizedEndpoint = normalizedEndpoint.slice(apiPrefix.length);
    } else if (normalizedEndpoint === apiPrefixNoLeadingSlash) {
      normalizedEndpoint = "";
    } else if (normalizedEndpoint.startsWith(`${apiPrefixNoLeadingSlash}/`)) {
      normalizedEndpoint = normalizedEndpoint.slice(apiPrefixNoLeadingSlash.length);
    }

    if (normalizedEndpoint !== "" && !normalizedEndpoint.startsWith("/")) {
      normalizedEndpoint = `/${normalizedEndpoint}`;
    }

    const fullUrl = `${this.baseUrl}${normalizedEndpoint}`;

    const url = new URL(fullUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Build headers with tenant injection
   */
  private buildHeaders(customHeaders?: HeadersInit): Headers {
    const headers = new Headers(this.defaultHeaders);

    // Inject tenant ID if available
    if (this.tenantId) {
      headers.set("X-Tenant-ID", this.tenantId);
    }

    // Add custom headers
    if (customHeaders) {
      const customHeadersObj =
        customHeaders instanceof Headers
          ? Object.fromEntries(customHeaders.entries())
          : Array.isArray(customHeaders)
            ? Object.fromEntries(customHeaders)
            : customHeaders;

      Object.entries(customHeadersObj).forEach(([key, value]) => {
        if (value) {
          headers.set(key, value);
        }
      });
    }

    return headers;
  }

  /**
   * Make an HTTP request with automatic retry for transient failures.
   *
   * Retries are triggered for 429 (Too Many Requests), 502 (Bad Gateway), and
   * 503 (Service Unavailable) responses. The Retry-After header is respected
   * when present; otherwise exponential back-off with jitter is used.
   * Maximum 3 retries by default.
   */
  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { params, timeout = 30000, retry: retryOption, ...fetchConfig } = config;

    // Resolve retry config: false disables retries entirely
    const retryConfig: Required<RetryConfig> | null =
      retryOption === false
        ? null
        : { ...DEFAULT_RETRY_CONFIG, ...(retryOption ?? {}) };

    let url = this.buildUrl(endpoint, params);
    let requestConfig: RequestInit = {
      ...fetchConfig,
      headers: this.buildHeaders(fetchConfig.headers),
      credentials: "include",
    };

    // Run request interceptors
    for (const interceptor of this.requestInterceptors) {
      const result = await interceptor(url, requestConfig);
      url = result.url;
      requestConfig = result.config;
    }

    const maxAttempts = retryConfig ? retryConfig.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Create abort controller for timeout (fresh per attempt)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const attemptConfig: RequestInit = { ...requestConfig, signal: controller.signal };

      try {
        let response = await fetch(url, attemptConfig);
        clearTimeout(timeoutId);

        // Run response interceptors
        for (const interceptor of this.responseInterceptors) {
          response = await interceptor(response);
        }

        if (!response.ok) {
          // Check if this status code is retryable and we have retries left
          const isRetryable =
            retryConfig !== null &&
            retryConfig.retryableStatuses.includes(response.status) &&
            attempt < retryConfig.maxRetries;

          if (isRetryable) {
            // Determine delay: prefer Retry-After header, fall back to exponential backoff
            const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
            const delayMs =
              retryAfterMs !== null
                ? Math.min(retryAfterMs, retryConfig.maxDelay)
                : calculateBackoff(attempt, retryConfig.baseDelay, retryConfig.maxDelay);

            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue; // retry
          }

          let errorData: { code: string; message: string; details?: Record<string, unknown> };

          try {
            const raw = await response.json();
            // Backend convention: { error: { code, message, requestId, details? } }
            if (
              raw &&
              typeof raw === "object" &&
              "error" in raw &&
              (raw as any).error &&
              typeof (raw as any).error === "object"
            ) {
              const wrapped = (raw as any).error as any;
              errorData = {
                code: String(wrapped.code ?? "UNKNOWN_ERROR"),
                message: String((wrapped.message ?? response.statusText) || "An unexpected error occurred"),
                details:
                  wrapped.details && typeof wrapped.details === "object" ? (wrapped.details as Record<string, unknown>) : undefined,
              };
            } else if (raw && typeof raw === "object" && "code" in raw && "message" in raw) {
              errorData = {
                code: String((raw as any).code ?? "UNKNOWN_ERROR"),
                message: String((((raw as any).message as unknown) ?? response.statusText) || "An unexpected error occurred"),
                details:
                  (raw as any).details && typeof (raw as any).details === "object"
                    ? ((raw as any).details as Record<string, unknown>)
                    : undefined,
              };
            } else {
              errorData = {
                code: "UNKNOWN_ERROR",
                message: response.statusText || "An unexpected error occurred",
              };
            }
          } catch {
            errorData = {
              code: "UNKNOWN_ERROR",
              message: response.statusText || "An unexpected error occurred",
            };
          }

          let error = new ApiError({
            ...errorData,
            status: response.status,
          });

          // Run error interceptors
          for (const interceptor of this.errorInterceptors) {
            error = await interceptor(error);
          }

          throw error;
        }

        // Handle empty responses
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return undefined as T;
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof ApiError) {
          throw error;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ApiError({
            code: "TIMEOUT",
            message: "Request timed out",
            status: 408,
          });
        }

        // Network errors are retryable (e.g., DNS failure, connection refused)
        const isLastAttempt = !retryConfig || attempt >= retryConfig.maxRetries;
        if (!isLastAttempt) {
          const delayMs = calculateBackoff(attempt, retryConfig!.baseDelay, retryConfig!.maxDelay);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue; // retry
        }

        throw new ApiError({
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Network error occurred",
          status: 0,
        });
      }
    }

    // Should not be reached, but TypeScript needs this
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "Request failed after all retry attempts",
      status: 0,
    });
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "GET" });
  }

  /**
   * POST request with idempotency key
   */
  async post<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const headers = new Headers(config?.headers);
    headers.set("Idempotency-Key", this.generateIdempotencyKey());

    return this.request<T>(endpoint, {
      ...config,
      method: "POST",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request with idempotency key
   */
  async put<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const headers = new Headers(config?.headers);
    headers.set("Idempotency-Key", this.generateIdempotencyKey());

    return this.request<T>(endpoint, {
      ...config,
      method: "PUT",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request with idempotency key
   */
  async patch<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const headers = new Headers(config?.headers);
    headers.set("Idempotency-Key", this.generateIdempotencyKey());

    return this.request<T>(endpoint, {
      ...config,
      method: "PATCH",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request with idempotency key
   */
  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const headers = new Headers(config?.headers);
    headers.set("Idempotency-Key", this.generateIdempotencyKey());

    return this.request<T>(endpoint, {
      ...config,
      method: "DELETE",
      headers,
    });
  }

  /**
   * Paginated GET request
   */
  async getPaginated<T>(
    endpoint: string,
    config?: RequestConfig
  ): Promise<PaginatedResponse<T>> {
    return this.get<PaginatedResponse<T>>(endpoint, config);
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing or creating multiple instances
export { ApiClient };

// Export getApiBaseUrl for testing
export { getApiBaseUrl };

// Type helpers for API responses
export type { ApiResponse, RequestConfig };
