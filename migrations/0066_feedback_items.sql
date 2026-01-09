-- Migration: 0066_feedback_items
-- Created: 2026-01-07
-- Description: Create the feedback_items table for continuous feedback
--              Supports recognition, constructive feedback, and feedback requests
--              Includes anonymous feedback option

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Feedback Items Table
-- -----------------------------------------------------------------------------
-- Represents continuous feedback between employees
-- Not tied to performance cycles - used for ongoing recognition and coaching
CREATE TABLE IF NOT EXISTS app.feedback_items (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this feedback
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee receiving the feedback
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Type of feedback
    feedback_type app.feedback_type NOT NULL,

    -- Who gave the feedback
    giver_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Whether the feedback is anonymous
    is_anonymous boolean NOT NULL DEFAULT false,

    -- Feedback content
    content text NOT NULL,

    -- When feedback was given
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Content must not be empty
    CONSTRAINT feedback_items_content_not_empty CHECK (length(trim(content)) > 0),

    -- Cannot give feedback to self
    CONSTRAINT feedback_items_no_self_feedback CHECK (employee_id != giver_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee (feedback received)
CREATE INDEX IF NOT EXISTS idx_feedback_items_tenant_employee
    ON app.feedback_items(tenant_id, employee_id, created_at DESC);

-- Giver lookup (feedback given)
CREATE INDEX IF NOT EXISTS idx_feedback_items_tenant_giver
    ON app.feedback_items(tenant_id, giver_id, created_at DESC);

-- Type filtering
CREATE INDEX IF NOT EXISTS idx_feedback_items_tenant_type
    ON app.feedback_items(tenant_id, feedback_type);

-- Recognition feed (public recognition)
CREATE INDEX IF NOT EXISTS idx_feedback_items_tenant_recognition
    ON app.feedback_items(tenant_id, created_at DESC)
    WHERE feedback_type = 'recognition' AND is_anonymous = false;

-- Recent feedback (dashboard)
CREATE INDEX IF NOT EXISTS idx_feedback_items_tenant_recent
    ON app.feedback_items(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.feedback_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see feedback for their current tenant
-- Note: Additional application-level filtering needed for anonymous feedback
CREATE POLICY tenant_isolation ON app.feedback_items
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.feedback_items
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get feedback received by an employee
CREATE OR REPLACE FUNCTION app.get_employee_feedback_received(
    p_employee_id uuid,
    p_feedback_type app.feedback_type DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    feedback_type app.feedback_type,
    giver_id uuid,
    is_anonymous boolean,
    content text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.feedback_type,
        CASE WHEN f.is_anonymous THEN NULL ELSE f.giver_id END AS giver_id,
        f.is_anonymous,
        f.content,
        f.created_at
    FROM app.feedback_items f
    WHERE f.employee_id = p_employee_id
      AND (p_feedback_type IS NULL OR f.feedback_type = p_feedback_type)
    ORDER BY f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get feedback given by an employee
CREATE OR REPLACE FUNCTION app.get_employee_feedback_given(
    p_giver_id uuid,
    p_feedback_type app.feedback_type DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    feedback_type app.feedback_type,
    is_anonymous boolean,
    content text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.employee_id,
        f.feedback_type,
        f.is_anonymous,
        f.content,
        f.created_at
    FROM app.feedback_items f
    WHERE f.giver_id = p_giver_id
      AND (p_feedback_type IS NULL OR f.feedback_type = p_feedback_type)
    ORDER BY f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get public recognition feed for a tenant
CREATE OR REPLACE FUNCTION app.get_recognition_feed(
    p_tenant_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    giver_id uuid,
    content text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.employee_id,
        f.giver_id,
        f.content,
        f.created_at
    FROM app.feedback_items f
    WHERE f.tenant_id = p_tenant_id
      AND f.feedback_type = 'recognition'
      AND f.is_anonymous = false
    ORDER BY f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to give feedback
CREATE OR REPLACE FUNCTION app.give_feedback(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_giver_id uuid,
    p_feedback_type app.feedback_type,
    p_content text,
    p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_feedback_id uuid;
BEGIN
    -- Validate employees exist and are active
    IF NOT EXISTS (SELECT 1 FROM app.employees WHERE id = p_employee_id AND status = 'active') THEN
        RAISE EXCEPTION 'Recipient employee not found or not active: %', p_employee_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM app.employees WHERE id = p_giver_id AND status = 'active') THEN
        RAISE EXCEPTION 'Giver employee not found or not active: %', p_giver_id;
    END IF;

    -- Recognition is typically not anonymous
    IF p_feedback_type = 'recognition' AND p_is_anonymous THEN
        RAISE WARNING 'Recognition feedback is typically not anonymous. Proceeding anyway.';
    END IF;

    INSERT INTO app.feedback_items (
        tenant_id,
        employee_id,
        giver_id,
        feedback_type,
        is_anonymous,
        content
    )
    VALUES (
        p_tenant_id,
        p_employee_id,
        p_giver_id,
        p_feedback_type,
        p_is_anonymous,
        p_content
    )
    RETURNING id INTO v_feedback_id;

    RETURN v_feedback_id;
END;
$$;

-- Function to get feedback statistics for an employee
CREATE OR REPLACE FUNCTION app.get_employee_feedback_stats(
    p_employee_id uuid,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    total_received bigint,
    recognition_count bigint,
    constructive_count bigint,
    request_count bigint,
    total_given bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM app.feedback_items
         WHERE employee_id = p_employee_id
           AND created_at::date >= p_from_date
           AND created_at::date <= p_to_date
        )::bigint AS total_received,
        (SELECT COUNT(*) FROM app.feedback_items
         WHERE employee_id = p_employee_id
           AND feedback_type = 'recognition'
           AND created_at::date >= p_from_date
           AND created_at::date <= p_to_date
        )::bigint AS recognition_count,
        (SELECT COUNT(*) FROM app.feedback_items
         WHERE employee_id = p_employee_id
           AND feedback_type = 'constructive'
           AND created_at::date >= p_from_date
           AND created_at::date <= p_to_date
        )::bigint AS constructive_count,
        (SELECT COUNT(*) FROM app.feedback_items
         WHERE employee_id = p_employee_id
           AND feedback_type = 'request'
           AND created_at::date >= p_from_date
           AND created_at::date <= p_to_date
        )::bigint AS request_count,
        (SELECT COUNT(*) FROM app.feedback_items
         WHERE giver_id = p_employee_id
           AND created_at::date >= p_from_date
           AND created_at::date <= p_to_date
        )::bigint AS total_given;
END;
$$;

-- Function to get feedback trends for a tenant
CREATE OR REPLACE FUNCTION app.get_feedback_trends(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '30 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    date date,
    recognition_count bigint,
    constructive_count bigint,
    request_count bigint,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_from_date, p_to_date, '1 day'::interval)::date AS date
    )
    SELECT
        ds.date,
        COALESCE(COUNT(*) FILTER (WHERE f.feedback_type = 'recognition'), 0)::bigint AS recognition_count,
        COALESCE(COUNT(*) FILTER (WHERE f.feedback_type = 'constructive'), 0)::bigint AS constructive_count,
        COALESCE(COUNT(*) FILTER (WHERE f.feedback_type = 'request'), 0)::bigint AS request_count,
        COALESCE(COUNT(f.id), 0)::bigint AS total_count
    FROM date_series ds
    LEFT JOIN app.feedback_items f ON f.created_at::date = ds.date AND f.tenant_id = p_tenant_id
    GROUP BY ds.date
    ORDER BY ds.date;
END;
$$;

-- Function to request feedback from colleagues
CREATE OR REPLACE FUNCTION app.request_feedback(
    p_tenant_id uuid,
    p_requester_id uuid,
    p_reviewer_ids uuid[],
    p_message text DEFAULT 'Please provide feedback on my work.'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_reviewer_id uuid;
    v_count integer := 0;
BEGIN
    FOREACH v_reviewer_id IN ARRAY p_reviewer_ids LOOP
        -- Skip if reviewer is the requester
        IF v_reviewer_id = p_requester_id THEN
            CONTINUE;
        END IF;

        -- Create a feedback request (feedback_type = 'request' sent TO the requester FROM the reviewer perspective)
        INSERT INTO app.feedback_items (
            tenant_id,
            employee_id,
            giver_id,
            feedback_type,
            is_anonymous,
            content
        )
        VALUES (
            p_tenant_id,
            v_reviewer_id,  -- The request is shown to the reviewer
            p_requester_id, -- The requester initiated it
            'request',
            false,
            p_message
        )
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- Function to get top recognition givers
CREATE OR REPLACE FUNCTION app.get_top_recognition_givers(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '30 days',
    p_to_date date DEFAULT now()::date,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    giver_id uuid,
    recognition_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.giver_id,
        COUNT(*)::bigint AS recognition_count
    FROM app.feedback_items f
    WHERE f.tenant_id = p_tenant_id
      AND f.feedback_type = 'recognition'
      AND f.created_at::date >= p_from_date
      AND f.created_at::date <= p_to_date
    GROUP BY f.giver_id
    ORDER BY recognition_count DESC
    LIMIT p_limit;
END;
$$;

-- Function to get top recognition receivers
CREATE OR REPLACE FUNCTION app.get_top_recognition_receivers(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '30 days',
    p_to_date date DEFAULT now()::date,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    employee_id uuid,
    recognition_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.employee_id,
        COUNT(*)::bigint AS recognition_count
    FROM app.feedback_items f
    WHERE f.tenant_id = p_tenant_id
      AND f.feedback_type = 'recognition'
      AND f.created_at::date >= p_from_date
      AND f.created_at::date <= p_to_date
    GROUP BY f.employee_id
    ORDER BY recognition_count DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.feedback_items IS 'Continuous feedback items (recognition, constructive, requests) between employees';
COMMENT ON COLUMN app.feedback_items.id IS 'Primary UUID identifier for the feedback';
COMMENT ON COLUMN app.feedback_items.tenant_id IS 'Tenant that owns this feedback';
COMMENT ON COLUMN app.feedback_items.employee_id IS 'Employee receiving the feedback';
COMMENT ON COLUMN app.feedback_items.feedback_type IS 'Type of feedback (recognition, constructive, request)';
COMMENT ON COLUMN app.feedback_items.giver_id IS 'Employee who gave the feedback';
COMMENT ON COLUMN app.feedback_items.is_anonymous IS 'Whether feedback giver is hidden from recipient';
COMMENT ON COLUMN app.feedback_items.content IS 'Feedback content';
COMMENT ON COLUMN app.feedback_items.created_at IS 'When feedback was given';
COMMENT ON FUNCTION app.get_employee_feedback_received IS 'Returns feedback received by an employee';
COMMENT ON FUNCTION app.get_employee_feedback_given IS 'Returns feedback given by an employee';
COMMENT ON FUNCTION app.get_recognition_feed IS 'Returns public recognition feed for a tenant';
COMMENT ON FUNCTION app.give_feedback IS 'Creates a new feedback item';
COMMENT ON FUNCTION app.get_employee_feedback_stats IS 'Returns feedback statistics for an employee';
COMMENT ON FUNCTION app.get_feedback_trends IS 'Returns daily feedback trends for a tenant';
COMMENT ON FUNCTION app.request_feedback IS 'Creates feedback requests to multiple colleagues';
COMMENT ON FUNCTION app.get_top_recognition_givers IS 'Returns employees who give the most recognition';
COMMENT ON FUNCTION app.get_top_recognition_receivers IS 'Returns employees who receive the most recognition';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_top_recognition_receivers(uuid, date, date, integer);
-- DROP FUNCTION IF EXISTS app.get_top_recognition_givers(uuid, date, date, integer);
-- DROP FUNCTION IF EXISTS app.request_feedback(uuid, uuid, uuid[], text);
-- DROP FUNCTION IF EXISTS app.get_feedback_trends(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_employee_feedback_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.give_feedback(uuid, uuid, uuid, app.feedback_type, text, boolean);
-- DROP FUNCTION IF EXISTS app.get_recognition_feed(uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app.get_employee_feedback_given(uuid, app.feedback_type, integer, integer);
-- DROP FUNCTION IF EXISTS app.get_employee_feedback_received(uuid, app.feedback_type, integer, integer);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.feedback_items;
-- DROP POLICY IF EXISTS tenant_isolation ON app.feedback_items;
-- DROP INDEX IF EXISTS app.idx_feedback_items_tenant_recent;
-- DROP INDEX IF EXISTS app.idx_feedback_items_tenant_recognition;
-- DROP INDEX IF EXISTS app.idx_feedback_items_tenant_type;
-- DROP INDEX IF EXISTS app.idx_feedback_items_tenant_giver;
-- DROP INDEX IF EXISTS app.idx_feedback_items_tenant_employee;
-- DROP TABLE IF EXISTS app.feedback_items;
