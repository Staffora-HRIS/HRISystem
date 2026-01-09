-- Migration: 0002_tenants
-- Created: 2026-01-07
-- Description: Create the tenants table - the root table for multi-tenancy
--              Tenants represent organizations using the HRIS platform.
--              This is NOT tenant-scoped (no RLS) as it's the root of the hierarchy.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Tenants table - Organizations using the HRIS platform
-- This table is NOT tenant-scoped as it defines the tenants themselves
CREATE TABLE IF NOT EXISTS app.tenants (
    -- Primary identifier for the tenant
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Display name of the organization
    name varchar(255) NOT NULL,

    -- URL-safe unique identifier used in URLs and API calls
    -- Must be lowercase, alphanumeric with hyphens, no spaces
    slug varchar(100) UNIQUE NOT NULL,

    -- Flexible settings storage for tenant-specific configuration
    -- Examples: branding, feature flags, regional settings, integrations
    settings jsonb NOT NULL DEFAULT '{}',

    -- Tenant lifecycle status
    -- active: Normal operation
    -- suspended: Temporarily disabled (e.g., payment issues)
    -- deleted: Soft-deleted, data retained for legal/audit purposes
    status varchar(20) NOT NULL DEFAULT 'active',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'deleted')),
    CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR slug ~ '^[a-z0-9]$')
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for status filtering (finding active tenants)
CREATE INDEX IF NOT EXISTS idx_tenants_status ON app.tenants(status);

-- Index for settings JSONB queries
CREATE INDEX IF NOT EXISTS idx_tenants_settings ON app.tenants USING gin(settings);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON app.tenants
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.tenants IS 'Root table for multi-tenancy. Each tenant represents an organization using the HRIS platform.';
COMMENT ON COLUMN app.tenants.id IS 'Primary UUID identifier for the tenant';
COMMENT ON COLUMN app.tenants.name IS 'Display name of the organization';
COMMENT ON COLUMN app.tenants.slug IS 'URL-safe unique identifier, lowercase alphanumeric with hyphens';
COMMENT ON COLUMN app.tenants.settings IS 'JSONB storage for tenant-specific configuration (branding, features, etc.)';
COMMENT ON COLUMN app.tenants.status IS 'Tenant lifecycle status: active, suspended, or deleted';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_tenants_updated_at ON app.tenants;
-- DROP INDEX IF EXISTS app.idx_tenants_settings;
-- DROP INDEX IF EXISTS app.idx_tenants_status;
-- DROP TABLE IF EXISTS app.tenants;
