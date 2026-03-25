/**
 * Shared configuration for k6 load tests.
 *
 * Environment variables (passed via k6 -e FLAG=value):
 *   BASE_URL        - API base URL (default: http://localhost:3000)
 *   TEST_EMAIL      - Credentials for login (default: admin@staffora.co.uk)
 *   TEST_PASSWORD   - Password (default: changeme123456)
 *   AUTH_TOKEN       - Pre-obtained session token to skip login in non-auth tests
 *   TENANT_ID        - Tenant UUID for X-Tenant-ID header
 *   CSRF_TOKEN       - CSRF token for mutating requests
 */

import http from "k6/http";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
export const TEST_EMAIL = __ENV.TEST_EMAIL || "admin@staffora.co.uk";
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || "changeme123456";
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
export const TENANT_ID = __ENV.TENANT_ID || "";
export const CSRF_TOKEN = __ENV.CSRF_TOKEN || "";

/**
 * Build standard headers for authenticated API requests.
 * @param {string} sessionCookie - The better-auth session cookie value
 * @param {object} extra - Additional headers to merge
 * @returns {object} Headers object
 */
export function buildHeaders(sessionCookie, extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }

  if (TENANT_ID) {
    headers["X-Tenant-ID"] = TENANT_ID;
  }

  if (CSRF_TOKEN) {
    headers["X-CSRF-Token"] = CSRF_TOKEN;
  }

  return Object.assign(headers, extra);
}

/**
 * Build headers for mutating requests that require an Idempotency-Key.
 * @param {string} sessionCookie - The better-auth session cookie value
 * @param {object} extra - Additional headers to merge
 * @returns {object} Headers object with a unique Idempotency-Key
 */
export function buildMutatingHeaders(sessionCookie, extra = {}) {
  return buildHeaders(sessionCookie, {
    "Idempotency-Key": `k6-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ...extra,
  });
}

/**
 * Login via Better Auth and return the session cookie string.
 * @returns {string} Cookie header value (e.g. "better-auth.session_token=...")
 */
export function login() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  // Extract Set-Cookie headers and join them for subsequent requests
  const cookies = loginRes.headers["Set-Cookie"];
  if (!cookies) {
    console.warn(
      `Login failed (status ${loginRes.status}): no Set-Cookie header received`
    );
    return "";
  }

  // Set-Cookie can be a single string or an array
  const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
  return cookieArray.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Standard k6 thresholds used across all load test scenarios.
 */
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ["p(95)<500", "p(99)<1000"],
  http_req_failed: ["rate<0.01"],
};
