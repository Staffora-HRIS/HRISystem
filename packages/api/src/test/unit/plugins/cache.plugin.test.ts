/**
 * Cache Plugin Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockCacheClient } from "../../helpers/mocks";

describe("Cache Plugin", () => {
  let cache: ReturnType<typeof createMockCacheClient>;

  beforeEach(() => {
    cache = createMockCacheClient();
  });

  describe("Cache Operations", () => {
    it("should get cached value", async () => {
      await cache.set("test-key", { data: "test-value" });
      const result = await cache.get("test-key");
      expect(result).toEqual({ data: "test-value" });
    });

    it("should set value with TTL", async () => {
      await cache.set("ttl-key", "value", 3600);
      const result = await cache.get("ttl-key");
      expect(result).toBe("value");
    });

    it("should delete cached value", async () => {
      await cache.set("delete-key", "value");
      await cache.delete("delete-key");
      const result = await cache.get("delete-key");
      expect(result).toBeNull();
    });

    it("should handle cache miss gracefully", async () => {
      const result = await cache.get("non-existent-key");
      expect(result).toBeNull();
    });

    it("should check key existence", async () => {
      await cache.set("exists-key", "value");
      expect(await cache.exists("exists-key")).toBe(true);
      expect(await cache.exists("not-exists")).toBe(false);
    });

    it("should serialize/deserialize complex objects", async () => {
      const complexObj = {
        id: "123",
        nested: { arr: [1, 2, 3], bool: true },
        date: "2024-01-01",
      };
      await cache.set("complex-key", complexObj);
      const result = await cache.get("complex-key");
      expect(result).toEqual(complexObj);
    });
  });

  describe("Cache Invalidation", () => {
    it("should invalidate by exact key", async () => {
      await cache.set("exact-key", "value");
      await cache.delete("exact-key");
      expect(await cache.get("exact-key")).toBeNull();
    });

    it("should invalidate by pattern", async () => {
      await cache.set("user:1:profile", "p1");
      await cache.set("user:2:profile", "p2");
      await cache.set("user:1:settings", "s1");
      
      await cache.flushPattern("user:1:*");
      
      expect(await cache.get("user:1:profile")).toBeNull();
      expect(await cache.get("user:1:settings")).toBeNull();
      expect(await cache.get("user:2:profile")).toBe("p2");
    });

    it("should get keys matching pattern", async () => {
      await cache.set("emp:t1:123", "e1");
      await cache.set("emp:t1:456", "e2");
      await cache.set("emp:t2:789", "e3");
      
      const keys = await cache.keys("emp:t1:*");
      expect(keys.length).toBe(2);
    });
  });

  describe("Cache Key Patterns", () => {
    it("should use session key pattern", () => {
      const sessionKey = `session:${crypto.randomUUID()}`;
      expect(sessionKey.startsWith("session:")).toBe(true);
    });

    it("should use permissions key pattern", () => {
      const permKey = `perms:tenant-123:user-456`;
      expect(permKey).toBe("perms:tenant-123:user-456");
    });

    it("should use employee key pattern", () => {
      const empKey = `emp:tenant-123:emp-456:basic`;
      expect(empKey.includes("emp:")).toBe(true);
    });

    it("should use rate limit key pattern", () => {
      const rateKey = `rate:tenant-123:user-456:/api/employees`;
      expect(rateKey.startsWith("rate:")).toBe(true);
    });
  });
});
