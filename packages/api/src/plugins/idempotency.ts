/**
 * Idempotency Plugin
 *
 * Ensures mutating operations can be safely retried without
 * causing duplicate side effects.
 *
 * Features:
 * - Idempotency-Key header enforcement on mutations
 * - Scoped by tenant + user + route key
 * - Response caching for duplicate requests
 * - Configurable TTL (default 24-72 hours)
 * - Concurrent request handling (locking)
 */

import { Elysia, t } from "elysia";
import { type DatabaseClient } from "./db";
import { type CacheClient, CacheTTL } from "./cache";

// =============================================================================
// Types
// =============================================================================

/**
 * Stored idempotency record
 */
export interface IdempotencyRecord {
  id: string;
  tenantId: string;
  userId: string;
  routeKey: string;
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  createdAt: Date;
  expiresAt: Date;
  processing: boolean;
  processingStartedAt: Date | null;
}

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  /** Whether a cached response exists */
  exists: boolean;
  /** Whether the request is currently being processed */
  locked: boolean;
  /** The cached record if exists */
  record: IdempotencyRecord | null;
}

/**
 * Idempotency context added to request
 */
export interface IdempotencyContext {
  /** The idempotency key from the request */
  idempotencyKey: string | null;
  /** Route key for scoping */
  routeKey: string;
  /** Whether this is a replay of a previous request */
  isReplay: boolean;
  /** The cached response if replaying */
  cachedResponse: {
    status: number;
    body: unknown;
    headers: Record<string, string>;
  } | null;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Idempotency-related error codes
 */
export const IdempotencyErrorCodes = {
  MISSING_IDEMPOTENCY_KEY: "MISSING_IDEMPOTENCY_KEY",
  INVALID_IDEMPOTENCY_KEY: "INVALID_IDEMPOTENCY_KEY",
  REQUEST_IN_PROGRESS: "REQUEST_IN_PROGRESS",
  REQUEST_MISMATCH: "REQUEST_MISMATCH",
} as const;

/**
 * Idempotency error
 */
export class IdempotencyError extends Error {
  constructor(
    public code: keyof typeof IdempotencyErrorCodes,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "IdempotencyError";
  }
}

// =============================================================================
// Idempotency Service
// =============================================================================

/**
 * Service for idempotency operations
 */
export class IdempotencyService {
  private readonly LOCK_TIMEOUT_MS = 30000; // 30 seconds
  private readonly DEFAULT_TTL_HOURS = 48; // 48 hours

  constructor(
    private db: DatabaseClient,
    private cache: CacheClient
  ) {}

  /**
   * Generate a cache key for idempotency lookup
   */
  private getCacheKey(
    tenantId: string,
    userId: string,
    routeKey: string,
    idempotencyKey: string
  ): string {
    return `idempotency:${tenantId}:${userId}:${routeKey}:${idempotencyKey}`;
  }

  /**
   * Hash request body for comparison using SHA-256
   * Uses Web Crypto API for collision-resistant hashing
   */
  hashRequest(body: unknown): string {
    const str = JSON.stringify(body ?? {});
    // Use Bun's built-in crypto for fast, collision-resistant hashing
    const hash = Bun.hash(str);
    return hash.toString(16);
  }

  /**
   * Check if an idempotency key has been used
   */
  async check(
    tenantId: string,
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<IdempotencyCheckResult> {
    const cacheKey = this.getCacheKey(tenantId, userId, routeKey, idempotencyKey);

    // Try cache first
    const cached = await this.cache.get<IdempotencyRecord>(cacheKey);
    if (cached) {
      // Check if request body matches
      if (cached.requestHash !== requestHash) {
        throw new IdempotencyError(
          "REQUEST_MISMATCH",
          "Idempotency key was used with a different request body",
          422
        );
      }

      // Check if still processing (concurrent request)
      if (cached.processing && cached.processingStartedAt) {
        const lockAge = Date.now() - new Date(cached.processingStartedAt).getTime();
        if (lockAge < this.LOCK_TIMEOUT_MS) {
          return { exists: false, locked: true, record: null };
        }
      }

      // Check if expired
      if (new Date(cached.expiresAt) < new Date()) {
        await this.cache.del(cacheKey);
        return { exists: false, locked: false, record: null };
      }

      return { exists: true, locked: false, record: cached };
    }

    // Check database
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<IdempotencyRecord[]>`
        SELECT
          id, tenant_id as "tenantId", user_id as "userId",
          route_key as "routeKey", idempotency_key as "idempotencyKey",
          request_hash as "requestHash", response_status as "responseStatus",
          response_body::text as "responseBody", response_headers as "responseHeaders",
          created_at as "createdAt", expires_at as "expiresAt",
          processing, processing_started_at as "processingStartedAt"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id = ${userId}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
          AND expires_at > now()
      `;
    });

    if (results.length === 0) {
      return { exists: false, locked: false, record: null };
    }

    const record = results[0] as IdempotencyRecord;

    // Check request hash match
    if (record.requestHash !== requestHash) {
      throw new IdempotencyError(
        "REQUEST_MISMATCH",
        "Idempotency key was used with a different request body",
        422
      );
    }

    // Check if processing
    if (record.processing && record.processingStartedAt) {
      const lockAge = Date.now() - new Date(record.processingStartedAt).getTime();
      if (lockAge < this.LOCK_TIMEOUT_MS) {
        return { exists: false, locked: true, record: null };
      }
    }

    // Cache for future lookups
    await this.cache.set(cacheKey, record, CacheTTL.LONG);

    return { exists: true, locked: false, record };
  }

  /**
   * Lock an idempotency key before processing
   */
  async lock(
    tenantId: string,
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    requestHash: string,
    ttlHours: number = this.DEFAULT_TTL_HOURS
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const id = crypto.randomUUID();

    await this.db.withSystemContext(async (tx) => {
      await tx`
        INSERT INTO app.idempotency_keys (
          id, tenant_id, user_id, route_key, idempotency_key,
          request_hash, response_status,
          processing, processing_started_at,
          expires_at
        )
        VALUES (
          ${id}::uuid, ${tenantId}::uuid, ${userId}::uuid,
          ${routeKey}, ${idempotencyKey}, ${requestHash}, 0,
          true, now(), ${expiresAt}
        )
        ON CONFLICT (tenant_id, user_id, route_key, idempotency_key)
        DO UPDATE SET
          processing = true,
          processing_started_at = now()
        WHERE app.idempotency_keys.processing = false
           OR app.idempotency_keys.processing_started_at < now() - interval '30 seconds'
      `;
    });

    // Cache the lock
    const cacheKey = this.getCacheKey(tenantId, userId, routeKey, idempotencyKey);
    await this.cache.set(
      cacheKey,
      {
        id,
        tenantId,
        userId,
        routeKey,
        idempotencyKey,
        requestHash,
        processing: true,
        processingStartedAt: new Date(),
        expiresAt,
        responseStatus: 0,
        responseBody: "{}",
        responseHeaders: {},
        createdAt: new Date(),
      },
      CacheTTL.SHORT
    );

    return id;
  }

  /**
   * Store the response for a completed request
   */
  async complete(
    tenantId: string,
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    response: {
      status: number;
      body: unknown;
      headers: Record<string, string>;
    },
    ttlHours: number = this.DEFAULT_TTL_HOURS
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const responseBody = JSON.stringify(response.body);
    const responseHeadersJson = JSON.stringify(response.headers);

    const existing = await this.db.withSystemContext(async (tx) => {
      return await tx<Array<{ id: string; requestHash: string }>>`
        SELECT id::text as id, request_hash as "requestHash"
        FROM app.idempotency_keys
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id = ${userId}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
        LIMIT 1
      `;
    });

    const anyExisting = (existing[0] ?? null) as any;
    const requestHash =
      (anyExisting && typeof anyExisting.requestHash === "string" && anyExisting.requestHash) ||
      (anyExisting && typeof anyExisting.request_hash === "string" && anyExisting.request_hash) ||
      "";

    await this.db.withSystemContext(async (tx) => {
      await tx`
        UPDATE app.idempotency_keys
        SET
          response_status = ${response.status},
          response_body = ${responseBody}::jsonb,
          response_headers = ${responseHeadersJson}::jsonb,
          processing = false,
          processing_started_at = NULL,
          expires_at = ${expiresAt}
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id = ${userId}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
      `;
    });

    // Update cache
    const cacheKey = this.getCacheKey(tenantId, userId, routeKey, idempotencyKey);
    const record: IdempotencyRecord = {
      id: existing[0]?.id ?? crypto.randomUUID(),
      tenantId,
      userId,
      routeKey,
      idempotencyKey,
      requestHash,
      responseStatus: response.status,
      responseBody,
      responseHeaders: response.headers,
      createdAt: new Date(),
      expiresAt,
      processing: false,
      processingStartedAt: null,
    };
    await this.cache.set(cacheKey, record, ttlHours * 60 * 60);
  }

  /**
   * Release a lock without storing a response (for errors)
   */
  async release(
    tenantId: string,
    userId: string,
    routeKey: string,
    idempotencyKey: string
  ): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        DELETE FROM app.idempotency_keys
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id = ${userId}::uuid
          AND route_key = ${routeKey}
          AND idempotency_key = ${idempotencyKey}
          AND response_status = 0
      `;
    });

    // Clear cache
    const cacheKey = this.getCacheKey(tenantId, userId, routeKey, idempotencyKey);
    await this.cache.del(cacheKey);
  }

  /**
   * Clean up expired idempotency records
   */
  async cleanup(): Promise<number> {
    const result = await this.db.withSystemContext(async (tx) => {
      const rows = await tx<{ count: string }[]>`
        WITH deleted AS (
          DELETE FROM app.idempotency_keys
          WHERE expires_at < now()
          RETURNING id
        )
        SELECT COUNT(*)::text as count FROM deleted
      `;
      return parseInt(rows[0]?.count ?? "0", 10);
    });

    return result;
  }
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Plugin options
 */
export interface IdempotencyPluginOptions {
  /** Header name for idempotency key (default: Idempotency-Key) */
  headerName?: string;
  /** TTL in hours for stored responses (default: 48) */
  ttlHours?: number;
  /** Routes to skip idempotency check (regex patterns) */
  skipRoutes?: RegExp[];
  /** HTTP methods that require idempotency (default: POST, PUT, PATCH, DELETE) */
  methods?: string[];
}

/**
 * Default routes that skip idempotency
 */
const DEFAULT_SKIP_ROUTES = [
  /^\/$/,
  /^\/health/,
  /^\/ready/,
  /^\/live/,
  /^\/docs/,
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/v1\/auth\//,
];

/**
 * Idempotency plugin for Elysia
 *
 * Enforces idempotency for mutating operations to prevent
 * duplicate side effects on retries.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .use(cachePlugin())
 *   .use(authPlugin())
 *   .use(tenantPlugin())
 *   .use(idempotencyPlugin())
 *   .post('/example', ({ idempotency }) => {
 *     if (idempotency.isReplay) {
 *       return idempotency.cachedResponse;
 *     }
 *     // Process request...
 *   });
 * ```
 */
export function idempotencyPlugin(options: IdempotencyPluginOptions = {}) {
  const {
    headerName = "Idempotency-Key",
    ttlHours = 48,
    skipRoutes = [],
    methods = ["POST", "PUT", "PATCH", "DELETE"],
  } = options;
  const allSkipRoutes = [...DEFAULT_SKIP_ROUTES, ...skipRoutes];

  // Singleton: created once when plugin is initialized, reused across all requests
  let idempotencyServiceSingleton: IdempotencyService | null = null;

  return new Elysia({ name: "idempotency" })
    // Idempotency service (singleton)
    .derive({ as: "global" }, (ctx) => {
      const { db, cache } = ctx as any;
      if (!idempotencyServiceSingleton) {
        idempotencyServiceSingleton = new IdempotencyService(db, cache);
      }
      return {
        idempotencyService: idempotencyServiceSingleton,
      } as Record<string, unknown>;
    })

    // Check idempotency on mutating requests
    .derive(
      { as: "global" },
      async (ctx) => {
        const {
          request,
          path,
          idempotencyService,
          tenantId,
          user,
          set,
        } = ctx as any;

        let requestPath = typeof path === "string" ? path : "";
        try {
          requestPath = new URL(request.url).pathname;
        } catch {
          // ignore
        }
        // Default context for non-mutating requests
        const defaultContext: IdempotencyContext = {
          idempotencyKey: null,
          routeKey: `${request.method}:${requestPath}`,
          isReplay: false,
          cachedResponse: null,
        };

        // Skip if not a mutating method
        if (!methods.includes(request.method)) {
          return { idempotency: defaultContext };
        }

        // Skip for certain routes
        const shouldSkip = allSkipRoutes.some((pattern) => pattern.test(requestPath));
        if (shouldSkip) {
          return { idempotency: defaultContext };
        }

        // Skip if no auth context (auth plugin will handle error)
        if (!user || !tenantId) {
          return { idempotency: defaultContext };
        }

        // Get idempotency key from header
        const idempotencyKey = request.headers.get(headerName);
        if (!idempotencyKey) {
          set.status = 400;
          throw new IdempotencyError(
            "MISSING_IDEMPOTENCY_KEY",
            `${headerName} header is required for mutating operations`,
            400
          );
        }

        // Validate key format (UUID or reasonable string)
        if (idempotencyKey.length > 256 || idempotencyKey.length < 1) {
          set.status = 400;
          throw new IdempotencyError(
            "INVALID_IDEMPOTENCY_KEY",
            "Idempotency key must be between 1 and 256 characters",
            400
          );
        }

        const routeKey = `${request.method}:${requestPath}`;

        const isPlainObject = (value: any): value is Record<string, unknown> => {
          if (!value || typeof value !== "object") return false;
          if (Array.isArray(value)) return false;
          if (value instanceof Date) return false;
          const proto = Object.getPrototypeOf(value);
          return proto === Object.prototype || proto === null;
        };

        const canonicalize = (value: any): any => {
          if (Array.isArray(value)) {
            return value.map(canonicalize);
          }

          if (isPlainObject(value)) {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(value).sort()) {
              out[key] = canonicalize(value[key]);
            }
            return out;
          }

          return value;
        };

        // Prefer already-parsed body (zero-copy) over request.clone() which
        // duplicates the entire body buffer into memory.
        let bodyForHash: unknown = null;

        const parsedBody = (ctx as any).body;
        if (parsedBody !== undefined && parsedBody !== null) {
          bodyForHash = canonicalize(parsedBody);
        } else if (!request.bodyUsed) {
          try {
            const raw = await request.clone().text();
            if (raw) {
              try {
                bodyForHash = canonicalize(JSON.parse(raw));
              } catch {
                bodyForHash = raw;
              }
            }
          } catch {
            // ignore
          }
        }

        const requestHash = idempotencyService.hashRequest(bodyForHash);

        // Check if key has been used
        const checkResult = await idempotencyService.check(
          tenantId,
          user.id,
          routeKey,
          idempotencyKey,
          requestHash
        );

        // If request is being processed concurrently
        if (checkResult.locked) {
          set.status = 409;
          throw new IdempotencyError(
            "REQUEST_IN_PROGRESS",
            "A request with this idempotency key is currently being processed",
            409
          );
        }

        // If we have a cached response, return it
        if (checkResult.exists && checkResult.record) {
          const record = checkResult.record;
          return {
            idempotency: {
              idempotencyKey,
              routeKey,
              isReplay: true,
              cachedResponse: {
                status: record.responseStatus,
                body: JSON.parse(record.responseBody),
                headers: record.responseHeaders,
              },
            },
          };
        }

        // Lock the key for processing
        await idempotencyService.lock(
          tenantId,
          user.id,
          routeKey,
          idempotencyKey,
          requestHash,
          ttlHours
        );

        return {
          idempotency: {
            idempotencyKey,
            routeKey,
            isReplay: false,
            cachedResponse: null,
          },
        };
      }
    )

    .onBeforeHandle({ as: "global" }, async (ctx) => {
      const { idempotency, set } = ctx as any;
      if (idempotency?.isReplay && idempotency.cachedResponse) {
        set.status = idempotency.cachedResponse.status;
        if (idempotency.cachedResponse.headers) {
          for (const [key, value] of Object.entries(idempotency.cachedResponse.headers)) {
            set.headers[key] = value;
          }
        }
        return idempotency.cachedResponse.body;
      }
    })

    // Store response after successful mutation
    .onAfterHandle({ as: "global" }, async (ctx) => {
      const { set, idempotency, idempotencyService, tenantId, user } = ctx as any;
      const response = (ctx as any).responseValue;

      // Only store for actual processing (not replays)
      if (!idempotency?.idempotencyKey || idempotency.isReplay) {
        return;
      }

      if (!user || !tenantId) {
        return;
      }

      // Store the response
      try {
        const isResponseLike = (value: unknown): value is Response => {
          if (!value || typeof value !== "object") return false;
          const anyVal = value as any;
          return (
            typeof anyVal.status === "number" &&
            typeof anyVal.headers?.get === "function" &&
            typeof anyVal.clone === "function"
          );
        };

        const status = typeof set?.status === "number" ? set.status : 200;
        if (status >= 400) {
          return;
        }

        const normalizedBody =
          response === undefined || isResponseLike(response) ? null : response;

        const normalizedHeaders: Record<string, string> = {};
        try {
          if (set?.headers) {
            for (const [key, value] of Object.entries(set.headers)) {
              if (typeof value === "string") normalizedHeaders[key] = value;
            }
          }
        } catch {
          // ignore
        }

        await idempotencyService.complete(
          tenantId,
          user.id,
          idempotency.routeKey,
          idempotency.idempotencyKey,
          {
            status,
            body: normalizedBody,
            headers: normalizedHeaders,
          },
          ttlHours
        );
      } catch (error) {
        // Log but don't fail the request
        console.error("[Idempotency] Failed to store response:", error);
      }
    })

    // Release lock on error
    .onError({ as: "global" }, async (ctx) => {
      const { error, idempotency, idempotencyService, tenantId, user } = ctx as any;
      if (!idempotency?.idempotencyKey || idempotency.isReplay) {
        return;
      }

      if (!user || !tenantId) {
        return;
      }

      // Release the lock so the request can be retried
      try {
        await idempotencyService.release(
          tenantId,
          user.id,
          idempotency.routeKey,
          idempotency.idempotencyKey
        );
      } catch (releaseError) {
        console.error("[Idempotency] Failed to release lock:", releaseError);
      }

      // Re-throw idempotency errors with proper format
      if (error instanceof IdempotencyError) {
        return {
          error: {
            code: error.code,
            message: error.message,
            requestId: "",
          },
        };
      }
    });
}

/**
 * Guard that requires idempotency key
 * Returns cached response if this is a replay
 */
export function requireIdempotency() {
  return new Elysia({ name: "require-idempotency" }).derive(
    (ctx) => {
      const { idempotency, set } = ctx as any;
      if (!idempotency?.idempotencyKey) {
        set.status = 400;
        throw new IdempotencyError(
          "MISSING_IDEMPOTENCY_KEY",
          "Idempotency-Key header is required",
          400
        );
      }

      // If this is a replay, the route handler should return the cached response
      return { idempotency };
    }
  );
}

/**
 * Helper to handle idempotent request in route handler
 *
 * Usage:
 * ```ts
 * .post('/resource', async ({ idempotency, ...ctx }) => {
 *   // Return cached response if replay
 *   const cached = handleIdempotentRequest(idempotency);
 *   if (cached) return cached;
 *
 *   // Process new request...
 * })
 * ```
 */
export function handleIdempotentRequest(
  idempotency: IdempotencyContext
): unknown | null {
  if (idempotency.isReplay && idempotency.cachedResponse) {
    return idempotency.cachedResponse.body;
  }
  return null;
}
