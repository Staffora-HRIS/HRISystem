-- Migration: 0091_fix_employee_status_history_triggers
-- Created: 2026-01-08
-- Description: Make employee status history triggers resilient when app.current_user is unset

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE OR REPLACE FUNCTION app.record_employee_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO app.employee_status_history (
            tenant_id, employee_id,
            from_status, to_status,
            effective_date, reason,
            created_by
        )
        VALUES (
            NEW.tenant_id, NEW.id,
            OLD.status, NEW.status,
            CURRENT_DATE, NEW.termination_reason,
            app.current_user_id()
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.record_employee_initial_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    INSERT INTO app.employee_status_history (
        tenant_id, employee_id,
        from_status, to_status,
        effective_date, reason,
        created_by
    )
    VALUES (
        NEW.tenant_id, NEW.id,
        NULL, NEW.status,
        NEW.hire_date, 'New hire',
        app.current_user_id()
    );

    RETURN NEW;
END;
$$;
