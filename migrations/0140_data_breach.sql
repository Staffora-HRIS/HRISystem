-- Migration: 0140_data_breach
-- Created: 2026-03-13
-- Description: Data breach notification workflow for UK GDPR compliance.
--              Implements:
--              - Data breach register (data_breaches)
--              - Breach timeline / audit trail (data_breach_timeline)
--              - ICO 72-hour notification deadline tracking
--              - Individual notification tracking
--              - DPO notification tracking
--
--              UK GDPR Article 33 requires reporting personal data breaches
--              to the ICO within 72 hours of becoming aware.
--              Article 34 requires notifying affected individuals when there
--              is a high risk to their rights and freedoms.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Breach severity levels
DO $$ BEGIN
  CREATE TYPE app.breach_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Breach status workflow:
-- detected -> investigating -> contained -> notified_ico -> notified_individuals -> resolved -> closed
DO $$ BEGIN
  CREATE TYPE app.breach_status AS ENUM (
    'detected',
    'investigating',
    'contained',
    'notified_ico',
    'notified_individuals',
    'resolved',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- data_breaches - Data Breach Register
-- -----------------------------------------------------------------------------
-- Central register of all personal data breaches as required by UK GDPR
-- Article 33(5). Records the facts, effects, and remedial actions for each
-- breach along with ICO and individual notification status.

CREATE TABLE IF NOT EXISTS app.data_breaches (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       uuid NOT NULL,

  -- Breach identification
  title                           varchar(255) NOT NULL,
  description                     text,
  detected_at                     timestamptz NOT NULL,
  detected_by                     uuid NOT NULL,           -- user who detected / reported
  severity                        app.breach_severity NOT NULL DEFAULT 'medium',
  status                          app.breach_status NOT NULL DEFAULT 'detected',

  -- Breach classification
  breach_type                     varchar(100),            -- e.g. 'unauthorized_access', 'data_loss', 'cyber_attack', 'human_error'
  data_categories_affected        text[],                  -- e.g. '{"personal","financial","health"}'
  estimated_individuals_affected  int,

  -- Containment & investigation
  containment_actions             text,
  root_cause                      text,

  -- ICO notification (Article 33)
  ico_notified                    boolean NOT NULL DEFAULT false,
  ico_notification_date           timestamptz,
  ico_reference                   varchar(100),
  ico_deadline                    timestamptz,             -- auto-calculated: detected_at + 72 hours

  -- Individual notification (Article 34)
  individuals_notified            boolean NOT NULL DEFAULT false,
  individuals_notification_date   timestamptz,

  -- DPO notification
  dpo_notified                    boolean NOT NULL DEFAULT false,
  dpo_notification_date           timestamptz,

  -- Resolution
  lessons_learned                 text,
  remediation_plan                text,
  resolved_at                     timestamptz,

  -- Standard timestamps
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.data_breaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.data_breaches
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.data_breaches
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_data_breaches_tenant
  ON app.data_breaches (tenant_id);

CREATE INDEX IF NOT EXISTS idx_data_breaches_status
  ON app.data_breaches (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_data_breaches_severity
  ON app.data_breaches (tenant_id, severity);

CREATE INDEX IF NOT EXISTS idx_data_breaches_detected_at
  ON app.data_breaches (tenant_id, detected_at DESC);

-- Overdue ICO notification: breaches past 72h without ICO notification
CREATE INDEX IF NOT EXISTS idx_data_breaches_ico_overdue
  ON app.data_breaches (ico_deadline)
  WHERE ico_notified = false AND status NOT IN ('closed');

CREATE INDEX IF NOT EXISTS idx_data_breaches_detected_by
  ON app.data_breaches (detected_by);

-- Updated_at trigger
CREATE TRIGGER set_data_breaches_updated_at
  BEFORE UPDATE ON app.data_breaches
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- data_breach_timeline - Breach Timeline / Audit Trail
-- -----------------------------------------------------------------------------
-- Immutable timeline of all actions taken on a data breach.
-- Provides the audit trail required by Article 33(5) to document
-- the facts, effects, and remedial actions.

CREATE TABLE IF NOT EXISTS app.data_breach_timeline (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  breach_id    uuid NOT NULL REFERENCES app.data_breaches(id) ON DELETE CASCADE,

  action       varchar(255) NOT NULL,
  action_by    uuid,                    -- user who performed the action
  action_at    timestamptz NOT NULL DEFAULT now(),
  notes        text,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.data_breach_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.data_breach_timeline
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.data_breach_timeline
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_data_breach_timeline_breach
  ON app.data_breach_timeline (breach_id, action_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_breach_timeline_tenant
  ON app.data_breach_timeline (tenant_id);

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- To rollback:
--   DROP TABLE IF EXISTS app.data_breach_timeline CASCADE;
--   DROP TABLE IF EXISTS app.data_breaches CASCADE;
--   DROP TYPE IF EXISTS app.breach_status;
--   DROP TYPE IF EXISTS app.breach_severity;
