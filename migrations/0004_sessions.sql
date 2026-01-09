-- Migration: 0004_sessions
-- Created: 2026-01-07
-- Description: Create the sessions table for BetterAuth session management
--              Sessions track authenticated user sessions with expiration and metadata

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Sessions table - BetterAuth session management
-- Sessions are NOT tenant-scoped - they belong to users who may access multiple tenants
CREATE TABLE IF NOT EXISTS app.sessions (
    -- Session identifier (used as cookie value)
    id uuid PRIMARY KEY,

    -- User who owns this session
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Session token (hashed or encrypted for security)
    -- Used for session validation alongside the ID
    token varchar(255) UNIQUE NOT NULL,

    -- When this session expires
    -- Sessions should be cleaned up after expiration
    expires_at timestamptz NOT NULL,

    -- Client IP address at session creation
    -- Used for security monitoring and anomaly detection
    ip_address varchar(45), -- Supports IPv6 (up to 45 chars)

    -- User agent string from the client
    -- Used for session identification and security monitoring
    user_agent text,

    -- When the session was created
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Last activity timestamp (updated on each request)
    -- Used for idle timeout and session management
    last_active_at timestamptz NOT NULL DEFAULT now(),

    -- Current tenant context (if user has selected a tenant)
    -- NULL if user hasn't selected a tenant yet
    current_tenant_id uuid REFERENCES app.tenants(id) ON DELETE SET NULL,

    -- Whether this session has completed MFA verification
    -- Important for step-up authentication requirements
    mfa_verified boolean NOT NULL DEFAULT false,

    -- When MFA was last verified (for step-up auth time windows)
    mfa_verified_at timestamptz
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for user_id lookups (finding all sessions for a user)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON app.sessions(user_id);

-- Index for token lookups (session validation)
-- Already covered by UNIQUE constraint but explicit for clarity
CREATE INDEX IF NOT EXISTS idx_sessions_token ON app.sessions(token);

-- Index for expiration cleanup (finding expired sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON app.sessions(expires_at);

-- Index for current tenant (finding sessions in a specific tenant context)
CREATE INDEX IF NOT EXISTS idx_sessions_current_tenant ON app.sessions(current_tenant_id) WHERE current_tenant_id IS NOT NULL;

-- Composite index for security queries (IP + user)
CREATE INDEX IF NOT EXISTS idx_sessions_user_ip ON app.sessions(user_id, ip_address);

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to clean up expired sessions
-- Should be called periodically by a background job
CREATE OR REPLACE FUNCTION app.cleanup_expired_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    DELETE FROM app.sessions
    WHERE expires_at < now();

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- Function to invalidate all sessions for a user
-- Used when password changes, account is suspended, or security concern arises
CREATE OR REPLACE FUNCTION app.invalidate_user_sessions(
    p_user_id uuid,
    p_except_session_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    DELETE FROM app.sessions
    WHERE user_id = p_user_id
      AND (p_except_session_id IS NULL OR id != p_except_session_id);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- Function to rotate a session token (security measure after privilege changes)
CREATE OR REPLACE FUNCTION app.rotate_session_token(
    p_session_id uuid,
    p_new_token varchar(255)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.sessions
    SET token = p_new_token,
        last_active_at = now()
    WHERE id = p_session_id
      AND expires_at > now();

    RETURN FOUND;
END;
$$;

-- Function to update session's MFA verification status
CREATE OR REPLACE FUNCTION app.mark_session_mfa_verified(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.sessions
    SET mfa_verified = true,
        mfa_verified_at = now(),
        last_active_at = now()
    WHERE id = p_session_id
      AND expires_at > now();

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.sessions IS 'User authentication sessions with expiration and metadata for security monitoring';
COMMENT ON COLUMN app.sessions.id IS 'Session identifier used as cookie value';
COMMENT ON COLUMN app.sessions.user_id IS 'Reference to the user who owns this session';
COMMENT ON COLUMN app.sessions.token IS 'Hashed session token for validation';
COMMENT ON COLUMN app.sessions.expires_at IS 'Session expiration timestamp';
COMMENT ON COLUMN app.sessions.ip_address IS 'Client IP address at session creation (IPv4 or IPv6)';
COMMENT ON COLUMN app.sessions.user_agent IS 'Client user agent string for session identification';
COMMENT ON COLUMN app.sessions.last_active_at IS 'Timestamp of last activity, used for idle timeout';
COMMENT ON COLUMN app.sessions.current_tenant_id IS 'Currently selected tenant context, NULL if not selected';
COMMENT ON COLUMN app.sessions.mfa_verified IS 'Whether MFA verification is complete for this session';
COMMENT ON COLUMN app.sessions.mfa_verified_at IS 'When MFA was last verified, for step-up auth time windows';
COMMENT ON FUNCTION app.cleanup_expired_sessions IS 'Removes expired sessions, returns count of deleted sessions';
COMMENT ON FUNCTION app.invalidate_user_sessions IS 'Invalidates all sessions for a user, optionally keeping one';
COMMENT ON FUNCTION app.rotate_session_token IS 'Rotates session token after privilege changes';
COMMENT ON FUNCTION app.mark_session_mfa_verified IS 'Marks a session as MFA verified';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.mark_session_mfa_verified(uuid);
-- DROP FUNCTION IF EXISTS app.rotate_session_token(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.invalidate_user_sessions(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.cleanup_expired_sessions();
-- DROP INDEX IF EXISTS app.idx_sessions_user_ip;
-- DROP INDEX IF EXISTS app.idx_sessions_current_tenant;
-- DROP INDEX IF EXISTS app.idx_sessions_expires_at;
-- DROP INDEX IF EXISTS app.idx_sessions_token;
-- DROP INDEX IF EXISTS app.idx_sessions_user_id;
-- DROP TABLE IF EXISTS app.sessions;
