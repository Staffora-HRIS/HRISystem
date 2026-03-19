-- =============================================================================
-- Migration: 0216_outbound_webhooks
-- Description: Configurable outbound webhooks with delivery tracking (TODO-190)
-- =============================================================================

-- =============================================================================
-- Table: webhook_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.webhook_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  name            text NOT NULL,
  url             text NOT NULL,
  secret          text NOT NULL,
  event_types     jsonb NOT NULL DEFAULT '[]',
  enabled         boolean NOT NULL DEFAULT true,
  description     text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES app.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_subscriptions_tenant
  ON app.webhook_subscriptions(tenant_id);

CREATE INDEX idx_webhook_subscriptions_active
  ON app.webhook_subscriptions(tenant_id, enabled)
  WHERE enabled = true;

ALTER TABLE app.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.webhook_subscriptions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.webhook_subscriptions
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.webhook_subscriptions TO hris_app;

-- =============================================================================
-- Table: webhook_deliveries
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.webhook_deliveries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  subscription_id   uuid NOT NULL REFERENCES app.webhook_subscriptions(id) ON DELETE CASCADE,
  event_id          uuid,
  event_type        text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  attempts          integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 5,
  last_attempt_at   timestamptz,
  next_retry_at     timestamptz,
  response_code     integer,
  response_body     text,
  error_message     text,
  duration_ms       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_tenant
  ON app.webhook_deliveries(tenant_id);

CREATE INDEX idx_webhook_deliveries_subscription
  ON app.webhook_deliveries(subscription_id);

CREATE INDEX idx_webhook_deliveries_pending
  ON app.webhook_deliveries(next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;

CREATE INDEX idx_webhook_deliveries_created_at
  ON app.webhook_deliveries(tenant_id, created_at DESC);

ALTER TABLE app.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.webhook_deliveries
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.webhook_deliveries
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.webhook_deliveries TO hris_app;
