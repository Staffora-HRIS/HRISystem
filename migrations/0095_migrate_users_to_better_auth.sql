-- Migration: 0095_migrate_users_to_better_auth
-- Created: 2026-01-09
-- Description: Migrate existing users from app.users to Better Auth tables
--              This enables full transition to Better Auth authentication

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enable system context
SELECT app.enable_system_context();

-- Migrate users from app.users to app."user" (Better Auth table)
INSERT INTO app."user" (
    id,
    name,
    email,
    "emailVerified",
    image,
    "createdAt",
    "updatedAt",
    status,
    "mfaEnabled"
)
SELECT 
    u.id::text,
    COALESCE(u.name, u.email),
    u.email,
    COALESCE(u.email_verified, false),
    NULL,
    u.created_at,
    u.updated_at,
    u.status::varchar(20),
    COALESCE(u.mfa_enabled, false)
FROM app.users u
WHERE NOT EXISTS (
    SELECT 1 FROM app."user" ba WHERE ba.email = u.email
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    "emailVerified" = EXCLUDED."emailVerified",
    status = EXCLUDED.status,
    "mfaEnabled" = EXCLUDED."mfaEnabled",
    "updatedAt" = now();

-- Migrate password credentials to app."account" (Better Auth stores passwords here)
INSERT INTO app."account" (
    id,
    "userId",
    "providerId",
    "accountId",
    password,
    "createdAt",
    "updatedAt"
)
SELECT 
    gen_random_uuid()::text,
    u.id::text,
    'credential',
    u.email,
    u.password_hash,
    u.created_at,
    u.updated_at
FROM app.users u
WHERE u.password_hash IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM app."account" a 
    WHERE a."userId" = u.id::text 
    AND a."providerId" = 'credential'
)
ON CONFLICT ("providerId", "accountId") DO UPDATE SET
    password = EXCLUDED.password,
    "updatedAt" = now();

-- Migrate MFA secrets to app."twoFactor" table
INSERT INTO app."twoFactor" (
    id,
    "userId",
    secret,
    "backupCodes",
    "createdAt",
    "updatedAt"
)
SELECT 
    gen_random_uuid()::text,
    u.id::text,
    u.mfa_secret,
    NULL,
    u.created_at,
    u.updated_at
FROM app.users u
WHERE u.mfa_enabled = true 
AND u.mfa_secret IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM app."twoFactor" tf WHERE tf."userId" = u.id::text
)
ON CONFLICT ("userId") DO UPDATE SET
    secret = EXCLUDED.secret,
    "updatedAt" = now();

-- Log migration results
DO $$
DECLARE
    v_user_count integer;
    v_account_count integer;
    v_mfa_count integer;
BEGIN
    SELECT COUNT(*) INTO v_user_count FROM app."user";
    SELECT COUNT(*) INTO v_account_count FROM app."account" WHERE "providerId" = 'credential';
    SELECT COUNT(*) INTO v_mfa_count FROM app."twoFactor";
    
    RAISE NOTICE 'Migration complete:';
    RAISE NOTICE '  Users migrated: %', v_user_count;
    RAISE NOTICE '  Credential accounts: %', v_account_count;
    RAISE NOTICE '  MFA configurations: %', v_mfa_count;
END $$;

-- Disable system context
SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- To rollback, you would need to:
-- DELETE FROM app."twoFactor";
-- DELETE FROM app."account";
-- DELETE FROM app."user";
