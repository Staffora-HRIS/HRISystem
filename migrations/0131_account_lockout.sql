-- Migration: 0130_account_lockout
-- Created: 2026-03-13
-- Description: Add account lockout columns to Better Auth user table.
--              Tracks failed login attempts and automatic lockout after threshold.
--              Supports auto-unlock after a configurable duration and admin manual unlock.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add lockout columns to the Better Auth user table
ALTER TABLE app."user"
    ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz,
    ADD COLUMN IF NOT EXISTS "lastFailedLoginAt" timestamptz;

-- Also mirror on the legacy app.users table for consistency
ALTER TABLE app.users
    ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamptz,
    ADD COLUMN IF NOT EXISTS last_failed_login_at timestamptz;

-- Index for finding locked accounts (admin queries, cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_ba_user_locked_until
    ON app."user"("lockedUntil")
    WHERE "lockedUntil" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_locked_until
    ON app.users(locked_until)
    WHERE locked_until IS NOT NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN app."user"."failedLoginAttempts" IS 'Number of consecutive failed login attempts. Reset to 0 on successful login.';
COMMENT ON COLUMN app."user"."lockedUntil" IS 'Timestamp until which the account is locked. NULL means not locked.';
COMMENT ON COLUMN app."user"."lastFailedLoginAt" IS 'Timestamp of the last failed login attempt.';

COMMENT ON COLUMN app.users.failed_login_attempts IS 'Number of consecutive failed login attempts. Reset to 0 on successful login.';
COMMENT ON COLUMN app.users.locked_until IS 'Timestamp until which the account is locked. NULL means not locked.';
COMMENT ON COLUMN app.users.last_failed_login_at IS 'Timestamp of the last failed login attempt.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_users_locked_until;
-- DROP INDEX IF EXISTS app.idx_ba_user_locked_until;
-- ALTER TABLE app.users DROP COLUMN IF EXISTS last_failed_login_at;
-- ALTER TABLE app.users DROP COLUMN IF EXISTS locked_until;
-- ALTER TABLE app.users DROP COLUMN IF EXISTS failed_login_attempts;
-- ALTER TABLE app."user" DROP COLUMN IF EXISTS "lastFailedLoginAt";
-- ALTER TABLE app."user" DROP COLUMN IF EXISTS "lockedUntil";
-- ALTER TABLE app."user" DROP COLUMN IF EXISTS "failedLoginAttempts";
