-- Migration: 0190_account_lockout
-- Created: 2026-03-17
-- Description: Add account lockout functions for checking, recording, and resetting
--              failed login attempts with exponential backoff lockout durations.
--              Columns were already added in 0131_account_lockout; this migration
--              adds the server-side functions that operate on both app."user"
--              (Better Auth) and app.users (application) tables.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Safety: re-add columns IF NOT EXISTS in case 0131 was not applied
ALTER TABLE app."user"
    ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS "lastFailedLoginAt" timestamptz DEFAULT NULL;

ALTER TABLE app.users
    ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamptz DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_failed_login_at timestamptz DEFAULT NULL;

-- =============================================================================
-- Function: check_account_lockout
-- =============================================================================
-- Returns TRUE if the account is currently locked (lockedUntil > now()).
-- If the lock has expired, automatically resets the lock fields and returns FALSE.
-- This allows expired locks to self-heal on the next login attempt.

CREATE OR REPLACE FUNCTION app.check_account_lockout(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_locked_until timestamptz;
BEGIN
    -- Read the lock expiry from the Better Auth user table
    SELECT "lockedUntil"
      INTO v_locked_until
      FROM app."user"
     WHERE id = p_user_id;

    -- No user found or no lock set: not locked
    IF v_locked_until IS NULL THEN
        RETURN false;
    END IF;

    -- Lock is still active
    IF v_locked_until > now() THEN
        RETURN true;
    END IF;

    -- Lock has expired: reset lockout state on both tables
    UPDATE app."user"
       SET "failedLoginAttempts" = 0,
           "lockedUntil" = NULL
     WHERE id = p_user_id;

    UPDATE app.users
       SET failed_login_attempts = 0,
           locked_until = NULL
     WHERE id = p_user_id::uuid;

    RETURN false;
END;
$$;

COMMENT ON FUNCTION app.check_account_lockout(text) IS
    'Check if a user account is locked. Returns true if locked, false otherwise. '
    'Automatically resets expired locks.';

-- =============================================================================
-- Function: record_failed_login
-- =============================================================================
-- Increments the failed login counter and sets lastFailedLoginAt.
-- When the counter reaches a lockout threshold, sets lockedUntil using
-- exponential backoff:
--   10 attempts  ->  5 minutes
--   15 attempts  -> 15 minutes
--   20 attempts  ->  1 hour
--   25+ attempts -> 24 hours
-- Updates both app."user" and app.users tables atomically.

CREATE OR REPLACE FUNCTION app.record_failed_login(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_attempts integer;
    v_lock_duration interval;
BEGIN
    -- Increment counter and set timestamp on Better Auth user table, returning new count
    UPDATE app."user"
       SET "failedLoginAttempts" = "failedLoginAttempts" + 1,
           "lastFailedLoginAt" = now()
     WHERE id = p_user_id
     RETURNING "failedLoginAttempts" INTO v_attempts;

    -- If user not found in Better Auth table, exit early
    IF v_attempts IS NULL THEN
        RETURN;
    END IF;

    -- Mirror the same values to the application users table
    UPDATE app.users
       SET failed_login_attempts = v_attempts,
           last_failed_login_at = now()
     WHERE id = p_user_id::uuid;

    -- Determine lockout duration based on cumulative failed attempts
    -- Uses stepped exponential backoff at every 5th attempt starting at 10
    IF v_attempts >= 25 THEN
        v_lock_duration := interval '24 hours';
    ELSIF v_attempts >= 20 THEN
        v_lock_duration := interval '1 hour';
    ELSIF v_attempts >= 15 THEN
        v_lock_duration := interval '15 minutes';
    ELSIF v_attempts >= 10 THEN
        v_lock_duration := interval '5 minutes';
    ELSE
        -- Below threshold: no lockout
        RETURN;
    END IF;

    -- Apply the lock to both tables
    UPDATE app."user"
       SET "lockedUntil" = now() + v_lock_duration
     WHERE id = p_user_id;

    UPDATE app.users
       SET locked_until = now() + v_lock_duration
     WHERE id = p_user_id::uuid;
END;
$$;

COMMENT ON FUNCTION app.record_failed_login(text) IS
    'Record a failed login attempt. Increments counter and applies exponential '
    'backoff lockout at 10/15/20/25+ attempts (5min/15min/1hr/24hr).';

-- =============================================================================
-- Function: reset_failed_logins
-- =============================================================================
-- Resets all lockout state for a user. Called on successful login or by an
-- admin unlocking an account. Clears failedLoginAttempts, lockedUntil, and
-- lastFailedLoginAt on both tables.

CREATE OR REPLACE FUNCTION app.reset_failed_logins(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Reset Better Auth user table
    UPDATE app."user"
       SET "failedLoginAttempts" = 0,
           "lockedUntil" = NULL,
           "lastFailedLoginAt" = NULL
     WHERE id = p_user_id;

    -- Reset application users table
    UPDATE app.users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_failed_login_at = NULL
     WHERE id = p_user_id::uuid;
END;
$$;

COMMENT ON FUNCTION app.reset_failed_logins(text) IS
    'Reset all failed login state for a user. Called on successful login or admin unlock.';

-- =============================================================================
-- Permissions
-- =============================================================================

-- Grant execute to the application role so these can be called at runtime
GRANT EXECUTE ON FUNCTION app.check_account_lockout(text) TO hris_app;
GRANT EXECUTE ON FUNCTION app.record_failed_login(text) TO hris_app;
GRANT EXECUTE ON FUNCTION app.reset_failed_logins(text) TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- REVOKE EXECUTE ON FUNCTION app.reset_failed_logins(text) FROM hris_app;
-- REVOKE EXECUTE ON FUNCTION app.record_failed_login(text) FROM hris_app;
-- REVOKE EXECUTE ON FUNCTION app.check_account_lockout(text) FROM hris_app;
-- DROP FUNCTION IF EXISTS app.reset_failed_logins(text);
-- DROP FUNCTION IF EXISTS app.record_failed_login(text);
-- DROP FUNCTION IF EXISTS app.check_account_lockout(text);
-- Note: columns were added in 0131 and are NOT removed by this rollback.
-- To remove columns, rollback 0131_account_lockout.sql as well.
