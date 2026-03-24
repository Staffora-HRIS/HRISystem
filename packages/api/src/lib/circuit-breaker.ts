/**
 * Circuit Breaker for External Service Calls
 *
 * Lightweight circuit breaker implementation that prevents cascading failures
 * when external services (HMRC, SMTP, S3, Firebase, webhooks) are unavailable.
 *
 * States:
 * - CLOSED:    Normal operation. Requests pass through. Failures are counted.
 * - OPEN:      Service considered down. All requests fail immediately without
 *              calling the external service. Reduces latency and load.
 * - HALF_OPEN: After the reset timeout, a limited number of probe requests are
 *              allowed through. If they succeed, the circuit closes. If they
 *              fail, the circuit re-opens.
 *
 * No external dependencies — pure TypeScript.
 *
 * Usage:
 *   import { CircuitBreaker } from "../../lib/circuit-breaker";
 *
 *   // HMRC RTI submission
 *   const hmrcBreaker = new CircuitBreaker("hmrc", { failureThreshold: 3, resetTimeoutMs: 60_000 });
 *   const result = await hmrcBreaker.execute(() => fetch(hmrcUrl, { method: "POST", body }));
 *
 *   // SMTP email delivery (notification-worker.ts)
 *   const smtpBreaker = new CircuitBreaker("smtp", { failureThreshold: 5 });
 *   await smtpBreaker.execute(() => transporter.sendMail(mailOptions));
 *
 *   // S3 file uploads (export-worker.ts, storage.ts)
 *   const s3Breaker = new CircuitBreaker("s3", { failureThreshold: 5, resetTimeoutMs: 15_000 });
 *   await s3Breaker.execute(() => s3Client.send(new PutObjectCommand(params)));
 *
 *   // Firebase Cloud Messaging (notification-worker.ts)
 *   const fcmBreaker = new CircuitBreaker("fcm", { failureThreshold: 5 });
 *   await fcmBreaker.execute(() => messaging.send(message));
 *
 *   // Webhook delivery (webhooks/service.ts)
 *   const webhookBreaker = new CircuitBreaker("webhook:tenant-abc", { failureThreshold: 3 });
 *   await webhookBreaker.execute(() => fetch(webhookUrl, { method: "POST", body: payload }));
 */

import { logger } from "./logger";

// =============================================================================
// Types
// =============================================================================

/** The three possible circuit breaker states. */
export type CircuitBreakerState = "closed" | "open" | "half_open";

/** Configuration options for a CircuitBreaker instance. */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;

  /** Time in milliseconds to wait before moving from OPEN to HALF_OPEN. Default: 30000 (30s) */
  resetTimeoutMs?: number;

  /**
   * Maximum number of probe requests allowed while in HALF_OPEN state.
   * If all succeed, the circuit closes. If any fails, the circuit re-opens.
   * Default: 1
   */
  halfOpenMax?: number;
}

/**
 * Error thrown when the circuit breaker is open and blocking requests.
 * Callers can check `instanceof CircuitBreakerOpenError` to distinguish
 * this from actual service failures.
 */
export class CircuitBreakerOpenError extends Error {
  /** The name of the service whose circuit is open. */
  public readonly serviceName: string;

  /** Timestamp (ms since epoch) when the circuit will transition to HALF_OPEN. */
  public readonly retryAfterMs: number;

  constructor(serviceName: string, retryAfterMs: number) {
    const retryInSec = Math.ceil((retryAfterMs - Date.now()) / 1000);
    super(
      `Circuit breaker open for service "${serviceName}". ` +
        `Retry in ~${Math.max(retryInSec, 0)}s.`
    );
    this.name = "CircuitBreakerOpenError";
    this.serviceName = serviceName;
    this.retryAfterMs = retryAfterMs;
  }
}

// =============================================================================
// Circuit Breaker
// =============================================================================

export class CircuitBreaker {
  /** Human-readable name used in logs and error messages. */
  public readonly name: string;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMax: number;

  /** Current state of the circuit. */
  private _state: CircuitBreakerState = "closed";

  /** Count of consecutive failures (reset on success or manual reset). */
  private consecutiveFailures = 0;

  /** Timestamp (ms) when the circuit transitioned to OPEN. */
  private openedAt = 0;

  /** Number of in-flight probe requests during HALF_OPEN. */
  private halfOpenAttempts = 0;

  constructor(name: string, options?: CircuitBreakerOptions) {
    this.name = name;
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30_000;
    this.halfOpenMax = options?.halfOpenMax ?? 1;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute an async operation through the circuit breaker.
   *
   * - If the circuit is CLOSED, the operation runs normally.
   * - If the circuit is OPEN and the reset timeout has not elapsed, throws
   *   `CircuitBreakerOpenError` immediately.
   * - If the circuit is OPEN and the reset timeout has elapsed, transitions
   *   to HALF_OPEN and allows a limited number of probe requests.
   *
   * @param fn  Async function wrapping the external service call.
   * @returns   The resolved value of `fn`.
   * @throws    `CircuitBreakerOpenError` when the circuit is open.
   * @throws    The original error from `fn` when the circuit is closed or half-open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check whether an OPEN circuit should transition to HALF_OPEN.
    if (this._state === "open") {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this.transitionTo("half_open");
      } else {
        throw new CircuitBreakerOpenError(
          this.name,
          this.openedAt + this.resetTimeoutMs
        );
      }
    }

    // In HALF_OPEN, only allow up to `halfOpenMax` concurrent probes.
    if (this._state === "half_open") {
      if (this.halfOpenAttempts >= this.halfOpenMax) {
        throw new CircuitBreakerOpenError(
          this.name,
          this.openedAt + this.resetTimeoutMs
        );
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Current circuit state. */
  get state(): CircuitBreakerState {
    // If the circuit is open and the timeout has passed, report half_open.
    if (
      this._state === "open" &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      return "half_open";
    }
    return this._state;
  }

  /** Number of consecutive failures recorded. */
  get failures(): number {
    return this.consecutiveFailures;
  }

  /** Manually reset the circuit to CLOSED. Useful in tests or admin actions. */
  reset(): void {
    this.consecutiveFailures = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = 0;
    this.transitionTo("closed");
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private onSuccess(): void {
    if (this._state === "half_open") {
      // Probe succeeded — close the circuit.
      logger.info(
        `Circuit breaker "${this.name}": probe succeeded, closing circuit`
      );
      this.reset();
    } else {
      // Normal success — reset failure counter.
      this.consecutiveFailures = 0;
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;

    if (this._state === "half_open") {
      // Probe failed — reopen immediately.
      logger.warn(
        `Circuit breaker "${this.name}": probe failed, re-opening circuit`
      );
      this.halfOpenAttempts = 0;
      this.openedAt = Date.now();
      this.transitionTo("open");
    } else if (this.consecutiveFailures >= this.failureThreshold) {
      // Threshold reached — open the circuit.
      logger.warn(
        `Circuit breaker "${this.name}": ${this.consecutiveFailures} consecutive failures, opening circuit`
      );
      this.openedAt = Date.now();
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this._state !== newState) {
      logger.info(
        `Circuit breaker "${this.name}": ${this._state} -> ${newState}`
      );
      this._state = newState;

      if (newState === "half_open") {
        this.halfOpenAttempts = 0;
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new CircuitBreaker instance.
 *
 * Convenience factory that mirrors the constructor but reads nicely as a
 * standalone import:
 *
 * ```ts
 * import { createCircuitBreaker } from "../../lib/circuit-breaker";
 * const breaker = createCircuitBreaker("hmrc", { failureThreshold: 3 });
 * ```
 */
export function createCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  return new CircuitBreaker(name, options);
}
