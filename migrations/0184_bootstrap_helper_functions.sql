-- Migration: 0184_bootstrap_helper_functions
-- Created: 2026-03-16
-- Description: Idempotently create core helper functions that are currently only
--              defined in docker/postgres/init.sql. This ensures they are available
--              in any PostgreSQL environment, not just Docker-initialised databases.
--
--              Functions:
--              1. app.update_updated_at_column() — trigger function for updated_at timestamps
--              2. app.enable_system_context()    — enables RLS bypass for system operations
--              3. app.disable_system_context()   — disables RLS bypass
--              4. app.is_system_context()        — checks if RLS bypass is active
--
--              All use CREATE OR REPLACE FUNCTION for idempotency.
--              Function bodies match docker/postgres/init.sql exactly.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. update_updated_at_column()
-- Used by ~100+ triggers across the schema to auto-set updated_at on UPDATE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.update_updated_at_column()
  IS 'Trigger function to automatically update the updated_at timestamp on row modification.';

-- ---------------------------------------------------------------------------
-- 2. is_system_context()
-- Checks if the current session is running in system context (bypasses RLS).
-- Used in RLS policies to allow system operations (migrations, seeds, workers).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.is_system_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Check if running as superuser or in a system context
    RETURN current_setting('app.system_context', true) = 'true';
END;
$$;

COMMENT ON FUNCTION app.is_system_context()
  IS 'Checks if the current session is running in system context (bypasses RLS). Returns true when app.system_context setting is "true".';

-- ---------------------------------------------------------------------------
-- 3. enable_system_context()
-- Enables system context for the current transaction (bypasses RLS).
-- Should only be used for migrations, seeds, and system operations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.enable_system_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM set_config('app.system_context', 'true', true);
END;
$$;

COMMENT ON FUNCTION app.enable_system_context()
  IS 'Enables system context for the current transaction, bypassing RLS policies. Use only for migrations, seeds, and administrative operations.';

-- ---------------------------------------------------------------------------
-- 4. disable_system_context()
-- Disables system context, restoring normal RLS enforcement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.disable_system_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM set_config('app.system_context', 'false', true);
END;
$$;

COMMENT ON FUNCTION app.disable_system_context()
  IS 'Disables system context, restoring normal RLS enforcement for the current transaction.';

-- ---------------------------------------------------------------------------
-- Grants: ensure the application role can execute these functions
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Grant to hris role (superuser/admin, used for migrations)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris') THEN
    GRANT EXECUTE ON FUNCTION app.update_updated_at_column() TO hris;
    GRANT EXECUTE ON FUNCTION app.is_system_context() TO hris;
    GRANT EXECUTE ON FUNCTION app.enable_system_context() TO hris;
    GRANT EXECUTE ON FUNCTION app.disable_system_context() TO hris;
  END IF;

  -- Grant to hris_app role (application role with NOBYPASSRLS)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
    GRANT EXECUTE ON FUNCTION app.update_updated_at_column() TO hris_app;
    GRANT EXECUTE ON FUNCTION app.is_system_context() TO hris_app;
    GRANT EXECUTE ON FUNCTION app.enable_system_context() TO hris_app;
    GRANT EXECUTE ON FUNCTION app.disable_system_context() TO hris_app;
  END IF;
END $$;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- WARNING: Do NOT drop these functions if any triggers or RLS policies reference them.
-- Dropping would break the entire schema. Only drop if you are fully rebuilding.
--
-- DROP FUNCTION IF EXISTS app.disable_system_context();
-- DROP FUNCTION IF EXISTS app.enable_system_context();
-- DROP FUNCTION IF EXISTS app.is_system_context();
-- DROP FUNCTION IF EXISTS app.update_updated_at_column();
