-- Migration: 0062_offers
-- Created: 2026-01-07
-- Description: Create the offers table for job offers
--              Tracks offer details, approval workflow, and candidate response

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Job Offers Table
-- -----------------------------------------------------------------------------
-- Represents job offers extended to candidates
-- Tracks compensation, approval workflow, and offer lifecycle
CREATE TABLE IF NOT EXISTS app.offers (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this offer
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Candidate receiving the offer
    candidate_id uuid NOT NULL REFERENCES app.candidates(id) ON DELETE CASCADE,

    -- Requisition this offer is for
    requisition_id uuid NOT NULL REFERENCES app.requisitions(id) ON DELETE CASCADE,

    -- Current offer status
    status app.offer_status NOT NULL DEFAULT 'draft',

    -- Position and placement
    position_id uuid REFERENCES app.positions(id) ON DELETE SET NULL,
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Compensation details
    salary numeric(15, 2) NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'USD',
    bonus numeric(15, 2),
    equity text,  -- Description of equity grant

    -- Start date and offer validity
    start_date date NOT NULL,
    offer_letter_url text,

    -- Approval workflow
    workflow_instance_id uuid REFERENCES app.workflow_instances(id) ON DELETE SET NULL,

    -- Offer timeline
    extended_at timestamptz,
    expires_at timestamptz,

    -- Response tracking
    accepted_at timestamptz,
    rejected_at timestamptz,
    rejection_reason text,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Currency format (ISO 4217)
    CONSTRAINT offers_currency_format CHECK (currency ~ '^[A-Z]{3}$'),

    -- Salary must be positive
    CONSTRAINT offers_salary_positive CHECK (salary > 0),

    -- Bonus must be non-negative if specified
    CONSTRAINT offers_bonus_positive CHECK (bonus IS NULL OR bonus >= 0),

    -- Start date must be in the future (or recent past for updates)
    CONSTRAINT offers_start_date_reasonable CHECK (
        start_date >= created_at::date - interval '30 days'
    ),

    -- Expiration must be after creation
    CONSTRAINT offers_expires_after_creation CHECK (
        expires_at IS NULL OR expires_at > created_at
    ),

    -- Status-specific constraints
    CONSTRAINT offers_extended_has_dates CHECK (
        status != 'extended' OR (extended_at IS NOT NULL AND expires_at IS NOT NULL)
    ),

    CONSTRAINT offers_accepted_has_date CHECK (
        status != 'accepted' OR accepted_at IS NOT NULL
    ),

    CONSTRAINT offers_rejected_has_date CHECK (
        status != 'rejected' OR rejected_at IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + candidate
CREATE INDEX IF NOT EXISTS idx_offers_tenant_candidate
    ON app.offers(tenant_id, candidate_id);

-- Requisition lookup
CREATE INDEX IF NOT EXISTS idx_offers_tenant_requisition
    ON app.offers(tenant_id, requisition_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_offers_tenant_status
    ON app.offers(tenant_id, status);

-- Active offers (pending response)
CREATE INDEX IF NOT EXISTS idx_offers_tenant_extended
    ON app.offers(tenant_id, expires_at)
    WHERE status = 'extended';

-- Expiring offers (for notifications)
CREATE INDEX IF NOT EXISTS idx_offers_expiring
    ON app.offers(expires_at)
    WHERE status = 'extended' AND expires_at IS NOT NULL;

-- Workflow lookup
CREATE INDEX IF NOT EXISTS idx_offers_workflow_instance
    ON app.offers(workflow_instance_id)
    WHERE workflow_instance_id IS NOT NULL;

-- Start date (upcoming hires)
CREATE INDEX IF NOT EXISTS idx_offers_tenant_start_date
    ON app.offers(tenant_id, start_date)
    WHERE status = 'accepted';

-- Created by (my offers)
CREATE INDEX IF NOT EXISTS idx_offers_tenant_created_by
    ON app.offers(tenant_id, created_by)
    WHERE created_by IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.offers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see offers for their current tenant
CREATE POLICY tenant_isolation ON app.offers
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.offers
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_offers_updated_at
    BEFORE UPDATE ON app.offers
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate offer status transitions
CREATE OR REPLACE FUNCTION app.validate_offer_status_transition()
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
        WHEN 'draft' THEN
            -- draft can transition to pending_approval or cancelled
            IF NEW.status NOT IN ('pending_approval', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to pending_approval or cancelled, not %', NEW.status;
            END IF;

        WHEN 'pending_approval' THEN
            -- pending_approval can transition to approved or cancelled
            IF NEW.status NOT IN ('approved', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending_approval can only transition to approved or cancelled, not %', NEW.status;
            END IF;

        WHEN 'approved' THEN
            -- approved can transition to extended or cancelled
            IF NEW.status NOT IN ('extended', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: approved can only transition to extended or cancelled, not %', NEW.status;
            END IF;

        WHEN 'extended' THEN
            -- extended can transition to accepted, rejected, expired, or cancelled
            IF NEW.status NOT IN ('accepted', 'rejected', 'expired', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: extended can only transition to accepted, rejected, expired, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'accepted' THEN
            -- accepted is a terminal state (but could be cancelled if hire falls through)
            IF NEW.status NOT IN ('cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: accepted can only transition to cancelled, not %', NEW.status;
            END IF;

        WHEN 'rejected' THEN
            -- rejected is a terminal state
            RAISE EXCEPTION 'Invalid status transition: rejected is a terminal state';

        WHEN 'expired' THEN
            -- expired can be re-extended
            IF NEW.status NOT IN ('extended', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: expired can only transition to extended or cancelled, not %', NEW.status;
            END IF;

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_offer_status_transition
    BEFORE UPDATE OF status ON app.offers
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_offer_status_transition();

-- Function to handle offer acceptance
CREATE OR REPLACE FUNCTION app.handle_offer_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- When offer is accepted, update candidate stage to hired
    IF NEW.status = 'accepted' AND OLD.status = 'extended' THEN
        UPDATE app.candidates
        SET current_stage = 'hired',
            updated_at = now()
        WHERE id = NEW.candidate_id;

        -- Log the stage change
        INSERT INTO app.candidate_stage_events (
            tenant_id,
            candidate_id,
            from_stage,
            to_stage,
            reason,
            actor_id
        )
        SELECT
            NEW.tenant_id,
            NEW.candidate_id,
            'offer',
            'hired',
            'Offer accepted',
            NEW.created_by;

        -- Increment requisition filled count
        PERFORM app.increment_requisition_filled(NEW.requisition_id);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER handle_offer_acceptance
    AFTER UPDATE OF status ON app.offers
    FOR EACH ROW
    EXECUTE FUNCTION app.handle_offer_acceptance();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get offers for a candidate
CREATE OR REPLACE FUNCTION app.get_candidate_offers(
    p_candidate_id uuid
)
RETURNS TABLE (
    id uuid,
    requisition_id uuid,
    status app.offer_status,
    salary numeric(15, 2),
    currency varchar(3),
    bonus numeric(15, 2),
    equity text,
    start_date date,
    extended_at timestamptz,
    expires_at timestamptz,
    accepted_at timestamptz,
    rejected_at timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.requisition_id,
        o.status,
        o.salary,
        o.currency,
        o.bonus,
        o.equity,
        o.start_date,
        o.extended_at,
        o.expires_at,
        o.accepted_at,
        o.rejected_at,
        o.created_at
    FROM app.offers o
    WHERE o.candidate_id = p_candidate_id
    ORDER BY o.created_at DESC;
END;
$$;

-- Function to get offers by status
CREATE OR REPLACE FUNCTION app.get_offers_by_status(
    p_tenant_id uuid,
    p_status app.offer_status,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    candidate_id uuid,
    requisition_id uuid,
    salary numeric(15, 2),
    currency varchar(3),
    start_date date,
    extended_at timestamptz,
    expires_at timestamptz,
    days_until_expiry integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.candidate_id,
        o.requisition_id,
        o.salary,
        o.currency,
        o.start_date,
        o.extended_at,
        o.expires_at,
        CASE
            WHEN o.expires_at IS NOT NULL THEN
                EXTRACT(DAY FROM o.expires_at - now())::integer
            ELSE NULL
        END AS days_until_expiry,
        o.created_at
    FROM app.offers o
    WHERE o.tenant_id = p_tenant_id
      AND o.status = p_status
    ORDER BY
        CASE WHEN o.expires_at IS NOT NULL THEN o.expires_at ELSE '9999-12-31'::timestamptz END ASC,
        o.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to extend an offer
CREATE OR REPLACE FUNCTION app.extend_offer(
    p_offer_id uuid,
    p_expires_at timestamptz DEFAULT now() + interval '7 days'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.offer_status;
BEGIN
    SELECT status INTO v_current_status
    FROM app.offers
    WHERE id = p_offer_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Offer not found: %', p_offer_id;
    END IF;

    IF v_current_status NOT IN ('approved', 'expired') THEN
        RAISE EXCEPTION 'Cannot extend offer with status: %', v_current_status;
    END IF;

    UPDATE app.offers
    SET status = 'extended',
        extended_at = now(),
        expires_at = p_expires_at,
        updated_at = now()
    WHERE id = p_offer_id;

    -- Update candidate stage to offer
    UPDATE app.candidates
    SET current_stage = 'offer',
        updated_at = now()
    WHERE id = (SELECT candidate_id FROM app.offers WHERE id = p_offer_id);

    RETURN true;
END;
$$;

-- Function to record offer response
CREATE OR REPLACE FUNCTION app.record_offer_response(
    p_offer_id uuid,
    p_accepted boolean,
    p_rejection_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.offer_status;
BEGIN
    SELECT status INTO v_current_status
    FROM app.offers
    WHERE id = p_offer_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Offer not found: %', p_offer_id;
    END IF;

    IF v_current_status != 'extended' THEN
        RAISE EXCEPTION 'Cannot record response for offer with status: %', v_current_status;
    END IF;

    IF p_accepted THEN
        UPDATE app.offers
        SET status = 'accepted',
            accepted_at = now(),
            updated_at = now()
        WHERE id = p_offer_id;
    ELSE
        UPDATE app.offers
        SET status = 'rejected',
            rejected_at = now(),
            rejection_reason = p_rejection_reason,
            updated_at = now()
        WHERE id = p_offer_id;

        -- Update candidate stage to rejected
        UPDATE app.candidates
        SET current_stage = 'rejected',
            updated_at = now()
        WHERE id = (SELECT candidate_id FROM app.offers WHERE id = p_offer_id);
    END IF;

    RETURN true;
END;
$$;

-- Function to get offer statistics
CREATE OR REPLACE FUNCTION app.get_offer_stats(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    total_offers bigint,
    draft_count bigint,
    pending_count bigint,
    extended_count bigint,
    accepted_count bigint,
    rejected_count bigint,
    expired_count bigint,
    cancelled_count bigint,
    acceptance_rate numeric(5,2),
    avg_salary numeric(15,2),
    avg_time_to_accept_days numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_offers,
        COUNT(*) FILTER (WHERE o.status = 'draft')::bigint AS draft_count,
        COUNT(*) FILTER (WHERE o.status = 'pending_approval')::bigint AS pending_count,
        COUNT(*) FILTER (WHERE o.status = 'extended')::bigint AS extended_count,
        COUNT(*) FILTER (WHERE o.status = 'accepted')::bigint AS accepted_count,
        COUNT(*) FILTER (WHERE o.status = 'rejected')::bigint AS rejected_count,
        COUNT(*) FILTER (WHERE o.status = 'expired')::bigint AS expired_count,
        COUNT(*) FILTER (WHERE o.status = 'cancelled')::bigint AS cancelled_count,
        ROUND(
            COUNT(*) FILTER (WHERE o.status = 'accepted')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE o.status IN ('accepted', 'rejected'))::numeric, 0) * 100,
            2
        ) AS acceptance_rate,
        ROUND(AVG(o.salary), 2) AS avg_salary,
        ROUND(
            AVG(EXTRACT(EPOCH FROM (o.accepted_at - o.extended_at)) / 86400)
            FILTER (WHERE o.status = 'accepted'),
            2
        ) AS avg_time_to_accept_days
    FROM app.offers o
    WHERE o.tenant_id = p_tenant_id
      AND o.created_at::date >= p_from_date
      AND o.created_at::date <= p_to_date;
END;
$$;

-- Function to check for expiring offers
CREATE OR REPLACE FUNCTION app.get_expiring_offers(
    p_tenant_id uuid,
    p_within_days integer DEFAULT 3
)
RETURNS TABLE (
    id uuid,
    candidate_id uuid,
    requisition_id uuid,
    expires_at timestamptz,
    hours_until_expiry numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.candidate_id,
        o.requisition_id,
        o.expires_at,
        ROUND(EXTRACT(EPOCH FROM (o.expires_at - now())) / 3600, 1) AS hours_until_expiry
    FROM app.offers o
    WHERE o.tenant_id = p_tenant_id
      AND o.status = 'extended'
      AND o.expires_at IS NOT NULL
      AND o.expires_at <= now() + (p_within_days || ' days')::interval
    ORDER BY o.expires_at ASC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.offers IS 'Job offers extended to candidates with compensation details and approval workflow';
COMMENT ON COLUMN app.offers.id IS 'Primary UUID identifier for the offer';
COMMENT ON COLUMN app.offers.tenant_id IS 'Tenant that owns this offer';
COMMENT ON COLUMN app.offers.candidate_id IS 'Candidate receiving the offer';
COMMENT ON COLUMN app.offers.requisition_id IS 'Requisition this offer is for';
COMMENT ON COLUMN app.offers.status IS 'Current offer status';
COMMENT ON COLUMN app.offers.position_id IS 'Position being offered';
COMMENT ON COLUMN app.offers.org_unit_id IS 'Org unit for placement';
COMMENT ON COLUMN app.offers.salary IS 'Base salary amount';
COMMENT ON COLUMN app.offers.currency IS 'Salary currency (ISO 4217)';
COMMENT ON COLUMN app.offers.bonus IS 'Signing or annual bonus';
COMMENT ON COLUMN app.offers.equity IS 'Equity grant description';
COMMENT ON COLUMN app.offers.start_date IS 'Proposed start date';
COMMENT ON COLUMN app.offers.offer_letter_url IS 'URL to offer letter document';
COMMENT ON COLUMN app.offers.workflow_instance_id IS 'Approval workflow instance';
COMMENT ON COLUMN app.offers.extended_at IS 'When offer was extended to candidate';
COMMENT ON COLUMN app.offers.expires_at IS 'When offer expires';
COMMENT ON COLUMN app.offers.accepted_at IS 'When candidate accepted';
COMMENT ON COLUMN app.offers.rejected_at IS 'When candidate rejected';
COMMENT ON COLUMN app.offers.rejection_reason IS 'Reason for rejection';
COMMENT ON FUNCTION app.validate_offer_status_transition IS 'Enforces valid offer status transitions';
COMMENT ON FUNCTION app.handle_offer_acceptance IS 'Handles side effects when offer is accepted';
COMMENT ON FUNCTION app.get_candidate_offers IS 'Returns offers for a candidate';
COMMENT ON FUNCTION app.get_offers_by_status IS 'Returns offers filtered by status';
COMMENT ON FUNCTION app.extend_offer IS 'Extends an approved offer to a candidate';
COMMENT ON FUNCTION app.record_offer_response IS 'Records candidate response to offer';
COMMENT ON FUNCTION app.get_offer_stats IS 'Returns offer statistics for a tenant';
COMMENT ON FUNCTION app.get_expiring_offers IS 'Returns offers expiring within specified days';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_expiring_offers(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_offer_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.record_offer_response(uuid, boolean, text);
-- DROP FUNCTION IF EXISTS app.extend_offer(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS app.get_offers_by_status(uuid, app.offer_status, integer, integer);
-- DROP FUNCTION IF EXISTS app.get_candidate_offers(uuid);
-- DROP TRIGGER IF EXISTS handle_offer_acceptance ON app.offers;
-- DROP FUNCTION IF EXISTS app.handle_offer_acceptance();
-- DROP TRIGGER IF EXISTS validate_offer_status_transition ON app.offers;
-- DROP FUNCTION IF EXISTS app.validate_offer_status_transition();
-- DROP TRIGGER IF EXISTS update_offers_updated_at ON app.offers;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.offers;
-- DROP POLICY IF EXISTS tenant_isolation ON app.offers;
-- DROP INDEX IF EXISTS app.idx_offers_tenant_created_by;
-- DROP INDEX IF EXISTS app.idx_offers_tenant_start_date;
-- DROP INDEX IF EXISTS app.idx_offers_workflow_instance;
-- DROP INDEX IF EXISTS app.idx_offers_expiring;
-- DROP INDEX IF EXISTS app.idx_offers_tenant_extended;
-- DROP INDEX IF EXISTS app.idx_offers_tenant_status;
-- DROP INDEX IF EXISTS app.idx_offers_tenant_requisition;
-- DROP INDEX IF EXISTS app.idx_offers_tenant_candidate;
-- DROP TABLE IF EXISTS app.offers;
