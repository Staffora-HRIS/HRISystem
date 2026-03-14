-- Migration: 0144_diversity_monitoring.sql
-- Description: Add voluntary diversity monitoring fields (Equality Act 2010)
-- All fields are voluntary. Must have explicit consent before collection.
-- Data used for aggregate monitoring only (Equality Act 2010).

-- =============================================================================
-- UP
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.diversity_data (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  employee_id   uuid NOT NULL,

  -- Ethnicity (voluntary, free-text with predefined suggestions)
  ethnicity          varchar(100),
  ethnicity_other    varchar(100),

  -- Disability (voluntary, Equality Act 2010 categories)
  disability_status  varchar(50) CHECK (
    disability_status IS NULL
    OR disability_status IN (
      'prefer_not_to_say',
      'no',
      'yes_limited_a_lot',
      'yes_limited_a_little'
    )
  ),
  disability_details text,

  -- Religion or belief (voluntary)
  religion_belief    varchar(100),
  religion_other     varchar(100),

  -- Sexual orientation (voluntary)
  sexual_orientation varchar(100) CHECK (
    sexual_orientation IS NULL
    OR sexual_orientation IN (
      'prefer_not_to_say',
      'heterosexual',
      'gay_or_lesbian',
      'bisexual',
      'other'
    )
  ),
  sexual_orientation_other varchar(100),

  -- Consent tracking (mandatory before data collection)
  consent_given      boolean NOT NULL DEFAULT false,
  consent_date       timestamptz,
  consent_ip         varchar(45),

  -- Timestamps
  data_collected_at  timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT fk_diversity_tenant
    FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_diversity_employee
    FOREIGN KEY (employee_id) REFERENCES app.employees(id) ON DELETE CASCADE,
  CONSTRAINT uq_diversity_employee
    UNIQUE (tenant_id, employee_id)
);

-- Comment on table purpose and legal basis
COMMENT ON TABLE app.diversity_data IS
  'Voluntary diversity monitoring data. All fields are voluntary. '
  'Must have explicit consent before collection. '
  'Data used for aggregate monitoring only (Equality Act 2010).';

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_diversity_data_tenant_employee
  ON app.diversity_data (tenant_id, employee_id);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.diversity_data ENABLE ROW LEVEL SECURITY;

-- Read isolation: tenant can only see its own data
CREATE POLICY tenant_isolation
  ON app.diversity_data
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Insert isolation: tenant can only insert its own data
CREATE POLICY tenant_isolation_insert
  ON app.diversity_data
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.diversity_data TO hris_app;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.diversity_data;
