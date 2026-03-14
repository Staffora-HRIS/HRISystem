/**
 * Redis Cache Plugin
 *
 * Provides Redis connectivity using 'ioredis' package.
 * Features:
 * - Connection management with auto-reconnect
 * - Tenant-scoped key prefixing
 * - Helper methods for common operations
 * - TTL-based caching patterns
 */

import { Elysia } from "elysia";
import Redis, { type RedisOptions } from "ioredis";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Cache configuration from environment variables
 */
export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  maxRetries: number;
  retryDelayMs: number;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
}

/**
 * Load cache configuration from environment
 */
function loadCacheConfig(): CacheConfig {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl) {
    const url = new URL(redisUrl);
    const dbFromPath = url.pathname && url.pathname !== "/" ? Number(url.pathname.replace(/^\//, "")) : NaN;

    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number.isFinite(dbFromPath) ? dbFromPath : Number(process.env["REDIS_DB"]) || 0,
      keyPrefix: process.env["REDIS_KEY_PREFIX"] || "staffora:",
      maxRetries: Number(process.env["REDIS_MAX_RETRIES"]) || 3,
      retryDelayMs: Number(process.env["REDIS_RETRY_DELAY"]) || 500,
      connectTimeoutMs: Number(process.env["REDIS_CONNECT_TIMEOUT"]) || 10000,
      commandTimeoutMs: Number(process.env["REDIS_COMMAND_TIMEOUT"]) || 5000,
    };
  }

  return {
    host: process.env["REDIS_HOST"] || "localhost",
    port: Number(process.env["REDIS_PORT"]) || 6379,
    password: process.env["REDIS_PASSWORD"] || undefined,
    db: Number(process.env["REDIS_DB"]) || 0,
    keyPrefix: process.env["REDIS_KEY_PREFIX"] || "staffora:",
    maxRetries: Number(process.env["REDIS_MAX_RETRIES"]) || 3,
    retryDelayMs: Number(process.env["REDIS_RETRY_DELAY"]) || 500,
    connectTimeoutMs: Number(process.env["REDIS_CONNECT_TIMEOUT"]) || 10000,
    commandTimeoutMs: Number(process.env["REDIS_COMMAND_TIMEOUT"]) || 5000,
  };
}

// =============================================================================
// Types
// =============================================================================

/**
 * Standard cache TTL values (in seconds)
 */
export const CacheTTL = {
  /** Very short-lived cache (1 minute) */
  SHORT: 60,
  /** Session cache (5 minutes) */
  SESSION: 300,
  /** Medium cache for frequently accessed data (15 minutes) */
  MEDIUM: 900,
  /** Permission cache (15 minutes) */
  PERMISSIONS: 900,
  /** Employee basic data cache (10 minutes) */
  EMPLOYEE: 600,
  /** Long cache for rarely changing data (1 hour) */
  LONG: 3600,
  /** Very long cache for reference data (24 hours) */
  REFERENCE: 86400,
} as const;

/**
 * Cache key patterns
 */
export const CacheKeys = {
  /** Session key pattern */
  session: (sessionId: string) => `session:${sessionId}`,

  /** User permissions key pattern */
  permissions: (tenantId: string, userId: string) => `perms:${tenantId}:${userId}`,

  /** User roles key pattern */
  roles: (tenantId: string, userId: string) => `roles:${tenantId}:${userId}`,

  /** Tenant settings key pattern */
  tenantSettings: (tenantId: string) => `tenant:${tenantId}:settings`,

  /** Organization tree key pattern */
  orgTree: (tenantId: string) => `org:${tenantId}:tree`,

  /** Employee basic info key pattern */
  employeeBasic: (tenantId: string, employeeId: string) =>
    `emp:${tenantId}:${employeeId}:basic`,

  /** Rate limiting key pattern */
  rateLimit: (tenantId: string, userId: string, endpoint: string) =>
    `rate:${tenantId}:${userId}:${endpoint}`,

  /** Lock key pattern (for distributed locking) */
  lock: (resource: string) => `lock:${resource}`,
} as const;

// =============================================================================
// Cache Client
// =============================================================================

/**
 * Redis cache client wrapper with tenant-scoped operations
 */
export class CacheClient {
  private redis: Redis;
  private config: CacheConfig;
  private isConnected: boolean = false;

  constructor(config: CacheConfig) {
    this.config = config;

    const redisOptions: RedisOptions = {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      maxRetriesPerRequest: config.maxRetries,
      retryStrategy: (times) => {
        if (times > config.maxRetries) {
          console.error(`[Cache] Max retries (${config.maxRetries}) exceeded`);
          return null; // Stop retrying
        }
        return Math.min(times * config.retryDelayMs, 2000);
      },
      connectTimeout: config.connectTimeoutMs,
      commandTimeout: config.commandTimeoutMs,
      lazyConnect: true,
      enableReadyCheck: true,
    };

    this.redis = new Redis(redisOptions);

    // Connection event handlers
    this.redis.on("connect", () => {
      console.log("[Cache] Connected to Redis");
      this.isConnected = true;
    });

    this.redis.on("ready", () => {
      console.log("[Cache] Redis is ready");
    });

    this.redis.on("error", (error) => {
      console.error("[Cache] Redis error:", error.message);
    });

    this.redis.on("close", () => {
      console.log("[Cache] Redis connection closed");
      this.isConnected = false;
    });

    this.redis.on("reconnecting", () => {
      console.log("[Cache] Reconnecting to Redis...");
    });
  }

  /**
   * Get the raw Redis client for advanced operations
   */
  get client(): Redis {
    return this.redis;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.redis.connect();
    }
  }

  /**
   * Health check - verify Redis connectivity
   */
  async healthCheck(): Promise<{ status: "up" | "down"; latency: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return {
        status: "up",
        latency: Date.now() - start,
      };
    } catch {
      return {
        status: "down",
        latency: Date.now() - start,
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.isConnected = false;
  }

  // ===========================================================================
  // Basic Operations
  // ===========================================================================

  /**
   * Get a value by key
   */
  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Set a value with optional TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);

    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  /**
   * Set a value with expiration (alias for set with TTL)
   */
  async setex<T>(key: string, ttlSeconds: number, value: T): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await this.redis.setex(key, ttlSeconds, serialized);
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    const result = await this.redis.del(key);
    return result > 0;
  }

  /**
   * Delete multiple keys
   */
  async delMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.redis.del(...keys);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result > 0;
  }

  /**
   * Get remaining TTL for a key (in seconds)
   */
  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  /**
   * Set expiration on an existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(key, ttlSeconds);
    return result === 1;
  }

  // ===========================================================================
  // Hash Operations
  // ===========================================================================

  /**
   * Get a field from a hash
   */
  async hget<T = string>(key: string, field: string): Promise<T | null> {
    const value = await this.redis.hget(key, field);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Set a field in a hash
   */
  async hset<T>(key: string, field: string, value: T): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await this.redis.hset(key, field, serialized);
  }

  /**
   * Get all fields from a hash
   */
  async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
    const result = await this.redis.hgetall(key);
    if (Object.keys(result).length === 0) return null;

    // Try to parse each value
    const parsed: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(result)) {
      try {
        parsed[field] = JSON.parse(value);
      } catch {
        parsed[field] = value;
      }
    }

    return parsed as T;
  }

  /**
   * Delete a field from a hash
   */
  async hdel(key: string, field: string): Promise<boolean> {
    const result = await this.redis.hdel(key, field);
    return result > 0;
  }

  // ===========================================================================
  // Tenant-Scoped Operations
  // ===========================================================================

  /**
   * Get a tenant-scoped value
   */
  async getTenant<T>(tenantId: string, key: string): Promise<T | null> {
    return this.get<T>(`t:${tenantId}:${key}`);
  }

  /**
   * Set a tenant-scoped value
   */
  async setTenant<T>(
    tenantId: string,
    key: string,
    value: T,
    ttlSeconds?: number
  ): Promise<void> {
    return this.set(`t:${tenantId}:${key}`, value, ttlSeconds);
  }

  /**
   * Delete a tenant-scoped value
   */
  async delTenant(tenantId: string, key: string): Promise<boolean> {
    return this.del(`t:${tenantId}:${key}`);
  }

  /**
   * Invalidate all cache for a tenant (use with caution).
   * Uses cursor-based SCAN instead of KEYS to avoid blocking Redis.
   */
  async invalidateTenantCache(tenantId: string): Promise<number> {
    const pattern = `${this.config.keyPrefix}t:${tenantId}:*`;
    let cursor = "0";
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        // Remove the prefix since del will add it back
        const keysWithoutPrefix = keys.map((k) =>
          k.replace(this.config.keyPrefix, "")
        );
        totalDeleted += await this.delMany(keysWithoutPrefix);
      }
    } while (cursor !== "0");

    return totalDeleted;
  }

  // ===========================================================================
  // Cache Patterns
  // ===========================================================================

  /**
   * Get or set a cached value
   * If the key exists, returns the cached value
   * If not, calls the factory function and caches the result
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = CacheTTL.MEDIUM
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalidate and refresh a cached value
   */
  async invalidateAndRefresh<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = CacheTTL.MEDIUM
  ): Promise<T> {
    await this.del(key);
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  // ===========================================================================
  // Rate Limiting
  // ===========================================================================

  /**
   * Increment a rate limit counter
   * Returns the current count and whether the limit is exceeded
   */
  async incrementRateLimit(
    key: string,
    windowSeconds: number,
    maxRequests: number
  ): Promise<{ count: number; exceeded: boolean }> {
    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, windowSeconds);

    const results = await multi.exec();
    const count = results?.[0]?.[1] as number || 0;

    return {
      count,
      exceeded: count > maxRequests,
    };
  }

  // ===========================================================================
  // Distributed Locking
  // ===========================================================================

  /**
   * Acquire a distributed lock
   * Returns a release function if successful, null if lock is held
   */
  async acquireLock(
    resource: string,
    ttlSeconds: number = 30
  ): Promise<(() => Promise<void>) | null> {
    const lockKey = CacheKeys.lock(resource);
    const lockValue = `${Date.now()}-${Math.random()}`;

    // Try to acquire the lock
    const result = await this.redis.set(lockKey, lockValue, "EX", ttlSeconds, "NX");

    if (result !== "OK") {
      return null; // Lock is held by someone else
    }

    // Return a release function using atomic Lua compare-and-delete
    return async () => {
      // Only release if we still own the lock (atomic to prevent race conditions)
      await this.redis.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockValue
      );
    };
  }

  /**
   * Execute a function with a distributed lock
   */
  async withLock<T>(
    resource: string,
    callback: () => Promise<T>,
    options: { ttlSeconds?: number; waitMs?: number; maxRetries?: number } = {}
  ): Promise<T> {
    const { ttlSeconds = 30, waitMs = 100, maxRetries = 50 } = options;

    let retries = 0;
    let release: (() => Promise<void>) | null = null;

    // Try to acquire the lock
    while (retries < maxRetries) {
      release = await this.acquireLock(resource, ttlSeconds);
      if (release) break;

      retries++;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (!release) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      return await callback();
    } finally {
      await release();
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let cacheClient: CacheClient | null = null;

/**
 * Get or create the cache client singleton
 */
export function getCacheClient(): CacheClient {
  if (!cacheClient) {
    const config = loadCacheConfig();
    cacheClient = new CacheClient(config);
  }
  return cacheClient;
}

/**
 * Close the cache client (for cleanup)
 */
export async function closeCacheClient(): Promise<void> {
  if (cacheClient) {
    await cacheClient.close();
    cacheClient = null;
  }
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Cache plugin for Elysia
 *
 * Adds cache client to the request context.
 * Also handles connection and graceful shutdown.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(cachePlugin())
 *   .get('/example', ({ cache }) => {
 *     return cache.get('my-key');
 *   });
 * ```
 */
export function cachePlugin() {
  const cache = getCacheClient();

  return new Elysia({ name: "cache" })
    .decorate("cache", cache)
    .onStart(async () => {
      console.log("[Cache] Cache plugin initializing...");

      // Connect to Redis
      await cache.connect();

      // Verify connection
      const health = await cache.healthCheck();
      if (health.status === "up") {
        console.log(`[Cache] Connection verified (${health.latency}ms)`);
      } else {
        console.error("[Cache] Failed to connect to Redis");
        throw new Error("Redis connection failed");
      }
    })
    .onStop(async () => {
      console.log("[Cache] Closing Redis connection...");
      await closeCacheClient();
      console.log("[Cache] Redis connection closed");
    });
}
