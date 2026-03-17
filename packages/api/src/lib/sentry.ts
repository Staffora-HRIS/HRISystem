// @ts-nocheck
/**
 * Sentry Error Tracking Integration
 *
 * Initializes Sentry SDK for error tracking in production.
 * Captures unhandled exceptions with request context (requestId, tenantId, userId).
 * Strips PII (emails, National Insurance numbers) from all events before sending.
 *
 * Configure via environment variables:
 *   SENTRY_DSN - Sentry Data Source Name (required for Sentry to be active)
 *   SENTRY_ENVIRONMENT - Override environment name (defaults to NODE_ENV)
 *   SENTRY_TRACES_SAMPLE_RATE - Performance monitoring sample rate (0.0 - 1.0, default: 0.1)
 *   SENTRY_RELEASE - Release version (defaults to package.json version)
 *
 * If SENTRY_DSN is not set, all exports are safe no-ops.
 */

import { logger } from "./logger";

let sentryInitialized = false;

// Lazy-cached Sentry module reference so we don't re-import on every call
let _sentry: typeof import("@sentry/node") | null = null;

async function getSentry(): Promise<typeof import("@sentry/node") | null> {
  if (_sentry) return _sentry;
  if (!sentryInitialized) return null;
  try {
    _sentry = await import("@sentry/node");
    return _sentry;
  } catch {
    return null;
  }
}

// =============================================================================
// PII Scrubbing
// =============================================================================

/**
 * UK National Insurance Number pattern (e.g., AB123456C).
 * Matches the standard HMRC format: 2 prefix letters, 6 digits, 1 suffix letter.
 */
const NI_NUMBER_REGEX = /\b[A-Za-z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Da-d]\b/g;

/**
 * Email address pattern — intentionally broad to catch most formats.
 */
const EMAIL_REGEX = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/**
 * Keys in request/event data that should always be fully redacted.
 */
const SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "nationalInsuranceNumber",
  "national_insurance_number",
  "niNumber",
  "ni_number",
  "nino",
  "sortCode",
  "sort_code",
  "accountNumber",
  "account_number",
  "bankAccountNumber",
  "bank_account_number",
];

/**
 * Recursively redact sensitive values from a plain object / array.
 * Returns a new object — does not mutate the original.
 */
function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return redactString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sk) => lowerKey === sk.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Redact emails and NI numbers from a string value.
 */
function redactString(value: string): string {
  return value
    .replace(EMAIL_REGEX, "[EMAIL_REDACTED]")
    .replace(NI_NUMBER_REGEX, "[NI_REDACTED]");
}

/**
 * Scrub PII from a Sentry event before it leaves the process.
 * - Redacts sensitive keys in request body data
 * - Strips emails and NI numbers from exception messages and breadcrumbs
 * - Strips query strings (may contain tokens/emails)
 */
function scrubEvent(
  event: import("@sentry/node").ErrorEvent
): import("@sentry/node").ErrorEvent | null {
  // Scrub request body data
  if (event.request?.data) {
    event.request.data = redactObject(event.request.data) as
      | string
      | Record<string, unknown>;
  }

  // Scrub query string (may contain tokens or email params)
  if (event.request?.query_string) {
    event.request.query_string = "[REDACTED]";
  }

  // Scrub exception messages
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) {
        ex.value = redactString(ex.value);
      }
    }
  }

  // Scrub breadcrumb messages
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.message) {
        crumb.message = redactString(crumb.message);
      }
    }
  }

  return event;
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Read the package version at init time.
 * Falls back to "0.1.0" if the file cannot be read (e.g., in bundled builds).
 */
async function readPackageVersion(): Promise<string> {
  try {
    const pkgPath = new URL("../../../package.json", import.meta.url);
    const pkg = await Bun.file(pkgPath).json();
    return (pkg as { version?: string }).version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

/**
 * Initialize Sentry if DSN is configured.
 * Safe to call multiple times -- only initializes once.
 *
 * @param processName - Optional label to distinguish API vs worker in Sentry
 *                      (e.g., "api", "worker"). Defaults to "api".
 */
export async function initSentry(
  processName: string = "api"
): Promise<void> {
  if (sentryInitialized) return;

  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) {
    logger.info("SENTRY_DSN not set, error tracking disabled");
    return;
  }

  try {
    const Sentry = await import("@sentry/node");

    const version = await readPackageVersion();
    const release =
      process.env["SENTRY_RELEASE"] || `staffora-${processName}@${version}`;

    Sentry.init({
      dsn,
      environment:
        process.env["SENTRY_ENVIRONMENT"] ||
        process.env["NODE_ENV"] ||
        "development",
      release,
      tracesSampleRate: parseFloat(
        process.env["SENTRY_TRACES_SAMPLE_RATE"] || "0.1"
      ),
      // Don't send PII by default
      sendDefaultPii: false,
      // Tag the server name with the process type so API and worker events
      // are easily distinguishable in the Sentry dashboard
      serverName: `staffora-${processName}`,
      // Filter out expected client errors and noise
      ignoreErrors: [
        "CSRF token is required",
        "Rate limit exceeded",
      ],
      // Strip PII (emails, NI numbers, sensitive fields) before sending
      beforeSend(event) {
        return scrubEvent(event);
      },
    });

    _sentry = Sentry;
    sentryInitialized = true;
    logger.info(
      { release, processName },
      "Sentry error tracking initialized"
    );
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to initialize Sentry — error tracking disabled"
    );
  }
}

// =============================================================================
// Public Helpers
// =============================================================================

/**
 * Capture an exception with optional request context.
 * No-op if Sentry is not initialized (i.e., SENTRY_DSN is not set).
 */
export async function captureException(
  error: Error | unknown,
  context?: {
    requestId?: string;
    tenantId?: string;
    userId?: string;
    path?: string;
    method?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  try {
    Sentry.withScope((scope) => {
      if (context?.requestId) scope.setTag("requestId", context.requestId);
      if (context?.tenantId) scope.setTag("tenantId", context.tenantId);
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.path) scope.setTag("path", context.path);
      if (context?.method) scope.setTag("method", context.method);
      if (context?.extra) scope.setExtras(context.extra);

      Sentry.captureException(error);
    });
  } catch {
    // Swallow Sentry errors to prevent cascading failures
  }
}

/**
 * Capture an informational or warning message.
 * No-op if Sentry is not initialized.
 */
export async function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  try {
    Sentry.captureMessage(message, level);
  } catch {
    // Swallow
  }
}

/**
 * Set the current user context on the Sentry scope.
 * No-op if Sentry is not initialized.
 */
export async function setUser(
  user: { id: string; email?: string; username?: string } | null
): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  try {
    Sentry.setUser(user);
  } catch {
    // Swallow
  }
}

/**
 * Set a tag on the current Sentry scope.
 * No-op if Sentry is not initialized.
 */
export async function setTag(
  key: string,
  value: string
): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  try {
    Sentry.setTag(key, value);
  } catch {
    // Swallow
  }
}

/**
 * Add a breadcrumb to the current Sentry scope.
 * Breadcrumbs provide a trail of events leading up to an error.
 * No-op if Sentry is not initialized.
 */
export async function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: "debug" | "info" | "warning" | "error";
  data?: Record<string, unknown>;
}): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  try {
    Sentry.addBreadcrumb(breadcrumb);
  } catch {
    // Swallow
  }
}

/**
 * Flush pending Sentry events before process exit.
 * Call this during graceful shutdown to avoid losing events.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  try {
    await Sentry.close(timeout);
  } catch {
    // Swallow errors during flush
  }
}
