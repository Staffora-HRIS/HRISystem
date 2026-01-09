-- Migration: 0088_better_auth_tables
-- Created: 2026-01-09
-- Description: Add Better Auth required tables for OAuth accounts and verification tokens
--              These tables complement the existing users and sessions tables

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Accounts table - OAuth provider accounts linked to users
-- Required by Better Auth for social login (Google, GitHub, etc.)
CREATE TABLE IF NOT EXISTS app.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User who owns this account
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    
    -- OAuth provider info
    provider_id varchar(255) NOT NULL,
    account_id varchar(255) NOT NULL,
    
    -- OAuth tokens
    access_token text,
    refresh_token text,
    id_token text,
    
    -- Token expiration
    access_token_expires_at timestamptz,
    refresh_token_expires_at timestamptz,
    
    -- OAuth scope
    scope text,
    
    -- Password for credential accounts (Better Auth stores hashed password here)
    password text,
    
    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Unique constraint: one account per provider per user
    CONSTRAINT accounts_provider_account_unique UNIQUE (provider_id, account_id)
);

-- Verification table - Email verification and password reset tokens
CREATE TABLE IF NOT EXISTS app.verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What is being verified (email address, phone, etc.)
    identifier varchar(255) NOT NULL,
    
    -- The verification token/code
    value text NOT NULL,
    
    -- When the verification expires
    expires_at timestamptz NOT NULL,
    
    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Two-factor authentication table (for Better Auth twoFactor plugin)
CREATE TABLE IF NOT EXISTS app.two_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User who owns this 2FA config
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    
    -- TOTP secret (encrypted)
    secret text NOT NULL,
    
    -- Backup codes (JSON array of hashed codes)
    backup_codes text,
    
    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- One 2FA config per user
    CONSTRAINT two_factors_user_unique UNIQUE (user_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Accounts indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON app.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON app.accounts(provider_id);

-- Verification indexes
CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON app.verifications(identifier);
CREATE INDEX IF NOT EXISTS idx_verifications_expires ON app.verifications(expires_at);

-- Two-factor indexes
CREATE INDEX IF NOT EXISTS idx_two_factors_user_id ON app.two_factors(user_id);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp for accounts
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON app.accounts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Auto-update updated_at timestamp for verifications
CREATE TRIGGER update_verifications_updated_at
    BEFORE UPDATE ON app.verifications
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Auto-update updated_at timestamp for two_factors
CREATE TRIGGER update_two_factors_updated_at
    BEFORE UPDATE ON app.two_factors
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Cleanup function for expired verifications
-- =============================================================================

CREATE OR REPLACE FUNCTION app.cleanup_expired_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    DELETE FROM app.verifications
    WHERE expires_at < now();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.accounts IS 'OAuth provider accounts linked to users (Better Auth)';
COMMENT ON TABLE app.verifications IS 'Email verification and password reset tokens (Better Auth)';
COMMENT ON TABLE app.two_factors IS 'Two-factor authentication configuration (Better Auth)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.cleanup_expired_verifications();
-- DROP TRIGGER IF EXISTS update_two_factors_updated_at ON app.two_factors;
-- DROP TRIGGER IF EXISTS update_verifications_updated_at ON app.verifications;
-- DROP TRIGGER IF EXISTS update_accounts_updated_at ON app.accounts;
-- DROP INDEX IF EXISTS app.idx_two_factors_user_id;
-- DROP INDEX IF EXISTS app.idx_verifications_expires;
-- DROP INDEX IF EXISTS app.idx_verifications_identifier;
-- DROP INDEX IF EXISTS app.idx_accounts_provider;
-- DROP INDEX IF EXISTS app.idx_accounts_user_id;
-- DROP TABLE IF EXISTS app.two_factors;
-- DROP TABLE IF EXISTS app.verifications;
-- DROP TABLE IF EXISTS app.accounts;
