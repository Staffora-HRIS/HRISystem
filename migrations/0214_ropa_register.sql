-- Migration: 0214_ropa_register
-- Created: 2026-03-19
-- Description: Records of Processing Activities (ROPA) register for UK GDPR Article 30 compliance
--
-- UK GDPR Article 30 requires controllers and processors to maintain a register
-- of processing activities. This register must contain:
-- - Name and contact details of the controller
-- - Purposes of processing
-- - Categories of data subjects and personal data
-- - Categories of recipients
-- - International transfers and safeguards
-- - Retention periods
-- - Technical and organisational security measures
-- - Whether a DPIA is required
--
-- The ICO may request this register at any time, so it must be exportable as CSV.
--
-- Status lifecycle:
--   active   -- Processing activity is current and ongoing
--   archived -- Processing activity is no longer active (retained for audit)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: Lawful basis for processing (UK GDPR Article 6(1))
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ropa_lawful_basis' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.ropa_lawful_basis AS ENUM (
      'consent',
      'contract',
      'legal_obligation',
      'vital_interest',
      'public_task',
      'legitimate_interest'
    );
  END IF;
END
$$;

-- Enum: Processing activity status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ropa_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.ropa_status AS ENUM ('active', 'archived');
  END IF;
END
$$;

-- =============================================================================
-- Table: processing_activities
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.processing_activities (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Activity identification
    name varchar(255) NOT NULL,
    description text,

    -- Purpose and legal basis (Article 30(1)(b))
    purpose text NOT NULL,
    lawful_basis app.ropa_lawful_basis NOT NULL,

    -- Categories of data subjects and personal data (Article 30(1)(c))
    data_categories text[] NOT NULL DEFAULT '{}',
    data_subjects text[] NOT NULL DEFAULT '{}',

    -- Categories of recipients (Article 30(1)(d))
    recipients text[] NOT NULL DEFAULT '{}',

    -- Retention period (Article 30(1)(f))
    retention_period varchar(255),

    -- International transfers (Article 30(1)(e))
    international_transfers boolean NOT NULL DEFAULT false,
    transfer_safeguards text,

    -- Security measures (Article 30(1)(g))
    technical_measures text[] NOT NULL DEFAULT '{}',
    organisational_measures text[] NOT NULL DEFAULT '{}',

    -- DPIA (Data Protection Impact Assessment) linkage
    dpia_required boolean NOT NULL DEFAULT false,
    dpia_id uuid,

    -- Status
    status app.ropa_status NOT NULL DEFAULT 'active',

    -- Review tracking (periodic review is best practice)
    reviewed_at timestamptz,
    reviewed_by uuid,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE app.processing_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.processing_activities
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.processing_activities
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_processing_activities_tenant
  ON app.processing_activities (tenant_id);

CREATE INDEX IF NOT EXISTS idx_processing_activities_status
  ON app.processing_activities (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_processing_activities_lawful_basis
  ON app.processing_activities (tenant_id, lawful_basis);

CREATE INDEX IF NOT EXISTS idx_processing_activities_dpia
  ON app.processing_activities (tenant_id, dpia_required)
  WHERE dpia_required = true;

CREATE INDEX IF NOT EXISTS idx_processing_activities_review
  ON app.processing_activities (tenant_id, reviewed_at)
  WHERE status = 'active';

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE OR REPLACE TRIGGER trg_processing_activities_updated_at
  BEFORE UPDATE ON app.processing_activities
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.processing_activities TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.processing_activities;
-- DROP TYPE IF EXISTS app.ropa_status;
-- DROP TYPE IF EXISTS app.ropa_lawful_basis;
