-- Migration: 0200_benefits_data_exchanges.sql
-- Description: Create benefits_data_exchanges table for tracking provider data exchange files
-- Reversible: Yes (see DOWN section at bottom)

-- =============================================================================
-- UP
-- =============================================================================

-- Exchange type enum
CREATE TYPE app.benefits_exchange_type AS ENUM (
  'enrollment',
  'termination',
  'change'
);

-- Exchange direction enum
CREATE TYPE app.benefits_exchange_direction AS ENUM (
  'outbound',
  'inbound'
);

-- Exchange file format enum
CREATE TYPE app.benefits_exchange_file_format AS ENUM (
  'csv',
  'xml',
  'json'
);

-- Exchange status enum
CREATE TYPE app.benefits_exchange_status AS ENUM (
  'pending',
  'sent',
  'acknowledged',
  'error'
);

-- Benefits data exchanges table
CREATE TABLE app.benefits_data_exchanges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  provider_id       uuid NOT NULL REFERENCES app.benefit_carriers(id),
  exchange_type     app.benefits_exchange_type NOT NULL,
  direction         app.benefits_exchange_direction NOT NULL,
  file_format       app.benefits_exchange_file_format NOT NULL,
  status            app.benefits_exchange_status NOT NULL DEFAULT 'pending',
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at           timestamptz,
  acknowledged_at   timestamptz,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_benefits_data_exchanges_tenant_id
  ON app.benefits_data_exchanges (tenant_id);

CREATE INDEX idx_benefits_data_exchanges_provider_id
  ON app.benefits_data_exchanges (provider_id);

CREATE INDEX idx_benefits_data_exchanges_status
  ON app.benefits_data_exchanges (tenant_id, status);

CREATE INDEX idx_benefits_data_exchanges_direction
  ON app.benefits_data_exchanges (tenant_id, direction);

CREATE INDEX idx_benefits_data_exchanges_created_at
  ON app.benefits_data_exchanges (tenant_id, created_at DESC);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.benefits_data_exchanges ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.benefits_data_exchanges
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.benefits_data_exchanges
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/system operations)
CREATE POLICY system_bypass ON app.benefits_data_exchanges
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.benefits_data_exchanges
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.benefits_data_exchanges TO hris_app;

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.benefits_data_exchanges
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.benefits_data_exchanges IS 'Tracks data exchange files between Staffora and benefits providers (carriers)';
COMMENT ON COLUMN app.benefits_data_exchanges.provider_id IS 'FK to benefit_carriers — the provider this exchange is with';
COMMENT ON COLUMN app.benefits_data_exchanges.exchange_type IS 'enrollment, termination, or change';
COMMENT ON COLUMN app.benefits_data_exchanges.direction IS 'outbound (to provider) or inbound (from provider)';
COMMENT ON COLUMN app.benefits_data_exchanges.file_format IS 'csv, xml, or json';
COMMENT ON COLUMN app.benefits_data_exchanges.payload IS 'The exchange payload (file content or structured data)';
COMMENT ON COLUMN app.benefits_data_exchanges.sent_at IS 'When an outbound file was sent';
COMMENT ON COLUMN app.benefits_data_exchanges.acknowledged_at IS 'When the provider acknowledged receipt';
COMMENT ON COLUMN app.benefits_data_exchanges.error_message IS 'Error details if status is error';

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- DROP TRIGGER IF EXISTS set_updated_at ON app.benefits_data_exchanges;
-- DROP TABLE IF EXISTS app.benefits_data_exchanges;
-- DROP TYPE IF EXISTS app.benefits_exchange_status;
-- DROP TYPE IF EXISTS app.benefits_exchange_file_format;
-- DROP TYPE IF EXISTS app.benefits_exchange_direction;
-- DROP TYPE IF EXISTS app.benefits_exchange_type;
