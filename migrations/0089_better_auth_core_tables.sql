-- Migration: 0089_better_auth_core_tables
-- Created: 2026-01-09
-- Description: Create Better Auth core tables (user, session, account, verification)
--              Better Auth requires specific table names. These tables are separate from
--              the existing app.users and app.sessions tables to allow gradual migration.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Better Auth user table (separate from app.users for gradual migration)
CREATE TABLE IF NOT EXISTS app."user" (
    id text PRIMARY KEY,
    name text,
    email text UNIQUE NOT NULL,
    "emailVerified" boolean NOT NULL DEFAULT false,
    image text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    -- Additional HRIS fields
    status varchar(20) NOT NULL DEFAULT 'active',
    "mfaEnabled" boolean NOT NULL DEFAULT false
);

-- Better Auth session table
CREATE TABLE IF NOT EXISTS app."session" (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
    token text UNIQUE NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Better Auth account table (for OAuth and credentials)
CREATE TABLE IF NOT EXISTS app."account" (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
    "providerId" text NOT NULL,
    "accountId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    scope text,
    password text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT account_provider_unique UNIQUE ("providerId", "accountId")
);

-- Better Auth verification table
CREATE TABLE IF NOT EXISTS app."verification" (
    id text PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Better Auth twoFactor table
CREATE TABLE IF NOT EXISTS app."twoFactor" (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
    secret text NOT NULL,
    "backupCodes" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT two_factor_user_unique UNIQUE ("userId")
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ba_user_email ON app."user"(email);
CREATE INDEX IF NOT EXISTS idx_ba_session_user ON app."session"("userId");
CREATE INDEX IF NOT EXISTS idx_ba_session_token ON app."session"(token);
CREATE INDEX IF NOT EXISTS idx_ba_session_expires ON app."session"("expiresAt");
CREATE INDEX IF NOT EXISTS idx_ba_account_user ON app."account"("userId");
CREATE INDEX IF NOT EXISTS idx_ba_verification_identifier ON app."verification"(identifier);
CREATE INDEX IF NOT EXISTS idx_ba_verification_expires ON app."verification"("expiresAt");
CREATE INDEX IF NOT EXISTS idx_ba_twofactor_user ON app."twoFactor"("userId");

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app."user" IS 'Better Auth user table - separate from app.users for gradual migration';
COMMENT ON TABLE app."session" IS 'Better Auth session table';
COMMENT ON TABLE app."account" IS 'Better Auth account table for OAuth and credentials';
COMMENT ON TABLE app."verification" IS 'Better Auth verification tokens';
COMMENT ON TABLE app."twoFactor" IS 'Better Auth two-factor authentication';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_ba_twofactor_user;
-- DROP INDEX IF EXISTS app.idx_ba_verification_expires;
-- DROP INDEX IF EXISTS app.idx_ba_verification_identifier;
-- DROP INDEX IF EXISTS app.idx_ba_account_user;
-- DROP INDEX IF EXISTS app.idx_ba_session_expires;
-- DROP INDEX IF EXISTS app.idx_ba_session_token;
-- DROP INDEX IF EXISTS app.idx_ba_session_user;
-- DROP INDEX IF EXISTS app.idx_ba_user_email;
-- DROP TABLE IF EXISTS app."twoFactor";
-- DROP TABLE IF EXISTS app."verification";
-- DROP TABLE IF EXISTS app."account";
-- DROP TABLE IF EXISTS app."session";
-- DROP TABLE IF EXISTS app."user";
