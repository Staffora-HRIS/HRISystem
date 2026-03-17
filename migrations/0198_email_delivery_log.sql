-- Migration: 0198_email_delivery_log
-- Created: 2026-03-17
-- Description: Create email_delivery_log table for email delivery monitoring,
--              bounce handling, and delivery status tracking (TODO-223)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Email delivery status type
CREATE TYPE app.email_delivery_status AS ENUM (
    'queued',
    'sent',
    'delivered',
    'bounced',
    'failed'
);

-- Email delivery log table
CREATE TABLE app.email_delivery_log (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context (mandatory for RLS)
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Recipient information
    to_address varchar(320) NOT NULL,  -- RFC 5321 max email length

    -- Email content metadata
    subject varchar(998) NOT NULL,     -- RFC 2822 max subject length
    template_name varchar(255),        -- Template used (nullable for ad-hoc emails)

    -- Delivery status lifecycle: queued -> sent -> delivered/bounced/failed
    status app.email_delivery_status NOT NULL DEFAULT 'queued',

    -- External message ID from email provider (e.g., SMTP Message-ID)
    message_id varchar(255),

    -- Timestamps for status transitions
    sent_at timestamptz,
    delivered_at timestamptz,
    bounced_at timestamptz,

    -- Bounce handling
    bounce_type varchar(50),           -- 'hard', 'soft', 'complaint'
    bounce_reason text,

    -- Error tracking (for 'failed' status)
    error_message text,

    -- Retry tracking
    retry_count integer NOT NULL DEFAULT 0,
    next_retry_at timestamptz,

    -- Contextual metadata (e.g., related entity, triggered by event)
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + date range (most common admin query)
CREATE INDEX idx_email_delivery_log_tenant_created
    ON app.email_delivery_log(tenant_id, created_at DESC);

-- Filter by status within tenant
CREATE INDEX idx_email_delivery_log_tenant_status
    ON app.email_delivery_log(tenant_id, status, created_at DESC);

-- Lookup by recipient email within tenant
CREATE INDEX idx_email_delivery_log_tenant_to
    ON app.email_delivery_log(tenant_id, to_address, created_at DESC);

-- Lookup by template name within tenant (for template performance monitoring)
CREATE INDEX idx_email_delivery_log_tenant_template
    ON app.email_delivery_log(tenant_id, template_name, created_at DESC)
    WHERE template_name IS NOT NULL;

-- Lookup by external message ID (for webhook callbacks / bounce processing)
CREATE INDEX idx_email_delivery_log_message_id
    ON app.email_delivery_log(message_id)
    WHERE message_id IS NOT NULL;

-- Pending retries (for retry worker)
CREATE INDEX idx_email_delivery_log_pending_retry
    ON app.email_delivery_log(next_retry_at)
    WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Bounced emails (for bounce monitoring dashboard)
CREATE INDEX idx_email_delivery_log_bounced
    ON app.email_delivery_log(tenant_id, bounced_at DESC)
    WHERE status = 'bounced';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.email_delivery_log ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON app.email_delivery_log
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Tenant isolation for INSERT
CREATE POLICY tenant_isolation_insert ON app.email_delivery_log
    FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp on row modification
CREATE TRIGGER trg_email_delivery_log_updated_at
    BEFORE UPDATE ON app.email_delivery_log
    FOR EACH ROW
    EXECUTE FUNCTION app.update_notification_timestamp();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app.email_delivery_log TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.email_delivery_log IS 'Tracks email delivery lifecycle: queued, sent, delivered, bounced, failed';
COMMENT ON COLUMN app.email_delivery_log.status IS 'Delivery status: queued -> sent -> delivered/bounced/failed';
COMMENT ON COLUMN app.email_delivery_log.template_name IS 'Email template used for rendering, null for ad-hoc emails';
COMMENT ON COLUMN app.email_delivery_log.bounce_type IS 'Bounce classification: hard (permanent), soft (temporary), complaint';
COMMENT ON COLUMN app.email_delivery_log.bounce_reason IS 'Detailed bounce reason from email provider';
COMMENT ON COLUMN app.email_delivery_log.message_id IS 'External message ID from SMTP/provider for correlating webhooks';
COMMENT ON COLUMN app.email_delivery_log.retry_count IS 'Number of send retry attempts';
COMMENT ON COLUMN app.email_delivery_log.metadata IS 'Additional context: related entity type/id, triggering event, etc.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_email_delivery_log_updated_at ON app.email_delivery_log;
-- DROP TABLE IF EXISTS app.email_delivery_log;
-- DROP TYPE IF EXISTS app.email_delivery_status;
