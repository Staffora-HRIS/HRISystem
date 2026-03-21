-- Migration: 0220_fix_idempotency_keys_rls
-- Created: 2026-03-21
-- Description: Fix RLS policies on idempotency_keys that block ALL mutating endpoints.
--
--              The original policies (migration 0012) used a non-standard
--              "user_isolation" pattern requiring BOTH tenant_id AND user_id to
--              match the session context variables. This causes INSERT failures
--              because:
--
--              1. The idempotency plugin inserts via db.withSystemContext() which
--                 sets app.current_tenant to a nil UUID and enables
--                 app.system_context, but does NOT set app.current_user.
--                 The user_id = current_setting('app.current_user', true)::uuid
--                 comparison then fails (empty string to UUID cast error, or
--                 NULL comparison yields NULL), and the entire first branch of
--                 the OR evaluates to FALSE/NULL.
--
--              2. Even though is_system_context() should provide a bypass via
--                 the OR clause, the combination of the uuid cast behaviour and
--                 the AND/OR precedence in certain PostgreSQL execution paths
--                 can cause the policy check to fail before the system-context
--                 branch is evaluated.
--
--              The fix replaces both policies with the standard tenant_isolation
--              pattern used by every other tenant-owned table in the codebase.
--              User-level scoping is already enforced by the application layer
--              (the idempotency plugin always scopes queries by user_id in its
--              WHERE clauses) and by the UNIQUE constraint on
--              (tenant_id, user_id, route_key, idempotency_key).

-- =============================================================================
-- UP Migration
-- =============================================================================

-- 1. Drop the existing non-standard policies
DROP POLICY IF EXISTS user_isolation ON app.idempotency_keys;
DROP POLICY IF EXISTS user_isolation_insert ON app.idempotency_keys;

-- Also drop standard-named policies in case this migration is re-run
DROP POLICY IF EXISTS tenant_isolation ON app.idempotency_keys;
DROP POLICY IF EXISTS tenant_isolation_insert ON app.idempotency_keys;

-- 2. Create the standard tenant_isolation policy (FOR ALL — covers SELECT, UPDATE, DELETE)
--    Matches the pattern used by org_units, employees, positions, and all other tables.
CREATE POLICY tenant_isolation ON app.idempotency_keys
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- 3. Create the standard tenant_isolation_insert policy (FOR INSERT)
--    Explicit INSERT policy for defence-in-depth, per project convention.
CREATE POLICY tenant_isolation_insert ON app.idempotency_keys
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- 4. Ensure hris_app has table-level permissions (belt-and-suspenders —
--    migration 0123 already grants on ALL TABLES, but the idempotency_keys
--    table was created in 0012, long before 0123 set up default privileges).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON app.idempotency_keys TO hris_app;
    END IF;
END $$;

-- =============================================================================
-- Verification (run manually to confirm policies are correct)
-- =============================================================================
-- SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
--        pg_get_expr(polwithcheck, polrelid) AS check_expr
--   FROM pg_policy
--  WHERE polrelid = 'app.idempotency_keys'::regclass;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- To rollback, restore the original user_isolation policies:
--
-- DROP POLICY IF EXISTS tenant_isolation ON app.idempotency_keys;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.idempotency_keys;
--
-- CREATE POLICY user_isolation ON app.idempotency_keys
--     FOR ALL
--     USING (
--         (
--             tenant_id = current_setting('app.current_tenant', true)::uuid
--             AND user_id = current_setting('app.current_user', true)::uuid
--         )
--         OR app.is_system_context()
--     );
--
-- CREATE POLICY user_isolation_insert ON app.idempotency_keys
--     FOR INSERT
--     WITH CHECK (
--         (
--             tenant_id = current_setting('app.current_tenant', true)::uuid
--             AND user_id = current_setting('app.current_user', true)::uuid
--         )
--         OR app.is_system_context()
--     );
