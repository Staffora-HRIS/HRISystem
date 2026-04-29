/**
 * k6 Load Test: Mixed Workload
 *
 * Simulates a realistic traffic pattern across the Staffora HRIS API:
 *   - 60% reads (employee detail, leave balances, auth/me)
 *   - 30% list operations (employee list, leave requests, leave types)
 *   - 10% writes (create leave request, update employee)
 *
 * This test exercises the full stack: authentication, RLS, cursor-based
 * pagination, idempotency, outbox writes, and caching.
 *
 * Usage:
 *   k6 run mixed-workload.js
 *   k6 run mixed-workload.js -e BASE_URL=http://api.staging:3000
 *   k6 run mixed-workload.js --vus 200 --duration 5m
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TEST_EMAIL = __ENV.TEST_EMAIL || "admin@staffora.co.uk";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "changeme123456";
const TENANT_ID = __ENV.TENANT_ID || "";
const CSRF_TOKEN = __ENV.CSRF_TOKEN || "";

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const readSuccess = new Counter("read_success_total");
const readFailure = new Counter("read_failure_total");
const listSuccess = new Counter("list_success_total");
const listFailure = new Counter("list_failure_total");
const writeSuccess = new Counter("write_success_total");
const writeFailure = new Counter("write_failure_total");

const overallErrorRate = new Rate("overall_error_rate");
const readDuration = new Trend("read_duration_ms", true);
const listDuration = new Trend("list_duration_ms", true);
const writeDuration = new Trend("write_duration_ms", true);

// ---------------------------------------------------------------------------
// k6 Options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    mixed_workload: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 50 },   // Ramp up
        { duration: "2m", target: 100 },   // Sustain peak
        { duration: "30s", target: 0 },    // Ramp down
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    overall_error_rate: ["rate<0.02"],
    read_duration_ms: ["p(95)<300"],
    list_duration_ms: ["p(95)<500"],
    write_duration_ms: ["p(95)<800"],
  },
};

// ---------------------------------------------------------------------------
// Setup — authenticate and discover test data
// ---------------------------------------------------------------------------

export function setup() {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health check returns 200": (r) => r.status === 200,
  });

  // Login
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
    return {
      sessionCookie: "",
      baseUrl: BASE_URL,
      employeeIds: [],
      leaveTypeId: "",
    };
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

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: sessionCookie,
  };
  if (TENANT_ID) {
    headers["X-Tenant-ID"] = TENANT_ID;
  }

  // Discover employee IDs (fetch a page of employees for random reads)
  let employeeIds = [];
  const empRes = http.get(`${BASE_URL}/api/v1/hr/employees?limit=20`, {
    headers,
  });
  if (empRes.status === 200) {
    try {
      const empBody = JSON.parse(empRes.body);
      if (empBody.items && empBody.items.length > 0) {
        employeeIds = empBody.items.map((e) => e.id);
        console.log(`Discovered ${employeeIds.length} employee IDs for read tests.`);
      }
    } catch {
      console.warn("Could not parse employee list response.");
    }
  }

  // Discover a leave type ID
  let leaveTypeId = "";
  const ltRes = http.get(`${BASE_URL}/api/v1/absence/leave-types`, {
    headers,
  });
  if (ltRes.status === 200) {
    try {
      const ltBody = JSON.parse(ltRes.body);
      const items = ltBody.items || ltBody;
      if (Array.isArray(items) && items.length > 0) {
        leaveTypeId = items[0].id;
        console.log(`Discovered leave type ID: ${leaveTypeId}`);
      }
    } catch {
      console.warn("Could not parse leave types response.");
    }
  }

  console.log("Setup complete for mixed workload test.");
  return {
    sessionCookie,
    baseUrl: BASE_URL,
    employeeIds,
    leaveTypeId,
  };
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

  if (CSRF_TOKEN) {
    headers["X-CSRF-Token"] = CSRF_TOKEN;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Helper — pick a random element from an array
//
// SECURITY NOTE: This is a k6 load test (not security-sensitive code).
// Uses k6-utils' randomIntBetween for non-cryptographic test data selection
// (picking which employee/operation/limit to exercise). Never used to
// generate credentials, tokens, session IDs, or any auth-crossing material.
// ---------------------------------------------------------------------------

function randomChoice(arr) {
  if (!arr || arr.length === 0) return null;
  // load test only — non-security context (test fixture rotation)
  return arr[randomIntBetween(0, arr.length - 1)];
}

// ---------------------------------------------------------------------------
// Read Operations (60%)
// ---------------------------------------------------------------------------

function doReadOperation(data, headers) {
  const readOps = [
    readAuthMe,
    readEmployeeDetail,
    readLeaveTypes,
    readHealthCheck,
  ];

  const op = randomChoice(readOps);
  op(data, headers);
}

function readAuthMe(data, headers) {
  group("Read - Auth Me", () => {
    const res = http.get(`${data.baseUrl}/api/v1/auth/me`, {
      headers,
      tags: { name: "GET /api/v1/auth/me" },
    });

    readDuration.add(res.timings.duration);

    const ok = check(res, {
      "auth/me returns 200": (r) => r.status === 200,
      "auth/me has user": (r) => {
        try {
          return JSON.parse(r.body).user !== undefined;
        } catch {
          return false;
        }
      },
    });

    trackResult(ok, "read");
  });
}

function readEmployeeDetail(data, headers) {
  const employeeId = randomChoice(data.employeeIds);
  if (!employeeId) {
    readAuthMe(data, headers); // Fallback
    return;
  }

  group("Read - Employee Detail", () => {
    const res = http.get(
      `${data.baseUrl}/api/v1/hr/employees/${employeeId}`,
      {
        headers,
        tags: { name: "GET /api/v1/hr/employees/:id" },
      }
    );

    readDuration.add(res.timings.duration);

    const ok = check(res, {
      "employee detail returns 200": (r) => r.status === 200,
      "employee detail has id": (r) => {
        try {
          return JSON.parse(r.body).id !== undefined;
        } catch {
          return false;
        }
      },
    });

    trackResult(ok, "read");
  });
}

function readLeaveTypes(data, headers) {
  group("Read - Leave Types", () => {
    const res = http.get(`${data.baseUrl}/api/v1/absence/leave-types`, {
      headers,
      tags: { name: "GET /api/v1/absence/leave-types" },
    });

    readDuration.add(res.timings.duration);

    const ok = check(res, {
      "leave types returns 200": (r) => r.status === 200,
    });

    trackResult(ok, "read");
  });
}

function readHealthCheck(data, headers) {
  group("Read - Health Check", () => {
    const res = http.get(`${data.baseUrl}/health`, {
      tags: { name: "GET /health" },
    });

    readDuration.add(res.timings.duration);

    const ok = check(res, {
      "health returns 200": (r) => r.status === 200,
    });

    trackResult(ok, "read");
  });
}

// ---------------------------------------------------------------------------
// List Operations (30%)
// ---------------------------------------------------------------------------

function doListOperation(data, headers) {
  const listOps = [listEmployees, listLeaveRequests, listLeaveTypes];

  const op = randomChoice(listOps);
  op(data, headers);
}

function listEmployees(data, headers) {
  group("List - Employees", () => {
    // load test only — non-security context (page-size rotation)
    const limit = [10, 20, 50][randomIntBetween(0, 2)];
    const res = http.get(
      `${data.baseUrl}/api/v1/hr/employees?limit=${limit}`,
      {
        headers,
        tags: { name: "GET /api/v1/hr/employees" },
      }
    );

    listDuration.add(res.timings.duration);

    const ok = check(res, {
      "employee list returns 200": (r) => r.status === 200,
      "employee list has items": (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).items);
        } catch {
          return false;
        }
      },
    });

    trackResult(ok, "list");
  });
}

function listLeaveRequests(data, headers) {
  group("List - Leave Requests", () => {
    const res = http.get(
      `${data.baseUrl}/api/v1/absence/requests?limit=20`,
      {
        headers,
        tags: { name: "GET /api/v1/absence/requests" },
      }
    );

    listDuration.add(res.timings.duration);

    const ok = check(res, {
      "leave requests returns 200": (r) => r.status === 200,
      "leave requests has items": (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).items);
        } catch {
          return false;
        }
      },
    });

    trackResult(ok, "list");
  });
}

function listLeaveTypes(data, headers) {
  group("List - Leave Types", () => {
    const res = http.get(
      `${data.baseUrl}/api/v1/absence/leave-types`,
      {
        headers,
        tags: { name: "GET /api/v1/absence/leave-types" },
      }
    );

    listDuration.add(res.timings.duration);

    const ok = check(res, {
      "leave types list returns 200": (r) => r.status === 200,
    });

    trackResult(ok, "list");
  });
}

// ---------------------------------------------------------------------------
// Write Operations (10%)
// ---------------------------------------------------------------------------

function doWriteOperation(data, headers) {
  createLeaveRequest(data, headers);
}

function createLeaveRequest(data, headers) {
  const employeeId = randomChoice(data.employeeIds);
  if (!employeeId || !data.leaveTypeId) {
    // Fallback to a read if we cannot write
    doReadOperation(data, headers);
    return;
  }

  group("Write - Create Leave Request", () => {
    // Generate a unique date range per VU/iteration
    const baseYear = 2028;
    const month = ((__VU * 7 + __ITER * 3) % 12) + 1;
    const day = ((__VU * 3 + __ITER * 5) % 28) + 1;
    const startDate = `${baseYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const endDay = Math.min(day + 1, 28);
    const endDate = `${baseYear}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    const idempotencyKey = `k6-mixed-${__VU}-${__ITER}-${Date.now()}`;

    const payload = JSON.stringify({
      employeeId,
      leaveTypeId: data.leaveTypeId,
      startDate,
      endDate,
      startHalfDay: false,
      endHalfDay: false,
      reason: `k6 mixed workload (VU ${__VU}, iter ${__ITER})`,
    });

    const res = http.post(
      `${data.baseUrl}/api/v1/absence/requests`,
      payload,
      {
        headers: Object.assign({}, headers, {
          "Idempotency-Key": idempotencyKey,
        }),
        tags: { name: "POST /api/v1/absence/requests" },
      }
    );

    writeDuration.add(res.timings.duration);

    const ok = check(res, {
      "create leave returns 200 or 201": (r) =>
        r.status === 200 || r.status === 201,
    });

    trackResult(ok, "write");
  });
}

// ---------------------------------------------------------------------------
// Result Tracking
// ---------------------------------------------------------------------------

function trackResult(ok, category) {
  if (ok) {
    overallErrorRate.add(0);
    switch (category) {
      case "read":
        readSuccess.add(1);
        break;
      case "list":
        listSuccess.add(1);
        break;
      case "write":
        writeSuccess.add(1);
        break;
    }
  } else {
    overallErrorRate.add(1);
    switch (category) {
      case "read":
        readFailure.add(1);
        break;
      case "list":
        listFailure.add(1);
        break;
      case "write":
        writeFailure.add(1);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Default VU Function
// ---------------------------------------------------------------------------

export default function (data) {
  const headers = buildHeaders(data.sessionCookie);

  // Weighted random selection: 60% read, 30% list, 10% write
  // load test only — non-security context (traffic mix simulation)
  const roll = randomIntBetween(0, 99);

  if (roll < 60) {
    doReadOperation(data, headers);
  } else if (roll < 90) {
    doListOperation(data, headers);
  } else {
    doWriteOperation(data, headers);
  }

  // Simulate realistic think time (1-3 seconds)
  // load test only — non-security context (think-time jitter)
  sleep(randomIntBetween(1, 3));
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log("Mixed workload test completed.");
  console.log(
    "Review custom metrics (read/list/write durations, error rates) " +
      "in the k6 summary output for per-operation performance."
  );
}
