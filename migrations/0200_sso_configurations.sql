-- Migration: 0200_sso_configurations.sql
-- Description: Create SSO (SAML/OIDC) configuration table for enterprise SSO integration.
--   Each tenant can have multiple SSO providers (e.g. Azure AD, Okta, Google Workspace).
--   Client secrets are encrypted at rest using pgcrypto (AES-256 via pgp_sym_encrypt).
-- Author: TODO-140
-- Date: 2026-03-17

-- =============================================================================
-- Ensure pgcrypto extension (required for AES encryption of client_secret)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- SSO Configurations Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.sso_configurations (
  -- Primary key
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

  -- Provider type: 'saml' or 'oidc'
  provider_type   text NOT NULL CHECK (provider_type IN ('saml', 'oidc')),

  -- Human-readable provider name (e.g. "Azure AD", "Okta", "Google Workspace")
  provider_name   text NOT NULL,

  -- OIDC: client_id issued by the IdP
  client_id       text,

  -- OIDC: client_secret encrypted at rest using pgp_sym_encrypt.
  -- The encryption key is the app.sso_encryption_key GUC (set by the application).
  -- NULL for SAML providers that do not use client credentials.
  client_secret_encrypted bytea,

  -- OIDC: issuer URL (e.g. https://login.microsoftonline.com/{tenantId}/v2.0)
  -- SAML: issuer / entity ID of the IdP
  issuer_url      text,

  -- SAML: metadata URL for automatic configuration refresh
  -- OIDC: well-known configuration URL (usually derived from issuer_url)
  metadata_url    text,

  -- SAML: IdP X.509 signing certificate (PEM-encoded)
  certificate     text,

  -- Mapping from IdP claims/attributes to Staffora user fields.
  -- Example: {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  --           "name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  --           "groups": "http://schemas.xmlsoap.org/claims/Group"}
  attribute_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Whether this SSO configuration is active
  enabled         boolean NOT NULL DEFAULT false,

  -- Allow auto-provisioning of users on first SSO login (JIT provisioning)
  auto_provision  boolean NOT NULL DEFAULT false,

  -- Optional: restrict SSO to users whose email domain matches
  -- Example: ["company.com", "subsidiary.co.uk"]
  allowed_domains jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Optional: default role to assign to auto-provisioned users
  default_role_id uuid REFERENCES app.roles(id),

  -- Audit timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES app.users(id),
  updated_by      uuid REFERENCES app.users(id),

  -- Unique constraint: one provider name per tenant to prevent duplicates
  CONSTRAINT uq_sso_configurations_tenant_provider UNIQUE (tenant_id, provider_name)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_sso_configurations_tenant_id
  ON app.sso_configurations(tenant_id);

CREATE INDEX idx_sso_configurations_tenant_enabled
  ON app.sso_configurations(tenant_id, enabled)
  WHERE enabled = true;

CREATE INDEX idx_sso_configurations_provider_type
  ON app.sso_configurations(provider_type);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.sso_configurations ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: read/update/delete
CREATE POLICY tenant_isolation ON app.sso_configurations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation: insert
CREATE POLICY tenant_isolation_insert ON app.sso_configurations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- SSO Login Attempts table (audit trail for SSO logins)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.sso_login_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  sso_config_id     uuid NOT NULL REFERENCES app.sso_configurations(id) ON DELETE CASCADE,

  -- The IdP subject identifier (sub claim in OIDC, NameID in SAML)
  idp_subject       text NOT NULL,

  -- Email returned by the IdP
  email             text,

  -- Staffora user linked to this login (NULL if not yet provisioned)
  user_id           uuid REFERENCES app.users(id),

  -- Outcome of the SSO attempt
  status            text NOT NULL CHECK (status IN ('success', 'failed', 'user_not_found', 'domain_rejected', 'disabled')),

  -- Failure details (if status != 'success')
  error_message     text,

  -- Client metadata
  ip_address        inet,
  user_agent        text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sso_login_attempts_tenant_id
  ON app.sso_login_attempts(tenant_id);

CREATE INDEX idx_sso_login_attempts_config
  ON app.sso_login_attempts(sso_config_id);

CREATE INDEX idx_sso_login_attempts_created_at
  ON app.sso_login_attempts(created_at DESC);

CREATE INDEX idx_sso_login_attempts_user_id
  ON app.sso_login_attempts(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE app.sso_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.sso_login_attempts
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.sso_login_attempts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Helper: Encrypt SSO client secret
-- Usage: app.encrypt_sso_secret('my-secret', 'encryption-key')
-- =============================================================================

CREATE OR REPLACE FUNCTION app.encrypt_sso_secret(
  p_secret text,
  p_key text
) RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT pgp_sym_encrypt(p_secret, p_key)
$$;

-- =============================================================================
-- Helper: Decrypt SSO client secret
-- Usage: app.decrypt_sso_secret(encrypted_bytes, 'encryption-key')
-- =============================================================================

CREATE OR REPLACE FUNCTION app.decrypt_sso_secret(
  p_encrypted bytea,
  p_key text
) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT pgp_sym_decrypt(p_encrypted, p_key)
$$;

-- =============================================================================
-- Grants for application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.sso_configurations TO hris_app;
GRANT SELECT, INSERT ON app.sso_login_attempts TO hris_app;
GRANT EXECUTE ON FUNCTION app.encrypt_sso_secret(text, text) TO hris_app;
GRANT EXECUTE ON FUNCTION app.decrypt_sso_secret(bytea, text) TO hris_app;

-- =============================================================================
-- Rollback
-- =============================================================================
-- DROP TABLE IF EXISTS app.sso_login_attempts;
-- DROP TABLE IF EXISTS app.sso_configurations;
-- DROP FUNCTION IF EXISTS app.encrypt_sso_secret(text, text);
-- DROP FUNCTION IF EXISTS app.decrypt_sso_secret(bytea, text);
