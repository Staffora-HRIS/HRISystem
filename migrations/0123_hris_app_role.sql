-- Migration: 0123_hris_app_role
-- Created: 2026-03-13
-- Description: Create hris_app application role with NOBYPASSRLS for runtime RLS enforcement
--
-- The application should connect as hris_app at runtime so that Row-Level
-- Security policies are enforced.  The hris superuser role is reserved for
-- migrations and administrative operations only.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Create the application role (idempotent — safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
    CREATE ROLE hris_app WITH LOGIN PASSWORD 'hris_app_dev_password' NOBYPASSRLS;
  END IF;
END
$$;

-- Grant connect to the database
GRANT CONNECT ON DATABASE hris TO hris_app;

-- Grant usage on app and public schemas
GRANT USAGE ON SCHEMA app TO hris_app;
GRANT USAGE ON SCHEMA public TO hris_app;

-- Grant CRUD on all existing tables in app schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hris_app;

-- Grant sequence usage (for auto-generated IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO hris_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hris_app;

-- Grant execute on all functions (needed for RLS context functions)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO hris_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hris_app;

-- Set default privileges for FUTURE tables/sequences/functions created by the
-- hris superuser so hris_app automatically gets access to them.
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO hris_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO hris_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP OWNED BY hris_app;
-- DROP ROLE IF EXISTS hris_app;
