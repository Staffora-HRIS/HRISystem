-- Migration: 0011_domain_outbox
-- Created: 2026-01-07
-- Description: Create the domain_outbox table for the transactional outbox pattern
--              Domain events are written here in the same transaction as business writes
--              A worker processes unprocessed events and publishes them to Redis Streams

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Domain Outbox table - Transactional event outbox
-- Events are written here in the same transaction as the business write
-- This ensures at-least-once delivery of domain events
CREATE TABLE IF NOT EXISTS app.domain_outbox (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context for the event
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Type of aggregate that produced this event
    -- Examples: employee, leave_request, timesheet, role_assignment
    aggregate_type varchar(100) NOT NULL,

    -- ID of the specific aggregate instance
    aggregate_id uuid NOT NULL,

    -- Type of event
    -- Convention: domain.aggregate.verb (e.g., hr.employee.created, absence.request.approved)
    event_type varchar(255) NOT NULL,

    -- Event payload (the actual event data)
    payload jsonb NOT NULL DEFAULT '{}',

    -- Event metadata (correlation IDs, causation, etc.)
    metadata jsonb NOT NULL DEFAULT '{}',

    -- When the event was created
    created_at timestamptz NOT NULL DEFAULT now(),

    -- When the event was processed (NULL = not yet processed)
    processed_at timestamptz,

    -- How many times processing has been attempted
    retry_count integer NOT NULL DEFAULT 0,

    -- Error message from last failed processing attempt
    error_message text,

    -- Next retry time (for exponential backoff)
    next_retry_at timestamptz
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Critical index: Find unprocessed events for worker to process
-- This is the main query pattern for the outbox processor
CREATE INDEX IF NOT EXISTS idx_domain_outbox_unprocessed
    ON app.domain_outbox(created_at)
    WHERE processed_at IS NULL;

-- Index for finding events by aggregate (for debugging/replay)
CREATE INDEX IF NOT EXISTS idx_domain_outbox_aggregate
    ON app.domain_outbox(aggregate_type, aggregate_id, created_at);

-- Index for tenant filtering
CREATE INDEX IF NOT EXISTS idx_domain_outbox_tenant_id
    ON app.domain_outbox(tenant_id, created_at);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_domain_outbox_event_type
    ON app.domain_outbox(event_type, created_at);

-- Index for retry scheduling
CREATE INDEX IF NOT EXISTS idx_domain_outbox_retry
    ON app.domain_outbox(next_retry_at)
    WHERE processed_at IS NULL AND next_retry_at IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.domain_outbox ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see events for their current tenant
CREATE POLICY tenant_isolation ON app.domain_outbox
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert for current tenant
CREATE POLICY tenant_isolation_insert ON app.domain_outbox
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to write a domain event to the outbox
-- This should be called within the same transaction as the business write
CREATE OR REPLACE FUNCTION app.write_outbox_event(
    p_tenant_id uuid,
    p_aggregate_type varchar(100),
    p_aggregate_id uuid,
    p_event_type varchar(255),
    p_payload jsonb DEFAULT '{}',
    p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_event_id uuid;
BEGIN
    INSERT INTO app.domain_outbox (
        tenant_id, aggregate_type, aggregate_id,
        event_type, payload, metadata, created_at
    )
    VALUES (
        p_tenant_id, p_aggregate_type, p_aggregate_id,
        p_event_type, COALESCE(p_payload, '{}'), COALESCE(p_metadata, '{}'), now()
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- Function to claim a batch of unprocessed events for processing
-- Uses SKIP LOCKED to allow concurrent workers
CREATE OR REPLACE FUNCTION app.claim_outbox_events(
    p_batch_size integer DEFAULT 100,
    p_worker_id text DEFAULT 'worker-1'
)
RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    aggregate_type varchar(100),
    aggregate_id uuid,
    event_type varchar(255),
    payload jsonb,
    metadata jsonb,
    created_at timestamptz,
    retry_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Enable system context for cross-tenant access
    PERFORM app.enable_system_context();

    RETURN QUERY
    SELECT
        o.id,
        o.tenant_id,
        o.aggregate_type,
        o.aggregate_id,
        o.event_type,
        o.payload,
        o.metadata,
        o.created_at,
        o.retry_count
    FROM app.domain_outbox o
    WHERE o.processed_at IS NULL
      AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
    ORDER BY o.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED;

    PERFORM app.disable_system_context();
END;
$$;

-- Function to mark an event as processed
CREATE OR REPLACE FUNCTION app.mark_outbox_event_processed(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM app.enable_system_context();

    UPDATE app.domain_outbox
    SET processed_at = now(),
        error_message = NULL
    WHERE id = p_event_id
      AND processed_at IS NULL;

    PERFORM app.disable_system_context();

    RETURN FOUND;
END;
$$;

-- Function to mark an event as failed (with retry scheduling)
CREATE OR REPLACE FUNCTION app.mark_outbox_event_failed(
    p_event_id uuid,
    p_error_message text,
    p_max_retries integer DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_retry integer;
    v_next_retry interval;
BEGIN
    PERFORM app.enable_system_context();

    -- Get current retry count
    SELECT retry_count INTO v_current_retry
    FROM app.domain_outbox
    WHERE id = p_event_id;

    IF v_current_retry >= p_max_retries THEN
        -- Max retries exceeded, mark as processed (will be in DLQ state with error)
        UPDATE app.domain_outbox
        SET processed_at = now(),
            error_message = 'MAX_RETRIES_EXCEEDED: ' || p_error_message,
            retry_count = v_current_retry + 1
        WHERE id = p_event_id;
    ELSE
        -- Calculate next retry with exponential backoff (1s, 2s, 4s, 8s, ...)
        v_next_retry := (power(2, v_current_retry) || ' seconds')::interval;

        -- Cap at 1 hour
        IF v_next_retry > interval '1 hour' THEN
            v_next_retry := interval '1 hour';
        END IF;

        UPDATE app.domain_outbox
        SET retry_count = v_current_retry + 1,
            error_message = p_error_message,
            next_retry_at = now() + v_next_retry
        WHERE id = p_event_id;
    END IF;

    PERFORM app.disable_system_context();

    RETURN FOUND;
END;
$$;

-- Function to cleanup old processed events
CREATE OR REPLACE FUNCTION app.cleanup_processed_outbox_events(
    p_older_than interval DEFAULT interval '7 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted_count integer;
BEGIN
    PERFORM app.enable_system_context();

    DELETE FROM app.domain_outbox
    WHERE processed_at IS NOT NULL
      AND processed_at < now() - p_older_than
      AND error_message IS NULL;  -- Keep failed events for debugging

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    PERFORM app.disable_system_context();

    RETURN v_deleted_count;
END;
$$;

-- Function to get outbox statistics
CREATE OR REPLACE FUNCTION app.get_outbox_stats()
RETURNS TABLE (
    total_pending bigint,
    total_failed bigint,
    total_processed_today bigint,
    oldest_pending_at timestamptz,
    events_by_type jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    PERFORM app.enable_system_context();

    RETURN QUERY
    SELECT
        (SELECT count(*) FROM app.domain_outbox WHERE processed_at IS NULL AND error_message IS NULL) AS total_pending,
        (SELECT count(*) FROM app.domain_outbox WHERE processed_at IS NULL AND error_message IS NOT NULL) AS total_failed,
        (SELECT count(*) FROM app.domain_outbox WHERE processed_at >= CURRENT_DATE) AS total_processed_today,
        (SELECT min(created_at) FROM app.domain_outbox WHERE processed_at IS NULL) AS oldest_pending_at,
        (
            SELECT COALESCE(jsonb_object_agg(event_type, cnt), '{}')
            FROM (
                SELECT event_type, count(*) as cnt
                FROM app.domain_outbox
                WHERE processed_at IS NULL
                GROUP BY event_type
            ) s
        ) AS events_by_type;

    PERFORM app.disable_system_context();
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.domain_outbox IS 'Transactional outbox for domain events. Events are written here atomically with business writes.';
COMMENT ON COLUMN app.domain_outbox.id IS 'Primary UUID identifier for the event';
COMMENT ON COLUMN app.domain_outbox.tenant_id IS 'Tenant context for the event';
COMMENT ON COLUMN app.domain_outbox.aggregate_type IS 'Type of aggregate that produced this event';
COMMENT ON COLUMN app.domain_outbox.aggregate_id IS 'ID of the specific aggregate instance';
COMMENT ON COLUMN app.domain_outbox.event_type IS 'Type of event (domain.aggregate.verb format)';
COMMENT ON COLUMN app.domain_outbox.payload IS 'Event payload data';
COMMENT ON COLUMN app.domain_outbox.metadata IS 'Event metadata (correlation IDs, etc.)';
COMMENT ON COLUMN app.domain_outbox.processed_at IS 'When the event was processed, NULL if pending';
COMMENT ON COLUMN app.domain_outbox.retry_count IS 'Number of processing attempts';
COMMENT ON COLUMN app.domain_outbox.error_message IS 'Error from last failed processing attempt';
COMMENT ON COLUMN app.domain_outbox.next_retry_at IS 'When to retry processing (for exponential backoff)';
COMMENT ON FUNCTION app.write_outbox_event IS 'Writes a domain event to the outbox (call in same transaction as business write)';
COMMENT ON FUNCTION app.claim_outbox_events IS 'Claims a batch of unprocessed events for worker processing';
COMMENT ON FUNCTION app.mark_outbox_event_processed IS 'Marks an event as successfully processed';
COMMENT ON FUNCTION app.mark_outbox_event_failed IS 'Marks an event as failed with retry scheduling';
COMMENT ON FUNCTION app.cleanup_processed_outbox_events IS 'Removes old processed events';
COMMENT ON FUNCTION app.get_outbox_stats IS 'Returns statistics about the outbox queue';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_outbox_stats();
-- DROP FUNCTION IF EXISTS app.cleanup_processed_outbox_events(interval);
-- DROP FUNCTION IF EXISTS app.mark_outbox_event_failed(uuid, text, integer);
-- DROP FUNCTION IF EXISTS app.mark_outbox_event_processed(uuid);
-- DROP FUNCTION IF EXISTS app.claim_outbox_events(integer, text);
-- DROP FUNCTION IF EXISTS app.write_outbox_event(uuid, varchar, uuid, varchar, jsonb, jsonb);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.domain_outbox;
-- DROP POLICY IF EXISTS tenant_isolation ON app.domain_outbox;
-- DROP INDEX IF EXISTS app.idx_domain_outbox_retry;
-- DROP INDEX IF EXISTS app.idx_domain_outbox_event_type;
-- DROP INDEX IF EXISTS app.idx_domain_outbox_tenant_id;
-- DROP INDEX IF EXISTS app.idx_domain_outbox_aggregate;
-- DROP INDEX IF EXISTS app.idx_domain_outbox_unprocessed;
-- DROP TABLE IF EXISTS app.domain_outbox;
