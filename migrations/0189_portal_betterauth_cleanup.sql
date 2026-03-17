-- Migration: 0189_portal_betterauth_cleanup
-- Created: 2026-03-17
-- Description: Remove custom auth infrastructure from portal_users in favor of
--              BetterAuth. Drops portal_sessions and portal_password_resets tables
--              (auth is now handled by BetterAuth at /api/auth/*), removes auth
--              columns from portal_users, and adds user_id FK to app.users.

-- =============================================================================
-- 1. Drop portal_sessions (sessions handled by BetterAuth app."session")
-- =============================================================================

-- CASCADE removes dependent grants, policies, and indexes automatically
DROP TABLE IF EXISTS app.portal_sessions CASCADE;

-- =============================================================================
-- 2. Drop portal_password_resets (password reset handled by BetterAuth)
-- =============================================================================

DROP TABLE IF EXISTS app.portal_password_resets CASCADE;

-- =============================================================================
-- 3. Add user_id column to portal_users (links to BetterAuth user)
-- =============================================================================

-- Add user_id column referencing app.users (BetterAuth-synced user table).
-- NOT NULL is enforced after backfill of any existing rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'portal_users' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE app.portal_users ADD COLUMN user_id uuid REFERENCES app.users(id);
  END IF;
END $$;

-- Backfill user_id from email match for any existing portal_users rows.
-- app.users.email is already lowercase (enforced by CHECK constraint in 0003),
-- so only LOWER() the portal side to allow index use on app.users(email).
UPDATE app.portal_users pu
SET user_id = u.id
FROM app.users u
WHERE pu.user_id IS NULL
  AND pu.email IS NOT NULL
  AND u.email = LOWER(pu.email);

-- Delete orphaned portal_users that cannot be linked to a BetterAuth user
DELETE FROM app.portal_users WHERE user_id IS NULL;

-- Now enforce NOT NULL
ALTER TABLE app.portal_users ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_users_user_id
  ON app.portal_users(user_id);

-- =============================================================================
-- 4. Remove auth-specific columns from portal_users
--    These are all handled by BetterAuth now.
-- =============================================================================

-- Drop email unique constraint and index first (before dropping the column)
ALTER TABLE app.portal_users DROP CONSTRAINT IF EXISTS portal_users_email_key;
DROP INDEX IF EXISTS app.idx_portal_users_email;

-- Drop all auth-specific columns in a single ALTER to minimize lock acquisitions.
-- password_hash, email: managed by BetterAuth via app."account" / app."user"
-- email_verified/at: managed by BetterAuth via app."verification"
-- failed_login_attempts, locked_until, password_changed_at: managed by BetterAuth
ALTER TABLE app.portal_users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS email_verified,
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS failed_login_attempts,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS password_changed_at;

-- =============================================================================
-- 5. Update comments
-- =============================================================================

COMMENT ON TABLE app.portal_users IS 'Portal user profiles linked to BetterAuth users via user_id. Auth (login, sessions, password reset, MFA) is handled by BetterAuth at /api/auth/*.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- ALTER TABLE app.portal_users ALTER COLUMN user_id DROP NOT NULL;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS email text;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS password_hash text;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS failed_login_attempts int DEFAULT 0;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
-- ALTER TABLE app.portal_users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
-- (Recreate portal_sessions and portal_password_resets tables from 0187)
