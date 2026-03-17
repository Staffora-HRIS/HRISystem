/**
 * Employee Change Requests Module - Service Layer
 *
 * Business logic for employee self-service change requests.
 * Determines which fields require approval vs direct update.
 * Coordinates with the HR repository for approved changes.
 */

import type { ChangeRequestRepository, ChangeRequestRow } from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import type { CreateChangeRequest, ReviewChangeRequest, ChangeRequestFilters } from "./schemas";

// =============================================================================
// Field sensitivity classification
// =============================================================================

/**
 * Fields that require manager/HR approval before being applied.
 * These are sensitive because they affect payroll, legal identity, etc.
 */
const SENSITIVE_FIELDS: Record<string, Set<string>> = {
  personal: new Set([
    "first_name",
    "last_name",
    "middle_name",
    "date_of_birth",
    "nationality",
    "ni_number",
  ]),
  bank_details: new Set([
    "account_holder_name",
    "sort_code",
    "account_number",
    "bank_name",
    "building_society_ref",
  ]),
};

/**
 * Fields that can be updated directly without approval.
 */
const NON_SENSITIVE_FIELDS: Record<string, Set<string>> = {
  personal: new Set([
    "preferred_name",
    "marital_status",
    "gender",
  ]),
  contact: new Set([
    "phone",
    "mobile",
    "personal_email",
  ]),
  address: new Set([
    "address_line_1",
    "address_line_2",
    "city",
    "county",
    "postcode",
    "country",
  ]),
  emergency_contact: new Set([
    "name",
    "relationship",
    "phone",
    "email",
  ]),
};

/**
 * Determine whether a field change requires approval
 */
function requiresApproval(fieldCategory: string, fieldName: string): boolean {
  const sensitiveSet = SENSITIVE_FIELDS[fieldCategory];
  if (sensitiveSet?.has(fieldName)) {
    return true;
  }

  const nonSensitiveSet = NON_SENSITIVE_FIELDS[fieldCategory];
  if (nonSensitiveSet?.has(fieldName)) {
    return false;
  }

  // Default to requiring approval for unknown fields (safety first)
  return true;
}

/**
 * Validate that the field category and name are recognized
 */
function isValidField(fieldCategory: string, fieldName: string): boolean {
  const sensitiveSet = SENSITIVE_FIELDS[fieldCategory];
  const nonSensitiveSet = NON_SENSITIVE_FIELDS[fieldCategory];

  if (sensitiveSet?.has(fieldName)) return true;
  if (nonSensitiveSet?.has(fieldName)) return true;

  return false;
}

// =============================================================================
// Service
// =============================================================================

export class ChangeRequestService {
  constructor(private repository: ChangeRequestRepository) {}

  // ===========================================================================
  // Employee self-service operations
  // ===========================================================================

  /**
   * Submit a single change request from the employee portal
   */
  async submitChangeRequest(
    ctx: TenantContext,
    data: CreateChangeRequest
  ): Promise<ServiceResult<ChangeRequestRow>> {
    // Validate employee exists for this user
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "EMPLOYEE_NOT_FOUND",
          message: "No employee profile is linked to your account",
        },
      };
    }

    // Validate field
    if (!isValidField(data.field_category, data.field_name)) {
      return {
        success: false,
        error: {
          code: "INVALID_FIELD",
          message: `Field '${data.field_name}' is not a recognised field in category '${data.field_category}'`,
        },
      };
    }

    const needsApproval = requiresApproval(data.field_category, data.field_name);

    const row = await this.repository.create(ctx, {
      employeeId: employee.id,
      fieldCategory: data.field_category,
      fieldName: data.field_name,
      oldValue: data.old_value ?? null,
      newValue: data.new_value,
      requiresApproval: needsApproval,
    });

    return { success: true, data: row };
  }

  /**
   * Submit multiple change requests at once (e.g., full name change)
   */
  async submitBulkChangeRequests(
    ctx: TenantContext,
    changes: CreateChangeRequest[]
  ): Promise<ServiceResult<ChangeRequestRow[]>> {
    // Validate employee exists for this user
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "EMPLOYEE_NOT_FOUND",
          message: "No employee profile is linked to your account",
        },
      };
    }

    // Validate all fields first
    for (const change of changes) {
      if (!isValidField(change.field_category, change.field_name)) {
        return {
          success: false,
          error: {
            code: "INVALID_FIELD",
            message: `Field '${change.field_name}' is not a recognised field in category '${change.field_category}'`,
          },
        };
      }
    }

    const results: ChangeRequestRow[] = [];

    for (const change of changes) {
      const needsApproval = requiresApproval(change.field_category, change.field_name);

      const row = await this.repository.create(ctx, {
        employeeId: employee.id,
        fieldCategory: change.field_category,
        fieldName: change.field_name,
        oldValue: change.old_value ?? null,
        newValue: change.new_value,
        requiresApproval: needsApproval,
      });

      results.push(row);
    }

    return { success: true, data: results };
  }

  /**
   * List change requests for the current employee
   */
  async listMyChangeRequests(
    ctx: TenantContext,
    filters: { status?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<ServiceResult<PaginatedServiceResult<ChangeRequestRow>>> {
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "EMPLOYEE_NOT_FOUND",
          message: "No employee profile is linked to your account",
        },
      };
    }

    const result = await this.repository.listByEmployee(ctx, employee.id, filters, pagination);

    return { success: true, data: result };
  }

  /**
   * Cancel a pending change request (employee can only cancel their own)
   */
  async cancelMyChangeRequest(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<ChangeRequestRow>> {
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "EMPLOYEE_NOT_FOUND",
          message: "No employee profile is linked to your account",
        },
      };
    }

    const row = await this.repository.cancel(ctx, requestId, employee.id);
    if (!row) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Change request not found or cannot be cancelled",
        },
      };
    }

    return { success: true, data: row };
  }

  /**
   * Get count of pending change requests for the current employee
   */
  async getMyPendingCount(ctx: TenantContext): Promise<ServiceResult<number>> {
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return { success: true, data: 0 };
    }

    const count = await this.repository.countPendingByEmployee(ctx, employee.id);
    return { success: true, data: count };
  }

  // ===========================================================================
  // Manager/HR review operations
  // ===========================================================================

  /**
   * List pending change requests for review (HR/Manager)
   */
  async listPendingForReview(
    ctx: TenantContext,
    filters: { employeeId?: string; fieldCategory?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<PaginatedServiceResult<ChangeRequestRow>> {
    return this.repository.listPendingForReview(ctx, filters, pagination);
  }

  /**
   * Get a single change request by ID (HR/Manager)
   */
  async getChangeRequest(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ChangeRequestRow>> {
    const row = await this.repository.findById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Change request not found",
        },
      };
    }

    return { success: true, data: row };
  }

  /**
   * Review (approve or reject) a change request
   */
  async reviewChangeRequest(
    ctx: TenantContext,
    id: string,
    review: ReviewChangeRequest
  ): Promise<ServiceResult<ChangeRequestRow>> {
    if (!ctx.userId) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "You must be authenticated to review change requests",
        },
      };
    }

    const row = await this.repository.review(ctx, id, {
      status: review.status,
      reviewerId: ctx.userId,
      reviewerNotes: review.reviewer_notes,
    });

    if (!row) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Change request not found or already reviewed",
        },
      };
    }

    return { success: true, data: row };
  }

  /**
   * Get count of pending change requests for review
   */
  async getPendingReviewCount(ctx: TenantContext): Promise<number> {
    return this.repository.countPendingForReview(ctx);
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  /**
   * Check if a field requires approval (public for frontend use)
   */
  getFieldSensitivity(fieldCategory: string, fieldName: string): {
    valid: boolean;
    requiresApproval: boolean;
  } {
    const valid = isValidField(fieldCategory, fieldName);
    return {
      valid,
      requiresApproval: valid ? requiresApproval(fieldCategory, fieldName) : true,
    };
  }
}
