-- Migration: 0193_case_appeals_acas_compliance
-- Created: 2026-03-17
-- Description: Enhance case_appeals for ACAS Code compliance (TODO-152)
--   - Fix RLS policies (wrong setting name in 0180)
--   - Add hearing_date, hearing_officer_id, outcome_notes, original_decision_maker_id
--   - Add appellant_employee_id linking to employees table
--   - Enforce ACAS Code para 26-27: appeal must be decided by a different person
--   - Update case status transition trigger to allow resolved -> appealed

-- =============================================================================
-- 1. Fix RLS Policies (0180 used app.current_tenant_id instead of app.current_tenant)
-- =============================================================================

-- Drop the incorrectly-named policies from 0180
DROP POLICY IF EXISTS case_appeals_tenant_isolation ON app.case_appeals;
DROP POLICY IF EXISTS case_appeals_app_role ON app.case_appeals;

-- Recreate with correct setting name (app.current_tenant)
CREATE POLICY case_appeals_tenant_isolation ON app.case_appeals
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR app.is_system_context()
  );

CREATE POLICY case_appeals_tenant_isolation_insert ON app.case_appeals
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR app.is_system_context()
  );

-- =============================================================================
-- 2. Add missing columns for full ACAS appeal compliance
-- =============================================================================

-- The employee who is appealing (references employees, not users)
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS appellant_employee_id uuid REFERENCES app.employees(id);

-- The original decision maker (resolved_by or assigned_to from the parent case)
-- Stored denormalized so the constraint is enforceable even if the case is later reassigned
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS original_decision_maker_id uuid REFERENCES app.users(id);

-- Hearing officer who will decide the appeal (ACAS Code para 27: different person)
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS hearing_officer_id uuid REFERENCES app.users(id);

-- Scheduled date for the appeal hearing
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS hearing_date timestamptz;

-- Written outcome notes / reasoning from the appeal hearing officer
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS outcome_notes text;

-- Appeal grounds (more descriptive name alongside existing 'reason')
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS appeal_grounds text;

-- When the appeal was filed (explicit, distinct from created_at)
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS appeal_date timestamptz DEFAULT now();

-- updated_at for tracking modifications
ALTER TABLE app.case_appeals
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- =============================================================================
-- 3. ACAS Code Constraint: hearing_officer_id must NOT be original_decision_maker_id
--    (para 26-27: appeal must be heard by a different, ideally more senior, manager)
-- =============================================================================

-- This constraint enforces at the DB level that the appeal is decided by someone different
ALTER TABLE app.case_appeals
  DROP CONSTRAINT IF EXISTS case_appeals_different_decision_maker;

ALTER TABLE app.case_appeals
  ADD CONSTRAINT case_appeals_different_decision_maker
  CHECK (
    hearing_officer_id IS NULL
    OR original_decision_maker_id IS NULL
    OR hearing_officer_id != original_decision_maker_id
  );

-- Also ensure reviewer_id (from original schema) is not the same as original decision maker
ALTER TABLE app.case_appeals
  DROP CONSTRAINT IF EXISTS case_appeals_reviewer_different_from_original;

ALTER TABLE app.case_appeals
  ADD CONSTRAINT case_appeals_reviewer_different_from_original
  CHECK (
    reviewer_id IS NULL
    OR original_decision_maker_id IS NULL
    OR reviewer_id != original_decision_maker_id
  );

-- =============================================================================
-- 4. Additional Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_case_appeals_hearing_officer
  ON app.case_appeals(hearing_officer_id)
  WHERE hearing_officer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_case_appeals_appellant_employee
  ON app.case_appeals(appellant_employee_id)
  WHERE appellant_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_case_appeals_original_decision_maker
  ON app.case_appeals(original_decision_maker_id)
  WHERE original_decision_maker_id IS NOT NULL;

-- =============================================================================
-- 5. Update case status transition trigger to allow resolved -> appealed
-- =============================================================================

CREATE OR REPLACE FUNCTION app.validate_case_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If status hasn't changed, allow the update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Validate transition based on current (old) status
    CASE OLD.status
        WHEN 'new' THEN
            IF NEW.status NOT IN ('open', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: new can only transition to open or cancelled, not %', NEW.status;
            END IF;

        WHEN 'open' THEN
            IF NEW.status NOT IN ('pending', 'on_hold', 'resolved', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: open can only transition to pending, on_hold, resolved, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'pending' THEN
            IF NEW.status NOT IN ('open', 'on_hold', 'resolved', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to open, on_hold, resolved, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'on_hold' THEN
            IF NEW.status NOT IN ('open', 'pending', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: on_hold can only transition to open, pending, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'resolved' THEN
            -- ACAS Code compliance: allow appealed in addition to reopen/close
            IF NEW.status NOT IN ('open', 'closed', 'appealed') THEN
                RAISE EXCEPTION 'Invalid status transition: resolved can only transition to open (reopen), closed, or appealed, not %', NEW.status;
            END IF;

        WHEN 'appealed' THEN
            -- Appeal can result in reopening (in_progress/open) or closing
            IF NEW.status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
                RAISE EXCEPTION 'Invalid status transition: appealed can only transition to open, in_progress, resolved, or closed, not %', NEW.status;
            END IF;

        WHEN 'closed' THEN
            RAISE EXCEPTION 'Invalid status transition: closed is a terminal state';

        WHEN 'cancelled' THEN
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 6. Auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE TRIGGER update_case_appeals_updated_at
    BEFORE UPDATE ON app.case_appeals
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 7. Comments
-- =============================================================================

COMMENT ON COLUMN app.case_appeals.appellant_employee_id IS 'Employee filing the appeal (references employees table)';
COMMENT ON COLUMN app.case_appeals.original_decision_maker_id IS 'User who made the original case decision (denormalized for constraint enforcement)';
COMMENT ON COLUMN app.case_appeals.hearing_officer_id IS 'User assigned to hear the appeal - MUST be different from original_decision_maker_id per ACAS Code para 27';
COMMENT ON COLUMN app.case_appeals.hearing_date IS 'Scheduled date for the appeal hearing';
COMMENT ON COLUMN app.case_appeals.outcome_notes IS 'Written reasoning from the appeal hearing officer';
COMMENT ON COLUMN app.case_appeals.appeal_grounds IS 'Detailed grounds for the appeal';
COMMENT ON COLUMN app.case_appeals.appeal_date IS 'Date the appeal was filed';
COMMENT ON CONSTRAINT case_appeals_different_decision_maker ON app.case_appeals IS 'ACAS Code para 26-27: appeal must be heard by a different manager than the original decision maker';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_case_appeals_updated_at ON app.case_appeals;
-- ALTER TABLE app.case_appeals DROP CONSTRAINT IF EXISTS case_appeals_different_decision_maker;
-- ALTER TABLE app.case_appeals DROP CONSTRAINT IF EXISTS case_appeals_reviewer_different_from_original;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS appellant_employee_id;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS original_decision_maker_id;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS hearing_officer_id;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS hearing_date;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS outcome_notes;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS appeal_grounds;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS appeal_date;
-- ALTER TABLE app.case_appeals DROP COLUMN IF EXISTS updated_at;
-- DROP INDEX IF EXISTS app.idx_case_appeals_hearing_officer;
-- DROP INDEX IF EXISTS app.idx_case_appeals_appellant_employee;
-- DROP INDEX IF EXISTS app.idx_case_appeals_original_decision_maker;
-- (Restore original RLS policies with wrong setting name - not recommended)
-- (Restore original validate_case_status_transition without appealed transitions)
