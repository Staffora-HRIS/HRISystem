-- Migration: 0195_agency_worker_assignments
-- Created: 2026-03-17
-- Description: Agency Workers Regulations (AWR) 2010 tracking.
--              Tracks agency worker assignments and the 12-week qualifying
--              period after which workers are entitled to same pay/conditions
--              as comparable permanent staff.
--
--              Key AWR rules:
--              - After 12 continuous calendar weeks in the same role, agency
--                workers become "qualified" and are entitled to equal treatment.
--              - Breaks in assignment can reset the clock depending on reason:
--                  * Break <= 6 weeks: clock continues (does NOT reset)
--                  * Break > 6 weeks: clock resets
--                  * Break due to sickness/injury (up to 28 weeks): clock pauses
--                  * Break for jury service: clock pauses
--                  * Break for annual leave: clock continues
--                  * Break for shutdown (e.g. factory closure up to 6 weeks): clock continues
--                  * Break for strike/lockout: clock pauses

-- =============================================================================
-- Enum Types
-- =============================================================================

-- Break reason determines whether the qualifying clock resets, pauses, or continues
CREATE TYPE app.awr_break_reason AS ENUM (
    'end_of_assignment',    -- Standard gap between assignments (>6 weeks resets)
    'sickness',             -- Up to 28 weeks: clock pauses
    'jury_service',         -- Clock pauses
    'annual_leave',         -- Clock continues
    'shutdown',             -- Workplace shutdown up to 6 weeks: clock continues
    'strike_lockout',       -- Clock pauses
    'maternity',            -- Clock pauses (up to 26 weeks)
    'other'                 -- Treated as end_of_assignment for clock purposes
);

-- Assignment status
CREATE TYPE app.awr_assignment_status AS ENUM (
    'active',               -- Currently working in the role
    'on_break',             -- Temporary break from assignment
    'qualified',            -- Has completed 12-week qualifying period
    'ended'                 -- Assignment concluded
);

-- =============================================================================
-- Main Table: agency_worker_assignments
-- =============================================================================

CREATE TABLE app.agency_worker_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    worker_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    agency_id       uuid NOT NULL REFERENCES app.recruitment_agencies(id) ON DELETE CASCADE,
    status          app.awr_assignment_status NOT NULL DEFAULT 'active',
    role            text NOT NULL,
    department      text,
    start_date      date NOT NULL,
    end_date        date,
    qualifying_date date NOT NULL,
    qualified       boolean NOT NULL DEFAULT false,
    hourly_rate     numeric(10,2) NOT NULL,
    comparable_rate numeric(10,2),
    breaks          jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Comments
COMMENT ON TABLE app.agency_worker_assignments IS 'Tracks agency worker assignments for AWR 2010 12-week qualifying period compliance.';
COMMENT ON COLUMN app.agency_worker_assignments.worker_id IS 'The agency worker (employee record).';
COMMENT ON COLUMN app.agency_worker_assignments.agency_id IS 'The recruitment agency supplying the worker.';
COMMENT ON COLUMN app.agency_worker_assignments.qualifying_date IS 'Calculated date when the worker qualifies for equal treatment (start_date + 12 weeks, adjusted for breaks).';
COMMENT ON COLUMN app.agency_worker_assignments.qualified IS 'Whether the worker has completed the 12-week qualifying period.';
COMMENT ON COLUMN app.agency_worker_assignments.hourly_rate IS 'Current hourly rate paid to the agency worker.';
COMMENT ON COLUMN app.agency_worker_assignments.comparable_rate IS 'Hourly rate of a comparable permanent employee in the same role. Required once worker qualifies.';
COMMENT ON COLUMN app.agency_worker_assignments.breaks IS 'JSON array of break records: [{reason, start_date, end_date, clock_effect}]. clock_effect is "continues", "pauses", or "resets".';

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.agency_worker_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
    ON app.agency_worker_assignments
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
    ON app.agency_worker_assignments
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for scheduler/worker operations across tenants)
CREATE POLICY system_bypass
    ON app.agency_worker_assignments
    USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert
    ON app.agency_worker_assignments
    FOR INSERT
    WITH CHECK (current_setting('app.system_context', true) = 'true');

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: worker assignments within a tenant
CREATE INDEX idx_awa_tenant_worker
    ON app.agency_worker_assignments(tenant_id, worker_id);

-- Qualifying soon: find active/on_break workers approaching qualifying date
CREATE INDEX idx_awa_qualifying_soon
    ON app.agency_worker_assignments(tenant_id, qualifying_date)
    WHERE status IN ('active', 'on_break') AND qualified = false;

-- Agency lookup
CREATE INDEX idx_awa_agency
    ON app.agency_worker_assignments(tenant_id, agency_id);

-- Status filter
CREATE INDEX idx_awa_status
    ON app.agency_worker_assignments(tenant_id, status);

-- =============================================================================
-- Updated-at trigger
-- =============================================================================

CREATE TRIGGER trg_awa_updated_at
    BEFORE UPDATE ON app.agency_worker_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.set_updated_at();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_awa_updated_at ON app.agency_worker_assignments;
-- DROP TABLE IF EXISTS app.agency_worker_assignments;
-- DROP TYPE IF EXISTS app.awr_assignment_status;
-- DROP TYPE IF EXISTS app.awr_break_reason;
