-- Migration: 0199_tribunal_cases.sql
-- Description: Create tribunal_cases table for employment tribunal preparation tracking
-- Reversible: Yes (see DOWN section at bottom)

-- =============================================================================
-- UP
-- =============================================================================

-- Tribunal case status enum
CREATE TYPE app.tribunal_case_status AS ENUM (
  'preparation',
  'submitted',
  'hearing',
  'decided'
);

-- Tribunal claim type enum (common UK employment tribunal claim types)
CREATE TYPE app.tribunal_claim_type AS ENUM (
  'unfair_dismissal',
  'constructive_dismissal',
  'wrongful_dismissal',
  'discrimination',
  'harassment',
  'victimisation',
  'equal_pay',
  'redundancy_payment',
  'breach_of_contract',
  'whistleblowing_detriment',
  'working_time',
  'unlawful_deduction_wages',
  'tupe',
  'trade_union',
  'other'
);

-- Tribunal cases table
CREATE TABLE app.tribunal_cases (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES app.tenants(id),
  case_id                   uuid REFERENCES app.cases(id),
  employee_id               uuid NOT NULL REFERENCES app.employees(id),
  tribunal_reference        text,
  hearing_date              date,
  claim_type                app.tribunal_claim_type NOT NULL,
  respondent_representative text,
  claimant_representative   text,
  documents                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                    app.tribunal_case_status NOT NULL DEFAULT 'preparation',
  outcome                   text,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tribunal_cases_tenant_id ON app.tribunal_cases (tenant_id);
CREATE INDEX idx_tribunal_cases_employee_id ON app.tribunal_cases (employee_id);
CREATE INDEX idx_tribunal_cases_case_id ON app.tribunal_cases (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_tribunal_cases_status ON app.tribunal_cases (status);
CREATE INDEX idx_tribunal_cases_hearing_date ON app.tribunal_cases (hearing_date) WHERE hearing_date IS NOT NULL;
CREATE INDEX idx_tribunal_cases_tribunal_reference ON app.tribunal_cases (tribunal_reference) WHERE tribunal_reference IS NOT NULL;

-- Row-Level Security
ALTER TABLE app.tribunal_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.tribunal_cases
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.tribunal_cases
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/system operations)
CREATE POLICY system_bypass ON app.tribunal_cases
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.tribunal_cases
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.tribunal_cases TO hris_app;

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.tribunal_cases
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at();

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- DROP TRIGGER IF EXISTS set_updated_at ON app.tribunal_cases;
-- DROP TABLE IF EXISTS app.tribunal_cases;
-- DROP TYPE IF EXISTS app.tribunal_claim_type;
-- DROP TYPE IF EXISTS app.tribunal_case_status;
