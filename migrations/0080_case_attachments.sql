-- Migration: 0080_case_attachments
-- Created: 2026-01-07
-- Description: Create the case_attachments table - file attachments for cases
--              This table stores metadata about files attached to cases
--              Actual files are stored in external object storage

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Case Attachments Table
-- -----------------------------------------------------------------------------
-- File attachments for cases
-- Stores metadata and references to files in external storage
CREATE TABLE IF NOT EXISTS app.case_attachments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this attachment exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Case this attachment belongs to
    case_id uuid NOT NULL REFERENCES app.cases(id) ON DELETE CASCADE,

    -- Comment this attachment is associated with (optional)
    comment_id uuid REFERENCES app.case_comments(id) ON DELETE SET NULL,

    -- Uploader
    uploaded_by uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- File metadata
    file_name varchar(255) NOT NULL,
    file_size_bytes bigint NOT NULL,
    mime_type varchar(100) NOT NULL,
    attachment_type app.attachment_type NOT NULL DEFAULT 'document',

    -- Storage location
    storage_provider varchar(50) NOT NULL DEFAULT 'local',
    storage_key varchar(500) NOT NULL,
    storage_bucket varchar(100),

    -- File hash for integrity verification
    file_hash varchar(64),
    hash_algorithm varchar(20) DEFAULT 'sha256',

    -- Preview/thumbnail
    thumbnail_url text,
    has_preview boolean NOT NULL DEFAULT false,

    -- Virus scan status
    scan_status varchar(20) NOT NULL DEFAULT 'pending',
    scanned_at timestamptz,
    scan_result text,

    -- Access control
    is_internal boolean NOT NULL DEFAULT false,

    -- Soft delete (files should be retained for audit)
    deleted_at timestamptz,
    deleted_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- File size must be positive
    CONSTRAINT case_attachments_size_positive CHECK (
        file_size_bytes > 0
    ),

    -- Storage key must not be empty
    CONSTRAINT case_attachments_storage_key_not_empty CHECK (
        length(trim(storage_key)) > 0
    ),

    -- Scan status must be valid
    CONSTRAINT case_attachments_scan_status_valid CHECK (
        scan_status IN ('pending', 'scanning', 'clean', 'infected', 'error', 'skipped')
    ),

    -- Deleted must have deleter
    CONSTRAINT case_attachments_deleted_has_deleter CHECK (
        deleted_at IS NULL OR deleted_by IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Case attachments
CREATE INDEX IF NOT EXISTS idx_case_attachments_case
    ON app.case_attachments(case_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Comment attachments
CREATE INDEX IF NOT EXISTS idx_case_attachments_comment
    ON app.case_attachments(comment_id)
    WHERE comment_id IS NOT NULL AND deleted_at IS NULL;

-- Uploader's attachments
CREATE INDEX IF NOT EXISTS idx_case_attachments_uploader
    ON app.case_attachments(uploaded_by, created_at DESC);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_case_attachments_tenant
    ON app.case_attachments(tenant_id);

-- Storage key lookup
CREATE INDEX IF NOT EXISTS idx_case_attachments_storage_key
    ON app.case_attachments(storage_provider, storage_key);

-- Pending virus scans
CREATE INDEX IF NOT EXISTS idx_case_attachments_scan_pending
    ON app.case_attachments(scan_status, created_at)
    WHERE scan_status IN ('pending', 'scanning');

-- File type filtering
CREATE INDEX IF NOT EXISTS idx_case_attachments_type
    ON app.case_attachments(case_id, attachment_type);

-- File hash lookup (for deduplication)
CREATE INDEX IF NOT EXISTS idx_case_attachments_hash
    ON app.case_attachments(tenant_id, file_hash)
    WHERE file_hash IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.case_attachments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see attachments for their current tenant
CREATE POLICY tenant_isolation ON app.case_attachments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.case_attachments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Function to update case's updated_at when attachment is added
CREATE OR REPLACE FUNCTION app.update_case_on_attachment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.cases
    SET updated_at = now()
    WHERE id = NEW.case_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER update_case_on_attachment
    AFTER INSERT ON app.case_attachments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_case_on_attachment();

-- Function to validate file types
CREATE OR REPLACE FUNCTION app.validate_attachment_file_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_allowed_types text[] := ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'message/rfc822'  -- Email
    ];
BEGIN
    -- Check if mime type is allowed
    IF NOT NEW.mime_type = ANY(v_allowed_types) THEN
        RAISE EXCEPTION 'File type % is not allowed', NEW.mime_type;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_attachment_file_type
    BEFORE INSERT ON app.case_attachments
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_attachment_file_type();

-- Function to enforce file size limits
CREATE OR REPLACE FUNCTION app.validate_attachment_file_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_max_size_bytes bigint := 52428800;  -- 50MB default
BEGIN
    IF NEW.file_size_bytes > v_max_size_bytes THEN
        RAISE EXCEPTION 'File size % exceeds maximum allowed size of % bytes', NEW.file_size_bytes, v_max_size_bytes;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_attachment_file_size
    BEFORE INSERT ON app.case_attachments
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_attachment_file_size();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to add an attachment to a case
CREATE OR REPLACE FUNCTION app.add_case_attachment(
    p_tenant_id uuid,
    p_case_id uuid,
    p_uploaded_by uuid,
    p_file_name varchar(255),
    p_file_size_bytes bigint,
    p_mime_type varchar(100),
    p_storage_key varchar(500),
    p_storage_provider varchar(50) DEFAULT 'local',
    p_storage_bucket varchar(100) DEFAULT NULL,
    p_comment_id uuid DEFAULT NULL,
    p_is_internal boolean DEFAULT false,
    p_file_hash varchar(64) DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_attachment_type app.attachment_type;
BEGIN
    -- Determine attachment type from mime type
    v_attachment_type := CASE
        WHEN p_mime_type LIKE 'image/%' THEN 'image'
        WHEN p_mime_type = 'message/rfc822' THEN 'email'
        ELSE 'document'
    END;

    INSERT INTO app.case_attachments (
        tenant_id,
        case_id,
        comment_id,
        uploaded_by,
        file_name,
        file_size_bytes,
        mime_type,
        attachment_type,
        storage_provider,
        storage_key,
        storage_bucket,
        is_internal,
        file_hash
    )
    VALUES (
        p_tenant_id,
        p_case_id,
        p_comment_id,
        p_uploaded_by,
        p_file_name,
        p_file_size_bytes,
        p_mime_type,
        v_attachment_type,
        p_storage_provider,
        p_storage_key,
        p_storage_bucket,
        p_is_internal,
        p_file_hash
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to get case attachments
CREATE OR REPLACE FUNCTION app.get_case_attachments(
    p_case_id uuid,
    p_include_internal boolean DEFAULT false,
    p_include_deleted boolean DEFAULT false
)
RETURNS TABLE (
    id uuid,
    comment_id uuid,
    uploaded_by uuid,
    file_name varchar(255),
    file_size_bytes bigint,
    mime_type varchar(100),
    attachment_type app.attachment_type,
    storage_key varchar(500),
    thumbnail_url text,
    has_preview boolean,
    scan_status varchar(20),
    is_internal boolean,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.comment_id,
        ca.uploaded_by,
        ca.file_name,
        ca.file_size_bytes,
        ca.mime_type,
        ca.attachment_type,
        ca.storage_key,
        ca.thumbnail_url,
        ca.has_preview,
        ca.scan_status,
        ca.is_internal,
        ca.created_at
    FROM app.case_attachments ca
    WHERE ca.case_id = p_case_id
      AND (p_include_internal = true OR ca.is_internal = false)
      AND (p_include_deleted = true OR ca.deleted_at IS NULL)
    ORDER BY ca.created_at DESC;
END;
$$;

-- Function to soft delete an attachment
CREATE OR REPLACE FUNCTION app.delete_case_attachment(
    p_attachment_id uuid,
    p_deleted_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.case_attachments
    SET deleted_at = now(),
        deleted_by = p_deleted_by
    WHERE id = p_attachment_id
      AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;

-- Function to update virus scan status
CREATE OR REPLACE FUNCTION app.update_attachment_scan_status(
    p_attachment_id uuid,
    p_scan_status varchar(20),
    p_scan_result text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.case_attachments
    SET scan_status = p_scan_status,
        scanned_at = now(),
        scan_result = p_scan_result
    WHERE id = p_attachment_id;

    RETURN FOUND;
END;
$$;

-- Function to get pending scans for virus scanning job
CREATE OR REPLACE FUNCTION app.get_pending_attachment_scans(
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    storage_provider varchar(50),
    storage_key varchar(500),
    storage_bucket varchar(100),
    file_name varchar(255),
    mime_type varchar(100),
    file_size_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.tenant_id,
        ca.storage_provider,
        ca.storage_key,
        ca.storage_bucket,
        ca.file_name,
        ca.mime_type,
        ca.file_size_bytes
    FROM app.case_attachments ca
    WHERE ca.scan_status = 'pending'
      AND ca.deleted_at IS NULL
    ORDER BY ca.created_at ASC
    LIMIT p_limit;
END;
$$;

-- Function to find duplicate files by hash
CREATE OR REPLACE FUNCTION app.find_duplicate_attachments(
    p_tenant_id uuid,
    p_file_hash varchar(64)
)
RETURNS TABLE (
    id uuid,
    case_id uuid,
    file_name varchar(255),
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.case_id,
        ca.file_name,
        ca.created_at
    FROM app.case_attachments ca
    WHERE ca.tenant_id = p_tenant_id
      AND ca.file_hash = p_file_hash
      AND ca.deleted_at IS NULL
    ORDER BY ca.created_at DESC;
END;
$$;

-- Function to get attachment statistics for a case
CREATE OR REPLACE FUNCTION app.get_case_attachment_stats(
    p_case_id uuid
)
RETURNS TABLE (
    total_count bigint,
    total_size_bytes bigint,
    by_type jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_count,
        COALESCE(SUM(ca.file_size_bytes), 0)::bigint AS total_size_bytes,
        jsonb_object_agg(
            ca.attachment_type,
            type_counts.cnt
        ) AS by_type
    FROM app.case_attachments ca
    JOIN (
        SELECT attachment_type, COUNT(*) AS cnt
        FROM app.case_attachments
        WHERE case_id = p_case_id AND deleted_at IS NULL
        GROUP BY attachment_type
    ) type_counts ON type_counts.attachment_type = ca.attachment_type
    WHERE ca.case_id = p_case_id
      AND ca.deleted_at IS NULL
    GROUP BY ca.case_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.case_attachments IS 'File attachments for HR cases with virus scanning and deduplication.';
COMMENT ON COLUMN app.case_attachments.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.case_attachments.tenant_id IS 'Tenant where this attachment exists';
COMMENT ON COLUMN app.case_attachments.case_id IS 'Case this attachment belongs to';
COMMENT ON COLUMN app.case_attachments.comment_id IS 'Comment this attachment is associated with';
COMMENT ON COLUMN app.case_attachments.uploaded_by IS 'User who uploaded the attachment';
COMMENT ON COLUMN app.case_attachments.file_name IS 'Original file name';
COMMENT ON COLUMN app.case_attachments.file_size_bytes IS 'File size in bytes';
COMMENT ON COLUMN app.case_attachments.mime_type IS 'MIME type of the file';
COMMENT ON COLUMN app.case_attachments.attachment_type IS 'Type of attachment';
COMMENT ON COLUMN app.case_attachments.storage_provider IS 'Storage provider (local, s3, gcs, etc.)';
COMMENT ON COLUMN app.case_attachments.storage_key IS 'Key/path in storage';
COMMENT ON COLUMN app.case_attachments.storage_bucket IS 'Storage bucket name';
COMMENT ON COLUMN app.case_attachments.file_hash IS 'SHA-256 hash for integrity and deduplication';
COMMENT ON COLUMN app.case_attachments.hash_algorithm IS 'Algorithm used for file hash';
COMMENT ON COLUMN app.case_attachments.thumbnail_url IS 'URL to thumbnail/preview image';
COMMENT ON COLUMN app.case_attachments.has_preview IS 'Whether a preview is available';
COMMENT ON COLUMN app.case_attachments.scan_status IS 'Virus scan status';
COMMENT ON COLUMN app.case_attachments.scanned_at IS 'When the file was scanned';
COMMENT ON COLUMN app.case_attachments.scan_result IS 'Virus scan result details';
COMMENT ON COLUMN app.case_attachments.is_internal IS 'Whether attachment is internal only';
COMMENT ON COLUMN app.case_attachments.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN app.case_attachments.deleted_by IS 'User who deleted the attachment';
COMMENT ON FUNCTION app.update_case_on_attachment IS 'Updates case timestamp on attachment';
COMMENT ON FUNCTION app.validate_attachment_file_type IS 'Validates allowed file types';
COMMENT ON FUNCTION app.validate_attachment_file_size IS 'Validates file size limits';
COMMENT ON FUNCTION app.add_case_attachment IS 'Adds an attachment to a case';
COMMENT ON FUNCTION app.get_case_attachments IS 'Returns attachments for a case';
COMMENT ON FUNCTION app.delete_case_attachment IS 'Soft deletes an attachment';
COMMENT ON FUNCTION app.update_attachment_scan_status IS 'Updates virus scan status';
COMMENT ON FUNCTION app.get_pending_attachment_scans IS 'Returns attachments pending virus scan';
COMMENT ON FUNCTION app.find_duplicate_attachments IS 'Finds duplicate files by hash';
COMMENT ON FUNCTION app.get_case_attachment_stats IS 'Returns attachment statistics for a case';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_case_attachment_stats(uuid);
-- DROP FUNCTION IF EXISTS app.find_duplicate_attachments(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.get_pending_attachment_scans(integer);
-- DROP FUNCTION IF EXISTS app.update_attachment_scan_status(uuid, varchar, text);
-- DROP FUNCTION IF EXISTS app.delete_case_attachment(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_case_attachments(uuid, boolean, boolean);
-- DROP FUNCTION IF EXISTS app.add_case_attachment(uuid, uuid, uuid, varchar, bigint, varchar, varchar, varchar, varchar, uuid, boolean, varchar);
-- DROP TRIGGER IF EXISTS validate_attachment_file_size ON app.case_attachments;
-- DROP FUNCTION IF EXISTS app.validate_attachment_file_size();
-- DROP TRIGGER IF EXISTS validate_attachment_file_type ON app.case_attachments;
-- DROP FUNCTION IF EXISTS app.validate_attachment_file_type();
-- DROP TRIGGER IF EXISTS update_case_on_attachment ON app.case_attachments;
-- DROP FUNCTION IF EXISTS app.update_case_on_attachment();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.case_attachments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.case_attachments;
-- DROP INDEX IF EXISTS app.idx_case_attachments_hash;
-- DROP INDEX IF EXISTS app.idx_case_attachments_type;
-- DROP INDEX IF EXISTS app.idx_case_attachments_scan_pending;
-- DROP INDEX IF EXISTS app.idx_case_attachments_storage_key;
-- DROP INDEX IF EXISTS app.idx_case_attachments_tenant;
-- DROP INDEX IF EXISTS app.idx_case_attachments_uploader;
-- DROP INDEX IF EXISTS app.idx_case_attachments_comment;
-- DROP INDEX IF EXISTS app.idx_case_attachments_case;
-- DROP TABLE IF EXISTS app.case_attachments;
