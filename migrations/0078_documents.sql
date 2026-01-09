-- Migration: 0078_documents
-- Created: 2026-01-07
-- Description: Create tables for document management used by PDF worker
--              Tracks generated documents, certificates, and letters

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Document type enum
DO $$ BEGIN
    CREATE TYPE app.document_type AS ENUM (
        'certificate',
        'employment_letter',
        'case_bundle',
        'offer_letter',
        'termination_letter',
        'salary_slip',
        'tax_form',
        'contract',
        'policy',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Documents table - Generated documents storage
CREATE TABLE IF NOT EXISTS app.documents (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User/employee associated with this document
    user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Document details
    document_type app.document_type NOT NULL,
    title varchar(500) NOT NULL,
    description text,

    -- File storage
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    mime_type varchar(100) NOT NULL DEFAULT 'application/pdf',
    page_count integer,

    -- Document metadata (type-specific data)
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Access control
    is_confidential boolean NOT NULL DEFAULT false,
    access_level varchar(50) NOT NULL DEFAULT 'employee', -- employee, manager, hr, admin

    -- Validity period (for certificates, etc.)
    valid_from timestamptz,
    valid_until timestamptz,

    -- Version tracking
    version integer NOT NULL DEFAULT 1,
    parent_document_id uuid REFERENCES app.documents(id),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz -- soft delete

    -- Constraints
    CONSTRAINT check_user_or_employee CHECK (
        user_id IS NOT NULL OR employee_id IS NOT NULL OR document_type IN ('policy', 'other')
    )
);

-- =============================================================================
-- Document Templates
-- =============================================================================

-- Document templates for generating standardized documents
CREATE TABLE IF NOT EXISTS app.document_templates (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Template details
    name varchar(255) NOT NULL,
    document_type app.document_type NOT NULL,
    description text,

    -- Template content
    template_content text NOT NULL, -- HTML template
    css_styles text, -- Associated CSS

    -- Template variables schema (JSON Schema)
    variable_schema jsonb NOT NULL DEFAULT '{}',

    -- Status
    is_active boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint for default template per type
    CONSTRAINT unique_default_template UNIQUE (tenant_id, document_type)
        DEFERRABLE INITIALLY DEFERRED
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_tenant_type
    ON app.documents(tenant_id, document_type, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_user
    ON app.documents(user_id, created_at DESC)
    WHERE deleted_at IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_employee
    ON app.documents(employee_id, created_at DESC)
    WHERE deleted_at IS NULL AND employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_validity
    ON app.documents(valid_until)
    WHERE valid_until IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_parent
    ON app.documents(parent_document_id)
    WHERE parent_document_id IS NOT NULL;

-- Document templates indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_tenant_type
    ON app.document_templates(tenant_id, document_type, is_active);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.documents ENABLE ROW LEVEL SECURITY;

-- Base tenant isolation
CREATE POLICY tenant_isolation ON app.documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

ALTER TABLE app.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.document_templates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Get documents for a user/employee
CREATE OR REPLACE FUNCTION app.get_user_documents(
    p_tenant_id uuid,
    p_user_id uuid,
    p_document_type app.document_type DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    document_type app.document_type,
    title varchar,
    file_path text,
    file_size bigint,
    metadata jsonb,
    valid_from timestamptz,
    valid_until timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.document_type,
        d.title,
        d.file_path,
        d.file_size,
        d.metadata,
        d.valid_from,
        d.valid_until,
        d.created_at
    FROM app.documents d
    WHERE d.tenant_id = p_tenant_id
      AND d.user_id = p_user_id
      AND d.deleted_at IS NULL
      AND (p_document_type IS NULL OR d.document_type = p_document_type)
    ORDER BY d.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Get active document template
CREATE OR REPLACE FUNCTION app.get_document_template(
    p_tenant_id uuid,
    p_document_type app.document_type,
    p_template_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar,
    template_content text,
    css_styles text,
    variable_schema jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dt.id,
        dt.name,
        dt.template_content,
        dt.css_styles,
        dt.variable_schema
    FROM app.document_templates dt
    WHERE dt.tenant_id = p_tenant_id
      AND dt.document_type = p_document_type
      AND dt.is_active = true
      AND (p_template_id IS NULL OR dt.id = p_template_id)
    ORDER BY dt.is_default DESC, dt.created_at DESC
    LIMIT 1;
END;
$$;

-- Soft delete a document
CREATE OR REPLACE FUNCTION app.delete_document(p_document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.documents
    SET deleted_at = now(),
        updated_at = now()
    WHERE id = p_document_id
      AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;

-- Get document statistics
CREATE OR REPLACE FUNCTION app.get_document_stats(p_tenant_id uuid)
RETURNS TABLE (
    document_type app.document_type,
    total_count bigint,
    total_size_bytes bigint,
    created_this_month bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.document_type,
        COUNT(*) as total_count,
        COALESCE(SUM(d.file_size), 0) as total_size_bytes,
        COUNT(*) FILTER (WHERE d.created_at >= date_trunc('month', CURRENT_DATE)) as created_this_month
    FROM app.documents d
    WHERE d.tenant_id = p_tenant_id
      AND d.deleted_at IS NULL
    GROUP BY d.document_type;
END;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Update updated_at timestamp for documents
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON app.documents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Update updated_at timestamp for templates
CREATE TRIGGER trg_document_templates_updated_at
    BEFORE UPDATE ON app.document_templates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.documents IS 'Stores generated PDF documents and their metadata';
COMMENT ON TABLE app.document_templates IS 'HTML templates for generating standardized documents';

COMMENT ON COLUMN app.documents.document_type IS 'Type of document for categorization';
COMMENT ON COLUMN app.documents.metadata IS 'Type-specific metadata (course info for certificates, etc.)';
COMMENT ON COLUMN app.documents.access_level IS 'Who can access: employee, manager, hr, or admin';
COMMENT ON COLUMN app.documents.valid_until IS 'When the document expires (for certificates, etc.)';

COMMENT ON COLUMN app.document_templates.variable_schema IS 'JSON Schema for template variables validation';
COMMENT ON COLUMN app.document_templates.is_default IS 'Whether this is the default template for its type';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_document_templates_updated_at ON app.document_templates;
-- DROP TRIGGER IF EXISTS trg_documents_updated_at ON app.documents;
-- DROP FUNCTION IF EXISTS app.get_document_stats(uuid);
-- DROP FUNCTION IF EXISTS app.delete_document(uuid);
-- DROP FUNCTION IF EXISTS app.get_document_template(uuid, app.document_type, uuid);
-- DROP FUNCTION IF EXISTS app.get_user_documents(uuid, uuid, app.document_type, integer);
-- DROP POLICY IF EXISTS tenant_isolation ON app.document_templates;
-- DROP POLICY IF EXISTS tenant_isolation ON app.documents;
-- DROP TABLE IF EXISTS app.document_templates;
-- DROP TABLE IF EXISTS app.documents;
-- DROP TYPE IF EXISTS app.document_type;
