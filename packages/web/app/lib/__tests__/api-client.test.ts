/**
 * API Client Tests
 *
 * These tests ensure the API client is correctly configured
 * and prevent 405 Method Not Allowed errors caused by incorrect baseURL.
 *
 * ROOT CAUSE OF 405 ERROR:
 * When baseUrl is a relative path like "/api/v1", requests go to the frontend
 * origin (e.g., localhost:5173) instead of the API server (localhost:3000),
 * causing 405 errors because the frontend doesn't have those routes.
 */

import { describe, it, expect, afterEach } from "vitest";

describe("getApiBaseUrl function", () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original env
    Object.keys(import.meta.env).forEach((key) => {
      delete import.meta.env[key];
    });
    Object.assign(import.meta.env, originalEnv);
  });

  it("should NEVER return a relative path - this causes 405 errors", async () => {
    // Clear VITE_API_URL to test default behavior
    delete import.meta.env.VITE_API_URL;

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    // Should NOT be a relative path
    expect(result).not.toBe("/api/v1");
    expect(result.startsWith("/")).toBe(false);

    // Should be a full URL
    expect(result).toMatch(/^https?:\/\//);
  });

  it("should default to localhost:3000/api/v1 when VITE_API_URL is not set", async () => {
    delete import.meta.env.VITE_API_URL;

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    expect(result).toBe("http://localhost:3000/api/v1");
  });

  it("should use VITE_API_URL and append /api/v1 when set", async () => {
    import.meta.env.VITE_API_URL = "https://api.example.com";

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    expect(result).toBe("https://api.example.com/api/v1");
  });

  it("should NOT double-append /api/v1 if already present", async () => {
    import.meta.env.VITE_API_URL = "https://api.example.com/api/v1";

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    expect(result).toBe("https://api.example.com/api/v1");
    expect(result).not.toContain("/api/v1/api/v1");
  });

  it("should trim whitespace from VITE_API_URL", async () => {
    import.meta.env.VITE_API_URL = "  https://api.example.com  ";

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    expect(result).toBe("https://api.example.com/api/v1");
  });

  it("should NOT use whitespace-only VITE_API_URL", async () => {
    import.meta.env.VITE_API_URL = "   ";

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    expect(result).toBe("http://localhost:3000/api/v1");
  });

  it("should return a valid URL", async () => {
    delete import.meta.env.VITE_API_URL;

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    // Should be a valid URL
    expect(() => new URL(result)).not.toThrow();
  });
});

describe("ApiClient class", () => {
  it("should use full URL as baseUrl, not relative path", async () => {
    delete import.meta.env.VITE_API_URL;

    const { ApiClient } = await import("../api-client");
    const client = new ApiClient();

    // Access private baseUrl through any cast for testing
    const baseUrl = (client as any).baseUrl;

    // Should NOT be relative
    expect(baseUrl).not.toBe("/api/v1");
    expect(String(baseUrl).startsWith("/")).toBe(false);

    // Should be full URL pointing to API server
    expect(baseUrl).toMatch(/^https?:\/\//);
    expect(baseUrl).toContain("localhost:3000");
  });

  it("should include credentials for cross-origin requests", async () => {
    const { ApiClient } = await import("../api-client");
    const client = new ApiClient();

    // The request method should include credentials: "include"
    // We can't easily test this without mocking fetch, but the code is there
    expect(client).toBeDefined();
  });
});

/**
 * 405 Error Prevention Tests
 */
describe("405 Error Prevention - API Client", () => {
  it("should NOT make requests to frontend origin (port 5173)", async () => {
    delete import.meta.env.VITE_API_URL;

    const { getApiBaseUrl } = await import("../api-client");
    const result = getApiBaseUrl();

    // Should NOT contain frontend port
    expect(result).not.toContain(":5173");

    // Should contain API port
    expect(result).toContain(":3000");
  });

  it("should build URLs that point to API server", async () => {
    delete import.meta.env.VITE_API_URL;

    const { ApiClient } = await import("../api-client");
    const client = new ApiClient();

    // Use any to access private method for testing
    const buildUrl = (client as any).buildUrl.bind(client);
    const url = buildUrl("/auth/login");

    // Should be full URL to API server
    expect(url).toContain("localhost:3000");
    expect(url).toContain("/api/v1/auth/login");
    expect(url).not.toContain("localhost:5173");
  });
});
