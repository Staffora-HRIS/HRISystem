-- Migration: 0127_dsar
-- Created: 2026-03-13
-- Description: Data Subject Access Request (DSAR) tables for UK GDPR compliance
--
-- UK GDPR requires organisations to respond to DSARs within 30 calendar days.
-- This can be extended by up to 2 months for complex or numerous requests.
-- All DSAR activity must be logged for accountability (Article 5(2)).
--
-- Request types:
--   access       - Right of access (Article 15) — provide copy of personal data
--   rectification - Right to rectification (Article 16) — correct inaccurate data
--   erasure      - Right to erasure (Article 17) — "right to be forgotten"
--   portability  - Right to data portability (Article 20) — machine-readable export
--
-- Status lifecycle:
--   received → in_progress → data_gathering → review → completed
--   received → rejected (e.g., manifestly unfounded or excessive)
--   Any active status → extended (deadline extended by up to 60 days)
--   extended → data_gathering → review → completed

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: DSAR request type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsar_request_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.dsar_request_type AS ENUM ('access', 'rectification', 'erasure', 'portability');
  END IF;
END
$$;

-- Enum: DSAR request status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsar_request_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.dsar_request_status AS ENUM ('received', 'in_progress', 'data_gathering', 'review', 'completed', 'rejected', 'extended');
  END IF;
END
$$;

-- Enum: DSAR response format
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsar_response_format' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.dsar_response_format AS ENUM ('json', 'csv', 'pdf');
  END IF;
END
$$;

-- Enum: DSAR data item status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dsar_data_item_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.dsar_data_item_status AS ENUM ('pending', 'gathered', 'redacted', 'excluded');
  END IF;
END
$$;

-- =============================================================================
-- Table: dsar_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.dsar_requests (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Data subject
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,

    -- Who raised the request (may be the data subject or a DPO/admin)
    requested_by_user_id uuid NOT NULL,

    -- Request details
    request_type app.dsar_request_type NOT NULL,
    status app.dsar_request_status NOT NULL DEFAULT 'received',

    -- Deadline management (UK GDPR: 30 calendar days from receipt)
    received_date date NOT NULL,
    deadline_date date NOT NULL,  -- auto-calculated: received_date + 30 days
    extended_deadline_date date,  -- if extended, max received_date + 90 days
    extension_reason text,        -- mandatory justification for extension

    -- Completion tracking
    completed_date date,

    -- Response format preference
    response_format app.dsar_response_format NOT NULL DEFAULT 'json',

    -- Identity verification (required before processing personal data)
    identity_verified boolean NOT NULL DEFAULT false,
    identity_verified_date date,
    identity_verified_by uuid,

    -- Rejection details
    rejection_reason text,

    -- Notes (internal, not shared with data subject)
    notes text,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraint: extended deadline cannot exceed received_date + 90 days
ALTER TABLE app.dsar_requests
  ADD CONSTRAINT chk_dsar_extended_deadline
  CHECK (
    extended_deadline_date IS NULL
    OR extended_deadline_date <= (received_date + INTERVAL '90 days')::date
  );

-- Constraint: completed_date must be set when status is 'completed'
-- (soft constraint — enforced at service layer for flexibility)

-- Constraint: rejection_reason must be set when status is 'rejected'
-- (soft constraint — enforced at service layer for flexibility)

-- RLS
ALTER TABLE app.dsar_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.dsar_requests
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.dsar_requests
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dsar_requests_tenant ON app.dsar_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dsar_requests_employee ON app.dsar_requests (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_dsar_requests_status ON app.dsar_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dsar_requests_deadline ON app.dsar_requests (tenant_id, deadline_date)
  WHERE status NOT IN ('completed', 'rejected');
CREATE INDEX IF NOT EXISTS idx_dsar_requests_overdue ON app.dsar_requests (tenant_id, deadline_date)
  WHERE status NOT IN ('completed', 'rejected')
    AND (extended_deadline_date IS NULL);

-- Updated-at trigger
CREATE OR REPLACE TRIGGER trg_dsar_requests_updated_at
  BEFORE UPDATE ON app.dsar_requests
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at();

-- =============================================================================
-- Table: dsar_data_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.dsar_data_items (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent DSAR request
    dsar_request_id uuid NOT NULL REFERENCES app.dsar_requests(id) ON DELETE CASCADE,

    -- Module and category being gathered
    module_name varchar(50) NOT NULL,     -- e.g., 'hr', 'absence', 'time', 'payroll', 'benefits'
    data_category varchar(100) NOT NULL,  -- e.g., 'personal_details', 'salary_history', 'leave_records'

    -- Gathering status
    status app.dsar_data_item_status NOT NULL DEFAULT 'pending',

    -- Gathered data
    record_count integer DEFAULT 0,
    data_export jsonb,                    -- the actual data or reference to exported file

    -- Redaction / exclusion notes (GDPR allows redaction of third-party data)
    redaction_notes text,

    -- Who gathered this data
    gathered_by uuid,
    gathered_at timestamptz,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.dsar_data_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.dsar_data_items
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.dsar_data_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dsar_data_items_request ON app.dsar_data_items (dsar_request_id);
CREATE INDEX IF NOT EXISTS idx_dsar_data_items_status ON app.dsar_data_items (dsar_request_id, status);

-- Updated-at trigger
CREATE OR REPLACE TRIGGER trg_dsar_data_items_updated_at
  BEFORE UPDATE ON app.dsar_data_items
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at();

-- =============================================================================
-- Table: dsar_audit_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.dsar_audit_log (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent DSAR request
    dsar_request_id uuid NOT NULL REFERENCES app.dsar_requests(id) ON DELETE CASCADE,

    -- Action details
    action varchar(50) NOT NULL,  -- e.g., 'created', 'identity_verified', 'data_gathered', 'reviewed', 'completed', 'extended', 'rejected'
    performed_by uuid NOT NULL,

    -- Action details / metadata
    details jsonb,

    -- Immutable timestamp
    created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.dsar_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.dsar_audit_log
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.dsar_audit_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dsar_audit_log_request ON app.dsar_audit_log (dsar_request_id);
CREATE INDEX IF NOT EXISTS idx_dsar_audit_log_action ON app.dsar_audit_log (dsar_request_id, action);

-- =============================================================================
-- RBAC permissions for DSAR module
-- =============================================================================

-- Insert permissions (idempotent) for the DSAR resource
INSERT INTO app.permissions (id, resource, action, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'dsar', 'read', 'View DSAR requests and data items', now(), now()),
  (gen_random_uuid(), 'dsar', 'write', 'Create and manage DSAR requests', now(), now()),
  (gen_random_uuid(), 'dsar', 'delete', 'Delete DSAR requests (restricted)', now(), now())
ON CONFLICT (resource, action) DO NOTHING;

-- =============================================================================
-- DOWN Migration
-- =============================================================================

-- To rollback:
-- DROP TABLE IF EXISTS app.dsar_audit_log CASCADE;
-- DROP TABLE IF EXISTS app.dsar_data_items CASCADE;
-- DROP TABLE IF EXISTS app.dsar_requests CASCADE;
-- DROP TYPE IF EXISTS app.dsar_data_item_status;
-- DROP TYPE IF EXISTS app.dsar_response_format;
-- DROP TYPE IF EXISTS app.dsar_request_status;
-- DROP TYPE IF EXISTS app.dsar_request_type;
-- DELETE FROM app.permissions WHERE resource = 'dsar';
