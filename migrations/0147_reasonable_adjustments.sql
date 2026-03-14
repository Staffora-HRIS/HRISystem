-- Migration: 0147_reasonable_adjustments
-- Created: 2026-03-13
-- Description: Reasonable Adjustments tracking for Equality Act 2010 compliance.
--              Employers have a duty to make reasonable adjustments for disabled
--              employees and job applicants (Equality Act 2010, ss.20-22).
--              This covers adjustments to:
--              - Physical workspace and premises
--              - Equipment and assistive technology
--              - Working hours and patterns
--              - Duties and role modifications
--              - Communication methods and formats
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Adjustment request lifecycle:
--   requested -> under_review -> approved -> implemented
--                             -> rejected
--   (withdrawn can occur from requested or under_review)
DO $$ BEGIN
  CREATE TYPE app.adjustment_status AS ENUM (
    'requested',
    'under_review',
    'approved',
    'implemented',
    'rejected',
    'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- reasonable_adjustments
-- -----------------------------------------------------------------------------
-- Tracks reasonable adjustment requests, assessments, decisions, and
-- implementation for disabled employees under the Equality Act 2010.
-- Each record follows a lifecycle from request through assessment to
-- decision and implementation, with optional periodic review dates.

CREATE TABLE IF NOT EXISTS app.reasonable_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  employee_id     uuid NOT NULL REFERENCES app.employees(id),

  -- Request details
  requested_date  date NOT NULL,
  requested_by    varchar(50) NOT NULL CHECK (requested_by IN ('employee', 'manager', 'occupational_health')),
  description     text NOT NULL,
  reason          text,
  category        varchar(100) NOT NULL CHECK (category IN ('physical_workspace', 'equipment', 'working_hours', 'duties', 'communication', 'other')),
  status          app.adjustment_status NOT NULL DEFAULT 'requested',

  -- Assessment phase
  assessment_date       date,
  assessed_by           uuid,
  assessment_notes      text,

  -- Decision phase
  decision_date         date,
  decided_by            uuid,
  rejection_reason      text,

  -- Implementation phase
  implementation_date   date,
  implementation_notes  text,

  -- Review scheduling
  review_date           date,

  -- Cost tracking
  cost_estimate         numeric(10, 2),
  actual_cost           numeric(10, 2),

  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE app.reasonable_adjustments ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation
  ON app.reasonable_adjustments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation policy for INSERT
CREATE POLICY tenant_isolation_insert
  ON app.reasonable_adjustments
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/migration operations)
CREATE POLICY system_bypass
  ON app.reasonable_adjustments
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert
  ON app.reasonable_adjustments
  FOR INSERT
  WITH CHECK (current_setting('app.system_context', true) = 'true');

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- Primary lookup: adjustments by employee within a tenant
CREATE INDEX IF NOT EXISTS idx_reasonable_adjustments_tenant_employee
  ON app.reasonable_adjustments (tenant_id, employee_id);

-- Filter by status within a tenant (for dashboards and reporting)
CREATE INDEX IF NOT EXISTS idx_reasonable_adjustments_tenant_status
  ON app.reasonable_adjustments (tenant_id, status);

-- Find adjustments due for review
CREATE INDEX IF NOT EXISTS idx_reasonable_adjustments_review_date
  ON app.reasonable_adjustments (tenant_id, review_date)
  WHERE review_date IS NOT NULL AND status = 'implemented';

-- Updated_at for change tracking
CREATE INDEX IF NOT EXISTS idx_reasonable_adjustments_updated_at
  ON app.reasonable_adjustments (updated_at);

-- -----------------------------------------------------------------------------
-- Trigger: auto-update updated_at
-- -----------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER trg_reasonable_adjustments_updated_at
  BEFORE UPDATE ON app.reasonable_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION app.set_updated_at();

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- To rollback:
--   DROP TABLE IF EXISTS app.reasonable_adjustments CASCADE;
--   DROP TYPE IF EXISTS app.adjustment_status;
