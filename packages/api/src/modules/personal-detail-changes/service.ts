/**
 * Personal Detail Changes Module - Service Layer
 *
 * Business logic for employee personal detail change requests (TODO-150).
 *
 * State machine:
 *   pending -> approved  (by manager/HR)
 *   pending -> rejected  (by manager/HR)
 *   pending -> cancelled (by employee)
 *
 * Non-sensitive fields skip pending -- created as approved and applied immediately.
 */

import type {
  PersonalDetailChangeRepository,
  PersonalDetailChangeRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import type { SubmitChangeRequest, ReviewChangeRequest } from "./schemas";
import { SENSITIVE_FIELDS, ALL_ALLOWED_FIELDS } from "./schemas";

// =============================================================================
// Service
// =============================================================================

export class PersonalDetailChangeService {
  constructor(private repository: PersonalDetailChangeRepository) {}

  // ===========================================================================
  // Employee self-service
  // ===========================================================================

  async submitChangeRequest(
    ctx: TenantContext,
    data: SubmitChangeRequest
  ): Promise<ServiceResult<PersonalDetailChangeRow>> {
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "No employee profile is linked to your account",
        },
      };
    }

    if (!ALL_ALLOWED_FIELDS.has(data.field_name)) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Field '${data.field_name}' is not a recognised personal detail field`,
          details: {
            field_name: data.field_name,
            allowed_fields: Array.from(ALL_ALLOWED_FIELDS),
          },
        },
      };
    }

    const isSensitive = SENSITIVE_FIELDS.has(data.field_name);
    const autoApproved = !isSensitive;

    const row = await this.repository.create(ctx, {
      employeeId: employee.id,
      fieldName: data.field_name,
      oldValue: data.old_value ?? null,
      newValue: data.new_value,
      autoApproved,
    });

    // If non-sensitive (auto-approved), apply the change immediately
    if (autoApproved) {
      await this.repository.applyFieldChange(
        ctx,
        employee.id,
        data.field_name,
        data.new_value
      );
    }

    return { success: true, data: row };
  }

  async listMyChangeRequests(
    ctx: TenantContext,
    filters: { status?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<ServiceResult<PaginatedServiceResult<PersonalDetailChangeRow>>> {
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "No employee profile is linked to your account",
        },
      };
    }

    const result = await this.repository.listByEmployee(
      ctx,
      employee.id,
      filters,
      pagination
    );

    return { success: true, data: result };
  }

  async cancelMyChangeRequest(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<PersonalDetailChangeRow>> {
    const employee = await this.repository.getEmployeeByUserId(ctx);
    if (!employee) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
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
          message: "Change request not found, not pending, or not owned by you",
        },
      };
    }

    return { success: true, data: row };
  }

  // ===========================================================================
  // Manager / HR review
  // ===========================================================================

  async listPendingForReview(
    ctx: TenantContext,
    filters: { employeeId?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<PaginatedServiceResult<PersonalDetailChangeRow>> {
    return this.repository.listPendingForReview(ctx, filters, pagination);
  }

  async getChangeRequest(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<PersonalDetailChangeRow>> {
    const row = await this.repository.findById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Change request not found" },
      };
    }

    return { success: true, data: row };
  }

  async reviewChangeRequest(
    ctx: TenantContext,
    id: string,
    review: ReviewChangeRequest
  ): Promise<ServiceResult<PersonalDetailChangeRow>> {
    if (!ctx.userId) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Authentication required to review change requests",
        },
      };
    }

    const row = await this.repository.review(ctx, id, {
      status: review.action === "approve" ? "approved" : "rejected",
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

    // If approved, apply the change to the employee record
    if (review.action === "approve") {
      await this.repository.applyFieldChange(
        ctx,
        row.employeeId,
        row.fieldName,
        row.newValue
      );
    }

    return { success: true, data: row };
  }

  async getPendingReviewCount(ctx: TenantContext): Promise<number> {
    return this.repository.countPendingForReview(ctx);
  }
}
