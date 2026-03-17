-- Migration: 0198_policy_distributions
-- Created: 2026-03-17
-- Description: Policy document distribution with read receipts (TODO-213).
--              Enables HR to distribute policy documents to targeted departments
--              or all employees, and track individual acknowledgements.
--
--              Tables:
--              - policy_distributions: Distribution records linking to a document
--              - policy_acknowledgements: Per-employee read receipts
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- policy_distributions - Tracks each distribution event
-- -----------------------------------------------------------------------------
-- A distribution represents a single act of pushing a policy document
-- to a set of employees. The targeting can be department-based (JSONB array
-- of department IDs) or organisation-wide (target_all = true).

CREATE TABLE IF NOT EXISTS app.policy_distributions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,

  -- The document being distributed (FK to documents table if it exists)
  document_id           uuid NOT NULL,

  -- Human-readable title for the distribution (may differ from document title)
  title                 text NOT NULL,

  -- Distribution metadata
  distributed_at        timestamptz NOT NULL DEFAULT now(),
  distributed_by        uuid NOT NULL,

  -- Targeting
  target_departments    jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_all            boolean NOT NULL DEFAULT false,

  -- Audit fields
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.policy_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.policy_distributions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.policy_distributions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.policy_distributions
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.policy_distributions
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_distributions_tenant_id
  ON app.policy_distributions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_policy_distributions_tenant_document
  ON app.policy_distributions (tenant_id, document_id);

CREATE INDEX IF NOT EXISTS idx_policy_distributions_distributed_at
  ON app.policy_distributions (tenant_id, distributed_at DESC);

-- -----------------------------------------------------------------------------
-- policy_acknowledgements - Per-employee read receipts
-- -----------------------------------------------------------------------------
-- Each row records that a specific employee has acknowledged a specific
-- distribution. The (distribution_id, employee_id) pair must be unique
-- to prevent duplicate acknowledgements.

CREATE TABLE IF NOT EXISTS app.policy_acknowledgements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,

  -- Links to the distribution
  distribution_id       uuid NOT NULL REFERENCES app.policy_distributions(id) ON DELETE CASCADE,

  -- The employee acknowledging
  employee_id           uuid NOT NULL,

  -- When and from where
  acknowledged_at       timestamptz NOT NULL DEFAULT now(),
  ip_address            inet,

  -- Audit fields
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate acknowledgements
  CONSTRAINT uq_policy_ack_distribution_employee UNIQUE (distribution_id, employee_id)
);

-- RLS
ALTER TABLE app.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.policy_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.policy_acknowledgements
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.policy_acknowledgements
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.policy_acknowledgements
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_ack_tenant_id
  ON app.policy_acknowledgements (tenant_id);

CREATE INDEX IF NOT EXISTS idx_policy_ack_distribution_id
  ON app.policy_acknowledgements (tenant_id, distribution_id);

CREATE INDEX IF NOT EXISTS idx_policy_ack_employee_id
  ON app.policy_acknowledgements (tenant_id, employee_id);

-- =============================================================================
-- GRANT permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.policy_distributions TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.policy_acknowledgements TO hris_app;

-- =============================================================================
-- DOWN Migration (reversible)
-- =============================================================================

-- To reverse:
-- DROP TABLE IF EXISTS app.policy_acknowledgements;
-- DROP TABLE IF EXISTS app.policy_distributions;
