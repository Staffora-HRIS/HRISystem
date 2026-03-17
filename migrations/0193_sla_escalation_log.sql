-- Migration: 0193_sla_escalation_log
-- Created: 2026-03-17
-- Description: Create the sla_escalation_log table for tracking automatic SLA
--              escalation events across both workflow tasks and cases.
--              Supports the auto-escalation scheduler job (TODO-156).

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SLA Escalation Log Table
-- -----------------------------------------------------------------------------
-- Immutable audit log of all automatic SLA escalation actions.
-- Records are created by the scheduler when SLA breaches trigger escalation.
-- Covers both workflow tasks and case tickets.
CREATE TABLE IF NOT EXISTS app.sla_escalation_log (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this escalation occurred
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- What was escalated: 'workflow_task' or 'case'
    entity_type varchar(50) NOT NULL,

    -- ID of the escalated entity (workflow_task.id or cases.id)
    entity_id uuid NOT NULL,

    -- What action was taken
    -- For workflows: matches escalation_action enum (notify, reassign, auto_approve, auto_reject)
    -- For cases: 'escalate_tier', 'notify', 'reassign'
    action_taken varchar(50) NOT NULL,

    -- Previous assignee (user ID or NULL)
    previous_assignee_id uuid,

    -- New assignee after escalation (user ID or NULL for notify-only)
    new_assignee_id uuid,

    -- Previous escalation level (for cases)
    previous_level varchar(50),

    -- New escalation level (for cases)
    new_level varchar(50),

    -- Human-readable reason for the escalation
    reason text NOT NULL,

    -- Reference to the SLA definition that triggered this (for workflows)
    sla_id uuid REFERENCES app.workflow_slas(id) ON DELETE SET NULL,

    -- Reference to the SLA event that was processed (for workflows)
    sla_event_id uuid REFERENCES app.workflow_sla_events(id) ON DELETE SET NULL,

    -- When the escalation was performed
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT sla_escalation_log_entity_type_valid CHECK (
        entity_type IN ('workflow_task', 'case')
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Lookup by entity (to see escalation history for a task/case)
CREATE INDEX IF NOT EXISTS idx_sla_escalation_log_entity
    ON app.sla_escalation_log(entity_type, entity_id);

-- Tenant + time range (for dashboards and reporting)
CREATE INDEX IF NOT EXISTS idx_sla_escalation_log_tenant_created
    ON app.sla_escalation_log(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.sla_escalation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.sla_escalation_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.sla_escalation_log
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.sla_escalation_log IS 'Immutable audit log of automatic SLA escalation actions for workflow tasks and cases.';
COMMENT ON COLUMN app.sla_escalation_log.entity_type IS 'Type of escalated entity: workflow_task or case';
COMMENT ON COLUMN app.sla_escalation_log.entity_id IS 'ID of the escalated entity';
COMMENT ON COLUMN app.sla_escalation_log.action_taken IS 'Escalation action: notify, reassign, auto_approve, auto_reject, escalate_tier';
COMMENT ON COLUMN app.sla_escalation_log.reason IS 'Human-readable reason for the escalation';
COMMENT ON COLUMN app.sla_escalation_log.sla_id IS 'Reference to the SLA definition (workflows only)';
COMMENT ON COLUMN app.sla_escalation_log.sla_event_id IS 'Reference to the SLA event that was processed (workflows only)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.sla_escalation_log;
-- DROP POLICY IF EXISTS tenant_isolation ON app.sla_escalation_log;
-- DROP INDEX IF EXISTS app.idx_sla_escalation_log_tenant_created;
-- DROP INDEX IF EXISTS app.idx_sla_escalation_log_entity;
-- DROP TABLE IF EXISTS app.sla_escalation_log;
