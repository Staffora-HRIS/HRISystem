-- Migration: 0191_integrations
-- Created: 2026-03-17
-- Description: Integrations table for managing third-party service connections.
--              Stores configuration (API keys, secrets) per tenant with status tracking,
--              sync timestamps, and category classification.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: integration_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.integration_status AS ENUM (
    'connected',
    'disconnected',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.integration_status IS 'Integration connection status: connected, disconnected, or error';

-- -----------------------------------------------------------------------------
-- Table: integrations
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.integrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,

  -- Integration identity
  provider              varchar(100) NOT NULL,
  name                  varchar(255) NOT NULL,
  description           text,
  category              varchar(100) NOT NULL,

  -- Connection status
  status                app.integration_status NOT NULL DEFAULT 'disconnected',
  last_sync_at          timestamptz,
  error_message         text,

  -- Configuration (encrypted at rest via application layer)
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Webhook URL for inbound events
  webhook_url           text,

  -- Metadata
  enabled               boolean NOT NULL DEFAULT true,
  connected_at          timestamptz,
  connected_by          uuid,
  disconnected_at       timestamptz,

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Unique provider per tenant
  CONSTRAINT uq_integrations_tenant_provider UNIQUE (tenant_id, provider)
);

-- RLS
ALTER TABLE app.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.integrations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.integrations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_tenant
  ON app.integrations (tenant_id);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant_status
  ON app.integrations (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant_category
  ON app.integrations (tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant_provider
  ON app.integrations (tenant_id, provider);

-- Updated_at trigger
CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON app.integrations
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.integrations IS 'Third-party service integrations per tenant with connection status and configuration';
COMMENT ON COLUMN app.integrations.provider IS 'Unique provider key (e.g., azure-ad, slack, docusign)';
COMMENT ON COLUMN app.integrations.name IS 'Human-readable display name for the integration';
COMMENT ON COLUMN app.integrations.category IS 'Integration category (e.g., Identity & SSO, Payroll, Communication)';
COMMENT ON COLUMN app.integrations.status IS 'Current connection status: connected, disconnected, or error';
COMMENT ON COLUMN app.integrations.last_sync_at IS 'Timestamp of last successful data sync';
COMMENT ON COLUMN app.integrations.config IS 'JSON configuration (API keys, secrets) - encrypted at application layer';
COMMENT ON COLUMN app.integrations.webhook_url IS 'Optional webhook URL for inbound events from the provider';
COMMENT ON COLUMN app.integrations.connected_by IS 'User who established the connection';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_integrations_updated_at ON app.integrations;
-- DROP TABLE IF EXISTS app.integrations;
-- DROP TYPE IF EXISTS app.integration_status;
