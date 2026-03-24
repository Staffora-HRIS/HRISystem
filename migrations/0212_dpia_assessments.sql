-- Migration: 0212_dpia_assessments.sql
-- Created: 2026-03-19
-- Description: Create DPIA (Data Protection Impact Assessment) tables for
--              UK GDPR Article 35 compliance. Implements:
--              - DPIA assessment register with status workflow
--              - Individual risk register per DPIA with scoring
--              - DPO opinion tracking and approval workflow
--              - Review date scheduling for periodic reassessment
--              State machine: draft -> in_review -> approved / rejected
-- Reversible: Yes (see DOWN section at bottom)

-- =============================================================================
-- UP
-- =============================================================================

-- DPIA status enum
CREATE TYPE app.dpia_status AS ENUM (
  'draft',
  'in_review',
  'approved',
  'rejected'
);

-- Risk likelihood / impact enum
CREATE TYPE app.dpia_risk_level AS ENUM (
  'low',
  'medium',
  'high'
);

-- =============================================================================
-- Main DPIA assessments table
-- =============================================================================

CREATE TABLE app.dpia_assessments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES app.tenants(id),

  -- Processing activity reference (nullable; not all tenants track processing activities)
  processing_activity_id    uuid,

  -- Assessment details
  title                     varchar(255) NOT NULL,
  description               text,

  -- UK GDPR Article 35(7)(a): systematic description of processing and purposes
  necessity_assessment      text,

  -- UK GDPR Article 35(7)(b-c): risk assessment and mitigation
  risk_assessment           jsonb DEFAULT '{}',
  mitigation_measures       jsonb DEFAULT '[]',

  -- DPO opinion (UK GDPR Article 35(2))
  dpo_opinion               text,

  -- Status workflow: draft -> in_review -> approved / rejected
  status                    app.dpia_status NOT NULL DEFAULT 'draft',

  -- Approval details
  approved_by               uuid REFERENCES app.users(id),
  approved_at               timestamptz,

  -- Periodic review scheduling
  review_date               date,

  -- Audit columns
  created_by                uuid REFERENCES app.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dpia_assessments_tenant_id
  ON app.dpia_assessments (tenant_id);

CREATE INDEX idx_dpia_assessments_status
  ON app.dpia_assessments (tenant_id, status);

CREATE INDEX idx_dpia_assessments_review_date
  ON app.dpia_assessments (tenant_id, review_date)
  WHERE review_date IS NOT NULL;

CREATE INDEX idx_dpia_assessments_processing_activity
  ON app.dpia_assessments (tenant_id, processing_activity_id)
  WHERE processing_activity_id IS NOT NULL;

CREATE INDEX idx_dpia_assessments_created_at
  ON app.dpia_assessments (tenant_id, created_at DESC);

-- Row-Level Security
ALTER TABLE app.dpia_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.dpia_assessments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.dpia_assessments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.dpia_assessments
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.dpia_assessments
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.dpia_assessments TO hris_app;

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.dpia_assessments
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DPIA risk register (child risks per DPIA)
-- =============================================================================

CREATE TABLE app.dpia_risks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id),
  dpia_id               uuid NOT NULL REFERENCES app.dpia_assessments(id) ON DELETE CASCADE,

  -- Risk details
  risk_description      text NOT NULL,
  likelihood            app.dpia_risk_level NOT NULL DEFAULT 'medium',
  impact                app.dpia_risk_level NOT NULL DEFAULT 'medium',
  risk_score            integer NOT NULL DEFAULT 0
    CONSTRAINT dpia_risk_score_range CHECK (risk_score >= 0 AND risk_score <= 9),

  -- Mitigation and residual risk
  mitigation            text,
  residual_risk         app.dpia_risk_level NOT NULL DEFAULT 'low',

  -- Audit columns
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dpia_risks_tenant_id
  ON app.dpia_risks (tenant_id);

CREATE INDEX idx_dpia_risks_dpia_id
  ON app.dpia_risks (dpia_id);

CREATE INDEX idx_dpia_risks_risk_score
  ON app.dpia_risks (dpia_id, risk_score DESC);

-- Row-Level Security
ALTER TABLE app.dpia_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.dpia_risks
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.dpia_risks
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.dpia_risks
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.dpia_risks
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.dpia_risks TO hris_app;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- DROP TRIGGER IF EXISTS set_updated_at ON app.dpia_assessments;
-- DROP TABLE IF EXISTS app.dpia_risks;
-- DROP TABLE IF EXISTS app.dpia_assessments;
-- DROP TYPE IF EXISTS app.dpia_risk_level;
-- DROP TYPE IF EXISTS app.dpia_status;
