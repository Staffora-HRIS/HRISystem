-- Migration: 0188_portal_auth_to_betterauth
-- Created: 2026-03-17
-- Description: Refactor client portal authentication to use BetterAuth.
--              - Add user_id column to portal_users (links to app.users / BetterAuth)
--              - Drop auth-related columns from portal_users (password_hash, etc.)
--              - Drop portal_sessions table (BetterAuth manages sessions)
--              - Drop portal_password_resets table (BetterAuth manages password resets)
--              - Add UNIQUE constraint on (tenant_id, user_id) to portal_users

-- =============================================================================
-- UP Migration
-- =============================================================================

-- 1. Add user_id column to portal_users linking to the BetterAuth users table
ALTER TABLE app.portal_users
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app.users(id);

-- 2. Backfill user_id from email match against app.users
-- This links existing portal users to their BetterAuth user record (if any)
UPDATE app.portal_users pu
SET user_id = u.id
FROM app.users u
WHERE LOWER(pu.email) = LOWER(u.email)
  AND pu.user_id IS NULL;

-- 3. For any portal_users without a matching app.users record, create one.
-- This ensures every portal user has a BetterAuth identity.
INSERT INTO app.users (id, email, name, status, mfa_enabled, email_verified, created_at, updated_at)
SELECT
    gen_random_uuid(),
    pu.email,
    pu.first_name || ' ' || pu.last_name,
    CASE WHEN pu.is_active THEN 'active' ELSE 'inactive' END,
    false,
    COALESCE(pu.email_verified, false),
    pu.created_at,
    pu.updated_at
FROM app.portal_users pu
WHERE pu.user_id IS NULL
ON CONFLICT (email) DO NOTHING;

-- Re-run the backfill to pick up newly created users
UPDATE app.portal_users pu
SET user_id = u.id
FROM app.users u
WHERE LOWER(pu.email) = LOWER(u.email)
  AND pu.user_id IS NULL;

-- 4. Also create BetterAuth "user" table entries for these users
INSERT INTO app."user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
SELECT
    u.id::text,
    u.email,
    u.name,
    u.email_verified,
    u.created_at,
    u.updated_at
FROM app.users u
WHERE u.id IN (SELECT user_id FROM app.portal_users)
  AND NOT EXISTS (SELECT 1 FROM app."user" ba WHERE ba.id = u.id::text)
ON CONFLICT DO NOTHING;

-- 5. Also create BetterAuth "account" entries so they can sign in with email/password
-- Copy the bcrypt password_hash from portal_users as the credential
INSERT INTO app."account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    pu.user_id::text,
    pu.user_id::text,
    'credential',
    pu.password_hash,
    pu.created_at,
    pu.updated_at
FROM app.portal_users pu
WHERE pu.user_id IS NOT NULL
  AND pu.password_hash IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM app."account" a
      WHERE a."userId" = pu.user_id::text AND a."providerId" = 'credential'
  )
ON CONFLICT DO NOTHING;

-- 6. Make user_id NOT NULL now that all rows have been backfilled
ALTER TABLE app.portal_users
    ALTER COLUMN user_id SET NOT NULL;

-- 7. Add UNIQUE constraint on (tenant_id, user_id)
ALTER TABLE app.portal_users
    ADD CONSTRAINT uq_portal_users_tenant_user UNIQUE (tenant_id, user_id);

-- 8. Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_portal_users_user_id
    ON app.portal_users(user_id);

-- 9. Drop auth-related columns from portal_users
-- These are now managed by BetterAuth
ALTER TABLE app.portal_users
    DROP COLUMN IF EXISTS password_hash,
    DROP COLUMN IF EXISTS email_verified,
    DROP COLUMN IF EXISTS email_verified_at,
    DROP COLUMN IF EXISTS failed_login_attempts,
    DROP COLUMN IF EXISTS locked_until,
    DROP COLUMN IF EXISTS password_changed_at;

-- 10. Drop portal_sessions table (BetterAuth manages sessions via app."session")
DROP TABLE IF EXISTS app.portal_sessions CASCADE;

-- 11. Drop portal_password_resets table (BetterAuth manages password resets)
DROP TABLE IF EXISTS app.portal_password_resets CASCADE;

-- =============================================================================
-- DOWN Migration (manual rollback steps)
-- =============================================================================
-- To reverse this migration:
-- 1. Recreate portal_sessions and portal_password_resets tables
-- 2. Re-add password_hash, email_verified, etc. columns to portal_users
-- 3. Drop user_id column and constraints
-- WARNING: Password hashes will be lost after this migration runs. Users will
-- need to use BetterAuth's password reset flow to set new passwords.
