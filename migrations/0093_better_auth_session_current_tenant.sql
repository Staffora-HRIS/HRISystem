-- Migration: 0093_better_auth_session_current_tenant
-- Created: 2026-01-10
-- Description: Add current tenant context to Better Auth session table

-- =============================================================================
-- UP Migration
-- =============================================================================

ALTER TABLE app."session"
ADD COLUMN IF NOT EXISTS "currentTenantId" uuid REFERENCES app.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ba_session_current_tenant ON app."session"("currentTenantId")
WHERE "currentTenantId" IS NOT NULL;

COMMENT ON COLUMN app."session"."currentTenantId" IS 'Selected tenant context for this Better Auth session';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_ba_session_current_tenant;
-- ALTER TABLE app."session" DROP COLUMN IF EXISTS "currentTenantId";
