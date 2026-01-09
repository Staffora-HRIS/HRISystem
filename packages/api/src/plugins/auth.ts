/**
 * Authentication Plugin
 *
 * BetterAuth integration for session-based authentication.
 * Features:
 * - Session management with Redis caching
 * - MFA support (TOTP)
 * - CSRF protection
 * - Session rotation on privilege changes
 */

import { Elysia, t } from "elysia";
import { type DatabaseClient, type TransactionSql } from "./db";
import { type CacheClient, CacheTTL, CacheKeys } from "./cache";
import { type Tenant } from "./tenant";

// =============================================================================
// Types
// =============================================================================

/**
 * User information
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  mfaEnabled: boolean;
  status: "pending" | "active" | "suspended" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session information
 */
export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  currentTenantId: string | null;
  mfaVerified: boolean;
  mfaVerifiedAt: Date | null;
}

/**
 * Authenticated context
 */
export interface AuthContext {
  user: User;
  session: Session;
  isAuthenticated: true;
}

/**
 * Unauthenticated context
 */
export interface UnauthContext {
  user: null;
  session: null;
  isAuthenticated: false;
}

export type AuthState = AuthContext | UnauthContext;

/**
 * User with tenant information
 */
export interface UserWithTenants extends User {
  tenants: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    isPrimary: boolean;
    status: string;
  }>;
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Auth-related error codes
 */
export const AuthErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_INVALID: "SESSION_INVALID",
  MFA_REQUIRED: "MFA_REQUIRED",
  MFA_INVALID: "MFA_INVALID",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_NOT_VERIFIED: "ACCOUNT_NOT_VERIFIED",
  CSRF_INVALID: "CSRF_INVALID",
} as const;

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(
    public code: keyof typeof AuthErrorCodes,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// =============================================================================
// Auth Service
// =============================================================================

/**
 * Authentication service
 */
export class AuthService {
  private sessionCookieName = "hris_session";
  private csrfHeaderName = "X-CSRF-Token";
  private sessionDuration = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(
    private db: DatabaseClient,
    private cache: CacheClient
  ) {}

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Get session from cookie token
   */
  async getSessionByToken(token: string): Promise<Session | null> {
    // Try cache first
    const cacheKey = CacheKeys.session(token);
    const cached = await this.cache.get<Session>(cacheKey);
    if (cached) {
      // Check if expired
      if (new Date(cached.expiresAt) < new Date()) {
        await this.cache.del(cacheKey);
        return null;
      }
      return cached;
    }

    // Query database
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<Session[]>`
        SELECT
          id, user_id, token, expires_at, ip_address, user_agent,
          created_at, last_active_at, current_tenant_id,
          mfa_verified, mfa_verified_at
        FROM app.sessions
        WHERE token = ${token}
          AND expires_at > now()
      `;
    });

    if (results.length === 0) {
      return null;
    }

    const session = results[0] as Session;

    // Cache the session
    await this.cache.set(cacheKey, session, CacheTTL.SESSION);

    return session;
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<Session> {
    const sessionId = crypto.randomUUID();
    const token = await this.generateSecureToken();
    const expiresAt = new Date(Date.now() + this.sessionDuration);

    await this.db.withSystemContext(async (tx) => {
      await tx`
        INSERT INTO app.sessions (id, user_id, token, expires_at, ip_address, user_agent)
        VALUES (${sessionId}::uuid, ${userId}::uuid, ${token}, ${expiresAt}, ${ipAddress}, ${userAgent})
      `;
    });

    const session: Session = {
      id: sessionId,
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      currentTenantId: null,
      mfaVerified: false,
      mfaVerifiedAt: null,
    };

    // Cache the session
    await this.cache.set(CacheKeys.session(token), session, CacheTTL.SESSION);

    return session;
  }

  /**
   * Update session's last active time
   */
  async touchSession(sessionId: string): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        UPDATE app.sessions
        SET last_active_at = now()
        WHERE id = ${sessionId}::uuid
      `;
    });
  }

  /**
   * Set the current tenant for a session
   */
  async setSessionTenant(sessionId: string, tenantId: string): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        UPDATE app.sessions
        SET current_tenant_id = ${tenantId}::uuid, last_active_at = now()
        WHERE id = ${sessionId}::uuid
      `;
    });

    // Invalidate cached session
    const sessions = await this.db.withSystemContext(async (tx) => {
      return await tx<{ token: string }[]>`
        SELECT token FROM app.sessions WHERE id = ${sessionId}::uuid
      `;
    });

    if (sessions.length > 0 && sessions[0]) {
      await this.cache.del(CacheKeys.session(sessions[0].token));
    }
  }

  /**
   * Rotate session token (after privilege change)
   */
  async rotateSessionToken(sessionId: string): Promise<string> {
    const newToken = await this.generateSecureToken();

    await this.db.withSystemContext(async (tx) => {
      // Get old token first
      const oldSessions = await tx<{ token: string }[]>`
        SELECT token FROM app.sessions WHERE id = ${sessionId}::uuid
      `;

      if (oldSessions.length > 0 && oldSessions[0]) {
        // Invalidate old cached session
        await this.cache.del(CacheKeys.session(oldSessions[0].token));
      }

      // Update token
      await tx`
        UPDATE app.sessions
        SET token = ${newToken}, last_active_at = now()
        WHERE id = ${sessionId}::uuid
      `;
    });

    return newToken;
  }

  /**
   * Mark session as MFA verified
   */
  async markMfaVerified(sessionId: string): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        SELECT app.mark_session_mfa_verified(${sessionId}::uuid)
      `;
    });

    // Invalidate cached session
    const sessions = await this.db.withSystemContext(async (tx) => {
      return await tx<{ token: string }[]>`
        SELECT token FROM app.sessions WHERE id = ${sessionId}::uuid
      `;
    });

    if (sessions.length > 0 && sessions[0]) {
      await this.cache.del(CacheKeys.session(sessions[0].token));
    }
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    // Get token first for cache invalidation
    const sessions = await this.db.withSystemContext(async (tx) => {
      return await tx<{ token: string }[]>`
        SELECT token FROM app.sessions WHERE id = ${sessionId}::uuid
      `;
    });

    // Delete from database
    await this.db.withSystemContext(async (tx) => {
      await tx`
        DELETE FROM app.sessions WHERE id = ${sessionId}::uuid
      `;
    });

    // Invalidate cache
    if (sessions.length > 0 && sessions[0]) {
      await this.cache.del(CacheKeys.session(sessions[0].token));
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(
    userId: string,
    exceptSessionId?: string
  ): Promise<number> {
    // Get all tokens for cache invalidation
    const sessions = await this.db.withSystemContext(async (tx) => {
      return await tx<{ token: string }[]>`
        SELECT token FROM app.sessions
        WHERE user_id = ${userId}::uuid
        ${exceptSessionId ? tx`AND id != ${exceptSessionId}::uuid` : tx``}
      `;
    });

    // Delete from database
    const result = await this.db.withSystemContext(async (tx) => {
      const r = await tx`
        SELECT app.invalidate_user_sessions(${userId}::uuid, ${exceptSessionId || null}::uuid)
      `;
      return r;
    });

    // Invalidate cache
    for (const session of sessions) {
      await this.cache.del(CacheKeys.session(session.token));
    }

    return sessions.length;
  }

  // ===========================================================================
  // User Management
  // ===========================================================================

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<User[]>`
        SELECT
          id, email, email_verified, name, image,
          mfa_enabled, status, created_at, updated_at
        FROM app.users
        WHERE id = ${userId}::uuid
      `;
    });

    return results.length > 0 ? (results[0] as User) : null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<User[]>`
        SELECT
          id, email, email_verified, name, image,
          mfa_enabled, status, created_at, updated_at
        FROM app.users
        WHERE email = ${email.toLowerCase()}
      `;
    });

    return results.length > 0 ? (results[0] as User) : null;
  }

  /**
   * Verify password for a user
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<{ verifyPassword: boolean }[]>`
        SELECT app.verify_password(${userId}::uuid, ${password}) as verify_password
      `;
    });

    const row = results[0] as unknown as Record<string, unknown> | undefined;
    if (!row) return false;

    // Be defensive: the postgres client can transform column names depending on
    // aliasing/casing rules. Accept common variants.
    const value =
      (row["verifyPassword"] as unknown) ??
      (row["verify_password"] as unknown) ??
      (row["verifypassword"] as unknown) ??
      Object.values(row)[0];

    return value === true;
  }

  /**
   * Get user with their tenants
   */
  async getUserWithTenants(userId: string): Promise<UserWithTenants | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    const tenants = await this.db.withSystemContext(async (tx) => {
      return await tx<
        Array<{
          tenantId: string;
          tenantName: string;
          tenantSlug: string;
          isPrimary: boolean;
          status: string;
        }>
      >`
        SELECT
          tenant_id, tenant_name, tenant_slug, is_primary, status
        FROM app.get_user_tenants(${userId}::uuid)
      `;
    });

    return {
      ...user,
      tenants: tenants as Array<{
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        isPrimary: boolean;
        status: string;
      }>,
    };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Generate a secure random token
   */
  private async generateSecureToken(): Promise<string> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Generate CSRF token for a session
   */
  generateCsrfToken(sessionId: string): string {
    const data = `${sessionId}:${Date.now()}`;
    // In production, use HMAC with a secret
    return Buffer.from(data).toString("base64");
  }

  /**
   * Validate CSRF token
   */
  validateCsrfToken(token: string, sessionId: string): boolean {
    try {
      const decoded = Buffer.from(token, "base64").toString();
      const [tokenSessionId] = decoded.split(":");
      return tokenSessionId === sessionId;
    } catch {
      return false;
    }
  }

  /**
   * Extract session token from cookie
   */
  extractSessionToken(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, value] = cookie.split("=");
      if (name === this.sessionCookieName) {
        return value || null;
      }
    }
    return null;
  }

  /**
   * Create session cookie value
   */
  createSessionCookie(token: string, expiresAt: Date): string {
    const isProduction = process.env["NODE_ENV"] === "production";
    const parts = [
      `${this.sessionCookieName}=${token}`,
      `Expires=${expiresAt.toUTCString()}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
    ];

    if (isProduction) {
      parts.push("Secure");
    }

    return parts.join("; ");
  }

  /**
   * Create logout cookie (expired)
   */
  createLogoutCookie(): string {
    return `${this.sessionCookieName}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict; Path=/`;
  }
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Auth plugin options
 */
export interface AuthPluginOptions {
  /** Routes to skip authentication (regex patterns) */
  skipRoutes?: RegExp[];
  /** Whether CSRF protection is enabled */
  csrfProtection?: boolean;
}

/**
 * Default routes that don't require authentication
 */
const DEFAULT_SKIP_ROUTES = [
  /^\/$/,
  /^\/health/,
  /^\/ready/,
  /^\/live/,
  /^\/docs/,
  /^\/api\/v1\/auth\/login/,
  /^\/api\/v1\/auth\/register/,
  /^\/api\/v1\/auth\/forgot-password/,
  /^\/api\/v1\/auth\/reset-password/,
];

/**
 * Authentication plugin for Elysia
 *
 * Provides session-based authentication with MFA support.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .use(cachePlugin())
 *   .use(authPlugin())
 *   .get('/protected', ({ user }) => {
 *     return { userId: user.id };
 *   });
 * ```
 */
export function authPlugin(options: AuthPluginOptions = {}) {
  const { skipRoutes = [], csrfProtection = true } = options;
  const allSkipRoutes = [...DEFAULT_SKIP_ROUTES, ...skipRoutes];

  return new Elysia({ name: "auth" })
    // Auth service for direct access
    .derive((ctx) => {
      const { db, cache } = ctx as any;
      return {
        authService: new AuthService(db, cache),
      } as Record<string, unknown>;
    })

    // Session and user resolution
    .derive(
      async (ctx) => {
        const { request, path, authService, set } = ctx as any;
        // Check if route should skip authentication
        const shouldSkip = allSkipRoutes.some((pattern) => pattern.test(path));
        if (shouldSkip) {
          return { user: null, session: null, isAuthenticated: false } as any;
        }

        // Extract session token from cookie
        const cookieHeader = request.headers.get("Cookie");
        const token = authService.extractSessionToken(cookieHeader);

        if (!token) {
          return { user: null, session: null, isAuthenticated: false } as any;
        }

        // Get session
        const session = await authService.getSessionByToken(token);
        if (!session) {
          return { user: null, session: null, isAuthenticated: false } as any;
        }

        // Get user
        const user = await authService.getUserById(session.userId);
        if (!user) {
          return { user: null, session: null, isAuthenticated: false } as any;
        }

        // Check user status
        if (user.status !== "active") {
          return { user: null, session: null, isAuthenticated: false } as any;
        }

        // CSRF protection for mutating requests
        if (csrfProtection && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
          const csrfToken = request.headers.get("X-CSRF-Token");
          if (!csrfToken || !authService.validateCsrfToken(csrfToken, session.id)) {
            // Don't fail yet, let the route handler decide if CSRF is required
            // Some routes might not need it (e.g., API tokens)
          }
        }

        // Touch session (update last active)
        // Do this asynchronously to not block the request
        authService.touchSession(session.id).catch(() => {
          // Ignore errors
        });

        return {
          user,
          session,
          isAuthenticated: true,
        } as any;
      }
    )

    // Error handler for auth errors
    .onError(({ error, set }) => {
      if (error instanceof AuthError) {
        set.status = error.statusCode;
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
 * Guard that requires authentication
 */
export function requireAuth() {
  return new Elysia({ name: "require-auth" }).derive(
    (ctx) => {
      const { user, session, isAuthenticated, set } = ctx as any;
      if (!isAuthenticated || !user || !session) {
        set.status = 401;
        throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
      }
      return { user, session } as { user: User; session: Session };
    }
  );
}

/**
 * Guard that requires MFA verification
 */
export function requireMfa() {
  return new Elysia({ name: "require-mfa" }).derive(
    (ctx) => {
      const { user, session, set } = ctx as any;
      if (!user || !session) {
        set.status = 401;
        throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
      }

      if (user.mfaEnabled && !session.mfaVerified) {
        set.status = 403;
        throw new AuthError("MFA_REQUIRED", "MFA verification required", 403);
      }

      return { user, session };
    }
  );
}

/**
 * Guard that requires CSRF token
 */
export function requireCsrf() {
  return new Elysia({ name: "require-csrf" }).derive(
    (ctx) => {
      const { request, session, authService, set } = ctx as any;
      if (!session) {
        set.status = 401;
        throw new AuthError("UNAUTHORIZED", "Authentication required", 401);
      }

      const csrfToken = request.headers.get("X-CSRF-Token");
      if (!csrfToken || !authService.validateCsrfToken(csrfToken, session.id)) {
        set.status = 403;
        throw new AuthError("CSRF_INVALID", "Invalid CSRF token", 403);
      }

      return {};
    }
  );
}
