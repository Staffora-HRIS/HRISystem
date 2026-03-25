/**
 * k6 Load Test: Login Burst
 *
 * Simulates 50 concurrent users attempting to log in simultaneously via
 * Better Auth's email/password endpoint (POST /api/auth/sign-in/email).
 *
 * This test stresses the authentication layer, password hashing (bcrypt/scrypt),
 * database user lookups, session creation, and account lockout checks.
 *
 * Usage:
 *   k6 run login-burst.js
 *   k6 run login-burst.js -e BASE_URL=http://api.staging:3000
 *   k6 run login-burst.js -e TEST_EMAIL=user@example.com -e TEST_PASSWORD=secret123
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TEST_EMAIL = __ENV.TEST_EMAIL || "admin@staffora.co.uk";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "changeme123456";

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const loginSuccess = new Counter("login_success_total");
const loginFailure = new Counter("login_failure_total");
const loginErrorRate = new Rate("login_error_rate");
const loginDuration = new Trend("login_duration_ms", true);

// ---------------------------------------------------------------------------
// k6 Options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    login_burst: {
      executor: "shared-iterations",
      vus: 50,
      iterations: 200,
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    login_error_rate: ["rate<0.02"],
    login_duration_ms: ["p(95)<800"],
  },
};

// ---------------------------------------------------------------------------
// Setup — verify the API is reachable
// ---------------------------------------------------------------------------

export function setup() {
  const healthRes = http.get(`${BASE_URL}/health`);
  const healthOk = check(healthRes, {
    "health check returns 200": (r) => r.status === 200,
  });

  if (!healthOk) {
    console.error(
      `Health check failed (status ${healthRes.status}). ` +
        "Ensure the API is running at " +
        BASE_URL
    );
  }

  return { baseUrl: BASE_URL, email: TEST_EMAIL, password: TEST_PASSWORD };
}

// ---------------------------------------------------------------------------
// Default VU Function
// ---------------------------------------------------------------------------

export default function (data) {
  const payload = JSON.stringify({
    email: data.email,
    password: data.password,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    tags: { name: "POST /api/auth/sign-in/email" },
  };

  const res = http.post(
    `${data.baseUrl}/api/auth/sign-in/email`,
    payload,
    params
  );

  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    "login returns 200": (r) => r.status === 200,
    "response has Set-Cookie": (r) => {
      const setCookie = r.headers["Set-Cookie"];
      return setCookie !== undefined && setCookie !== null && setCookie !== "";
    },
    "response body is JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
    "response contains user data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.user !== undefined || body.token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (ok) {
    loginSuccess.add(1);
    loginErrorRate.add(0);
  } else {
    loginFailure.add(1);
    loginErrorRate.add(1);

    if (res.status === 423) {
      console.warn(
        `VU ${__VU}: Account locked (423). This is expected under burst load ` +
          "due to the account lockout mechanism."
      );
    } else if (res.status !== 200) {
      console.warn(
        `VU ${__VU}: Login returned status ${res.status}: ${res.body}`
      );
    }
  }

  // Small think time to avoid overwhelming the server unrealistically
  sleep(Math.random() * 0.5);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log("Login burst test completed.");
}
