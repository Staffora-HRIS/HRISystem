-- Migration: 0196_processing_activities_ropa
-- Created: 2026-03-17
-- Description: Records of Processing Activities (ROPA) register per UK GDPR Article 30.
--              Every controller must maintain a written record of processing activities
--              under their responsibility. This table stores the mandatory Article 30(1) fields.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Lawful basis enum (GDPR Article 6)
CREATE TYPE app.lawful_basis AS ENUM (
    'consent',
    'contract',
    'legal_obligation',
    'vital_interests',
    'public_task',
    'legitimate_interests'
);

-- Processing activity status
CREATE TYPE app.processing_activity_status AS ENUM (
    'draft',
    'active',
    'under_review',
    'archived'
);

-- Main ROPA table
CREATE TABLE app.processing_activities (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES app.tenants(id),

    -- Article 30(1)(a) — name and contact details of the controller
    name                    text NOT NULL,
    description             text,
    controller_name         text,
    controller_contact      text,
    dpo_contact             text,

    -- Article 30(1)(b) — purposes of the processing
    purpose                 text NOT NULL,
    lawful_basis            app.lawful_basis NOT NULL,
    lawful_basis_detail     text,

    -- Article 30(1)(c) — categories of data subjects and personal data
    data_subjects           jsonb NOT NULL DEFAULT '[]'::jsonb,
    data_categories         jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Article 30(1)(d) — categories of recipients
    recipients              jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Article 30(1)(e) — transfers to third countries
    international_transfers jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Article 30(1)(f) — envisaged time limits for erasure
    retention_period        text,

    -- Article 30(1)(g) — general description of technical and organisational security measures
    security_measures       text,

    -- DPIA requirement (Article 35)
    dpia_required           boolean NOT NULL DEFAULT false,
    dpia_id                 uuid,

    -- Status and lifecycle
    status                  app.processing_activity_status NOT NULL DEFAULT 'draft',
    last_reviewed_at        timestamptz,
    last_reviewed_by        uuid,

    -- Metadata
    created_by              uuid,
    updated_by              uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.processing_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
    ON app.processing_activities
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
    ON app.processing_activities
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Tenant listing (most common query)
CREATE INDEX idx_processing_activities_tenant
    ON app.processing_activities(tenant_id, created_at DESC);

-- Filter by status within a tenant
CREATE INDEX idx_processing_activities_tenant_status
    ON app.processing_activities(tenant_id, status);

-- Filter by lawful basis within a tenant
CREATE INDEX idx_processing_activities_tenant_lawful_basis
    ON app.processing_activities(tenant_id, lawful_basis);

-- Full-text search on name and purpose
CREATE INDEX idx_processing_activities_search
    ON app.processing_activities
    USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(purpose, '') || ' ' || coalesce(description, '')));

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.processing_activities TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.processing_activities IS 'Records of Processing Activities (ROPA) register per UK GDPR Article 30. Each row represents one processing activity that the controller carries out.';
COMMENT ON COLUMN app.processing_activities.name IS 'Name/title of the processing activity';
COMMENT ON COLUMN app.processing_activities.purpose IS 'Purpose(s) of the processing (Article 30(1)(b))';
COMMENT ON COLUMN app.processing_activities.lawful_basis IS 'Lawful basis under GDPR Article 6';
COMMENT ON COLUMN app.processing_activities.lawful_basis_detail IS 'Additional detail on the lawful basis (e.g., which legitimate interest)';
COMMENT ON COLUMN app.processing_activities.data_subjects IS 'JSON array of categories of data subjects (e.g., ["employees", "job_applicants"])';
COMMENT ON COLUMN app.processing_activities.data_categories IS 'JSON array of categories of personal data processed (e.g., ["name", "email", "salary"])';
COMMENT ON COLUMN app.processing_activities.recipients IS 'JSON array of categories of recipients (e.g., ["HMRC", "pension_provider"])';
COMMENT ON COLUMN app.processing_activities.international_transfers IS 'JSON array of international transfers with safeguards (e.g., [{"country": "US", "safeguard": "SCCs"}])';
COMMENT ON COLUMN app.processing_activities.retention_period IS 'Envisaged time limits for erasure (Article 30(1)(f))';
COMMENT ON COLUMN app.processing_activities.security_measures IS 'General description of technical and organisational security measures (Article 30(1)(g))';
COMMENT ON COLUMN app.processing_activities.dpia_required IS 'Whether a Data Protection Impact Assessment is required (Article 35)';
COMMENT ON COLUMN app.processing_activities.dpia_id IS 'Reference to the DPIA record if one exists';
COMMENT ON COLUMN app.processing_activities.controller_name IS 'Name of the data controller (Article 30(1)(a))';
COMMENT ON COLUMN app.processing_activities.controller_contact IS 'Contact details of the data controller';
COMMENT ON COLUMN app.processing_activities.dpo_contact IS 'Contact details of the Data Protection Officer';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.processing_activities;
-- DROP TYPE IF EXISTS app.processing_activity_status;
-- DROP TYPE IF EXISTS app.lawful_basis;
