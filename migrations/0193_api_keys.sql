-- Migration: 0193_api_keys
-- Created: 2026-03-17
-- Description: API key management table for machine-to-machine authentication.
--              Stores hashed keys with scope restrictions, expiry, and usage tracking.
--              Keys use the format: sfra_ + 32 random bytes (base64url encoded).
--              Only the SHA-256 hash is stored; the full key is returned once at creation.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: api_keys
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.api_keys (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,

  -- Key identity
  name                  varchar(255) NOT NULL,
  key_hash              varchar(64) NOT NULL,       -- SHA-256 hex digest (64 chars)
  key_prefix            varchar(8) NOT NULL,         -- First 8 chars of the key for display

  -- Scope restrictions
  scopes                jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle
  expires_at            timestamptz,                 -- NULL = never expires
  last_used_at          timestamptz,
  revoked_at            timestamptz,                 -- NULL = active; set to revoke

  -- Audit
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.api_keys
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.api_keys
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant
  ON app.api_keys (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON app.api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_revoked
  ON app.api_keys (tenant_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_created_by
  ON app.api_keys (tenant_id, created_by);

-- Updated_at trigger
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON app.api_keys
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.api_keys IS 'API keys for machine-to-machine authentication per tenant';
COMMENT ON COLUMN app.api_keys.name IS 'Human-readable name for the API key (e.g., "CI/CD Pipeline", "Payroll Integration")';
COMMENT ON COLUMN app.api_keys.key_hash IS 'SHA-256 hex digest of the full API key; used for lookup during authentication';
COMMENT ON COLUMN app.api_keys.key_prefix IS 'First 8 characters of the key (e.g., "sfra_abc") for display identification';
COMMENT ON COLUMN app.api_keys.scopes IS 'JSON array of permission scopes granted to this key (e.g., ["hr:read", "time:read"])';
COMMENT ON COLUMN app.api_keys.expires_at IS 'Optional expiry timestamp; NULL means the key never expires';
COMMENT ON COLUMN app.api_keys.last_used_at IS 'Timestamp of the most recent successful authentication using this key';
COMMENT ON COLUMN app.api_keys.revoked_at IS 'Timestamp when the key was revoked; NULL means the key is active';
COMMENT ON COLUMN app.api_keys.created_by IS 'User ID of the person who created this API key';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON app.api_keys;
-- DROP TABLE IF EXISTS app.api_keys;
