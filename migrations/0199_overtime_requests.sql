-- Migration: 0199_overtime_requests
-- Created: 2026-03-17
-- Description: Overtime authorisation workflow table.
--              Employees submit overtime requests; managers approve or reject.
--              State machine: pending -> approved / rejected / cancelled
--              Tracks planned vs actual hours with full RLS and audit trail.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: overtime_request_type
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.overtime_request_type AS ENUM (
    'planned',
    'unplanned',
    'emergency'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.overtime_request_type IS 'Type of overtime request: planned (pre-approved), unplanned (after the fact), emergency';

-- -----------------------------------------------------------------------------
-- Enum: overtime_request_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.overtime_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.overtime_request_status IS 'Overtime request lifecycle: pending -> approved/rejected/cancelled';

-- -----------------------------------------------------------------------------
-- Table: overtime_requests
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.overtime_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Request details
  request_type      app.overtime_request_type NOT NULL DEFAULT 'planned',
  date              date NOT NULL,
  planned_hours     numeric(5,2) NOT NULL,
  actual_hours      numeric(5,2),
  reason            text NOT NULL,

  -- Approval workflow
  status            app.overtime_request_status NOT NULL DEFAULT 'pending',
  approver_id       uuid REFERENCES app.employees(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  rejection_reason  text,

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_overtime_req_planned_hours_positive CHECK (
    planned_hours > 0
  ),
  CONSTRAINT chk_overtime_req_actual_hours_positive CHECK (
    actual_hours IS NULL OR actual_hours >= 0
  ),
  CONSTRAINT chk_overtime_req_reason_not_empty CHECK (
    length(trim(reason)) > 0
  ),
  CONSTRAINT chk_overtime_req_approval_consistency CHECK (
    (status IN ('approved', 'rejected') AND approver_id IS NOT NULL AND approved_at IS NOT NULL)
    OR (status IN ('pending', 'cancelled'))
  )
);

-- RLS
ALTER TABLE app.overtime_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.overtime_requests
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.overtime_requests
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_overtime_requests_tenant
  ON app.overtime_requests (tenant_id);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_employee
  ON app.overtime_requests (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_status
  ON app.overtime_requests (tenant_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_overtime_requests_approver
  ON app.overtime_requests (tenant_id, approver_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_overtime_requests_date
  ON app.overtime_requests (tenant_id, date);

-- Updated_at trigger
CREATE TRIGGER trg_overtime_requests_updated_at
  BEFORE UPDATE ON app.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.overtime_requests IS 'Overtime authorisation requests with manager approval workflow';
COMMENT ON COLUMN app.overtime_requests.request_type IS 'Type of overtime: planned (pre-approved), unplanned (retrospective), emergency';
COMMENT ON COLUMN app.overtime_requests.date IS 'Date on which the overtime is/was worked';
COMMENT ON COLUMN app.overtime_requests.planned_hours IS 'Number of overtime hours planned/requested';
COMMENT ON COLUMN app.overtime_requests.actual_hours IS 'Actual overtime hours worked (can be updated after the fact)';
COMMENT ON COLUMN app.overtime_requests.reason IS 'Business justification for the overtime';
COMMENT ON COLUMN app.overtime_requests.status IS 'Request status: pending -> approved/rejected/cancelled';
COMMENT ON COLUMN app.overtime_requests.approver_id IS 'Employee (manager) who approved or rejected the request';
COMMENT ON COLUMN app.overtime_requests.approved_at IS 'Timestamp when the decision was made';
COMMENT ON COLUMN app.overtime_requests.rejection_reason IS 'Reason provided when rejecting the request';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_overtime_requests_updated_at ON app.overtime_requests;
-- DROP INDEX IF EXISTS app.idx_overtime_requests_date;
-- DROP INDEX IF EXISTS app.idx_overtime_requests_approver;
-- DROP INDEX IF EXISTS app.idx_overtime_requests_status;
-- DROP INDEX IF EXISTS app.idx_overtime_requests_employee;
-- DROP INDEX IF EXISTS app.idx_overtime_requests_tenant;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.overtime_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.overtime_requests;
-- DROP TABLE IF EXISTS app.overtime_requests;
-- DROP TYPE IF EXISTS app.overtime_request_status;
-- DROP TYPE IF EXISTS app.overtime_request_type;
