-- Migration: 0194_payroll_rti_submissions
-- Created: 2026-03-17
-- Description: Add RTI submission tracking table for PAYE/FPS/EPS submissions.
--              Tracks when a payroll run's data is submitted to HMRC (via external provider).
--              Also adds submitted_to_hmrc_at column to payroll_runs for quick lookup.
--
--              This supports:
--              - POST /payroll/runs/:runId/submit — mark a payroll run as submitted
--              - GET /payroll/rti/fps — generate Full Payment Submission data
--              - GET /payroll/rti/eps — generate Employer Payment Summary data

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: rti_submission_type
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.rti_submission_type AS ENUM (
    'fps',
    'eps',
    'nvr',
    'eas'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.rti_submission_type IS 'HMRC RTI submission types: FPS (Full Payment Submission), EPS (Employer Payment Summary), NVR (National Insurance Verification Request), EAS (Earlier Year Update)';

-- -----------------------------------------------------------------------------
-- Enum: rti_submission_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.rti_submission_status AS ENUM (
    'draft',
    'generated',
    'submitted',
    'accepted',
    'rejected',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.rti_submission_status IS 'RTI submission lifecycle: draft -> generated -> submitted -> accepted/rejected/error';

-- -----------------------------------------------------------------------------
-- Table: payroll_rti_submissions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.payroll_rti_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  payroll_run_id        uuid NOT NULL REFERENCES app.payroll_runs(id) ON DELETE CASCADE,

  -- Submission type and status
  submission_type       app.rti_submission_type NOT NULL,
  status                app.rti_submission_status NOT NULL DEFAULT 'draft',

  -- Tax period info
  tax_year              varchar(7) NOT NULL,   -- e.g. '2025-26'
  tax_month             int,                   -- 1-12 for monthly
  tax_week              int,                   -- 1-53 for weekly

  -- HMRC reference data
  employer_paye_ref     varchar(20),           -- Employer PAYE reference (e.g. 123/AB12345)
  accounts_office_ref   varchar(20),           -- Accounts Office Reference

  -- Submission data (JSON payload that was/would be sent)
  submission_data       jsonb NOT NULL DEFAULT '{}',

  -- HMRC response data
  hmrc_correlation_id   varchar(100),          -- HMRC correlation ID from response
  hmrc_response         jsonb,                 -- Full HMRC response

  -- Timestamps
  generated_at          timestamptz,
  submitted_at          timestamptz,
  response_at           timestamptz,

  -- Audit
  generated_by          uuid,
  submitted_by          uuid,
  notes                 text,

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.payroll_rti_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.payroll_rti_submissions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.payroll_rti_submissions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_rti_submissions_tenant
  ON app.payroll_rti_submissions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_rti_submissions_run
  ON app.payroll_rti_submissions (payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_payroll_rti_submissions_tenant_type_year
  ON app.payroll_rti_submissions (tenant_id, submission_type, tax_year);

CREATE INDEX IF NOT EXISTS idx_payroll_rti_submissions_tenant_status
  ON app.payroll_rti_submissions (tenant_id, status);

-- Updated_at trigger
CREATE TRIGGER trg_payroll_rti_submissions_updated_at
  BEFORE UPDATE ON app.payroll_rti_submissions
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.payroll_rti_submissions IS 'Tracks RTI submissions to HMRC (FPS, EPS) per payroll run';
COMMENT ON COLUMN app.payroll_rti_submissions.submission_type IS 'Type of RTI submission: fps, eps, nvr, eas';
COMMENT ON COLUMN app.payroll_rti_submissions.tax_year IS 'UK tax year in format YYYY-YY (e.g. 2025-26)';
COMMENT ON COLUMN app.payroll_rti_submissions.tax_month IS 'Tax month (1-12) within the tax year';
COMMENT ON COLUMN app.payroll_rti_submissions.employer_paye_ref IS 'Employer PAYE reference assigned by HMRC';
COMMENT ON COLUMN app.payroll_rti_submissions.submission_data IS 'JSON payload representing the FPS/EPS data structure';
COMMENT ON COLUMN app.payroll_rti_submissions.hmrc_correlation_id IS 'Correlation ID returned by HMRC on submission';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_payroll_rti_submissions_updated_at ON app.payroll_rti_submissions;
-- DROP TABLE IF EXISTS app.payroll_rti_submissions;
-- DROP TYPE IF EXISTS app.rti_submission_status;
-- DROP TYPE IF EXISTS app.rti_submission_type;
