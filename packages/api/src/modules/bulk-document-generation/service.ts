/**
 * Bulk Document Generation Module - Service Layer
 *
 * Implements business logic for bulk document generation.
 *
 * Flow:
 * 1. Caller POSTs to /documents/bulk-generate with templateId + employeeIds
 * 2. Service validates the template exists and is active
 * 3. Service validates all employeeIds exist within the tenant
 * 4. Creates a batch record and individual batch items in a transaction
 * 5. Queues individual PDF generation jobs for each employee via the outbox
 * 6. Returns the batch ID for tracking progress
 * 7. Background workers process each item, updating status as they go
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  BulkDocumentGenerationRepository,
  BatchRow,
  BatchItemRow,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  BulkGenerateRequest,
  BulkGenerateResponse,
  BatchResponse,
  BatchItemResponse,
  BatchStatusResponse,
} from "./schemas";
import { MAX_BULK_GENERATE_SIZE } from "./schemas";

// =============================================================================
// Service
// =============================================================================

export class BulkDocumentGenerationService {
  constructor(
    private repository: BulkDocumentGenerationRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Bulk Generate
  // ===========================================================================

  /**
   * Create a bulk document generation batch.
   *
   * Validates the template and employees, creates the batch and items,
   * then queues outbox events for each employee to trigger PDF generation
   * by the background worker.
   */
  async createBulkGeneration(
    context: TenantContext,
    data: BulkGenerateRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BulkGenerateResponse>> {
    // Pre-flight validation: batch size
    if (data.employeeIds.length > MAX_BULK_GENERATE_SIZE) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Batch size exceeds maximum of ${MAX_BULK_GENERATE_SIZE} employees`,
          details: { provided: data.employeeIds.length, maximum: MAX_BULK_GENERATE_SIZE },
        },
      };
    }

    // Pre-flight validation: deduplicate employee IDs
    const uniqueEmployeeIds = [...new Set(data.employeeIds)];
    if (uniqueEmployeeIds.length !== data.employeeIds.length) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Duplicate employee IDs found in the request",
          details: {
            provided: data.employeeIds.length,
            unique: uniqueEmployeeIds.length,
          },
        },
      };
    }

    // Validate template exists and is active
    const templateResult = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ id: string; active: boolean; name: string }[]>`
        SELECT id, active, name
        FROM app.letter_templates
        WHERE id = ${data.templateId}::uuid
      `;
      return rows[0] ?? null;
    });

    if (!templateResult) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Letter template not found",
          details: { template_id: data.templateId },
        },
      };
    }

    if (!templateResult.active) {
      return {
        success: false,
        error: {
          code: "TEMPLATE_INACTIVE",
          message: "Cannot generate documents from an inactive template",
          details: { template_id: data.templateId },
        },
      };
    }

    // Validate all employees exist within the tenant
    const existingEmployees = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT id
        FROM app.employees
        WHERE id = ANY(${uniqueEmployeeIds}::uuid[])
      `;
      return new Set(rows.map((r) => r.id));
    });

    const missingEmployees = uniqueEmployeeIds.filter(
      (id) => !existingEmployees.has(id)
    );

    if (missingEmployees.length > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `${missingEmployees.length} employee(s) not found`,
          details: { missing_employee_ids: missingEmployees },
        },
      };
    }

    // Create batch and items atomically with outbox events
    const result = await this.db.withTransaction(context, async (tx) => {
      const { batch, items } = await this.repository.createBatch(tx, context, {
        templateId: data.templateId,
        employeeIds: uniqueEmployeeIds,
        variables: data.variables,
      });

      // Queue individual PDF generation jobs via outbox events for each item.
      // The outbox processor will pick these up and route to the PDF worker.
      for (const item of items) {
        await tx`
          INSERT INTO app.domain_outbox (
            id, tenant_id, aggregate_type, aggregate_id,
            event_type, payload, created_at
          )
          VALUES (
            gen_random_uuid(),
            ${context.tenantId}::uuid,
            'document_generation_batch_item',
            ${item.id}::uuid,
            'documents.bulk_generation.item_queued',
            ${JSON.stringify({
              batchId: batch.id,
              batchItemId: item.id,
              templateId: data.templateId,
              templateName: templateResult.name,
              employeeId: item.employeeId,
              variables: data.variables || {},
              actor: context.userId,
            })}::jsonb,
            now()
          )
        `;
      }

      return batch;
    });

    return {
      success: true,
      data: {
        batch_id: result.id,
        status: result.status as BulkGenerateResponse["status"],
        total_items: result.totalItems,
        message: `Bulk generation batch created with ${result.totalItems} items. Documents will be generated in the background.`,
      },
    };
  }

  // ===========================================================================
  // Batch Status
  // ===========================================================================

  /**
   * Get the status of a bulk generation batch including all items.
   */
  async getBatchStatus(
    context: TenantContext,
    batchId: string
  ): Promise<ServiceResult<BatchStatusResponse>> {
    const batch = await this.repository.findBatchById(context, batchId);

    if (!batch) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Batch not found",
          details: { batch_id: batchId },
        },
      };
    }

    const items = await this.repository.findBatchItems(context, batchId);

    return {
      success: true,
      data: {
        batch: this.mapBatchToResponse(batch),
        items: items.map(this.mapBatchItemToResponse),
      },
    };
  }

  // ===========================================================================
  // Mappers
  // ===========================================================================

  private mapBatchToResponse(row: BatchRow): BatchResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      template_id: row.templateId,
      status: row.status as BatchResponse["status"],
      total_items: row.totalItems,
      completed_items: row.completedItems,
      failed_items: row.failedItems,
      variables: row.variables,
      created_by: row.createdBy,
      created_at:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updated_at:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  private mapBatchItemToResponse = (row: BatchItemRow): BatchItemResponse => ({
    id: row.id,
    employee_id: row.employeeId,
    status: row.status as BatchItemResponse["status"],
    generated_letter_id: row.generatedLetterId,
    error_message: row.errorMessage,
    started_at: row.startedAt instanceof Date
      ? row.startedAt.toISOString()
      : row.startedAt
        ? String(row.startedAt)
        : null,
    completed_at: row.completedAt instanceof Date
      ? row.completedAt.toISOString()
      : row.completedAt
        ? String(row.completedAt)
        : null,
    created_at:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  });
}
