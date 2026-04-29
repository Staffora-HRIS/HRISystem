/**
 * Tenant Resolution Plugin
 *
 * Middleware for multi-tenant context resolution.
 * Features:
 * - Extract tenant from X-Tenant-ID header or session
 * - Validate tenant exists and is active
 * - Decorate request with tenant context
 * - Set tenant context in database connection
 */

import { Elysia } from "elysia";
import { type DatabaseClient } from "./db";
import { type CacheClient, CacheTTL } from "./cache";

// =============================================================================
// Types
// =============================================================================

/**
 * Tenant information from database
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleted";
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant context attached to requests
 */
export interface TenantContext {
  tenant: Tenant;
  tenantId: string;
}

/**
 * Tenant resolution sources
 */
export type TenantSource = "header" | "session" | "subdomain";

// =============================================================================
// Errors
// =============================================================================

/** Pre-compiled UUID regex for tenant ID validation (avoids re-compiling per request) */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tenant-related error codes
 */
export const TenantErrorCodes = {
  MISSING_TENANT: "MISSING_TENANT",
  INVALID_TENANT: "INVALID_TENANT",
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  TENANT_SUSPENDED: "TENANT_SUSPENDED",
  TENANT_DELETED: "TENANT_DELETED",
} as const;

/**
 * Tenant resolution error
 */
export class TenantError extends Error {
  constructor(
    public code: keyof typeof TenantErrorCodes,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "TenantError";
  }
}

// =============================================================================
// Tenant Service
// =============================================================================

/**
 * Service for tenant operations
 */
export class TenantService {
  constructor(
    private db: DatabaseClient,
    private cache: CacheClient
  ) {}

  /**
   * Get tenant by ID
   */
  async getById(tenantId: string): Promise<Tenant | null> {
    // Try cache first
    const cacheKey = `tenant:${tenantId}`;
    const cached = await this.cache.get<Tenant>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<Tenant[]>`
        SELECT id, name, slug, status, settings, created_at, updated_at
        FROM app.tenants
        WHERE id = ${tenantId}::uuid
      `;
    });

    if (results.length === 0) {
      return null;
    }

    const tenant = results[0] as Tenant;

    // Cache the result (60 seconds to limit exposure window if tenant becomes suspended)
    await this.cache.set(cacheKey, tenant, CacheTTL.SHORT);

    return tenant;
  }

  /**
   * Get tenant by slug
   */
  async getBySlug(slug: string): Promise<Tenant | null> {
    // Try cache first
    const cacheKey = `tenant:slug:${slug}`;
    const cached = await this.cache.get<Tenant>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<Tenant[]>`
        SELECT id, name, slug, status, settings, created_at, updated_at
        FROM app.tenants
        WHERE slug = ${slug}
      `;
    });

    if (results.length === 0) {
      return null;
    }

    const tenant = results[0] as Tenant;

    // Cache the result (60 seconds to limit exposure window if tenant becomes suspended)
    await this.cache.set(cacheKey, tenant, CacheTTL.SHORT);

    return tenant;
  }

  /**
   * Validate and get tenant, throwing appropriate errors
   */
  async validateTenant(tenantId: string): Promise<Tenant> {
    // Validate UUID format (uses pre-compiled regex)
    if (!UUID_REGEX.test(tenantId)) {
      throw new TenantError(
        "INVALID_TENANT",
        "Invalid tenant ID format",
        400
      );
    }

    const tenant = await this.getById(tenantId);

    if (!tenant) {
      throw new TenantError(
        "TENANT_NOT_FOUND",
        "Tenant not found",
        404
      );
    }

    if (tenant.status === "suspended") {
      // Invalidate cache for suspended tenants so status changes take effect immediately
      await this.cache.del(`tenant:${tenantId}`);
      throw new TenantError(
        "TENANT_SUSPENDED",
        "Tenant is suspended. Please contact support.",
        403
      );
    }

    if (tenant.status === "deleted") {
      // Invalidate cache for deleted tenants so status changes take effect immediately
      await this.cache.del(`tenant:${tenantId}`);
      throw new TenantError(
        "TENANT_DELETED",
        "Tenant has been deleted",
        404
      );
    }

    return tenant;
  }

  /**
   * Invalidate tenant cache
   */
  async invalidateCache(tenantId: string): Promise<void> {
    const tenant = await this.getById(tenantId);
    await this.cache.del(`tenant:${tenantId}`);
    if (tenant) {
      await this.cache.del(`tenant:slug:${tenant.slug}`);
    }
  }
}

// =============================================================================
// Tenant Resolution
// =============================================================================

/**
 * Options for tenant resolution
 */
export interface TenantResolutionOptions {
  /** Header name for tenant ID (default: X-Tenant-ID) */
  headerName?: string;
  /** Whether to allow missing tenant (for public routes) */
  optional?: boolean;
  /** Routes to skip tenant resolution (regex patterns) */
  skipRoutes?: RegExp[];
}

/**
 * Default routes that don't require tenant context
 */
const DEFAULT_SKIP_ROUTES = [
  /^\/$/,           // Root
  /^\/health/,      // Health checks
  /^\/ready/,       // Readiness
  /^\/live/,        // Liveness
  /^\/docs/,        // API docs
  /^\/api\/auth/,   // Better Auth endpoints
  /^\/api\/v1\/auth(?:\/|$)/,
  /^\/api\/v1\/auth\/login/,  // Login doesn't need tenant yet
  /^\/api\/v1\/auth\/register/, // Registration
];

/**
 * Resolve tenant from request (synchronous - header/session only)
 * For fallback to user's primary tenant, use resolveTenantWithFallback()
 */
export function resolveTenant(
  headers: Headers,
  session: { currentTenantId?: string } | null,
  options: TenantResolutionOptions = {}
): { tenantId: string | null; source: TenantSource | null } {
  const { headerName = "X-Tenant-ID" } = options;

  // 1. Try header first (explicit tenant selection)
  const headerValue = headers.get(headerName);
  if (headerValue) {
    return { tenantId: headerValue, source: "header" };
  }

  // 2. Try session (stored tenant from previous selection)
  if (session?.currentTenantId) {
    return { tenantId: session.currentTenantId, source: "session" };
  }

  // 3. No tenant found
  return { tenantId: null, source: null };
}

/**
 * Resolve tenant with fallback to user's primary tenant (async)
 * This is the preferred method when authService is available
 */
export async function resolveTenantWithFallback(
  headers: Headers,
  session: { id?: string; currentTenantId?: string } | null,
  userId: string | null,
  authService: { getSessionTenant: (sessionId: string, userId?: string | null) => Promise<string | null> } | null,
  options: TenantResolutionOptions = {}
): Promise<{ tenantId: string | null; source: TenantSource | null }> {
  const { headerName = "X-Tenant-ID" } = options;

  // 1. Try header first (explicit tenant selection)
  const headerValue = headers.get(headerName);
  if (headerValue) {
    return { tenantId: headerValue, source: "header" };
  }

  // 2. Try session's currentTenantId directly
  if (session?.currentTenantId) {
    return { tenantId: session.currentTenantId, source: "session" };
  }

  // 3. If we have authService and session, try to get tenant with fallback to user's primary
  if (authService && session?.id && userId) {
    const tenantId = await authService.getSessionTenant(session.id, userId);
    if (tenantId) {
      return { tenantId, source: "session" };
    }
  }

  // 4. No tenant found
  return { tenantId: null, source: null };
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Tenant resolution plugin for Elysia
 *
 * Resolves tenant context from request and validates it.
 * Adds tenant information to the request context.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .use(cachePlugin())
 *   .use(tenantPlugin())
 *   .get('/example', ({ tenant }) => {
 *     return { tenantId: tenant.id };
 *   });
 * ```
 */
export function tenantPlugin(options: TenantResolutionOptions = {}) {
  const { headerName = "X-Tenant-ID", skipRoutes = [] } = options;
  const allSkipRoutes = [...DEFAULT_SKIP_ROUTES, ...skipRoutes];

  // Singleton: created once when plugin is initialized, reused across all requests
  let tenantServiceSingleton: TenantService | null = null;

  return new Elysia({ name: "tenant" })
    // Tenant service for direct access (singleton)
    .derive({ as: "global" }, (ctx) => {
      const { db, cache } = ctx as any;
      if (!tenantServiceSingleton) {
        tenantServiceSingleton = new TenantService(db, cache);
      }
      return {
        tenantService: tenantServiceSingleton,
      };
    })

    // Tenant context resolution
    .derive(
      { as: "global" },
      async (ctx): Promise<{ tenant: Tenant | null; tenantId: string | null }> => {
        const { request, path, tenantService, set } = ctx as any;
        const session = (ctx as any).session ?? null;
        const user = (ctx as any).user ?? null;
        const authService = (ctx as any).authService ?? null;

        // Check if route should skip tenant resolution
        const shouldSkip = allSkipRoutes.some((pattern) => pattern.test(path));
        if (shouldSkip) {
          return { tenant: null, tenantId: null };
        }

        // Resolve tenant from request with fallback to user's primary tenant
        // This ensures authenticated users get their primary tenant automatically
        const { tenantId } = await resolveTenantWithFallback(
          request.headers,
          session,
          user?.id ?? null,
          authService,
          { headerName }
        );

        // If no tenant ID and not optional, error
        if (!tenantId) {
          if (options.optional) {
            return { tenant: null, tenantId: null };
          }

          set.status = 400;
          throw new TenantError(
            "MISSING_TENANT",
            `Tenant context required. Provide ${headerName} header.`,
            400
          );
        }

        // Validate and get tenant
        try {
          const tenant = await tenantService.validateTenant(tenantId);
          return { tenant, tenantId: tenant.id };
        } catch (error) {
          if (error instanceof TenantError) {
            set.status = error.statusCode;
            throw error;
          }
          throw error;
        }
      }
    )

    .derive({ as: "global" }, (ctx) => {
      const { tenantId } = ctx as any;
      const user = (ctx as any).user as { id: string } | null | undefined;

      if (typeof tenantId !== "string" || !tenantId) {
        return { tenantContext: null as { tenantId: string; userId?: string } | null };
      }

      return {
        tenantContext: {
          tenantId,
          userId: typeof user?.id === "string" ? user.id : undefined,
        },
      };
    })

    // Error handler for tenant errors
    .onError(({ error, set }) => {
      if (error instanceof TenantError) {
        set.status = error.statusCode;
        return {
          error: {
            code: error.code,
            message: error.message,
            requestId: "", // Will be added by error plugin
          },
        };
      }
    });
}

/**
 * Guard that requires tenant context
 * Use this on routes that absolutely need a tenant
 */
export function requireTenant() {
  return new Elysia({ name: "require-tenant" }).derive((ctx) => {
    const { tenant, set } = ctx as any;
    if (!tenant) {
      set.status = 400;
      throw new TenantError(
        "MISSING_TENANT",
        "This endpoint requires tenant context",
        400
      );
    }
    return { tenant: tenant as Tenant };
  });
}

/**
 * Middleware function for beforeHandle that requires tenant context
 * Use this in beforeHandle arrays: { beforeHandle: [requireTenantContext] }
 * 
 * FIX: This guard ensures routes that need tenant context get a proper 400 error
 * instead of crashing with a 500 when tenant is null.
 */
export function requireTenantContext(ctx: any): void {
  const { tenant, set } = ctx;
  if (!tenant) {
    set.status = 400;
    throw new TenantError(
      "MISSING_TENANT",
      "Tenant context required. Provide X-Tenant-ID header or ensure you have selected a tenant.",
      400
    );
  }
}

/**
 * Type guard to check if tenant context exists
 */
export function hasTenant(
  context: { tenant: Tenant | null }
): context is { tenant: Tenant } {
  return context.tenant !== null;
}
