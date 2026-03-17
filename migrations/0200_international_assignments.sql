-- Migration: 0200_international_assignments.sql
-- Description: Global mobility / international assignment tracking
-- Tables: international_assignments

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE app.international_assignment_type AS ENUM (
  'short_term', 'long_term', 'permanent_transfer', 'commuter'
);

CREATE TYPE app.international_assignment_status AS ENUM (
  'planned', 'active', 'completed', 'cancelled'
);

CREATE TYPE app.visa_status AS ENUM (
  'not_required', 'pending', 'approved', 'denied', 'expired'
);

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE app.international_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id),
  employee_id           uuid NOT NULL,
  assignment_type       app.international_assignment_type NOT NULL,
  home_country          varchar(2) NOT NULL,
  host_country          varchar(2) NOT NULL,
  start_date            date NOT NULL,
  end_date              date,
  tax_equalisation      boolean NOT NULL DEFAULT false,
  housing_allowance     numeric(12,2),
  relocation_package    jsonb,
  visa_status           app.visa_status NOT NULL DEFAULT 'not_required',
  status                app.international_assignment_status NOT NULL DEFAULT 'planned',
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_country_codes CHECK (
    home_country ~ '^[A-Z]{2}$' AND host_country ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT chk_different_countries CHECK (home_country <> host_country),
  CONSTRAINT chk_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_housing_allowance CHECK (housing_allowance IS NULL OR housing_allowance >= 0)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_intl_assignments_tenant ON app.international_assignments(tenant_id);
CREATE INDEX idx_intl_assignments_employee ON app.international_assignments(tenant_id, employee_id);
CREATE INDEX idx_intl_assignments_status ON app.international_assignments(tenant_id, status);
CREATE INDEX idx_intl_assignments_dates ON app.international_assignments(tenant_id, start_date, end_date);
CREATE INDEX idx_intl_assignments_host_country ON app.international_assignments(tenant_id, host_country);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE app.international_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.international_assignments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.international_assignments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.international_assignments
  USING (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.international_assignments TO hris_app;

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.international_assignments
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
