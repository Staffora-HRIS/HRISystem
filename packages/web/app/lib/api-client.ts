/**
 * API Client for HRIS Platform
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

// Request configuration type
interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
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
 */
function getApiBaseUrl(): string {
  // Check for environment variable first
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
    const fullUrl = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

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
   * Make an HTTP request
   */
  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { params, timeout = 30000, ...fetchConfig } = config;

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

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    requestConfig.signal = controller.signal;

    try {
      let response = await fetch(url, requestConfig);
      clearTimeout(timeoutId);

      // Run response interceptors
      for (const interceptor of this.responseInterceptors) {
        response = await interceptor(response);
      }

      if (!response.ok) {
        let errorData: { code: string; message: string; details?: Record<string, unknown> };

        try {
          errorData = await response.json();
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

      throw new ApiError({
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network error occurred",
        status: 0,
      });
    }
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
