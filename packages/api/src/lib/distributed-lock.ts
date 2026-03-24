/**
 * Distributed Lock (Redlock-style)
 *
 * Provides mutual exclusion across multiple worker/API instances using Redis.
 * Implements a single-node Redlock variant with:
 *
 * - Atomic SET NX PX for acquisition
 * - Lua-based safe release (value check before DEL)
 * - Monotonically increasing fencing tokens via Redis INCR
 * - Clock drift compensation for validity calculation
 * - Auto-renewal via periodic PEXPIRE while lock is held
 * - Wait/retry loop with configurable timeout
 *
 * NOTE: This module manages its own Redis connection (separate from the
 * cache plugin) because the lock client must be available before the
 * Elysia plugin chain starts (e.g. for the scheduler). Call
 * `closeLockClient()` during shutdown to clean up.
 *
 * Does not import ioredis at the top level to work around a Bun 1.3.10
 * segfault on Windows when the import is evaluated at module scope.
 * Instead, ioredis is lazily imported on first use.
 */

import { getRedisUrl } from "../config/database";

// =============================================================================
// Constants
// =============================================================================

/** Prefix applied to all lock keys in Redis */
const LOCK_KEY_PREFIX = "lock:";

/** Redis key used to generate monotonically increasing fencing tokens */
const FENCING_TOKEN_COUNTER_KEY = "staffora:lock:fencing_token";

/**
 * Proportional clock drift factor.
 * For a TTL of N ms, we subtract N * CLOCK_DRIFT_FACTOR to account
 * for clock skew between the client and the Redis server.
 */
const CLOCK_DRIFT_FACTOR = 0.01;

/** Fixed base clock drift in milliseconds */
const CLOCK_DRIFT_BASE_MS = 2;

// =============================================================================
// Types
// =============================================================================

/**
 * Options for acquiring a distributed lock.
 */
export interface LockOptions {
  /** Time-to-live for the lock in seconds */
  ttlSeconds: number;

  /**
   * Whether to automatically renew the lock before it expires.
   * Defaults to true.
   */
  autoRenew?: boolean;

  /**
   * Fraction of TTL at which to trigger renewal.
   * For example, 0.5 means renew when half the TTL has elapsed.
   * Defaults to 0.5.
   */
  renewalFraction?: number;

  /**
   * Maximum time (ms) to wait for the lock to become available.
   * 0 means no waiting (single attempt). Undefined means no waiting.
   */
  waitTimeoutMs?: number;

  /**
   * Interval (ms) between retry attempts when waiting.
   * Defaults to 200.
   */
  retryIntervalMs?: number;
}

/**
 * Handle returned when a lock is successfully acquired.
 */
export interface LockHandle {
  /** The full Redis key (with lock: prefix) */
  key: string;

  /** Unique random value used to identify lock ownership */
  value: string;

  /** Monotonically increasing fencing token for write ordering */
  fencingToken: number;

  /**
   * Estimated remaining validity of the lock in milliseconds.
   * Accounts for acquisition time and clock drift.
   */
  validityMs: number;

  /**
   * Release the lock.
   * Returns true if the lock was successfully released (we still owned it),
   * or false if it had already expired or been acquired by another holder.
   */
  release: () => Promise<boolean>;
}

/**
 * Result of the `withLock` convenience wrapper.
 * Discriminated union on the `acquired` field.
 */
export type WithLockResult<T> =
  | { acquired: true; result: T; fencingToken: number }
  | { acquired: false };

// =============================================================================
// Lua Scripts
// =============================================================================

/**
 * Lua script for safe lock release.
 * Only deletes the key if the current value matches the expected value,
 * preventing accidental release of a lock held by another instance.
 *
 * KEYS[1] = lock key
 * ARGV[1] = expected value
 * Returns 1 if deleted, 0 if value mismatch or key absent.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Lua script for safe lock renewal.
 * Only extends the TTL if the current value matches the expected value.
 *
 * KEYS[1] = lock key
 * ARGV[1] = expected value
 * ARGV[2] = new TTL in milliseconds
 * Returns 1 if renewed, 0 if value mismatch or key absent.
 */
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

// =============================================================================
// Redis Client (lazy singleton)
// =============================================================================

let redisClient: import("ioredis").default | null = null;

/**
 * Get or create the Redis client used for locking.
 * Uses lazy import to avoid Bun segfault on Windows.
 */
async function getRedisClient(): Promise<import("ioredis").default> {
  if (redisClient) return redisClient;

  const Redis = (await import("ioredis")).default;
  const url = getRedisUrl();

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: false,
    enableReadyCheck: true,
  });

  return redisClient;
}

/**
 * Close the Redis connection used for distributed locking.
 * Should be called during application shutdown.
 */
export async function closeLockClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// =============================================================================
// Core Lock Operations
// =============================================================================

/**
 * Generate a unique random value for lock ownership identification.
 */
function generateLockValue(): string {
  return crypto.randomUUID();
}

/**
 * Acquire a fencing token by atomically incrementing the global counter.
 */
async function acquireFencingToken(
  redis: import("ioredis").default
): Promise<number> {
  return await redis.incr(FENCING_TOKEN_COUNTER_KEY);
}

/**
 * Attempt a single lock acquisition (no retry).
 *
 * Uses SET key value NX PX ttlMs for atomic acquire.
 * Returns the LockHandle if successful, null otherwise.
 */
async function tryAcquire(
  redis: import("ioredis").default,
  key: string,
  ttlMs: number,
  options: LockOptions
): Promise<LockHandle | null> {
  const value = generateLockValue();
  const redisKey = LOCK_KEY_PREFIX + key;

  const startTime = Date.now();

  // Atomic acquire: SET key value NX PX ttlMs
  const result = await redis.set(redisKey, value, "PX", ttlMs, "NX");

  const endTime = Date.now();

  if (result !== "OK") {
    return null;
  }

  // Acquire a monotonically increasing fencing token
  const fencingToken = await acquireFencingToken(redis);

  // Calculate validity: TTL minus acquisition time minus clock drift
  const elapsedMs = endTime - startTime;
  const drift = Math.floor(ttlMs * CLOCK_DRIFT_FACTOR) + CLOCK_DRIFT_BASE_MS;
  const validityMs = ttlMs - elapsedMs - drift;

  if (validityMs <= 0) {
    // Lock acquired but already (nearly) expired due to slow acquisition
    // Release it immediately and report failure
    await redis.eval(RELEASE_SCRIPT, 1, redisKey, value);
    return null;
  }

  // Auto-renewal interval handle
  let renewalTimer: ReturnType<typeof setInterval> | null = null;

  const autoRenew = options.autoRenew !== false; // default true
  const renewalFraction = options.renewalFraction ?? 0.5;

  if (autoRenew) {
    const renewalIntervalMs = Math.floor(ttlMs * renewalFraction);

    renewalTimer = setInterval(async () => {
      try {
        const renewed = await redis.eval(
          RENEW_SCRIPT,
          1,
          redisKey,
          value,
          String(ttlMs)
        );
        if (renewed === 0) {
          // Lock was lost (expired or taken by another holder)
          if (renewalTimer) {
            clearInterval(renewalTimer);
            renewalTimer = null;
          }
        }
      } catch {
        // Redis error during renewal -- stop trying
        if (renewalTimer) {
          clearInterval(renewalTimer);
          renewalTimer = null;
        }
      }
    }, renewalIntervalMs);
  }

  // Build the release function
  const release = async (): Promise<boolean> => {
    // Stop auto-renewal
    if (renewalTimer) {
      clearInterval(renewalTimer);
      renewalTimer = null;
    }

    try {
      const result = await redis.eval(RELEASE_SCRIPT, 1, redisKey, value);
      return result === 1;
    } catch {
      return false;
    }
  };

  return {
    key: redisKey,
    value,
    fencingToken,
    validityMs,
    release,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Acquire a distributed lock on the given key.
 *
 * The key is automatically prefixed with "lock:". For example,
 * `acquireLock("scheduler:accruals", { ttlSeconds: 30 })` acquires
 * a lock on the Redis key "lock:scheduler:accruals".
 *
 * If `waitTimeoutMs` is set and positive, the function retries at
 * `retryIntervalMs` intervals until the lock is acquired or the
 * timeout is exceeded.
 *
 * @returns A LockHandle if acquired, or null if the lock could not be obtained.
 */
export async function acquireLock(
  key: string,
  options: LockOptions
): Promise<LockHandle | null> {
  const redis = await getRedisClient();
  const ttlMs = options.ttlSeconds * 1000;
  const waitTimeoutMs = options.waitTimeoutMs ?? 0;
  const retryIntervalMs = options.retryIntervalMs ?? 200;

  // First attempt
  const handle = await tryAcquire(redis, key, ttlMs, options);
  if (handle) return handle;

  // If no waiting requested, return immediately
  if (waitTimeoutMs <= 0) return null;

  // Retry loop
  const deadline = Date.now() + waitTimeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));

    if (Date.now() >= deadline) break;

    const handle = await tryAcquire(redis, key, ttlMs, options);
    if (handle) return handle;
  }

  return null;
}

/**
 * Execute a callback while holding a distributed lock.
 *
 * Acquires the lock, runs the callback (passing the fencing token),
 * and releases the lock when the callback completes or throws.
 *
 * If the lock cannot be acquired, returns `{ acquired: false }`.
 * If the callback succeeds, returns `{ acquired: true, result, fencingToken }`.
 * If the callback throws, the lock is released and the error is re-thrown.
 *
 * @param key - Lock key (will be prefixed with "lock:")
 * @param options - Lock acquisition options
 * @param callback - Function to execute while holding the lock
 */
export async function withLock<T>(
  key: string,
  options: LockOptions,
  callback: (fencingToken: number) => Promise<T>
): Promise<WithLockResult<T>> {
  const handle = await acquireLock(key, options);

  if (!handle) {
    return { acquired: false };
  }

  try {
    const result = await callback(handle.fencingToken);
    return {
      acquired: true,
      result,
      fencingToken: handle.fencingToken,
    };
  } finally {
    await handle.release();
  }
}
