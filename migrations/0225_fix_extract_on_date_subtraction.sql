-- Migration: 0225_fix_extract_on_date_subtraction
-- Description: Fix get_employee_tenure_years function that calls
--              EXTRACT(EPOCH FROM date - date). In PostgreSQL, date minus date
--              returns an integer (number of days), not an interval, so EXTRACT
--              fails with "function pg_catalog.extract(unknown, integer) does not exist".
--              Fix: use age() which returns an interval, then extract from that.

CREATE OR REPLACE FUNCTION app.get_employee_tenure_years(
    p_employee_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_hire_date date;
    v_end_date date;
BEGIN
    SELECT hire_date, COALESCE(termination_date, CURRENT_DATE)
    INTO v_hire_date, v_end_date
    FROM app.employees
    WHERE id = p_employee_id;

    IF v_hire_date IS NULL THEN
        RETURN NULL;
    END IF;

    -- date - date returns integer (days) in PostgreSQL, not interval.
    -- Use age() to get an interval, then extract years and months from it.
    RETURN ROUND(
        EXTRACT(YEAR FROM age(v_end_date, v_hire_date))
        + EXTRACT(MONTH FROM age(v_end_date, v_hire_date)) / 12.0
        + EXTRACT(DAY FROM age(v_end_date, v_hire_date)) / 365.25,
        2
    );
END;
$$;

-- Down migration
-- Reverts to the original (buggy) function definition
-- CREATE OR REPLACE FUNCTION app.get_employee_tenure_years(
--     p_employee_id uuid
-- )
-- RETURNS numeric
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = app, public
-- AS $$
-- DECLARE
--     v_hire_date date;
--     v_end_date date;
-- BEGIN
--     SELECT hire_date, COALESCE(termination_date, CURRENT_DATE)
--     INTO v_hire_date, v_end_date
--     FROM app.employees
--     WHERE id = p_employee_id;
--
--     IF v_hire_date IS NULL THEN
--         RETURN NULL;
--     END IF;
--
--     RETURN ROUND(EXTRACT(EPOCH FROM (v_end_date - v_hire_date)) / (365.25 * 24 * 60 * 60), 2);
-- END;
-- $$;
