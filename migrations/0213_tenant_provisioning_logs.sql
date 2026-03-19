-- Migration: 0213_tenant_provisioning_logs
-- Created: 2026-03-19
-- Description: Create provisioning_logs table to track tenant provisioning steps
--              and background_job_runs table for admin job monitoring.
--              Both tables use RLS for tenant isolation where applicable.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Provisioning logs - track automated tenant setup steps
-- NOT tenant-scoped for the initial insert (provisioning creates the tenant),
-- but subsequent reads are filtered by tenant_id for admin visibility.
CREATE TABLE IF NOT EXISTS app.provisioning_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The tenant being provisioned
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Overall provisioning status
    status varchar(30) NOT NULL DEFAULT 'pending',

    -- Provisioning step details as JSONB array
    -- Each entry: { step, status, startedAt, completedAt, error? }
    steps jsonb NOT NULL DEFAULT '[]',

    -- Who initiated the provisioning
    initiated_by uuid,

    -- Configuration used for provisioning
    config jsonb NOT NULL DEFAULT '{}',

    -- Error message if provisioning failed
    error_message text,

    -- Timestamps
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT provisioning_logs_status_check CHECK (
        status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')
    )
);

-- Enable RLS
ALTER TABLE app.provisioning_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.provisioning_logs
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.provisioning_logs
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass for provisioning (runs before tenant context is set)
CREATE POLICY system_bypass ON app.provisioning_logs
    USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.provisioning_logs
    FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provisioning_logs_tenant_id
    ON app.provisioning_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provisioning_logs_status
    ON app.provisioning_logs(status);

-- Auto-update updated_at
CREATE TRIGGER update_provisioning_logs_updated_at
    BEFORE UPDATE ON app.provisioning_logs
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE ON app.provisioning_logs TO hris_app;

-- =============================================================================
-- Background Job Runs - track background job execution for admin monitoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.background_job_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job identification
    job_name varchar(255) NOT NULL,
    job_type varchar(100) NOT NULL DEFAULT 'scheduled',

    -- Optional tenant scope (NULL for system-wide jobs)
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Job execution status
    status varchar(30) NOT NULL DEFAULT 'pending',

    -- Input parameters / configuration
    payload jsonb NOT NULL DEFAULT '{}',

    -- Output / result data
    result jsonb,

    -- Error details if failed
    error_message text,
    error_stack text,

    -- Retry tracking
    retry_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 3,
    next_retry_at timestamptz,

    -- Timing
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT background_job_runs_status_check CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'retrying', 'cancelled')
    ),
    CONSTRAINT background_job_runs_type_check CHECK (
        job_type IN ('scheduled', 'outbox', 'export', 'notification', 'analytics', 'pdf', 'manual')
    )
);

-- RLS on background_job_runs
ALTER TABLE app.background_job_runs ENABLE ROW LEVEL SECURITY;

-- Jobs with tenant_id are visible to that tenant; system jobs (NULL tenant_id) visible via system context
CREATE POLICY tenant_isolation ON app.background_job_runs
    USING (
        tenant_id = current_setting('app.current_tenant')::uuid
        OR tenant_id IS NULL
    );

CREATE POLICY tenant_isolation_insert ON app.background_job_runs
    FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.current_tenant')::uuid
        OR tenant_id IS NULL
    );

CREATE POLICY system_bypass ON app.background_job_runs
    USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.background_job_runs
    FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_background_job_runs_status
    ON app.background_job_runs(status);
CREATE INDEX IF NOT EXISTS idx_background_job_runs_tenant_id
    ON app.background_job_runs(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_background_job_runs_job_name
    ON app.background_job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_background_job_runs_failed
    ON app.background_job_runs(created_at DESC)
    WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_background_job_runs_created_at
    ON app.background_job_runs(created_at DESC);

-- Auto-update updated_at
CREATE TRIGGER update_background_job_runs_updated_at
    BEFORE UPDATE ON app.background_job_runs
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE ON app.background_job_runs TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.provisioning_logs IS 'Tracks tenant provisioning steps and status during automated tenant setup';
COMMENT ON TABLE app.background_job_runs IS 'Tracks background job execution for admin monitoring and retry management';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_background_job_runs_updated_at ON app.background_job_runs;
-- DROP TABLE IF EXISTS app.background_job_runs;
-- DROP TRIGGER IF EXISTS update_provisioning_logs_updated_at ON app.provisioning_logs;
-- DROP TABLE IF EXISTS app.provisioning_logs;
