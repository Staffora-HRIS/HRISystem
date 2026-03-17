-- =============================================================================
-- Migration: 0198_bulk_document_generation
-- Description: Add tables for tracking bulk document generation batches
-- =============================================================================

-- =============================================================================
-- Batch tracking table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.document_generation_batches (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES app.tenants(id),
  template_id   uuid        NOT NULL REFERENCES app.letter_templates(id),
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
  total_items   integer     NOT NULL CHECK (total_items > 0),
  completed_items integer   NOT NULL DEFAULT 0,
  failed_items  integer     NOT NULL DEFAULT 0,
  variables     jsonb,
  created_by    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.document_generation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.document_generation_batches
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.document_generation_batches
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX idx_doc_gen_batches_tenant_id
  ON app.document_generation_batches (tenant_id);

CREATE INDEX idx_doc_gen_batches_status
  ON app.document_generation_batches (status);

CREATE INDEX idx_doc_gen_batches_created_at
  ON app.document_generation_batches (created_at DESC);

-- =============================================================================
-- Batch item tracking table (one row per employee in a batch)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.document_generation_batch_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES app.tenants(id),
  batch_id          uuid        NOT NULL REFERENCES app.document_generation_batches(id) ON DELETE CASCADE,
  employee_id       uuid        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  generated_letter_id uuid,
  error_message     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.document_generation_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.document_generation_batch_items
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.document_generation_batch_items
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX idx_doc_gen_batch_items_batch_id
  ON app.document_generation_batch_items (batch_id);

CREATE INDEX idx_doc_gen_batch_items_tenant_id
  ON app.document_generation_batch_items (tenant_id);

CREATE INDEX idx_doc_gen_batch_items_status
  ON app.document_generation_batch_items (status);

CREATE INDEX idx_doc_gen_batch_items_employee_id
  ON app.document_generation_batch_items (employee_id);

-- Prevent duplicate employee in same batch
CREATE UNIQUE INDEX idx_doc_gen_batch_items_batch_employee
  ON app.document_generation_batch_items (batch_id, employee_id);

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app.document_generation_batches TO hris_app;
GRANT SELECT, INSERT, UPDATE ON app.document_generation_batch_items TO hris_app;
