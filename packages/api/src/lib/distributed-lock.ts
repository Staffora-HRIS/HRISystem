/**
 * Distributed Lock with Redlock-style Safety (Single-Instance)
 *
 * Implements the core Redlock algorithm safety properties for a single Redis
 * instance, addressing the shortcomings of simple SET NX EX:
 *
 * 1. **Fencing tokens** — Monotonically increasing tokens that downstream
 *    systems can use to reject stale operations from expired lock holders.
 *    Prevents the "delayed operation" problem where a lock holder's operation
 *    arrives after the lock has expired and been re-acquired.
 *
 * 2. **Auto-renewal** — Background heartbeat extends the lock TTL while the
 *    critical section is executing, preventing premature expiry during long
 *    operations (e.g., GC pauses, I/O delays).
 *
 * 3. **Safe release via Lua** — Atomic compare-and-delete ensures only the
 *    lock owner can release. Uses lock value comparison (not just key deletion)
 *    to prevent releasing another holder's lock.
 *
 * 4. **Clock drift compensation** — TTL is reduced by a drift factor to
 *    account for Redis internal clock imprecision and network latency.
 *
 * 5. **Acquire-time validation** — The time spent acquiring the lock is
 *    subtracted from the validity period. If acquisition takes too long
 *    relative to TTL, the lock is immediately released.
 *
 * This module creates its own ioredis connection so it can be used from the
 * scheduler (which runs outside the Elysia plugin lifecycle).
 *
 * References:
 * - https://redis.io/docs/manual/patterns/distributed-locks/
 * - Martin Kleppmann's "Designing Data-Intensive Applications" (fencing tokens)
 */

import Redis from "ioredis";
import { getRedisUrl } from "../config/database";
import { logger } from "./logger";

// =============================================================================
// Types
// =============================================================================

export interface LockOptions {
  /** Lock TTL in seconds. Auto-releases after this time to prevent deadlocks. */
  ttlSeconds: number;
  /** How long to wait for lock acquisition in milliseconds (0 = don't wait, try once). */
  waitTimeoutMs?: number;
  /** Retry interval in milliseconds when waiting for lock. */
  retryIntervalMs?: number;
  /**
   * Enable auto-renewal of the lock TTL while work is in progress.
   * The lock will be extended at (ttlSeconds * renewalFraction) intervals.
   * Default: true
   */
  autoRenew?: boolean;
  /**
   * Fraction of TTL at which to renew. E.g., 0.5 means renew halfway through.
   * Default: 0.5
   */
  renewalFraction?: number;
}

export interface LockHandle {
  /** The full Redis key used for this lock. */
  key: string;
  /** The unique value identifying this lock owner. */
  value: string;
  /**
   * Monotonically increasing fencing token. Downstream systems should reject
   * operations bearing a token lower than the highest token they have seen
   * for this resource. This prevents delayed writes from stale lock holders.
   */
  fencingToken: number;
  /**
   * Remaining validity time in milliseconds at time of acquisition.
   * If work takes longer than this, the lock has expired (unless auto-renewed).
   */
  validityMs: number;
  /** Release the lock. Returns true if this instance still owned it, false if it expired. */
  release: () => Promise<boolean>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Clock drift factor as recommended by the Redlock specification.
 * Accounts for Redis internal clock imprecision and network delays.
 * TTL is effectively reduced by (ttl * CLOCK_DRIFT_FACTOR + 2ms).
 */
const CLOCK_DRIFT_FACTOR = 0.01;

/**
 * Fixed clock drift base in milliseconds, added to proportional drift.
 */
const CLOCK_DRIFT_BASE_MS = 2;

/**
 * Redis key used for the global fencing token counter.
 * Uses INCR for atomic monotonic increments.
 */
const FENCING_TOKEN_KEY = "lock:__fencing_token_counter";

// =============================================================================
// Lua Scripts
// =============================================================================

/**
 * Atomic compare-and-delete script.
 * Only deletes the key if the current value matches the expected value,
 * preventing one instance from releasing another instance's lock.
 *
 * KEYS[1] = lock key
 * ARGV[1] = expected lock value
 * Returns 1 if deleted, 0 if value didn't match (lock expired and was re-acquired).
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Atomic compare-and-extend script.
 * Extends the lock TTL only if the current value matches the expected value.
 * Used by the auto-renewal heartbeat to safely extend lock lifetime.
 *
 * KEYS[1] = lock key
 * ARGV[1] = expected lock value
 * ARGV[2] = new TTL in milliseconds
 * Returns 1 if extended, 0 if value didn't match (lock was lost).
 */
const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

// =============================================================================
// Lock Value Generation
// =============================================================================

/**
 * Generate a unique lock value to identify the lock owner.
 * Combines PID, timestamp, and cryptographic random string for uniqueness
 * across processes and restarts. Uses crypto.randomUUID() for stronger
 * uniqueness than Math.random().
 */
function generateLockValue(): string {
  return `${process.pid}:${Date.now()}:${crypto.randomUUID()}`;
}

// =============================================================================
// Redis Client Management
// =============================================================================

let redisClient: Redis | null = null;

/**
 * Get or create the Redis client used for distributed locking.
 * Uses a dedicated connection separate from the cache plugin to avoid
 * blocking the main application Redis connection during lock operations.
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      keyPrefix: "staffora:",
      enableReadyCheck: true,
    });

    redisClient.on("error", (err) => {
      logger.warn({ error: err.message }, "DistributedLock Redis error");
    });
  }

  return redisClient;
}

// =============================================================================
// Auto-Renewal
// =============================================================================

/**
 * Active renewal timers, keyed by lock key + value.
 * Tracked so they can be cancelled on release.
 */
const activeRenewals = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Start auto-renewal heartbeat for a lock. Periodically extends the lock TTL
 * to prevent premature expiry during long-running critical sections.
 *
 * The heartbeat fires at (ttlMs * renewalFraction) intervals and extends the
 * lock for the full original TTL. If extension fails (lock was lost), the
 * heartbeat stops automatically.
 *
 * @param lockKey - The full Redis key (without prefix, ioredis adds it)
 * @param lockValue - The unique lock owner value
 * @param ttlMs - The original lock TTL in milliseconds
 * @param renewalFraction - Fraction of TTL at which to renew (e.g. 0.5 = halfway)
 */
function startRenewal(
  lockKey: string,
  lockValue: string,
  ttlMs: number,
  renewalFraction: number
): void {
  const renewalKey = `${lockKey}:${lockValue}`;
  const intervalMs = Math.max(Math.floor(ttlMs * renewalFraction), 100);

  const timer = setInterval(async () => {
    try {
      const client = getRedisClient();
      const extended = await client.eval(
        EXTEND_LOCK_SCRIPT,
        1,
        lockKey,
        lockValue,
        String(ttlMs)
      );

      if (extended !== 1) {
        // Lock was lost (expired or taken by another holder). Stop renewing.
        logger.warn(
          { key: lockKey },
          "Lock renewal failed -- lock was lost before renewal could extend it"
        );
        stopRenewal(lockKey, lockValue);
      }
    } catch (err) {
      // Network error or Redis down -- stop renewing to avoid log spam.
      // The lock will expire naturally via its TTL.
      logger.warn(
        { key: lockKey, error: err instanceof Error ? err.message : String(err) },
        "Lock renewal encountered an error, stopping renewal"
      );
      stopRenewal(lockKey, lockValue);
    }
  }, intervalMs);

  // Ensure the timer does not prevent process exit
  if (timer && typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  activeRenewals.set(renewalKey, timer);
}

/**
 * Stop the auto-renewal heartbeat for a lock.
 */
function stopRenewal(lockKey: string, lockValue: string): void {
  const renewalKey = `${lockKey}:${lockValue}`;
  const timer = activeRenewals.get(renewalKey);
  if (timer) {
    clearInterval(timer);
    activeRenewals.delete(renewalKey);
  }
}

// =============================================================================
// Lock Operations
// =============================================================================

/**
 * Acquire a distributed lock with Redlock-style safety guarantees.
 *
 * Returns a LockHandle if the lock was successfully acquired, or null if
 * the lock is held by another instance and could not be acquired within
 * the wait timeout.
 *
 * Safety properties:
 * - The lock value is compared atomically on release (Lua CAS)
 * - A fencing token is issued for downstream operation ordering
 * - Acquisition time is subtracted from validity to account for latency
 * - Clock drift compensation reduces effective TTL
 * - Auto-renewal prevents premature expiry during long operations
 *
 * @param key - Lock name (will be prefixed with "lock:" automatically)
 * @param options - Lock TTL, wait/retry, and renewal settings
 */
export async function acquireLock(
  key: string,
  options: LockOptions
): Promise<LockHandle | null> {
  const client = getRedisClient();
  const lockKey = `lock:${key}`;
  const lockValue = generateLockValue();
  const {
    ttlSeconds,
    waitTimeoutMs = 0,
    retryIntervalMs = 200,
    autoRenew = true,
    renewalFraction = 0.5,
  } = options;

  const ttlMs = ttlSeconds * 1000;
  const deadline = Date.now() + waitTimeoutMs;

  // Add jitter to retry interval to prevent thundering herd when multiple
  // processes are contending for the same lock simultaneously.
  const jitter = () => Math.floor(Math.random() * Math.min(retryIntervalMs, 50));

  do {
    const acquireStartMs = Date.now();

    // SET key value NX PX ttlMs -- atomic acquire with millisecond precision
    const result = await client.set(lockKey, lockValue, "PX", ttlMs, "NX");

    if (result === "OK") {
      // Calculate how long acquisition took
      const acquireElapsedMs = Date.now() - acquireStartMs;

      // Compensate for clock drift: reduce validity by drift factor + fixed base
      const driftMs = Math.floor(ttlMs * CLOCK_DRIFT_FACTOR) + CLOCK_DRIFT_BASE_MS;
      const validityMs = ttlMs - acquireElapsedMs - driftMs;

      // If validity is too low, the lock might already be expired in practice.
      // Release immediately and report failure.
      if (validityMs <= 0) {
        // Best-effort release: lock may have already expired
        await client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue).catch(() => {});
        logger.warn(
          { key: lockKey, acquireElapsedMs, driftMs, ttlMs },
          "Lock acquired but validity <= 0 after drift compensation, released immediately"
        );
        // Continue retry loop if we still have time
        if (waitTimeoutMs > 0 && Date.now() < deadline) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryIntervalMs + jitter())
          );
          continue;
        }
        return null;
      }

      // Issue a fencing token -- monotonically increasing counter
      const fencingToken = await client.incr(FENCING_TOKEN_KEY);

      // Start auto-renewal if enabled
      if (autoRenew) {
        startRenewal(lockKey, lockValue, ttlMs, renewalFraction);
      }

      return {
        key: lockKey,
        value: lockValue,
        fencingToken,
        validityMs,
        release: async (): Promise<boolean> => {
          // Stop renewal first to prevent extending after release
          stopRenewal(lockKey, lockValue);

          // Atomic compare-and-delete via Lua to prevent releasing another's lock
          const released = await client.eval(
            RELEASE_LOCK_SCRIPT,
            1,
            lockKey,
            lockValue
          );
          return released === 1;
        },
      };
    }

    // If we have a wait timeout and haven't exceeded it, sleep and retry
    if (waitTimeoutMs > 0 && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, retryIntervalMs + jitter())
      );
    } else {
      break;
    }
  } while (Date.now() < deadline);

  return null; // Failed to acquire within timeout
}

/**
 * Execute a callback while holding a distributed lock.
 * Automatically releases the lock when the callback completes (or throws).
 *
 * Returns the callback's return value and fencing token, or an indication
 * that the lock could not be acquired.
 *
 * The fencing token is passed to the callback so it can be included in
 * downstream writes for ordering guarantees.
 *
 * @param key - Lock name (will be prefixed with "lock:" automatically)
 * @param options - Lock TTL, wait/retry, and renewal settings
 * @param fn - The function to execute while holding the lock.
 *             Receives the fencing token as its argument.
 */
export async function withLock<T>(
  key: string,
  options: LockOptions,
  fn: (fencingToken: number) => Promise<T>
): Promise<{ acquired: true; result: T; fencingToken: number } | { acquired: false }> {
  const lock = await acquireLock(key, options);
  if (!lock) {
    return { acquired: false };
  }

  try {
    const result = await fn(lock.fencingToken);
    return { acquired: true, result, fencingToken: lock.fencingToken };
  } finally {
    const released = await lock.release();
    if (!released) {
      logger.warn(
        { key, fencingToken: lock.fencingToken },
        "Lock expired before release -- consider increasing TTL or enabling auto-renewal"
      );
    }
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

/**
 * Close the dedicated Redis client used for distributed locking.
 * Also stops all active renewal timers.
 * Call this during graceful shutdown.
 */
export async function closeLockClient(): Promise<void> {
  // Stop all active renewal timers
  for (const [renewalKey, timer] of activeRenewals) {
    clearInterval(timer);
    activeRenewals.delete(renewalKey);
  }

  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
