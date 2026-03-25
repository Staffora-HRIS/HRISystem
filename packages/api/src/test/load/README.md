# k6 Load Tests for Staffora HRIS API

Load and performance tests using [k6](https://k6.io/) to validate the Staffora API under realistic and stress conditions.

## Prerequisites

### Install k6

**macOS (Homebrew):**
```bash
brew install k6
```

**Windows (Chocolatey):**
```bash
choco install k6
```

**Windows (winget):**
```bash
winget install k6 --source winget
```

**Debian/Ubuntu:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**Docker (no local install):**
```bash
docker run --rm -i grafana/k6 run - < login-burst.js
```

Verify installation:
```bash
k6 version
```

### Start the API

Ensure the full Staffora stack is running:

```bash
# From the repository root
bun run docker:up       # Start postgres + redis
bun run migrate:up      # Apply database migrations
bun run db:seed         # Seed test data (recommended)
bun run dev:api         # Start the API server
```

The API must be accessible at `http://localhost:3000` (default). A valid admin user must exist for authentication.

## Test Scenarios

### 1. Login Burst (`login-burst.js`)

Simulates 50 concurrent users logging in simultaneously. Stresses password hashing (bcrypt/scrypt), session creation, and account lockout checks.

```bash
k6 run packages/api/src/test/load/login-burst.js
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| VUs | 50 | Concurrent virtual users |
| Iterations | 200 | Total login attempts |
| Duration | 2m max | Maximum test duration |

**Custom credentials:**
```bash
k6 run login-burst.js \
  -e TEST_EMAIL=testuser@example.com \
  -e TEST_PASSWORD=securepassword123
```

**Key thresholds:**
- P95 response time < 500ms
- P99 response time < 1000ms
- Error rate < 1%
- Login-specific error rate < 2%

**Note:** The account lockout mechanism may trigger 423 responses after repeated logins to the same account. This is expected behaviour, not a test failure.

### 2. Employee List (`employee-list.js`)

Simulates 100 virtual users continuously fetching paginated employee lists. Tests cursor-based pagination, RLS enforcement, filtering, and search under read-heavy load.

```bash
k6 run packages/api/src/test/load/employee-list.js
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| VUs | 100 | Concurrent virtual users |
| Duration | 2m | Sustained load duration |

Exercises three access patterns per iteration:
- First page fetch (unfiltered)
- Filtered by employee status (random)
- Search by surname (random)

If the first page returns `hasMore: true`, the test also fetches the next page using the cursor.

**Key thresholds:**
- P95 response time < 500ms
- Employee list P95 < 400ms
- Error rate < 1%

### 3. Leave Submission (`leave-submission.js`)

Simulates 50 virtual users concurrently creating leave requests. Tests write-path performance including idempotency enforcement, outbox atomicity, effective-date overlap prevention, and state machine transitions.

```bash
k6 run packages/api/src/test/load/leave-submission.js
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| VUs | 50 | Concurrent virtual users |
| Duration | 2m | Sustained load duration |

Each VU creates a leave request with a unique date range (spread across 2027) and optionally submits it (draft to pending transition).

**Pre-set test data (optional):**
```bash
k6 run leave-submission.js \
  -e EMPLOYEE_ID=<uuid> \
  -e LEAVE_TYPE_ID=<uuid>
```

If not provided, the setup phase auto-discovers an employee and leave type from the API.

**Key thresholds:**
- P95 response time < 500ms
- Leave creation P95 < 600ms
- Error rate < 5% (higher tolerance for expected overlap conflicts)

### 4. Mixed Workload (`mixed-workload.js`)

Simulates a realistic traffic pattern with ramping load:
- **60% reads** -- employee detail, auth/me, leave types, health check
- **30% list operations** -- employee list, leave requests, leave types
- **10% writes** -- create leave request

```bash
k6 run packages/api/src/test/load/mixed-workload.js
```

| Phase | Duration | Target VUs |
|-------|----------|------------|
| Ramp up | 30s | 10 to 50 |
| Sustained peak | 2m | 50 to 100 |
| Ramp down | 30s | 100 to 0 |

**Key thresholds:**
- Overall P95 < 500ms
- Read P95 < 300ms
- List P95 < 500ms
- Write P95 < 800ms
- Overall error rate < 2%

## Common Options

### Environment Variables

All tests accept these environment variables via `-e`:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | API base URL |
| `TEST_EMAIL` | `admin@staffora.co.uk` | Login email |
| `TEST_PASSWORD` | `changeme123456` | Login password |
| `TENANT_ID` | (auto-detected) | Tenant UUID for X-Tenant-ID header |
| `CSRF_TOKEN` | (empty) | CSRF token for mutating requests |
| `EMPLOYEE_ID` | (auto-discovered) | Employee UUID (leave tests) |
| `LEAVE_TYPE_ID` | (auto-discovered) | Leave type UUID (leave tests) |

### Override VU Count and Duration

```bash
# Run employee list with 200 VUs for 5 minutes
k6 run employee-list.js --vus 200 --duration 5m

# Quick smoke test with 5 VUs for 30 seconds
k6 run mixed-workload.js --vus 5 --duration 30s
```

### Target a Staging Environment

```bash
k6 run mixed-workload.js \
  -e BASE_URL=https://api.staging.staffora.co.uk \
  -e TEST_EMAIL=loadtest@staffora.co.uk \
  -e TEST_PASSWORD=staging-password-here
```

### JSON Output for CI/CD

```bash
k6 run mixed-workload.js --out json=results.json
```

### Export to InfluxDB/Grafana

```bash
k6 run mixed-workload.js --out influxdb=http://localhost:8086/k6
```

## Interpreting Results

### k6 Summary Output

After each test run, k6 prints a summary table. Key metrics to watch:

```
http_req_duration.............: avg=45.2ms  min=8ms  med=32ms  max=890ms  p(90)=120ms  p(95)=180ms
http_req_failed...............: 0.42%  ✓ 12  ✗ 2838
iterations....................: 2850   47.5/s
```

### What to Look For

| Metric | Healthy | Degraded | Failing |
|--------|---------|----------|---------|
| P95 latency | < 200ms | 200-500ms | > 500ms |
| P99 latency | < 500ms | 500ms-1s | > 1s |
| Error rate | < 0.5% | 0.5-2% | > 2% |
| Throughput | Stable | Declining | Dropping |

### Custom Metrics

Each test defines scenario-specific custom metrics:

- **login-burst.js**: `login_duration_ms`, `login_error_rate`, `login_success_total`, `login_failure_total`
- **employee-list.js**: `employee_list_duration_ms`, `employee_list_error_rate`, `pages_traversed_total`
- **leave-submission.js**: `leave_create_duration_ms`, `leave_submit_duration_ms`, `leave_create_error_rate`
- **mixed-workload.js**: `read_duration_ms`, `list_duration_ms`, `write_duration_ms`, `overall_error_rate`

### Threshold Failures

If a threshold is breached, k6 exits with a non-zero exit code and marks the metric with a cross:

```
✗ http_req_duration.............: avg=620ms  p(95)=1200ms
    ✗ p(95)<500
```

This indicates the API is not meeting the performance SLA under the given load.

### Common Failure Patterns

| Symptom | Likely Cause | Investigation |
|---------|-------------|---------------|
| High P99 but low P50 | Connection pool exhaustion | Check postgres `max_connections` and pool size |
| Increasing latency over time | Memory leak or cache eviction | Monitor API process memory and Redis hit rate |
| 401 errors mid-test | Session expiry | Increase session TTL or re-authenticate periodically |
| 423 errors (login test) | Account lockout triggered | Expected -- reduce VU count or use multiple test accounts |
| 409 errors (leave test) | Idempotency replays or date overlaps | Expected under concurrent writes -- check error rate metric |
| 503 errors | Database connection failures | Check postgres container health and connection limits |

## Baseline Expectations

These baselines assume a local development environment (Docker containers on a modern workstation with 8+ CPU cores and 16+ GB RAM):

| Scenario | Expected P95 | Expected Throughput | Notes |
|----------|-------------|---------------------|-------|
| Login burst (50 VUs) | < 400ms | 30-80 req/s | bcrypt/scrypt hashing is CPU-bound |
| Employee list (100 VUs) | < 200ms | 150-300 req/s | Depends on dataset size |
| Leave submission (50 VUs) | < 400ms | 50-150 req/s | Writes are slower due to outbox + RLS |
| Mixed workload (100 VUs) | < 300ms | 100-250 req/s | Weighted average across operation types |

**Production targets** should be set based on actual infrastructure benchmarks. These baselines serve as a starting point for local development validation.

## Shared Configuration

The `config.js` module provides shared utilities used across all test scripts:

- `buildHeaders(sessionCookie)` -- standard request headers
- `buildMutatingHeaders(sessionCookie)` -- adds `Idempotency-Key` header
- `login()` -- authenticate and return session cookie
- `DEFAULT_THRESHOLDS` -- shared P95/error rate thresholds

Individual test scripts inline their configuration for self-containment, but `config.js` can be imported for custom scripts.

## Writing New Load Tests

When creating additional load test scripts, follow these conventions:

1. Target endpoints under `/api/v1/` (module routes) or `/api/auth/` (Better Auth)
2. Always include `Idempotency-Key` header for POST/PUT/PATCH/DELETE requests
3. Use `check()` to validate response status and body structure
4. Define custom metrics with descriptive names
5. Include `setup()` for authentication and test data discovery
6. Include `teardown()` for cleanup notes
7. Set thresholds aligned with SLA targets (P95 < 500ms, error rate < 1%)
8. Use `group()` to organise related requests for clearer reporting
9. Add realistic think time with `sleep()` between iterations
