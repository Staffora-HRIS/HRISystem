-- Migration: 0076_notifications
-- Created: 2026-01-07
-- Description: Create tables for notification system used by notification worker
--              Includes notifications, delivery tracking, and push tokens

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Notifications table - In-app notifications
CREATE TABLE IF NOT EXISTS app.notifications (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Target user
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Notification content
    title varchar(255) NOT NULL,
    message text NOT NULL,
    type varchar(100) NOT NULL,

    -- Action details (optional)
    action_url text,
    action_text varchar(100),
    icon varchar(100),

    -- Additional data as JSON
    data jsonb NOT NULL DEFAULT '{}',

    -- Read/dismissed status
    read_at timestamptz,
    dismissed_at timestamptz,

    -- Expiration
    expires_at timestamptz,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Notification Deliveries - Track delivery attempts across channels
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.notification_deliveries (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User (may be null for non-user notifications)
    user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Delivery channel
    channel varchar(50) NOT NULL, -- 'email', 'in_app', 'push'

    -- Recipient info
    recipient varchar(255) NOT NULL, -- email address or user ID

    -- Content summary
    subject varchar(500),

    -- External message ID (from email provider, etc.)
    message_id varchar(255),

    -- Delivery status
    success boolean NOT NULL DEFAULT false,
    error text,

    -- Additional metadata
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Timestamps
    delivered_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Push Tokens - Device tokens for push notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.push_tokens (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who owns this token
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Token details
    token text NOT NULL,
    platform varchar(50) NOT NULL, -- 'ios', 'android', 'web'

    -- Device information
    device_name varchar(255),
    device_model varchar(255),

    -- Status
    enabled boolean NOT NULL DEFAULT true,

    -- Expiration
    expires_at timestamptz,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint per user/token combo
    CONSTRAINT unique_user_token UNIQUE (user_id, token)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user
    ON app.notifications(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON app.notifications(user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_expires
    ON app.notifications(expires_at)
    WHERE expires_at IS NOT NULL AND dismissed_at IS NULL;

-- Notification deliveries indexes
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_tenant
    ON app.notification_deliveries(tenant_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
    ON app.notification_deliveries(user_id, delivered_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_message_id
    ON app.notification_deliveries(message_id)
    WHERE message_id IS NOT NULL;

-- Push tokens indexes
CREATE INDEX IF NOT EXISTS idx_push_tokens_user
    ON app.push_tokens(user_id)
    WHERE enabled = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS on notifications
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.notifications
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Enable RLS on notification_deliveries
ALTER TABLE app.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.notification_deliveries
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Push tokens - users can only see their own tokens
ALTER TABLE app.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_owns_token ON app.push_tokens
    FOR ALL
    USING (
        user_id = current_setting('app.current_user', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Mark notification as read
CREATE OR REPLACE FUNCTION app.mark_notification_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.notifications
    SET read_at = now(),
        updated_at = now()
    WHERE id = p_notification_id
      AND read_at IS NULL;

    RETURN FOUND;
END;
$$;

-- Mark all notifications as read for a user
CREATE OR REPLACE FUNCTION app.mark_all_notifications_read(p_tenant_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE app.notifications
    SET read_at = now(),
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND read_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Get unread notification count
CREATE OR REPLACE FUNCTION app.get_unread_notification_count(p_tenant_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM app.notifications
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND read_at IS NULL
      AND (expires_at IS NULL OR expires_at > now());

    RETURN v_count;
END;
$$;

-- Cleanup expired notifications
CREATE OR REPLACE FUNCTION app.cleanup_expired_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer;
BEGIN
    PERFORM app.enable_system_context();

    DELETE FROM app.notifications
    WHERE expires_at IS NOT NULL
      AND expires_at < now() - interval '7 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM app.disable_system_context();

    RETURN v_count;
END;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Update updated_at on notifications
CREATE OR REPLACE FUNCTION app.update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON app.notifications
    FOR EACH ROW
    EXECUTE FUNCTION app.update_notification_timestamp();

CREATE TRIGGER trg_push_tokens_updated_at
    BEFORE UPDATE ON app.push_tokens
    FOR EACH ROW
    EXECUTE FUNCTION app.update_notification_timestamp();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.notifications IS 'In-app notifications for users';
COMMENT ON TABLE app.notification_deliveries IS 'Tracks delivery attempts across all notification channels';
COMMENT ON TABLE app.push_tokens IS 'Push notification device tokens for users';

COMMENT ON COLUMN app.notifications.type IS 'Notification category/type for filtering and display';
COMMENT ON COLUMN app.notification_deliveries.channel IS 'Delivery channel: email, in_app, or push';
COMMENT ON COLUMN app.push_tokens.platform IS 'Device platform: ios, android, or web';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_push_tokens_updated_at ON app.push_tokens;
-- DROP TRIGGER IF EXISTS trg_notifications_updated_at ON app.notifications;
-- DROP FUNCTION IF EXISTS app.update_notification_timestamp();
-- DROP FUNCTION IF EXISTS app.cleanup_expired_notifications();
-- DROP FUNCTION IF EXISTS app.get_unread_notification_count(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.mark_all_notifications_read(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.mark_notification_read(uuid);
-- DROP POLICY IF EXISTS user_owns_token ON app.push_tokens;
-- DROP POLICY IF EXISTS tenant_isolation ON app.notification_deliveries;
-- DROP POLICY IF EXISTS tenant_isolation ON app.notifications;
-- DROP TABLE IF EXISTS app.push_tokens;
-- DROP TABLE IF EXISTS app.notification_deliveries;
-- DROP TABLE IF EXISTS app.notifications;
