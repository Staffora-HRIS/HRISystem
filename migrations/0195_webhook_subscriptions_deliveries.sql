-- Migration: 0195_webhook_subscriptions_deliveries
-- Created: 2026-03-17
-- Description: Create webhook_subscriptions and webhook_deliveries tables for
--              configurable outbound webhook support. Tenant-owned tables with
--              full RLS, HMAC-SHA256 signing, and delivery tracking with retry.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Webhook Subscriptions Table
-- -----------------------------------------------------------------------------
-- Stores user-configurable outbound webhook endpoints per tenant.
-- Each subscription targets a URL, signs payloads with a shared secret,
-- and can be filtered by event type patterns.
CREATE TABLE IF NOT EXISTS app.webhook_subscriptions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Display name for the subscription
    name varchar(255) NOT NULL,

    -- Target URL for webhook delivery (HTTPS strongly recommended)
    url text NOT NULL,

    -- HMAC-SHA256 signing secret (stored encrypted at rest by the application)
    secret text NOT NULL,

    -- JSON array of event type patterns to subscribe to
    -- Supports exact matches ("hr.employee.created") and wildcards ("hr.employee.*", "*")
    event_types jsonb NOT NULL DEFAULT '["*"]',

    -- Whether this subscription is active and should receive deliveries
    enabled boolean NOT NULL DEFAULT true,

    -- Optional description
    description text,

    -- Metadata for the subscription (custom headers, etc.)
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT webhook_subscriptions_url_not_empty CHECK (length(trim(url)) > 0),
    CONSTRAINT webhook_subscriptions_secret_not_empty CHECK (length(secret) >= 32),
    CONSTRAINT webhook_subscriptions_event_types_is_array CHECK (jsonb_typeof(event_types) = 'array'),
    CONSTRAINT webhook_subscriptions_name_not_empty CHECK (length(trim(name)) > 0)
);

-- -----------------------------------------------------------------------------
-- Webhook Deliveries Table
-- -----------------------------------------------------------------------------
-- Tracks every delivery attempt for each webhook subscription.
-- Supports retry with exponential backoff and stores response details for
-- debugging delivery failures.
CREATE TABLE IF NOT EXISTS app.webhook_deliveries (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Which subscription this delivery is for
    subscription_id uuid NOT NULL REFERENCES app.webhook_subscriptions(id) ON DELETE CASCADE,

    -- The domain event that triggered this delivery
    event_id uuid,

    -- Event type that was matched
    event_type varchar(255) NOT NULL,

    -- The payload that was/will be delivered
    payload jsonb NOT NULL,

    -- Delivery status
    status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'success', 'failed', 'expired')),

    -- Number of delivery attempts made so far
    attempts integer NOT NULL DEFAULT 0,

    -- Maximum attempts allowed (from subscription config or system default)
    max_attempts integer NOT NULL DEFAULT 5,

    -- When the last attempt was made
    last_attempt_at timestamptz,

    -- When the next retry should occur (NULL if not scheduled)
    next_retry_at timestamptz,

    -- HTTP response code from the last attempt
    response_code integer,

    -- HTTP response body from the last attempt (truncated to 4KB)
    response_body text,

    -- Error message if delivery failed
    error_message text,

    -- Duration of the last request in milliseconds
    duration_ms integer,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Webhook Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant
    ON app.webhook_subscriptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant_enabled
    ON app.webhook_subscriptions(tenant_id, enabled)
    WHERE enabled = true;

-- GIN index for event_types JSONB array containment queries
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_types
    ON app.webhook_subscriptions USING gin(event_types);

-- Webhook Deliveries indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant
    ON app.webhook_deliveries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
    ON app.webhook_deliveries(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_status
    ON app.webhook_deliveries(tenant_id, status);

-- Pending deliveries ready for retry (used by the webhook worker)
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_retry
    ON app.webhook_deliveries(next_retry_at, status)
    WHERE status = 'pending' AND next_retry_at IS NOT NULL;

-- Event-based lookup
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
    ON app.webhook_deliveries(event_id)
    WHERE event_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS on webhook_subscriptions
ALTER TABLE app.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.webhook_subscriptions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.webhook_subscriptions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Enable RLS on webhook_deliveries
ALTER TABLE app.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.webhook_deliveries
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.webhook_deliveries
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp on webhook_subscriptions
CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON app.webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Auto-update updated_at timestamp on webhook_deliveries
CREATE TRIGGER update_webhook_deliveries_updated_at
    BEFORE UPDATE ON app.webhook_deliveries
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grants
-- =============================================================================

-- Grant permissions to the application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.webhook_subscriptions TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.webhook_deliveries TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.webhook_subscriptions IS 'User-configurable outbound webhook subscriptions per tenant.';
COMMENT ON COLUMN app.webhook_subscriptions.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.webhook_subscriptions.tenant_id IS 'Tenant this subscription belongs to';
COMMENT ON COLUMN app.webhook_subscriptions.name IS 'Display name for the webhook subscription';
COMMENT ON COLUMN app.webhook_subscriptions.url IS 'Target URL for webhook delivery';
COMMENT ON COLUMN app.webhook_subscriptions.secret IS 'HMAC-SHA256 signing secret';
COMMENT ON COLUMN app.webhook_subscriptions.event_types IS 'JSON array of event type patterns to subscribe to';
COMMENT ON COLUMN app.webhook_subscriptions.enabled IS 'Whether the subscription is active';
COMMENT ON COLUMN app.webhook_subscriptions.description IS 'Optional description of the webhook purpose';
COMMENT ON COLUMN app.webhook_subscriptions.metadata IS 'Additional metadata (custom headers, etc.)';

COMMENT ON TABLE app.webhook_deliveries IS 'Tracks webhook delivery attempts and their outcomes.';
COMMENT ON COLUMN app.webhook_deliveries.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.webhook_deliveries.tenant_id IS 'Tenant this delivery belongs to';
COMMENT ON COLUMN app.webhook_deliveries.subscription_id IS 'The webhook subscription this delivery is for';
COMMENT ON COLUMN app.webhook_deliveries.event_id IS 'The domain outbox event ID that triggered this delivery';
COMMENT ON COLUMN app.webhook_deliveries.event_type IS 'The event type that was matched';
COMMENT ON COLUMN app.webhook_deliveries.payload IS 'The JSON payload delivered to the webhook endpoint';
COMMENT ON COLUMN app.webhook_deliveries.status IS 'Delivery status: pending, success, failed, expired';
COMMENT ON COLUMN app.webhook_deliveries.attempts IS 'Number of delivery attempts made';
COMMENT ON COLUMN app.webhook_deliveries.max_attempts IS 'Maximum delivery attempts before marking as failed';
COMMENT ON COLUMN app.webhook_deliveries.last_attempt_at IS 'Timestamp of the last delivery attempt';
COMMENT ON COLUMN app.webhook_deliveries.next_retry_at IS 'Scheduled time for the next retry attempt';
COMMENT ON COLUMN app.webhook_deliveries.response_code IS 'HTTP response status code from the last attempt';
COMMENT ON COLUMN app.webhook_deliveries.response_body IS 'HTTP response body from the last attempt (truncated)';
COMMENT ON COLUMN app.webhook_deliveries.error_message IS 'Error message if delivery failed';
COMMENT ON COLUMN app.webhook_deliveries.duration_ms IS 'Request duration in milliseconds';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_webhook_deliveries_updated_at ON app.webhook_deliveries;
-- DROP TRIGGER IF EXISTS update_webhook_subscriptions_updated_at ON app.webhook_subscriptions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.webhook_deliveries;
-- DROP POLICY IF EXISTS tenant_isolation ON app.webhook_deliveries;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.webhook_subscriptions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.webhook_subscriptions;
-- DROP INDEX IF EXISTS app.idx_webhook_deliveries_event;
-- DROP INDEX IF EXISTS app.idx_webhook_deliveries_pending_retry;
-- DROP INDEX IF EXISTS app.idx_webhook_deliveries_tenant_status;
-- DROP INDEX IF EXISTS app.idx_webhook_deliveries_subscription;
-- DROP INDEX IF EXISTS app.idx_webhook_deliveries_tenant;
-- DROP INDEX IF EXISTS app.idx_webhook_subscriptions_event_types;
-- DROP INDEX IF EXISTS app.idx_webhook_subscriptions_tenant_enabled;
-- DROP INDEX IF EXISTS app.idx_webhook_subscriptions_tenant;
-- DROP TABLE IF EXISTS app.webhook_deliveries;
-- DROP TABLE IF EXISTS app.webhook_subscriptions;
