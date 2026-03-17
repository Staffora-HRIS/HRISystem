-- Migration: 0200_push_subscriptions
-- Created: 2026-03-17
-- Description: Create push_subscriptions table for Web Push (VAPID) notifications.
--              Stores W3C Push API subscription objects (endpoint, keys.auth, keys.p256dh)
--              per user per device. This is separate from push_tokens (FCM/APNs) and
--              follows the Web Push standard (RFC 8030, RFC 8291, RFC 8292).
--
-- Reversible: Yes (see DOWN section)

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.push_subscriptions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context (required for RLS)
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User who owns this subscription
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Web Push subscription fields (from PushSubscription JS API)
    -- The push service endpoint URL (unique per subscription)
    endpoint text NOT NULL,

    -- VAPID authentication key (base64url-encoded)
    auth_key text NOT NULL,

    -- ECDH public key for message encryption (base64url-encoded)
    p256dh_key text NOT NULL,

    -- Device metadata
    device_type varchar(50) NOT NULL DEFAULT 'web',
    -- CHECK constraint limits known device types
    CONSTRAINT chk_device_type CHECK (device_type IN ('web', 'mobile_web', 'pwa')),

    -- Optional user-agent or device label
    user_agent text,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint: one subscription endpoint per tenant
    CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (tenant_id, endpoint)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Lookup subscriptions by tenant + user (most common query path)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_user
    ON app.push_subscriptions(tenant_id, user_id);

-- Lookup by endpoint for deduplication and unsubscribe
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
    ON app.push_subscriptions(endpoint);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON app.push_subscriptions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Explicit INSERT policy (project standard: separate insert policy)
CREATE POLICY tenant_isolation_insert ON app.push_subscriptions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- No updated_at column (subscriptions are immutable; replace on re-subscribe)

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.push_subscriptions IS 'Web Push (VAPID) subscriptions per user. Stores W3C Push API subscription objects.';
COMMENT ON COLUMN app.push_subscriptions.endpoint IS 'Push service endpoint URL from PushSubscription.endpoint';
COMMENT ON COLUMN app.push_subscriptions.auth_key IS 'Base64url-encoded auth secret from PushSubscription.getKey("auth")';
COMMENT ON COLUMN app.push_subscriptions.p256dh_key IS 'Base64url-encoded ECDH public key from PushSubscription.getKey("p256dh")';
COMMENT ON COLUMN app.push_subscriptions.device_type IS 'Client type: web (desktop browser), mobile_web (mobile browser), pwa (installed PWA)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.push_subscriptions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.push_subscriptions;
-- DROP TABLE IF EXISTS app.push_subscriptions;
