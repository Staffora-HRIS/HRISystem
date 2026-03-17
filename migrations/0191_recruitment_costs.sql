-- Migration: 0191_recruitment_costs
-- Created: 2026-03-17
-- Description: Create the recruitment_costs table for tracking recruitment expenses
--              Enables cost-per-hire analytics by recording costs per requisition
--              (agency fees, job board postings, advertising, relocation, etc.)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Recruitment Costs Table
-- -----------------------------------------------------------------------------
-- Tracks individual cost items associated with a requisition.
-- Aggregated for cost-per-hire calculations in recruitment analytics.
CREATE TABLE IF NOT EXISTS app.recruitment_costs (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this cost record
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Requisition this cost is associated with
    requisition_id uuid NOT NULL REFERENCES app.requisitions(id) ON DELETE CASCADE,

    -- Cost category
    category varchar(50) NOT NULL,

    -- Human-readable description of the cost
    description text,

    -- Cost amount and currency
    amount numeric(12, 2) NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'GBP',

    -- Date the cost was incurred
    incurred_date date NOT NULL DEFAULT CURRENT_DATE,

    -- External reference (invoice number, PO number, etc.)
    external_reference varchar(255),

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Amount must be positive
    CONSTRAINT recruitment_costs_amount_positive CHECK (amount > 0),

    -- Category must be one of known values
    CONSTRAINT recruitment_costs_category_valid CHECK (
        category IN (
            'agency_fee',
            'job_board',
            'advertising',
            'relocation',
            'assessment',
            'background_check',
            'travel',
            'signing_bonus',
            'referral_bonus',
            'other'
        )
    ),

    -- Currency must be 3-letter ISO code
    CONSTRAINT recruitment_costs_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + requisition (aggregate costs per requisition)
CREATE INDEX IF NOT EXISTS idx_recruitment_costs_tenant_requisition
    ON app.recruitment_costs(tenant_id, requisition_id);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_recruitment_costs_tenant_category
    ON app.recruitment_costs(tenant_id, category);

-- Date range queries for period-based analytics
CREATE INDEX IF NOT EXISTS idx_recruitment_costs_tenant_date
    ON app.recruitment_costs(tenant_id, incurred_date DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.recruitment_costs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see costs for their current tenant
CREATE POLICY tenant_isolation ON app.recruitment_costs
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.recruitment_costs
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_recruitment_costs_updated_at
    BEFORE UPDATE ON app.recruitment_costs
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.recruitment_costs TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.recruitment_costs IS 'Tracks recruitment expenses per requisition for cost-per-hire analytics';
COMMENT ON COLUMN app.recruitment_costs.id IS 'Primary UUID identifier for the cost record';
COMMENT ON COLUMN app.recruitment_costs.tenant_id IS 'Tenant that owns this cost record';
COMMENT ON COLUMN app.recruitment_costs.requisition_id IS 'Requisition this cost is associated with';
COMMENT ON COLUMN app.recruitment_costs.category IS 'Cost category (agency_fee, job_board, advertising, etc.)';
COMMENT ON COLUMN app.recruitment_costs.description IS 'Human-readable description of the cost';
COMMENT ON COLUMN app.recruitment_costs.amount IS 'Cost amount in the specified currency';
COMMENT ON COLUMN app.recruitment_costs.currency IS 'ISO 4217 currency code (default GBP)';
COMMENT ON COLUMN app.recruitment_costs.incurred_date IS 'Date the cost was incurred';
COMMENT ON COLUMN app.recruitment_costs.external_reference IS 'External reference (invoice number, PO, etc.)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_recruitment_costs_updated_at ON app.recruitment_costs;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.recruitment_costs;
-- DROP POLICY IF EXISTS tenant_isolation ON app.recruitment_costs;
-- DROP INDEX IF EXISTS app.idx_recruitment_costs_tenant_date;
-- DROP INDEX IF EXISTS app.idx_recruitment_costs_tenant_category;
-- DROP INDEX IF EXISTS app.idx_recruitment_costs_tenant_requisition;
-- DROP TABLE IF EXISTS app.recruitment_costs;
