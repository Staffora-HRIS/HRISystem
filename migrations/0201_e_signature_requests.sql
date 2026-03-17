-- Migration: 0201_e_signature_requests
-- Description: Create e-signature requests table for document signing workflows.
--              Supports internal "I agree" signatures and external providers (DocuSign, HelloSign).
-- Reversible: Yes (DROP TABLE at bottom in comment)

-- =============================================================================
-- Table: signature_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.signature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  document_id     uuid NOT NULL REFERENCES app.documents(id),

  -- Signer information
  signer_employee_id uuid REFERENCES app.employees(id),
  signer_email    text NOT NULL,

  -- Provider configuration
  provider        text NOT NULL DEFAULT 'internal'
                  CHECK (provider IN ('internal', 'docusign', 'hellosign')),
  provider_reference text,  -- external provider envelope/signature ID

  -- Status tracking (state machine)
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled', 'voided')),

  -- Timestamps for the signing lifecycle
  sent_at         timestamptz,
  viewed_at       timestamptz,
  signed_at       timestamptz,
  declined_at     timestamptz,
  expires_at      timestamptz,

  -- Signed document storage
  signed_document_url text,

  -- Internal signature metadata (IP, user agent for audit)
  signature_ip    inet,
  signature_user_agent text,
  signature_statement text DEFAULT 'I confirm I have read and agree to this document.',

  -- Decline reason (when status = declined)
  decline_reason  text,

  -- General metadata
  message         text,           -- optional message sent with the signature request
  reminder_count  integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,

  -- Audit fields
  requested_by    uuid NOT NULL REFERENCES app.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_signature_requests_tenant
  ON app.signature_requests(tenant_id);

CREATE INDEX idx_signature_requests_document
  ON app.signature_requests(document_id);

CREATE INDEX idx_signature_requests_signer_employee
  ON app.signature_requests(signer_employee_id)
  WHERE signer_employee_id IS NOT NULL;

CREATE INDEX idx_signature_requests_status
  ON app.signature_requests(tenant_id, status);

CREATE INDEX idx_signature_requests_provider_ref
  ON app.signature_requests(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX idx_signature_requests_signer_email
  ON app.signature_requests(tenant_id, signer_email);

CREATE INDEX idx_signature_requests_expires_at
  ON app.signature_requests(expires_at)
  WHERE expires_at IS NOT NULL AND status NOT IN ('signed', 'declined', 'cancelled', 'voided');

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.signature_requests
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.signature_requests
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Audit trail table for signature status transitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.signature_request_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id),
  signature_request_id uuid NOT NULL REFERENCES app.signature_requests(id) ON DELETE CASCADE,
  from_status         text,
  to_status           text NOT NULL,
  actor_id            uuid REFERENCES app.users(id),
  actor_ip            inet,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signature_request_events_request
  ON app.signature_request_events(signature_request_id);

CREATE INDEX idx_signature_request_events_tenant
  ON app.signature_request_events(tenant_id);

ALTER TABLE app.signature_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.signature_request_events
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.signature_request_events
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Updated-at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION app.update_signature_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_signature_requests_updated_at
  BEFORE UPDATE ON app.signature_requests
  FOR EACH ROW
  EXECUTE FUNCTION app.update_signature_requests_updated_at();

-- =============================================================================
-- Grant permissions to app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.signature_requests TO hris_app;
GRANT SELECT, INSERT ON app.signature_request_events TO hris_app;

-- =============================================================================
-- Rollback (uncomment to reverse):
-- DROP TABLE IF EXISTS app.signature_request_events CASCADE;
-- DROP TABLE IF EXISTS app.signature_requests CASCADE;
-- DROP FUNCTION IF EXISTS app.update_signature_requests_updated_at();
-- =============================================================================
