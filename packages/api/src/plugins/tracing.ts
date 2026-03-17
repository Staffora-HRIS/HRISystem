/**
 * Tracing Plugin for Elysia
 *
 * Creates a span for each incoming HTTP request, propagates W3C Trace Context,
 * and enriches spans with request/response attributes following OpenTelemetry
 * semantic conventions.
 *
 * When OpenTelemetry is disabled (OTEL_ENABLED !== "true"), this plugin is a
 * lightweight no-op: it still derives traceId/spanId fields (as undefined) so
 * downstream code compiles without conditional checks.
 *
 * Bun Compatibility Notes:
 * - Uses manual instrumentation rather than Node.js auto-instrumentation hooks
 * - All span creation and context propagation is explicit
 * - Does NOT rely on AsyncLocalStorage (trace.getActiveSpan() is broken in Bun)
 * - Traceparent headers are parsed/built manually
 */

import { Elysia } from "elysia";
import { SpanStatusCode, SpanKind } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import {
  parseTraceparent,
  buildTraceparent,
  getTracer,
  isTelemetryEnabled,
} from "../lib/telemetry";

// =============================================================================
// HTTP Semantic Convention Attributes (string literals, version-agnostic)
// =============================================================================

const ATTR = {
  HTTP_METHOD: "http.request.method",
  HTTP_URL: "url.full",
  HTTP_TARGET: "url.path",
  HTTP_STATUS_CODE: "http.response.status_code",
  HTTP_SCHEME: "url.scheme",
  HTTP_USER_AGENT: "user_agent.original",
  CLIENT_ADDRESS: "client.address",
  // Custom Staffora attributes
  TENANT_ID: "staffora.tenant_id",
  USER_ID: "staffora.user_id",
  REQUEST_ID: "staffora.request_id",
} as const;

// =============================================================================
// Plugin
// =============================================================================

export interface TracingPluginOptions {
  /**
   * Paths to exclude from tracing (exact match).
   * Defaults to health/readiness/liveness endpoints.
   */
  excludePaths?: string[];
}

/**
 * Elysia plugin that creates an OpenTelemetry span for each incoming request.
 *
 * Registration order: AFTER errorsPlugin, BEFORE dbPlugin and other plugins.
 * This ensures the span wraps the full request lifecycle including error handling.
 */
export function tracingPlugin(options?: TracingPluginOptions) {
  const excludePaths = new Set(
    options?.excludePaths ?? [
      "/health",
      "/ready",
      "/live",
      "/",
      "/docs",
      "/docs/json",
    ],
  );

  return new Elysia({ name: "tracing" })
    // Derive traceId and spanId for every request so downstream plugins/handlers
    // can include them in logs, error responses, etc.
    .derive({ as: "global" }, ({ request, set }) => {
      if (!isTelemetryEnabled()) {
        return {
          traceId: undefined as string | undefined,
          spanId: undefined as string | undefined,
          requestSpan: undefined as Span | undefined,
        };
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      // Skip tracing for excluded paths
      if (excludePaths.has(pathname)) {
        return {
          traceId: undefined as string | undefined,
          spanId: undefined as string | undefined,
          requestSpan: undefined as Span | undefined,
        };
      }

      // Parse incoming W3C traceparent header for distributed trace propagation
      const incomingTraceparent = request.headers.get("traceparent");
      const parentInfo = parseTraceparent(incomingTraceparent);

      // Create the request span
      const tracer = getTracer("staffora-api");
      const span = tracer.startSpan(`${request.method} ${pathname}`, {
        kind: SpanKind.SERVER,
        attributes: {
          [ATTR.HTTP_METHOD]: request.method,
          [ATTR.HTTP_URL]: request.url,
          [ATTR.HTTP_TARGET]: pathname,
          [ATTR.HTTP_SCHEME]: url.protocol.replace(":", ""),
          [ATTR.HTTP_USER_AGENT]:
            request.headers.get("user-agent") || undefined,
          [ATTR.CLIENT_ADDRESS]:
            request.headers.get("x-forwarded-for") || undefined,
        },
        // Link to parent trace if traceparent was provided
        ...(parentInfo
          ? {
              links: [
                {
                  context: {
                    traceId: parentInfo.traceId,
                    spanId: parentInfo.spanId,
                    traceFlags: parentInfo.traceFlags,
                  },
                },
              ],
            }
          : {}),
      });

      const spanContext = span.spanContext();

      // Set traceparent response header for downstream correlation
      set.headers["traceparent"] = buildTraceparent(spanContext);

      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        requestSpan: span,
      };
    })

    // After response: enrich span with result attributes and end it
    .onAfterHandle({ as: "global" }, (ctx) => {
      const { requestSpan, set } = ctx as typeof ctx & {
        requestSpan?: Span;
      };

      if (!requestSpan) return;

      // Set status code
      const statusCode =
        typeof set.status === "number" ? set.status : 200;
      requestSpan.setAttribute(ATTR.HTTP_STATUS_CODE, statusCode);

      // Enrich with tenant/user context if available (set by later plugins)
      const anyCtx = ctx as Record<string, unknown>;
      if (
        anyCtx["tenantId"] &&
        typeof anyCtx["tenantId"] === "string"
      ) {
        requestSpan.setAttribute(
          ATTR.TENANT_ID,
          anyCtx["tenantId"] as string,
        );
      }
      if (anyCtx["userId"] && typeof anyCtx["userId"] === "string") {
        requestSpan.setAttribute(
          ATTR.USER_ID,
          anyCtx["userId"] as string,
        );
      }
      if (
        anyCtx["requestId"] &&
        typeof anyCtx["requestId"] === "string"
      ) {
        requestSpan.setAttribute(
          ATTR.REQUEST_ID,
          anyCtx["requestId"] as string,
        );
      }

      if (statusCode < 400) {
        requestSpan.setStatus({ code: SpanStatusCode.OK });
      }
      requestSpan.end();
    })

    // On error: record exception on the span and set error status
    .onError({ as: "global" }, (ctx) => {
      const { requestSpan, error, set } = ctx as typeof ctx & {
        requestSpan?: Span;
      };

      if (!requestSpan) return;

      const statusCode =
        typeof set.status === "number" ? set.status : 500;
      requestSpan.setAttribute(ATTR.HTTP_STATUS_CODE, statusCode);

      requestSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message:
          error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        requestSpan.recordException(error);
      }

      // Enrich with requestId if available
      const anyCtx = ctx as Record<string, unknown>;
      if (
        anyCtx["requestId"] &&
        typeof anyCtx["requestId"] === "string"
      ) {
        requestSpan.setAttribute(
          ATTR.REQUEST_ID,
          anyCtx["requestId"] as string,
        );
      }

      requestSpan.end();
    });
}
