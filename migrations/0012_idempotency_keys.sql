-- Migration: 0012_idempotency_keys
-- Created: 2026-01-07
-- Description: Create the idempotency_keys table for request deduplication
--              Ensures mutating operations are idempotent and can be safely retried
--              Keys expire after 24 hours and are cleaned up by a background job

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Idempotency Keys table - Request deduplication
-- Stores the result of mutating operations to enable safe retries
CREATE TABLE IF NOT EXISTS app.idempotency_keys (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context for the request
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User who made the request
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Route/endpoint key (e.g., POST:/api/v1/employees)
    route_key varchar(255) NOT NULL,

    -- Client-provided idempotency key
    idempotency_key varchar(255) NOT NULL,

    -- Hash of the request body for validation
    -- If a retry has a different body, it's not the same request
    request_hash varchar(64) NOT NULL,

    -- HTTP status code of the response
    response_status integer NOT NULL,

    -- Response body (cached for returning on retries)
    response_body jsonb,

    -- Response headers that need to be preserved
    response_headers jsonb DEFAULT '{}',

    -- When the key was created
    created_at timestamptz NOT NULL DEFAULT now(),

    -- When the key expires (default 24 hours)
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',

    -- Whether the request is still being processed
    -- Used for concurrent request handling
    processing boolean NOT NULL DEFAULT false,

    -- When processing started (for detecting stale locks)
    processing_started_at timestamptz,

    -- Constraints
    CONSTRAINT idempotency_keys_unique UNIQUE (tenant_id, user_id, route_key, idempotency_key)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: Find idempotency key for a specific request
-- This is covered by the UNIQUE constraint but we add an explicit index for clarity
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_lookup
    ON app.idempotency_keys(tenant_id, user_id, route_key, idempotency_key);

-- Cleanup index: Find expired keys for deletion
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
    ON app.idempotency_keys(expires_at)
    WHERE expires_at IS NOT NULL;

-- Index for finding stale processing locks
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_processing
    ON app.idempotency_keys(processing, processing_started_at)
    WHERE processing = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own idempotency keys in their tenant
CREATE POLICY user_isolation ON app.idempotency_keys
    FOR ALL
    USING (
        (
            tenant_id = current_setting('app.current_tenant', true)::uuid
            AND user_id = current_setting('app.current_user', true)::uuid
        )
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert for current tenant/user
CREATE POLICY user_isolation_insert ON app.idempotency_keys
    FOR INSERT
    WITH CHECK (
        (
            tenant_id = current_setting('app.current_tenant', true)::uuid
            AND user_id = current_setting('app.current_user', true)::uuid
        )
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to check if an idempotency key exists and get cached response
CREATE OR REPLACE FUNCTION app.check_idempotency_key(
    p_tenant_id uuid,
    p_user_id uuid,
    p_route_key varchar(255),
    p_idempotency_key varchar(255),
    p_request_hash varchar(64)
)
RETURNS TABLE (
    found boolean,
    processing boolean,
    response_status integer,
    response_body jsonb,
    response_headers jsonb,
    hash_mismatch boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_record app.idempotency_keys%ROWTYPE;
BEGIN
    -- Enable system context for cross-tenant access
    PERFORM app.enable_system_context();

    SELECT * INTO v_record
    FROM app.idempotency_keys
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND route_key = p_route_key
      AND idempotency_key = p_idempotency_key
      AND expires_at > now()
    FOR UPDATE;

    PERFORM app.disable_system_context();

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, NULL::integer, NULL::jsonb, NULL::jsonb, false;
        RETURN;
    END IF;

    -- Check if request hash matches (same request body)
    IF v_record.request_hash != p_request_hash THEN
        RETURN QUERY SELECT true, false, NULL::integer, NULL::jsonb, NULL::jsonb, true;
        RETURN;
    END IF;

    -- Return cached response
    RETURN QUERY SELECT
        true,
        v_record.processing,
        v_record.response_status,
        v_record.response_body,
        v_record.response_headers,
        false;
END;
$$;

-- Function to start processing for an idempotency key
-- Returns false if key already exists (retry or duplicate)
CREATE OR REPLACE FUNCTION app.start_idempotent_request(
    p_tenant_id uuid,
    p_user_id uuid,
    p_route_key varchar(255),
    p_idempotency_key varchar(255),
    p_request_hash varchar(64),
    p_ttl_hours integer DEFAULT 24
)
RETURNS TABLE (
    created boolean,
    existing_response_status integer,
    existing_response_body jsonb,
    existing_response_headers jsonb,
    hash_mismatch boolean,
    still_processing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_record app.idempotency_keys%ROWTYPE;
    v_lock_timeout interval := interval '5 seconds';
BEGIN
    PERFORM app.enable_system_context();

    -- Try to insert new key
    BEGIN
        INSERT INTO app.idempotency_keys (
            tenant_id, user_id, route_key, idempotency_key,
            request_hash, response_status, processing,
            processing_started_at, expires_at
        )
        VALUES (
            p_tenant_id, p_user_id, p_route_key, p_idempotency_key,
            p_request_hash, 0, true,
            now(), now() + (p_ttl_hours || ' hours')::interval
        );

        PERFORM app.disable_system_context();

        RETURN QUERY SELECT true, NULL::integer, NULL::jsonb, NULL::jsonb, false, false;
        RETURN;
    EXCEPTION WHEN unique_violation THEN
        -- Key already exists, check existing record
        NULL;
    END;

    -- Get existing record
    SELECT * INTO v_record
    FROM app.idempotency_keys
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND route_key = p_route_key
      AND idempotency_key = p_idempotency_key;

    PERFORM app.disable_system_context();

    -- Check if expired
    IF v_record.expires_at <= now() THEN
        -- Key expired, caller should delete and retry
        RETURN QUERY SELECT false, NULL::integer, NULL::jsonb, NULL::jsonb, false, false;
        RETURN;
    END IF;

    -- Check request hash match
    IF v_record.request_hash != p_request_hash THEN
        RETURN QUERY SELECT false, NULL::integer, NULL::jsonb, NULL::jsonb, true, false;
        RETURN;
    END IF;

    -- Check if still processing
    IF v_record.processing THEN
        -- Check for stale lock (processing for > 5 minutes)
        IF v_record.processing_started_at < now() - interval '5 minutes' THEN
            -- Stale lock, could take over, but safer to let cleanup job handle
            RETURN QUERY SELECT false, NULL::integer, NULL::jsonb, NULL::jsonb, false, true;
        END IF;
        RETURN QUERY SELECT false, NULL::integer, NULL::jsonb, NULL::jsonb, false, true;
        RETURN;
    END IF;

    -- Return cached response
    RETURN QUERY SELECT
        false,
        v_record.response_status,
        v_record.response_body,
        v_record.response_headers,
        false,
        false;
END;
$$;

-- Function to complete an idempotent request (store response)
CREATE OR REPLACE FUNCTION app.complete_idempotent_request(
    p_tenant_id uuid,
    p_user_id uuid,
    p_route_key varchar(255),
    p_idempotency_key varchar(255),
    p_response_status integer,
    p_response_body jsonb DEFAULT NULL,
    p_response_headers jsonb DEFAULT '{}'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM app.enable_system_context();

    UPDATE app.idempotency_keys
    SET response_status = p_response_status,
        response_body = p_response_body,
        response_headers = COALESCE(p_response_headers, '{}'),
        processing = false,
        processing_started_at = NULL
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND route_key = p_route_key
      AND idempotency_key = p_idempotency_key;

    PERFORM app.disable_system_context();

    RETURN FOUND;
END;
$$;

-- Function to abort an idempotent request (remove the lock)
CREATE OR REPLACE FUNCTION app.abort_idempotent_request(
    p_tenant_id uuid,
    p_user_id uuid,
    p_route_key varchar(255),
    p_idempotency_key varchar(255)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM app.enable_system_context();

    -- Delete the key so the request can be retried
    DELETE FROM app.idempotency_keys
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND route_key = p_route_key
      AND idempotency_key = p_idempotency_key
      AND processing = true;

    PERFORM app.disable_system_context();

    RETURN FOUND;
END;
$$;

-- Function to cleanup expired idempotency keys
CREATE OR REPLACE FUNCTION app.cleanup_expired_idempotency_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    PERFORM app.enable_system_context();

    -- Delete expired keys
    DELETE FROM app.idempotency_keys
    WHERE expires_at < now();

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Also clean up stale processing locks (processing for > 10 minutes)
    UPDATE app.idempotency_keys
    SET processing = false,
        processing_started_at = NULL
    WHERE processing = true
      AND processing_started_at < now() - interval '10 minutes';

    PERFORM app.disable_system_context();

    RETURN v_deleted_count;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.idempotency_keys IS 'Request deduplication for idempotent operations. Keys expire after 24 hours.';
COMMENT ON COLUMN app.idempotency_keys.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.idempotency_keys.tenant_id IS 'Tenant context for the request';
COMMENT ON COLUMN app.idempotency_keys.user_id IS 'User who made the request';
COMMENT ON COLUMN app.idempotency_keys.route_key IS 'Route/endpoint identifier (e.g., POST:/api/v1/employees)';
COMMENT ON COLUMN app.idempotency_keys.idempotency_key IS 'Client-provided idempotency key';
COMMENT ON COLUMN app.idempotency_keys.request_hash IS 'Hash of request body for validation';
COMMENT ON COLUMN app.idempotency_keys.response_status IS 'HTTP status code of the response';
COMMENT ON COLUMN app.idempotency_keys.response_body IS 'Cached response body';
COMMENT ON COLUMN app.idempotency_keys.response_headers IS 'Cached response headers';
COMMENT ON COLUMN app.idempotency_keys.expires_at IS 'When this key expires';
COMMENT ON COLUMN app.idempotency_keys.processing IS 'Whether request is still being processed';
COMMENT ON FUNCTION app.check_idempotency_key IS 'Checks if an idempotency key exists and returns cached response';
COMMENT ON FUNCTION app.start_idempotent_request IS 'Starts processing for an idempotent request, creates lock';
COMMENT ON FUNCTION app.complete_idempotent_request IS 'Completes processing and stores the response';
COMMENT ON FUNCTION app.abort_idempotent_request IS 'Aborts processing and removes the lock';
COMMENT ON FUNCTION app.cleanup_expired_idempotency_keys IS 'Removes expired keys and stale locks';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.cleanup_expired_idempotency_keys();
-- DROP FUNCTION IF EXISTS app.abort_idempotent_request(uuid, uuid, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.complete_idempotent_request(uuid, uuid, varchar, varchar, integer, jsonb, jsonb);
-- DROP FUNCTION IF EXISTS app.start_idempotent_request(uuid, uuid, varchar, varchar, varchar, integer);
-- DROP FUNCTION IF EXISTS app.check_idempotency_key(uuid, uuid, varchar, varchar, varchar);
-- DROP POLICY IF EXISTS user_isolation_insert ON app.idempotency_keys;
-- DROP POLICY IF EXISTS user_isolation ON app.idempotency_keys;
-- DROP INDEX IF EXISTS app.idx_idempotency_keys_processing;
-- DROP INDEX IF EXISTS app.idx_idempotency_keys_expires_at;
-- DROP INDEX IF EXISTS app.idx_idempotency_keys_lookup;
-- DROP TABLE IF EXISTS app.idempotency_keys;
