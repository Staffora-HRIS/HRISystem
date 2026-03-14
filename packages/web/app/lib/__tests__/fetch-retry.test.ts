/**
 * Tests for fetchWithRetry, shouldRetry, and getRetryDelay (TODO-109)
 *
 * Verifies:
 * - Retries on 429, 502, 503, 504
 * - Does NOT retry on other 4xx/5xx status codes
 * - Respects Retry-After header
 * - Uses exponential backoff (1s, 2s, 4s)
 * - Does NOT retry non-idempotent mutations (missing Idempotency-Key)
 * - Retries idempotent mutations (with Idempotency-Key)
 * - Always retries safe methods (GET, HEAD, OPTIONS)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithRetry,
  shouldRetry,
  getRetryDelay,
  RETRYABLE_STATUS_CODES,
  MAX_RETRIES,
  BASE_DELAY_MS,
} from "../api-client";

// Helper: create a minimal Response-like object
function mockResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    statusText: `Status ${status}`,
  } as unknown as Response;
}

describe("shouldRetry", () => {
  it("returns true for retryable status codes with GET method", () => {
    for (const status of [429, 502, 503, 504]) {
      const response = mockResponse(status);
      expect(shouldRetry(response, "GET", new Headers())).toBe(true);
    }
  });

  it("returns false for non-retryable status codes", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 500]) {
      const response = mockResponse(status);
      expect(shouldRetry(response, "GET", new Headers())).toBe(false);
    }
  });

  it("returns false for mutating methods without Idempotency-Key", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = mockResponse(429);
      expect(shouldRetry(response, method, new Headers())).toBe(false);
    }
  });

  it("returns true for mutating methods WITH Idempotency-Key", () => {
    const headers = new Headers({ "Idempotency-Key": "test-key-123" });
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = mockResponse(503);
      expect(shouldRetry(response, method, headers)).toBe(true);
    }
  });

  it("returns true for safe methods without Idempotency-Key", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const response = mockResponse(502);
      expect(shouldRetry(response, method, new Headers())).toBe(true);
    }
  });
});

describe("getRetryDelay", () => {
  it("returns exponential backoff when no Retry-After header", () => {
    const response = mockResponse(503);
    expect(getRetryDelay(response, 0)).toBe(BASE_DELAY_MS); // 1000
    expect(getRetryDelay(response, 1)).toBe(BASE_DELAY_MS * 2); // 2000
    expect(getRetryDelay(response, 2)).toBe(BASE_DELAY_MS * 4); // 4000
  });

  it("respects Retry-After header (in seconds)", () => {
    const response = mockResponse(429, { "Retry-After": "5" });
    expect(getRetryDelay(response, 0)).toBe(5000);
    expect(getRetryDelay(response, 2)).toBe(5000); // ignores attempt number
  });

  it("falls back to exponential backoff when Retry-After is invalid", () => {
    const response = mockResponse(429, { "Retry-After": "not-a-number" });
    expect(getRetryDelay(response, 0)).toBe(BASE_DELAY_MS);
  });

  it("falls back to exponential backoff when Retry-After is zero or negative", () => {
    const zeroResponse = mockResponse(429, { "Retry-After": "0" });
    expect(getRetryDelay(zeroResponse, 1)).toBe(BASE_DELAY_MS * 2);

    const negativeResponse = mockResponse(429, { "Retry-After": "-1" });
    expect(getRetryDelay(negativeResponse, 1)).toBe(BASE_DELAY_MS * 2);
  });
});

describe("fetchWithRetry", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Helper to advance timers through setTimeout-based delays.
   * fetchWithRetry uses `await new Promise(resolve => setTimeout(resolve, delay))`
   * so we need to flush microtasks + advance timers in the right order.
   */
  async function flushRetryDelay(): Promise<void> {
    // Advance timers to trigger the setTimeout, then flush microtasks
    await vi.advanceTimersByTimeAsync(BASE_DELAY_MS * 10);
  }

  it("returns response immediately on success (no retries)", async () => {
    const okResponse = mockResponse(200);
    fetchSpy.mockResolvedValueOnce(okResponse);

    const result = await fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    expect(result).toBe(okResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns response immediately on non-retryable error (e.g. 400)", async () => {
    const badRequest = mockResponse(400);
    fetchSpy.mockResolvedValueOnce(badRequest);

    const result = await fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    expect(result).toBe(badRequest);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 for GET and returns success on second attempt", async () => {
    const failResponse = mockResponse(503);
    const okResponse = mockResponse(200);
    fetchSpy.mockResolvedValueOnce(failResponse).mockResolvedValueOnce(okResponse);

    const resultPromise = fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    // First call returns 503, then we need to wait for the delay
    await flushRetryDelay();
    const result = await resultPromise;

    expect(result).toBe(okResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries up to MAX_RETRIES times then returns the last failed response", async () => {
    const failResponse = mockResponse(502);
    fetchSpy.mockResolvedValue(failResponse);

    const resultPromise = fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    // Flush all retry delays
    for (let i = 0; i < MAX_RETRIES; i++) {
      await flushRetryDelay();
    }

    const result = await resultPromise;
    expect(result.status).toBe(502);
    // 1 initial + MAX_RETRIES retries = MAX_RETRIES + 1 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it("does NOT retry POST without Idempotency-Key on 503", async () => {
    const failResponse = mockResponse(503);
    fetchSpy.mockResolvedValueOnce(failResponse);

    const result = await fetchWithRetry("http://test.com/api", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    expect(result.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries POST with Idempotency-Key on 503", async () => {
    const failResponse = mockResponse(503);
    const okResponse = mockResponse(200);
    fetchSpy.mockResolvedValueOnce(failResponse).mockResolvedValueOnce(okResponse);

    const resultPromise = fetchWithRetry("http://test.com/api", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "Idempotency-Key": "test-key-abc",
      }),
    });

    await flushRetryDelay();
    const result = await resultPromise;

    expect(result).toBe(okResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 for GET requests", async () => {
    const rateLimited = mockResponse(429, { "Retry-After": "1" });
    const okResponse = mockResponse(200);
    fetchSpy.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(okResponse);

    const resultPromise = fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    await flushRetryDelay();
    const result = await resultPromise;

    expect(result).toBe(okResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 401", async () => {
    const unauthorized = mockResponse(401);
    fetchSpy.mockResolvedValueOnce(unauthorized);

    const result = await fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    expect(result.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 500", async () => {
    const serverError = mockResponse(500);
    fetchSpy.mockResolvedValueOnce(serverError);

    const result = await fetchWithRetry("http://test.com/api", {
      method: "GET",
    });

    expect(result.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("honors custom retries count", async () => {
    const failResponse = mockResponse(504);
    fetchSpy.mockResolvedValue(failResponse);

    const resultPromise = fetchWithRetry(
      "http://test.com/api",
      { method: "GET" },
      1, // only 1 retry
    );

    await flushRetryDelay();
    const result = await resultPromise;

    expect(result.status).toBe(504);
    // 1 initial + 1 retry = 2 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries DELETE with Idempotency-Key on 429", async () => {
    const rateLimited = mockResponse(429);
    const okResponse = mockResponse(200);
    fetchSpy.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(okResponse);

    const resultPromise = fetchWithRetry("http://test.com/api", {
      method: "DELETE",
      headers: new Headers({ "Idempotency-Key": "del-key-123" }),
    });

    await flushRetryDelay();
    const result = await resultPromise;

    expect(result).toBe(okResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry DELETE without Idempotency-Key on 429", async () => {
    const rateLimited = mockResponse(429);
    fetchSpy.mockResolvedValueOnce(rateLimited);

    const result = await fetchWithRetry("http://test.com/api", {
      method: "DELETE",
    });

    expect(result.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("defaults to GET when no method is specified", async () => {
    const failResponse = mockResponse(502);
    const okResponse = mockResponse(200);
    fetchSpy.mockResolvedValueOnce(failResponse).mockResolvedValueOnce(okResponse);

    const resultPromise = fetchWithRetry("http://test.com/api", {});

    await flushRetryDelay();
    const result = await resultPromise;

    expect(result).toBe(okResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("constants", () => {
  it("RETRYABLE_STATUS_CODES contains exactly 429, 502, 503, 504", () => {
    expect(RETRYABLE_STATUS_CODES).toEqual(new Set([429, 502, 503, 504]));
  });

  it("MAX_RETRIES is 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it("BASE_DELAY_MS is 1000", () => {
    expect(BASE_DELAY_MS).toBe(1000);
  });
});
