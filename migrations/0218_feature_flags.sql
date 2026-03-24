-- Migration: 0218_feature_flags.sql
-- Description: Feature flags system with tenant-scoped rollout, percentage-based
--              targeting, and role-based gating.
--
-- Reversible: YES (see DOWN section at bottom)

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.feature_flags (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  description   text,
  enabled       boolean     NOT NULL DEFAULT false,
  -- Percentage rollout (0-100). When enabled=true and percentage < 100,
  -- only a deterministic subset of users (based on user ID hash) see the flag.
  percentage    integer     NOT NULL DEFAULT 100
                            CHECK (percentage >= 0 AND percentage <= 100),
  -- JSON array of role names that are allowed to see this flag.
  -- NULL or empty array means all roles.
  roles         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Arbitrary metadata for flag configuration (e.g., variant values, expiry notes)
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid        REFERENCES app.users(id),
  updated_by    uuid        REFERENCES app.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Each flag name must be unique per tenant
  CONSTRAINT uq_feature_flags_tenant_name UNIQUE (tenant_id, name)
);

-- Comments for documentation
COMMENT ON TABLE app.feature_flags IS 'Tenant-scoped feature flags for gradual rollout and role-based gating';
COMMENT ON COLUMN app.feature_flags.percentage IS 'Percentage of users who see this flag (0-100). Deterministic via user ID hash.';
COMMENT ON COLUMN app.feature_flags.roles IS 'JSON array of role names. Empty array = all roles allowed.';
COMMENT ON COLUMN app.feature_flags.metadata IS 'Arbitrary key-value metadata for flag configuration.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant_id
  ON app.feature_flags (tenant_id);

CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant_enabled
  ON app.feature_flags (tenant_id, enabled)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_feature_flags_name
  ON app.feature_flags (name);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.feature_flags ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: read
CREATE POLICY tenant_isolation ON app.feature_flags
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation: insert
CREATE POLICY tenant_isolation_insert ON app.feature_flags
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin operations and migrations)
CREATE POLICY system_context_bypass ON app.feature_flags
  USING (current_setting('app.system_context', true) = 'true');

-- =============================================================================
-- Updated-at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION app.feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON app.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION app.feature_flags_updated_at();

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- To rollback this migration, run:
--
-- DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON app.feature_flags;
-- DROP FUNCTION IF EXISTS app.feature_flags_updated_at();
-- DROP TABLE IF EXISTS app.feature_flags CASCADE;
