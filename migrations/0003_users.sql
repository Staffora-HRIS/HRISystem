-- Migration: 0003_users
-- Created: 2026-01-07
-- Description: Create the users table for BetterAuth authentication
--              Users are global (not tenant-scoped) - a user can belong to multiple tenants
--              Tenant association is handled via user_tenants junction table

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Users table - Authentication accounts (BetterAuth compatible)
-- This table is NOT tenant-scoped as users can belong to multiple tenants
CREATE TABLE IF NOT EXISTS app.users (
    -- Primary identifier for the user
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Email address - used as primary login identifier
    -- Must be unique across the entire system
    email varchar(255) UNIQUE NOT NULL,

    -- Whether the email has been verified
    -- Required for sensitive operations and MFA setup
    email_verified boolean NOT NULL DEFAULT false,

    -- Hashed password (bcrypt or argon2 via pgcrypto)
    -- NULL if user uses SSO/OAuth only
    password_hash varchar(255),

    -- User's display name
    name varchar(255),

    -- Profile image URL (avatar)
    image varchar(500),

    -- Multi-Factor Authentication settings
    -- mfa_enabled: Whether MFA is currently active
    -- mfa_secret: Encrypted TOTP secret (base32 encoded)
    mfa_enabled boolean NOT NULL DEFAULT false,
    mfa_secret varchar(255),

    -- User account status
    -- pending: Account created but not activated (awaiting email verification)
    -- active: Normal operation
    -- suspended: Temporarily disabled (e.g., security concern, admin action)
    -- deleted: Soft-deleted, data retained for audit purposes
    status varchar(20) NOT NULL DEFAULT 'active',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT users_status_check CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),
    CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for email lookups (login)
-- Already covered by UNIQUE constraint, but adding explicit index for clarity
CREATE INDEX IF NOT EXISTS idx_users_email ON app.users(email);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON app.users(status);

-- Index for active users with MFA enabled (security queries)
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON app.users(mfa_enabled) WHERE mfa_enabled = true;

-- Partial index for non-deleted users (common query pattern)
CREATE INDEX IF NOT EXISTS idx_users_active ON app.users(id) WHERE status != 'deleted';

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON app.users
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to verify a password against the stored hash
-- Uses pgcrypto's crypt function for bcrypt comparison
CREATE OR REPLACE FUNCTION app.verify_password(
    p_user_id uuid,
    p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_password_hash text;
BEGIN
    SELECT password_hash INTO v_password_hash
    FROM app.users
    WHERE id = p_user_id AND status = 'active';

    IF v_password_hash IS NULL THEN
        RETURN false;
    END IF;

    -- Compare using crypt (handles bcrypt comparison)
    RETURN v_password_hash = crypt(p_password, v_password_hash);
END;
$$;

-- Function to hash a password using bcrypt
CREATE OR REPLACE FUNCTION app.hash_password(p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Use bcrypt with work factor of 12
    RETURN crypt(p_password, gen_salt('bf', 12));
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.users IS 'User authentication accounts. Users are global and can belong to multiple tenants.';
COMMENT ON COLUMN app.users.id IS 'Primary UUID identifier for the user';
COMMENT ON COLUMN app.users.email IS 'Email address used as primary login identifier, must be lowercase';
COMMENT ON COLUMN app.users.email_verified IS 'Whether the email has been verified via confirmation link';
COMMENT ON COLUMN app.users.password_hash IS 'Bcrypt hashed password, NULL for SSO-only users';
COMMENT ON COLUMN app.users.name IS 'Display name for the user';
COMMENT ON COLUMN app.users.image IS 'URL to profile image/avatar';
COMMENT ON COLUMN app.users.mfa_enabled IS 'Whether Multi-Factor Authentication is enabled for this user';
COMMENT ON COLUMN app.users.mfa_secret IS 'Encrypted TOTP secret for MFA (base32 encoded)';
COMMENT ON COLUMN app.users.status IS 'Account status: pending, active, suspended, or deleted';
COMMENT ON FUNCTION app.verify_password IS 'Verifies a password against the stored bcrypt hash';
COMMENT ON FUNCTION app.hash_password IS 'Hashes a password using bcrypt with work factor 12';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.hash_password(text);
-- DROP FUNCTION IF EXISTS app.verify_password(uuid, text);
-- DROP TRIGGER IF EXISTS update_users_updated_at ON app.users;
-- DROP INDEX IF EXISTS app.idx_users_active;
-- DROP INDEX IF EXISTS app.idx_users_mfa_enabled;
-- DROP INDEX IF EXISTS app.idx_users_status;
-- DROP INDEX IF EXISTS app.idx_users_email;
-- DROP TABLE IF EXISTS app.users;
