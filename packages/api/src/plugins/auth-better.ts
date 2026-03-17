/**
 * Better Auth Plugin for Elysia
 *
 * Replaces the legacy custom auth plugin with Better Auth.
 * Provides session management, user context, and auth guards.
 */

import { Elysia } from "elysia";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { isValidUUID } from "@staffora/shared/utils";
import { getBetterAuth } from "../lib/better-auth";
import type { DatabaseClient } from "./db";
import type { CacheClient } from "./cache";

// =============================================================================
// API Key Constants
// =============================================================================

/** Prefix for all Staffora API keys */
const API_KEY_PREFIX = "sfra_";

/**
 * User interface matching Better Auth user
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  status?: string;
  mfaEnabled?: boolean;
}

/**
 * Session interface matching Better Auth session
 */
export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  currentTenantId?: string | null;
}

/**
 * Auth context when authenticated
 */
export interface AuthContext {
  user: User;
  session: Session;
  isAuthenticated: true;
}

/**
 * Auth context when not authenticated
 */
export interface UnauthContext {
  user: null;
  session: null;
  isAuthenticated: false;
}

export type AuthState = AuthContext | UnauthContext;

/**
 * User with tenant associations
 */
export interface UserWithTenants extends User {
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    isPrimary: boolean;
  }>;
  currentTenantId?: string;
}

/**
 * Auth plugin options
 */
export interface AuthPluginOptions {
  cookieName?: string;
}

/**
 * Auth error codes
 */
export const AuthErrorCodes = {
  INVALID_SESSION: "AUTH_INVALID_SESSION",
  SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",
  INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  MFA_REQUIRED: "AUTH_MFA_REQUIRED",
  MFA_INVALID: "AUTH_MFA_INVALID",
  ACCOUNT_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  ACCOUNT_DELETED: "AUTH_ACCOUNT_DELETED",
  CSRF_INVALID: "AUTH_CSRF_INVALID",
} as const;

/**
 * Auth error class
 */
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Auth service for additional operations
 * Bridges Better Auth with existing tenant/role system
 */
export class AuthService {
  constructor(
    private db: DatabaseClient,
    private cache?: CacheClient
  ) {}

  /**
   * Get user with tenant associations
   */
  async getUserWithTenants(userId: string): Promise<UserWithTenants | null> {
    if (!isValidUUID(userId)) {
      return null;
    }

    const result = await this.db.query<{
      id: string;
      email: string;
      emailVerified: boolean;
      name: string | null;
      image: string | null;
      createdAt: Date;
      updatedAt: Date;
      status: string;
      mfaEnabled: boolean;
      tenants: Array<{
        id: string;
        name: string;
        slug: string;
        is_primary: boolean;
      }>;
    }>`
      SELECT 
        u.id::text,
        u.email,
        u."emailVerified" as email_verified,
        u.name,
        u.image,
        u."createdAt" as created_at,
        u."updatedAt" as updated_at,
        COALESCE(u.status, 'active') as status,
        COALESCE(u."mfaEnabled", false) as mfa_enabled,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', t.id,
              'name', t.name,
              'slug', t.slug,
              'is_primary', ut.is_primary
            ))
            FROM app.user_tenants ut
            JOIN app.tenants t ON t.id = ut.tenant_id
            WHERE ut.user_id = ${userId}::uuid
            AND ut.status = 'active'
          ),
          '[]'::json
        ) as tenants
      FROM app."user" u
      WHERE u.id = ${userId}
    `;

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerified,
      name: row.name,
      image: row.image,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      status: row.status,
      mfaEnabled: row.mfaEnabled,
      tenants: (row.tenants || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        isPrimary: t.is_primary,
      })),
    };
  }

  /**
   * Check if user has MFA enabled
   */
  async userHasMfa(userId: string): Promise<boolean> {
    const result = await this.db.query<{ has_mfa: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM app."twoFactor" WHERE "userId" = ${userId}
      ) as has_mfa
    `;
    return result[0]?.has_mfa ?? false;
  }

  /**
   * Get user's current session tenant
   * FIX: Corrected snake_case/camelCase mismatch that was causing tenant resolution to always fail.
   * The SQL alias must match the property name we access from the result object.
   * 
   * FIX: Added try-catch to prevent database errors from bubbling up as 500 Internal Server Errors.
   * Database errors (e.g., invalid UUID cast, connection issues) are caught and logged,
   * returning null to allow graceful degradation with proper error messages.
   */
  async getSessionTenant(sessionId: string, userId?: string | null): Promise<string | null> {
    try {
      // Check cache first
      if (this.cache) {
        const cached = await this.cache.get<string>(`session:tenant:${sessionId}`);
        if (cached) return cached;
      }

      // Prefer explicit session tenant if set
      // FIX: Changed alias from 'current_tenant_id' to 'currentTenantId' to match TypeScript property access
      const sessionRows = await this.db.query<{ currentTenantId: string | null }>`
        SELECT "currentTenantId"::text as "currentTenantId"
        FROM app."session"
        WHERE id = ${sessionId}
        LIMIT 1
      `;

      const explicitTenantId = sessionRows[0]?.currentTenantId ?? null;
      if (explicitTenantId) {
        if (this.cache) {
          await this.cache.set(`session:tenant:${sessionId}`, explicitTenantId, 300);
        }
        return explicitTenantId;
      }

      // Fallback to user's primary tenant
      if (!userId) return null;

      if (!isValidUUID(userId)) {
        console.warn(`[AuthService.getSessionTenant] Invalid UUID format for userId: ${userId}`);
        return null;
      }

      const primary = await this.db.query<{ tenant_id: string }>`
        SELECT tenant_id::text as tenant_id
        FROM app.user_tenants
        WHERE user_id = ${userId}::uuid
          AND is_primary = true
          AND status = 'active'
        LIMIT 1
      `;

      const tenantId = primary[0]?.tenant_id ?? null;

      // Persist fallback onto session so future requests can resolve from session alone
      if (tenantId) {
        await this.db.query`
          UPDATE app."session"
          SET "currentTenantId" = ${tenantId}::uuid, "updatedAt" = now()
          WHERE id = ${sessionId}
        `;
      }

      // Cache the result
      if (this.cache && tenantId) {
        await this.cache.set(`session:tenant:${sessionId}`, tenantId, 300);
      }

      return tenantId;
    } catch (error) {
      // Log the error for debugging but don't let it bubble up as 500
      // This allows the tenant resolution to fail gracefully with a proper "Missing Tenant" error
      console.error(`[AuthService.getSessionTenant] Error resolving tenant for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Verify and repair sync between Better Auth "user" table and app.users.
   * Called during session resolution to catch drift caused by failed databaseHooks.
   * Only runs the repair if actual drift is detected (email, name, status mismatch).
   */
  async verifySyncOnLogin(userId: string): Promise<void> {
    try {
      const rows = await this.db.query<{
        ba_email: string | null;
        ba_name: string | null;
        ba_status: string | null;
        ba_mfa: boolean | null;
        au_email: string | null;
        au_name: string | null;
        au_status: string | null;
        au_mfa: boolean | null;
        au_exists: boolean;
      }>`
        SELECT
          ba.email     AS ba_email,
          ba.name      AS ba_name,
          ba.status    AS ba_status,
          ba."mfaEnabled" AS ba_mfa,
          au.email     AS au_email,
          au.name      AS au_name,
          au.status    AS au_status,
          au.mfa_enabled AS au_mfa,
          (au.id IS NOT NULL) AS au_exists
        FROM app."user" ba
        LEFT JOIN app.users au ON au.id = ba.id::uuid
        WHERE ba.id = ${userId}
      `;

      if (rows.length === 0) return; // Better Auth user not found — nothing to sync
      const r = rows[0]!;

      if (!r.au_exists) {
        // app.users row missing entirely — recreate it
        await this.db.query`
          INSERT INTO app.users (id, email, name, status, mfa_enabled, created_at, updated_at)
          VALUES (${userId}::uuid, ${r.ba_email}, ${r.ba_name ?? r.ba_email}, ${r.ba_status ?? 'active'}, ${r.ba_mfa ?? false}, now(), now())
          ON CONFLICT (id) DO NOTHING
        `;
        console.warn(`[AuthService.verifySyncOnLogin] Repaired missing app.users row for user ${userId}`);
        return;
      }

      // Check for drift between the two tables
      const hasDrift =
        r.ba_email !== r.au_email ||
        r.ba_name !== r.au_name ||
        (r.ba_status ?? "active") !== (r.au_status ?? "active") ||
        Boolean(r.ba_mfa) !== Boolean(r.au_mfa);

      if (hasDrift) {
        await this.db.query`
          UPDATE app.users SET
            email = ${r.ba_email},
            name = ${r.ba_name ?? r.ba_email},
            status = ${r.ba_status ?? 'active'},
            mfa_enabled = ${r.ba_mfa ?? false},
            updated_at = now()
          WHERE id = ${userId}::uuid
        `;
        console.warn(`[AuthService.verifySyncOnLogin] Repaired drift for user ${userId}`);
      }
    } catch (error) {
      // Non-fatal — log and continue so login is not blocked
      console.error(`[AuthService.verifySyncOnLogin] Error verifying user sync for ${userId}:`, error);
    }
  }

  /**
   * Switch session to a different tenant
   */
  async switchTenant(userId: string, sessionId: string, tenantId: string): Promise<boolean> {
    // Verify user has access to this tenant
    const result = await this.db.query<{ has_access: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM app.user_tenants
        WHERE user_id = ${userId}::uuid
        AND tenant_id = ${tenantId}::uuid
        AND status = 'active'
      ) as has_access
    `;

    const hasAccess = result[0]?.has_access ?? false;
    if (!hasAccess) return false;

    // Persist selection onto Better Auth session
    await this.db.query`
      UPDATE app."session"
      SET "currentTenantId" = ${tenantId}::uuid, "updatedAt" = now()
      WHERE id = ${sessionId}
    `;

    if (this.cache) {
      await this.cache.set(`session:tenant:${sessionId}`, tenantId, 300);
    }

    return true;
  }
}

/**
 * Paths that skip session resolution entirely.
 * Health probes and metrics endpoints do not need authentication,
 * and resolving a session would add unnecessary Redis/DB latency.
 */
const SKIP_AUTH_PATHS = new Set([
  "/",
  "/health",
  "/ready",
  "/live",
  "/docs",
  "/docs/json",
  "/login",
]);

/**
 * Prefix patterns that skip session resolution.
 * Any path starting with one of these prefixes is skipped.
 */
const SKIP_AUTH_PREFIXES = [
  "/health/",   // /health/ready, /health/detailed, etc.
  "/api/auth/", // Better Auth endpoints (handled by betterAuthPlugin)
];

/**
 * Check whether a request path should skip auth session resolution.
 */
function shouldSkipAuth(pathname: string): boolean {
  if (SKIP_AUTH_PATHS.has(pathname)) return true;
  for (const prefix of SKIP_AUTH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * In-memory session cache to avoid redundant Better Auth lookups on every
 * request. Keyed by session token (extracted from the cookie header).
 *
 * TTL: 30 seconds — short enough to reflect session revocations promptly,
 * long enough to absorb rapid-fire requests from the same browser tab.
 *
 * Max entries: 2000 — prevents unbounded memory growth under load.
 */
interface CachedSession {
  user: User;
  session: Session;
  expiresAt: number;
}

class SessionCache {
  private cache = new Map<string, CachedSession>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = 2000, ttlSeconds: number = 30) {
    this.maxSize = maxSize;
    this.ttlMs = ttlSeconds * 1000;
  }

  get(token: string): CachedSession | null {
    const entry = this.cache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(token);
      return null;
    }
    return entry;
  }

  set(token: string, user: User, session: Session): void {
    // Evict oldest entry if at capacity (FIFO)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(token, {
      user,
      session,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(token: string): void {
    this.cache.delete(token);
  }
}

/**
 * Extract the session token from the request cookie header.
 * Better Auth uses "better-auth.session_token" (or URL-encoded variant).
 */
function extractSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  // Match the Better Auth session cookie name
  const cookieNames = ["better-auth.session_token", "better-auth.session_token"];
  for (const name of cookieNames) {
    const regex = new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`);
    const match = cookieHeader.match(regex);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  // Fallback: try URL-encoded cookie name (better-auth%2Esession_token)
  const encodedName = "better-auth%2Esession_token";
  const encodedRegex = new RegExp(`(?:^|;\\s*)${encodedName}=([^;]+)`);
  const encodedMatch = cookieHeader.match(encodedRegex);
  if (encodedMatch && encodedMatch[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  return null;
}

// =============================================================================
// API Key Resolution
// =============================================================================

/**
 * Resolve an API key to a synthetic user/session context.
 *
 * Looks up the key hash in the api_keys table (system context, bypasses RLS).
 * Returns a synthetic User and Session object so downstream middleware
 * (tenant, rbac) can operate without modification.
 *
 * Updates last_used_at as a fire-and-forget side effect.
 */
async function resolveApiKey(
  db: DatabaseClient,
  rawKey: string
): Promise<{
  user: User;
  session: Session;
  scopes: string[];
} | null> {
  try {
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const rows = await db.withSystemContext(async (tx) => {
      return tx<Array<{
        id: string;
        tenantId: string;
        name: string;
        scopes: string[];
        createdBy: string;
        revokedAt: Date | null;
        expiresAt: Date | null;
      }>>`
        SELECT
          ak.id, ak.tenant_id, ak.name, ak.scopes,
          ak.created_by, ak.revoked_at, ak.expires_at
        FROM api_keys ak
        WHERE ak.key_hash = ${keyHash}
          AND ak.revoked_at IS NULL
          AND (ak.expires_at IS NULL OR ak.expires_at > now())
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;

    const apiKey = rows[0];

    // Fire-and-forget: update last_used_at
    db.withSystemContext(async (tx) => {
      await tx`UPDATE api_keys SET last_used_at = now() WHERE id = ${apiKey.id}`;
    }).catch(() => {});

    // Look up the user who created this key to populate the user context
    const userRows = await db.withSystemContext(async (tx) => {
      return tx<Array<{
        id: string;
        email: string;
        emailVerified: boolean;
        name: string | null;
        image: string | null;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        mfaEnabled: boolean;
      }>>`
        SELECT
          u.id::text,
          u.email,
          u."emailVerified" as email_verified,
          u.name,
          u.image,
          u."createdAt" as created_at,
          u."updatedAt" as updated_at,
          COALESCE(u.status, 'active') as status,
          COALESCE(u."mfaEnabled", false) as mfa_enabled
        FROM app."user" u
        WHERE u.id = ${apiKey.createdBy}::text
        LIMIT 1
      `;
    });

    if (userRows.length === 0) return null;

    const userRow = userRows[0];

    // Build a synthetic User object from the key's creator
    const syntheticUser: User = {
      id: userRow.id,
      email: userRow.email,
      emailVerified: userRow.emailVerified,
      name: userRow.name,
      image: userRow.image,
      createdAt: userRow.createdAt,
      updatedAt: userRow.updatedAt,
      status: userRow.status,
      mfaEnabled: userRow.mfaEnabled,
    };

    // Build a synthetic Session object so downstream middleware can read tenantId
    const syntheticSession: Session = {
      id: `apikey_${apiKey.id}`,
      userId: userRow.id,
      token: "",
      expiresAt: apiKey.expiresAt ?? new Date(Date.now() + 86400000), // 24h if no expiry
      createdAt: new Date(),
      updatedAt: new Date(),
      currentTenantId: apiKey.tenantId,
    };

    return {
      user: syntheticUser,
      session: syntheticSession,
      scopes: Array.isArray(apiKey.scopes) ? apiKey.scopes : [],
    };
  } catch (error) {
    console.error("[Auth] API key resolution error:", error);
    return null;
  }
}

/**
 * Main auth plugin using Better Auth
 */
export function authPlugin(options: AuthPluginOptions = {}) {
  const auth = getBetterAuth();

  // Singleton: created once when plugin is initialized, reused across all requests
  let authServiceSingleton: AuthService | null = null;

  // In-memory session cache (TTL 30s, max 2000 entries)
  const sessionCache = new SessionCache(2000, 30);

  // Throttle verifySyncOnLogin: run at most once per user per 5 minutes
  const syncCheckedUsers = new Map<string, number>();
  const SYNC_CHECK_INTERVAL_MS = 5 * 60 * 1000;

  return new Elysia({ name: "auth" })
    .derive({ as: "global" }, async (ctx) => {
      const { request, path } = ctx as any;
      const db = (ctx as any).db as DatabaseClient;
      const cache = (ctx as any).cache as CacheClient | undefined;

      if (!authServiceSingleton) {
        authServiceSingleton = new AuthService(db, cache);
      }

      // Skip expensive session resolution for health checks, docs, and auth endpoints.
      // Uses Elysia's pre-parsed `path` instead of creating a new URL object per request.
      if (shouldSkipAuth(path)) {
        return {
          user: null,
          session: null,
          isAuthenticated: false as const,
          authService: authServiceSingleton,
        };
      }

      try {
        // -------------------------------------------------------------------
        // API Key Authentication
        // Check if the Authorization header carries a Staffora API key
        // (Bearer sfra_...) before attempting session-based auth.
        // -------------------------------------------------------------------
        const authHeader = request.headers.get("authorization");
        if (authHeader) {
          const bearerToken = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

          if (bearerToken && bearerToken.startsWith(API_KEY_PREFIX)) {
            const apiKeyResult = await resolveApiKey(db, bearerToken);
            if (apiKeyResult) {
              return {
                user: apiKeyResult.user,
                session: apiKeyResult.session,
                isAuthenticated: true as const,
                authService: authServiceSingleton,
                apiKeyAuth: true as const,
                apiKeyScopes: apiKeyResult.scopes,
              };
            }
            // Invalid API key — fall through to return unauthenticated
            return {
              user: null,
              session: null,
              isAuthenticated: false as const,
              authService: authServiceSingleton,
            };
          }
        }

        // -------------------------------------------------------------------
        // Session-based Authentication (cookies)
        // -------------------------------------------------------------------

        // Check in-memory session cache first to avoid redundant
        // Better Auth lookups for rapid-fire requests from the same client.
        const sessionToken = extractSessionToken(request);
        if (sessionToken) {
          const cached = sessionCache.get(sessionToken);
          if (cached) {
            return {
              user: cached.user,
              session: cached.session,
              isAuthenticated: true as const,
              authService: authServiceSingleton,
            };
          }
        }

        // Resolve session directly via Better Auth API — avoids creating a
        // fake Request, running it through the HTTP handler, and parsing
        // the JSON Response (~2-5ms saved per authenticated request).
        const sessionData = await auth.api.getSession({
          headers: request.headers,
        });

        if (!sessionData || !sessionData.session || !sessionData.user) {
          return {
            user: null,
            session: null,
            isAuthenticated: false as const,
            authService: authServiceSingleton,
          };
        }

        const { session, user } = sessionData;

        // Cache the resolved session for subsequent requests within TTL window
        if (sessionToken) {
          sessionCache.set(sessionToken, user as User, session as Session);
        }

        // Fire-and-forget user table sync verification to catch drift
        // between Better Auth "user" table and app.users.
        // Throttled: only runs once per user per 5 minutes to avoid
        // unnecessary DB queries on every authenticated request.
        const now = Date.now();
        const lastChecked = syncCheckedUsers.get(user.id);
        if (!lastChecked || now - lastChecked > SYNC_CHECK_INTERVAL_MS) {
          syncCheckedUsers.set(user.id, now);
          authServiceSingleton.verifySyncOnLogin(user.id).catch(() => {});
          // Prevent unbounded growth: prune entries older than 2x interval
          if (syncCheckedUsers.size > 1000) {
            const cutoff = now - SYNC_CHECK_INTERVAL_MS * 2;
            for (const [uid, ts] of syncCheckedUsers) {
              if (ts < cutoff) syncCheckedUsers.delete(uid);
            }
          }
        }

        return {
          user: user as User,
          session: session as Session,
          isAuthenticated: true as const,
          authService: authServiceSingleton,
        };
      } catch (error) {
        console.error("Auth plugin error:", error);
        return {
          user: null,
          session: null,
          isAuthenticated: false as const,
          authService: authServiceSingleton,
        };
      }
    });
}

/**
 * Require authentication guard
 */
export function requireAuth() {
  return new Elysia({ name: "require-auth" })
    .derive((ctx) => {
      const { user, session, isAuthenticated } = ctx as any;
      const { set } = ctx;

      if (!isAuthenticated || !user || !session) {
        set.status = 401;
        throw new AuthError(
          AuthErrorCodes.INVALID_SESSION,
          "Authentication required",
          401
        );
      }

      // Check if user is suspended or deleted
      if (user.status === "suspended") {
        set.status = 403;
        throw new AuthError(
          AuthErrorCodes.ACCOUNT_SUSPENDED,
          "Account is suspended",
          403
        );
      }

      if (user.status === "deleted") {
        set.status = 403;
        throw new AuthError(
          AuthErrorCodes.ACCOUNT_DELETED,
          "Account has been deleted",
          403
        );
      }

      return { user: user as User, session: session as Session };
    });
}

/**
 * Middleware function for beforeHandle that requires authentication context.
 * Use this in beforeHandle arrays: { beforeHandle: [requireAuthContext] }
 *
 * Throws a 401 AuthError if user or session is missing.
 */
export function requireAuthContext(ctx: any): void {
  const { user, session, set } = ctx;
  if (!user || !session) {
    set.status = 401;
    throw new AuthError(
      AuthErrorCodes.INVALID_SESSION,
      "Authentication required",
      401
    );
  }
}

/**
 * Require MFA verification
 */
export function requireMfa() {
  return new Elysia({ name: "require-mfa" })
    .derive(async (ctx) => {
      const { user, session, authService } = ctx as any;
      const { set } = ctx;

      if (!user) {
        set.status = 401;
        throw new AuthError(
          AuthErrorCodes.INVALID_SESSION,
          "Authentication required",
          401
        );
      }

      // Check if user has MFA enabled
      const hasMfa = await authService.userHasMfa(user.id);

      if (hasMfa) {
        // Verify MFA was completed for this session by checking session metadata.
        // Better Auth's two-factor plugin sets "twoFactorVerified" on the session
        // object after successful TOTP verification. If the field is not populated,
        // MFA is considered not verified and access is denied.
        // See: https://www.better-auth.com/docs/plugins/two-factor
        const sessionData = session as { twoFactorVerified?: boolean };
        if (!sessionData?.twoFactorVerified) {
          // Log a warning since twoFactorVerified may not be populated by Better Auth
          // depending on plugin configuration. This helps operators diagnose MFA
          // enforcement issues without silently bypassing the guard.
          console.warn(
            "[MFA] twoFactorVerified check may not be enforced - verify Better Auth MFA plugin configuration. " +
            `Session ${session?.id} for user ${user.id} does not have twoFactorVerified set.`
          );
          set.status = 403;
          throw new AuthError(
            AuthErrorCodes.MFA_REQUIRED,
            "MFA verification required for this action",
            403
          );
        }
      }

      return { user: user as User, mfaVerified: hasMfa ? true : false };
    });
}

/**
 * Role names that are considered "admin" roles for MFA enforcement purposes.
 * These roles have elevated privileges and require MFA in production environments.
 */
const ADMIN_ROLE_NAMES = new Set([
  "super_admin",
  "tenant_admin",
  "system_admin",
  "hr_admin",
]);

/**
 * Check whether a user has an admin role in the given tenant.
 * Queries the RBAC system (role_assignments + roles) via system context
 * since this runs before RLS tenant context is necessarily set.
 */
async function userHasAdminRole(
  db: DatabaseClient,
  tenantId: string,
  userId: string
): Promise<{ isAdmin: boolean; roleName: string | null }> {
  try {
    const rows = await db.withSystemContext(async (tx) => {
      return await tx<{ roleName: string }[]>`
        SELECT r.name as role_name
        FROM app.role_assignments ra
        JOIN app.roles r ON r.id = ra.role_id
        WHERE ra.tenant_id = ${tenantId}::uuid
          AND ra.user_id = ${userId}::uuid
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
          AND r.name = ANY(${Array.from(ADMIN_ROLE_NAMES)})
        LIMIT 1
      `;
    });
    if (rows.length > 0) {
      return { isAdmin: true, roleName: rows[0]!.roleName };
    }
    return { isAdmin: false, roleName: null };
  } catch (error) {
    console.warn("[AdminMFA] Failed to check admin role:", error);
    return { isAdmin: false, roleName: null };
  }
}

/**
 * Require MFA for admin roles.
 *
 * This guard enforces that users with admin-level roles (super_admin,
 * tenant_admin, system_admin, hr_admin) must have MFA enabled and verified
 * before accessing protected resources.
 *
 * Behavior:
 * - Non-admin users: passes through without MFA check (use requireMfa()
 *   separately if MFA is required for all users on a route).
 * - Admin users with MFA enabled and verified: passes through.
 * - Admin users with MFA enabled but NOT verified for this session: returns 403
 *   with AUTH_MFA_REQUIRED code, prompting MFA verification.
 * - Admin users without MFA set up at all: returns 403 with AUTH_MFA_REQUIRED
 *   code and a message instructing them to enable MFA.
 *
 * Enforcement is controlled by environment:
 * - Always enforced when NODE_ENV === "production"
 * - Can be enabled in dev/test with ENFORCE_ADMIN_MFA=true
 * - Skipped in dev/test by default (with a warning log)
 *
 * Usage:
 * ```ts
 * app
 *   .use(requireAuth())
 *   .use(requireAdminMfa())
 *   .get('/admin/settings', handler);
 * ```
 */
export function requireAdminMfa() {
  return new Elysia({ name: "require-admin-mfa" })
    .derive(async (ctx) => {
      const { user, session, authService } = ctx as any;
      const { set } = ctx;
      const db = (ctx as any).db as DatabaseClient;
      const tenant = (ctx as any).tenant as { id: string } | null;

      // Must be authenticated first
      if (!user || !session) {
        set.status = 401;
        throw new AuthError(
          AuthErrorCodes.INVALID_SESSION,
          "Authentication required",
          401
        );
      }

      // Tenant context is required to check role assignments
      if (!tenant) {
        // No tenant context -- cannot determine admin status.
        // Let the request through; downstream tenant/rbac guards will handle it.
        return { user: user as User, adminMfaVerified: false };
      }

      // Check enforcement setting
      const enforceAdminMfa =
        process.env["NODE_ENV"] === "production" ||
        process.env["ENFORCE_ADMIN_MFA"] === "true";

      // Check if user has an admin role
      const { isAdmin, roleName } = await userHasAdminRole(db, tenant.id, user.id);

      if (!isAdmin) {
        // Non-admin: no MFA requirement from this guard
        return { user: user as User, adminMfaVerified: false };
      }

      // User is an admin -- check MFA status
      const hasMfaSetUp = await authService.userHasMfa(user.id);

      if (!hasMfaSetUp) {
        // Admin has no MFA set up at all
        if (enforceAdminMfa) {
          set.status = 403;
          throw new AuthError(
            AuthErrorCodes.MFA_REQUIRED,
            `MFA must be enabled for admin accounts (role: ${roleName}). Please set up two-factor authentication.`,
            403
          );
        }
        // Dev/test: warn but allow through
        console.warn(
          `[AdminMFA] Admin user ${user.id} (role: ${roleName}) does not have MFA enabled. ` +
          `This would be blocked in production. Set ENFORCE_ADMIN_MFA=true to enforce in dev.`
        );
        return { user: user as User, adminMfaVerified: false };
      }

      // Admin has MFA set up -- check if it's verified for this session
      const sessionData = session as { twoFactorVerified?: boolean };
      if (!sessionData?.twoFactorVerified) {
        if (enforceAdminMfa) {
          set.status = 403;
          throw new AuthError(
            AuthErrorCodes.MFA_REQUIRED,
            `MFA verification required for admin access (role: ${roleName}). Please complete two-factor authentication.`,
            403
          );
        }
        console.warn(
          `[AdminMFA] Admin user ${user.id} (role: ${roleName}) has MFA enabled but session is not verified. ` +
          `This would be blocked in production. Set ENFORCE_ADMIN_MFA=true to enforce in dev.`
        );
        return { user: user as User, adminMfaVerified: false };
      }

      // Admin with MFA enabled and verified
      return { user: user as User, adminMfaVerified: true };
    });
}

// =============================================================================
// CSRF Token Utilities
// =============================================================================

/** Default CSRF token max age: 8 hours in milliseconds */
const CSRF_TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/**
 * Get the CSRF signing secret.
 * Prefers CSRF_SECRET, falls back to SESSION_SECRET.
 */
function getCsrfSecret(): string {
  return (
    process.env["CSRF_SECRET"] ||
    process.env["SESSION_SECRET"] ||
    process.env["BETTER_AUTH_SECRET"] ||
    ""
  );
}

/**
 * Generate an HMAC-SHA256 signed CSRF token bound to a session.
 *
 * Token format: `{sessionId}.{timestamp_base36}.{hmac_hex}`
 *
 * The HMAC covers both the session ID and the timestamp, so tampering
 * with either component invalidates the token.
 */
export async function generateCsrfToken(sessionId: string): Promise<string> {
  const secret = getCsrfSecret();
  const timestamp = Date.now().toString(36);
  const payload = `${sessionId}.${timestamp}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

/**
 * Validate an HMAC-SHA256 signed CSRF token.
 *
 * Checks:
 * 1. Token has correct format (three dot-separated parts)
 * 2. Session ID in token matches the expected session
 * 3. Token has not expired (default 8 hours)
 * 4. HMAC signature is valid (constant-time comparison)
 *
 * @param token - The CSRF token from the X-CSRF-Token header
 * @param sessionId - The session ID to validate against
 * @param maxAgeMs - Maximum token age in milliseconds (default 8 hours)
 * @returns true if token is valid
 */
export async function validateCsrfToken(
  token: string,
  sessionId: string,
  maxAgeMs: number = CSRF_TOKEN_MAX_AGE_MS
): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [tokenSessionId, timestampStr, providedHmac] = parts;

  // Verify session ID matches
  if (tokenSessionId !== sessionId) return false;

  // Verify timestamp is valid and not expired
  const timestamp = parseInt(timestampStr, 36);
  if (isNaN(timestamp) || timestamp <= 0) return false;

  const age = Date.now() - timestamp;
  if (age < 0 || age >= maxAgeMs) return false;

  // Recompute HMAC and compare using constant-time comparison
  const secret = getCsrfSecret();
  const payload = `${tokenSessionId}.${timestampStr}`;
  const expectedHmac = createHmac("sha256", secret).update(payload).digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    const a = Buffer.from(providedHmac, "utf-8");
    const b = Buffer.from(expectedHmac, "utf-8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * CSRF protection guard
 *
 * Validates that mutating requests (POST, PUT, PATCH, DELETE) include
 * a valid HMAC-signed CSRF token in the X-CSRF-Token header.
 * The token must be bound to the current session and not expired.
 *
 * Better Auth handles its own CSRF for its auth endpoints, but
 * application routes must be protected explicitly.
 */
export function requireCsrf() {
  return new Elysia({ name: "require-csrf" })
    .derive(async ({ request, set, ...ctx }) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const csrfToken = request.headers.get("X-CSRF-Token");
        if (!csrfToken) {
          set.status = 403;
          throw new AuthError(
            AuthErrorCodes.CSRF_INVALID,
            "CSRF token is required for mutating requests",
            403
          );
        }

        // Session is required to validate CSRF tokens
        const session = (ctx as any).session as Session | null;
        if (!session) {
          set.status = 403;
          throw new AuthError(
            AuthErrorCodes.CSRF_INVALID,
            "CSRF token validation requires an authenticated session",
            403
          );
        }

        const isValid = await validateCsrfToken(csrfToken, session.id);
        if (!isValid) {
          set.status = 403;
          throw new AuthError(
            AuthErrorCodes.CSRF_INVALID,
            "Invalid or expired CSRF token",
            403
          );
        }
      }
      return {};
    });
}
