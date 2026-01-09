-- Migration: 0058_candidates
-- Created: 2026-01-07
-- Description: Create the candidates table for job applicants
--              Tracks candidate information, current stage, source, and application details
--              Links to requisitions and supports pipeline tracking

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Job Candidates Table
-- -----------------------------------------------------------------------------
-- Represents candidates applying for job requisitions
-- Tracks their progression through the hiring pipeline
CREATE TABLE IF NOT EXISTS app.candidates (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this candidate record
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Requisition this candidate is applying for
    requisition_id uuid NOT NULL REFERENCES app.requisitions(id) ON DELETE CASCADE,

    -- Candidate contact information
    email varchar(255) NOT NULL,
    first_name varchar(100) NOT NULL,
    last_name varchar(100) NOT NULL,
    phone varchar(50),

    -- Current stage in the hiring pipeline
    current_stage app.candidate_stage NOT NULL DEFAULT 'applied',

    -- Source of the application
    source varchar(50) NOT NULL DEFAULT 'direct',

    -- External profile links
    resume_url text,
    linkedin_url text,

    -- Overall candidate rating (1-5 stars)
    rating numeric(2,1),

    -- Additional notes and metadata
    -- Structure: {
    --   "referrer_id": "uuid",          -- Employee who referred
    --   "referrer_name": "string",
    --   "agency_name": "string",
    --   "agency_contact": "string",
    --   "cover_letter": "text",
    --   "custom_fields": { ... },
    --   "tags": ["senior", "remote-ok"]
    -- }
    notes jsonb DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Email format validation
    CONSTRAINT candidates_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),

    -- Same candidate cannot apply twice for same requisition
    CONSTRAINT candidates_unique_application UNIQUE (tenant_id, requisition_id, email),

    -- Rating must be between 1 and 5
    CONSTRAINT candidates_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),

    -- Source must be one of known values
    CONSTRAINT candidates_source_valid CHECK (
        source IN ('direct', 'referral', 'job_board', 'agency', 'linkedin', 'internal', 'career_site', 'other')
    ),

    -- LinkedIn URL format (basic validation)
    CONSTRAINT candidates_linkedin_format CHECK (
        linkedin_url IS NULL OR linkedin_url ~ '^https?://(www\.)?linkedin\.com/'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + requisition
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_requisition
    ON app.candidates(tenant_id, requisition_id);

-- Email lookup (find candidates by email across requisitions)
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_email
    ON app.candidates(tenant_id, email);

-- Stage filtering (pipeline view)
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_stage
    ON app.candidates(tenant_id, current_stage);

-- Active candidates (not rejected/withdrawn/hired)
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_active
    ON app.candidates(tenant_id, requisition_id)
    WHERE current_stage NOT IN ('rejected', 'withdrawn', 'hired');

-- Source analytics
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_source
    ON app.candidates(tenant_id, source);

-- Rating for top candidates
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_rating
    ON app.candidates(tenant_id, rating DESC NULLS LAST)
    WHERE rating IS NOT NULL;

-- Recent applications
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_created
    ON app.candidates(tenant_id, created_at DESC);

-- Name search
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_name
    ON app.candidates(tenant_id, last_name, first_name);

-- GIN index for notes search
CREATE INDEX IF NOT EXISTS idx_candidates_notes
    ON app.candidates USING gin(notes);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.candidates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see candidates for their current tenant
CREATE POLICY tenant_isolation ON app.candidates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.candidates
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_candidates_updated_at
    BEFORE UPDATE ON app.candidates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get candidates for a requisition by stage
CREATE OR REPLACE FUNCTION app.get_candidates_by_requisition(
    p_requisition_id uuid,
    p_stage app.candidate_stage DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    email varchar(255),
    first_name varchar(100),
    last_name varchar(100),
    phone varchar(50),
    current_stage app.candidate_stage,
    source varchar(50),
    rating numeric(2,1),
    resume_url text,
    linkedin_url text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        c.phone,
        c.current_stage,
        c.source,
        c.rating,
        c.resume_url,
        c.linkedin_url,
        c.created_at
    FROM app.candidates c
    WHERE c.requisition_id = p_requisition_id
      AND (p_stage IS NULL OR c.current_stage = p_stage)
    ORDER BY
        CASE c.current_stage
            WHEN 'offer' THEN 1
            WHEN 'interview' THEN 2
            WHEN 'screening' THEN 3
            WHEN 'applied' THEN 4
            WHEN 'hired' THEN 5
            WHEN 'rejected' THEN 6
            WHEN 'withdrawn' THEN 7
        END,
        c.rating DESC NULLS LAST,
        c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get pipeline summary for a requisition
CREATE OR REPLACE FUNCTION app.get_requisition_pipeline(
    p_requisition_id uuid
)
RETURNS TABLE (
    stage app.candidate_stage,
    count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT c.current_stage, COUNT(*)::bigint
    FROM app.candidates c
    WHERE c.requisition_id = p_requisition_id
    GROUP BY c.current_stage
    ORDER BY
        CASE c.current_stage
            WHEN 'applied' THEN 1
            WHEN 'screening' THEN 2
            WHEN 'interview' THEN 3
            WHEN 'offer' THEN 4
            WHEN 'hired' THEN 5
            WHEN 'rejected' THEN 6
            WHEN 'withdrawn' THEN 7
        END;
END;
$$;

-- Function to search candidates across requisitions
CREATE OR REPLACE FUNCTION app.search_candidates(
    p_tenant_id uuid,
    p_search_term text,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    requisition_id uuid,
    email varchar(255),
    first_name varchar(100),
    last_name varchar(100),
    current_stage app.candidate_stage,
    source varchar(50),
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.requisition_id,
        c.email,
        c.first_name,
        c.last_name,
        c.current_stage,
        c.source,
        c.created_at
    FROM app.candidates c
    WHERE c.tenant_id = p_tenant_id
      AND (
          c.email ILIKE '%' || p_search_term || '%'
          OR c.first_name ILIKE '%' || p_search_term || '%'
          OR c.last_name ILIKE '%' || p_search_term || '%'
          OR (c.first_name || ' ' || c.last_name) ILIKE '%' || p_search_term || '%'
      )
    ORDER BY c.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to get source analytics
CREATE OR REPLACE FUNCTION app.get_candidate_source_stats(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    source varchar(50),
    total_candidates bigint,
    hired_count bigint,
    rejected_count bigint,
    conversion_rate numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.source,
        COUNT(*)::bigint AS total_candidates,
        COUNT(*) FILTER (WHERE c.current_stage = 'hired')::bigint AS hired_count,
        COUNT(*) FILTER (WHERE c.current_stage = 'rejected')::bigint AS rejected_count,
        ROUND(
            COUNT(*) FILTER (WHERE c.current_stage = 'hired')::numeric /
            NULLIF(COUNT(*)::numeric, 0) * 100,
            2
        ) AS conversion_rate
    FROM app.candidates c
    WHERE c.tenant_id = p_tenant_id
      AND c.created_at::date >= p_from_date
      AND c.created_at::date <= p_to_date
    GROUP BY c.source
    ORDER BY total_candidates DESC;
END;
$$;

-- Function to move candidate to next stage
CREATE OR REPLACE FUNCTION app.advance_candidate_stage(
    p_candidate_id uuid,
    p_new_stage app.candidate_stage,
    p_actor_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_stage app.candidate_stage;
    v_tenant_id uuid;
BEGIN
    -- Get current stage
    SELECT current_stage, tenant_id INTO v_current_stage, v_tenant_id
    FROM app.candidates
    WHERE id = p_candidate_id;

    IF v_current_stage IS NULL THEN
        RAISE EXCEPTION 'Candidate not found: %', p_candidate_id;
    END IF;

    -- Don't allow transition from terminal states
    IF v_current_stage IN ('hired', 'rejected', 'withdrawn') THEN
        RAISE EXCEPTION 'Cannot transition from terminal stage: %', v_current_stage;
    END IF;

    -- Update the stage
    UPDATE app.candidates
    SET current_stage = p_new_stage,
        updated_at = now()
    WHERE id = p_candidate_id;

    -- Log the stage change event
    INSERT INTO app.candidate_stage_events (
        tenant_id,
        candidate_id,
        from_stage,
        to_stage,
        reason,
        actor_id
    )
    VALUES (
        v_tenant_id,
        p_candidate_id,
        v_current_stage,
        p_new_stage,
        p_reason,
        p_actor_id
    );

    RETURN true;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.candidates IS 'Job candidates applying for requisitions with pipeline stage tracking';
COMMENT ON COLUMN app.candidates.id IS 'Primary UUID identifier for the candidate';
COMMENT ON COLUMN app.candidates.tenant_id IS 'Tenant that owns this candidate record';
COMMENT ON COLUMN app.candidates.requisition_id IS 'Requisition the candidate is applying for';
COMMENT ON COLUMN app.candidates.email IS 'Candidate email address';
COMMENT ON COLUMN app.candidates.first_name IS 'Candidate first name';
COMMENT ON COLUMN app.candidates.last_name IS 'Candidate last name';
COMMENT ON COLUMN app.candidates.phone IS 'Candidate phone number';
COMMENT ON COLUMN app.candidates.current_stage IS 'Current stage in hiring pipeline';
COMMENT ON COLUMN app.candidates.source IS 'Application source (direct, referral, job_board, agency, etc.)';
COMMENT ON COLUMN app.candidates.resume_url IS 'URL to uploaded resume';
COMMENT ON COLUMN app.candidates.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN app.candidates.rating IS 'Overall candidate rating (1-5)';
COMMENT ON COLUMN app.candidates.notes IS 'Additional metadata, referrer info, tags, etc.';
COMMENT ON FUNCTION app.get_candidates_by_requisition IS 'Returns candidates for a requisition with optional stage filter';
COMMENT ON FUNCTION app.get_requisition_pipeline IS 'Returns candidate count by stage for a requisition';
COMMENT ON FUNCTION app.search_candidates IS 'Searches candidates by name or email across all requisitions';
COMMENT ON FUNCTION app.get_candidate_source_stats IS 'Returns source effectiveness analytics';
COMMENT ON FUNCTION app.advance_candidate_stage IS 'Moves candidate to new stage and logs the transition';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.advance_candidate_stage(uuid, app.candidate_stage, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_candidate_source_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.search_candidates(uuid, text, integer);
-- DROP FUNCTION IF EXISTS app.get_requisition_pipeline(uuid);
-- DROP FUNCTION IF EXISTS app.get_candidates_by_requisition(uuid, app.candidate_stage, integer, integer);
-- DROP TRIGGER IF EXISTS update_candidates_updated_at ON app.candidates;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.candidates;
-- DROP POLICY IF EXISTS tenant_isolation ON app.candidates;
-- DROP INDEX IF EXISTS app.idx_candidates_notes;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_name;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_created;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_rating;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_source;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_active;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_stage;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_email;
-- DROP INDEX IF EXISTS app.idx_candidates_tenant_requisition;
-- DROP TABLE IF EXISTS app.candidates;
