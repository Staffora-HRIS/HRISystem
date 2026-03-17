import { Elysia } from "elysia";
import { CacheKeys } from "./cache";
import { createErrorResponse, ErrorCodes } from "./errors";
import { getClientIp } from "../lib/client-ip";

export interface RateLimitPluginOptions {
  enabled?: boolean;
  maxRequests?: number;
  windowMs?: number;
  skipRoutes?: RegExp[];
}

const DEFAULT_SKIP_ROUTES = [
  /^\/$/,
  /^\/health/,
  /^\/ready/,
  /^\/live/,
  /^\/docs/,
];

/**
 * Auth endpoints that require aggressive rate limiting to prevent
 * brute-force attacks, credential stuffing, and account enumeration.
 */
const AUTH_RATE_LIMIT_ROUTES: { pattern: RegExp; maxRequests: number; windowSeconds: number }[] = [
  { pattern: /^\/api\/auth\/sign-in/, maxRequests: 5, windowSeconds: 60 },
  { pattern: /^\/api\/auth\/sign-up/, maxRequests: 3, windowSeconds: 60 },
  { pattern: /^\/api\/auth\/forgot-password/, maxRequests: 3, windowSeconds: 60 },
  { pattern: /^\/api\/auth\/verify-/, maxRequests: 5, windowSeconds: 60 },
];

function matchAuthRoute(path: string): { maxRequests: number; windowSeconds: number } | null {
  for (const route of AUTH_RATE_LIMIT_ROUTES) {
    if (route.pattern.test(path)) {
      return { maxRequests: route.maxRequests, windowSeconds: route.windowSeconds };
    }
  }
  return null;
}

// =============================================================================
// In-Memory Rate Limit Fallback (TODO-026)
// =============================================================================

/**
 * In-memory rate limit store used as a fallback when Redis is unavailable.
 * Implements a simple Map with TTL-based eviction and bounded capacity.
 *
 * This avoids adding external dependencies while providing basic rate limiting
 * protection even when Redis is down.
 */
export class InMemoryRateLimitStore {
  private store = new Map<string, { count: number; expiresAt: number }>();
  private readonly maxEntries: number;
  private lastEviction = 0;
  private readonly evictionIntervalMs = 30_000; // evict stale entries every 30s

  constructor(maxEntries: number = 10_000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Increment a rate limit counter, matching the Redis-based interface.
   */
  incrementRateLimit(
    key: string,
    windowSeconds: number,
    maxRequests: number
  ): { count: number; exceeded: boolean } {
    const now = Date.now();

    // Periodic eviction of expired entries to prevent unbounded growth
    if (now - this.lastEviction > this.evictionIntervalMs) {
      this.evictExpired(now);
      this.lastEviction = now;
    }

    const existing = this.store.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      return {
        count: existing.count,
        exceeded: existing.count > maxRequests,
      };
    }

    // New window or expired entry
    // If at capacity, evict expired entries first, then evict oldest if still full
    if (this.store.size >= this.maxEntries) {
      this.evictExpired(now);
      if (this.store.size >= this.maxEntries) {
        // FIFO eviction of oldest entry
        const firstKey = this.store.keys().next().value;
        if (firstKey !== undefined) this.store.delete(firstKey);
      }
    }

    this.store.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { count: 1, exceeded: 1 > maxRequests };
  }

  /**
   * Remove all expired entries from the store.
   */
  private evictExpired(now: number): void {
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all entries (used in tests).
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Current number of entries (used in tests).
   */
  get size(): number {
    return this.store.size;
  }
}

// =============================================================================
// Rate Limit Increment Interface
// =============================================================================

/**
 * Interface for rate limit counter operations.
 * Both Redis CacheClient and InMemoryRateLimitStore implement this.
 */
interface RateLimitCounter {
  incrementRateLimit(
    key: string,
    windowSeconds: number,
    maxRequests: number
  ): Promise<{ count: number; exceeded: boolean }> | { count: number; exceeded: boolean };
}

// =============================================================================
// Plugin
// =============================================================================

export function rateLimitPlugin(options: RateLimitPluginOptions = {}) {
  const { skipRoutes = [] } = options;
  const allSkipRoutes = [...DEFAULT_SKIP_ROUTES, ...skipRoutes];

  const windowMsRaw = options.windowMs ?? Number(process.env["RATE_LIMIT_WINDOW"]);
  const windowMs = Number.isFinite(windowMsRaw) && windowMsRaw > 0 ? windowMsRaw : 60_000;

  const maxRequestsRaw = options.maxRequests ?? Number(process.env["RATE_LIMIT_MAX"]);
  const maxRequests =
    Number.isFinite(maxRequestsRaw) && maxRequestsRaw > 0 ? maxRequestsRaw : 100;

  const isTestRun =
    process.env["NODE_ENV"] === "test" ||
    process.env["BUN_TEST"] === "true" ||
    process.argv.includes("test");

  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : !isTestRun && process.env["FEATURE_RATE_LIMIT_ENABLED"] !== "false";

  if (!enabled) {
    return new Elysia({ name: "rate-limit" });
  }

  const windowSeconds = Math.max(1, Math.floor(windowMs / 1000));

  // In-memory fallback store, created lazily if Redis fails
  const fallbackStore = new InMemoryRateLimitStore();

  /**
   * Try Redis-based rate limiting first; fall back to in-memory on failure.
   */
  async function incrementWithFallback(
    cache: RateLimitCounter | undefined,
    key: string,
    windowSec: number,
    max: number
  ): Promise<{ count: number; exceeded: boolean }> {
    if (cache) {
      try {
        return await cache.incrementRateLimit(key, windowSec, max);
      } catch (error) {
        console.warn("[RateLimit] Redis unavailable, falling back to in-memory store", error);
      }
    }

    // Fallback to in-memory store
    return fallbackStore.incrementRateLimit(key, windowSec, max);
  }

  return new Elysia({ name: "rate-limit" }).onBeforeHandle(
    { as: "global" },
    async (ctx) => {
      const { request, path, set, requestId } = ctx as any;
      const safeRequestId =
        typeof requestId === "string" && requestId
          ? requestId
          : `req_${Date.now().toString(36)}`;

      if (request.method === "OPTIONS") return;

      const shouldSkip = allSkipRoutes.some((pattern) => pattern.test(path));
      if (shouldSkip) return;

      const cache = (ctx as any).cache as RateLimitCounter | undefined;

      // Resolve client IP: allow test override via _clientIp, otherwise use server socket IP
      const overrideIp = (ctx as any)._clientIp as string | undefined;
      const socketIp = overrideIp ?? ((ctx as any).server?.requestIP?.(request)?.address as string | undefined);
      const ip = getClientIp(request, socketIp) ?? "unknown";

      // Check auth-specific rate limiting first (uses IP-only keys)
      const authLimit = matchAuthRoute(path);
      if (authLimit) {
        const authKey = `auth:rate_limit:${ip}:${request.method}:${path}`;
        const { count, exceeded } = await incrementWithFallback(
          cache,
          authKey,
          authLimit.windowSeconds,
          authLimit.maxRequests
        );

        set.headers["X-RateLimit-Limit"] = String(authLimit.maxRequests);
        set.headers["X-RateLimit-Remaining"] = String(
          Math.max(0, authLimit.maxRequests - count)
        );
        set.headers["X-RateLimit-Window"] = String(authLimit.windowSeconds);

        if (exceeded) {
          set.status = 429;
          set.headers["Retry-After"] = String(authLimit.windowSeconds);
          return createErrorResponse(
            ErrorCodes.TOO_MANY_REQUESTS,
            "Rate limit exceeded",
            safeRequestId,
            { maxRequests: authLimit.maxRequests, windowMs: authLimit.windowSeconds * 1000 }
          );
        }

        // Auth routes have their own rate limiting — skip generic to avoid double-counting
        return;
      }

      // Unauthenticated endpoint rate limiting — stricter IP-only limits
      // when there is no authenticated user, to prevent anonymous abuse
      const userId = (ctx as any).user?.id;
      if (!userId) {
        const unauthKey = `unauth:rate_limit:${ip}:${request.method}:${path}`;
        const unauthMaxRequests = Math.min(maxRequests, 30); // stricter cap for unauthenticated
        const unauthWindowSeconds = Math.max(windowSeconds, 60);
        const { count, exceeded } = await incrementWithFallback(
          cache,
          unauthKey,
          unauthWindowSeconds,
          unauthMaxRequests
        );

        set.headers["X-RateLimit-Limit"] = String(unauthMaxRequests);
        set.headers["X-RateLimit-Remaining"] = String(
          Math.max(0, unauthMaxRequests - count)
        );
        set.headers["X-RateLimit-Window"] = String(unauthWindowSeconds);

        if (exceeded) {
          set.status = 429;
          set.headers["Retry-After"] = String(unauthWindowSeconds);
          return createErrorResponse(
            ErrorCodes.TOO_MANY_REQUESTS,
            "Rate limit exceeded",
            safeRequestId,
            { maxRequests: unauthMaxRequests, windowMs: unauthWindowSeconds * 1000 }
          );
        }

        return; // Skip generic rate limiting for unauthenticated requests
      }

      // Generic rate limiting — use only validated tenant context, never the raw header
      const tenantId = (ctx as any).tenantId ?? "public";
      const endpoint = `${request.method}:${path}`;
      const key = CacheKeys.rateLimit(tenantId, userId, endpoint);

      const { count, exceeded } = await incrementWithFallback(
        cache,
        key,
        windowSeconds,
        maxRequests
      );

      set.headers["X-RateLimit-Limit"] = String(maxRequests);
      set.headers["X-RateLimit-Remaining"] = String(
        Math.max(0, maxRequests - count)
      );
      set.headers["X-RateLimit-Window"] = String(windowSeconds);

      if (exceeded) {
        set.status = 429;
        set.headers["Retry-After"] = String(windowSeconds);
        return createErrorResponse(
          ErrorCodes.TOO_MANY_REQUESTS,
          "Rate limit exceeded",
          safeRequestId,
          { maxRequests, windowMs }
        );
      }
    }
  );
}
