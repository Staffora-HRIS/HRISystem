/**
 * k6 Load Test: Concurrent Leave Request Submissions
 *
 * Simulates 50 virtual users submitting leave requests concurrently
 * via POST /api/v1/absence/requests. Tests write-path performance including
 * idempotency enforcement, outbox writes, RLS validation, and effective-date
 * overlap prevention.
 *
 * Usage:
 *   k6 run leave-submission.js
 *   k6 run leave-submission.js -e BASE_URL=http://api.staging:3000
 *   k6 run leave-submission.js -e EMPLOYEE_ID=<uuid> -e LEAVE_TYPE_ID=<uuid>
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
const CSRF_TOKEN = __ENV.CSRF_TOKEN || "";

// Optional: pre-set IDs for a known employee and leave type
const EMPLOYEE_ID = __ENV.EMPLOYEE_ID || "";
const LEAVE_TYPE_ID = __ENV.LEAVE_TYPE_ID || "";

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const leaveCreateSuccess = new Counter("leave_create_success_total");
const leaveCreateFailure = new Counter("leave_create_failure_total");
const leaveCreateErrorRate = new Rate("leave_create_error_rate");
const leaveCreateDuration = new Trend("leave_create_duration_ms", true);
const leaveSubmitDuration = new Trend("leave_submit_duration_ms", true);

// ---------------------------------------------------------------------------
// k6 Options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    leave_submission_load: {
      executor: "constant-vus",
      vus: 50,
      duration: "2m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.05"],
    leave_create_error_rate: ["rate<0.05"],
    leave_create_duration_ms: ["p(95)<600"],
  },
};

// ---------------------------------------------------------------------------
// Setup — authenticate and discover test data
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
    return {
      sessionCookie: "",
      baseUrl: BASE_URL,
      employeeId: EMPLOYEE_ID,
      leaveTypeId: LEAVE_TYPE_ID,
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

  // Discover an employee ID if not provided
  let employeeId = EMPLOYEE_ID;
  if (!employeeId) {
    const empRes = http.get(`${BASE_URL}/api/v1/hr/employees?limit=1`, {
      headers,
    });
    if (empRes.status === 200) {
      try {
        const empBody = JSON.parse(empRes.body);
        if (empBody.items && empBody.items.length > 0) {
          employeeId = empBody.items[0].id;
          console.log(`Discovered employee ID: ${employeeId}`);
        }
      } catch {
        console.warn("Could not parse employee list response.");
      }
    }
  }

  // Discover a leave type ID if not provided
  let leaveTypeId = LEAVE_TYPE_ID;
  if (!leaveTypeId) {
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
  }

  if (!employeeId || !leaveTypeId) {
    console.warn(
      "Could not discover employee or leave type IDs. " +
        "Pass EMPLOYEE_ID and LEAVE_TYPE_ID env vars, or ensure test data exists."
    );
  }

  return {
    sessionCookie,
    baseUrl: BASE_URL,
    employeeId,
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
// Helper — generate a unique date range to avoid overlaps
// ---------------------------------------------------------------------------

function generateDateRange() {
  // Each VU gets a unique future date range to minimise overlap conflicts.
  // Uses VU ID and iteration to spread dates across the calendar.
  const baseYear = 2027;
  const month = ((__VU * 7 + __ITER * 3) % 12) + 1;
  const day = ((__VU * 3 + __ITER * 5) % 28) + 1;
  const startDate = `${baseYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // 1-3 day leave request
  const durationDays = (__ITER % 3) + 1;
  const endDay = Math.min(day + durationDays, 28);
  const endDate = `${baseYear}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Default VU Function
// ---------------------------------------------------------------------------

export default function (data) {
  if (!data.employeeId || !data.leaveTypeId) {
    console.warn(`VU ${__VU}: Skipping — no employee/leave type IDs available.`);
    sleep(2);
    return;
  }

  const headers = buildHeaders(data.sessionCookie);

  group("Create Leave Request", () => {
    const { startDate, endDate } = generateDateRange();

    const idempotencyKey = `k6-leave-${__VU}-${__ITER}-${Date.now()}`;

    const payload = JSON.stringify({
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      startDate,
      endDate,
      startHalfDay: false,
      endHalfDay: false,
      reason: `k6 load test leave request (VU ${__VU}, iter ${__ITER})`,
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

    leaveCreateDuration.add(res.timings.duration);

    const ok = check(res, {
      "create returns 200 or 201": (r) =>
        r.status === 200 || r.status === 201,
      "response is JSON": (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      "response has leave request id": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      leaveCreateSuccess.add(1);
      leaveCreateErrorRate.add(0);

      // Optionally submit the draft leave request
      try {
        const body = JSON.parse(res.body);
        if (body.id && body.status === "draft") {
          submitLeaveRequest(data, headers, body.id);
        }
      } catch {
        // ignore
      }
    } else {
      leaveCreateFailure.add(1);
      leaveCreateErrorRate.add(1);

      // Some failures are expected (overlap, validation)
      if (res.status === 409) {
        // Idempotency replay or date overlap — acceptable under load
      } else if (res.status === 400) {
        // Validation error (e.g., overlapping dates) — expected
      } else if (res.status === 401) {
        console.warn(`VU ${__VU}: Unauthorized (401). Session may have expired.`);
      } else {
        console.warn(
          `VU ${__VU}: Leave creation returned ${res.status}: ${res.body}`
        );
      }
    }
  });

  // Verify leave request appears in the list
  group("List Leave Requests", () => {
    const res = http.get(
      `${data.baseUrl}/api/v1/absence/requests?limit=10&employeeId=${data.employeeId}`,
      {
        headers,
        tags: { name: "GET /api/v1/absence/requests" },
      }
    );

    check(res, {
      "list returns 200": (r) => r.status === 200,
      "list has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
    });
  });

  // Think time between iterations
  sleep(0.5 + Math.random() * 1.5);
}

// ---------------------------------------------------------------------------
// Helper — submit a draft leave request
// ---------------------------------------------------------------------------

function submitLeaveRequest(data, headers, requestId) {
  group("Submit Leave Request", () => {
    const submitRes = http.post(
      `${data.baseUrl}/api/v1/absence/requests/${requestId}/submit`,
      null,
      {
        headers: Object.assign({}, headers, {
          "Idempotency-Key": `k6-submit-${requestId}-${Date.now()}`,
        }),
        tags: { name: "POST /api/v1/absence/requests/:id/submit" },
      }
    );

    leaveSubmitDuration.add(submitRes.timings.duration);

    check(submitRes, {
      "submit returns 200": (r) => r.status === 200,
      "submit changes status to pending": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === "pending";
        } catch {
          return false;
        }
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log("Leave submission load test completed.");
  console.log(
    "Note: Leave requests created during this test should be cleaned up " +
      "manually or via a cleanup script if running against a shared environment."
  );
}
