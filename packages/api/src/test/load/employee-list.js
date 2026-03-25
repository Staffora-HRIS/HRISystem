/**
 * k6 Load Test: Employee List (Paginated)
 *
 * Simulates 100 virtual users continuously fetching paginated employee lists
 * via GET /api/v1/hr/employees. Tests cursor-based pagination, RLS enforcement,
 * and database query performance under concurrent read load.
 *
 * Usage:
 *   k6 run employee-list.js
 *   k6 run employee-list.js -e BASE_URL=http://api.staging:3000
 *   k6 run employee-list.js -e AUTH_TOKEN="better-auth.session_token=abc123"
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TEST_EMAIL = __ENV.TEST_EMAIL || "admin@staffora.co.uk";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "changeme123456";
const TENANT_ID = __ENV.TENANT_ID || "";

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const employeeListSuccess = new Counter("employee_list_success_total");
const employeeListFailure = new Counter("employee_list_failure_total");
const employeeListErrorRate = new Rate("employee_list_error_rate");
const employeeListDuration = new Trend("employee_list_duration_ms", true);
const pagesTraversed = new Counter("pages_traversed_total");

// ---------------------------------------------------------------------------
// k6 Options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    employee_list_load: {
      executor: "constant-vus",
      vus: 100,
      duration: "2m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    employee_list_error_rate: ["rate<0.01"],
    employee_list_duration_ms: ["p(95)<400"],
  },
};

// ---------------------------------------------------------------------------
// Setup — authenticate and obtain session cookie
// ---------------------------------------------------------------------------

export function setup() {
  // Verify API is reachable
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health check returns 200": (r) => r.status === 200,
  });

  // Login to get session cookie
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

  const loginOk = check(loginRes, {
    "setup login returns 200": (r) => r.status === 200,
  });

  if (!loginOk) {
    console.error(
      `Setup login failed (status ${loginRes.status}). ` +
        "Ensure the API is running and credentials are valid."
    );
    return { sessionCookie: "", baseUrl: BASE_URL };
  }

  // Extract session cookie
  const setCookieHeaders = loginRes.headers["Set-Cookie"];
  let sessionCookie = "";
  if (setCookieHeaders) {
    const cookieArray = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders];
    sessionCookie = cookieArray.map((c) => c.split(";")[0]).join("; ");
  }

  console.log("Setup complete. Session established for employee list test.");
  return { sessionCookie, baseUrl: BASE_URL };
}

// ---------------------------------------------------------------------------
// Helper — build standard headers
// ---------------------------------------------------------------------------

function buildHeaders(sessionCookie) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }

  if (TENANT_ID) {
    headers["X-Tenant-ID"] = TENANT_ID;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Default VU Function
// ---------------------------------------------------------------------------

export default function (data) {
  const headers = buildHeaders(data.sessionCookie);

  group("Employee List - First Page", () => {
    const res = http.get(
      `${data.baseUrl}/api/v1/hr/employees?limit=20`,
      {
        headers,
        tags: { name: "GET /api/v1/hr/employees" },
      }
    );

    employeeListDuration.add(res.timings.duration);
    pagesTraversed.add(1);

    const ok = check(res, {
      "first page returns 200": (r) => r.status === 200,
      "response is JSON": (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      "response has items array": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
      "response has pagination fields": (r) => {
        try {
          const body = JSON.parse(r.body);
          return "nextCursor" in body && "hasMore" in body;
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      employeeListSuccess.add(1);
      employeeListErrorRate.add(0);

      // If there are more pages, fetch the next page
      try {
        const body = JSON.parse(res.body);
        if (body.hasMore && body.nextCursor) {
          fetchNextPage(data, headers, body.nextCursor);
        }
      } catch {
        // ignore parse errors
      }
    } else {
      employeeListFailure.add(1);
      employeeListErrorRate.add(1);

      if (res.status === 401) {
        console.warn(`VU ${__VU}: Unauthorized (401). Session may have expired.`);
      } else if (res.status !== 200) {
        console.warn(
          `VU ${__VU}: Employee list returned ${res.status}: ${res.body}`
        );
      }
    }
  });

  // Simulate filtering by status
  group("Employee List - Filtered by Status", () => {
    const statuses = ["active", "pending", "on_leave", "terminated"];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    const res = http.get(
      `${data.baseUrl}/api/v1/hr/employees?limit=20&status=${randomStatus}`,
      {
        headers,
        tags: { name: "GET /api/v1/hr/employees?status=*" },
      }
    );

    employeeListDuration.add(res.timings.duration);

    const ok = check(res, {
      "filtered list returns 200": (r) => r.status === 200,
      "filtered response has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      employeeListSuccess.add(1);
      employeeListErrorRate.add(0);
    } else {
      employeeListFailure.add(1);
      employeeListErrorRate.add(1);
    }
  });

  // Simulate searching by name
  group("Employee List - Search", () => {
    const searchTerms = ["Smith", "Jones", "John", "Jane", "Williams"];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    const res = http.get(
      `${data.baseUrl}/api/v1/hr/employees?limit=10&search=${encodeURIComponent(term)}`,
      {
        headers,
        tags: { name: "GET /api/v1/hr/employees?search=*" },
      }
    );

    employeeListDuration.add(res.timings.duration);

    check(res, {
      "search returns 200 or empty result": (r) =>
        r.status === 200 || r.status === 404,
    });
  });

  // Think time between iterations
  sleep(1 + Math.random() * 2);
}

// ---------------------------------------------------------------------------
// Helper — fetch next page using cursor
// ---------------------------------------------------------------------------

function fetchNextPage(data, headers, cursor) {
  group("Employee List - Next Page", () => {
    const res = http.get(
      `${data.baseUrl}/api/v1/hr/employees?limit=20&cursor=${encodeURIComponent(cursor)}`,
      {
        headers,
        tags: { name: "GET /api/v1/hr/employees?cursor=*" },
      }
    );

    employeeListDuration.add(res.timings.duration);
    pagesTraversed.add(1);

    const ok = check(res, {
      "next page returns 200": (r) => r.status === 200,
      "next page has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      employeeListSuccess.add(1);
      employeeListErrorRate.add(0);
    } else {
      employeeListFailure.add(1);
      employeeListErrorRate.add(1);
    }
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log("Employee list load test completed.");
}
