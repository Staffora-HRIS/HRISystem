-- Migration: 0199_employment_records
-- Description: Create employment_records table to track employment history
--              across rehires, linking each new employment to its predecessor.
-- Reversible: Yes (see DOWN section at bottom)

-- =============================================================================
-- UP
-- =============================================================================

-- Employment records table: tracks each period of employment for an employee.
-- When an employee is rehired, a new record is created linking to the previous
-- terminated record, preserving the full employment history chain.
CREATE TABLE IF NOT EXISTS app.employment_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  employee_id     uuid NOT NULL REFERENCES app.employees(id),
  employment_number integer NOT NULL,
  start_date      date NOT NULL,
  end_date        date,
  termination_reason text,
  is_current      boolean NOT NULL DEFAULT true,
  previous_employment_id uuid REFERENCES app.employment_records(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_employment_records_employee_id
  ON app.employment_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_employment_records_tenant_id
  ON app.employment_records(tenant_id);

CREATE INDEX IF NOT EXISTS idx_employment_records_is_current
  ON app.employment_records(employee_id, is_current) WHERE is_current = true;

-- Only one current employment record per employee per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_employment_records_one_current
  ON app.employment_records(tenant_id, employee_id) WHERE is_current = true;

-- Employment number must be unique per employee per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_employment_records_number_unique
  ON app.employment_records(tenant_id, employee_id, employment_number);

-- Enable Row Level Security
ALTER TABLE app.employment_records ENABLE ROW LEVEL SECURITY;

-- RLS policies: tenant isolation
CREATE POLICY tenant_isolation ON app.employment_records
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert ON app.employment_records
  FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- Grant access to the application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.employment_records TO hris_app;

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.employment_records CASCADE;
