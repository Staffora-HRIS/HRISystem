-- Migration: 0192_user_table_sync_trigger
-- Created: 2026-03-17
-- Description: Add database trigger to automatically sync changes from
--              app."user" (Better Auth) to app.users (legacy HRIS table).
--
--              This trigger acts as a safety net for the dual-table architecture.
--              The primary sync mechanism is the databaseHooks in better-auth.ts,
--              but if those hooks fail or are bypassed (e.g., direct SQL inserts),
--              this trigger ensures app.users stays in sync.
--
--              The trigger fires AFTER INSERT or UPDATE on app."user" and upserts
--              the corresponding row in app.users. It is designed to be idempotent
--              and will not fail if the app.users row already exists.
--
-- Reversible: Yes (DROP TRIGGER + DROP FUNCTION)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Function: sync app."user" row to app.users
-- Uses SECURITY DEFINER to bypass RLS (app.users is not tenant-scoped,
-- but the function needs to execute regardless of current tenant context).
CREATE OR REPLACE FUNCTION app.sync_ba_user_to_app_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  -- Validate that the id looks like a UUID before casting.
  -- Better Auth uses text IDs; our app.users uses uuid.
  -- If the id is not a valid UUID, skip the sync silently
  -- (this should not happen in practice since databaseHooks.user.create.before
  -- ensures UUID ids, but we guard against edge cases).
  IF NEW.id IS NULL OR NEW.id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE WARNING '[sync_ba_user_to_app_users] Skipping sync for non-UUID id: %', COALESCE(NEW.id, 'NULL');
    RETURN NEW;
  END IF;

  -- Upsert into app.users, matching the field mapping from databaseHooks:
  --   app."user".email         -> app.users.email
  --   app."user".name          -> app.users.name
  --   app."user"."emailVerified" -> app.users.email_verified
  --   app."user".image         -> app.users.image
  --   app."user".status        -> app.users.status
  --   app."user"."mfaEnabled"  -> app.users.mfa_enabled
  INSERT INTO app.users (
    id,
    email,
    email_verified,
    name,
    image,
    mfa_enabled,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id::uuid,
    LOWER(TRIM(NEW.email)),
    COALESCE(NEW."emailVerified", false),
    COALESCE(NEW.name, LOWER(TRIM(NEW.email))),
    NEW.image,
    COALESCE(NEW."mfaEnabled", false),
    COALESCE(NEW.status, 'active'),
    COALESCE(NEW."createdAt", now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email          = EXCLUDED.email,
    email_verified = EXCLUDED.email_verified,
    name           = EXCLUDED.name,
    image          = EXCLUDED.image,
    mfa_enabled    = EXCLUDED.mfa_enabled,
    status         = EXCLUDED.status,
    updated_at     = now()
  -- Only update if something actually changed (avoid unnecessary WAL writes)
  WHERE app.users.email          IS DISTINCT FROM EXCLUDED.email
     OR app.users.email_verified IS DISTINCT FROM EXCLUDED.email_verified
     OR app.users.name           IS DISTINCT FROM EXCLUDED.name
     OR app.users.image          IS DISTINCT FROM EXCLUDED.image
     OR app.users.mfa_enabled    IS DISTINCT FROM EXCLUDED.mfa_enabled
     OR app.users.status         IS DISTINCT FROM EXCLUDED.status;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but do NOT abort the transaction.
    -- The databaseHooks are the primary sync mechanism; this trigger is a
    -- safety net. If it fails, we log and continue so Better Auth operations
    -- are not blocked.
    RAISE WARNING '[sync_ba_user_to_app_users] Failed to sync user % to app.users: % (SQLSTATE %)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Trigger: fires after INSERT or UPDATE on app."user"
-- Using AFTER trigger so the app."user" row is committed first,
-- and the trigger syncs to app.users in the same transaction.
CREATE TRIGGER trg_sync_ba_user_to_app_users
  AFTER INSERT OR UPDATE ON app."user"
  FOR EACH ROW
  EXECUTE FUNCTION app.sync_ba_user_to_app_users();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON FUNCTION app.sync_ba_user_to_app_users() IS
  'Safety-net trigger function: syncs changes from Better Auth app."user" table '
  'to the legacy app.users table. Handles INSERT and UPDATE. Idempotent via ON CONFLICT.';

COMMENT ON TRIGGER trg_sync_ba_user_to_app_users ON app."user" IS
  'Fires after INSERT/UPDATE on app."user" to keep app.users in sync. '
  'Acts as a safety net for the databaseHooks in better-auth.ts.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_sync_ba_user_to_app_users ON app."user";
-- DROP FUNCTION IF EXISTS app.sync_ba_user_to_app_users();
