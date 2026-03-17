-- Migration: 0197_dpia
-- Created: 2026-03-17
-- Description: Data Protection Impact Assessment (DPIA) tracking.
--              Implements UK GDPR Article 35 requirements:
--              - DPIA register for high-risk processing activities
--              - Status workflow: draft -> in_progress -> reviewed -> approved
--              - Risk level classification
--              - DPO opinion tracking
--              - Review date scheduling for periodic re-assessment
--              - Optional link to ROPA (processing_activity_id) for future integration
--
--              A DPIA is required when processing is likely to result in
--              a high risk to individuals' rights and freedoms.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- DPIA status workflow
DO $$ BEGIN
  CREATE TYPE app.dpia_status AS ENUM (
    'draft',
    'in_progress',
    'reviewed',
    'approved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DPIA risk level classification
DO $$ BEGIN
  CREATE TYPE app.dpia_risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'very_high'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- dpias - Data Protection Impact Assessment Register
-- -----------------------------------------------------------------------------
-- Central register of all DPIAs as required by UK GDPR Article 35.
-- Tracks the assessment lifecycle from draft through DPO review to approval.

CREATE TABLE IF NOT EXISTS app.dpias (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL,

  -- Core assessment details
  title                   text NOT NULL,
  description             text,
  processing_activity_id  uuid,  -- FK to ROPA if/when that module exists

  -- Status and risk
  status                  app.dpia_status NOT NULL DEFAULT 'draft',
  risk_level              app.dpia_risk_level NOT NULL DEFAULT 'high',

  -- Assessment content (UK GDPR Article 35(7))
  -- (a) systematic description of processing and purposes
  -- (b) necessity and proportionality assessment
  -- (c) risks to rights and freedoms
  -- (d) measures to address risks
  necessity_assessment    text,
  risk_assessment         jsonb DEFAULT '[]'::jsonb,
  mitigation_measures     jsonb DEFAULT '[]'::jsonb,

  -- DPO review (Article 35(2) - controller shall seek advice of DPO)
  dpo_opinion             text,
  dpo_reviewed_at         timestamptz,

  -- Approval
  approved_by             uuid,
  approved_at             timestamptz,

  -- Periodic review scheduling
  review_date             date,

  -- Audit fields
  created_by              uuid,
  updated_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.dpias ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.dpias
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.dpias
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (matches pattern used by other tables)
CREATE POLICY system_bypass ON app.dpias
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.dpias
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- Tenant-scoped queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_dpias_tenant_id
  ON app.dpias (tenant_id);

-- Status filtering within tenant
CREATE INDEX IF NOT EXISTS idx_dpias_tenant_status
  ON app.dpias (tenant_id, status);

-- Review date queries (due reviews endpoint)
CREATE INDEX IF NOT EXISTS idx_dpias_review_date
  ON app.dpias (tenant_id, review_date)
  WHERE review_date IS NOT NULL;

-- Processing activity link (for ROPA integration)
CREATE INDEX IF NOT EXISTS idx_dpias_processing_activity
  ON app.dpias (tenant_id, processing_activity_id)
  WHERE processing_activity_id IS NOT NULL;

-- Approved date for audit queries
CREATE INDEX IF NOT EXISTS idx_dpias_approved_at
  ON app.dpias (tenant_id, approved_at)
  WHERE approved_at IS NOT NULL;

-- Risk level filtering
CREATE INDEX IF NOT EXISTS idx_dpias_risk_level
  ON app.dpias (tenant_id, risk_level);

-- =============================================================================
-- GRANT permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.dpias TO hris_app;

-- =============================================================================
-- DOWN Migration (reversible)
-- =============================================================================

-- To reverse:
-- DROP TABLE IF EXISTS app.dpias;
-- DROP TYPE IF EXISTS app.dpia_status;
-- DROP TYPE IF EXISTS app.dpia_risk_level;
