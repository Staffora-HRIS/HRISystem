/**
 * Better Auth Server Configuration
 *
 * Configures Better Auth with Postgres adapter for the Staffora platform.
 * Features:
 * - Session-based authentication with cookies
 * - MFA support (TOTP)
 * - Multi-tenant user management
 * - Custom database schema mapping
 */

import { betterAuth } from "better-auth";
import { twoFactor, organization } from "better-auth/plugins";
import { verifyPassword as betterAuthVerifyScrypt } from "better-auth/crypto";
import { dash } from "@better-auth/infra";
import { APIError } from "better-auth/api";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import { getDatabaseUrl } from "../config/database";

/**
 * Check if a hash is bcrypt format (starts with $2a$, $2b$, or $2y$)
 */
function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

/**
 * Custom password verification that supports both bcrypt and scrypt hashes.
 * This allows legacy users with bcrypt passwords to sign in alongside
 * users created through Better Auth (which uses scrypt by default).
 *
 * IMPORTANT: Better Auth does NOT fall back to its default scrypt verifier
 * when a custom verify function is provided. Our function must handle
 * both formats explicitly.
 */
async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const { hash, password } = data;

  if (isBcryptHash(hash)) {
    // Legacy bcrypt hash - verify using bcryptjs
    return bcrypt.compare(password, hash);
  }

  // Non-bcrypt: delegate to Better Auth's built-in scrypt verifier
  // (handles "salt:key" hex format with N=16384, r=16, p=1, dkLen=64)
  try {
    return await betterAuthVerifyScrypt({ hash, password });
  } catch (err) {
    console.warn("[Auth] scrypt password verification failed:", err);
    return false;
  }
}

/**
 * Hash password using bcrypt for consistency with legacy system.
 * Note: Better Auth uses scrypt by default, but we use bcrypt for
 * compatibility with existing users.
 */
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Default trusted origins for development
 * IMPORTANT: Must match the corsOrigins in app.ts to prevent CORS mismatches
 * between Elysia CORS middleware and Better Auth origin validation.
 */
const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:5173",
];

/**
 * Environment configuration for Better Auth
 */
const getAuthConfig = () => {
  const secret = process.env["BETTER_AUTH_SECRET"] || process.env["SESSION_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error(
        "FATAL: BETTER_AUTH_SECRET or SESSION_SECRET must be set in production. " +
        "Generate a secure 32+ character secret and set it in the environment."
      );
    }
    console.warn(
      "[Auth] WARNING: No BETTER_AUTH_SECRET or SESSION_SECRET set. " +
      "Using insecure development default. DO NOT use in production."
    );
  }
  return {
    secret: secret || "insecure-dev-only-secret-do-not-use-in-production",
    baseURL: process.env["BETTER_AUTH_URL"] || process.env["API_URL"] || "http://localhost:3000",
  // FIX: Use comma-separated CORS_ORIGIN env var or default to all dev ports
  // This ensures Better Auth trustedOrigins match Elysia CORS config (app.ts)
  trustedOrigins: process.env["CORS_ORIGIN"]
    ? process.env["CORS_ORIGIN"].split(",").map(s => s.trim())
    : DEFAULT_TRUSTED_ORIGINS,
  };
};

/**
 * Create a pg Pool for Better Auth and account lockout queries.
 *
 * Better Auth requires a standard pg Pool — it cannot use the postgres.js
 * client directly. This pool is shared with the lockout handler in
 * better-auth-handler.ts to avoid creating multiple independent pg Pools.
 *
 * PGBOUNCER COMPATIBILITY:
 * When DATABASE_APP_URL points to PgBouncer (port 6432), the pg Pool uses
 * unnamed prepared statements by default, which PgBouncer handles correctly
 * even in transaction mode. No special configuration is needed for the pg
 * driver — only named prepared statements (with a `name` property) would
 * cause issues, and Better Auth does not use them.
 *
 * CONNECTION BUDGET: max=5 connections (part of the per-process total;
 * see packages/api/src/plugins/db.ts for the full budget breakdown).
 */
function createPgPool(): Pool {
  // Prefer DATABASE_APP_URL (hris_app with NOBYPASSRLS), matching db plugin precedence.
  // In Docker, DATABASE_APP_URL routes through PgBouncer (pgbouncer:6432).
  const databaseUrl = process.env["DATABASE_APP_URL"] || process.env["DATABASE_URL"] || getDatabaseUrl();
  return new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Set search_path to app schema where our tables are
    options: "-c search_path=app,public",
  });
}

// Singleton pool shared by Better Auth and account lockout handler
let pgPool: Pool | null = null;

/**
 * Get the shared pg Pool singleton used by Better Auth and lockout queries.
 * Exported so better-auth-handler.ts can reuse this pool instead of creating
 * its own, consolidating all pg-driver connections into a single capped pool.
 */
export function getPgPool(): Pool {
  if (!pgPool) {
    pgPool = createPgPool();
  }
  return pgPool;
}

/**
 * Create Better Auth instance with Postgres adapter
 * Uses existing app.users and app.sessions tables
 */
export function createBetterAuth() {
  const config = getAuthConfig();
  const pool = getPgPool();

  const auth = betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,

    // Use pg Pool with app schema
    database: pool,

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = user.email.trim().toLowerCase();
            const uuidRegex =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            try {
              const existing = await pool.query<{ id: string }>(
                "SELECT id::text as id FROM app.users WHERE email = $1",
                [email]
              );

              const existingId = existing.rows[0]?.id;

              // Ensure Better Auth uses UUID string ids so our RBAC + tenant system can
              // safely cast userId/sessionId to uuid.
              //
              // If an app.users record already exists for this email, we MUST reuse its
              // UUID to keep identity stable across app.users (uuid) and app."user" (text).
              const id = existingId
                ? existingId
                : uuidRegex.test(String(user.id))
                  ? String(user.id)
                  : crypto.randomUUID();

              return {
                data: {
                  ...user,
                  id,
                  email,
                },
              };
            } catch (error) {
              // Log and re-throw — do NOT fail silently. A failed pre-create hook
              // must abort user creation to prevent orphaned records in app."user"
              // that have no corresponding app.users row.
              console.error(
                "[Auth] databaseHooks.user.create.before failed — aborting user creation:",
                error instanceof Error ? error.message : String(error)
              );
              throw error;
            }
          },
          after: async (user) => {
            const email = user.email.trim().toLowerCase();

            try {
              await pool.query(
                `
                  INSERT INTO app.users (
                    id,
                    email,
                    email_verified,
                    password_hash,
                    name,
                    image,
                    mfa_enabled,
                    status,
                    created_at,
                    updated_at
                  )
                  VALUES (
                    $1::uuid,
                    $2,
                    $3,
                    NULL,
                    $4,
                    $5,
                    $6,
                    $7,
                    now(),
                    now()
                  )
                  ON CONFLICT (email) DO UPDATE
                  SET
                    email_verified = EXCLUDED.email_verified,
                    name = EXCLUDED.name,
                    image = EXCLUDED.image,
                    mfa_enabled = EXCLUDED.mfa_enabled,
                    status = EXCLUDED.status,
                    updated_at = now()
                `,
                [
                  user.id,
                  email,
                  Boolean((user as any).emailVerified ?? false),
                  user.name ?? email,
                  user.image ?? null,
                  Boolean((user as any).mfaEnabled ?? false),
                  ((user as any).status ?? "active") as string,
                ]
              );
            } catch (error) {
              // CRITICAL: Sync to app.users failed after app."user" was created.
              // This is the primary source of dual-table drift. Log with full
              // context so the reconciliation job can detect and repair it.
              console.error(
                "[Auth] CRITICAL: databaseHooks.user.create.after failed — " +
                `app.users sync failed for user ${user.id} (${email}). ` +
                "The reconciliation job will repair this drift. Error:",
                error instanceof Error ? error.message : String(error)
              );
              // Re-throw to signal the failure upstream. Better Auth will still
              // have created the app."user" row, but the caller will know the
              // sync failed. The DB trigger (0192_user_table_sync_trigger.sql)
              // acts as a safety net if this hook is bypassed entirely.
              throw error;
            }
          },
        },
        update: {
          after: async (user) => {
            const email = user.email.trim().toLowerCase();
            try {
              await pool.query(
                `
                  UPDATE app.users
                  SET
                    email = $2,
                    email_verified = $3,
                    name = $4,
                    image = $5,
                    mfa_enabled = $6,
                    status = $7,
                    updated_at = now()
                  WHERE id = $1::uuid
                `,
                [
                  user.id,
                  email,
                  Boolean((user as any).emailVerified ?? false),
                  user.name ?? email,
                  user.image ?? null,
                  Boolean((user as any).mfaEnabled ?? false),
                  ((user as any).status ?? "active") as string,
                ]
              );
            } catch (error) {
              // Log explicitly with user context so drift is traceable.
              // The DB trigger provides a fallback safety net.
              console.error(
                "[Auth] CRITICAL: databaseHooks.user.update.after failed — " +
                `app.users sync failed for user ${user.id} (${email}). Error:`,
                error instanceof Error ? error.message : String(error)
              );
              throw error;
            }
          },
        },
      },
      session: {
        create: {
          /**
           * Before session creation: check if the user's account is locked.
           * This runs AFTER password verification succeeds but BEFORE the session
           * is persisted. If the account is locked, we throw an APIError to prevent
           * session creation and deny access even with correct credentials.
           */
          before: async (session) => {
            try {
              const lockResult = await pool.query<{ is_locked: boolean }>(
                `SELECT app.check_account_lockout($1::text) as is_locked`,
                [session.userId]
              );
              if (lockResult.rows[0]?.is_locked) {
                // Fetch lock expiry to include in the error message
                const lockInfo = await pool.query<{ locked_until: Date }>(
                  `SELECT "lockedUntil" as locked_until FROM app."user" WHERE id = $1`,
                  [session.userId]
                );
                const lockedUntil = lockInfo.rows[0]?.locked_until;
                const message = lockedUntil
                  ? `Account is locked until ${lockedUntil.toISOString()}. Too many failed login attempts.`
                  : "Account is locked due to too many failed login attempts.";
                throw new APIError("FORBIDDEN", { message });
              }
            } catch (error) {
              // Re-throw APIError (our lockout error) as-is
              if (error instanceof APIError) throw error;
              // Swallow DB errors (e.g., function missing) so login is not blocked
              // when the lockout migration has not been applied
              console.warn("[Auth] check_account_lockout failed (migration may not be applied):", error);
            }
            return { data: session };
          },
          /**
           * After session creation: reset failed login counter.
           * A successful session creation means the user authenticated correctly,
           * so we clear any accumulated failed login attempts.
           */
          after: async (session) => {
            try {
              await pool.query(
                `SELECT app.reset_failed_logins($1::text)`,
                [session.userId]
              );
            } catch (error) {
              // Non-fatal: don't block login if reset fails (e.g., migration not applied)
              console.warn("[Auth] reset_failed_logins failed:", error);
            }
          },
        },
      },
    },

    // Email/password authentication with custom password handling
    // Supports both bcrypt (legacy) and scrypt (Better Auth default) hashes
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: process.env["NODE_ENV"] === "production",
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },

    // Session configuration - table is "session" in app schema
    session: {
      modelName: "session",
      additionalFields: {
        currentTenantId: {
          type: "string",
          required: false,
        },
      },
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes cache
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
    },

    // Cookie configuration
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
      cookiePrefix: "staffora",
      useSecureCookies: process.env["NODE_ENV"] === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: (process.env["NODE_ENV"] === "production" ? "strict" : "lax") as "strict" | "lax",
        path: "/",
        secure: process.env["NODE_ENV"] === "production",
      },
    },

    // User model configuration with additional fields
    // Table name is "user" in app schema - search_path handles schema resolution
    user: {
      modelName: "user",
      additionalFields: {
        status: {
          type: "string",
          defaultValue: "active",
          input: false,
        },
        mfaEnabled: {
          type: "boolean",
          defaultValue: false,
        },
      },
    },

    // Account model - table is "account" in app schema
    account: {
      modelName: "account",
    },

    // Verification model - table is "verification" in app schema
    verification: {
      modelName: "verification",
    },

    // Plugins
    plugins: [
      twoFactor({
        issuer: "Staffora",
        totpOptions: {
          digits: 6,
          period: 30,
        },
      }),
      dash(),
      organization(),
    ],
  });

  return auth;
}

// Singleton auth instance
let authInstance: ReturnType<typeof createBetterAuth> | null = null;

/**
 * Get the Better Auth singleton instance
 */
export function getBetterAuth() {
  if (!authInstance) {
    authInstance = createBetterAuth();
  }
  return authInstance;
}

/**
 * Unlock a user account that was locked due to failed login attempts.
 * Updates both app.users (legacy) and app."user" (Better Auth canonical).
 */
export async function adminUnlockAccount(userId: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE app.users SET status = 'active', updated_at = now() WHERE id = $1::uuid AND status = 'locked'`,
    [userId]
  );
  await pool.query(
    `UPDATE app."user" SET status = 'active', "updatedAt" = now() WHERE id = $1 AND status = 'locked'`,
    [userId]
  );
}

/**
 * Type exports for Better Auth
 */
export type Auth = ReturnType<typeof createBetterAuth>;
export type BetterAuthSession = Auth extends { $Infer: { Session: infer S } } ? S : never;
export type BetterAuthUser = Auth extends { $Infer: { Session: { user: infer U } } } ? U : never;
