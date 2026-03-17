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

      const cache = (ctx as any).cache as
        | { incrementRateLimit?: (key: string, windowSeconds: number, maxRequests: number) => Promise<{ count: number; exceeded: boolean }> }
        | undefined;

      if (!cache?.incrementRateLimit) return;

      const socketIp = (ctx as any).server?.requestIP?.(request)?.address as string | undefined;
      const ip = getClientIp(request, socketIp) ?? "unknown";

      // Check auth-specific rate limiting first (uses IP-only keys)
      const authLimit = matchAuthRoute(path);
      if (authLimit) {
        const authKey = `auth:rate_limit:${ip}:${request.method}:${path}`;
        try {
          const { count, exceeded } = await cache.incrementRateLimit(
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
        } catch (error) {
          console.warn("[RateLimit] Failed to apply auth rate limiting", error);
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
        try {
          const { count, exceeded } = await cache.incrementRateLimit(
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
        } catch (error) {
          console.warn("[RateLimit] Failed to apply unauthenticated rate limiting", error);
        }
        return; // Skip generic rate limiting for unauthenticated requests
      }

      // Generic rate limiting — use only validated tenant context, never the raw header
      const tenantId = (ctx as any).tenantId ?? "public";
      const endpoint = `${request.method}:${path}`;
      const key = CacheKeys.rateLimit(tenantId, userId, endpoint);

      try {
        const { count, exceeded } = await cache.incrementRateLimit(
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
      } catch (error) {
        console.warn("[RateLimit] Failed to apply rate limiting", error);
      }
    }
  );
}
