/**
 * Right to Work Module - Service Layer
 *
 * Implements business logic for UK Right to Work verification.
 * Enforces check type rules, follow-up scheduling, and status transitions.
 * Emits domain events via the outbox pattern.
 *
 * Key UK RTW rules enforced:
 * - List A documents (manual_list_a): unlimited right to work, no follow-up needed
 * - List B documents (manual_list_b): time-limited, follow-up 28 days before expiry
 * - Online share code: time-limited, follow-up based on expiry
 * - IDVT: British/Irish passport only, no follow-up needed
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  RTWRepository,
  RTWCheckRow,
  RTWCheckListRow,
  RTWDocumentRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateRTWCheck,
  UpdateRTWCheck,
  CreateRTWDocument,
  RTWCheckFilters,
  PaginationQuery,
  RTWCheckResponse,
  RTWCheckListItem,
  RTWDocumentResponse,
  EmployeeRTWStatusResponse,
  ComplianceDashboardResponse,
  VerifyCheck,
  FailCheck,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * Number of days before document expiry to schedule follow-up check.
 * UK guidance: employers should conduct follow-up checks before the
 * employee's permission to work expires.
 */
const FOLLOW_UP_DAYS_BEFORE_EXPIRY = 28;

/**
 * Valid status transitions for RTW checks
 */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["verified", "failed"],
  verified: ["expired", "follow_up_required"],
  follow_up_required: ["verified", "expired"],
  expired: [], // terminal state
  failed: [], // terminal state
};

/**
 * Domain event types
 */
type DomainEventType =
  | "rtw.check.created"
  | "rtw.check.verified"
  | "rtw.check.failed"
  | "rtw.check.expired"
  | "rtw.check.follow_up_due"
  | "rtw.check.updated"
  | "rtw.document.uploaded"
  | "rtw.document.deleted";

// =============================================================================
// RTW Service
// =============================================================================

export class RTWService {
  constructor(
    private repository: RTWRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Check CRUD
  // ===========================================================================

  /**
   * Create a new RTW check.
   *
   * Automatically calculates follow-up date for time-limited check types:
   * - manual_list_b: 28 days before document_expiry_date
   * - online_share_code: 28 days before document_expiry_date
   * - manual_list_a / idvt: no follow-up (permanent right to work)
   */
  async createCheck(
    context: TenantContext,
    data: CreateRTWCheck,
    _idempotencyKey?: string
  ): Promise<ServiceResult<RTWCheckResponse>> {
    // Validate employee exists
    const employeeExists = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx`
        SELECT id FROM app.employees WHERE id = ${data.employee_id}::uuid
      `;
      return rows.length > 0;
    });

    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: data.employee_id },
        },
      };
    }

    // Validate share_code is provided for online checks
    if (data.check_type === "online_share_code" && !data.share_code) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Share code is required for online share code checks",
          details: { check_type: data.check_type },
        },
      };
    }

    // Validate expiry date is provided for time-limited check types
    if (
      (data.check_type === "manual_list_b" || data.check_type === "online_share_code") &&
      !data.document_expiry_date
    ) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Document expiry date is required for time-limited right to work checks (List B / share code)",
          details: { check_type: data.check_type },
        },
      };
    }

    // Calculate follow-up date for time-limited checks
    const followUpDate = this.calculateFollowUpDate(data.check_type, data.document_expiry_date);

    // Create check in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const check = await this.repository.createCheck(tx, context, data, followUpDate);

      // Emit domain event
      await this.emitEvent(tx, context, "rtw_check", check.id, "rtw.check.created", {
        check: this.mapCheckToResponse(check),
        employeeId: data.employee_id,
        checkType: data.check_type,
      });

      return check;
    });

    return {
      success: true,
      data: this.mapCheckToResponse(result),
    };
  }

  /**
   * Get a single RTW check by ID
   */
  async getCheck(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<RTWCheckResponse>> {
    const check = await this.repository.findCheckById(context, id);

    if (!check) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapCheckToResponse(check),
    };
  }

  /**
   * List RTW checks with filters and pagination
   */
  async listChecks(
    context: TenantContext,
    filters: RTWCheckFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<RTWCheckListItem>> {
    const result = await this.repository.findChecks(context, filters, pagination);

    return {
      items: result.items.map(this.mapCheckListRowToItem),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Update RTW check details (cannot change status via this method)
   */
  async updateCheck(
    context: TenantContext,
    id: string,
    data: UpdateRTWCheck,
    _idempotencyKey?: string
  ): Promise<ServiceResult<RTWCheckResponse>> {
    const existing = await this.repository.findCheckById(context, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { id },
        },
      };
    }

    // Cannot update checks in terminal states
    if (existing.status === "expired" || existing.status === "failed") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot update a check in '${existing.status}' status`,
          details: { id, currentStatus: existing.status },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateCheck(tx, id, data);

      if (updated) {
        await this.emitEvent(tx, context, "rtw_check", id, "rtw.check.updated", {
          check: this.mapCheckToResponse(updated),
          changes: data,
        });
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found after update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapCheckToResponse(result),
    };
  }

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  /**
   * Mark a check as verified (right to work confirmed)
   */
  async verifyCheck(
    context: TenantContext,
    id: string,
    data: VerifyCheck = {},
    _idempotencyKey?: string
  ): Promise<ServiceResult<RTWCheckResponse>> {
    const existing = await this.repository.findCheckById(context, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { id },
        },
      };
    }

    // Validate transition
    const allowed = VALID_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes("verified")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${existing.status}' to 'verified'`,
          details: {
            id,
            currentStatus: existing.status,
            allowedTransitions: allowed,
          },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateCheckStatus(tx, id, "verified", {
        rightToWorkConfirmed: true,
        followUpCompleted: existing.status === "follow_up_required" ? true : undefined,
        notes: data.notes || null,
      });

      if (updated) {
        await this.emitEvent(tx, context, "rtw_check", id, "rtw.check.verified", {
          check: this.mapCheckToResponse(updated),
          employeeId: updated.employeeId,
          previousStatus: existing.status,
        });
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found after status update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapCheckToResponse(result),
    };
  }

  /**
   * Mark a check as failed (right to work NOT confirmed)
   */
  async failCheck(
    context: TenantContext,
    id: string,
    data: FailCheck,
    _idempotencyKey?: string
  ): Promise<ServiceResult<RTWCheckResponse>> {
    const existing = await this.repository.findCheckById(context, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { id },
        },
      };
    }

    // Only pending checks can be marked as failed
    const allowed = VALID_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes("failed")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${existing.status}' to 'failed'`,
          details: {
            id,
            currentStatus: existing.status,
            allowedTransitions: allowed,
          },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateCheckStatus(tx, id, "failed", {
        rightToWorkConfirmed: false,
        notes: data.reason,
      });

      if (updated) {
        await this.emitEvent(tx, context, "rtw_check", id, "rtw.check.failed", {
          check: this.mapCheckToResponse(updated),
          employeeId: updated.employeeId,
          reason: data.reason,
        });
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found after status update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapCheckToResponse(result),
    };
  }

  // ===========================================================================
  // Employee RTW Status
  // ===========================================================================

  /**
   * Get the current RTW status for an employee.
   * Returns the latest check and whether follow-up is required.
   */
  async getEmployeeRTWStatus(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeeRTWStatusResponse>> {
    // Verify employee exists
    const employeeExists = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx`
        SELECT id FROM app.employees WHERE id = ${employeeId}::uuid
      `;
      return rows.length > 0;
    });

    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: employeeId },
        },
      };
    }

    const checks = await this.repository.findChecksByEmployeeId(context, employeeId);
    const latestCheck = checks[0] || null;

    const hasValidCheck = latestCheck
      ? latestCheck.status === "verified" && latestCheck.rightToWorkConfirmed
      : false;

    const requiresFollowUp = latestCheck
      ? (latestCheck.status === "follow_up_required" ||
         (latestCheck.followUpDate !== null && !latestCheck.followUpCompleted))
      : false;

    const nextFollowUpDate = latestCheck?.followUpDate && !latestCheck.followUpCompleted
      ? this.formatDate(latestCheck.followUpDate)
      : null;

    return {
      success: true,
      data: {
        employee_id: employeeId,
        has_valid_check: hasValidCheck,
        latest_check: latestCheck ? this.mapCheckToResponse(latestCheck) : null,
        requires_follow_up: requiresFollowUp,
        next_follow_up_date: nextFollowUpDate,
        total_checks: checks.length,
      },
    };
  }

  // ===========================================================================
  // Compliance
  // ===========================================================================

  /**
   * Get expiring checks within a given number of days
   */
  async getExpiringChecks(
    context: TenantContext,
    daysAhead: number = 28
  ): Promise<RTWCheckListItem[]> {
    const checks = await this.repository.findExpiringChecks(context, daysAhead);
    return checks.map(this.mapCheckListRowToItem);
  }

  /**
   * Get pending follow-up checks
   */
  async getPendingFollowUps(
    context: TenantContext
  ): Promise<RTWCheckListItem[]> {
    const checks = await this.repository.findPendingFollowUps(context);
    return checks.map(this.mapCheckListRowToItem);
  }

  /**
   * Get tenant-wide compliance dashboard stats
   */
  async getComplianceDashboard(
    context: TenantContext
  ): Promise<ServiceResult<ComplianceDashboardResponse>> {
    const stats = await this.repository.getComplianceStats(context);

    const complianceRate = stats.totalEmployees > 0
      ? Math.round((stats.verifiedCount / stats.totalEmployees) * 10000) / 100
      : 0;

    return {
      success: true,
      data: {
        total_employees: stats.totalEmployees,
        verified_count: stats.verifiedCount,
        pending_count: stats.pendingCount,
        expired_count: stats.expiredCount,
        failed_count: stats.failedCount,
        follow_up_required_count: stats.followUpRequiredCount,
        no_check_count: stats.noCheckCount,
        expiring_soon_count: stats.expiringSoonCount,
        compliance_rate: complianceRate,
      },
    };
  }

  // ===========================================================================
  // Document Management
  // ===========================================================================

  /**
   * Upload a document reference for a check
   */
  async uploadDocument(
    context: TenantContext,
    checkId: string,
    data: CreateRTWDocument,
    _idempotencyKey?: string
  ): Promise<ServiceResult<RTWDocumentResponse>> {
    // Verify check exists
    const check = await this.repository.findCheckById(context, checkId);

    if (!check) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { checkId },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const doc = await this.repository.addDocument(tx, context, checkId, data);

      await this.emitEvent(tx, context, "rtw_document", doc.id, "rtw.document.uploaded", {
        document: this.mapDocumentToResponse(doc),
        checkId,
        employeeId: check.employeeId,
      });

      return doc;
    });

    return {
      success: true,
      data: this.mapDocumentToResponse(result),
    };
  }

  /**
   * Get all documents for a check
   */
  async getDocuments(
    context: TenantContext,
    checkId: string
  ): Promise<ServiceResult<RTWDocumentResponse[]>> {
    // Verify check exists
    const check = await this.repository.findCheckById(context, checkId);

    if (!check) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { checkId },
        },
      };
    }

    const documents = await this.repository.getDocuments(context, checkId);

    return {
      success: true,
      data: documents.map(this.mapDocumentToResponse),
    };
  }

  /**
   * Delete a document reference
   */
  async deleteDocument(
    context: TenantContext,
    checkId: string,
    documentId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<{ deleted: true }>> {
    // Verify check exists
    const check = await this.repository.findCheckById(context, checkId);

    if (!check) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "RTW check not found",
          details: { checkId },
        },
      };
    }

    // Verify document exists and belongs to the check
    const doc = await this.repository.findDocumentById(context, documentId);

    if (!doc || doc.rtwCheckId !== checkId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found for this check",
          details: { checkId, documentId },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteDocument(tx, documentId);

      await this.emitEvent(tx, context, "rtw_document", documentId, "rtw.document.deleted", {
        documentId,
        checkId,
        employeeId: check.employeeId,
      });
    });

    return {
      success: true,
      data: { deleted: true },
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Calculate follow-up date based on check type and document expiry.
   * List B and online share code checks need follow-up 28 days before expiry.
   * List A and IDVT checks have permanent right to work -- no follow-up needed.
   */
  private calculateFollowUpDate(
    checkType: string,
    documentExpiryDate?: string | null
  ): Date | null {
    // List A and IDVT = permanent right to work, no follow-up
    if (checkType === "manual_list_a" || checkType === "idvt") {
      return null;
    }

    // Time-limited checks need follow-up if expiry date provided
    if (documentExpiryDate) {
      const expiry = new Date(documentExpiryDate);
      const followUp = new Date(expiry);
      followUp.setDate(followUp.getDate() - FOLLOW_UP_DAYS_BEFORE_EXPIRY);

      // Only set follow-up if it's in the future
      if (followUp > new Date()) {
        return followUp;
      }
    }

    return null;
  }

  /**
   * Format Date to ISO date string (YYYY-MM-DD)
   */
  private formatDate(date: Date | string | null): string | null {
    if (!date) return null;
    if (typeof date === "string") return date;
    return date.toISOString().split("T")[0] || null;
  }

  /**
   * Format Date to ISO datetime string
   */
  private formatDateTime(date: Date | string | null): string | null {
    if (!date) return null;
    if (typeof date === "string") return date;
    return date.toISOString();
  }

  /**
   * Map database row to API response
   */
  private mapCheckToResponse = (row: RTWCheckRow): RTWCheckResponse => ({
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    check_type: row.checkType as RTWCheckResponse["check_type"],
    check_date: this.formatDate(row.checkDate) || "",
    checked_by_user_id: row.checkedByUserId,
    status: row.status as RTWCheckResponse["status"],
    document_type: row.documentType,
    document_reference: row.documentReference,
    document_expiry_date: this.formatDate(row.documentExpiryDate),
    share_code: row.shareCode,
    follow_up_date: this.formatDate(row.followUpDate),
    follow_up_completed: row.followUpCompleted,
    right_to_work_confirmed: row.rightToWorkConfirmed,
    restriction_details: row.restrictionDetails,
    notes: row.notes,
    created_at: this.formatDateTime(row.createdAt) || "",
    updated_at: this.formatDateTime(row.updatedAt) || "",
  });

  /**
   * Map list row to list item
   */
  private mapCheckListRowToItem = (row: RTWCheckListRow): RTWCheckListItem => ({
    id: row.id,
    employee_id: row.employeeId,
    employee_name: row.employeeName,
    employee_number: row.employeeNumber,
    check_type: row.checkType as RTWCheckListItem["check_type"],
    check_date: this.formatDate(row.checkDate) || "",
    status: row.status as RTWCheckListItem["status"],
    document_type: row.documentType,
    document_expiry_date: this.formatDate(row.documentExpiryDate),
    follow_up_date: this.formatDate(row.followUpDate),
    right_to_work_confirmed: row.rightToWorkConfirmed,
  });

  /**
   * Map document row to API response
   */
  private mapDocumentToResponse = (row: RTWDocumentRow): RTWDocumentResponse => ({
    id: row.id,
    tenant_id: row.tenantId,
    rtw_check_id: row.rtwCheckId,
    document_name: row.documentName,
    document_type: row.documentType,
    file_key: row.fileKey,
    file_size_bytes: row.fileSizeBytes ? Number(row.fileSizeBytes) : null,
    mime_type: row.mimeType,
    uploaded_by: row.uploadedBy,
    uploaded_at: this.formatDateTime(row.uploadedAt) || "",
  });
}
