-- Migration: 0195_ir35_assessments
-- Created: 2026-03-17
-- Description: IR35 off-payroll working compliance tables
--
-- Since April 2021, medium and large employers (end-clients) in the UK must
-- determine the IR35 status of every contractor engagement. The end-client is
-- responsible for issuing a Status Determination Statement (SDS) with reasons.
--
-- If a contractor is determined to be "inside IR35", the fee-payer (often an
-- agency or the client itself) must deduct tax and NICs at source.
--
-- This migration creates tables to track:
--   - IR35 status determinations per contractor/engagement
--   - The SDS reasoning (mandatory under off-payroll working rules)
--   - Disputes raised by contractors (they have a legal right to dispute)
--
-- Status determination values:
--   inside      - Engagement is inside IR35 (tax/NICs deducted at source)
--   outside     - Engagement is outside IR35 (contractor manages own tax)
--   undetermined - Assessment not yet completed
--
-- Dispute status values:
--   none        - No dispute raised
--   pending     - Contractor has raised a dispute, awaiting review
--   upheld      - Dispute upheld, determination changed
--   rejected    - Dispute reviewed and rejected, determination stands

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: IR35 status determination
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ir35_status_determination' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.ir35_status_determination AS ENUM ('inside', 'outside', 'undetermined');
  END IF;
END
$$;

-- Enum: IR35 dispute status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ir35_dispute_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.ir35_dispute_status AS ENUM ('none', 'pending', 'upheld', 'rejected');
  END IF;
END
$$;

-- =============================================================================
-- Table: ir35_assessments
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.ir35_assessments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Contractor being assessed (references the employee/contractor record)
    contractor_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Engagement identifier (e.g. contract reference, PO number)
    -- Allows multiple assessments per contractor for different engagements
    engagement_id varchar(255) NOT NULL,

    -- Assessment details
    assessment_date date NOT NULL,
    status_determination app.ir35_status_determination NOT NULL DEFAULT 'undetermined',

    -- Status Determination Statement (SDS) - mandatory under off-payroll rules
    -- Stores the structured reasons for the determination
    determination_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Who performed the assessment
    assessor_id uuid NOT NULL,

    -- Under off-payroll rules, the client (end-user) must make the determination
    -- for medium/large organisations. Small companies are exempt.
    client_led boolean NOT NULL DEFAULT true,

    -- Dispute handling (contractors have a legal right to dispute the SDS)
    dispute_status app.ir35_dispute_status NOT NULL DEFAULT 'none',
    dispute_reason text,

    -- Review tracking
    reviewed_at timestamptz,

    -- Audit timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.ir35_assessments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.ir35_assessments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.ir35_assessments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Grant table permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.ir35_assessments TO hris_app;

-- Indexes
CREATE INDEX idx_ir35_assessments_tenant_contractor ON app.ir35_assessments (tenant_id, contractor_id);
CREATE INDEX idx_ir35_assessments_tenant_status ON app.ir35_assessments (tenant_id, status_determination);
CREATE INDEX idx_ir35_assessments_tenant_dispute ON app.ir35_assessments (tenant_id, dispute_status)
    WHERE dispute_status != 'none';
CREATE INDEX idx_ir35_assessments_tenant_engagement ON app.ir35_assessments (tenant_id, engagement_id);
CREATE INDEX idx_ir35_assessments_tenant_created ON app.ir35_assessments (tenant_id, created_at DESC);
CREATE INDEX idx_ir35_assessments_assessment_date ON app.ir35_assessments (tenant_id, assessment_date DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_ir35_assessments_updated_at
    BEFORE UPDATE ON app.ir35_assessments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (commented out — run manually to rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_ir35_assessments_updated_at ON app.ir35_assessments;
-- DROP INDEX IF EXISTS app.idx_ir35_assessments_assessment_date;
-- DROP INDEX IF EXISTS app.idx_ir35_assessments_tenant_created;
-- DROP INDEX IF EXISTS app.idx_ir35_assessments_tenant_engagement;
-- DROP INDEX IF EXISTS app.idx_ir35_assessments_tenant_dispute;
-- DROP INDEX IF EXISTS app.idx_ir35_assessments_tenant_status;
-- DROP INDEX IF EXISTS app.idx_ir35_assessments_tenant_contractor;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.ir35_assessments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.ir35_assessments;
-- DROP TABLE IF EXISTS app.ir35_assessments;
-- DROP TYPE IF EXISTS app.ir35_dispute_status;
-- DROP TYPE IF EXISTS app.ir35_status_determination;
