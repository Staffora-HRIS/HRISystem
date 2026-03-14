/**
 * Distributed Lock Unit Tests
 *
 * Tests the Redis-based distributed lock module used by the scheduler
 * to prevent duplicate job execution across multiple worker instances.
 *
 * Requires Redis to be running (via Docker).
 *
 * NOTE: Does not import ioredis directly due to a Bun 1.3.10 segfault
 * on Windows. The distributed-lock module handles its own Redis connection.
 */

import { describe, it, expect, afterAll } from "bun:test";
import {
  acquireLock,
  withLock,
  closeLockClient,
} from "../../../lib/distributed-lock";

// =============================================================================
// Teardown
// =============================================================================

afterAll(async () => {
  await closeLockClient();
});

// =============================================================================
// acquireLock
// =============================================================================

describe("acquireLock", () => {
  it("should acquire a lock when key is free", async () => {
    const lock = await acquireLock("test:acquire-free", {
      ttlSeconds: 10,
    });

    expect(lock).not.toBeNull();
    expect(lock!.key).toBe("lock:test:acquire-free");
    expect(lock!.value).toBeTruthy();
    expect(typeof lock!.release).toBe("function");

    await lock!.release();
  });

  it("should fail to acquire a lock that is already held", async () => {
    const lock1 = await acquireLock("test:acquire-held", {
      ttlSeconds: 10,
    });
    expect(lock1).not.toBeNull();

    // Second attempt should fail (no wait)
    const lock2 = await acquireLock("test:acquire-held", {
      ttlSeconds: 10,
      waitTimeoutMs: 0,
    });
    expect(lock2).toBeNull();

    await lock1!.release();
  });

  it("should acquire lock after previous holder releases", async () => {
    const lock1 = await acquireLock("test:acquire-release", {
      ttlSeconds: 10,
    });
    expect(lock1).not.toBeNull();

    // Release the first lock
    const released = await lock1!.release();
    expect(released).toBe(true);

    // Now we should be able to acquire it
    const lock2 = await acquireLock("test:acquire-release", {
      ttlSeconds: 10,
    });
    expect(lock2).not.toBeNull();

    await lock2!.release();
  });

  it("should acquire lock after TTL expires", async () => {
    // Acquire with very short TTL (1 second)
    const lock1 = await acquireLock("test:acquire-expire", {
      ttlSeconds: 1,
    });
    expect(lock1).not.toBeNull();

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1200));

    // Now we should be able to acquire it
    const lock2 = await acquireLock("test:acquire-expire", {
      ttlSeconds: 10,
    });
    expect(lock2).not.toBeNull();

    await lock2!.release();
  });

  it("should wait and retry when waitTimeoutMs is set", async () => {
    // Acquire with very short TTL (1 second)
    const lock1 = await acquireLock("test:acquire-wait", {
      ttlSeconds: 1,
    });
    expect(lock1).not.toBeNull();

    // Try to acquire with wait - should succeed after TTL expires
    const lock2 = await acquireLock("test:acquire-wait", {
      ttlSeconds: 10,
      waitTimeoutMs: 2000,
      retryIntervalMs: 100,
    });
    expect(lock2).not.toBeNull();

    await lock2!.release();
  });

  it("should return null when wait timeout is exceeded", async () => {
    // Acquire with long TTL
    const lock1 = await acquireLock("test:acquire-timeout", {
      ttlSeconds: 30,
    });
    expect(lock1).not.toBeNull();

    // Try to acquire with short wait - should fail
    const lock2 = await acquireLock("test:acquire-timeout", {
      ttlSeconds: 10,
      waitTimeoutMs: 300,
      retryIntervalMs: 100,
    });
    expect(lock2).toBeNull();

    await lock1!.release();
  });
});

// =============================================================================
// Lock release safety
// =============================================================================

describe("lock release", () => {
  it("should not release a lock owned by another instance", async () => {
    // Acquire with very short TTL
    const lock1 = await acquireLock("test:release-safety", {
      ttlSeconds: 1,
    });
    expect(lock1).not.toBeNull();

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1200));

    // Another "instance" acquires the lock
    const lock2 = await acquireLock("test:release-safety", {
      ttlSeconds: 10,
    });
    expect(lock2).not.toBeNull();

    // First lock tries to release - should fail (it expired, lock2 owns it now)
    const released = await lock1!.release();
    expect(released).toBe(false);

    // Lock2 should still be valid
    const lock3 = await acquireLock("test:release-safety", {
      ttlSeconds: 10,
      waitTimeoutMs: 0,
    });
    expect(lock3).toBeNull(); // lock2 still holds it

    await lock2!.release();
  });
});

// =============================================================================
// withLock
// =============================================================================

describe("withLock", () => {
  it("should execute callback when lock is acquired", async () => {
    let executed = false;
    const result = await withLock(
      "test:withlock-exec",
      { ttlSeconds: 10 },
      async () => {
        executed = true;
        return 42;
      }
    );

    expect(result.acquired).toBe(true);
    expect(executed).toBe(true);
    if (result.acquired) {
      expect(result.result).toBe(42);
    }
  });

  it("should return acquired:false when lock cannot be acquired", async () => {
    // Hold the lock
    const lock = await acquireLock("test:withlock-busy", {
      ttlSeconds: 10,
    });
    expect(lock).not.toBeNull();

    let executed = false;
    const result = await withLock(
      "test:withlock-busy",
      { ttlSeconds: 10, waitTimeoutMs: 0 },
      async () => {
        executed = true;
        return "should not run";
      }
    );

    expect(result.acquired).toBe(false);
    expect(executed).toBe(false);

    await lock!.release();
  });

  it("should release lock even when callback throws", async () => {
    try {
      await withLock(
        "test:withlock-error",
        { ttlSeconds: 10 },
        async () => {
          throw new Error("test error");
        }
      );
    } catch (e) {
      expect((e as Error).message).toBe("test error");
    }

    // Lock should have been released, so we can acquire again
    const lock = await acquireLock("test:withlock-error", {
      ttlSeconds: 10,
    });
    expect(lock).not.toBeNull();

    await lock!.release();
  });

  it("should prevent concurrent execution", async () => {
    const executionOrder: string[] = [];

    // Start two competing withLock calls
    const promise1 = withLock(
      "test:withlock-concurrent",
      { ttlSeconds: 5 },
      async () => {
        executionOrder.push("start-1");
        await new Promise((r) => setTimeout(r, 200));
        executionOrder.push("end-1");
      }
    );

    // Small delay to ensure lock1 acquires first
    await new Promise((r) => setTimeout(r, 50));

    const promise2 = withLock(
      "test:withlock-concurrent",
      { ttlSeconds: 5, waitTimeoutMs: 0 },
      async () => {
        executionOrder.push("start-2");
        executionOrder.push("end-2");
      }
    );

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // First should have executed
    expect(result1.acquired).toBe(true);
    // Second should have been skipped (lock was held, no wait)
    expect(result2.acquired).toBe(false);

    expect(executionOrder).toEqual(["start-1", "end-1"]);
  });
});

// =============================================================================
// Lock value uniqueness
// =============================================================================

describe("lock value uniqueness", () => {
  it("should generate unique lock values for each acquisition", async () => {
    const lock1 = await acquireLock("test:unique-1", { ttlSeconds: 10 });
    const lock2 = await acquireLock("test:unique-2", { ttlSeconds: 10 });

    expect(lock1).not.toBeNull();
    expect(lock2).not.toBeNull();
    expect(lock1!.value).not.toBe(lock2!.value);

    await lock1!.release();
    await lock2!.release();
  });
});
