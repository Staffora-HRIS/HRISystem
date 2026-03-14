-- Migration: 0100_documents_enhanced
-- Created: 2026-01-16
-- Description: Enhanced document management with categories, expiry alerts, and versioning

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Document category enum (extend existing document_type)
DO $$ BEGIN
    -- Add new document types to existing enum if not present
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'id_document';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'visa';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'work_permit';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'qualification';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'training_record';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'performance_review';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'disciplinary';
    ALTER TYPE app.document_type ADD VALUE IF NOT EXISTS 'benefit_enrollment';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to documents table
ALTER TABLE app.documents
    ADD COLUMN IF NOT EXISTS category varchar(50) DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS expiry_notification_sent boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS expiry_notification_days integer DEFAULT 30,
    ADD COLUMN IF NOT EXISTS storage_provider varchar(50) DEFAULT 's3',
    ADD COLUMN IF NOT EXISTS checksum varchar(64),
    ADD COLUMN IF NOT EXISTS original_filename varchar(500),
    ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES app.users(id);

-- Document versions table for version history
CREATE TABLE IF NOT EXISTS app.document_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    checksum varchar(64),
    changes_description text,
    created_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_document_version UNIQUE (document_id, version_number)
);

-- Document access log for audit
CREATE TABLE IF NOT EXISTS app.document_access_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.users(id),
    action varchar(50) NOT NULL, -- 'view', 'download', 'print', 'share'
    ip_address inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Document shares for sharing documents
CREATE TABLE IF NOT EXISTS app.document_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
    shared_by uuid NOT NULL REFERENCES app.users(id),
    shared_with_user_id uuid REFERENCES app.users(id),
    shared_with_email varchar(255),
    access_token varchar(100) UNIQUE,
    expires_at timestamptz,
    max_downloads integer,
    download_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT share_target_required CHECK (
        shared_with_user_id IS NOT NULL OR shared_with_email IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_category
    ON app.documents(tenant_id, category, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_expiry_alert
    ON app.documents(valid_until, expiry_notification_sent)
    WHERE valid_until IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_tags
    ON app.documents USING GIN (tags)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_versions_document
    ON app.document_versions(document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_document_access_log_document
    ON app.document_access_log(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_shares_token
    ON app.document_shares(access_token)
    WHERE is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.document_versions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.document_access_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.document_shares
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Get documents expiring soon
CREATE OR REPLACE FUNCTION app.get_expiring_documents(
    p_tenant_id uuid,
    p_days_ahead integer DEFAULT 30
)
RETURNS TABLE (
    id uuid,
    title varchar,
    document_type app.document_type,
    employee_id uuid,
    employee_name text,
    valid_until timestamptz,
    days_until_expiry integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.title,
        d.document_type,
        d.employee_id,
        COALESCE(app.get_employee_display_name(d.employee_id), 'N/A') as employee_name,
        d.valid_until,
        EXTRACT(DAY FROM d.valid_until - CURRENT_TIMESTAMP)::integer as days_until_expiry
    FROM app.documents d
    WHERE d.tenant_id = p_tenant_id
      AND d.valid_until IS NOT NULL
      AND d.valid_until > CURRENT_TIMESTAMP
      AND d.valid_until <= CURRENT_TIMESTAMP + (p_days_ahead || ' days')::interval
      AND d.deleted_at IS NULL
    ORDER BY d.valid_until;
END;
$$;

-- Create new document version
CREATE OR REPLACE FUNCTION app.create_document_version(
    p_document_id uuid,
    p_file_path text,
    p_file_size bigint,
    p_checksum varchar,
    p_changes_description text,
    p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_current_version integer;
    v_version_id uuid;
BEGIN
    -- Get tenant and current version
    SELECT tenant_id, version INTO v_tenant_id, v_current_version
    FROM app.documents
    WHERE id = p_document_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Document not found: %', p_document_id;
    END IF;

    -- Insert version record
    INSERT INTO app.document_versions (
        tenant_id, document_id, version_number, file_path,
        file_size, checksum, changes_description, created_by
    )
    VALUES (
        v_tenant_id, p_document_id, v_current_version,
        p_file_path, p_file_size, p_checksum,
        p_changes_description, p_created_by
    )
    RETURNING id INTO v_version_id;

    -- Update document with new version
    UPDATE app.documents
    SET
        file_path = p_file_path,
        file_size = p_file_size,
        checksum = p_checksum,
        version = v_current_version + 1,
        updated_at = now()
    WHERE id = p_document_id;

    RETURN v_version_id;
END;
$$;

-- Log document access
CREATE OR REPLACE FUNCTION app.log_document_access(
    p_document_id uuid,
    p_user_id uuid,
    p_action varchar,
    p_ip_address inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO v_tenant_id
    FROM app.documents
    WHERE id = p_document_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Document not found: %', p_document_id;
    END IF;

    INSERT INTO app.document_access_log (
        tenant_id, document_id, user_id, action, ip_address, user_agent
    )
    VALUES (
        v_tenant_id, p_document_id, p_user_id, p_action, p_ip_address, p_user_agent
    );
END;
$$;

-- Get document statistics by category
CREATE OR REPLACE FUNCTION app.get_document_stats_by_category(p_tenant_id uuid)
RETURNS TABLE (
    category varchar,
    total_count bigint,
    total_size_bytes bigint,
    expiring_soon bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.category,
        COUNT(*) as total_count,
        COALESCE(SUM(d.file_size), 0) as total_size_bytes,
        COUNT(*) FILTER (
            WHERE d.valid_until IS NOT NULL
            AND d.valid_until > CURRENT_TIMESTAMP
            AND d.valid_until <= CURRENT_TIMESTAMP + interval '30 days'
        ) as expiring_soon
    FROM app.documents d
    WHERE d.tenant_id = p_tenant_id
      AND d.deleted_at IS NULL
    GROUP BY d.category;
END;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_document_versions_updated_at
    BEFORE UPDATE ON app.document_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.document_versions IS 'Version history for documents';
COMMENT ON TABLE app.document_access_log IS 'Audit log for document access';
COMMENT ON TABLE app.document_shares IS 'Document sharing configuration';

COMMENT ON FUNCTION app.get_expiring_documents IS 'Get documents expiring within specified days';
COMMENT ON FUNCTION app.create_document_version IS 'Create new version of a document';
COMMENT ON FUNCTION app.log_document_access IS 'Log document access for auditing';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_document_stats_by_category(uuid);
-- DROP FUNCTION IF EXISTS app.log_document_access(uuid, uuid, varchar, inet, text);
-- DROP FUNCTION IF EXISTS app.create_document_version(uuid, text, bigint, varchar, text, uuid);
-- DROP FUNCTION IF EXISTS app.get_expiring_documents(uuid, integer);
-- DROP TRIGGER IF EXISTS trg_document_versions_updated_at ON app.document_versions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.document_shares;
-- DROP POLICY IF EXISTS tenant_isolation ON app.document_access_log;
-- DROP POLICY IF EXISTS tenant_isolation ON app.document_versions;
-- DROP TABLE IF EXISTS app.document_shares;
-- DROP TABLE IF EXISTS app.document_access_log;
-- DROP TABLE IF EXISTS app.document_versions;
-- ALTER TABLE app.documents DROP COLUMN IF EXISTS category;
-- ALTER TABLE app.documents DROP COLUMN IF EXISTS tags;
-- (etc for other added columns)
