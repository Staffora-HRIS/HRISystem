# APM / Distributed Tracing

This document describes the Application Performance Monitoring (APM) and distributed tracing setup for the Staffora HRIS platform, built on OpenTelemetry and Grafana Tempo.

## Architecture

```
                                   OTLP HTTP (:4318)
  +------------------+          +-------------------+
  |  staffora-api    | -------> |   Grafana Tempo   |
  |  (Elysia.js)    |          |   (trace storage)  |
  +------------------+          +-------------------+
                                         |
  +------------------+          +-------------------+
  |  staffora-worker | -------> |     Grafana       |
  |  (background)    |  OTLP    |  (visualization)  |
  +------------------+          +-------------------+
```

Both the API server and background worker emit traces via the OpenTelemetry SDK. Traces are sent over OTLP HTTP to Grafana Tempo, which stores and indexes them. Grafana provides the query and visualization layer, with cross-linking between traces (Tempo), logs (Loki), and metrics (Prometheus).

## Quick Start

### 1. Enable tracing

Set `OTEL_ENABLED=true` in your Docker `.env` file (or `docker/.env`):

```bash
OTEL_ENABLED=true
```

### 2. Start the monitoring stack

```bash
docker compose -f docker/docker-compose.yml --profile monitoring up -d
```

This starts Tempo alongside Prometheus, Loki, Promtail, and Grafana.

### 3. View traces in Grafana

1. Open Grafana at [http://localhost:3100](http://localhost:3100) (default credentials: `admin` / `staffora`)
2. Navigate to **Explore** in the left sidebar
3. Select **Tempo** as the datasource
4. Use TraceQL to search for traces, or browse by service name

### 4. Verify traces are flowing

Make a few API requests:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/auth/me
```

Then search in Grafana Explore with Tempo:

```
{ resource.service.name = "staffora-api" }
```

## Configuration

All configuration is via environment variables. Set them in `docker/.env` or pass directly.

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `false` | Master switch. Set to `true` to enable tracing. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` (local) / `http://tempo:4318` (Docker) | OTLP HTTP endpoint for the trace collector. |
| `OTEL_SERVICE_NAME` | `staffora-api` | Service name reported in spans. Automatically set to `staffora-worker` for the worker process. |
| `OTEL_SERVICE_VERSION` | `0.1.0` | Service version reported in resource attributes. |
| `OTEL_SAMPLE_RATE` | Environment-dependent | Sampling ratio from 0.0 to 1.0. See Sampling section below. |
| `OTEL_TRACES_SAMPLER_ARG` | (none) | Standard OTel env var, alternative to `OTEL_SAMPLE_RATE`. |
| `OTEL_CONSOLE_EXPORTER` | `true` (dev) / `false` (prod) | Also print spans to stdout for local debugging. |

### Docker Compose port variables

| Variable | Default | Description |
|---|---|---|
| `TEMPO_OTLP_GRPC_PORT` | `4317` | Host port for Tempo OTLP gRPC receiver |
| `TEMPO_OTLP_HTTP_PORT` | `4318` | Host port for Tempo OTLP HTTP receiver |
| `TEMPO_HTTP_PORT` | `3200` | Host port for Tempo query HTTP API |

## Sampling Strategy

The sampling rate determines what percentage of traces are recorded and exported. This is critical for controlling costs and storage in production while maintaining full visibility in development.

| Environment | Default Rate | Traces Captured |
|---|---|---|
| `production` | 0.1 (10%) | 1 in 10 requests |
| `staging` | 1.0 (100%) | Every request |
| `development` | 1.0 (100%) | Every request |
| `test` | 1.0 (100%) | Every request |

Override the default by setting `OTEL_SAMPLE_RATE` or `OTEL_TRACES_SAMPLER_ARG` to a value between 0.0 and 1.0. The `OTEL_SAMPLE_RATE` variable takes precedence if both are set.

The sampler is `TraceIdRatioBasedSampler`, which uses the trace ID to deterministically decide whether to sample. This means all spans within a single trace are either all sampled or all dropped, ensuring complete traces.

## What Gets Traced

### HTTP Requests (API)

The `tracingPlugin` (registered in the Elysia plugin chain) automatically creates a span for each incoming HTTP request with these attributes:

| Attribute | Description |
|---|---|
| `http.request.method` | HTTP method (GET, POST, etc.) |
| `url.full` | Full request URL |
| `url.path` | Request path |
| `url.scheme` | http or https |
| `http.response.status_code` | Response status code |
| `user_agent.original` | Client User-Agent header |
| `client.address` | Client IP from X-Forwarded-For |
| `staffora.tenant_id` | Tenant ID (set by tenant plugin) |
| `staffora.user_id` | Authenticated user ID |
| `staffora.request_id` | Correlation request ID |

Health check endpoints (`/health`, `/ready`, `/live`, `/`, `/docs`) are excluded from tracing to reduce noise.

### Background Jobs (Worker)

The worker initializes telemetry with `serviceName: "staffora-worker"`. Job processors can create spans using the `withSpan` helper:

```typescript
import { withSpan, SpanKind } from "../lib/telemetry";

await withSpan("process-notification", { kind: SpanKind.CONSUMER }, async (span) => {
  span.setAttribute("job.type", "notification");
  span.setAttribute("job.id", jobId);
  // ... process the job
});
```

### Custom Spans

Any code can create spans using the helpers from `packages/api/src/lib/telemetry.ts`:

```typescript
import { withSpan, getTracer, SpanKind } from "../lib/telemetry";

// Option 1: withSpan helper (recommended)
const result = await withSpan("db.query.employees", async (span) => {
  span.setAttribute("db.system", "postgresql");
  span.setAttribute("db.statement", "SELECT * FROM employees WHERE ...");
  return await db.query(...);
});

// Option 2: Manual span management
const tracer = getTracer("my-module");
const span = tracer.startSpan("custom-operation", { kind: SpanKind.INTERNAL });
try {
  // ... do work
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
} finally {
  span.end();
}
```

## W3C Trace Context Propagation

The tracing plugin handles W3C Trace Context propagation:

- **Incoming**: Parses the `traceparent` header from incoming requests to continue an existing trace (e.g., from a frontend or upstream service).
- **Outgoing**: Sets the `traceparent` response header so downstream services or browser DevTools can correlate requests.

The `traceparent` header format follows the W3C standard:
```
traceparent: 00-<traceId>-<spanId>-<traceFlags>
```

### Bun Compatibility

Because Bun does not fully support `AsyncLocalStorage`, the standard OpenTelemetry context propagation via `trace.getActiveSpan()` does not work. Instead:

- The tracing plugin stores the span in the Elysia request context as `requestSpan`.
- The `withSpan` helper passes the span as a function argument rather than relying on implicit context.
- Traceparent headers are parsed and built manually (not via the `@opentelemetry/core` propagator).

## Grafana Integration

### Datasource Cross-Linking

The monitoring stack is configured with full cross-referencing between the three observability pillars:

- **Traces to Logs**: Click a span in Tempo to see related log entries in Loki (matched by traceId, time window, and service name).
- **Logs to Traces**: Click a traceId in a Loki log line to open the full trace in Tempo.
- **Traces to Metrics**: From a trace span, jump to Prometheus metrics for the same service and time window.

### Example TraceQL Queries

Find all traces for a specific tenant:
```
{ span.staffora.tenant_id = "550e8400-e29b-41d4-a716-446655440000" }
```

Find slow API requests (over 1 second):
```
{ resource.service.name = "staffora-api" && duration > 1s }
```

Find error traces:
```
{ resource.service.name = "staffora-api" && status = error }
```

Find traces for a specific endpoint:
```
{ span.url.path = "/api/v1/hr/employees" && span.http.request.method = "GET" }
```

Find worker job traces:
```
{ resource.service.name = "staffora-worker" }
```

## Infrastructure Details

### Tempo Configuration

The Tempo configuration file is at `docker/tempo/tempo.yaml`. Key settings:

- **Receivers**: OTLP gRPC (`:4317`) and OTLP HTTP (`:4318`)
- **Storage**: Local filesystem at `/tmp/tempo` (suitable for development)
- **Retention**: 72 hours (3 days) for local development
- **Metrics Generator**: Produces service graph and span metrics from ingested traces

For production, replace local storage with S3 or GCS and increase retention.

### OpenTelemetry SDK

The SDK is initialized in `packages/api/src/lib/telemetry.ts` with:

- **Provider**: `BasicTracerProvider` from `@opentelemetry/sdk-trace-base`
- **Exporter**: `OTLPTraceExporter` (HTTP/protobuf) from `@opentelemetry/exporter-trace-otlp-http`
- **Processor**: `BatchSpanProcessor` for efficient batched export
- **Sampler**: `TraceIdRatioBasedSampler` (when rate < 1.0)
- **Resource attributes**: `service.name`, `service.version`, `deployment.environment.name`

### Elysia Plugin Chain Position

The tracing plugin is registered in the Elysia plugin chain at this position:

```
1. cors
2. securityHeaders
3. swagger
4. errorsPlugin       <-- generates requestId
5. metricsPlugin      <-- Prometheus metrics
6. tracingPlugin      <-- OpenTelemetry spans (HERE)
7. dbPlugin
8. cachePlugin
9. rateLimitPlugin
10. betterAuthPlugin
11. authPlugin        <-- sets userId
12. tenantPlugin      <-- sets tenantId
13. rbacPlugin
14. idempotencyPlugin
15. auditPlugin
```

The tracing plugin runs after error handling (so errors are captured in spans) and before auth/tenant plugins (so it can enrich spans with userId and tenantId in the `onAfterHandle` hook).

## Graceful Shutdown

Both the API and worker processes flush pending spans during graceful shutdown:

- **API**: `SIGTERM`/`SIGINT` handlers call `shutdownTelemetry()` which flushes the `BatchSpanProcessor` and shuts down the provider.
- **Worker**: The existing graceful shutdown sequence calls `shutdownTelemetry()` after draining active jobs.

This ensures no trace data is lost during deployments or restarts.

## Production Considerations

### Storage Backend

For production deployments, replace the local storage backend in `tempo.yaml` with an object store:

```yaml
storage:
  trace:
    backend: s3
    s3:
      bucket: staffora-tempo-traces
      endpoint: s3.eu-west-2.amazonaws.com
      region: eu-west-2
```

### Retention

Adjust the `block_retention` in `tempo.yaml` based on your needs:
- Development: 72 hours (default)
- Staging: 7 days
- Production: 14-30 days

### Sampling

In production, the default 10% sampling rate balances observability with cost. For debugging specific issues, temporarily increase the rate:

```bash
OTEL_SAMPLE_RATE=1.0  # 100% for debugging
```

Consider implementing head-based or tail-based sampling for more sophisticated strategies.

### Resource Limits

The Docker Compose configuration sets these resource limits for Tempo:
- CPU: 1 core (limit), 0.25 core (reservation)
- Memory: 1GB (limit), 256MB (reservation)

For production with high trace volume, increase these limits and consider running Tempo in microservices mode.

## Troubleshooting

### No traces appearing in Grafana

1. Verify `OTEL_ENABLED=true` is set in the API/worker environment.
2. Check that Tempo is running: `docker compose ps tempo`
3. Check Tempo health: `curl http://localhost:3200/ready`
4. Check API logs for `[Telemetry] Initialized` message.
5. Verify the OTLP endpoint is reachable from the API container:
   ```bash
   docker compose exec api wget -q -O- http://tempo:3200/ready
   ```

### Traces are incomplete (missing spans)

- The sampling rate may be dropping traces. Set `OTEL_SAMPLE_RATE=1.0` temporarily.
- Check for errors in API/worker logs related to OTLP export failures.

### High memory usage in Tempo

- Reduce `block_retention` to keep fewer traces.
- Increase Tempo resource limits in docker-compose.yml.
- Consider switching to S3 backend for production.

## File Reference

| File | Purpose |
|---|---|
| `packages/api/src/lib/telemetry.ts` | OpenTelemetry SDK initialization, configuration, span helpers |
| `packages/api/src/plugins/tracing.ts` | Elysia plugin for per-request span creation and W3C propagation |
| `packages/api/src/app.ts` | API entry point (calls `initTelemetry`, registers `tracingPlugin`) |
| `packages/api/src/worker.ts` | Worker entry point (calls `initTelemetry` with `staffora-worker`) |
| `docker/tempo/tempo.yaml` | Grafana Tempo server configuration |
| `docker/docker-compose.yml` | Tempo service definition (monitoring profile) |
| `docker/grafana/provisioning/datasources/tempo.yml` | Grafana Tempo datasource provisioning |
| `docker/.env.example` | Environment variable documentation |
