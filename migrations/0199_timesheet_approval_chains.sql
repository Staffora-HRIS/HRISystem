-- Migration: 0199_timesheet_approval_chains
-- Created: 2026-03-17
-- Description: Create the timesheet_approval_chains table for multi-level
--              timesheet approval hierarchy. When a timesheet is submitted,
--              approval chain entries are created for each required level.
--              Level N must approve before level N+1 becomes actionable.
--              If any level rejects, the entire chain is terminated.
--
-- Depends on: 0042_timesheets, 0044_timesheet_approvals, 0035_time_enums

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Approval Chain Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_chain_status') THEN
        CREATE TYPE app.approval_chain_status AS ENUM (
            'pending',      -- Waiting for previous level to complete
            'active',       -- Currently awaiting this approver's decision
            'approved',     -- This level approved
            'rejected',     -- This level rejected
            'skipped'       -- This level was skipped (e.g. auto-approve for same user)
        );
    END IF;
END $$;

COMMENT ON TYPE app.approval_chain_status IS 'Status of an individual approval chain entry. pending->active->approved/rejected/skipped';

-- -----------------------------------------------------------------------------
-- Timesheet Approval Chains Table
-- -----------------------------------------------------------------------------
-- Each row represents one level in a multi-level approval chain for a timesheet.
-- When a timesheet is submitted, rows are created for each configured level.
-- Level 1 starts as "active", levels 2+ start as "pending".
-- When level N approves, level N+1 is promoted to "active".
-- When the highest level approves, the timesheet itself is approved.
-- If any level rejects, all subsequent pending levels are marked "skipped"
-- and the timesheet is rejected.
CREATE TABLE IF NOT EXISTS app.timesheet_approval_chains (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The timesheet being approved
    timesheet_id uuid NOT NULL REFERENCES app.timesheets(id) ON DELETE CASCADE,

    -- Approval level (1-based, lower = first to approve)
    level integer NOT NULL,

    -- The user assigned as approver for this level
    approver_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,

    -- Current status of this approval level
    status app.approval_chain_status NOT NULL DEFAULT 'pending',

    -- When this level was approved or rejected (NULL while pending/active)
    decided_at timestamptz,

    -- Optional comments from the approver
    comments text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One entry per timesheet per level
    CONSTRAINT approval_chains_unique_level UNIQUE (timesheet_id, level),

    -- Level must be positive
    CONSTRAINT approval_chains_level_positive CHECK (level >= 1),

    -- Decision timestamp required when decided
    CONSTRAINT approval_chains_decided_info CHECK (
        status IN ('pending', 'active') OR decided_at IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: all chain entries for a timesheet
CREATE INDEX IF NOT EXISTS idx_approval_chains_timesheet
    ON app.timesheet_approval_chains(timesheet_id, level);

-- Tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_approval_chains_tenant
    ON app.timesheet_approval_chains(tenant_id, status);

-- Find active approvals for a specific approver (their "inbox")
CREATE INDEX IF NOT EXISTS idx_approval_chains_approver_active
    ON app.timesheet_approval_chains(approver_id, status)
    WHERE status = 'active';

-- Find all approvals assigned to an approver
CREATE INDEX IF NOT EXISTS idx_approval_chains_approver
    ON app.timesheet_approval_chains(approver_id, created_at DESC);

-- Pending chain entries for progression queries
CREATE INDEX IF NOT EXISTS idx_approval_chains_pending
    ON app.timesheet_approval_chains(timesheet_id, status)
    WHERE status = 'pending';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.timesheet_approval_chains ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see approval chains for their current tenant
CREATE POLICY tenant_isolation ON app.timesheet_approval_chains
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.timesheet_approval_chains
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_approval_chains_updated_at
    BEFORE UPDATE ON app.timesheet_approval_chains
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to create the approval chain for a timesheet.
-- Called when a timesheet is submitted. Accepts an array of approver UUIDs
-- ordered by level (index 0 = level 1, etc.). Level 1 starts as 'active'.
CREATE OR REPLACE FUNCTION app.create_timesheet_approval_chain(
    p_timesheet_id uuid,
    p_approver_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
    v_idx integer;
    v_status app.approval_chain_status;
    v_count integer := 0;
BEGIN
    -- Validate timesheet exists and is submitted
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_timesheet.status != 'submitted' THEN
        RAISE EXCEPTION 'Timesheet must be in submitted status to create approval chain. Current: %', v_timesheet.status;
    END IF;

    -- Validate at least one approver
    IF array_length(p_approver_ids, 1) IS NULL OR array_length(p_approver_ids, 1) < 1 THEN
        RAISE EXCEPTION 'At least one approver is required';
    END IF;

    -- Delete any existing chain entries for this timesheet (in case of resubmission)
    DELETE FROM app.timesheet_approval_chains
    WHERE timesheet_id = p_timesheet_id;

    -- Create chain entries
    FOR v_idx IN 1..array_length(p_approver_ids, 1) LOOP
        IF v_idx = 1 THEN
            v_status := 'active';
        ELSE
            v_status := 'pending';
        END IF;

        INSERT INTO app.timesheet_approval_chains (
            tenant_id, timesheet_id, level, approver_id, status
        ) VALUES (
            v_timesheet.tenant_id, p_timesheet_id, v_idx,
            p_approver_ids[v_idx], v_status
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.create_timesheet_approval_chain IS
    'Creates a multi-level approval chain for a submitted timesheet. Level 1 starts active, others pending.';

-- Function to process an approval decision at a given level.
-- If approved and more levels remain, promotes the next level to active.
-- If approved and this was the last level, approves the timesheet.
-- If rejected, skips all remaining levels and rejects the timesheet.
CREATE OR REPLACE FUNCTION app.process_approval_chain_decision(
    p_timesheet_id uuid,
    p_approver_id uuid,
    p_decision app.approval_chain_status,  -- 'approved' or 'rejected'
    p_comments text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_chain RECORD;
    v_next_chain RECORD;
    v_max_level integer;
    v_timesheet RECORD;
    v_result jsonb;
BEGIN
    -- Validate decision value
    IF p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected, not %', p_decision;
    END IF;

    -- Find the active chain entry for this approver and timesheet
    SELECT * INTO v_chain
    FROM app.timesheet_approval_chains
    WHERE timesheet_id = p_timesheet_id
      AND approver_id = p_approver_id
      AND status = 'active';

    IF v_chain IS NULL THEN
        RAISE EXCEPTION 'No active approval chain entry found for this approver and timesheet';
    END IF;

    -- Get the timesheet
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    -- Get the max level for this timesheet's chain
    SELECT MAX(level) INTO v_max_level
    FROM app.timesheet_approval_chains
    WHERE timesheet_id = p_timesheet_id;

    -- Record the decision
    UPDATE app.timesheet_approval_chains
    SET status = p_decision,
        decided_at = now(),
        comments = p_comments
    WHERE id = v_chain.id;

    IF p_decision = 'approved' THEN
        -- Record in the immutable approval history
        PERFORM app.record_timesheet_approval(
            p_timesheet_id, 'approve'::app.timesheet_approval_action,
            p_approver_id, COALESCE(p_comments, 'Approved at level ' || v_chain.level)
        );

        IF v_chain.level < v_max_level THEN
            -- Promote the next level to active
            UPDATE app.timesheet_approval_chains
            SET status = 'active'
            WHERE timesheet_id = p_timesheet_id
              AND level = v_chain.level + 1
              AND status = 'pending';

            v_result := jsonb_build_object(
                'action', 'level_approved',
                'level', v_chain.level,
                'nextLevel', v_chain.level + 1,
                'timesheetStatus', 'submitted'
            );
        ELSE
            -- This was the final level; approve the timesheet itself
            UPDATE app.timesheets
            SET status = 'approved',
                approved_at = now(),
                approved_by = p_approver_id,
                updated_at = now()
            WHERE id = p_timesheet_id
              AND status = 'submitted';

            v_result := jsonb_build_object(
                'action', 'fully_approved',
                'level', v_chain.level,
                'timesheetStatus', 'approved'
            );
        END IF;
    ELSE
        -- Rejection: skip all remaining pending levels
        UPDATE app.timesheet_approval_chains
        SET status = 'skipped',
            decided_at = now(),
            comments = 'Skipped due to rejection at level ' || v_chain.level
        WHERE timesheet_id = p_timesheet_id
          AND status IN ('pending', 'active')
          AND level > v_chain.level;

        -- Record rejection in immutable approval history
        PERFORM app.record_timesheet_approval(
            p_timesheet_id, 'reject'::app.timesheet_approval_action,
            p_approver_id, COALESCE(p_comments, 'Rejected at level ' || v_chain.level)
        );

        -- Reject the timesheet itself
        UPDATE app.timesheets
        SET status = 'rejected',
            rejected_at = now(),
            rejected_by = p_approver_id,
            rejection_reason = COALESCE(p_comments, 'Rejected at approval level ' || v_chain.level),
            updated_at = now()
        WHERE id = p_timesheet_id
          AND status = 'submitted';

        v_result := jsonb_build_object(
            'action', 'rejected',
            'level', v_chain.level,
            'timesheetStatus', 'rejected'
        );
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION app.process_approval_chain_decision IS
    'Processes an approve/reject decision at one level of the approval chain. Handles progression and terminal states.';

-- Function to get the full approval chain for a timesheet
CREATE OR REPLACE FUNCTION app.get_timesheet_approval_chain(
    p_timesheet_id uuid
)
RETURNS TABLE (
    id uuid,
    level integer,
    approver_id uuid,
    approver_name varchar(255),
    status app.approval_chain_status,
    decided_at timestamptz,
    comments text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ac.id,
        ac.level,
        ac.approver_id,
        u.name AS approver_name,
        ac.status,
        ac.decided_at,
        ac.comments,
        ac.created_at
    FROM app.timesheet_approval_chains ac
    JOIN app.users u ON ac.approver_id = u.id
    WHERE ac.timesheet_id = p_timesheet_id
    ORDER BY ac.level;
END;
$$;

COMMENT ON FUNCTION app.get_timesheet_approval_chain IS
    'Returns the complete approval chain for a timesheet with approver names.';

-- Function to get pending approvals for an approver (their inbox)
CREATE OR REPLACE FUNCTION app.get_approver_pending_timesheets(
    p_approver_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    chain_id uuid,
    timesheet_id uuid,
    employee_id uuid,
    employee_number varchar(50),
    period_start date,
    period_end date,
    total_regular_hours numeric,
    total_overtime_hours numeric,
    level integer,
    submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ac.id AS chain_id,
        ac.timesheet_id,
        t.employee_id,
        e.employee_number,
        t.period_start,
        t.period_end,
        t.total_regular_hours,
        t.total_overtime_hours,
        ac.level,
        t.submitted_at
    FROM app.timesheet_approval_chains ac
    JOIN app.timesheets t ON ac.timesheet_id = t.id
    JOIN app.employees e ON t.employee_id = e.id
    WHERE ac.approver_id = p_approver_id
      AND ac.status = 'active'
      AND t.status = 'submitted'
    ORDER BY t.submitted_at
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION app.get_approver_pending_timesheets IS
    'Returns timesheets awaiting approval by a specific approver.';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.timesheet_approval_chains IS
    'Multi-level approval hierarchy for timesheets. Each row is one approval level. Level 1 is first, level N is last.';
COMMENT ON COLUMN app.timesheet_approval_chains.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.timesheet_approval_chains.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.timesheet_approval_chains.timesheet_id IS 'The timesheet being approved';
COMMENT ON COLUMN app.timesheet_approval_chains.level IS 'Approval level (1-based). Lower levels approve first.';
COMMENT ON COLUMN app.timesheet_approval_chains.approver_id IS 'The user assigned as approver at this level';
COMMENT ON COLUMN app.timesheet_approval_chains.status IS 'Current status: pending, active, approved, rejected, skipped';
COMMENT ON COLUMN app.timesheet_approval_chains.decided_at IS 'When the approver made their decision (NULL while pending/active)';
COMMENT ON COLUMN app.timesheet_approval_chains.comments IS 'Optional comments from the approver';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_approver_pending_timesheets(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_timesheet_approval_chain(uuid);
-- DROP FUNCTION IF EXISTS app.process_approval_chain_decision(uuid, uuid, app.approval_chain_status, text);
-- DROP FUNCTION IF EXISTS app.create_timesheet_approval_chain(uuid, uuid[]);
-- DROP TRIGGER IF EXISTS update_approval_chains_updated_at ON app.timesheet_approval_chains;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.timesheet_approval_chains;
-- DROP POLICY IF EXISTS tenant_isolation ON app.timesheet_approval_chains;
-- DROP INDEX IF EXISTS app.idx_approval_chains_pending;
-- DROP INDEX IF EXISTS app.idx_approval_chains_approver;
-- DROP INDEX IF EXISTS app.idx_approval_chains_approver_active;
-- DROP INDEX IF EXISTS app.idx_approval_chains_tenant;
-- DROP INDEX IF EXISTS app.idx_approval_chains_timesheet;
-- DROP TABLE IF EXISTS app.timesheet_approval_chains;
-- DROP TYPE IF EXISTS app.approval_chain_status;
