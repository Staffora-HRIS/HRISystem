-- Migration: 0195_one_on_one_meetings
-- Created: 2026-03-17
-- Description: Create one_on_one_meetings table for manager 1:1 meeting notes.
--              Tracks meeting notes, action items, and scheduling between
--              managers and their direct reports.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Meeting Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'one_on_one_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.one_on_one_status AS ENUM ('scheduled', 'completed', 'cancelled');
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- One-on-One Meetings Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.one_on_one_meetings (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Participants
    manager_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Meeting details
    meeting_date date NOT NULL,
    status app.one_on_one_status NOT NULL DEFAULT 'scheduled',
    notes text,
    action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    next_meeting_date date,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT one_on_one_manager_employee_different CHECK (
        manager_id <> employee_id
    ),
    CONSTRAINT one_on_one_next_date_after_current CHECK (
        next_meeting_date IS NULL OR next_meeting_date > meeting_date
    ),
    CONSTRAINT one_on_one_action_items_is_array CHECK (
        jsonb_typeof(action_items) = 'array'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Lookup by tenant and manager (list my 1:1s as manager)
CREATE INDEX IF NOT EXISTS idx_one_on_one_tenant_manager
    ON app.one_on_one_meetings(tenant_id, manager_id, meeting_date DESC);

-- Lookup by tenant and employee (list my 1:1s as employee / history)
CREATE INDEX IF NOT EXISTS idx_one_on_one_tenant_employee
    ON app.one_on_one_meetings(tenant_id, employee_id, meeting_date DESC);

-- Lookup upcoming meetings for a manager
CREATE INDEX IF NOT EXISTS idx_one_on_one_upcoming
    ON app.one_on_one_meetings(tenant_id, manager_id, meeting_date)
    WHERE status = 'scheduled';

-- Cursor-based pagination ordering
CREATE INDEX IF NOT EXISTS idx_one_on_one_created_at
    ON app.one_on_one_meetings(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.one_on_one_meetings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see meetings for their current tenant
CREATE POLICY tenant_isolation ON app.one_on_one_meetings
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.one_on_one_meetings
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_one_on_one_meetings_updated_at
    BEFORE UPDATE ON app.one_on_one_meetings
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grants
-- =============================================================================

-- Grant access to the application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.one_on_one_meetings TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.one_on_one_meetings IS 'Manager 1:1 meeting notes with direct reports, including action items and scheduling';
COMMENT ON COLUMN app.one_on_one_meetings.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.one_on_one_meetings.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.one_on_one_meetings.manager_id IS 'Employee ID of the manager conducting the 1:1';
COMMENT ON COLUMN app.one_on_one_meetings.employee_id IS 'Employee ID of the direct report';
COMMENT ON COLUMN app.one_on_one_meetings.meeting_date IS 'Date of the 1:1 meeting';
COMMENT ON COLUMN app.one_on_one_meetings.status IS 'Meeting status: scheduled, completed, or cancelled';
COMMENT ON COLUMN app.one_on_one_meetings.notes IS 'Free-text meeting notes';
COMMENT ON COLUMN app.one_on_one_meetings.action_items IS 'JSON array of action items, each with text, assignee, and done status';
COMMENT ON COLUMN app.one_on_one_meetings.next_meeting_date IS 'Scheduled date for the next 1:1 meeting';
COMMENT ON TYPE app.one_on_one_status IS 'Status enum for 1:1 meetings';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_one_on_one_meetings_updated_at ON app.one_on_one_meetings;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.one_on_one_meetings;
-- DROP POLICY IF EXISTS tenant_isolation ON app.one_on_one_meetings;
-- DROP INDEX IF EXISTS app.idx_one_on_one_created_at;
-- DROP INDEX IF EXISTS app.idx_one_on_one_upcoming;
-- DROP INDEX IF EXISTS app.idx_one_on_one_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_one_on_one_tenant_manager;
-- DROP TABLE IF EXISTS app.one_on_one_meetings;
-- DROP TYPE IF EXISTS app.one_on_one_status;
