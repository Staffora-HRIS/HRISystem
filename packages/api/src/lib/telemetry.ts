/**
 * OpenTelemetry Setup Module
 *
 * Initializes distributed tracing for the Staffora API and Worker services.
 * Uses the OpenTelemetry SDK with OTLP HTTP exporter (compatible with Jaeger,
 * Grafana Tempo, etc.)
 *
 * Bun Compatibility Notes:
 * - Bun does not fully support AsyncLocalStorage, so trace.getActiveSpan()
 *   does NOT work. Instead, we pass span references explicitly through the
 *   Elysia request context (requestSpan) and job context.
 * - Uses manual instrumentation rather than Node.js auto-instrumentation.
 * - W3C traceparent headers are parsed/serialized manually since the
 *   @opentelemetry/core propagator requires AsyncLocalStorage for context.
 * - All span creation and context propagation is explicit.
 *
 * Environment Variables:
 * - OTEL_ENABLED: "true" to enable tracing (default: "false")
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP HTTP endpoint (default: "http://localhost:4318")
 * - OTEL_SERVICE_NAME: Service name (default: "staffora-api")
 * - OTEL_SERVICE_VERSION: Service version (default: "0.1.0")
 * - OTEL_CONSOLE_EXPORTER: "true" to also log spans to console
 * - OTEL_SAMPLE_RATE: Sampling rate 0.0-1.0 (overrides environment default)
 * - OTEL_TRACES_SAMPLER_ARG: Alternative env var for sampling ratio (standard OTel name)
 *
 * Sampling Defaults (when neither OTEL_SAMPLE_RATE nor OTEL_TRACES_SAMPLER_ARG is set):
 * - production: 0.1 (10% of traces)
 * - staging:    1.0 (100% of traces)
 * - development/test: 1.0 (100% of traces)
 */

import {
  trace,
  SpanStatusCode,
  SpanKind,
  TraceFlags,
} from "@opentelemetry/api";
import type {
  Tracer,
  Span,
  SpanOptions,
  SpanContext,
} from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

// =============================================================================
// Configuration
// =============================================================================

export interface TelemetryConfig {
  enabled: boolean;
  endpoint: string;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  consoleExporter: boolean;
  sampleRate: number;
}

/**
 * Resolve the sampling rate from environment variables with sensible defaults.
 *
 * Priority:
 *   1. OTEL_SAMPLE_RATE (Staffora-specific, 0.0-1.0)
 *   2. OTEL_TRACES_SAMPLER_ARG (standard OTel env var, 0.0-1.0)
 *   3. Environment-based default: production=0.1, staging=1.0, other=1.0
 */
function resolveSampleRate(): number {
  const explicit =
    process.env["OTEL_SAMPLE_RATE"] ||
    process.env["OTEL_TRACES_SAMPLER_ARG"];
  if (explicit) {
    const parsed = parseFloat(explicit);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  // Environment-aware defaults
  const env = process.env["NODE_ENV"] || "development";
  if (env === "production") return 0.1;
  // staging, development, test => 100%
  return 1.0;
}

export function loadTelemetryConfig(): TelemetryConfig {
  const isProd = process.env["NODE_ENV"] === "production";
  return {
    enabled: process.env["OTEL_ENABLED"] === "true",
    endpoint:
      process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] || "http://localhost:4318",
    serviceName: process.env["OTEL_SERVICE_NAME"] || "staffora-api",
    serviceVersion: process.env["OTEL_SERVICE_VERSION"] || "0.1.0",
    environment: process.env["NODE_ENV"] || "development",
    consoleExporter:
      process.env["OTEL_CONSOLE_EXPORTER"] === "true" ||
      (!isProd && process.env["OTEL_CONSOLE_EXPORTER"] !== "false"),
    sampleRate: resolveSampleRate(),
  };
}

// =============================================================================
// Provider
// =============================================================================

let provider: BasicTracerProvider | null = null;

/**
 * Initialize the OpenTelemetry SDK. No-op when OTEL_ENABLED is not "true".
 * Safe to call multiple times; subsequent calls return false.
 */
export function initTelemetry(
  configOverride?: Partial<TelemetryConfig>,
): boolean {
  if (provider) return false;

  const cfg = { ...loadTelemetryConfig(), ...configOverride };
  if (!cfg.enabled) return false;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: cfg.serviceName,
    [ATTR_SERVICE_VERSION]: cfg.serviceVersion,
    "deployment.environment.name": cfg.environment,
  });

  const sampler =
    cfg.sampleRate < 1.0
      ? new TraceIdRatioBasedSampler(cfg.sampleRate)
      : undefined;

  // Build span processors list
  const processors = [];

  // OTLP exporter (batched for performance)
  const otlpExporter = new OTLPTraceExporter({
    url: `${cfg.endpoint}/v1/traces`,
  });
  processors.push(new BatchSpanProcessor(otlpExporter as any));

  // Console exporter for local debugging (not in tests)
  if (cfg.consoleExporter && !process.env["NODE_ENV"]?.includes("test")) {
    processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  provider = new BasicTracerProvider({
    resource,
    spanProcessors: processors,
    ...(sampler ? { sampler } : {}),
  });

  // Register the provider globally via the OTel API proxy.
  // In @opentelemetry/api v2, provider.register() was removed.
  // The proxy tracer provider has a setDelegate() method to wire the real provider.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxyProvider = (trace as any)._proxyTracerProvider;
  if (proxyProvider?.setDelegate) {
    proxyProvider.setDelegate(provider);
  }

  console.log(
    `[Telemetry] Initialized: service=${cfg.serviceName} endpoint=${cfg.endpoint} rate=${cfg.sampleRate}`,
  );
  return true;
}

/** Flush pending spans and shut down the SDK. */
export async function shutdownTelemetry(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
    console.log("[Telemetry] Shut down");
  }
}

// =============================================================================
// Tracer Access
// =============================================================================

/** Get a tracer (no-op tracer if OTel is not initialized). */
export function getTracer(name = "staffora-api"): Tracer {
  return trace.getTracer(name);
}

/** Whether telemetry is currently enabled and initialized. */
export function isTelemetryEnabled(): boolean {
  return provider !== null;
}

// =============================================================================
// W3C Traceparent Parsing (manual, Bun-compatible)
// =============================================================================

/**
 * Parse a W3C traceparent header into its components.
 * Format: "00-<traceId>-<parentSpanId>-<traceFlags>"
 *
 * Returns null if the header is missing or malformed.
 */
export function parseTraceparent(
  header: string | null | undefined,
): { traceId: string; spanId: string; traceFlags: number } | null {
  if (!header) return null;
  const parts = header.split("-");
  if (parts.length !== 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (version !== "00") return null;
  if (traceId.length !== 32 || spanId.length !== 16) return null;
  if (traceId === "00000000000000000000000000000000") return null;
  if (spanId === "0000000000000000") return null;
  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16) || TraceFlags.NONE,
  };
}

/**
 * Build a W3C traceparent header from a span context.
 */
export function buildTraceparent(spanContext: SpanContext): string {
  const flags = (spanContext.traceFlags ?? TraceFlags.SAMPLED)
    .toString(16)
    .padStart(2, "0");
  return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
}

// =============================================================================
// Convenience Span Helper
// =============================================================================

/**
 * Run a function within a new span. Automatically sets span status on error
 * and ends the span when the function completes.
 *
 * Note: Due to Bun not supporting AsyncLocalStorage, this does NOT make the
 * span "active" in the OTel context. The span is passed as an argument instead.
 */
export async function withSpan<T>(
  name: string,
  optionsOrFn: SpanOptions | ((span: Span) => Promise<T>),
  maybeFn?: (span: Span) => Promise<T>,
): Promise<T> {
  const options = typeof optionsOrFn === "function" ? {} : optionsOrFn;
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn!;

  const tracer = getTracer();
  const span = tracer.startSpan(name, options);
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  } finally {
    span.end();
  }
}

// Re-export commonly used OTel types for convenience
export { SpanStatusCode, SpanKind, trace } from "@opentelemetry/api";
export type { Tracer, Span, SpanOptions, SpanContext } from "@opentelemetry/api";
