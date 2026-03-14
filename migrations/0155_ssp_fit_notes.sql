-- Migration: 0155_ssp_fit_notes
-- Created: 2026-03-14
-- Description: Add fit note tracking to the SSP module.
--   UK employment law requires a fit note (Statement of Fitness for Work)
--   after 7 consecutive days of sickness. Self-certification is sufficient
--   for the first 7 days.
--
--   This table stores fit note records against SSP records for compliance tracking.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Fit note status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ssp_fit_note_status') THEN
    CREATE TYPE app.ssp_fit_note_status AS ENUM (
      'pending',       -- fit note expected but not yet received
      'received',      -- fit note received and on file
      'self_certified' -- first 7 days, self-certification only
    );
  END IF;
END
$$;

-- =============================================================================
-- ssp_fit_notes: Tracks fit notes / self-certification for SSP records
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.ssp_fit_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  ssp_record_id   uuid NOT NULL,
  employee_id     uuid NOT NULL,

  -- Fit note details
  status          app.ssp_fit_note_status NOT NULL DEFAULT 'pending',

  -- Period this fit note covers
  cover_from      date NOT NULL,
  cover_to        date,                   -- NULL = open-ended / until return

  -- Fit note document reference (links to documents module if stored)
  document_id     uuid,
  issuing_doctor  text,
  diagnosis       text,
  notes           text,

  -- Whether the note says "may be fit" (with adjustments) vs "not fit"
  may_be_fit      boolean NOT NULL DEFAULT false,
  adjustments     text,                   -- Recommended adjustments if may_be_fit

  -- Date the fit note was received by the employer
  received_date   date,

  -- Audit
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_ssp_fit_notes_record
    FOREIGN KEY (ssp_record_id) REFERENCES app.ssp_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssp_fit_notes_employee
    FOREIGN KEY (employee_id) REFERENCES app.employees(id),

  -- Cover_to must be on or after cover_from
  CONSTRAINT ssp_fit_notes_dates_check
    CHECK (cover_to IS NULL OR cover_to >= cover_from)
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.ssp_fit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.ssp_fit_notes
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.ssp_fit_notes
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.ssp_fit_notes
  USING (current_setting('app.system_context', true) = 'true');

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ssp_fit_notes_tenant_id
  ON app.ssp_fit_notes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ssp_fit_notes_ssp_record_id
  ON app.ssp_fit_notes (ssp_record_id);

CREATE INDEX IF NOT EXISTS idx_ssp_fit_notes_employee_id
  ON app.ssp_fit_notes (employee_id);

CREATE INDEX IF NOT EXISTS idx_ssp_fit_notes_status
  ON app.ssp_fit_notes (status) WHERE status = 'pending';

-- =============================================================================
-- Grants for hris_app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.ssp_fit_notes TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.ssp_fit_notes;
-- DROP TYPE IF EXISTS app.ssp_fit_note_status;
