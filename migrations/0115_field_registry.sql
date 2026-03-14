-- Migration: 0115_field_registry
-- Created: 2026-01-17
-- Description: Create field registry table for Field-Level Security (FLS)
--              Stores metadata about every field in the system for granular permissions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Field Registry Table
-- -----------------------------------------------------------------------------
-- Stores metadata about all fields in the system
-- Used for granular field-level permission control
CREATE TABLE IF NOT EXISTS app.field_registry (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this field definition (NULL for system-wide fields)
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Field identification
    entity_name varchar(100) NOT NULL,        -- e.g., 'employee', 'position', 'salary'
    field_name varchar(100) NOT NULL,         -- e.g., 'date_of_birth', 'salary_amount'
    field_label varchar(255) NOT NULL,        -- Human-readable label
    field_group varchar(100),                 -- Grouping for UI (e.g., 'Personal', 'Employment')

    -- Field metadata
    data_type varchar(50) NOT NULL,           -- 'string', 'number', 'date', 'boolean', 'enum', etc.
    is_sensitive boolean NOT NULL DEFAULT false,  -- PII/sensitive data flag
    is_system_field boolean NOT NULL DEFAULT false, -- System fields like id, created_at
    default_permission varchar(20) NOT NULL DEFAULT 'view'
        CHECK (default_permission IN ('edit', 'view', 'hidden')),

    -- Display order within group
    display_order integer NOT NULL DEFAULT 0,

    -- Additional metadata as JSON (validation rules, enum values, etc.)
    metadata jsonb DEFAULT '{}',

    -- Audit timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint per entity/field within tenant
    CONSTRAINT field_registry_unique UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, field_name)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Lookup by entity (most common query)
CREATE INDEX IF NOT EXISTS idx_field_registry_entity
    ON app.field_registry(tenant_id, entity_name);

-- Lookup by group
CREATE INDEX IF NOT EXISTS idx_field_registry_group
    ON app.field_registry(tenant_id, entity_name, field_group);

-- Sensitive fields (for audit/compliance)
CREATE INDEX IF NOT EXISTS idx_field_registry_sensitive
    ON app.field_registry(tenant_id, is_sensitive)
    WHERE is_sensitive = true;

-- System fields
CREATE INDEX IF NOT EXISTS idx_field_registry_system
    ON app.field_registry(is_system_field)
    WHERE is_system_field = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.field_registry ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see field registry for their tenant or system-wide fields
CREATE POLICY field_registry_tenant_isolation ON app.field_registry
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR tenant_id IS NULL
        OR app.is_system_context()
    );

-- Policy for INSERT
CREATE POLICY field_registry_insert ON app.field_registry
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR tenant_id IS NULL
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_field_registry_updated_at
    BEFORE UPDATE ON app.field_registry
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.field_registry IS 'Registry of all fields in the system for field-level security control';
COMMENT ON COLUMN app.field_registry.entity_name IS 'The entity this field belongs to (e.g., employee, position)';
COMMENT ON COLUMN app.field_registry.field_name IS 'The technical field name';
COMMENT ON COLUMN app.field_registry.field_label IS 'Human-readable label for display';
COMMENT ON COLUMN app.field_registry.field_group IS 'Logical grouping for UI organization';
COMMENT ON COLUMN app.field_registry.data_type IS 'Field data type (string, number, date, etc.)';
COMMENT ON COLUMN app.field_registry.is_sensitive IS 'Whether this field contains PII or sensitive data';
COMMENT ON COLUMN app.field_registry.is_system_field IS 'Whether this is a system-managed field';
COMMENT ON COLUMN app.field_registry.default_permission IS 'Default permission level for new roles';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_field_registry_updated_at ON app.field_registry;
-- DROP POLICY IF EXISTS field_registry_insert ON app.field_registry;
-- DROP POLICY IF EXISTS field_registry_tenant_isolation ON app.field_registry;
-- DROP INDEX IF EXISTS app.idx_field_registry_system;
-- DROP INDEX IF EXISTS app.idx_field_registry_sensitive;
-- DROP INDEX IF EXISTS app.idx_field_registry_group;
-- DROP INDEX IF EXISTS app.idx_field_registry_entity;
-- DROP TABLE IF EXISTS app.field_registry;
