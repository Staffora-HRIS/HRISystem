-- Migration: 0185_fix_broken_trigger_references
-- Created: 2026-03-16
-- Description: Fix triggers that reference app.update_updated_at() when the
--              actual function is named app.update_updated_at_column().
--
--              Affected migrations:
--              - 0127_dsar.sql: trg_dsar_requests_updated_at, trg_dsar_data_items_updated_at
--              - 0151_employee_photos.sql: trg_employee_photos_updated_at
--              - 0152_employee_bank_details.sql: trg_employee_bank_details_updated_at
--
--              These triggers will fail at UPDATE time if they were created pointing
--              to app.update_updated_at() which does not exist — the correct function
--              is app.update_updated_at_column() (defined in docker/postgres/init.sql
--              and now also in migration 0184).
--
--              This migration uses CREATE OR REPLACE TRIGGER to idempotently
--              re-point the triggers at the correct function. If the trigger
--              already references the correct function, the replacement is a no-op
--              in terms of behaviour.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- DSAR module (0127)
-- ---------------------------------------------------------------------------

-- Fix trg_dsar_requests_updated_at
-- Wrapped in DO block to handle case where table doesn't exist yet
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_dsar_requests_updated_at ON app.dsar_requests;
  CREATE TRIGGER trg_dsar_requests_updated_at
    BEFORE UPDATE ON app.dsar_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Fix trg_dsar_data_items_updated_at
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_dsar_data_items_updated_at ON app.dsar_data_items;
  CREATE TRIGGER trg_dsar_data_items_updated_at
    BEFORE UPDATE ON app.dsar_data_items
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Employee Photos (0151)
-- ---------------------------------------------------------------------------

-- Fix trg_employee_photos_updated_at
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_employee_photos_updated_at ON app.employee_photos;
  CREATE TRIGGER trg_employee_photos_updated_at
    BEFORE UPDATE ON app.employee_photos
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Employee Bank Details (0152)
-- ---------------------------------------------------------------------------

-- Fix trg_employee_bank_details_updated_at
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_employee_bank_details_updated_at ON app.employee_bank_details;
  CREATE TRIGGER trg_employee_bank_details_updated_at
    BEFORE UPDATE ON app.employee_bank_details
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- DOWN Migration (for rollback — restore the broken references)
-- =============================================================================

-- Note: Rolling back would restore the broken triggers. Only do this if
-- you have also created the app.update_updated_at() alias function.
--
-- DROP TRIGGER IF EXISTS trg_dsar_requests_updated_at ON app.dsar_requests;
-- CREATE TRIGGER trg_dsar_requests_updated_at
--   BEFORE UPDATE ON app.dsar_requests FOR EACH ROW
--   EXECUTE FUNCTION app.update_updated_at();
--
-- DROP TRIGGER IF EXISTS trg_dsar_data_items_updated_at ON app.dsar_data_items;
-- CREATE TRIGGER trg_dsar_data_items_updated_at
--   BEFORE UPDATE ON app.dsar_data_items FOR EACH ROW
--   EXECUTE FUNCTION app.update_updated_at();
--
-- DROP TRIGGER IF EXISTS trg_employee_photos_updated_at ON app.employee_photos;
-- CREATE TRIGGER trg_employee_photos_updated_at
--   BEFORE UPDATE ON app.employee_photos FOR EACH ROW
--   EXECUTE FUNCTION app.update_updated_at();
--
-- DROP TRIGGER IF EXISTS trg_employee_bank_details_updated_at ON app.employee_bank_details;
-- CREATE TRIGGER trg_employee_bank_details_updated_at
--   BEFORE UPDATE ON app.employee_bank_details FOR EACH ROW
--   EXECUTE FUNCTION app.update_updated_at();
