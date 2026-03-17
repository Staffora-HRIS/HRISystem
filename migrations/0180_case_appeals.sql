-- Migration: Case Appeals Table
-- Supports the case appeal process (TICKET-037)
-- Employees can appeal resolved disciplinary/grievance cases
-- Appeals are routed to a separate reviewer and tracked in a timeline

-- Add 'appealed' to case_status enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'appealed'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'case_status')
  ) THEN
    ALTER TYPE app.case_status ADD VALUE IF NOT EXISTS 'appealed' AFTER 'resolved';
  END IF;
END $$;

-- Appeal status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appeal_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.appeal_status AS ENUM ('pending', 'upheld', 'overturned', 'partially_upheld');
  END IF;
END $$;

-- Case appeals table
CREATE TABLE IF NOT EXISTS app.case_appeals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),
  case_id       uuid NOT NULL REFERENCES app.cases(id),
  appealed_by   uuid NOT NULL REFERENCES app.users(id),
  reason        text NOT NULL,
  reviewer_id   uuid REFERENCES app.users(id),
  status        app.appeal_status NOT NULL DEFAULT 'pending',
  outcome       text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_appeals_reason_not_empty CHECK (length(trim(reason)) > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_case_appeals_case_id ON app.case_appeals(case_id);
CREATE INDEX IF NOT EXISTS idx_case_appeals_tenant_id ON app.case_appeals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_appeals_reviewer_id ON app.case_appeals(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_appeals_status ON app.case_appeals(status) WHERE status = 'pending';

-- RLS
ALTER TABLE app.case_appeals ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY case_appeals_tenant_isolation ON app.case_appeals
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Allow app role full access within tenant
CREATE POLICY case_appeals_app_role ON app.case_appeals
  FOR ALL TO hris_app
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

COMMENT ON TABLE app.case_appeals IS 'Case appeal records for disciplinary/grievance case decisions';
COMMENT ON COLUMN app.case_appeals.status IS 'Appeal status: pending, upheld, overturned, partially_upheld';
COMMENT ON COLUMN app.case_appeals.outcome IS 'Written outcome/reasoning from the appeal reviewer';
