-- Migration: 0142_privacy_notices
-- Created: 2026-03-13
-- Description: Privacy notice management for UK GDPR compliance.
--              Implements:
--              - Privacy notice versions (privacy_notices)
--              - Employee acknowledgements (privacy_notice_acknowledgements)
--
--              UK GDPR requires employers to provide clear privacy notices
--              to employees explaining how their personal data is processed.
--              Notices must be versioned and employees must acknowledge receipt.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- privacy_notices
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.privacy_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  title           varchar(255) NOT NULL,
  version         int NOT NULL DEFAULT 1,
  content         text NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  is_current      boolean NOT NULL DEFAULT true,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE app.privacy_notices ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.privacy_notices
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.privacy_notices
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/migration use)
CREATE POLICY system_bypass ON app.privacy_notices
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.privacy_notices
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX idx_privacy_notices_tenant_current
  ON app.privacy_notices (tenant_id, is_current);

CREATE INDEX idx_privacy_notices_tenant_effective
  ON app.privacy_notices (tenant_id, effective_from, effective_to);

-- Updated-at trigger
CREATE TRIGGER set_privacy_notices_updated_at
  BEFORE UPDATE ON app.privacy_notices
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- privacy_notice_acknowledgements
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.privacy_notice_acknowledgements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id),
  privacy_notice_id   uuid NOT NULL REFERENCES app.privacy_notices(id),
  employee_id         uuid NOT NULL REFERENCES app.employees(id),
  acknowledged_at     timestamptz NOT NULL DEFAULT now(),
  ip_address          varchar(45),
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE app.privacy_notice_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.privacy_notice_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.privacy_notice_acknowledgements
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass
CREATE POLICY system_bypass ON app.privacy_notice_acknowledgements
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.privacy_notice_acknowledgements
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Unique constraint: one acknowledgement per employee per notice
CREATE UNIQUE INDEX idx_privacy_notice_ack_unique
  ON app.privacy_notice_acknowledgements (tenant_id, privacy_notice_id, employee_id);

-- Lookup index for employee acknowledgements
CREATE INDEX idx_privacy_notice_ack_employee
  ON app.privacy_notice_acknowledgements (tenant_id, employee_id);

-- Updated-at trigger
CREATE TRIGGER set_privacy_notice_ack_updated_at
  BEFORE UPDATE ON app.privacy_notice_acknowledgements
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.privacy_notices TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.privacy_notice_acknowledgements TO hris_app;

-- =============================================================================
-- DOWN Migration
-- =============================================================================

-- DROP TABLE IF EXISTS app.privacy_notice_acknowledgements;
-- DROP TABLE IF EXISTS app.privacy_notices;
