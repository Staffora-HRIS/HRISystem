-- Migration: 0065_reviews
-- Created: 2026-01-07
-- Description: Create the reviews table for performance reviews
--              Supports self-reviews, manager reviews, peer reviews, and skip-level reviews

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Performance Reviews Table
-- -----------------------------------------------------------------------------
-- Represents individual performance reviews within a cycle
-- Multiple reviewers can review the same employee (self, manager, peer, skip-level)
CREATE TABLE IF NOT EXISTS app.reviews (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this review
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being reviewed
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Performance cycle this review belongs to
    cycle_id uuid NOT NULL REFERENCES app.performance_cycles(id) ON DELETE CASCADE,

    -- Who is writing the review
    reviewer_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Type of review (self, manager, peer, skip_level)
    reviewer_type app.reviewer_type NOT NULL,

    -- Review status
    status app.review_status NOT NULL DEFAULT 'not_started',

    -- Overall rating (1-5 scale or custom scale)
    overall_rating numeric(3, 1),

    -- Per-competency ratings as structured JSON
    -- Structure: {
    --   "communication": { "rating": 4, "comment": "Excellent presenter" },
    --   "technical_skills": { "rating": 5, "comment": "Expert level" },
    --   "leadership": { "rating": 3, "comment": "Developing" }
    -- }
    ratings jsonb DEFAULT '{}',

    -- Qualitative feedback
    strengths text,
    development_areas text,
    comments text,

    -- Timeline
    submitted_at timestamptz,
    acknowledged_at timestamptz,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One review per reviewer per employee per cycle per type
    CONSTRAINT reviews_unique UNIQUE (tenant_id, employee_id, cycle_id, reviewer_id, reviewer_type),

    -- Overall rating scale (typically 1-5)
    CONSTRAINT reviews_rating_range CHECK (
        overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)
    ),

    -- Self-review must be by the employee themselves
    CONSTRAINT reviews_self_review_valid CHECK (
        reviewer_type != 'self' OR reviewer_id = employee_id
    ),

    -- Non-self review must be by someone else
    CONSTRAINT reviews_other_review_valid CHECK (
        reviewer_type = 'self' OR reviewer_id != employee_id
    ),

    -- Submitted reviews must have submission timestamp
    CONSTRAINT reviews_submitted_has_timestamp CHECK (
        status NOT IN ('submitted', 'acknowledged') OR submitted_at IS NOT NULL
    ),

    -- Acknowledged reviews must have acknowledgment timestamp
    CONSTRAINT reviews_acknowledged_has_timestamp CHECK (
        status != 'acknowledged' OR acknowledged_at IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee + cycle
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_employee_cycle
    ON app.reviews(tenant_id, employee_id, cycle_id);

-- Cycle reviews
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_cycle
    ON app.reviews(tenant_id, cycle_id);

-- Reviewer's reviews (my reviews to complete)
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_reviewer
    ON app.reviews(tenant_id, reviewer_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_status
    ON app.reviews(tenant_id, status);

-- Pending reviews (for notifications)
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_pending
    ON app.reviews(tenant_id, reviewer_id)
    WHERE status IN ('not_started', 'in_progress');

-- Review type analytics
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_type
    ON app.reviews(tenant_id, reviewer_type);

-- Overall rating (for calibration)
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_rating
    ON app.reviews(tenant_id, cycle_id, overall_rating)
    WHERE overall_rating IS NOT NULL;

-- GIN index for ratings search
CREATE INDEX IF NOT EXISTS idx_reviews_ratings
    ON app.reviews USING gin(ratings);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see reviews for their current tenant
CREATE POLICY tenant_isolation ON app.reviews
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.reviews
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON app.reviews
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate review status transitions
CREATE OR REPLACE FUNCTION app.validate_review_status_transition()
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
        WHEN 'not_started' THEN
            -- not_started can only transition to in_progress
            IF NEW.status NOT IN ('in_progress') THEN
                RAISE EXCEPTION 'Invalid status transition: not_started can only transition to in_progress, not %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            -- in_progress can transition to submitted or back to not_started (reset)
            IF NEW.status NOT IN ('submitted', 'not_started') THEN
                RAISE EXCEPTION 'Invalid status transition: in_progress can only transition to submitted or not_started, not %', NEW.status;
            END IF;

        WHEN 'submitted' THEN
            -- submitted can transition to acknowledged or back to in_progress (for edits)
            IF NEW.status NOT IN ('acknowledged', 'in_progress') THEN
                RAISE EXCEPTION 'Invalid status transition: submitted can only transition to acknowledged or in_progress, not %', NEW.status;
            END IF;

        WHEN 'acknowledged' THEN
            -- acknowledged is a terminal state
            RAISE EXCEPTION 'Invalid status transition: acknowledged is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_review_status_transition
    BEFORE UPDATE OF status ON app.reviews
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_review_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get reviews for an employee in a cycle
CREATE OR REPLACE FUNCTION app.get_employee_reviews(
    p_employee_id uuid,
    p_cycle_id uuid
)
RETURNS TABLE (
    id uuid,
    reviewer_id uuid,
    reviewer_type app.reviewer_type,
    status app.review_status,
    overall_rating numeric(3, 1),
    ratings jsonb,
    strengths text,
    development_areas text,
    submitted_at timestamptz,
    acknowledged_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.reviewer_id,
        r.reviewer_type,
        r.status,
        r.overall_rating,
        r.ratings,
        r.strengths,
        r.development_areas,
        r.submitted_at,
        r.acknowledged_at
    FROM app.reviews r
    WHERE r.employee_id = p_employee_id
      AND r.cycle_id = p_cycle_id
    ORDER BY
        CASE r.reviewer_type
            WHEN 'self' THEN 1
            WHEN 'manager' THEN 2
            WHEN 'skip_level' THEN 3
            WHEN 'peer' THEN 4
        END;
END;
$$;

-- Function to get pending reviews for a reviewer
CREATE OR REPLACE FUNCTION app.get_pending_reviews(
    p_reviewer_id uuid,
    p_cycle_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    cycle_id uuid,
    reviewer_type app.reviewer_type,
    status app.review_status,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.employee_id,
        r.cycle_id,
        r.reviewer_type,
        r.status,
        r.created_at
    FROM app.reviews r
    JOIN app.performance_cycles pc ON pc.id = r.cycle_id
    WHERE r.reviewer_id = p_reviewer_id
      AND r.status IN ('not_started', 'in_progress')
      AND (p_cycle_id IS NULL OR r.cycle_id = p_cycle_id)
      AND pc.status IN ('active', 'review')
    ORDER BY
        CASE r.status
            WHEN 'in_progress' THEN 1
            WHEN 'not_started' THEN 2
        END,
        r.created_at ASC;
END;
$$;

-- Function to submit a review
CREATE OR REPLACE FUNCTION app.submit_review(
    p_review_id uuid,
    p_overall_rating numeric(3, 1),
    p_ratings jsonb DEFAULT NULL,
    p_strengths text DEFAULT NULL,
    p_development_areas text DEFAULT NULL,
    p_comments text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.review_status;
BEGIN
    SELECT status INTO v_current_status
    FROM app.reviews
    WHERE id = p_review_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Review not found: %', p_review_id;
    END IF;

    IF v_current_status NOT IN ('not_started', 'in_progress') THEN
        RAISE EXCEPTION 'Cannot submit review with status: %', v_current_status;
    END IF;

    UPDATE app.reviews
    SET status = 'submitted',
        overall_rating = p_overall_rating,
        ratings = COALESCE(p_ratings, ratings),
        strengths = p_strengths,
        development_areas = p_development_areas,
        comments = p_comments,
        submitted_at = now(),
        updated_at = now()
    WHERE id = p_review_id;

    RETURN true;
END;
$$;

-- Function to acknowledge a review
CREATE OR REPLACE FUNCTION app.acknowledge_review(
    p_review_id uuid,
    p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.review_status;
    v_review_employee_id uuid;
BEGIN
    SELECT status, employee_id INTO v_current_status, v_review_employee_id
    FROM app.reviews
    WHERE id = p_review_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Review not found: %', p_review_id;
    END IF;

    -- Only the reviewee can acknowledge
    IF v_review_employee_id != p_employee_id THEN
        RAISE EXCEPTION 'Only the reviewee can acknowledge this review';
    END IF;

    IF v_current_status != 'submitted' THEN
        RAISE EXCEPTION 'Cannot acknowledge review with status: %', v_current_status;
    END IF;

    UPDATE app.reviews
    SET status = 'acknowledged',
        acknowledged_at = now(),
        updated_at = now()
    WHERE id = p_review_id;

    RETURN true;
END;
$$;

-- Function to get review completion statistics for a cycle
CREATE OR REPLACE FUNCTION app.get_review_completion_stats(
    p_cycle_id uuid
)
RETURNS TABLE (
    reviewer_type app.reviewer_type,
    total_reviews bigint,
    not_started_count bigint,
    in_progress_count bigint,
    submitted_count bigint,
    acknowledged_count bigint,
    completion_rate numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.reviewer_type,
        COUNT(*)::bigint AS total_reviews,
        COUNT(*) FILTER (WHERE r.status = 'not_started')::bigint AS not_started_count,
        COUNT(*) FILTER (WHERE r.status = 'in_progress')::bigint AS in_progress_count,
        COUNT(*) FILTER (WHERE r.status = 'submitted')::bigint AS submitted_count,
        COUNT(*) FILTER (WHERE r.status = 'acknowledged')::bigint AS acknowledged_count,
        ROUND(
            COUNT(*) FILTER (WHERE r.status IN ('submitted', 'acknowledged'))::numeric /
            NULLIF(COUNT(*)::numeric, 0) * 100,
            2
        ) AS completion_rate
    FROM app.reviews r
    WHERE r.cycle_id = p_cycle_id
    GROUP BY r.reviewer_type
    ORDER BY
        CASE r.reviewer_type
            WHEN 'self' THEN 1
            WHEN 'manager' THEN 2
            WHEN 'skip_level' THEN 3
            WHEN 'peer' THEN 4
        END;
END;
$$;

-- Function to get rating distribution for calibration
CREATE OR REPLACE FUNCTION app.get_rating_distribution(
    p_cycle_id uuid,
    p_org_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
    rating numeric(3, 1),
    count bigint,
    percentage numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total bigint;
BEGIN
    -- Get total submitted manager reviews
    SELECT COUNT(*) INTO v_total
    FROM app.reviews r
    WHERE r.cycle_id = p_cycle_id
      AND r.reviewer_type = 'manager'
      AND r.status IN ('submitted', 'acknowledged')
      AND r.overall_rating IS NOT NULL;

    RETURN QUERY
    SELECT
        r.overall_rating,
        COUNT(*)::bigint AS count,
        ROUND(COUNT(*)::numeric / NULLIF(v_total::numeric, 0) * 100, 2) AS percentage
    FROM app.reviews r
    WHERE r.cycle_id = p_cycle_id
      AND r.reviewer_type = 'manager'
      AND r.status IN ('submitted', 'acknowledged')
      AND r.overall_rating IS NOT NULL
    GROUP BY r.overall_rating
    ORDER BY r.overall_rating DESC;
END;
$$;

-- Function to create review requests for a cycle
CREATE OR REPLACE FUNCTION app.create_cycle_reviews(
    p_cycle_id uuid,
    p_include_self boolean DEFAULT true,
    p_include_manager boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_org_unit_id uuid;
    v_count integer := 0;
    v_rows integer := 0;
BEGIN
    -- Get cycle details
    SELECT tenant_id, org_unit_id INTO v_tenant_id, v_org_unit_id
    FROM app.performance_cycles
    WHERE id = p_cycle_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Performance cycle not found: %', p_cycle_id;
    END IF;

    -- Create self-reviews
    IF p_include_self THEN
        INSERT INTO app.reviews (tenant_id, employee_id, cycle_id, reviewer_id, reviewer_type)
        SELECT DISTINCT
            v_tenant_id,
            e.id,
            p_cycle_id,
            e.id,
            'self'::app.reviewer_type
        FROM app.employees e
        WHERE e.tenant_id = v_tenant_id
          AND e.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM app.reviews r
              WHERE r.employee_id = e.id
                AND r.cycle_id = p_cycle_id
                AND r.reviewer_type = 'self'
          )
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    -- Create manager reviews
    IF p_include_manager THEN
        INSERT INTO app.reviews (tenant_id, employee_id, cycle_id, reviewer_id, reviewer_type)
        SELECT DISTINCT
            v_tenant_id,
            e.id,
            p_cycle_id,
            rl.manager_id,
            'manager'::app.reviewer_type
        FROM app.employees e
        JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.is_current = true
        WHERE e.tenant_id = v_tenant_id
          AND e.status = 'active'
          AND rl.manager_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM app.reviews r
              WHERE r.employee_id = e.id
                AND r.cycle_id = p_cycle_id
                AND r.reviewer_id = rl.manager_id
                AND r.reviewer_type = 'manager'
          )
        ON CONFLICT DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_count := v_count + v_rows;
    END IF;

    RETURN v_count;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.reviews IS 'Performance reviews with ratings, feedback, and multi-reviewer support';
COMMENT ON COLUMN app.reviews.id IS 'Primary UUID identifier for the review';
COMMENT ON COLUMN app.reviews.tenant_id IS 'Tenant that owns this review';
COMMENT ON COLUMN app.reviews.employee_id IS 'Employee being reviewed';
COMMENT ON COLUMN app.reviews.cycle_id IS 'Performance cycle this review belongs to';
COMMENT ON COLUMN app.reviews.reviewer_id IS 'Employee writing the review';
COMMENT ON COLUMN app.reviews.reviewer_type IS 'Type of review (self, manager, peer, skip_level)';
COMMENT ON COLUMN app.reviews.status IS 'Review status (not_started, in_progress, submitted, acknowledged)';
COMMENT ON COLUMN app.reviews.overall_rating IS 'Overall rating (1-5)';
COMMENT ON COLUMN app.reviews.ratings IS 'Per-competency ratings as JSON';
COMMENT ON COLUMN app.reviews.strengths IS 'Observed strengths';
COMMENT ON COLUMN app.reviews.development_areas IS 'Areas for improvement';
COMMENT ON COLUMN app.reviews.comments IS 'Additional comments';
COMMENT ON COLUMN app.reviews.submitted_at IS 'When review was submitted';
COMMENT ON COLUMN app.reviews.acknowledged_at IS 'When reviewee acknowledged';
COMMENT ON FUNCTION app.validate_review_status_transition IS 'Enforces valid review status transitions';
COMMENT ON FUNCTION app.get_employee_reviews IS 'Returns reviews for an employee in a cycle';
COMMENT ON FUNCTION app.get_pending_reviews IS 'Returns pending reviews for a reviewer';
COMMENT ON FUNCTION app.submit_review IS 'Submits a completed review';
COMMENT ON FUNCTION app.acknowledge_review IS 'Acknowledges review receipt by reviewee';
COMMENT ON FUNCTION app.get_review_completion_stats IS 'Returns review completion statistics';
COMMENT ON FUNCTION app.get_rating_distribution IS 'Returns rating distribution for calibration';
COMMENT ON FUNCTION app.create_cycle_reviews IS 'Creates review records for employees in a cycle';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.create_cycle_reviews(uuid, boolean, boolean);
-- DROP FUNCTION IF EXISTS app.get_rating_distribution(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_review_completion_stats(uuid);
-- DROP FUNCTION IF EXISTS app.acknowledge_review(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.submit_review(uuid, numeric, jsonb, text, text, text);
-- DROP FUNCTION IF EXISTS app.get_pending_reviews(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_reviews(uuid, uuid);
-- DROP TRIGGER IF EXISTS validate_review_status_transition ON app.reviews;
-- DROP FUNCTION IF EXISTS app.validate_review_status_transition();
-- DROP TRIGGER IF EXISTS update_reviews_updated_at ON app.reviews;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.reviews;
-- DROP POLICY IF EXISTS tenant_isolation ON app.reviews;
-- DROP INDEX IF EXISTS app.idx_reviews_ratings;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_rating;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_type;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_pending;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_status;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_reviewer;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_cycle;
-- DROP INDEX IF EXISTS app.idx_reviews_tenant_employee_cycle;
-- DROP TABLE IF EXISTS app.reviews;
