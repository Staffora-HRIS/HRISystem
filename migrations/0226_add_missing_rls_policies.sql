-- Migration: 0226_add_missing_rls_policies
-- Created: 2026-03-21
-- Description: Add RLS policies to all tenant-owned tables that have RLS enabled
--              but no policies defined. Without policies, hris_app (NOBYPASSRLS)
--              is blocked from all operations on these tables.
--
-- Pattern: Each table gets two permissive policies:
--   1. tenant_isolation (FOR ALL): USING (tenant_id matches current_tenant OR system_context)
--   2. tenant_isolation_insert (FOR INSERT): WITH CHECK (same condition)
--
-- The system_context check allows withSystemContext() calls to bypass tenant isolation.

DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT c.relname as table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app'
          AND c.relkind = 'r'
          AND c.relrowsecurity = true
          AND NOT EXISTS (
            SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app'
              AND table_name = c.relname
              AND column_name = 'tenant_id'
          )
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = current_setting(''app.current_tenant'')::uuid OR current_setting(''app.system_context'', true) = ''true'')',
            tbl.table_name
        );
        EXECUTE format(
            'CREATE POLICY tenant_isolation_insert ON app.%I FOR INSERT WITH CHECK (tenant_id = current_setting(''app.current_tenant'')::uuid OR current_setting(''app.system_context'', true) = ''true'')',
            tbl.table_name
        );
        RAISE NOTICE 'Added RLS policies to app.%', tbl.table_name;
    END LOOP;
END
$$;
