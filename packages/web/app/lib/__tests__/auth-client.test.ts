/**
 * Auth Client Tests
 *
 * These tests ensure the Better Auth client is correctly configured
 * and prevent 405 Method Not Allowed errors caused by incorrect baseURL.
 *
 * ROOT CAUSE OF 405 ERROR:
 * When baseURL is empty string "", requests go to the frontend origin
 * instead of the API server, causing 405 errors because the frontend
 * doesn't have /api/auth/* routes.
 */

import { describe, it, expect, afterEach } from "vitest";

describe("getBaseURL function", () => {
  // Store original import.meta.env
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original env
    Object.keys(import.meta.env).forEach((key) => {
      delete import.meta.env[key];
    });
    Object.assign(import.meta.env, originalEnv);
  });

  it("should NEVER return empty string - this would cause 405 errors", async () => {
    // Set VITE_API_URL to empty string
    import.meta.env.VITE_API_URL = "";

    // Re-import to get fresh module with new env
    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    // The baseURL should NEVER be empty
    // Empty baseURL causes requests to go to frontend origin -> 405 error
    expect(result).not.toBe("");
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it("should default to localhost:3000 when VITE_API_URL is not set", async () => {
    // Clear VITE_API_URL
    delete import.meta.env.VITE_API_URL;

    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    expect(result).toBe("http://localhost:3000");
  });

  it("should use VITE_API_URL when set", async () => {
    import.meta.env.VITE_API_URL = "https://api.example.com";

    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    expect(result).toBe("https://api.example.com");
  });

  it("should trim whitespace from VITE_API_URL", async () => {
    import.meta.env.VITE_API_URL = "  https://api.example.com  ";

    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    expect(result).toBe("https://api.example.com");
  });

  it("should NOT use whitespace-only VITE_API_URL", async () => {
    import.meta.env.VITE_API_URL = "   ";

    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    // Whitespace-only should fall back to default
    expect(result).toBe("http://localhost:3000");
  });

  it("should return a valid URL that can be used for API requests", async () => {
    delete import.meta.env.VITE_API_URL;

    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    // Should be a valid URL
    expect(() => new URL(result)).not.toThrow();

    // Should be http or https
    const url = new URL(result);
    expect(["http:", "https:"]).toContain(url.protocol);
  });
});

/**
 * Integration test to verify the fix prevents 405 errors
 */
describe("405 Error Prevention", () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original env
    Object.keys(import.meta.env).forEach((key) => {
      delete import.meta.env[key];
    });
    Object.assign(import.meta.env, originalEnv);
  });

  it("should NOT make requests to frontend origin (which causes 405)", async () => {
    // Simulate missing env var
    delete import.meta.env.VITE_API_URL;

    const { getBaseURL } = await import("../auth-client");
    const result = getBaseURL();

    // The baseURL should point to API server, NOT frontend
    // Frontend origin would be like "http://localhost:5173" in dev
    // API server is "http://localhost:3000"
    expect(result).not.toBe("");
    expect(result).toContain("3000"); // API port
    expect(result).not.toContain("5173"); // Frontend port
  });

  it("should return URL with port 3000 when VITE_API_URL is not set", async () => {
    delete import.meta.env.VITE_API_URL;
    const { getBaseURL } = await import("../auth-client");
    expect(getBaseURL()).toContain("localhost:3000");
  });

  it("should return custom API URL when VITE_API_URL is set", async () => {
    import.meta.env.VITE_API_URL = "https://api.production.com";
    const { getBaseURL } = await import("../auth-client");
    expect(getBaseURL()).toBe("https://api.production.com");
  });
});
