/**
 * Redis-based Distributed Lock
 *
 * Prevents concurrent execution of the same job across multiple worker instances.
 * Uses the SET NX EX pattern (atomic set-if-not-exists with expiry) for lock
 * acquisition and a Lua script for atomic compare-and-delete on release.
 *
 * This module creates its own ioredis connection so it can be used from the
 * scheduler (which runs outside the Elysia plugin lifecycle).
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
}

export interface LockHandle {
  /** The full Redis key used for this lock. */
  key: string;
  /** The unique value identifying this lock owner. */
  value: string;
  /** Release the lock. Returns true if this instance still owned it, false if it expired. */
  release: () => Promise<boolean>;
}

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

// =============================================================================
// Lock Value Generation
// =============================================================================

/**
 * Generate a unique lock value to identify the lock owner.
 * Combines PID, timestamp, and random string for uniqueness across processes.
 */
function generateLockValue(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

// =============================================================================
// Redis Client Management
// =============================================================================

let redisClient: Redis | null = null;

/**
 * Get or create the Redis client used for distributed locking.
 * Uses a dedicated connection separate from the cache plugin.
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
// Lock Operations
// =============================================================================

/**
 * Acquire a distributed lock.
 *
 * Returns a LockHandle if the lock was successfully acquired, or null if
 * the lock is held by another instance and could not be acquired within
 * the wait timeout.
 *
 * @param key - Lock name (will be prefixed with "lock:" automatically)
 * @param options - Lock TTL and optional wait/retry settings
 */
export async function acquireLock(
  key: string,
  options: LockOptions
): Promise<LockHandle | null> {
  const client = getRedisClient();
  const lockKey = `lock:${key}`;
  const lockValue = generateLockValue();
  const { ttlSeconds, waitTimeoutMs = 0, retryIntervalMs = 200 } = options;

  const deadline = Date.now() + waitTimeoutMs;

  do {
    // SET key value NX EX ttl -- atomic acquire
    const result = await client.set(lockKey, lockValue, "EX", ttlSeconds, "NX");

    if (result === "OK") {
      return {
        key: lockKey,
        value: lockValue,
        release: async (): Promise<boolean> => {
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
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
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
 * Returns the callback's return value, or null if the lock could not be acquired.
 *
 * @param key - Lock name (will be prefixed with "lock:" automatically)
 * @param options - Lock TTL and optional wait/retry settings
 * @param fn - The function to execute while holding the lock
 */
export async function withLock<T>(
  key: string,
  options: LockOptions,
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const lock = await acquireLock(key, options);
  if (!lock) {
    return { acquired: false };
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    const released = await lock.release();
    if (!released) {
      logger.warn({ key }, "Lock expired before release -- consider increasing TTL");
    }
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

/**
 * Close the dedicated Redis client used for distributed locking.
 * Call this during graceful shutdown.
 */
export async function closeLockClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
