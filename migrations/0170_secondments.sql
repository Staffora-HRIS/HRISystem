-- Migration: 0170_secondments.sql
-- Description: Secondment management (internal and external)
-- Tables: secondments

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE app.secondment_status AS ENUM (
  'proposed', 'approved', 'active', 'extended', 'completed', 'cancelled'
);

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE app.secondments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  employee_id       uuid NOT NULL,
  from_org_unit_id  uuid NOT NULL,
  to_org_unit_id    uuid NOT NULL,
  to_external_org   varchar(255),
  start_date        date NOT NULL,
  expected_end_date date NOT NULL,
  actual_end_date   date,
  reason            text,
  terms             text,
  status            app.secondment_status NOT NULL DEFAULT 'proposed',
  approved_by       uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_secondments_tenant ON app.secondments(tenant_id);
CREATE INDEX idx_secondments_employee ON app.secondments(tenant_id, employee_id);
CREATE INDEX idx_secondments_status ON app.secondments(tenant_id, status);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE app.secondments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.secondments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.secondments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.secondments
  USING (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.secondments TO hris_app;

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.secondments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
