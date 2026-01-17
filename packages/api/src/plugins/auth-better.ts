/**
 * Better Auth Plugin for Elysia
 *
 * Replaces the legacy custom auth plugin with Better Auth.
 * Provides session management, user context, and auth guards.
 */

import { Elysia } from "elysia";
import { getBetterAuth } from "../lib/better-auth";
import type { DatabaseClient } from "./db";
import type { CacheClient } from "./cache";

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

      // Validate userId is a valid UUID format before querying to prevent SQL errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
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
 * Main auth plugin using Better Auth
 */
export function authPlugin(options: AuthPluginOptions = {}) {
  const auth = getBetterAuth();

  return new Elysia({ name: "auth" })
    .derive({ as: "global" }, async (ctx) => {
      const { request } = ctx;
      const db = (ctx as any).db as DatabaseClient;
      const cache = (ctx as any).cache as CacheClient | undefined;

      const isResponseLike = (value: unknown): value is Response => {
        if (!value || typeof value !== "object") return false;
        const anyVal = value as any;
        return (
          typeof anyVal.status === "number" &&
          typeof anyVal.json === "function" &&
          typeof anyVal.text === "function" &&
          typeof anyVal.headers?.get === "function"
        );
      };

      try {
        // Resolve session using the same code path as the public /api/auth/get-session
        // endpoint. Cloning from the original request keeps Cookie handling consistent.
        const url = new URL(request.url);
        url.pathname = "/api/auth/get-session";
        url.search = "";

        const cookieHeader = request.headers.get("cookie") ?? "";
        const handlerRes = await auth.handler(
          new Request(url.toString(), {
            method: "GET",
            headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
          })
        );

        const sessionData: any = handlerRes.status === 200 ? await handlerRes.json() : null;

        if (!sessionData || !sessionData.session || !sessionData.user) {
          return {
            user: null,
            session: null,
            isAuthenticated: false as const,
            authService: new AuthService(db, cache),
          };
        }

        const { session, user } = sessionData;

        return {
          user: user as User,
          session: session as Session,
          isAuthenticated: true as const,
          authService: new AuthService(db, cache),
        };
      } catch (error) {
        console.error("Auth plugin error:", error);
        return {
          user: null,
          session: null,
          isAuthenticated: false as const,
          authService: new AuthService(db, cache),
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
        // Verify MFA was completed for this session by checking session metadata
        // Better Auth stores twoFactorVerified in session when MFA is completed
        const sessionData = session as { twoFactorVerified?: boolean };
        if (!sessionData?.twoFactorVerified) {
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
 * CSRF protection (Better Auth handles this internally)
 */
export function requireCsrf() {
  return new Elysia({ name: "require-csrf" })
    .derive(({ request }) => {
      // Better Auth handles CSRF internally via its cookie/header mechanism
      // This is kept for API compatibility but is essentially a no-op
      return {};
    });
}
