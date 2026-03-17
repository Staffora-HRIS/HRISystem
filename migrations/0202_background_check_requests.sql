-- Migration: 0202_background_check_requests
-- Created: 2026-03-17
-- Description: Create the background_check_requests table for tracking external
--              background check provider integrations (DBS, credit, employment
--              history, education, references). Supports provider callbacks via
--              webhook with HMAC signature verification. TODO-194.
-- Reversible: Yes (DROP TABLE + DROP TYPES)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Background Check Type Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'background_check_type') THEN
        CREATE TYPE app.background_check_type AS ENUM (
            'dbs',                  -- Disclosure and Barring Service (UK)
            'credit',               -- Credit check
            'employment_history',   -- Employment history verification
            'education',            -- Education / qualifications verification
            'references'            -- Reference checks
        );
    END IF;
END $$;

COMMENT ON TYPE app.background_check_type IS 'Types of background checks that can be requested from external providers';

-- -----------------------------------------------------------------------------
-- Background Check Request Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'background_check_request_status') THEN
        CREATE TYPE app.background_check_request_status AS ENUM (
            'pending',      -- Request created, not yet sent to provider
            'in_progress',  -- Sent to provider, awaiting result
            'completed',    -- Provider returned a result
            'failed'        -- Provider reported failure or request timed out
        );
    END IF;
END $$;

COMMENT ON TYPE app.background_check_request_status IS 'Lifecycle status of a background check request: pending -> in_progress -> completed/failed';

-- -----------------------------------------------------------------------------
-- Background Check Requests Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.background_check_requests (
    -- Primary identifier
    id                  uuid                                    PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id           uuid                                    NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being checked
    employee_id         uuid                                    NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Check details
    check_type          app.background_check_type               NOT NULL,
    provider            text                                    NOT NULL,
    provider_reference  text,

    -- Status tracking
    status              app.background_check_request_status     NOT NULL DEFAULT 'pending',

    -- Result from provider (flexible JSONB for different provider schemas)
    result              jsonb,

    -- Timestamps
    requested_at        timestamptz                             NOT NULL DEFAULT now(),
    completed_at        timestamptz,

    -- Audit fields
    requested_by        uuid                                    REFERENCES app.users(id) ON DELETE SET NULL,
    created_at          timestamptz                             NOT NULL DEFAULT now(),
    updated_at          timestamptz                             NOT NULL DEFAULT now(),

    -- Webhook verification secret (per-request, for provider callbacks)
    webhook_secret      text,

    -- Constraints --

    -- Completed/failed checks must have a completion timestamp
    CONSTRAINT bgcheck_completed_has_ts CHECK (
        status NOT IN ('completed', 'failed') OR completed_at IS NOT NULL
    ),

    -- Provider reference should be set once check is sent to provider
    CONSTRAINT bgcheck_in_progress_has_provider_ref CHECK (
        status NOT IN ('in_progress', 'completed') OR provider_reference IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Tenant + employee lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_bgcheck_requests_tenant_employee
    ON app.background_check_requests(tenant_id, employee_id);

-- Status-based queries (pending checks to process, in-progress to monitor)
CREATE INDEX IF NOT EXISTS idx_bgcheck_requests_tenant_status
    ON app.background_check_requests(tenant_id, status);

-- Provider reference lookup (for webhook callbacks)
CREATE INDEX IF NOT EXISTS idx_bgcheck_requests_provider_ref
    ON app.background_check_requests(provider, provider_reference)
    WHERE provider_reference IS NOT NULL;

-- Cursor-based pagination support
CREATE INDEX IF NOT EXISTS idx_bgcheck_requests_created_at
    ON app.background_check_requests(tenant_id, created_at DESC, id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.background_check_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.background_check_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.background_check_requests
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_background_check_requests_updated_at
    BEFORE UPDATE ON app.background_check_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Status transition validation trigger
CREATE OR REPLACE FUNCTION app.validate_bgcheck_status_transition()
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
        WHEN 'pending' THEN
            IF NEW.status NOT IN ('in_progress', 'failed') THEN
                RAISE EXCEPTION 'Invalid background check status transition: pending -> %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            IF NEW.status NOT IN ('completed', 'failed') THEN
                RAISE EXCEPTION 'Invalid background check status transition: in_progress -> %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            RAISE EXCEPTION 'Invalid background check status transition: completed is a terminal state';

        WHEN 'failed' THEN
            -- Failed checks can be retried by creating a new request
            RAISE EXCEPTION 'Invalid background check status transition: failed is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown background check status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_bgcheck_status_transition
    BEFORE UPDATE OF status ON app.background_check_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_bgcheck_status_transition();

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app.background_check_requests TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.background_check_requests IS 'Background check requests sent to external screening providers (DBS, credit, employment history, education, references). TODO-194.';
COMMENT ON COLUMN app.background_check_requests.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.background_check_requests.tenant_id IS 'Tenant that owns this request';
COMMENT ON COLUMN app.background_check_requests.employee_id IS 'Employee being checked';
COMMENT ON COLUMN app.background_check_requests.check_type IS 'Type of background check (dbs, credit, employment_history, education, references)';
COMMENT ON COLUMN app.background_check_requests.provider IS 'Name of the external screening provider';
COMMENT ON COLUMN app.background_check_requests.provider_reference IS 'Provider-assigned reference/tracking ID for the check';
COMMENT ON COLUMN app.background_check_requests.status IS 'Current status of the check request';
COMMENT ON COLUMN app.background_check_requests.result IS 'JSONB result payload from the provider';
COMMENT ON COLUMN app.background_check_requests.requested_at IS 'When the check was originally requested';
COMMENT ON COLUMN app.background_check_requests.completed_at IS 'When the provider returned a result (completed or failed)';
COMMENT ON COLUMN app.background_check_requests.requested_by IS 'User who initiated the check request';
COMMENT ON COLUMN app.background_check_requests.webhook_secret IS 'HMAC secret for verifying provider webhook callbacks for this request';
COMMENT ON FUNCTION app.validate_bgcheck_status_transition IS 'Enforces valid status transitions for background check requests';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS validate_bgcheck_status_transition ON app.background_check_requests;
-- DROP FUNCTION IF EXISTS app.validate_bgcheck_status_transition();
-- DROP TRIGGER IF EXISTS update_background_check_requests_updated_at ON app.background_check_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.background_check_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.background_check_requests;
-- DROP INDEX IF EXISTS app.idx_bgcheck_requests_created_at;
-- DROP INDEX IF EXISTS app.idx_bgcheck_requests_provider_ref;
-- DROP INDEX IF EXISTS app.idx_bgcheck_requests_tenant_status;
-- DROP INDEX IF EXISTS app.idx_bgcheck_requests_tenant_employee;
-- DROP TABLE IF EXISTS app.background_check_requests;
-- DROP TYPE IF EXISTS app.background_check_request_status;
-- DROP TYPE IF EXISTS app.background_check_type;
