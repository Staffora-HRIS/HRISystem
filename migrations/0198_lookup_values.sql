-- Migration: 0198_lookup_values
-- Created: 2026-03-17
-- Description: Tenant-configurable lookup values for dropdown/enum fields.
--              Replaces hard-coded PostgreSQL enums with flexible, per-tenant
--              lookup categories and values that administrators can customise.
--
-- Categories represent a domain dimension (e.g. "employment_type").
-- Values are the options within that category (e.g. "full_time", "part_time").
-- System-seeded categories are marked is_system = true and cannot be deleted.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lookup Categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.lookup_categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    code            text NOT NULL,           -- machine-readable key e.g. "employment_type"
    name            text NOT NULL,           -- human-readable label e.g. "Employment Type"
    description     text,
    is_system       boolean NOT NULL DEFAULT false,  -- true = seeded, cannot be deleted
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_lookup_categories_tenant_code UNIQUE (tenant_id, code)
);

-- RLS
ALTER TABLE app.lookup_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.lookup_categories
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.lookup_categories
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lookup_categories_tenant
    ON app.lookup_categories (tenant_id);

CREATE INDEX IF NOT EXISTS idx_lookup_categories_tenant_active
    ON app.lookup_categories (tenant_id, is_active)
    WHERE is_active = true;

COMMENT ON TABLE app.lookup_categories IS 'Tenant-configurable lookup categories for dropdown/enum fields';

-- -----------------------------------------------------------------------------
-- Lookup Values
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.lookup_values (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    category_id     uuid NOT NULL REFERENCES app.lookup_categories(id) ON DELETE CASCADE,
    code            text NOT NULL,           -- machine-readable key e.g. "full_time"
    label           text NOT NULL,           -- display label e.g. "Full Time"
    description     text,
    sort_order      integer NOT NULL DEFAULT 0,
    is_default      boolean NOT NULL DEFAULT false,  -- default selection in UI
    is_active       boolean NOT NULL DEFAULT true,
    metadata        jsonb,                   -- optional extension data
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_lookup_values_category_code UNIQUE (category_id, code)
);

-- RLS
ALTER TABLE app.lookup_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.lookup_values
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.lookup_values
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lookup_values_category
    ON app.lookup_values (category_id);

CREATE INDEX IF NOT EXISTS idx_lookup_values_tenant
    ON app.lookup_values (tenant_id);

CREATE INDEX IF NOT EXISTS idx_lookup_values_category_active
    ON app.lookup_values (category_id, is_active, sort_order)
    WHERE is_active = true;

COMMENT ON TABLE app.lookup_values IS 'Tenant-configurable lookup values within a category';

-- -----------------------------------------------------------------------------
-- Updated-at triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trigger_lookup_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lookup_categories_updated_at
    BEFORE UPDATE ON app.lookup_categories
    FOR EACH ROW
    EXECUTE FUNCTION app.trigger_lookup_categories_updated_at();

CREATE OR REPLACE FUNCTION app.trigger_lookup_values_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lookup_values_updated_at
    BEFORE UPDATE ON app.lookup_values
    FOR EACH ROW
    EXECUTE FUNCTION app.trigger_lookup_values_updated_at();

-- -----------------------------------------------------------------------------
-- Grant permissions to application role
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.lookup_categories TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.lookup_values TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_lookup_values_updated_at ON app.lookup_values;
-- DROP FUNCTION IF EXISTS app.trigger_lookup_values_updated_at();
-- DROP TRIGGER IF EXISTS trg_lookup_categories_updated_at ON app.lookup_categories;
-- DROP FUNCTION IF EXISTS app.trigger_lookup_categories_updated_at();
-- DROP TABLE IF EXISTS app.lookup_values;
-- DROP TABLE IF EXISTS app.lookup_categories;
