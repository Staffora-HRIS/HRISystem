/**
 * Better Auth Server Configuration
 *
 * Configures Better Auth with Postgres adapter for the HRIS platform.
 * Features:
 * - Session-based authentication with cookies
 * - MFA support (TOTP)
 * - Multi-tenant user management
 * - Custom database schema mapping
 */

import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";

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
 */
async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const { hash, password } = data;
  
  if (isBcryptHash(hash)) {
    // Legacy bcrypt hash - verify using bcryptjs
    return bcrypt.compare(password, hash);
  }
  
  // Better Auth scrypt format: salt:hash (both hex encoded)
  // Let Better Auth's default verification handle this by returning false
  // and allowing the default scrypt verification to proceed
  return false;
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
const getAuthConfig = () => ({
  secret: process.env["BETTER_AUTH_SECRET"] || process.env["SESSION_SECRET"] || "development-secret-change-in-production",
  baseURL: process.env["BETTER_AUTH_URL"] || process.env["API_URL"] || "http://localhost:3000",
  // FIX: Use comma-separated CORS_ORIGIN env var or default to all dev ports
  // This ensures Better Auth trustedOrigins match Elysia CORS config (app.ts)
  trustedOrigins: process.env["CORS_ORIGIN"]
    ? process.env["CORS_ORIGIN"].split(",").map(s => s.trim())
    : DEFAULT_TRUSTED_ORIGINS,
});

/**
 * Create a pg Pool for Better Auth
 * Better Auth requires a standard pg Pool, not the postgres.js client
 */
function createPgPool(): Pool {
  const databaseUrl = process.env["DATABASE_URL"] || "postgres://hris:hris_dev_password@localhost:5432/hris";
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

    // Email/password authentication with custom password handling
    // Supports both bcrypt (legacy) and scrypt (Better Auth default) hashes
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },

    // Session configuration - table is "session" in app schema
    session: {
      modelName: "session",
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes cache
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
    },

    // Cookie configuration
    advanced: {
      cookiePrefix: "hris",
      useSecureCookies: process.env["NODE_ENV"] === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax" as const,
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
        issuer: "HRIS Platform",
        totpOptions: {
          digits: 6,
          period: 30,
        },
      }),
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
 * Type exports for Better Auth
 */
export type Auth = ReturnType<typeof createBetterAuth>;
export type BetterAuthSession = Auth extends { $Infer: { Session: infer S } } ? S : never;
export type BetterAuthUser = Auth extends { $Infer: { Session: { user: infer U } } } ? U : never;
