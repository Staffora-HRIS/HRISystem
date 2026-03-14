#!/bin/bash
# =============================================================================
# Create the hris_app application role for runtime use
#
# This script runs during PostgreSQL container initialization (via
# /docker-entrypoint-initdb.d/) and creates the hris_app role with
# NOBYPASSRLS so Row-Level Security policies are enforced.
#
# The password is read from the HRIS_APP_PASSWORD environment variable,
# defaulting to 'hris_app_dev_password' for local development.
# In production, set HRIS_APP_PASSWORD to a strong, unique value.
# =============================================================================

set -e

APP_PASSWORD="${HRIS_APP_PASSWORD:-hris_app_dev_password}"

echo "[init] Creating hris_app role with NOBYPASSRLS..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
      CREATE ROLE hris_app WITH LOGIN PASSWORD '${APP_PASSWORD}' NOBYPASSRLS;
      RAISE NOTICE 'Created hris_app role with NOBYPASSRLS';
    ELSE
      -- Ensure password matches the configured value
      ALTER ROLE hris_app WITH PASSWORD '${APP_PASSWORD}';
      RAISE NOTICE 'Updated hris_app role password';
    END IF;
  END
  \$\$;

  -- Grant connect to the database
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO hris_app;

  -- Grant usage on schemas
  GRANT USAGE ON SCHEMA app TO hris_app;
  GRANT USAGE ON SCHEMA public TO hris_app;

  -- Grant CRUD on all existing tables
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO hris_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hris_app;

  -- Grant sequence usage (for auto-generated IDs)
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO hris_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hris_app;

  -- Grant execute on all functions (needed for RLS context functions)
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO hris_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hris_app;

  -- Set default privileges for future objects created by hris superuser
  ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO hris_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO hris_app;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hris_app;
EOSQL

echo "[init] hris_app role created successfully"
