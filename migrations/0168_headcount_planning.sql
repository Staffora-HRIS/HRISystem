-- Migration: 0168_headcount_planning.sql
-- Description: Headcount planning tables for workforce planning
-- Tables: headcount_plans, headcount_plan_items

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE app.headcount_plan_status AS ENUM ('draft', 'active', 'approved', 'closed');
CREATE TYPE app.headcount_item_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE app.headcount_item_status AS ENUM ('open', 'approved', 'filled', 'cancelled');

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE app.headcount_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),
  name          varchar(255) NOT NULL,
  financial_year varchar(9) NOT NULL,  -- e.g. '2025/2026'
  status        app.headcount_plan_status NOT NULL DEFAULT 'draft',
  created_by    uuid,
  approved_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.headcount_plan_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  plan_id           uuid NOT NULL REFERENCES app.headcount_plans(id) ON DELETE CASCADE,
  org_unit_id       uuid NOT NULL,
  position_id       uuid,
  job_id            uuid,
  current_headcount integer NOT NULL DEFAULT 0,
  planned_headcount integer NOT NULL DEFAULT 0,
  variance          integer GENERATED ALWAYS AS (planned_headcount - current_headcount) STORED,
  justification     text,
  priority          app.headcount_item_priority NOT NULL DEFAULT 'medium',
  status            app.headcount_item_status NOT NULL DEFAULT 'open',
  target_fill_date  date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_headcount_plans_tenant ON app.headcount_plans(tenant_id);
CREATE INDEX idx_headcount_plans_status ON app.headcount_plans(tenant_id, status);
CREATE INDEX idx_headcount_plan_items_plan ON app.headcount_plan_items(plan_id);
CREATE INDEX idx_headcount_plan_items_tenant ON app.headcount_plan_items(tenant_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE app.headcount_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.headcount_plan_items ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.headcount_plans
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.headcount_plans
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON app.headcount_plan_items
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.headcount_plan_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass
CREATE POLICY system_bypass ON app.headcount_plans
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass ON app.headcount_plan_items
  USING (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.headcount_plans TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.headcount_plan_items TO hris_app;

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.headcount_plans
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
