-- Migration: 0078_cases
-- Created: 2026-01-07
-- Description: Create the cases table - HR service desk case records
--              This table stores case tickets with SLA tracking, assignment,
--              and full lifecycle management

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cases Table
-- -----------------------------------------------------------------------------
-- HR service desk cases/tickets
-- Tracks requests, issues, and inquiries with full SLA management
CREATE TABLE IF NOT EXISTS app.cases (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this case exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Case identification
    case_number varchar(50) NOT NULL,

    -- Requester (employee who submitted the case)
    requester_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- On behalf of (if submitted by manager for another employee)
    on_behalf_of_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Case classification
    category_id uuid NOT NULL REFERENCES app.case_categories(id) ON DELETE RESTRICT,
    case_type app.case_type NOT NULL DEFAULT 'inquiry',
    priority app.case_priority NOT NULL DEFAULT 'medium',

    -- Case details
    subject varchar(500) NOT NULL,
    description text NOT NULL,

    -- Current status
    status app.case_status NOT NULL DEFAULT 'new',

    -- Source channel
    source app.case_source NOT NULL DEFAULT 'self_service',

    -- Assignment
    assigned_to uuid REFERENCES app.users(id) ON DELETE SET NULL,
    assigned_team_id uuid REFERENCES app.roles(id) ON DELETE SET NULL,

    -- Escalation tracking
    escalation_level app.escalation_level NOT NULL DEFAULT 'none',
    escalated_at timestamptz,
    escalated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- SLA tracking
    sla_status app.sla_status NOT NULL DEFAULT 'within_sla',
    sla_response_due_at timestamptz,
    sla_resolution_due_at timestamptz,
    sla_response_met_at timestamptz,
    sla_paused_at timestamptz,
    sla_paused_duration_minutes integer NOT NULL DEFAULT 0,

    -- Resolution details
    resolution_type app.resolution_type,
    resolution_summary text,
    resolved_at timestamptz,
    resolved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Closure details
    closed_at timestamptz,
    closed_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Related case (for duplicates, follow-ups)
    related_case_id uuid REFERENCES app.cases(id) ON DELETE SET NULL,

    -- Custom data (per category schema)
    custom_data jsonb NOT NULL DEFAULT '{}',

    -- Tags for filtering
    tags jsonb NOT NULL DEFAULT '[]',

    -- Internal notes (not visible to requester)
    internal_notes text,

    -- Satisfaction rating (1-5)
    satisfaction_rating integer,
    satisfaction_feedback text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Case number must be unique within tenant
    CONSTRAINT cases_number_unique UNIQUE (tenant_id, case_number),

    -- Satisfaction rating must be 1-5
    CONSTRAINT cases_satisfaction_rating_valid CHECK (
        satisfaction_rating IS NULL OR (satisfaction_rating >= 1 AND satisfaction_rating <= 5)
    ),

    -- Resolved cases must have resolution info
    CONSTRAINT cases_resolved_has_info CHECK (
        status NOT IN ('resolved', 'closed') OR (
            resolution_type IS NOT NULL AND
            resolution_summary IS NOT NULL AND
            resolved_at IS NOT NULL AND
            resolved_by IS NOT NULL
        )
    ),

    -- Closed cases must have closure info
    CONSTRAINT cases_closed_has_info CHECK (
        status != 'closed' OR (
            closed_at IS NOT NULL AND
            closed_by IS NOT NULL
        )
    ),

    -- Cannot be own on_behalf_of
    CONSTRAINT cases_not_self_behalf CHECK (
        on_behalf_of_id IS NULL OR on_behalf_of_id != requester_id
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Case number lookup
CREATE INDEX IF NOT EXISTS idx_cases_tenant_number
    ON app.cases(tenant_id, case_number);

-- Requester's cases
CREATE INDEX IF NOT EXISTS idx_cases_tenant_requester_status
    ON app.cases(tenant_id, requester_id, status);

-- Assigned cases
CREATE INDEX IF NOT EXISTS idx_cases_tenant_assigned_status
    ON app.cases(tenant_id, assigned_to, status)
    WHERE assigned_to IS NOT NULL;

-- Team assignments
CREATE INDEX IF NOT EXISTS idx_cases_tenant_team_status
    ON app.cases(tenant_id, assigned_team_id, status)
    WHERE assigned_team_id IS NOT NULL;

-- Unassigned cases (queue)
CREATE INDEX IF NOT EXISTS idx_cases_tenant_unassigned
    ON app.cases(tenant_id, category_id, priority, created_at)
    WHERE assigned_to IS NULL AND status NOT IN ('resolved', 'closed', 'cancelled');

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_cases_tenant_status
    ON app.cases(tenant_id, status);

-- Priority filtering
CREATE INDEX IF NOT EXISTS idx_cases_tenant_priority_status
    ON app.cases(tenant_id, priority, status);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_cases_tenant_category
    ON app.cases(tenant_id, category_id);

-- SLA breached cases
CREATE INDEX IF NOT EXISTS idx_cases_tenant_sla_breached
    ON app.cases(tenant_id, sla_status, sla_resolution_due_at)
    WHERE sla_status IN ('warning', 'breached') AND status NOT IN ('resolved', 'closed', 'cancelled');

-- Open cases by created date
CREATE INDEX IF NOT EXISTS idx_cases_tenant_open_created
    ON app.cases(tenant_id, created_at DESC)
    WHERE status NOT IN ('resolved', 'closed', 'cancelled');

-- Escalated cases
CREATE INDEX IF NOT EXISTS idx_cases_tenant_escalated
    ON app.cases(tenant_id, escalation_level, escalated_at)
    WHERE escalation_level != 'none';

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_cases_custom_data
    ON app.cases USING gin(custom_data);

CREATE INDEX IF NOT EXISTS idx_cases_tags
    ON app.cases USING gin(tags);

-- Full-text search on subject and description
CREATE INDEX IF NOT EXISTS idx_cases_search
    ON app.cases USING gin(
        to_tsvector('english', subject || ' ' || COALESCE(description, ''))
    );

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.cases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see cases for their current tenant
CREATE POLICY tenant_isolation ON app.cases
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.cases
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_cases_updated_at
    BEFORE UPDATE ON app.cases
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to auto-generate case number
CREATE OR REPLACE FUNCTION app.generate_case_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_year text;
    v_sequence integer;
BEGIN
    IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
        v_year := TO_CHAR(now(), 'YYYY');

        -- Get next sequence number for this tenant/year
        SELECT COALESCE(MAX(
            CASE
                WHEN case_number ~ ('^HR-' || v_year || '-[0-9]+$')
                THEN CAST(SUBSTRING(case_number FROM '[0-9]+$') AS integer)
                ELSE 0
            END
        ), 0) + 1 INTO v_sequence
        FROM app.cases
        WHERE tenant_id = NEW.tenant_id;

        NEW.case_number := 'HR-' || v_year || '-' || LPAD(v_sequence::text, 6, '0');
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_case_number
    BEFORE INSERT ON app.cases
    FOR EACH ROW
    EXECUTE FUNCTION app.generate_case_number();

-- Function to calculate SLA due dates on create
CREATE OR REPLACE FUNCTION app.calculate_case_sla_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_response_hours integer;
    v_resolution_hours integer;
BEGIN
    -- Only calculate on insert or when category changes
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.category_id != NEW.category_id) THEN
        -- Get effective SLA from category
        SELECT response_hours, resolution_hours
        INTO v_response_hours, v_resolution_hours
        FROM app.get_effective_category_sla(NEW.category_id);

        IF v_response_hours IS NOT NULL THEN
            NEW.sla_response_due_at := NEW.created_at + (v_response_hours || ' hours')::interval;
        END IF;

        IF v_resolution_hours IS NOT NULL THEN
            NEW.sla_resolution_due_at := NEW.created_at + (v_resolution_hours || ' hours')::interval;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_case_sla_dates
    BEFORE INSERT OR UPDATE OF category_id ON app.cases
    FOR EACH ROW
    EXECUTE FUNCTION app.calculate_case_sla_dates();

-- Function to validate case status transitions
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
            IF NEW.status NOT IN ('open', 'closed') THEN
                RAISE EXCEPTION 'Invalid status transition: resolved can only transition to open (reopen) or closed, not %', NEW.status;
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

CREATE TRIGGER validate_case_status_transition
    BEFORE UPDATE OF status ON app.cases
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_case_status_transition();

-- Function to handle SLA pause/resume
CREATE OR REPLACE FUNCTION app.manage_case_sla_pause()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_pause_duration integer;
BEGIN
    -- Pause SLA when going to pending or on_hold
    IF NEW.status IN ('pending', 'on_hold') AND OLD.status NOT IN ('pending', 'on_hold') THEN
        NEW.sla_paused_at := now();
        NEW.sla_status := 'paused';
    END IF;

    -- Resume SLA when leaving pending or on_hold
    IF OLD.status IN ('pending', 'on_hold') AND NEW.status NOT IN ('pending', 'on_hold', 'resolved', 'closed', 'cancelled') THEN
        IF OLD.sla_paused_at IS NOT NULL THEN
            -- Calculate paused duration
            v_pause_duration := EXTRACT(EPOCH FROM (now() - OLD.sla_paused_at)) / 60;
            NEW.sla_paused_duration_minutes := OLD.sla_paused_duration_minutes + v_pause_duration;

            -- Extend SLA due dates
            IF NEW.sla_response_due_at IS NOT NULL AND NEW.sla_response_met_at IS NULL THEN
                NEW.sla_response_due_at := NEW.sla_response_due_at + (v_pause_duration || ' minutes')::interval;
            END IF;

            IF NEW.sla_resolution_due_at IS NOT NULL THEN
                NEW.sla_resolution_due_at := NEW.sla_resolution_due_at + (v_pause_duration || ' minutes')::interval;
            END IF;
        END IF;

        NEW.sla_paused_at := NULL;
        NEW.sla_status := 'within_sla';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER manage_case_sla_pause
    BEFORE UPDATE OF status ON app.cases
    FOR EACH ROW
    EXECUTE FUNCTION app.manage_case_sla_pause();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to create a case
CREATE OR REPLACE FUNCTION app.create_case(
    p_tenant_id uuid,
    p_requester_id uuid,
    p_category_id uuid,
    p_subject varchar(500),
    p_description text,
    p_priority app.case_priority DEFAULT NULL,
    p_case_type app.case_type DEFAULT NULL,
    p_source app.case_source DEFAULT 'self_service',
    p_on_behalf_of_id uuid DEFAULT NULL,
    p_custom_data jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_default_priority app.case_priority;
    v_default_type app.case_type;
BEGIN
    -- Get defaults from category
    SELECT default_priority, default_case_type
    INTO v_default_priority, v_default_type
    FROM app.case_categories
    WHERE id = p_category_id;

    -- Create the case
    INSERT INTO app.cases (
        tenant_id,
        requester_id,
        on_behalf_of_id,
        category_id,
        case_type,
        priority,
        subject,
        description,
        source,
        custom_data
    )
    VALUES (
        p_tenant_id,
        p_requester_id,
        p_on_behalf_of_id,
        p_category_id,
        COALESCE(p_case_type, v_default_type, 'inquiry'),
        COALESCE(p_priority, v_default_priority, 'medium'),
        p_subject,
        p_description,
        p_source,
        p_custom_data
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to assign a case
CREATE OR REPLACE FUNCTION app.assign_case(
    p_case_id uuid,
    p_assigned_to uuid,
    p_assigned_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.cases
    SET assigned_to = p_assigned_to,
        status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
        sla_response_met_at = CASE
            WHEN sla_response_met_at IS NULL THEN now()
            ELSE sla_response_met_at
        END
    WHERE id = p_case_id;

    RETURN FOUND;
END;
$$;

-- Function to escalate a case
CREATE OR REPLACE FUNCTION app.escalate_case(
    p_case_id uuid,
    p_escalated_by uuid,
    p_new_level app.escalation_level,
    p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.cases
    SET escalation_level = p_new_level,
        escalated_at = now(),
        escalated_by = p_escalated_by,
        internal_notes = COALESCE(internal_notes, '') ||
            E'\n[' || now()::text || '] Escalated to ' || p_new_level::text ||
            CASE WHEN p_reason IS NOT NULL THEN ': ' || p_reason ELSE '' END
    WHERE id = p_case_id;

    RETURN FOUND;
END;
$$;

-- Function to resolve a case
CREATE OR REPLACE FUNCTION app.resolve_case(
    p_case_id uuid,
    p_resolved_by uuid,
    p_resolution_type app.resolution_type,
    p_resolution_summary text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.cases
    SET status = 'resolved',
        resolution_type = p_resolution_type,
        resolution_summary = p_resolution_summary,
        resolved_at = now(),
        resolved_by = p_resolved_by
    WHERE id = p_case_id
      AND status NOT IN ('closed', 'cancelled');

    RETURN FOUND;
END;
$$;

-- Function to close a case
CREATE OR REPLACE FUNCTION app.close_case(
    p_case_id uuid,
    p_closed_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.cases
    SET status = 'closed',
        closed_at = now(),
        closed_by = p_closed_by
    WHERE id = p_case_id
      AND status = 'resolved';

    RETURN FOUND;
END;
$$;

-- Function to get case queue
CREATE OR REPLACE FUNCTION app.get_case_queue(
    p_tenant_id uuid,
    p_assigned_to uuid DEFAULT NULL,
    p_team_id uuid DEFAULT NULL,
    p_status app.case_status[] DEFAULT ARRAY['new', 'open', 'pending']::app.case_status[],
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    case_number varchar(50),
    subject varchar(500),
    requester_id uuid,
    category_name varchar(255),
    priority app.case_priority,
    status app.case_status,
    sla_status app.sla_status,
    sla_resolution_due_at timestamptz,
    escalation_level app.escalation_level,
    assigned_to uuid,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.case_number,
        c.subject,
        c.requester_id,
        cc.name AS category_name,
        c.priority,
        c.status,
        c.sla_status,
        c.sla_resolution_due_at,
        c.escalation_level,
        c.assigned_to,
        c.created_at,
        c.updated_at
    FROM app.cases c
    JOIN app.case_categories cc ON cc.id = c.category_id
    WHERE c.tenant_id = p_tenant_id
      AND c.status = ANY(p_status)
      AND (p_assigned_to IS NULL OR c.assigned_to = p_assigned_to)
      AND (p_team_id IS NULL OR c.assigned_team_id = p_team_id)
    ORDER BY
        CASE c.priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
        END,
        CASE c.sla_status
            WHEN 'breached' THEN 1
            WHEN 'warning' THEN 2
            ELSE 3
        END,
        c.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.cases IS 'HR service desk cases/tickets with SLA tracking and lifecycle management.';
COMMENT ON COLUMN app.cases.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.cases.tenant_id IS 'Tenant where this case exists';
COMMENT ON COLUMN app.cases.case_number IS 'Unique case number within tenant';
COMMENT ON COLUMN app.cases.requester_id IS 'Employee who submitted the case';
COMMENT ON COLUMN app.cases.on_behalf_of_id IS 'Employee the case is for (if different from requester)';
COMMENT ON COLUMN app.cases.category_id IS 'Case category for routing and SLA';
COMMENT ON COLUMN app.cases.case_type IS 'Type of case (inquiry, request, issue, etc.)';
COMMENT ON COLUMN app.cases.priority IS 'Case priority level';
COMMENT ON COLUMN app.cases.subject IS 'Case subject/title';
COMMENT ON COLUMN app.cases.description IS 'Detailed case description';
COMMENT ON COLUMN app.cases.status IS 'Current case status';
COMMENT ON COLUMN app.cases.source IS 'Channel through which case was created';
COMMENT ON COLUMN app.cases.assigned_to IS 'User assigned to work on this case';
COMMENT ON COLUMN app.cases.assigned_team_id IS 'Team assigned to this case';
COMMENT ON COLUMN app.cases.escalation_level IS 'Current escalation level';
COMMENT ON COLUMN app.cases.escalated_at IS 'When the case was last escalated';
COMMENT ON COLUMN app.cases.escalated_by IS 'User who escalated the case';
COMMENT ON COLUMN app.cases.sla_status IS 'Current SLA compliance status';
COMMENT ON COLUMN app.cases.sla_response_due_at IS 'When first response is due';
COMMENT ON COLUMN app.cases.sla_resolution_due_at IS 'When resolution is due';
COMMENT ON COLUMN app.cases.sla_response_met_at IS 'When first response was made';
COMMENT ON COLUMN app.cases.sla_paused_at IS 'When SLA timer was paused';
COMMENT ON COLUMN app.cases.sla_paused_duration_minutes IS 'Total minutes SLA was paused';
COMMENT ON COLUMN app.cases.resolution_type IS 'How the case was resolved';
COMMENT ON COLUMN app.cases.resolution_summary IS 'Summary of the resolution';
COMMENT ON COLUMN app.cases.resolved_at IS 'When the case was resolved';
COMMENT ON COLUMN app.cases.resolved_by IS 'User who resolved the case';
COMMENT ON COLUMN app.cases.closed_at IS 'When the case was closed';
COMMENT ON COLUMN app.cases.closed_by IS 'User who closed the case';
COMMENT ON COLUMN app.cases.related_case_id IS 'Related case (duplicate, follow-up)';
COMMENT ON COLUMN app.cases.custom_data IS 'Custom data per category schema';
COMMENT ON COLUMN app.cases.tags IS 'Tags for filtering';
COMMENT ON COLUMN app.cases.internal_notes IS 'Internal notes (not visible to requester)';
COMMENT ON COLUMN app.cases.satisfaction_rating IS 'Customer satisfaction rating (1-5)';
COMMENT ON COLUMN app.cases.satisfaction_feedback IS 'Customer satisfaction feedback';
COMMENT ON FUNCTION app.generate_case_number IS 'Auto-generates case number';
COMMENT ON FUNCTION app.calculate_case_sla_dates IS 'Calculates SLA due dates from category';
COMMENT ON FUNCTION app.validate_case_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.manage_case_sla_pause IS 'Handles SLA pause/resume';
COMMENT ON FUNCTION app.create_case IS 'Creates a new case';
COMMENT ON FUNCTION app.assign_case IS 'Assigns a case to a user';
COMMENT ON FUNCTION app.escalate_case IS 'Escalates a case';
COMMENT ON FUNCTION app.resolve_case IS 'Resolves a case';
COMMENT ON FUNCTION app.close_case IS 'Closes a resolved case';
COMMENT ON FUNCTION app.get_case_queue IS 'Returns case queue with filtering';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_case_queue(uuid, uuid, uuid, app.case_status[], integer, integer);
-- DROP FUNCTION IF EXISTS app.close_case(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.resolve_case(uuid, uuid, app.resolution_type, text);
-- DROP FUNCTION IF EXISTS app.escalate_case(uuid, uuid, app.escalation_level, text);
-- DROP FUNCTION IF EXISTS app.assign_case(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS app.create_case(uuid, uuid, uuid, varchar, text, app.case_priority, app.case_type, app.case_source, uuid, jsonb);
-- DROP TRIGGER IF EXISTS manage_case_sla_pause ON app.cases;
-- DROP FUNCTION IF EXISTS app.manage_case_sla_pause();
-- DROP TRIGGER IF EXISTS validate_case_status_transition ON app.cases;
-- DROP FUNCTION IF EXISTS app.validate_case_status_transition();
-- DROP TRIGGER IF EXISTS calculate_case_sla_dates ON app.cases;
-- DROP FUNCTION IF EXISTS app.calculate_case_sla_dates();
-- DROP TRIGGER IF EXISTS generate_case_number ON app.cases;
-- DROP FUNCTION IF EXISTS app.generate_case_number();
-- DROP TRIGGER IF EXISTS update_cases_updated_at ON app.cases;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.cases;
-- DROP POLICY IF EXISTS tenant_isolation ON app.cases;
-- DROP INDEX IF EXISTS app.idx_cases_search;
-- DROP INDEX IF EXISTS app.idx_cases_tags;
-- DROP INDEX IF EXISTS app.idx_cases_custom_data;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_escalated;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_open_created;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_sla_breached;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_category;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_priority_status;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_status;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_unassigned;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_team_status;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_assigned_status;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_requester_status;
-- DROP INDEX IF EXISTS app.idx_cases_tenant_number;
-- DROP TABLE IF EXISTS app.cases;
