-- Migration: 0195_peer_recognitions
-- Created: 2026-03-17
-- Description: Create peer_recognitions table for peer feedback and recognition.
--              Supports categories (teamwork, innovation, leadership, service, values)
--              and visibility levels (public, private, manager_only).

-- =============================================================================
-- Enum Types
-- =============================================================================

CREATE TYPE app.recognition_category AS ENUM (
    'teamwork',
    'innovation',
    'leadership',
    'service',
    'values'
);

CREATE TYPE app.recognition_visibility AS ENUM (
    'public',
    'private',
    'manager_only'
);

-- =============================================================================
-- Table
-- =============================================================================

CREATE TABLE app.peer_recognitions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
    from_employee_id uuid NOT NULL REFERENCES app.employees(id),
    to_employee_id  uuid NOT NULL REFERENCES app.employees(id),
    category        app.recognition_category NOT NULL,
    message         text NOT NULL,
    visibility      app.recognition_visibility NOT NULL DEFAULT 'public',
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- Cannot recognise yourself
    CONSTRAINT peer_recognitions_no_self_recognition CHECK (from_employee_id <> to_employee_id)
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.peer_recognitions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation
    ON app.peer_recognitions
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation policy (INSERT)
CREATE POLICY tenant_isolation_insert
    ON app.peer_recognitions
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for listing recognitions received by an employee
CREATE INDEX idx_peer_recognitions_to_employee
    ON app.peer_recognitions(tenant_id, to_employee_id, created_at DESC);

-- Index for listing recognitions given by an employee
CREATE INDEX idx_peer_recognitions_from_employee
    ON app.peer_recognitions(tenant_id, from_employee_id, created_at DESC);

-- Index for public feed (visibility + tenant + recency)
CREATE INDEX idx_peer_recognitions_public_feed
    ON app.peer_recognitions(tenant_id, created_at DESC)
    WHERE visibility = 'public';

-- Index for leaderboard aggregation
CREATE INDEX idx_peer_recognitions_leaderboard
    ON app.peer_recognitions(tenant_id, to_employee_id);

-- Index for category filtering
CREATE INDEX idx_peer_recognitions_category
    ON app.peer_recognitions(tenant_id, category, created_at DESC);

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT ON app.peer_recognitions TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.peer_recognitions IS 'Peer-to-peer recognition and feedback. Employees can recognise colleagues for teamwork, innovation, leadership, service excellence, and living company values.';
COMMENT ON COLUMN app.peer_recognitions.category IS 'Recognition category: teamwork, innovation, leadership, service, values.';
COMMENT ON COLUMN app.peer_recognitions.visibility IS 'Who can see this recognition: public (everyone), private (giver and receiver only), manager_only (plus line managers).';
COMMENT ON COLUMN app.peer_recognitions.message IS 'Free-text recognition message from the giver.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.peer_recognitions;
-- DROP TYPE IF EXISTS app.recognition_visibility;
-- DROP TYPE IF EXISTS app.recognition_category;
