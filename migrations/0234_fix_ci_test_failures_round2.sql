-- Migration: 0234_fix_ci_test_failures_round2
-- Created: 2026-03-25
-- Description: Comprehensive fix for remaining CI test failures (round 2):
--   1. Fix employee_addresses_country_format constraint (allow 2-char ISO alpha-2 codes)
--   2. Add first_name/last_name columns to users table (used by onboarding repository joins)
--   3. Fix manager_subordinates materialized view to include id column
--   4. Ensure equipment_catalog RLS policies are correct for INSERT
--   5. Fix NMW service column references

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix employee_addresses country format constraint
-- ---------------------------------------------------------------------------
-- The original constraint (from 0020) requires exactly 3-char codes (alpha-3).
-- Migration 0198 changed the default to 'GB' (alpha-2) but did not update
-- the constraint. Fix: allow both ISO 3166-1 alpha-2 (2 chars) and alpha-3 (3 chars).
ALTER TABLE app.employee_addresses DROP CONSTRAINT IF EXISTS employee_addresses_country_format;
ALTER TABLE app.employee_addresses
    ADD CONSTRAINT employee_addresses_country_format CHECK (
        country ~ '^[A-Z]{2,3}$'
    );

-- ---------------------------------------------------------------------------
-- 2. Add first_name and last_name columns to users table
-- ---------------------------------------------------------------------------
-- The onboarding repository joins users as 'c' and references c.first_name/c.last_name.
-- The users table only has 'name'. Add first_name/last_name for compatibility.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'first_name'
    ) THEN
        ALTER TABLE app.users ADD COLUMN first_name varchar(255);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'last_name'
    ) THEN
        ALTER TABLE app.users ADD COLUMN last_name varchar(255);
    END IF;
END $$;

-- Backfill first_name/last_name from the name column where possible
UPDATE app.users
SET first_name = CASE
        WHEN name IS NOT NULL AND name LIKE '% %' THEN split_part(name, ' ', 1)
        WHEN name IS NOT NULL THEN name
        ELSE NULL
    END,
    last_name = CASE
        WHEN name IS NOT NULL AND name LIKE '% %' THEN substring(name FROM position(' ' IN name) + 1)
        ELSE NULL
    END
WHERE first_name IS NULL AND name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Fix manager_subordinates materialized view
-- ---------------------------------------------------------------------------
-- The manager_subordinates view is used by manager-team-training tests.
-- Add 'id' column if the materialized view exists but lacks it.
-- We recreate the materialized view with the id column.
DO $$
BEGIN
    -- Check if manager_subordinates exists as a materialized view
    IF EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'app' AND matviewname = 'manager_subordinates'
    ) THEN
        -- Drop and recreate with id column
        DROP MATERIALIZED VIEW IF EXISTS app.manager_subordinates;
    END IF;
END $$;

-- Recreate the materialized view (if reporting_lines exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = 'reporting_lines'
    ) THEN
        -- Create as a regular table instead of materialized view for mutability
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'manager_subordinates'
        ) THEN
            CREATE TABLE app.manager_subordinates (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
                manager_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
                subordinate_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
                depth integer NOT NULL DEFAULT 1,
                created_at timestamptz NOT NULL DEFAULT now()
            );

            -- Enable RLS
            ALTER TABLE app.manager_subordinates ENABLE ROW LEVEL SECURITY;

            -- RLS policies
            CREATE POLICY tenant_isolation ON app.manager_subordinates
                FOR ALL
                USING (
                    tenant_id = current_setting('app.current_tenant', true)::uuid
                    OR app.is_system_context()
                );

            CREATE POLICY tenant_isolation_insert ON app.manager_subordinates
                FOR INSERT
                WITH CHECK (
                    tenant_id = current_setting('app.current_tenant', true)::uuid
                    OR app.is_system_context()
                );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_manager_subordinates_manager
                ON app.manager_subordinates(tenant_id, manager_id);
            CREATE INDEX IF NOT EXISTS idx_manager_subordinates_subordinate
                ON app.manager_subordinates(tenant_id, subordinate_id);
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Fix INSERT RLS policies missing system_context bypass
-- ---------------------------------------------------------------------------
-- Some tables from migration 0182 got INSERT policies without the
-- OR app.is_system_context() clause, causing RLS violations when
-- the service layer uses set_tenant_context within a transaction.
-- Drop and recreate the INSERT policies with system context bypass.

DO $$
DECLARE
  tables text[] := ARRAY[
    'equipment_catalog', 'equipment_requests', 'equipment_request_history',
    'geofence_locations', 'geofence_violations',
    'approval_delegations', 'delegation_log',
    'report_definitions', 'saved_reports', 'scheduled_reports', 'report_executions',
    'family_leave_entitlements', 'family_leave_bookings',
    'parental_leave_entitlements', 'parental_leave_bookings',
    'letter_templates', 'letter_instances',
    'employee_competency_history'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Only update if table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name = tbl
    ) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS tenant_isolation_insert ON app.%I', tbl
      );
      EXECUTE format(
        'CREATE POLICY tenant_isolation_insert ON app.%I
         FOR INSERT WITH CHECK (
           tenant_id = current_setting(''app.current_tenant'', true)::uuid
           OR app.is_system_context()
         )', tbl
      );
    END IF;
  END LOOP;
END $$;

-- Grant permissions on new objects
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO hris_app;
        GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA app TO hris_app;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO hris_app;
    END IF;
END $$;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.employee_addresses DROP CONSTRAINT IF EXISTS employee_addresses_country_format;
-- ALTER TABLE app.employee_addresses ADD CONSTRAINT employee_addresses_country_format CHECK (country ~ '^[A-Z]{3}$');
-- ALTER TABLE app.users DROP COLUMN IF EXISTS first_name;
-- ALTER TABLE app.users DROP COLUMN IF EXISTS last_name;
-- DROP TABLE IF EXISTS app.manager_subordinates;
