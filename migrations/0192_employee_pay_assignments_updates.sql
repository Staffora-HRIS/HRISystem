-- Migration: 0192_employee_pay_assignments_updates
-- Created: 2026-03-17
-- Description: Add updated_at column and trigger to employee_pay_assignments
--              table to support updating pay schedule assignments (e.g., ending
--              an assignment by setting effective_to, or changing the schedule).
--
--              Also adds an updated_by audit column for traceability.
--
--              This completes TODO-124: employee-to-pay-schedule assignment
--              now supports full CRUD lifecycle.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add updated_at column to employee_pay_assignments
ALTER TABLE app.employee_pay_assignments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add updated_by column for audit traceability
ALTER TABLE app.employee_pay_assignments
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Auto-update trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_employee_pay_assignments_updated_at'
      AND tgrelid = 'app.employee_pay_assignments'::regclass
  ) THEN
    CREATE TRIGGER trg_employee_pay_assignments_updated_at
      BEFORE UPDATE ON app.employee_pay_assignments
      FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
  END IF;
END $$;

COMMENT ON COLUMN app.employee_pay_assignments.updated_at IS 'Timestamp of last update to this pay assignment';
COMMENT ON COLUMN app.employee_pay_assignments.updated_by IS 'User ID who last updated this assignment';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_employee_pay_assignments_updated_at ON app.employee_pay_assignments;
-- ALTER TABLE app.employee_pay_assignments DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE app.employee_pay_assignments DROP COLUMN IF EXISTS updated_at;
