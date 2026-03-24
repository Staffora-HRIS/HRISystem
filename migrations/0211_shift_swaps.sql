-- Migration: 0211_shift_swaps
-- Created: 2026-03-19
-- Description: Enhance shift swap requests with two-phase approval workflow.
--
--              Adds 'pending_target' and 'pending_manager' states to the
--              shift_swap_status enum to support the two-phase approval flow:
--                1. Requester creates swap request   -> pending_target
--                2. Target employee accepts           -> pending_manager
--                3. Manager approves                  -> approved
--
--              State machine:
--                pending_target  -> pending_manager  (target accepts)
--                pending_target  -> rejected          (target rejects)
--                pending_target  -> cancelled         (requester cancels)
--                pending_manager -> approved           (manager approves)
--                pending_manager -> rejected           (manager rejects)
--                pending_manager -> cancelled          (requester cancels)
--
--              Also adds manager_response_at column and updates the status
--              transition trigger to enforce the two-phase state machine.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add new enum values for the two-phase approval flow
ALTER TYPE app.shift_swap_status ADD VALUE IF NOT EXISTS 'pending_target' BEFORE 'pending';
ALTER TYPE app.shift_swap_status ADD VALUE IF NOT EXISTS 'pending_manager' AFTER 'pending_target';

-- Add manager_response_at column for tracking when the manager acted
ALTER TABLE app.shift_swap_requests
  ADD COLUMN IF NOT EXISTS manager_response_at timestamptz;

-- Update the default status to 'pending_target' for new requests going forward
-- (Cannot change default on enum columns directly; handled at application level)

-- Drop and recreate the status transition trigger to support new states
DROP TRIGGER IF EXISTS validate_shift_swap_status_transition ON app.shift_swap_requests;

CREATE OR REPLACE FUNCTION app.validate_shift_swap_status_transition()
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
    CASE OLD.status::text
        -- == Two-phase approval states ==

        WHEN 'pending_target' THEN
            -- Target can accept (-> pending_manager), reject (-> rejected), or requester cancels
            IF NEW.status::text NOT IN ('pending_manager', 'rejected', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending_target can only transition to pending_manager, rejected, or cancelled, not %', NEW.status;
            END IF;

            -- To move to pending_manager, target must have accepted
            IF NEW.status::text = 'pending_manager' AND (NEW.target_accepted IS NULL OR NOT NEW.target_accepted) THEN
                RAISE EXCEPTION 'Cannot move to pending_manager: target employee has not accepted';
            END IF;

        WHEN 'pending_manager' THEN
            -- Manager can approve or reject; requester can cancel
            IF NEW.status::text NOT IN ('approved', 'rejected', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending_manager can only transition to approved, rejected, or cancelled, not %', NEW.status;
            END IF;

            -- To approve, manager must be recorded
            IF NEW.status::text = 'approved' AND (NEW.approved_by IS NULL) THEN
                RAISE EXCEPTION 'Cannot approve swap: approver must be recorded';
            END IF;

        -- == Legacy single-phase state (backward compatibility) ==

        WHEN 'pending' THEN
            -- Legacy: pending can transition to approved, rejected, or cancelled
            IF NEW.status::text NOT IN ('approved', 'rejected', 'cancelled', 'pending_manager') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to approved, rejected, cancelled, or pending_manager, not %', NEW.status;
            END IF;

            -- To approve from legacy pending, target must have accepted
            IF NEW.status::text = 'approved' AND (NEW.target_accepted IS NULL OR NOT NEW.target_accepted) THEN
                RAISE EXCEPTION 'Cannot approve swap: target employee has not accepted';
            END IF;

        WHEN 'approved' THEN
            -- approved can only transition to cancelled (rare, for undoing swap)
            IF NEW.status::text != 'cancelled' THEN
                RAISE EXCEPTION 'Invalid status transition: approved can only transition to cancelled, not %', NEW.status;
            END IF;

        WHEN 'rejected' THEN
            -- rejected is a terminal state
            RAISE EXCEPTION 'Invalid status transition: rejected is a terminal state';

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER validate_shift_swap_status_transition
    BEFORE UPDATE OF status ON app.shift_swap_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_shift_swap_status_transition();

-- Drop and update the approval consistency constraint to support two-phase flow
ALTER TABLE app.shift_swap_requests
  DROP CONSTRAINT IF EXISTS shift_swap_approval_consistency;

ALTER TABLE app.shift_swap_requests
  ADD CONSTRAINT shift_swap_approval_consistency CHECK (
    (status::text NOT IN ('approved', 'rejected') OR approved_by IS NOT NULL)
    OR status::text IN ('pending', 'pending_target', 'pending_manager', 'cancelled')
  );

-- Drop and update the target response constraint for two-phase flow
ALTER TABLE app.shift_swap_requests
  DROP CONSTRAINT IF EXISTS shift_swap_target_response;

ALTER TABLE app.shift_swap_requests
  ADD CONSTRAINT shift_swap_target_response CHECK (
    status::text IN ('pending', 'pending_target') OR target_accepted IS NOT NULL
  );

-- Index for requests by status (covers pending_target, pending_manager lookups)
CREATE INDEX IF NOT EXISTS idx_shift_swap_status_tenant
    ON app.shift_swap_requests(tenant_id, status, created_at DESC);

-- Comments
COMMENT ON COLUMN app.shift_swap_requests.manager_response_at IS 'Timestamp when the manager approved or rejected the swap request';
COMMENT ON FUNCTION app.validate_shift_swap_status_transition IS 'Trigger function enforcing valid swap status transitions including two-phase (pending_target -> pending_manager -> approved/rejected) and legacy (pending -> approved/rejected/cancelled) flows';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- ALTER TABLE app.shift_swap_requests DROP CONSTRAINT IF EXISTS shift_swap_target_response;
-- ALTER TABLE app.shift_swap_requests DROP CONSTRAINT IF EXISTS shift_swap_approval_consistency;
-- DROP TRIGGER IF EXISTS validate_shift_swap_status_transition ON app.shift_swap_requests;
-- DROP INDEX IF EXISTS app.idx_shift_swap_pending_manager;
-- DROP INDEX IF EXISTS app.idx_shift_swap_pending_target;
-- ALTER TABLE app.shift_swap_requests DROP COLUMN IF EXISTS manager_response_at;
-- Note: Cannot remove enum values in PostgreSQL without recreating the type
