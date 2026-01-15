-- Migration: 0094_portal_tasks
-- Created: 2026-01-11
-- Description: Create tenant-scoped tasks table for portal task inbox

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Assign tasks to a user (typically derived from employee.user_id)
    assignee_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    task_type varchar(50) NOT NULL,
    title varchar(255) NOT NULL,
    description text,
    priority varchar(20) NOT NULL DEFAULT 'medium',
    status varchar(30) NOT NULL DEFAULT 'pending',
    due_date date,

    -- Optional deep link for UI
    link_url text,
    link_label varchar(100),

    -- Origin (workflow/task generators)
    source_type varchar(50),
    source_id uuid,

    metadata jsonb NOT NULL DEFAULT '{}',

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assignee_status
    ON app.tasks(tenant_id, assignee_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due
    ON app.tasks(tenant_id, due_date)
    WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source
    ON app.tasks(tenant_id, source_type, source_id)
    WHERE source_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.tasks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.tasks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON app.tasks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.tasks IS 'Tenant-scoped task inbox items for portal self-service experiences';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_tasks_updated_at ON app.tasks;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.tasks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.tasks;
-- DROP INDEX IF EXISTS app.idx_tasks_source;
-- DROP INDEX IF EXISTS app.idx_tasks_tenant_due;
-- DROP INDEX IF EXISTS app.idx_tasks_tenant_assignee_status;
-- DROP TABLE IF EXISTS app.tasks;
