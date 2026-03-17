-- Migration: 0183_fix_analytics_widgets_tenant_id
-- Created: 2026-03-16
-- Description: Add tenant_id column to analytics_widgets table.
--
--              Wrapped in a single DO block so the entire migration is skipped
--              if analytics_widgets doesn't exist (e.g. in dev environments where
--              earlier analytics migrations weren't applied).

DO $$
BEGIN
  -- Guard: Skip if analytics_widgets doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'analytics_widgets'
  ) THEN
    RAISE NOTICE 'analytics_widgets table does not exist — skipping migration 0183';
    RETURN;
  END IF;

  -- Step 1: Add tenant_id column
  ALTER TABLE app.analytics_widgets ADD COLUMN IF NOT EXISTS tenant_id uuid;

  -- Step 2: Backfill tenant_id from parent analytics_dashboards
  PERFORM app.enable_system_context();

  UPDATE app.analytics_widgets w
  SET tenant_id = d.tenant_id
  FROM app.analytics_dashboards d
  WHERE w.dashboard_id = d.id
    AND w.tenant_id IS NULL;

  PERFORM app.disable_system_context();

  -- Step 3: Make tenant_id NOT NULL if no orphans remain
  IF EXISTS (
    SELECT 1 FROM app.analytics_widgets WHERE tenant_id IS NULL
  ) THEN
    RAISE WARNING 'analytics_widgets has rows with NULL tenant_id after backfill — orphaned widgets exist';
  ELSE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'analytics_widgets'
        AND column_name = 'tenant_id'
        AND is_nullable = 'YES'
    ) THEN
      ALTER TABLE app.analytics_widgets ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  END IF;

  -- Step 4: Add FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'app'
      AND table_name = 'analytics_widgets'
      AND constraint_name = 'analytics_widgets_tenant_id_fkey'
  ) THEN
    ALTER TABLE app.analytics_widgets
      ADD CONSTRAINT analytics_widgets_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;
  END IF;

  -- Step 5: Drop old subquery-based RLS policy
  DROP POLICY IF EXISTS dashboard_access ON app.analytics_widgets;

  -- Standard tenant isolation policy
  BEGIN
    CREATE POLICY tenant_isolation ON app.analytics_widgets
      USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Standard INSERT policy
  BEGIN
    CREATE POLICY tenant_isolation_insert ON app.analytics_widgets
      FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Step 6: Add index
  CREATE INDEX IF NOT EXISTS idx_analytics_widgets_tenant
    ON app.analytics_widgets(tenant_id);

  RAISE NOTICE 'analytics_widgets tenant_id column added and RLS policies created';
END $$;
