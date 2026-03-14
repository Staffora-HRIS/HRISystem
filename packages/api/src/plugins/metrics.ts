import { Elysia } from "elysia";
import type { DatabaseClient } from "./db";
import type { CacheClient } from "./cache";
import { getDbClient } from "./db";
import { getCacheClient } from "./cache";

/**
 * Prometheus-compatible metrics plugin.
 *
 * Tracks:
 * - http_requests_total        — counter by method, route, status
 * - http_request_duration_seconds — histogram by method, route
 * - http_active_requests       — gauge
 * - db_pool_active_connections — gauge
 * - db_pool_idle_connections   — gauge
 * - redis_connected            — gauge (0/1)
 * - process_memory_bytes       — gauge (rss, heapUsed, heapTotal, external)
 * - process_uptime_seconds     — gauge
 *
 * No external dependency required — uses plain text Prometheus exposition format.
 */

// =============================================================================
// Route normalization
// =============================================================================

/**
 * UUID-like pattern used to collapse resource IDs into `:id` so that
 * /api/v1/hr/employees/abc-123 and /api/v1/hr/employees/def-456
 * are tracked under the same label.
 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_ID_PATTERN = /\/\d+(?=\/|$)/g;

function normalizeRoute(path: string): string {
  return path
    .replace(UUID_PATTERN, ":id")
    .replace(NUMERIC_ID_PATTERN, "/:id");
}

// =============================================================================
// Metrics store
// =============================================================================

const BUCKET_BOUNDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Per-route request counter.
 * Key format: `method|route|statusCode`
 */
const requestCounters = new Map<string, number>();

/**
 * Per-route latency histogram.
 * Key format: `method|route`
 * Value: { buckets: number[], sum: number, count: number }
 */
interface HistogramEntry {
  buckets: number[]; // one slot per BUCKET_BOUNDS entry, plus +Inf
  sum: number;
  count: number;
}
const latencyHistograms = new Map<string, HistogramEntry>();

let activeRequests = 0;
let totalRequests = 0;
let totalErrors = 0;

/** Application start time for process_uptime_seconds */
const processStartTime = Date.now();

/**
 * Periodic eviction for requestCounters and latencyHistograms Maps.
 * Prevents unbounded memory growth on long-running servers where unique
 * route+status combinations accumulate over time.
 */
const MAX_METRICS_AGE_MS = 3_600_000; // 1 hour
let lastResetTime = Date.now();

function maybeResetMetrics(): void {
  if (Date.now() - lastResetTime > MAX_METRICS_AGE_MS) {
    requestCounters.clear();
    latencyHistograms.clear();
    lastResetTime = Date.now();
  }
}

function getOrCreateHistogram(key: string): HistogramEntry {
  let entry = latencyHistograms.get(key);
  if (!entry) {
    entry = {
      buckets: new Array(BUCKET_BOUNDS.length + 1).fill(0), // +1 for +Inf
      sum: 0,
      count: 0,
    };
    latencyHistograms.set(key, entry);
  }
  return entry;
}

function recordRequest(method: string, route: string, statusCode: number, durationSeconds: number): void {
  maybeResetMetrics();

  // Counter: method|route|status
  const counterKey = `${method}|${route}|${statusCode}`;
  requestCounters.set(counterKey, (requestCounters.get(counterKey) || 0) + 1);

  // Histogram: method|route
  const histKey = `${method}|${route}`;
  const hist = getOrCreateHistogram(histKey);
  hist.sum += durationSeconds;
  hist.count += 1;

  for (let i = 0; i < BUCKET_BOUNDS.length; i++) {
    if (durationSeconds <= BUCKET_BOUNDS[i]!) {
      hist.buckets[i]!++;
    }
  }
  // +Inf always incremented
  hist.buckets[BUCKET_BOUNDS.length]!++;

  // Status code tracking
  if (statusCode >= 500) totalErrors++;
}

// =============================================================================
// Infrastructure probe callbacks
// =============================================================================

/**
 * Optional callbacks injected by the plugin to collect infrastructure gauges
 * at scrape time rather than on every request.
 */
let dbClient: DatabaseClient | null = null;
let cacheClient: CacheClient | null = null;

/**
 * Called from the plugin to wire up DB/Redis references for gauge collection.
 */
export function setInfraClients(db: DatabaseClient | null, cache: CacheClient | null): void {
  dbClient = db;
  cacheClient = cache;
}

// =============================================================================
// Prometheus formatting
// =============================================================================

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Resolve the DB client: prefer explicitly set client, fall back to singleton.
 */
function resolveDbClient(): DatabaseClient | null {
  if (dbClient) return dbClient;
  try {
    return getDbClient();
  } catch {
    return null;
  }
}

/**
 * Resolve the cache client: prefer explicitly set client, fall back to singleton.
 */
function resolveCacheClient(): CacheClient | null {
  if (cacheClient) return cacheClient;
  try {
    return getCacheClient();
  } catch {
    return null;
  }
}

/**
 * Collect DB pool stats from pg_stat_activity.
 * Returns null if the query fails (e.g., limited permissions).
 */
async function collectDbPoolStats(): Promise<{ active: number; idle: number } | null> {
  const db = resolveDbClient();
  if (!db) return null;
  try {
    const rows = await db.query<{ state: string; count: string }>`
      SELECT state, count(*)::text AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
      GROUP BY state
    `;
    let active = 0;
    let idle = 0;
    for (const row of rows) {
      const c = parseInt(row.count, 10);
      if (row.state === "active") active = c;
      else if (row.state === "idle") idle = c;
    }
    return { active, idle };
  } catch {
    return null;
  }
}

/**
 * Check Redis connectivity.
 * Returns 1 if connected, 0 otherwise.
 */
async function checkRedisConnected(): Promise<number> {
  const cache = resolveCacheClient();
  if (!cache) return 0;
  try {
    const health = await cache.healthCheck();
    return health.status === "up" ? 1 : 0;
  } catch {
    return 0;
  }
}

async function formatPrometheus(): Promise<string> {
  const lines: string[] = [];

  // --- http_requests_total ---
  lines.push("# HELP http_requests_total Total HTTP requests by method, route, and status code");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, count] of requestCounters) {
    const [method, route, status] = key.split("|");
    lines.push(
      `http_requests_total{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}",status="${status}"} ${count}`
    );
  }

  // --- http_request_duration_seconds ---
  lines.push("# HELP http_request_duration_seconds Request latency histogram by method and route");
  lines.push("# TYPE http_request_duration_seconds histogram");
  for (const [key, hist] of latencyHistograms) {
    const [method, route] = key.split("|");
    const labels = `method="${escapeLabel(method!)}",route="${escapeLabel(route!)}"`;
    let cumulative = 0;
    for (let i = 0; i < BUCKET_BOUNDS.length; i++) {
      cumulative += hist.buckets[i]!;
      lines.push(
        `http_request_duration_seconds_bucket{${labels},le="${BUCKET_BOUNDS[i]}"} ${cumulative}`
      );
    }
    // +Inf
    cumulative += hist.buckets[BUCKET_BOUNDS.length]!;
    lines.push(
      `http_request_duration_seconds_bucket{${labels},le="+Inf"} ${cumulative}`
    );
    lines.push(`http_request_duration_seconds_sum{${labels}} ${hist.sum}`);
    lines.push(`http_request_duration_seconds_count{${labels}} ${hist.count}`);
  }

  // --- http_active_requests ---
  lines.push("# HELP http_active_requests Current number of in-flight HTTP requests");
  lines.push("# TYPE http_active_requests gauge");
  lines.push(`http_active_requests ${activeRequests}`);

  // --- http_errors_total ---
  lines.push("# HELP http_errors_total Total HTTP 5xx errors");
  lines.push("# TYPE http_errors_total counter");
  lines.push(`http_errors_total ${totalErrors}`);

  // --- db_pool_active_connections / db_pool_idle_connections ---
  // Collected at scrape time from pg_stat_activity
  const [dbPool, redisUp] = await Promise.all([
    collectDbPoolStats(),
    checkRedisConnected(),
  ]);

  lines.push("# HELP db_pool_active_connections Number of active database connections");
  lines.push("# TYPE db_pool_active_connections gauge");
  lines.push(`db_pool_active_connections ${dbPool?.active ?? 0}`);

  lines.push("# HELP db_pool_idle_connections Number of idle database connections");
  lines.push("# TYPE db_pool_idle_connections gauge");
  lines.push(`db_pool_idle_connections ${dbPool?.idle ?? 0}`);

  // --- redis_connected ---
  lines.push("# HELP redis_connected Whether Redis is connected (1) or not (0)");
  lines.push("# TYPE redis_connected gauge");
  lines.push(`redis_connected ${redisUp}`);

  // --- process_memory_bytes ---
  lines.push("# HELP process_memory_bytes Process memory usage in bytes");
  lines.push("# TYPE process_memory_bytes gauge");
  const mem = process.memoryUsage();
  lines.push(`process_memory_bytes{type="rss"} ${mem.rss}`);
  lines.push(`process_memory_bytes{type="heap_used"} ${mem.heapUsed}`);
  lines.push(`process_memory_bytes{type="heap_total"} ${mem.heapTotal}`);
  lines.push(`process_memory_bytes{type="external"} ${mem.external}`);

  // --- process_uptime_seconds ---
  lines.push("# HELP process_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${Math.floor((Date.now() - processStartTime) / 1000)}`);

  return lines.join("\n") + "\n";
}

// =============================================================================
// Public accessor for health/detailed endpoint
// =============================================================================

export interface MetricsSnapshot {
  totalRequests: number;
  totalErrors: number;
  activeRequests: number;
  uptimeSeconds: number;
  memoryUsage: NodeJS.MemoryUsage;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return {
    totalRequests,
    totalErrors,
    activeRequests,
    uptimeSeconds: Math.floor((Date.now() - processStartTime) / 1000),
    memoryUsage: process.memoryUsage(),
  };
}

// =============================================================================
// Paths to skip in metrics collection
// =============================================================================

const SKIP_PATHS = new Set(["/metrics", "/health", "/health/ready", "/health/detailed"]);

// =============================================================================
// Elysia plugin
// =============================================================================

export function metricsPlugin() {
  return new Elysia({ name: "metrics" })
    .get("/metrics", async () => {
      const body = await formatPrometheus();
      return new Response(body, {
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    })
    .onBeforeHandle({ as: "global" }, (ctx) => {
      const { path } = ctx as unknown as { path: string };
      if (SKIP_PATHS.has(path)) return;
      activeRequests++;
      totalRequests++;
      (ctx as any)._metricsStart = performance.now();
    })
    .onAfterHandle({ as: "global" }, (ctx) => {
      const { path, set, request } = ctx as unknown as {
        path: string;
        set: { status: number };
        request: Request;
      };
      if (SKIP_PATHS.has(path)) return;
      activeRequests = Math.max(0, activeRequests - 1);

      const start = (ctx as any)._metricsStart;
      if (typeof start === "number") {
        const durationSec = (performance.now() - start) / 1000;
        const status = typeof set.status === "number" ? set.status : 200;
        const route = normalizeRoute(path);
        recordRequest(request.method, route, status, durationSec);
      }
    })
    .onError({ as: "global" }, (ctx) => {
      const { path, set, request } = ctx as unknown as {
        path: string;
        set: { status: number };
        request: Request;
      };
      if (SKIP_PATHS.has(path)) return;
      activeRequests = Math.max(0, activeRequests - 1);

      const start = (ctx as any)._metricsStart;
      if (typeof start === "number") {
        const durationSec = (performance.now() - start) / 1000;
        const status = typeof set.status === "number" ? set.status : 500;
        const route = normalizeRoute(path);
        recordRequest(request.method, route, status, durationSec);
      }
    });
}
