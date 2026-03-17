-- Migration: 0195_whistleblowing_cases.sql
-- Description: Whistleblowing case management with PIDA protections
-- Supports anonymous reporting, confidentiality levels, and designated officer access
-- UK Public Interest Disclosure Act 1998 (PIDA) compliance

-- =============================================================================
-- Enum Types
-- =============================================================================

CREATE TYPE app.whistleblowing_confidentiality_level AS ENUM (
  'confidential',
  'anonymous'
);

CREATE TYPE app.whistleblowing_category AS ENUM (
  'fraud',
  'health_and_safety',
  'environmental',
  'criminal_offence',
  'miscarriage_of_justice',
  'breach_of_legal_obligation',
  'cover_up',
  'other'
);

CREATE TYPE app.whistleblowing_status AS ENUM (
  'submitted',
  'under_review',
  'investigating',
  'resolved',
  'dismissed',
  'closed'
);

-- =============================================================================
-- Main Table: whistleblowing_cases
-- =============================================================================

CREATE TABLE app.whistleblowing_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  -- Reporter: nullable for anonymous reports
  reporter_id uuid REFERENCES app.employees(id),
  -- Classification
  category app.whistleblowing_category NOT NULL,
  description text NOT NULL,
  confidentiality_level app.whistleblowing_confidentiality_level NOT NULL DEFAULT 'confidential',
  -- PIDA (Public Interest Disclosure Act 1998) protection
  pida_protected boolean NOT NULL DEFAULT false,
  -- Assignment
  assigned_to uuid REFERENCES app.employees(id),
  -- Lifecycle
  status app.whistleblowing_status NOT NULL DEFAULT 'submitted',
  -- Investigation
  investigation_notes text,
  outcome text,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_whistleblowing_cases_tenant ON app.whistleblowing_cases(tenant_id);
CREATE INDEX idx_whistleblowing_cases_status ON app.whistleblowing_cases(tenant_id, status);
CREATE INDEX idx_whistleblowing_cases_assigned ON app.whistleblowing_cases(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_whistleblowing_cases_reporter ON app.whistleblowing_cases(reporter_id) WHERE reporter_id IS NOT NULL;
CREATE INDEX idx_whistleblowing_cases_created ON app.whistleblowing_cases(tenant_id, created_at DESC);
CREATE INDEX idx_whistleblowing_cases_pida ON app.whistleblowing_cases(tenant_id, pida_protected) WHERE pida_protected = true;

-- =============================================================================
-- Audit Trail: whistleblowing_audit_log
-- =============================================================================

CREATE TABLE app.whistleblowing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  case_id uuid NOT NULL REFERENCES app.whistleblowing_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  action_by uuid,  -- nullable for system actions
  old_values jsonb,
  new_values jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whistleblowing_audit_case ON app.whistleblowing_audit_log(case_id);
CREATE INDEX idx_whistleblowing_audit_tenant ON app.whistleblowing_audit_log(tenant_id);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.whistleblowing_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.whistleblowing_audit_log ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.whistleblowing_cases
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.whistleblowing_cases
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON app.whistleblowing_audit_log
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.whistleblowing_audit_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/system operations)
CREATE POLICY system_bypass ON app.whistleblowing_cases
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass ON app.whistleblowing_audit_log
  USING (current_setting('app.system_context', true) = 'true');

-- =============================================================================
-- Updated-at trigger
-- =============================================================================

CREATE TRIGGER trg_whistleblowing_cases_updated_at
  BEFORE UPDATE ON app.whistleblowing_cases
  FOR EACH ROW
  EXECUTE FUNCTION app.set_updated_at();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.whistleblowing_cases TO hris_app;
GRANT SELECT, INSERT ON app.whistleblowing_audit_log TO hris_app;
