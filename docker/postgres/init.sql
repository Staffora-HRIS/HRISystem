-- HRIS Platform PostgreSQL Initialization Script
-- This script runs once when the database container is first created

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- UUID generation support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cryptographic functions for password hashing, encryption
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SCHEMAS
-- =============================================================================

-- Application schema for all HRIS tables
CREATE SCHEMA IF NOT EXISTS app;

-- Set search path to include app schema
ALTER DATABASE hris SET search_path TO app, public;

-- =============================================================================
-- TENANT CONTEXT FUNCTIONS
-- =============================================================================

-- Function to set the current tenant and user context for RLS policies
-- This MUST be called at the start of every request that accesses tenant data
CREATE OR REPLACE FUNCTION app.set_tenant_context(
    p_tenant_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Set tenant context for RLS policies
    PERFORM set_config('app.current_tenant', p_tenant_id::text, true);

    -- Set user context (optional, used for audit logging)
    IF p_user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user', p_user_id::text, true);
    ELSE
        PERFORM set_config('app.current_user', '', true);
    END IF;
END;
$$;

-- Function to get the current tenant ID from context
CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id text;
BEGIN
    v_tenant_id := current_setting('app.current_tenant', true);

    IF v_tenant_id IS NULL OR v_tenant_id = '' THEN
        RAISE EXCEPTION 'Tenant context not set. Call set_tenant_context() first.';
    END IF;

    RETURN v_tenant_id::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid tenant ID in context: %', v_tenant_id;
END;
$$;

-- Function to get the current user ID from context
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_user_id text;
BEGIN
    v_user_id := current_setting('app.current_user', true);

    IF v_user_id IS NULL OR v_user_id = '' THEN
        RETURN NULL;
    END IF;

    RETURN v_user_id::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;

-- Function to clear tenant context (call at end of request)
CREATE OR REPLACE FUNCTION app.clear_tenant_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM set_config('app.current_tenant', '', true);
    PERFORM set_config('app.current_user', '', true);
END;
$$;

-- =============================================================================
-- RLS HELPER FUNCTIONS
-- =============================================================================

-- Helper function to check if RLS should be bypassed (for system operations)
-- Only the database superuser or specific roles can bypass RLS
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

-- Function to enable system context (bypasses RLS)
-- Should only be used for migrations, seeds, and system operations
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

-- Function to disable system context
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

-- =============================================================================
-- AUDIT HELPER FUNCTIONS
-- =============================================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Function to prevent updates on immutable tables (like audit_log)
CREATE OR REPLACE FUNCTION app.prevent_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Updates are not allowed on this table';
END;
$$;

-- Function to prevent deletes on immutable tables
CREATE OR REPLACE FUNCTION app.prevent_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Deletes are not allowed on this table';
END;
$$;

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to generate a short, URL-safe unique ID
CREATE OR REPLACE FUNCTION app.generate_short_id(length integer DEFAULT 12)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- Function to validate email format
CREATE OR REPLACE FUNCTION app.is_valid_email(email text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$$;

-- =============================================================================
-- DOMAIN TYPES
-- =============================================================================

-- Email domain type with validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email') THEN
        CREATE DOMAIN app.email AS text
        CHECK (app.is_valid_email(VALUE));
    END IF;
END
$$;

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant usage on app schema to the application user
-- Note: The actual grants depend on your PostgreSQL user setup
-- These are examples assuming a 'hris' application user

GRANT USAGE ON SCHEMA app TO hris;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO hris;

-- Default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO hris;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO hris;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA app IS 'HRIS Platform application schema';
COMMENT ON FUNCTION app.set_tenant_context IS 'Sets the current tenant and user context for RLS policies. Must be called at the start of every request.';
COMMENT ON FUNCTION app.current_tenant_id IS 'Returns the current tenant ID from the session context. Raises exception if not set.';
COMMENT ON FUNCTION app.current_user_id IS 'Returns the current user ID from the session context. Returns NULL if not set.';
COMMENT ON FUNCTION app.clear_tenant_context IS 'Clears the tenant and user context. Call at the end of each request.';
COMMENT ON FUNCTION app.is_system_context IS 'Checks if the current session is running in system context (bypasses RLS).';
COMMENT ON FUNCTION app.update_updated_at_column IS 'Trigger function to automatically update the updated_at timestamp.';
