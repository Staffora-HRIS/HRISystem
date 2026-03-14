-- Migration: 0162_data_retention
-- Created: 2026-03-14
-- Description: UK GDPR Article 5(1)(e) - Storage Limitation / Data Retention
--              Creates tables to manage data retention policies, scheduled reviews,
--              and retention exceptions (legal holds). Enables automated identification
--              and purging of data that has exceeded its retention period.
--
--              UK-specific retention periods enforced:
--              - Payroll/tax records: 6 years after end of tax year (HMRC)
--              - Pension records: 6 years after employment ends (Pensions Act 2008)
--              - Working time records: 2 years (Working Time Regulations 1998)
--              - Maternity/paternity records: 3 years after birth
--              - Accident/injury records: 3 years (Limitation Act 1980) or until child turns 21
--              - Medical/health records: 40 years from last entry (NHS/HSE guidance)
--              - Immigration/right to work: 2 years after employment ends (Immigration Act 2016)
--              - Recruitment (unsuccessful candidates): 6 months (ICO guidance)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Data Category Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.retention_data_category AS ENUM (
    'employee_records',
    'payroll',
    'tax',
    'time_entries',
    'leave_records',
    'performance_reviews',
    'training_records',
    'recruitment',
    'cases',
    'audit_logs',
    'documents',
    'medical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Legal Basis Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.retention_legal_basis AS ENUM (
    'employment_law',
    'tax_law',
    'pension_law',
    'limitation_act',
    'consent',
    'legitimate_interest'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Retention Policy Status Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.retention_policy_status AS ENUM (
    'active',
    'inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Retention Review Status Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.retention_review_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Retention Exception Reason Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.retention_exception_reason AS ENUM (
    'legal_hold',
    'active_litigation',
    'regulatory_investigation',
    'employee_request'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Retention Policies Table
-- =============================================================================
-- Configurable retention policies per data category, with UK legal basis tracking
CREATE TABLE IF NOT EXISTS app.retention_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Policy details
    name varchar(200) NOT NULL,
    description text,
    data_category app.retention_data_category NOT NULL,

    -- Retention period in months
    retention_period_months integer NOT NULL,

    -- Legal basis for retention (UK GDPR compliance)
    legal_basis app.retention_legal_basis NOT NULL,

    -- Whether expired records should be automatically purged
    auto_purge_enabled boolean NOT NULL DEFAULT false,

    -- Days before purge to send notification (0 = no notification)
    notification_before_purge_days integer NOT NULL DEFAULT 30,

    -- Policy status
    status app.retention_policy_status NOT NULL DEFAULT 'active',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT retention_policies_period_positive CHECK (
        retention_period_months > 0
    ),
    CONSTRAINT retention_policies_notification_positive CHECK (
        notification_before_purge_days >= 0
    ),
    -- One active policy per data category per tenant
    CONSTRAINT retention_policies_unique_active_category
        UNIQUE (tenant_id, data_category)
        -- NOTE: This prevents duplicate categories per tenant.
        -- If an org needs multiple policies per category (e.g., different
        -- retention for different employee groups), extend the schema
        -- with a scope/group discriminator.
);

-- =============================================================================
-- Retention Policies Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant
    ON app.retention_policies(tenant_id);

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant_status
    ON app.retention_policies(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant_category
    ON app.retention_policies(tenant_id, data_category);

CREATE INDEX IF NOT EXISTS idx_retention_policies_auto_purge
    ON app.retention_policies(tenant_id)
    WHERE auto_purge_enabled = true AND status = 'active';

-- =============================================================================
-- Retention Policies RLS
-- =============================================================================

ALTER TABLE app.retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.retention_policies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.retention_policies
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Retention Policies Triggers
-- =============================================================================

CREATE TRIGGER update_retention_policies_updated_at
    BEFORE UPDATE ON app.retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Retention Reviews Table
-- =============================================================================
-- Tracks each review/purge execution against a retention policy
CREATE TABLE IF NOT EXISTS app.retention_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Which policy was reviewed
    policy_id uuid NOT NULL REFERENCES app.retention_policies(id) ON DELETE CASCADE,

    -- When the review was performed
    review_date timestamptz NOT NULL DEFAULT now(),

    -- Who performed or triggered the review (NULL for automated reviews)
    reviewer_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Results
    records_reviewed integer NOT NULL DEFAULT 0,
    records_purged integer NOT NULL DEFAULT 0,

    -- Reason records were retained despite being past retention period
    records_retained_reason text,

    -- Review status
    status app.retention_review_status NOT NULL DEFAULT 'pending',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Retention Reviews Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_retention_reviews_tenant
    ON app.retention_reviews(tenant_id);

CREATE INDEX IF NOT EXISTS idx_retention_reviews_tenant_policy
    ON app.retention_reviews(tenant_id, policy_id);

CREATE INDEX IF NOT EXISTS idx_retention_reviews_tenant_status
    ON app.retention_reviews(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_retention_reviews_review_date
    ON app.retention_reviews(tenant_id, review_date DESC);

-- =============================================================================
-- Retention Reviews RLS
-- =============================================================================

ALTER TABLE app.retention_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.retention_reviews
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.retention_reviews
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Retention Reviews Triggers
-- =============================================================================

CREATE TRIGGER update_retention_reviews_updated_at
    BEFORE UPDATE ON app.retention_reviews
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Retention Exceptions Table
-- =============================================================================
-- Records that should NOT be purged even if past retention period
-- (legal holds, active litigation, regulatory investigations)
CREATE TABLE IF NOT EXISTS app.retention_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Which policy this exception applies to
    policy_id uuid NOT NULL REFERENCES app.retention_policies(id) ON DELETE CASCADE,

    -- Which record type and specific record is being held
    record_type varchar(100) NOT NULL,
    record_id uuid NOT NULL,

    -- Why this record is being held
    reason app.retention_exception_reason NOT NULL,

    -- When this exception expires (NULL = indefinite, must be manually removed)
    exception_until timestamptz,

    -- Who created the exception
    created_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- One exception per record per policy
    CONSTRAINT retention_exceptions_unique_record
        UNIQUE (tenant_id, policy_id, record_type, record_id)
);

-- =============================================================================
-- Retention Exceptions Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_retention_exceptions_tenant
    ON app.retention_exceptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_retention_exceptions_tenant_policy
    ON app.retention_exceptions(tenant_id, policy_id);

CREATE INDEX IF NOT EXISTS idx_retention_exceptions_record
    ON app.retention_exceptions(tenant_id, record_type, record_id);

CREATE INDEX IF NOT EXISTS idx_retention_exceptions_expiry
    ON app.retention_exceptions(tenant_id, exception_until)
    WHERE exception_until IS NOT NULL;

-- =============================================================================
-- Retention Exceptions RLS
-- =============================================================================

ALTER TABLE app.retention_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.retention_exceptions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.retention_exceptions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Retention Exceptions Triggers
-- =============================================================================

CREATE TRIGGER update_retention_exceptions_updated_at
    BEFORE UPDATE ON app.retention_exceptions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.retention_policies TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.retention_reviews TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.retention_exceptions TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.retention_policies IS
    'UK GDPR Article 5(1)(e) storage limitation — configurable retention policies per data category';
COMMENT ON TABLE app.retention_reviews IS
    'Audit trail of retention review/purge executions against each policy';
COMMENT ON TABLE app.retention_exceptions IS
    'Legal holds and exceptions that prevent purging of specific records past retention';

COMMENT ON COLUMN app.retention_policies.retention_period_months IS
    'Number of months to retain data after the triggering event (e.g., employment end date, tax year end)';
COMMENT ON COLUMN app.retention_policies.legal_basis IS
    'UK legal basis for the retention period (Employment Rights Act, Finance Act, Pensions Act, Limitation Act, etc.)';
COMMENT ON COLUMN app.retention_policies.auto_purge_enabled IS
    'If true, the background worker will automatically purge expired records. If false, only identifies them for manual review.';
COMMENT ON COLUMN app.retention_exceptions.exception_until IS
    'When the hold expires. NULL means indefinite — must be manually removed by an authorized user.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_retention_exceptions_updated_at ON app.retention_exceptions;
-- DROP TRIGGER IF EXISTS update_retention_reviews_updated_at ON app.retention_reviews;
-- DROP TRIGGER IF EXISTS update_retention_policies_updated_at ON app.retention_policies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.retention_exceptions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.retention_exceptions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.retention_reviews;
-- DROP POLICY IF EXISTS tenant_isolation ON app.retention_reviews;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.retention_policies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.retention_policies;
-- DROP INDEX IF EXISTS app.idx_retention_exceptions_expiry;
-- DROP INDEX IF EXISTS app.idx_retention_exceptions_record;
-- DROP INDEX IF EXISTS app.idx_retention_exceptions_tenant_policy;
-- DROP INDEX IF EXISTS app.idx_retention_exceptions_tenant;
-- DROP INDEX IF EXISTS app.idx_retention_reviews_review_date;
-- DROP INDEX IF EXISTS app.idx_retention_reviews_tenant_status;
-- DROP INDEX IF EXISTS app.idx_retention_reviews_tenant_policy;
-- DROP INDEX IF EXISTS app.idx_retention_reviews_tenant;
-- DROP INDEX IF EXISTS app.idx_retention_policies_auto_purge;
-- DROP INDEX IF EXISTS app.idx_retention_policies_tenant_category;
-- DROP INDEX IF EXISTS app.idx_retention_policies_tenant_status;
-- DROP INDEX IF EXISTS app.idx_retention_policies_tenant;
-- DROP TABLE IF EXISTS app.retention_exceptions;
-- DROP TABLE IF EXISTS app.retention_reviews;
-- DROP TABLE IF EXISTS app.retention_policies;
-- DROP TYPE IF EXISTS app.retention_exception_reason;
-- DROP TYPE IF EXISTS app.retention_review_status;
-- DROP TYPE IF EXISTS app.retention_policy_status;
-- DROP TYPE IF EXISTS app.retention_legal_basis;
-- DROP TYPE IF EXISTS app.retention_data_category;
