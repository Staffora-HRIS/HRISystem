-- Migration: 0169_agencies.sql
-- Description: Recruitment agency management and placement tracking
-- Tables: recruitment_agencies, agency_placements

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE app.agency_fee_type AS ENUM ('percentage', 'fixed');
CREATE TYPE app.agency_status AS ENUM ('active', 'inactive', 'blacklisted');

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE app.recruitment_agencies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),
  name          varchar(255) NOT NULL,
  contact_name  varchar(255),
  email         varchar(255),
  phone         varchar(50),
  website       varchar(500),
  terms_agreed  boolean NOT NULL DEFAULT false,
  fee_type      app.agency_fee_type,
  fee_amount    numeric(12,2),
  preferred     boolean NOT NULL DEFAULT false,
  status        app.agency_status NOT NULL DEFAULT 'active',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.agency_placements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  agency_id         uuid NOT NULL REFERENCES app.recruitment_agencies(id) ON DELETE CASCADE,
  candidate_id      uuid,
  requisition_id    uuid,
  fee_agreed        numeric(12,2),
  fee_paid          boolean NOT NULL DEFAULT false,
  placement_date    date,
  guarantee_end_date date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_recruitment_agencies_tenant ON app.recruitment_agencies(tenant_id);
CREATE INDEX idx_recruitment_agencies_status ON app.recruitment_agencies(tenant_id, status);
CREATE INDEX idx_agency_placements_agency ON app.agency_placements(agency_id);
CREATE INDEX idx_agency_placements_tenant ON app.agency_placements(tenant_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE app.recruitment_agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agency_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.recruitment_agencies
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.recruitment_agencies
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON app.agency_placements
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.agency_placements
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.recruitment_agencies
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass ON app.agency_placements
  USING (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.recruitment_agencies TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.agency_placements TO hris_app;

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.recruitment_agencies
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
