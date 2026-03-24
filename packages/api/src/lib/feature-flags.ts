/**
 * Feature Flag Service
 *
 * Redis-backed feature flag system with tenant-scoped rollout.
 *
 * Features:
 * - Tenant-scoped flags (each tenant has independent flag state)
 * - Percentage-based rollout (deterministic hash of userId)
 * - Role-based gating (enable for specific roles first)
 * - In-memory cache with 60s TTL to minimise Redis round-trips
 * - Safe no-op when Redis is unavailable (defaults to disabled)
 * - Database persistence for admin CRUD operations
 *
 * Storage layers:
 * 1. In-memory LRU cache (60s TTL, bounded size)
 * 2. Redis hash per tenant (ff:{tenantId})
 * 3. PostgreSQL app.feature_flags table (source of truth)
 */

import type { CacheClient } from "../plugins/cache";
import type { DatabaseClient } from "../plugins/db";

// =============================================================================
// Types
// =============================================================================

/**
 * Feature flag definition as stored in the database / Redis.
 */
export interface FeatureFlag {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  /** Percentage of users who see this flag (0-100) */
  percentage: number;
  /** Role names allowed to see this flag. Empty = all roles. */
  roles: string[];
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Context passed to flag evaluation.
 */
export interface FeatureFlagContext {
  tenantId: string;
  userId: string;
  /** User's current role names (from RBAC) */
  roles?: string[];
}

/**
 * Input for creating a feature flag.
 */
export interface CreateFeatureFlagInput {
  name: string;
  description?: string | null;
  enabled?: boolean;
  percentage?: number;
  roles?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating a feature flag.
 */
export interface UpdateFeatureFlagInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  percentage?: number;
  roles?: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// In-Memory Cache
// =============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL and bounded size.
 * Used to avoid Redis round-trips on every request.
 */
class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = 200, ttlSeconds: number = 60) {
    this.maxSize = maxSize;
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest entry (FIFO)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  /** Delete all entries whose key starts with the given prefix. */
  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// =============================================================================
// Hash Utility
// =============================================================================

/**
 * Deterministic hash of a string to a number in the range [0, 99].
 * Uses a simple FNV-1a 32-bit hash for speed and determinism.
 *
 * This ensures the same userId always maps to the same bucket,
 * so percentage rollout is stable across requests.
 */
function hashToPercentage(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, unsigned 32-bit
  }
  return hash % 100;
}

// =============================================================================
// Redis Key Helpers
// =============================================================================

const REDIS_PREFIX = "ff:";

function redisTenantKey(tenantId: string): string {
  return `${REDIS_PREFIX}${tenantId}`;
}

// =============================================================================
// Feature Flag Service
// =============================================================================

export class FeatureFlagService {
  private cache: CacheClient | null;
  private db: DatabaseClient | null;

  /** In-memory cache for individual flag lookups: key = "tenantId:flagName" */
  private memCache = new MemoryCache<FeatureFlag | null>(500, 60);
  /** In-memory cache for all-flags-per-tenant: key = tenantId */
  private allFlagsCache = new MemoryCache<FeatureFlag[]>(50, 60);

  constructor(db: DatabaseClient | null, cache: CacheClient | null) {
    this.db = db;
    this.cache = cache;
  }

  // ===========================================================================
  // Flag Evaluation
  // ===========================================================================

  /**
   * Check whether a feature flag is enabled for the given context.
   *
   * Evaluation order:
   * 1. Check in-memory cache (avoids Redis round-trip)
   * 2. Check Redis cache
   * 3. If flag not found, return false (safe default)
   * 4. If flag.enabled is false, return false
   * 5. If flag has role restrictions and user's roles don't match, return false
   * 6. If flag has percentage < 100, hash userId and check bucket
   *
   * Safe no-op: if Redis is unavailable, returns false.
   */
  async isEnabled(flagName: string, context: FeatureFlagContext): Promise<boolean> {
    try {
      const flag = await this.getFlag(context.tenantId, flagName);
      if (!flag) return false;
      if (!flag.enabled) return false;

      // Role-based gating: if roles are specified, user must have at least one
      if (flag.roles.length > 0) {
        const userRoles = context.roles ?? [];
        const hasMatchingRole = flag.roles.some((r) => userRoles.includes(r));
        if (!hasMatchingRole) return false;
      }

      // Percentage-based rollout
      if (flag.percentage < 100) {
        const bucket = hashToPercentage(`${context.tenantId}:${flagName}:${context.userId}`);
        if (bucket >= flag.percentage) return false;
      }

      return true;
    } catch (error) {
      // Safe no-op: any error means flag is disabled
      console.warn(`[FeatureFlags] Error evaluating flag "${flagName}":`, error);
      return false;
    }
  }

  // ===========================================================================
  // Flag Retrieval
  // ===========================================================================

  /**
   * Get a single flag by name for a tenant.
   * Checks in-memory cache, then Redis, then DB.
   */
  async getFlag(tenantId: string, flagName: string): Promise<FeatureFlag | null> {
    const cacheKey = `${tenantId}:${flagName}`;

    // 1. In-memory cache
    const memCached = this.memCache.get(cacheKey);
    if (memCached !== undefined) return memCached;

    // 2. Redis cache
    if (this.cache) {
      try {
        const redisKey = redisTenantKey(tenantId);
        const cached = await this.cache.hget<FeatureFlag>(redisKey, flagName);
        if (cached) {
          this.memCache.set(cacheKey, cached);
          return cached;
        }
      } catch {
        // Redis unavailable, fall through to DB
      }
    }

    // 3. Database
    if (this.db) {
      try {
        const rows = await this.db.withSystemContext(async (tx) => {
          return await tx<FeatureFlag[]>`
            SELECT
              id,
              tenant_id,
              name,
              description,
              enabled,
              percentage,
              roles,
              metadata,
              created_by,
              updated_by,
              created_at,
              updated_at
            FROM feature_flags
            WHERE tenant_id = ${tenantId}::uuid
              AND name = ${flagName}
            LIMIT 1
          `;
        });

        const flag = rows.length > 0 ? this.normaliseFlag(rows[0]) : null;

        // Warm caches
        this.memCache.set(cacheKey, flag);
        if (flag && this.cache) {
          try {
            await this.cache.hset(redisTenantKey(tenantId), flagName, flag);
            await this.cache.expire(redisTenantKey(tenantId), 300); // 5 min Redis TTL
          } catch {
            // Non-fatal: cache warming failed
          }
        }

        return flag;
      } catch {
        // DB unavailable
      }
    }

    return null;
  }

  /**
   * Get all feature flags for a tenant.
   */
  async getAllFlags(tenantId: string): Promise<FeatureFlag[]> {
    // 1. In-memory cache
    const memCached = this.allFlagsCache.get(tenantId);
    if (memCached !== undefined) return memCached;

    // 2. Database (source of truth for listing)
    if (this.db) {
      try {
        const rows = await this.db.withSystemContext(async (tx) => {
          return await tx<FeatureFlag[]>`
            SELECT
              id,
              tenant_id,
              name,
              description,
              enabled,
              percentage,
              roles,
              metadata,
              created_by,
              updated_by,
              created_at,
              updated_at
            FROM feature_flags
            WHERE tenant_id = ${tenantId}::uuid
            ORDER BY name ASC
          `;
        });

        const flags = rows.map((r) => this.normaliseFlag(r));
        this.allFlagsCache.set(tenantId, flags);

        // Warm Redis with all flags
        if (this.cache) {
          try {
            for (const flag of flags) {
              await this.cache.hset(redisTenantKey(tenantId), flag.name, flag);
            }
            await this.cache.expire(redisTenantKey(tenantId), 300);
          } catch {
            // Non-fatal
          }
        }

        return flags;
      } catch (error) {
        console.error("[FeatureFlags] Error fetching all flags:", error);
      }
    }

    return [];
  }

  // ===========================================================================
  // Flag Management (CRUD)
  // ===========================================================================

  /**
   * Create a new feature flag.
   */
  async setFlag(
    tenantId: string,
    input: CreateFeatureFlagInput,
    userId?: string
  ): Promise<FeatureFlag> {
    if (!this.db) {
      throw new Error("Database required for flag creation");
    }

    const rows = await this.db.withSystemContext(async (tx) => {
      return await tx<FeatureFlag[]>`
        INSERT INTO feature_flags (
          tenant_id,
          name,
          description,
          enabled,
          percentage,
          roles,
          metadata,
          created_by,
          updated_by
        ) VALUES (
          ${tenantId}::uuid,
          ${input.name},
          ${input.description ?? null},
          ${input.enabled ?? false},
          ${input.percentage ?? 100},
          ${JSON.stringify(input.roles ?? [])}::jsonb,
          ${JSON.stringify(input.metadata ?? {})}::jsonb,
          ${userId ?? null}::uuid,
          ${userId ?? null}::uuid
        )
        RETURNING
          id, tenant_id, name, description, enabled, percentage,
          roles, metadata, created_by, updated_by, created_at, updated_at
      `;
    });

    const flag = this.normaliseFlag(rows[0]);
    this.invalidateCache(tenantId, flag.name);

    // Warm Redis immediately
    if (this.cache) {
      try {
        await this.cache.hset(redisTenantKey(tenantId), flag.name, flag);
      } catch {
        // Non-fatal
      }
    }

    return flag;
  }

  /**
   * Update an existing feature flag.
   */
  async updateFlag(
    tenantId: string,
    flagId: string,
    input: UpdateFeatureFlagInput,
    userId?: string
  ): Promise<FeatureFlag | null> {
    if (!this.db) {
      throw new Error("Database required for flag update");
    }

    // Fetch the existing flag first so we know its name for cache invalidation
    const existing = await this.db.withSystemContext(async (tx) => {
      return await tx<FeatureFlag[]>`
        SELECT id, name FROM feature_flags
        WHERE id = ${flagId}::uuid AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `;
    });

    if (existing.length === 0) return null;

    const oldName = existing[0].name;

    const rows = await this.db.withSystemContext(async (tx) => {
      return await tx<FeatureFlag[]>`
        UPDATE feature_flags SET
          name        = COALESCE(${input.name ?? null}, name),
          description = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE description END,
          enabled     = COALESCE(${input.enabled ?? null}, enabled),
          percentage  = COALESCE(${input.percentage ?? null}, percentage),
          roles       = CASE WHEN ${input.roles !== undefined} THEN ${JSON.stringify(input.roles ?? [])}::jsonb ELSE roles END,
          metadata    = CASE WHEN ${input.metadata !== undefined} THEN ${JSON.stringify(input.metadata ?? {})}::jsonb ELSE metadata END,
          updated_by  = ${userId ?? null}::uuid
        WHERE id = ${flagId}::uuid
          AND tenant_id = ${tenantId}::uuid
        RETURNING
          id, tenant_id, name, description, enabled, percentage,
          roles, metadata, created_by, updated_by, created_at, updated_at
      `;
    });

    if (rows.length === 0) return null;

    const flag = this.normaliseFlag(rows[0]);

    // Invalidate old name and new name
    this.invalidateCache(tenantId, oldName);
    if (input.name && input.name !== oldName) {
      this.invalidateCache(tenantId, input.name);
    }

    // Warm Redis
    if (this.cache) {
      try {
        // Remove old name from Redis hash if renamed
        if (input.name && input.name !== oldName) {
          await this.cache.hdel(redisTenantKey(tenantId), oldName);
        }
        await this.cache.hset(redisTenantKey(tenantId), flag.name, flag);
      } catch {
        // Non-fatal
      }
    }

    return flag;
  }

  /**
   * Delete a feature flag.
   */
  async deleteFlag(tenantId: string, flagId: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("Database required for flag deletion");
    }

    // Atomic delete + return name in a single transaction to avoid TOCTOU race
    const deleted = await this.db.withSystemContext(async (tx) => {
      return await tx<{ name: string }[]>`
        DELETE FROM feature_flags
        WHERE id = ${flagId}::uuid AND tenant_id = ${tenantId}::uuid
        RETURNING name
      `;
    });

    if (deleted.length === 0) return false;

    const flagName = deleted[0].name;

    this.invalidateCache(tenantId, flagName);

    // Remove from Redis
    if (this.cache) {
      try {
        await this.cache.hdel(redisTenantKey(tenantId), flagName);
      } catch {
        // Non-fatal
      }
    }

    return true;
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Invalidate in-memory caches for a specific flag.
   */
  private invalidateCache(tenantId: string, flagName: string): void {
    this.memCache.delete(`${tenantId}:${flagName}`);
    this.allFlagsCache.delete(tenantId);
  }

  /**
   * Invalidate all caches for a tenant.
   */
  async invalidateTenantCache(tenantId: string): Promise<void> {
    this.memCache.deleteByPrefix(`${tenantId}:`);
    this.allFlagsCache.delete(tenantId);
    if (this.cache) {
      try {
        await this.cache.del(redisTenantKey(tenantId));
      } catch {
        // Non-fatal
      }
    }
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /**
   * Normalise a database row into a FeatureFlag object.
   * Handles the camelCase transform from postgres.js.
   */
  private normaliseFlag(row: any): FeatureFlag {
    return {
      id: row.id,
      tenantId: row.tenantId ?? row.tenant_id,
      name: row.name,
      description: row.description ?? null,
      enabled: Boolean(row.enabled),
      percentage: Number(row.percentage ?? 100),
      roles: Array.isArray(row.roles) ? row.roles : [],
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      createdBy: row.createdBy ?? row.created_by ?? null,
      updatedBy: row.updatedBy ?? row.updated_by ?? null,
      createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
      updatedAt: row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
    };
  }
}
