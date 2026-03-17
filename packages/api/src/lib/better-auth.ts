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
 * Create a pg Pool for Better Auth
 * Better Auth requires a standard pg Pool, not the postgres.js client
 */
function createPgPool(): Pool {
  // Prefer DATABASE_APP_URL (hris_app with NOBYPASSRLS), matching db plugin precedence
  const databaseUrl = process.env["DATABASE_APP_URL"] || process.env["DATABASE_URL"] || getDatabaseUrl();
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Set search_path to app schema where our tables are
    options: "-c search_path=app,public",
  });
}

// Singleton pool for Better Auth
let pgPool: Pool | null = null;

function getPgPool(): Pool {
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
          },
          after: async (user) => {
            const email = user.email.trim().toLowerCase();

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
          },
        },
        update: {
          after: async (user) => {
            const email = user.email.trim().toLowerCase();
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
