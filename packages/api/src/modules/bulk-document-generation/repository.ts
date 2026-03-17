/**
 * Bulk Document Generation Module - Repository Layer
 *
 * Provides data access methods for document generation batches and batch items.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { BatchStatus, BatchItemStatus } from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface BatchRow {
  id: string;
  tenantId: string;
  templateId: string;
  status: BatchStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  variables: Record<string, string> | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchItemRow {
  id: string;
  tenantId: string;
  batchId: string;
  employeeId: string;
  status: BatchItemStatus;
  generatedLetterId: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class BulkDocumentGenerationRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Create a new batch with its items in a single transaction.
   * Writes outbox event atomically.
   */
  async createBatch(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      templateId: string;
      employeeIds: string[];
      variables?: Record<string, string>;
    }
  ): Promise<{ batch: BatchRow; items: BatchItemRow[] }> {
    // Insert batch
    const batchRows = await tx<BatchRow[]>`
      INSERT INTO app.document_generation_batches (
        tenant_id, template_id, status, total_items,
        variables, created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.templateId}::uuid,
        'pending',
        ${data.employeeIds.length},
        ${data.variables ? JSON.stringify(data.variables) : null}::jsonb,
        ${context.userId!}::uuid
      )
      RETURNING
        id, tenant_id, template_id, status, total_items,
        completed_items, failed_items, variables,
        created_by, created_at, updated_at
    `;

    const batch = batchRows[0]!;

    // Insert batch items
    const itemValues = data.employeeIds.map((employeeId) => ({
      tenantId: context.tenantId,
      batchId: batch.id,
      employeeId,
    }));

    const itemRows: BatchItemRow[] = [];
    for (const item of itemValues) {
      const rows = await tx<BatchItemRow[]>`
        INSERT INTO app.document_generation_batch_items (
          tenant_id, batch_id, employee_id, status
        )
        VALUES (
          ${item.tenantId}::uuid,
          ${item.batchId}::uuid,
          ${item.employeeId}::uuid,
          'pending'
        )
        RETURNING
          id, tenant_id, batch_id, employee_id, status,
          generated_letter_id, error_message,
          started_at, completed_at, created_at
      `;
      itemRows.push(rows[0]!);
    }

    // Write outbox event
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        'document_generation_batch',
        ${batch.id}::uuid,
        'documents.bulk_generation.created',
        ${JSON.stringify({
          batchId: batch.id,
          templateId: data.templateId,
          employeeIds: data.employeeIds,
          totalItems: data.employeeIds.length,
          actor: context.userId,
        })}::jsonb,
        now()
      )
    `;

    return { batch, items: itemRows };
  }

  /**
   * Get batch by ID
   */
  async findBatchById(
    context: TenantContext,
    batchId: string
  ): Promise<BatchRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<BatchRow[]>`
        SELECT
          id, tenant_id, template_id, status, total_items,
          completed_items, failed_items, variables,
          created_by, created_at, updated_at
        FROM app.document_generation_batches
        WHERE id = ${batchId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  /**
   * Get batch items for a batch
   */
  async findBatchItems(
    context: TenantContext,
    batchId: string
  ): Promise<BatchItemRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<BatchItemRow[]>`
        SELECT
          id, tenant_id, batch_id, employee_id, status,
          generated_letter_id, error_message,
          started_at, completed_at, created_at
        FROM app.document_generation_batch_items
        WHERE batch_id = ${batchId}::uuid
        ORDER BY created_at ASC
      `;
    });
  }

  /**
   * Get pending batch items for processing
   */
  async findPendingBatchItems(
    context: TenantContext,
    batchId: string
  ): Promise<BatchItemRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<BatchItemRow[]>`
        SELECT
          id, tenant_id, batch_id, employee_id, status,
          generated_letter_id, error_message,
          started_at, completed_at, created_at
        FROM app.document_generation_batch_items
        WHERE batch_id = ${batchId}::uuid
          AND status = 'pending'
        ORDER BY created_at ASC
      `;
    });
  }

  // ===========================================================================
  // Batch Item State Updates
  // ===========================================================================

  /**
   * Mark a batch item as processing
   */
  async markItemProcessing(
    tx: TransactionSql,
    itemId: string
  ): Promise<void> {
    await tx`
      UPDATE app.document_generation_batch_items
      SET status = 'processing', started_at = now()
      WHERE id = ${itemId}::uuid
    `;
  }

  /**
   * Mark a batch item as completed
   */
  async markItemCompleted(
    tx: TransactionSql,
    itemId: string,
    generatedLetterId: string
  ): Promise<void> {
    await tx`
      UPDATE app.document_generation_batch_items
      SET
        status = 'completed',
        generated_letter_id = ${generatedLetterId}::uuid,
        completed_at = now()
      WHERE id = ${itemId}::uuid
    `;
  }

  /**
   * Mark a batch item as failed
   */
  async markItemFailed(
    tx: TransactionSql,
    itemId: string,
    errorMessage: string
  ): Promise<void> {
    await tx`
      UPDATE app.document_generation_batch_items
      SET
        status = 'failed',
        error_message = ${errorMessage},
        completed_at = now()
      WHERE id = ${itemId}::uuid
    `;
  }

  // ===========================================================================
  // Batch State Updates
  // ===========================================================================

  /**
   * Update batch status
   */
  async updateBatchStatus(
    tx: TransactionSql,
    batchId: string,
    status: BatchStatus
  ): Promise<void> {
    await tx`
      UPDATE app.document_generation_batches
      SET status = ${status}, updated_at = now()
      WHERE id = ${batchId}::uuid
    `;
  }

  /**
   * Increment completed count on the batch
   */
  async incrementBatchCompleted(
    tx: TransactionSql,
    batchId: string
  ): Promise<void> {
    await tx`
      UPDATE app.document_generation_batches
      SET completed_items = completed_items + 1, updated_at = now()
      WHERE id = ${batchId}::uuid
    `;
  }

  /**
   * Increment failed count on the batch
   */
  async incrementBatchFailed(
    tx: TransactionSql,
    batchId: string
  ): Promise<void> {
    await tx`
      UPDATE app.document_generation_batches
      SET failed_items = failed_items + 1, updated_at = now()
      WHERE id = ${batchId}::uuid
    `;
  }

  /**
   * Recalculate and finalize batch status based on item outcomes.
   * Call after all items have been processed.
   */
  async finalizeBatch(
    tx: TransactionSql,
    batchId: string
  ): Promise<BatchRow> {
    const rows = await tx<BatchRow[]>`
      UPDATE app.document_generation_batches
      SET
        status = CASE
          WHEN failed_items = 0 AND completed_items = total_items THEN 'completed'
          WHEN completed_items > 0 AND failed_items > 0 THEN 'completed_with_errors'
          WHEN failed_items = total_items THEN 'failed'
          ELSE status
        END,
        updated_at = now()
      WHERE id = ${batchId}::uuid
      RETURNING
        id, tenant_id, template_id, status, total_items,
        completed_items, failed_items, variables,
        created_by, created_at, updated_at
    `;

    return rows[0]!;
  }
}
