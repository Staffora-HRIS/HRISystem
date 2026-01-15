import { Elysia } from "elysia";
import { CacheKeys } from "./cache";
import { createErrorResponse, ErrorCodes } from "./errors";

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

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim());
    return ips[0] || null;
  }

  const realIp = request.headers.get("X-Real-IP");
  if (realIp) return realIp;

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
      : !isTestRun && process.env["FEATURE_RATE_LIMIT_ENABLED"] === "true";

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

      const ip = getClientIp(request) ?? "unknown";
      const tenantId = request.headers.get("X-Tenant-ID") ?? (ctx as any).tenantId ?? "public";
      const userId = (ctx as any).user?.id ?? `ip:${ip}`;
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
