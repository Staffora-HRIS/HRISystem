/**
 * Bulk Operations Module - Service Layer
 *
 * Implements business logic for bulk operations.
 * Orchestrates validation, repository calls, and response formatting.
 *
 * Design decisions:
 * - Each bulk endpoint collects per-item results (success/failure).
 * - All items in a request share a single DB transaction so the entire
 *   batch either commits or rolls back atomically.
 * - The response always returns HTTP 200 with a structured body
 *   showing per-item outcomes, since partial success is expected.
 * - Pre-flight validation (array length, duplicate IDs) happens at the
 *   service layer before hitting the database.
 */

import type { BulkOperationsRepository } from "./repository";
import type { TenantContext } from "../../types/service-result";
import type { ServiceResult } from "../../types/service-result";
import type {
  BulkCreateEmployeeItem,
  BulkUpdateEmployeeItem,
  BulkLeaveRequestActionItem,
  BulkResponse,
  GenericBulkOperationItem,
  GenericBulkResponse,
} from "./schemas";
import { MAX_BULK_BATCH_SIZE, ALLOWED_BULK_PATH_PREFIXES } from "./schemas";

// =============================================================================
// Service
// =============================================================================

export class BulkOperationsService {
  constructor(private repository: BulkOperationsRepository) {}

  // ===========================================================================
  // Bulk Create Employees
  // ===========================================================================

  /**
   * Validate and create multiple employees.
   */
  async bulkCreateEmployees(
    ctx: TenantContext,
    items: BulkCreateEmployeeItem[]
  ): Promise<ServiceResult<BulkResponse>> {
    // Pre-flight validation
    if (items.length === 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one employee is required",
        },
      };
    }

    if (items.length > MAX_BULK_BATCH_SIZE) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Batch size exceeds maximum of ${MAX_BULK_BATCH_SIZE} items`,
          details: { provided: items.length, maximum: MAX_BULK_BATCH_SIZE },
        },
      };
    }

    // Check for duplicate employee numbers within the batch
    const employeeNumbers = items
      .map((item) => item.employee_number)
      .filter((n): n is string => !!n);
    const dupes = findDuplicates(employeeNumbers);
    if (dupes.length > 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Duplicate employee numbers within the batch",
          details: { duplicates: dupes },
        },
      };
    }

    try {
      const results = await this.repository.bulkCreateEmployees(ctx, items);

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        success: true,
        data: {
          total: results.length,
          succeeded,
          failed,
          results,
        },
      };
    } catch (error) {
      console.error("Bulk create employees failed:", error);
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Bulk employee creation failed",
        },
      };
    }
  }

  // ===========================================================================
  // Bulk Update Employees
  // ===========================================================================

  /**
   * Validate and update multiple employees.
   */
  async bulkUpdateEmployees(
    ctx: TenantContext,
    items: BulkUpdateEmployeeItem[]
  ): Promise<ServiceResult<BulkResponse>> {
    // Pre-flight validation
    if (items.length === 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one employee update is required",
        },
      };
    }

    if (items.length > MAX_BULK_BATCH_SIZE) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Batch size exceeds maximum of ${MAX_BULK_BATCH_SIZE} items`,
          details: { provided: items.length, maximum: MAX_BULK_BATCH_SIZE },
        },
      };
    }

    // Check for duplicate employee IDs within the batch
    const employeeIds = items.map((item) => item.employee_id);
    const dupes = findDuplicates(employeeIds);
    if (dupes.length > 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Duplicate employee IDs within the batch. Each employee should appear at most once.",
          details: { duplicates: dupes },
        },
      };
    }

    // Check that at least one update dimension is provided for each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (!item.personal && !item.contract && !item.compensation) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Item at index ${i} has no update fields. Specify at least one of: personal, contract, compensation`,
          },
        };
      }
    }

    try {
      const results = await this.repository.bulkUpdateEmployees(ctx, items);

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        success: true,
        data: {
          total: results.length,
          succeeded,
          failed,
          results,
        },
      };
    } catch (error) {
      console.error("Bulk update employees failed:", error);
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Bulk employee update failed",
        },
      };
    }
  }

  // ===========================================================================
  // Bulk Leave Request Actions
  // ===========================================================================

  /**
   * Validate and process multiple leave request approve/reject actions.
   */
  async bulkLeaveRequestActions(
    ctx: TenantContext,
    items: BulkLeaveRequestActionItem[]
  ): Promise<ServiceResult<BulkResponse>> {
    // Pre-flight validation
    if (items.length === 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one leave request action is required",
        },
      };
    }

    if (items.length > MAX_BULK_BATCH_SIZE) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Batch size exceeds maximum of ${MAX_BULK_BATCH_SIZE} items`,
          details: { provided: items.length, maximum: MAX_BULK_BATCH_SIZE },
        },
      };
    }

    // Check for duplicate leave request IDs within the batch
    const requestIds = items.map((item) => item.leave_request_id);
    const dupes = findDuplicates(requestIds);
    if (dupes.length > 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Duplicate leave request IDs within the batch. Each request should appear at most once.",
          details: { duplicates: dupes },
        },
      };
    }

    try {
      const results = await this.repository.bulkLeaveRequestActions(ctx, items);

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        success: true,
        data: {
          total: results.length,
          succeeded,
          failed,
          results,
        },
      };
    } catch (error) {
      console.error("Bulk leave request actions failed:", error);
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Bulk leave request actions failed",
        },
      };
    }
  }

  // ===========================================================================
  // Generic Bulk Operations (POST /api/v1/bulk)
  // ===========================================================================

  async executeGenericBulk(
    ctx: TenantContext,
    operations: GenericBulkOperationItem[],
    appFetch: (request: Request) => Promise<Response>,
    authHeaders: Record<string, string>
  ): Promise<ServiceResult<GenericBulkResponse>> {
    if (operations.length === 0) {
      return { success: false, error: { code: "VALIDATION_ERROR", message: "At least one operation is required" } };
    }
    if (operations.length > MAX_BULK_BATCH_SIZE) {
      return { success: false, error: { code: "VALIDATION_ERROR", message: `Batch size exceeds maximum of ${MAX_BULK_BATCH_SIZE} operations`, details: { provided: operations.length, maximum: MAX_BULK_BATCH_SIZE } } };
    }

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]!;
      if (!isPathAllowed(op.path)) {
        return { success: false, error: { code: "VALIDATION_ERROR", message: `Operation at index ${i}: path "${op.path}" is not allowed in bulk operations. Only data module paths are permitted.`, details: { index: i, path: op.path, allowedPrefixes: [...ALLOWED_BULK_PATH_PREFIXES] } } };
      }
      if (op.method === "DELETE" && op.body && Object.keys(op.body).length > 0) {
        return { success: false, error: { code: "VALIDATION_ERROR", message: `Operation at index ${i}: DELETE operations must not include a request body`, details: { index: i, method: op.method } } };
      }
      if ((op.method === "POST" || op.method === "PUT" || op.method === "PATCH") && !op.body) {
        return { success: false, error: { code: "VALIDATION_ERROR", message: `Operation at index ${i}: ${op.method} operations must include a request body`, details: { index: i, method: op.method } } };
      }
    }

    try {
      const results = await this.repository.executeGenericOperations(ctx, operations, appFetch, authHeaders);
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      return { success: true, data: { total: results.length, succeeded, failed, results } };
    } catch (error) {
      console.error("Generic bulk operations failed:", error);
      return { success: false, error: { code: "INTERNAL_ERROR", message: "Bulk operations execution failed" } };
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Find duplicate values in an array, returning the values that appear more than once.
 */
function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) {
      duplicates.add(v);
    }
    seen.add(v);
  }
  return [...duplicates];
}


function isPathAllowed(path: string): boolean {
  if (path.includes("..") || path.includes("//")) {
    return false;
  }
  const normalised = path.endsWith("/") ? path.slice(0, -1) : path;
  return ALLOWED_BULK_PATH_PREFIXES.some(
    (prefix) => normalised === prefix || normalised.startsWith(prefix + "/")
  );
}
