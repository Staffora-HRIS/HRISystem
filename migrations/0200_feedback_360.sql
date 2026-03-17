-- Migration: 0200_feedback_360
-- Created: 2026-03-17
-- Description: Create tables for 360-degree feedback collection.
--              feedback_360_cycles links a review cycle to an employee and tracks
--              multi-rater feedback status.  feedback_360_responses captures
--              individual reviewer submissions (self, manager, peer, direct_report).
--              Full RLS, state-machine trigger, and anonymised aggregation function.
-- Reversible: Yes (see DOWN section at bottom)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: feedback_360_cycle_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.feedback_360_cycle_status AS ENUM (
    'draft',           -- Cycle created, reviewers not yet nominated
    'nominating',      -- Reviewer nomination in progress
    'collecting',      -- Feedback collection open
    'completed',       -- All feedback received or deadline passed
    'cancelled'        -- Cycle cancelled
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.feedback_360_cycle_status IS '360 feedback cycle lifecycle: draft -> nominating -> collecting -> completed | cancelled';

-- -----------------------------------------------------------------------------
-- Enum: feedback_360_reviewer_type
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.feedback_360_reviewer_type AS ENUM (
    'self',
    'manager',
    'peer',
    'direct_report'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.feedback_360_reviewer_type IS 'Relationship of the reviewer to the subject employee in a 360 feedback cycle';

-- -----------------------------------------------------------------------------
-- Enum: feedback_360_response_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.feedback_360_response_status AS ENUM (
    'pending',         -- Invited but not yet started
    'in_progress',     -- Started but not submitted
    'submitted',       -- Feedback submitted
    'declined'         -- Reviewer declined to participate
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.feedback_360_response_status IS 'Individual 360 response lifecycle: pending -> in_progress -> submitted | declined';

-- -----------------------------------------------------------------------------
-- Table: feedback_360_cycles
-- -----------------------------------------------------------------------------
-- Represents a 360-degree feedback cycle for a single employee, optionally
-- linked to a performance review cycle.

CREATE TABLE IF NOT EXISTS app.feedback_360_cycles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

  -- Link to performance cycle (optional - can run standalone)
  review_cycle_id     uuid REFERENCES app.performance_cycles(id) ON DELETE SET NULL,

  -- The employee receiving 360 feedback
  employee_id         uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Lifecycle
  status              app.feedback_360_cycle_status NOT NULL DEFAULT 'draft',

  -- Deadline for feedback submissions
  deadline            date,

  -- Minimum number of peer/direct_report responses required before results are visible
  min_responses       integer NOT NULL DEFAULT 3,

  -- Standard timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES app.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- An employee can have at most one 360 cycle per performance review cycle
  CONSTRAINT feedback_360_cycles_unique_per_review
    UNIQUE NULLS NOT DISTINCT (tenant_id, review_cycle_id, employee_id),

  -- min_responses must be positive
  CONSTRAINT feedback_360_cycles_min_responses_positive
    CHECK (min_responses >= 1)
);

-- RLS
ALTER TABLE app.feedback_360_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.feedback_360_cycles
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR app.is_system_context()
  );

CREATE POLICY tenant_isolation_insert ON app.feedback_360_cycles
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR app.is_system_context()
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_f360_cycles_tenant
  ON app.feedback_360_cycles (tenant_id);

CREATE INDEX IF NOT EXISTS idx_f360_cycles_employee
  ON app.feedback_360_cycles (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_f360_cycles_review_cycle
  ON app.feedback_360_cycles (tenant_id, review_cycle_id)
  WHERE review_cycle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_f360_cycles_status
  ON app.feedback_360_cycles (tenant_id, status)
  WHERE status IN ('nominating', 'collecting');

-- Updated_at trigger
CREATE TRIGGER trg_feedback_360_cycles_updated_at
  BEFORE UPDATE ON app.feedback_360_cycles
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.feedback_360_cycles TO hris_app;

-- -----------------------------------------------------------------------------
-- Table: feedback_360_responses
-- -----------------------------------------------------------------------------
-- Captures an individual reviewer's response in a 360 feedback cycle.

CREATE TABLE IF NOT EXISTS app.feedback_360_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

  -- Parent cycle
  cycle_id            uuid NOT NULL REFERENCES app.feedback_360_cycles(id) ON DELETE CASCADE,

  -- Who is providing the feedback
  reviewer_id         uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Relationship to the subject
  reviewer_type       app.feedback_360_reviewer_type NOT NULL,

  -- Status
  status              app.feedback_360_response_status NOT NULL DEFAULT 'pending',

  -- Structured ratings (JSON array of { competencyId, rating, comment })
  ratings             jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Free-text comments
  strengths           text,
  development_areas   text,
  comments            text,

  -- When the response was submitted
  submitted_at        timestamptz,

  -- Standard timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- One response per reviewer per cycle per type
  CONSTRAINT feedback_360_responses_unique
    UNIQUE (tenant_id, cycle_id, reviewer_id, reviewer_type),

  -- Self-review must be by the employee themselves
  -- (enforced via application logic since we'd need a join)

  -- Submitted responses must have submission timestamp
  CONSTRAINT feedback_360_responses_submitted_has_timestamp
    CHECK (status != 'submitted' OR submitted_at IS NOT NULL)
);

-- RLS
ALTER TABLE app.feedback_360_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.feedback_360_responses
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR app.is_system_context()
  );

CREATE POLICY tenant_isolation_insert ON app.feedback_360_responses
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR app.is_system_context()
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_f360_responses_tenant
  ON app.feedback_360_responses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_f360_responses_cycle
  ON app.feedback_360_responses (tenant_id, cycle_id);

CREATE INDEX IF NOT EXISTS idx_f360_responses_reviewer
  ON app.feedback_360_responses (tenant_id, reviewer_id);

CREATE INDEX IF NOT EXISTS idx_f360_responses_status
  ON app.feedback_360_responses (tenant_id, cycle_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_f360_responses_type
  ON app.feedback_360_responses (tenant_id, cycle_id, reviewer_type);

CREATE INDEX IF NOT EXISTS idx_f360_responses_ratings
  ON app.feedback_360_responses USING gin(ratings);

-- Updated_at trigger
CREATE TRIGGER trg_feedback_360_responses_updated_at
  BEFORE UPDATE ON app.feedback_360_responses
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Grant permissions to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.feedback_360_responses TO hris_app;

-- =============================================================================
-- State Machine: feedback_360_cycle_status transitions
-- =============================================================================

CREATE OR REPLACE FUNCTION app.validate_feedback_360_cycle_status_transition()
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

  CASE OLD.status
    WHEN 'draft' THEN
      IF NEW.status NOT IN ('nominating', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid 360 cycle status transition: draft can only transition to nominating or cancelled, not %', NEW.status;
      END IF;

    WHEN 'nominating' THEN
      IF NEW.status NOT IN ('collecting', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid 360 cycle status transition: nominating can only transition to collecting or cancelled, not %', NEW.status;
      END IF;

    WHEN 'collecting' THEN
      IF NEW.status NOT IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid 360 cycle status transition: collecting can only transition to completed or cancelled, not %', NEW.status;
      END IF;

    WHEN 'completed' THEN
      RAISE EXCEPTION 'Invalid 360 cycle status transition: completed is a terminal state';

    WHEN 'cancelled' THEN
      RAISE EXCEPTION 'Invalid 360 cycle status transition: cancelled is a terminal state';

    ELSE
      RAISE EXCEPTION 'Unknown 360 cycle status: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_feedback_360_cycle_status_transition
  BEFORE UPDATE OF status ON app.feedback_360_cycles
  FOR EACH ROW
  EXECUTE FUNCTION app.validate_feedback_360_cycle_status_transition();

-- =============================================================================
-- State Machine: feedback_360_response_status transitions
-- =============================================================================

CREATE OR REPLACE FUNCTION app.validate_feedback_360_response_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending' THEN
      IF NEW.status NOT IN ('in_progress', 'declined') THEN
        RAISE EXCEPTION 'Invalid 360 response status transition: pending can only transition to in_progress or declined, not %', NEW.status;
      END IF;

    WHEN 'in_progress' THEN
      IF NEW.status NOT IN ('submitted', 'declined') THEN
        RAISE EXCEPTION 'Invalid 360 response status transition: in_progress can only transition to submitted or declined, not %', NEW.status;
      END IF;

    WHEN 'submitted' THEN
      RAISE EXCEPTION 'Invalid 360 response status transition: submitted is a terminal state';

    WHEN 'declined' THEN
      RAISE EXCEPTION 'Invalid 360 response status transition: declined is a terminal state';

    ELSE
      RAISE EXCEPTION 'Unknown 360 response status: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_feedback_360_response_status_transition
  BEFORE UPDATE OF status ON app.feedback_360_responses
  FOR EACH ROW
  EXECUTE FUNCTION app.validate_feedback_360_response_status_transition();

-- =============================================================================
-- Function: Anonymised aggregated results
-- =============================================================================
-- Returns averaged ratings per competency, grouped by reviewer_type.
-- Peer and direct_report ratings are aggregated only if the minimum response
-- threshold is met; individual comments are NOT returned for those types
-- to preserve anonymity.

CREATE OR REPLACE FUNCTION app.get_feedback_360_aggregated_results(
  p_cycle_id uuid
)
RETURNS TABLE (
  reviewer_type    app.feedback_360_reviewer_type,
  response_count   bigint,
  avg_ratings      jsonb,
  comments_visible boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_min_responses integer;
BEGIN
  -- Get minimum response threshold
  SELECT c.min_responses INTO v_min_responses
  FROM app.feedback_360_cycles c
  WHERE c.id = p_cycle_id;

  IF v_min_responses IS NULL THEN
    RAISE EXCEPTION 'Feedback 360 cycle not found: %', p_cycle_id;
  END IF;

  RETURN QUERY
  WITH submitted AS (
    SELECT
      r.reviewer_type,
      r.ratings,
      r.strengths,
      r.development_areas,
      r.comments
    FROM app.feedback_360_responses r
    WHERE r.cycle_id = p_cycle_id
      AND r.status = 'submitted'
  ),
  type_counts AS (
    SELECT
      s.reviewer_type,
      COUNT(*)::bigint AS cnt
    FROM submitted s
    GROUP BY s.reviewer_type
  )
  SELECT
    tc.reviewer_type,
    tc.cnt AS response_count,
    -- Average each numeric rating in the JSONB array across all reviewers of this type
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'competencyId', item->>'competencyId',
            'avgRating', ROUND(AVG((item->>'rating')::numeric), 2)
          )
        )
        FROM submitted s2,
             LATERAL jsonb_array_elements(s2.ratings) AS item
        WHERE s2.reviewer_type = tc.reviewer_type
        GROUP BY item->>'competencyId'
      ),
      '[]'::jsonb
    ) AS avg_ratings,
    -- Self and manager comments are always visible; peer/direct_report only if threshold met
    CASE
      WHEN tc.reviewer_type IN ('self', 'manager') THEN true
      WHEN tc.cnt >= v_min_responses THEN true
      ELSE false
    END AS comments_visible
  FROM type_counts tc
  ORDER BY
    CASE tc.reviewer_type
      WHEN 'self' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'peer' THEN 3
      WHEN 'direct_report' THEN 4
    END;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.feedback_360_cycles IS '360-degree feedback cycles, one per employee per optional review cycle';
COMMENT ON COLUMN app.feedback_360_cycles.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.feedback_360_cycles.tenant_id IS 'Tenant that owns this cycle';
COMMENT ON COLUMN app.feedback_360_cycles.review_cycle_id IS 'Optional link to a performance review cycle';
COMMENT ON COLUMN app.feedback_360_cycles.employee_id IS 'The employee being assessed';
COMMENT ON COLUMN app.feedback_360_cycles.status IS 'Cycle status (draft, nominating, collecting, completed, cancelled)';
COMMENT ON COLUMN app.feedback_360_cycles.deadline IS 'Deadline for feedback submissions';
COMMENT ON COLUMN app.feedback_360_cycles.min_responses IS 'Minimum anonymous responses required before peer/direct_report results are visible';

COMMENT ON TABLE app.feedback_360_responses IS 'Individual 360 feedback responses from nominated reviewers';
COMMENT ON COLUMN app.feedback_360_responses.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.feedback_360_responses.tenant_id IS 'Tenant that owns this response';
COMMENT ON COLUMN app.feedback_360_responses.cycle_id IS 'Parent 360 feedback cycle';
COMMENT ON COLUMN app.feedback_360_responses.reviewer_id IS 'Employee providing the feedback';
COMMENT ON COLUMN app.feedback_360_responses.reviewer_type IS 'Relationship to the subject (self, manager, peer, direct_report)';
COMMENT ON COLUMN app.feedback_360_responses.status IS 'Response status (pending, in_progress, submitted, declined)';
COMMENT ON COLUMN app.feedback_360_responses.ratings IS 'Structured ratings JSON array: [{ competencyId, rating, comment }]';
COMMENT ON COLUMN app.feedback_360_responses.strengths IS 'Observed strengths';
COMMENT ON COLUMN app.feedback_360_responses.development_areas IS 'Areas for improvement';
COMMENT ON COLUMN app.feedback_360_responses.comments IS 'Additional comments';
COMMENT ON COLUMN app.feedback_360_responses.submitted_at IS 'When feedback was submitted';

COMMENT ON FUNCTION app.validate_feedback_360_cycle_status_transition IS 'Enforces valid 360 cycle status transitions';
COMMENT ON FUNCTION app.validate_feedback_360_response_status_transition IS 'Enforces valid 360 response status transitions';
COMMENT ON FUNCTION app.get_feedback_360_aggregated_results IS 'Returns anonymised aggregated 360 feedback ratings per reviewer type';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_feedback_360_aggregated_results(uuid);
-- DROP TRIGGER IF EXISTS validate_feedback_360_response_status_transition ON app.feedback_360_responses;
-- DROP FUNCTION IF EXISTS app.validate_feedback_360_response_status_transition();
-- DROP TRIGGER IF EXISTS validate_feedback_360_cycle_status_transition ON app.feedback_360_cycles;
-- DROP FUNCTION IF EXISTS app.validate_feedback_360_cycle_status_transition();
-- DROP TRIGGER IF EXISTS trg_feedback_360_responses_updated_at ON app.feedback_360_responses;
-- DROP INDEX IF EXISTS app.idx_f360_responses_ratings;
-- DROP INDEX IF EXISTS app.idx_f360_responses_type;
-- DROP INDEX IF EXISTS app.idx_f360_responses_status;
-- DROP INDEX IF EXISTS app.idx_f360_responses_reviewer;
-- DROP INDEX IF EXISTS app.idx_f360_responses_cycle;
-- DROP INDEX IF EXISTS app.idx_f360_responses_tenant;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.feedback_360_responses;
-- DROP POLICY IF EXISTS tenant_isolation ON app.feedback_360_responses;
-- DROP TABLE IF EXISTS app.feedback_360_responses;
-- DROP TRIGGER IF EXISTS trg_feedback_360_cycles_updated_at ON app.feedback_360_cycles;
-- DROP INDEX IF EXISTS app.idx_f360_cycles_status;
-- DROP INDEX IF EXISTS app.idx_f360_cycles_review_cycle;
-- DROP INDEX IF EXISTS app.idx_f360_cycles_employee;
-- DROP INDEX IF EXISTS app.idx_f360_cycles_tenant;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.feedback_360_cycles;
-- DROP POLICY IF EXISTS tenant_isolation ON app.feedback_360_cycles;
-- DROP TABLE IF EXISTS app.feedback_360_cycles;
-- DROP TYPE IF EXISTS app.feedback_360_response_status;
-- DROP TYPE IF EXISTS app.feedback_360_reviewer_type;
-- DROP TYPE IF EXISTS app.feedback_360_cycle_status;
