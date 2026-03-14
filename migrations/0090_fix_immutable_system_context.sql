-- Migration: 0090_fix_immutable_system_context
-- Created: 2026-01-08
-- Description: Allow system-context cleanup on immutable tables and avoid uuid cast errors

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Allow updates on immutable tables only in system context
CREATE OR REPLACE FUNCTION app.prevent_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF app.is_system_context() THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Updates are not allowed on this table';
END;
$$;

-- Allow deletes on immutable tables only in system context
CREATE OR REPLACE FUNCTION app.prevent_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF app.is_system_context() THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Deletes are not allowed on this table';
END;
$$;
