-- Migration: 0230_fix_tenant_usage_stats_rls
-- Created: 2026-03-25
-- Description: Fix RLS policies on tenant_usage_stats to include system_context
--              bypass and missing_ok parameter. The original policies (0198) used
--              current_setting('app.current_tenant')::uuid WITHOUT the missing_ok
--              parameter and WITHOUT the is_system_context() bypass, which caused
--              withSystemContext() calls to fail with RLS violations.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Drop the old policies that lack system_context bypass
DROP POLICY IF EXISTS tenant_isolation ON app.tenant_usage_stats;
DROP POLICY IF EXISTS tenant_isolation_insert ON app.tenant_usage_stats;

-- Recreate with system_context bypass and missing_ok
CREATE POLICY tenant_isolation ON app.tenant_usage_stats
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.tenant_usage_stats
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- DROP POLICY IF EXISTS tenant_isolation ON app.tenant_usage_stats;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.tenant_usage_stats;
-- CREATE POLICY tenant_isolation ON app.tenant_usage_stats
--     USING (tenant_id = current_setting('app.current_tenant')::uuid);
-- CREATE POLICY tenant_isolation_insert ON app.tenant_usage_stats
--     FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
