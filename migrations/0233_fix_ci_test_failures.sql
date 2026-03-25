-- Migration: 0233_fix_ci_test_failures
-- Created: 2026-03-25
-- Description: Comprehensive fix for CI test failures:
--   1. Ensure set_tenant_context() and clear_tenant_context() exist as migration-managed functions
--   2. Create time_events partitions for 2026 (tests use current date)
--   3. Create default partition for time_events to prevent partition-not-found errors
--   4. Add missing employee_compensation table/view
--   5. Add missing columns to employees and org_units tables

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Core RLS functions (idempotent - ensures availability beyond docker init)
-- ---------------------------------------------------------------------------

-- set_tenant_context: sets RLS context for the current transaction
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
    PERFORM set_config('app.current_tenant', p_tenant_id::text, true);
    IF p_user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user', p_user_id::text, true);
    ELSE
        PERFORM set_config('app.current_user', '', true);
    END IF;
END;
$$;

-- clear_tenant_context: resets RLS context
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

-- current_tenant_id: retrieves current tenant from context
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

-- current_user_id: retrieves current user from context
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

-- Grant execute to application roles
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris') THEN
        GRANT EXECUTE ON FUNCTION app.set_tenant_context(uuid, uuid) TO hris;
        GRANT EXECUTE ON FUNCTION app.clear_tenant_context() TO hris;
        GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO hris;
        GRANT EXECUTE ON FUNCTION app.current_user_id() TO hris;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
        GRANT EXECUTE ON FUNCTION app.set_tenant_context(uuid, uuid) TO hris_app;
        GRANT EXECUTE ON FUNCTION app.clear_tenant_context() TO hris_app;
        GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO hris_app;
        GRANT EXECUTE ON FUNCTION app.current_user_id() TO hris_app;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Time events partitions for 2026 (all months + default)
-- ---------------------------------------------------------------------------

-- Create partitions for all months of 2026 and early 2027
DO $$
DECLARE
    v_year integer;
    v_month integer;
    v_partition_name text;
    v_start_date date;
    v_end_date date;
BEGIN
    -- Create monthly partitions for Jan 2026 through Jun 2027
    FOR v_year IN 2026..2027 LOOP
        FOR v_month IN 1..12 LOOP
            -- Only go to June 2027
            EXIT WHEN v_year = 2027 AND v_month > 6;

            v_partition_name := format('time_events_%s%s', v_year::text, lpad(v_month::text, 2, '0'));
            v_start_date := make_date(v_year, v_month, 1);
            v_end_date := v_start_date + interval '1 month';

            -- Only create if partition does not already exist
            IF NOT EXISTS (
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'app' AND c.relname = v_partition_name
            ) THEN
                EXECUTE format(
                    'CREATE TABLE app.%I PARTITION OF app.time_events FOR VALUES FROM (%L) TO (%L)',
                    v_partition_name, v_start_date, v_end_date
                );
            END IF;
        END LOOP;
    END LOOP;

    -- Create a default partition to catch any rows that don't fit existing partitions
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = 'time_events_default'
    ) THEN
        CREATE TABLE app.time_events_default PARTITION OF app.time_events DEFAULT;
    END IF;
END $$;

-- Enable RLS on new partitions (partitions inherit RLS from parent, but let's be safe)
-- The parent table already has RLS enabled, which is inherited by partitions.

-- ---------------------------------------------------------------------------
-- 3. Add missing created_by column to employees table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'employees' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE app.employees ADD COLUMN created_by uuid REFERENCES app.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Add missing type and unit_type columns to org_units table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Add 'type' column if missing (some code references org_units.type)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'org_units' AND column_name = 'type'
    ) THEN
        ALTER TABLE app.org_units ADD COLUMN type varchar(50) DEFAULT 'department';
    END IF;

    -- Add 'unit_type' column if missing (some code references org_units.unit_type)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'org_units' AND column_name = 'unit_type'
    ) THEN
        -- If 'type' already exists, mirror it; otherwise add standalone
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'org_units' AND column_name = 'type'
        ) THEN
            ALTER TABLE app.org_units ADD COLUMN unit_type varchar(50) GENERATED ALWAYS AS (type) STORED;
        ELSE
            ALTER TABLE app.org_units ADD COLUMN unit_type varchar(50) DEFAULT 'department';
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Create employee_compensation view if it doesn't exist as a table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Check if employee_compensation exists as either a table or a view
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = 'employee_compensation'
    ) THEN
        -- Create as a view over compensation_history
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'compensation_history'
        ) THEN
            CREATE VIEW app.employee_compensation AS
            SELECT
                id, tenant_id, employee_id,
                base_salary AS salary, currency,
                effective_from, effective_to,
                created_at, updated_at
            FROM app.compensation_history;
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Add 'in_progress' and 'appealed' to case_status enum if missing
--    (used by case appeals module)
--    Note: ALTER TYPE ADD VALUE cannot run inside a transaction block,
--    but the IF NOT EXISTS clause handles idempotency.
-- ---------------------------------------------------------------------------
ALTER TYPE app.case_status ADD VALUE IF NOT EXISTS 'in_progress' AFTER 'open';
ALTER TYPE app.case_status ADD VALUE IF NOT EXISTS 'appealed' AFTER 'resolved';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP VIEW IF EXISTS app.employee_compensation;
-- ALTER TABLE app.org_units DROP COLUMN IF EXISTS unit_type;
-- ALTER TABLE app.employees DROP COLUMN IF EXISTS created_by;
-- DROP TABLE IF EXISTS app.time_events_default;
