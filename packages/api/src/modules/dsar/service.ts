/**
 * DSAR Module - Service Layer
 *
 * Implements business logic for DSAR (Data Subject Access Request) operations.
 * Enforces UK GDPR compliance rules:
 * - 30 calendar day response deadline (extendable by up to 60 days)
 * - Identity verification before data processing
 * - Full audit trail for accountability (Article 5(2))
 * - Outbox pattern for domain events
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DSARRepository,
  DsarRequestRow,
  DsarDataItemRow,
  DsarAuditLogRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateDsarRequest,
  ExtendDeadline,
  UpdateDataItem,
  DsarRequestFilters,
  PaginationQuery,
  DsarRequestResponse,
  DsarRequestDetailResponse,
  DsarDataItemResponse,
  DsarAuditLogEntry,
  DsarDashboard,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Valid DSAR status transitions (retained for reference and future validation use)
 */
const _VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  received: ["in_progress", "rejected"],
  in_progress: ["data_gathering", "rejected", "extended"],
  data_gathering: ["review", "rejected", "extended"],
  review: ["completed", "rejected", "extended"],
  extended: ["in_progress", "data_gathering", "review", "completed", "rejected"],
  completed: [],
  rejected: [],
};

/**
 * Domain event types for DSAR
 */
type DsarDomainEventType =
  | "dsar.request.created"
  | "dsar.request.identity_verified"
  | "dsar.request.data_gathered"
  | "dsar.request.data_redacted"
  | "dsar.request.extended"
  | "dsar.request.completed"
  | "dsar.request.rejected"
  | "dsar.request.status_changed";

/**
 * Known HRIS modules for data gathering.
 * Each entry maps a module name to the data categories that can be gathered.
 */
const MODULE_DATA_CATEGORIES: Record<string, string[]> = {
  hr: ["personal_details", "employment_history", "contracts", "compensation", "emergency_contacts"],
  absence: ["leave_requests", "leave_balances", "leave_entitlements"],
  time: ["time_entries", "schedules", "timesheets"],
  benefits: ["benefit_enrollments", "benefit_elections"],
  talent: ["performance_reviews", "goals", "competency_assessments"],
  lms: ["course_enrollments", "training_records", "certificates"],
  cases: ["case_records", "case_notes"],
  documents: ["uploaded_documents", "generated_documents"],
  onboarding: ["onboarding_tasks", "onboarding_documents"],
  recruitment: ["applications", "interview_records"],
};

// =============================================================================
// DSAR Service
// =============================================================================

export class DSARService {
  constructor(
    private repository: DSARRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox (in the same transaction as the business write)
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: DsarDomainEventType,
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
        'dsar_request',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Request Operations
  // ===========================================================================

  /**
   * List DSAR requests with filters and cursor-based pagination
   */
  async listRequests(
    context: TenantContext,
    filters: DsarRequestFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<DsarRequestResponse>> {
    const result = await this.repository.findRequests(context, filters, pagination);

    return {
      items: result.items.map(this.mapRequestToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single DSAR request by ID
   */
  async getRequest(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<DsarRequestResponse>> {
    const request = await this.repository.findRequestById(context, id);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapRequestToResponse(request),
    };
  }

  /**
   * Get a DSAR request with full detail (data items + audit log)
   */
  async getRequestDetail(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<DsarRequestDetailResponse>> {
    const request = await this.repository.findRequestById(context, id);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id },
        },
      };
    }

    const dataItems = await this.repository.findDataItemsByRequestId(context, id);
    const auditLog = await this.repository.findAuditLogByRequestId(context, id);

    const response: DsarRequestDetailResponse = {
      ...this.mapRequestToResponse(request),
      dataItems: dataItems.map(this.mapDataItemToResponse),
      auditLog: auditLog.map(this.mapAuditLogToResponse),
    };

    return {
      success: true,
      data: response,
    };
  }

  /**
   * Create a new DSAR request.
   *
   * Auto-calculates the 30-day deadline from the received date.
   * Writes the outbox event and audit log in the same transaction.
   */
  async createRequest(
    context: TenantContext,
    data: CreateDsarRequest
  ): Promise<ServiceResult<DsarRequestResponse>> {
    // Determine received date (default to today)
    const receivedDate = data.received_date || new Date().toISOString().split("T")[0]!;

    // Calculate 30-day deadline
    const received = new Date(receivedDate);
    const deadline = new Date(received);
    deadline.setDate(deadline.getDate() + 30);
    const deadlineDate = deadline.toISOString().split("T")[0]!;

    const responseFormat = data.response_format || "json";

    const result = await this.db.withTransaction(context, async (tx) => {
      // Create the DSAR request
      const request = await this.repository.createRequest(tx, context, {
        employeeId: data.employee_id,
        requestedByUserId: context.userId || data.employee_id,
        requestType: data.request_type,
        responseFormat,
        receivedDate,
        deadlineDate,
        notes: data.notes,
      });

      // Add audit log entry
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: request.id,
        action: "created",
        performedBy: context.userId || data.employee_id,
        details: {
          requestType: data.request_type,
          receivedDate,
          deadlineDate,
          responseFormat,
        },
      });

      // Emit domain event
      await this.emitEvent(tx, context, request.id, "dsar.request.created", {
        request: this.mapRequestToResponse(request),
      });

      return request;
    });

    return {
      success: true,
      data: this.mapRequestToResponse(result),
    };
  }

  /**
   * Verify the identity of the data subject.
   *
   * Identity verification is required before any personal data is processed or released.
   * Automatically transitions status from 'received' to 'in_progress'.
   */
  async verifyIdentity(
    context: TenantContext,
    requestId: string
  ): Promise<ServiceResult<DsarRequestResponse>> {
    const request = await this.repository.findRequestById(context, requestId);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    if (request.identityVerified) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Identity has already been verified for this request",
          details: { id: requestId },
        },
      };
    }

    if (request.status === "completed" || request.status === "rejected") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot verify identity on a ${request.status} request`,
          details: { id: requestId, currentStatus: request.status },
        },
      };
    }

    const today = new Date().toISOString().split("T")[0]!;

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.verifyIdentity(
        tx,
        requestId,
        context.userId || "system",
        today
      );

      if (!updated) {
        throw new Error("Failed to verify identity");
      }

      // Audit log
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: requestId,
        action: "identity_verified",
        performedBy: context.userId || "system",
        details: { verifiedDate: today },
      });

      // Domain event
      await this.emitEvent(tx, context, requestId, "dsar.request.identity_verified", {
        requestId,
        verifiedBy: context.userId,
        verifiedDate: today,
      });

      return updated;
    });

    return {
      success: true,
      data: this.mapRequestToResponse(result),
    };
  }

  /**
   * Gather data from a specific module for a DSAR request.
   *
   * Creates data item records for each data category within the module.
   * Identity must be verified before data gathering can begin.
   * Transitions status to 'data_gathering' if currently 'in_progress' or 'extended'.
   */
  async gatherModuleData(
    context: TenantContext,
    requestId: string,
    moduleName: string
  ): Promise<ServiceResult<DsarDataItemResponse[]>> {
    const request = await this.repository.findRequestById(context, requestId);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    // Must verify identity first
    if (!request.identityVerified) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "Identity must be verified before data gathering",
          details: { id: requestId },
        },
      };
    }

    // Must be in a valid status for data gathering
    const validStatuses = ["in_progress", "data_gathering", "extended"];
    if (!validStatuses.includes(request.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot gather data for a request in '${request.status}' status`,
          details: { id: requestId, currentStatus: request.status },
        },
      };
    }

    // Validate module name
    const categories = MODULE_DATA_CATEGORIES[moduleName];
    if (!categories) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Unknown module: ${moduleName}. Valid modules: ${Object.keys(MODULE_DATA_CATEGORIES).join(", ")}`,
          details: { moduleName },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const items: DsarDataItemRow[] = [];

      for (const category of categories) {
        const item = await this.repository.createDataItem(tx, context, {
          dsarRequestId: requestId,
          moduleName,
          dataCategory: category,
          status: "pending",
          gatheredBy: context.userId,
        });
        items.push(item);
      }

      // Transition to data_gathering if not already there
      if (request.status === "in_progress" || request.status === "extended") {
        await this.repository.updateRequestStatus(tx, requestId, "data_gathering");
      }

      // Audit log
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: requestId,
        action: "data_gathered",
        performedBy: context.userId || "system",
        details: {
          moduleName,
          categories,
          itemCount: items.length,
        },
      });

      // Domain event
      await this.emitEvent(tx, context, requestId, "dsar.request.data_gathered", {
        requestId,
        moduleName,
        categories,
        itemCount: items.length,
      });

      return items;
    });

    return {
      success: true,
      data: result.map(this.mapDataItemToResponse),
    };
  }

  /**
   * Redact or exclude a data item with documented reason.
   *
   * GDPR allows redaction of third-party personal data from DSAR responses.
   */
  async updateDataItem(
    context: TenantContext,
    requestId: string,
    itemId: string,
    data: UpdateDataItem
  ): Promise<ServiceResult<DsarDataItemResponse>> {
    // Verify the request exists
    const request = await this.repository.findRequestById(context, requestId);
    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    // Verify the data item exists and belongs to this request
    const item = await this.repository.findDataItemById(context, itemId);
    if (!item) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data item not found",
          details: { itemId },
        },
      };
    }

    if (item.dsarRequestId !== requestId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Data item does not belong to this DSAR request",
          details: { itemId, dsarRequestId: requestId },
        },
      };
    }

    // Cannot modify items on completed/rejected requests
    if (request.status === "completed" || request.status === "rejected") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot modify data items on a ${request.status} request`,
          details: { currentStatus: request.status },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateDataItem(tx, itemId, {
        status: data.status,
        redactionNotes: data.redaction_notes,
      });

      if (!updated) {
        throw new Error("Failed to update data item");
      }

      // Audit log
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: requestId,
        action: data.status === "redacted" ? "data_redacted" : "data_excluded",
        performedBy: context.userId || "system",
        details: {
          itemId,
          moduleName: item.moduleName,
          dataCategory: item.dataCategory,
          newStatus: data.status,
          redactionNotes: data.redaction_notes,
        },
      });

      // Domain event
      await this.emitEvent(tx, context, requestId, "dsar.request.data_redacted", {
        requestId,
        itemId,
        moduleName: item.moduleName,
        dataCategory: item.dataCategory,
        newStatus: data.status,
      });

      return updated;
    });

    return {
      success: true,
      data: this.mapDataItemToResponse(result),
    };
  }

  /**
   * Extend the DSAR deadline by up to 60 additional days.
   *
   * UK GDPR Article 12(3): where requests are complex or numerous, the period
   * may be extended by a further two months. The data subject must be informed
   * within one month of receipt, with reasons for the delay.
   */
  async extendDeadline(
    context: TenantContext,
    requestId: string,
    data: ExtendDeadline
  ): Promise<ServiceResult<DsarRequestResponse>> {
    const request = await this.repository.findRequestById(context, requestId);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    // Cannot extend completed or rejected requests
    if (request.status === "completed" || request.status === "rejected") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot extend deadline for a ${request.status} request`,
          details: { currentStatus: request.status },
        },
      };
    }

    // Cannot extend already-extended requests again (the spec allows max +60 from original deadline)
    if (request.extendedDeadlineDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Deadline has already been extended for this request",
          details: {
            id: requestId,
            currentExtendedDeadline: request.extendedDeadlineDate,
          },
        },
      };
    }

    // Calculate extended deadline (default: +60 days from original deadline)
    const extendDays = data.extended_days || 60;
    const originalDeadline = new Date(request.deadlineDate);
    const extendedDeadline = new Date(originalDeadline);
    extendedDeadline.setDate(extendedDeadline.getDate() + extendDays);

    // Verify we don't exceed 90 days from received date (30 original + 60 extension)
    const receivedDate = new Date(request.receivedDate);
    const maxDeadline = new Date(receivedDate);
    maxDeadline.setDate(maxDeadline.getDate() + 90);

    if (extendedDeadline > maxDeadline) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Extended deadline cannot exceed 90 days from received date",
          details: {
            receivedDate: request.receivedDate,
            maxDeadline: maxDeadline.toISOString().split("T")[0],
            requestedDeadline: extendedDeadline.toISOString().split("T")[0],
          },
        },
      };
    }

    const extendedDeadlineDate = extendedDeadline.toISOString().split("T")[0]!;

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateRequestStatus(tx, requestId, "extended", {
        extendedDeadlineDate,
        extensionReason: data.reason,
      });

      if (!updated) {
        throw new Error("Failed to extend deadline");
      }

      // Audit log
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: requestId,
        action: "extended",
        performedBy: context.userId || "system",
        details: {
          originalDeadline: request.deadlineDate,
          extendedDeadlineDate,
          extensionDays: extendDays,
          reason: data.reason,
        },
      });

      // Domain event
      await this.emitEvent(tx, context, requestId, "dsar.request.extended", {
        requestId,
        originalDeadline: request.deadlineDate,
        extendedDeadlineDate,
        extensionDays: extendDays,
        reason: data.reason,
      });

      return updated;
    });

    return {
      success: true,
      data: this.mapRequestToResponse(result),
    };
  }

  /**
   * Complete a DSAR request.
   *
   * All data items should be in a terminal state (gathered, redacted, or excluded).
   */
  async completeRequest(
    context: TenantContext,
    requestId: string,
    notes?: string
  ): Promise<ServiceResult<DsarRequestResponse>> {
    const request = await this.repository.findRequestById(context, requestId);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    // Validate status transition
    const validFromStatuses = ["data_gathering", "review", "extended"];
    if (!validFromStatuses.includes(request.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot complete a request in '${request.status}' status. Must be in data_gathering, review, or extended.`,
          details: { currentStatus: request.status },
        },
      };
    }

    // Check all data items are in a terminal state
    const dataItems = await this.repository.findDataItemsByRequestId(context, requestId);
    const pendingItems = dataItems.filter((item) => item.status === "pending");

    if (pendingItems.length > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Cannot complete request: ${pendingItems.length} data item(s) still pending`,
          details: {
            pendingItems: pendingItems.map((i) => ({
              id: i.id,
              moduleName: i.moduleName,
              dataCategory: i.dataCategory,
            })),
          },
        },
      };
    }

    const today = new Date().toISOString().split("T")[0]!;

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateRequestStatus(tx, requestId, "completed", {
        completedDate: today,
        notes,
      });

      if (!updated) {
        throw new Error("Failed to complete request");
      }

      // Audit log
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: requestId,
        action: "completed",
        performedBy: context.userId || "system",
        details: {
          completedDate: today,
          totalDataItems: dataItems.length,
          gatheredCount: dataItems.filter((i) => i.status === "gathered").length,
          redactedCount: dataItems.filter((i) => i.status === "redacted").length,
          excludedCount: dataItems.filter((i) => i.status === "excluded").length,
        },
      });

      // Domain event
      await this.emitEvent(tx, context, requestId, "dsar.request.completed", {
        requestId,
        completedDate: today,
        responseFormat: request.responseFormat,
      });

      return updated;
    });

    return {
      success: true,
      data: this.mapRequestToResponse(result),
    };
  }

  /**
   * Reject a DSAR request with documented reason.
   *
   * UK GDPR Article 12(5): requests that are manifestly unfounded or excessive
   * may be refused, but the controller must demonstrate this.
   */
  async rejectRequest(
    context: TenantContext,
    requestId: string,
    reason: string
  ): Promise<ServiceResult<DsarRequestResponse>> {
    const request = await this.repository.findRequestById(context, requestId);

    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    // Cannot reject already completed or rejected requests
    if (request.status === "completed" || request.status === "rejected") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot reject a ${request.status} request`,
          details: { currentStatus: request.status },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateRequestStatus(tx, requestId, "rejected", {
        rejectionReason: reason,
      });

      if (!updated) {
        throw new Error("Failed to reject request");
      }

      // Audit log
      await this.repository.addAuditEntry(tx, context, {
        dsarRequestId: requestId,
        action: "rejected",
        performedBy: context.userId || "system",
        details: {
          reason,
          previousStatus: request.status,
        },
      });

      // Domain event
      await this.emitEvent(tx, context, requestId, "dsar.request.rejected", {
        requestId,
        reason,
        previousStatus: request.status,
      });

      return updated;
    });

    return {
      success: true,
      data: this.mapRequestToResponse(result),
    };
  }

  /**
   * Get overdue DSAR requests
   */
  async getOverdueRequests(
    context: TenantContext
  ): Promise<ServiceResult<DsarRequestResponse[]>> {
    const requests = await this.repository.findOverdueRequests(context);

    return {
      success: true,
      data: requests.map(this.mapRequestToResponse),
    };
  }

  /**
   * Get audit log for a DSAR request
   */
  async getAuditLog(
    context: TenantContext,
    requestId: string
  ): Promise<ServiceResult<DsarAuditLogEntry[]>> {
    // Verify request exists
    const request = await this.repository.findRequestById(context, requestId);
    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DSAR request not found",
          details: { id: requestId },
        },
      };
    }

    const entries = await this.repository.findAuditLogByRequestId(context, requestId);

    return {
      success: true,
      data: entries.map(this.mapAuditLogToResponse),
    };
  }

  /**
   * Get DSAR dashboard statistics
   */
  async getDashboard(
    context: TenantContext
  ): Promise<ServiceResult<DsarDashboard>> {
    const stats = await this.repository.getDashboardStats(context);

    return {
      success: true,
      data: stats,
    };
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  /**
   * Map a database row to a DSAR request response
   */
  private mapRequestToResponse = (row: DsarRequestRow): DsarRequestResponse => {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      requestedByUserId: row.requestedByUserId,
      requestType: row.requestType as DsarRequestResponse["requestType"],
      status: row.status as DsarRequestResponse["status"],
      receivedDate: row.receivedDate instanceof Date
        ? row.receivedDate.toISOString().split("T")[0]!
        : String(row.receivedDate),
      deadlineDate: row.deadlineDate instanceof Date
        ? row.deadlineDate.toISOString().split("T")[0]!
        : String(row.deadlineDate),
      extendedDeadlineDate: row.extendedDeadlineDate
        ? (row.extendedDeadlineDate instanceof Date
            ? row.extendedDeadlineDate.toISOString().split("T")[0]!
            : String(row.extendedDeadlineDate))
        : null,
      extensionReason: row.extensionReason || null,
      completedDate: row.completedDate
        ? (row.completedDate instanceof Date
            ? row.completedDate.toISOString().split("T")[0]!
            : String(row.completedDate))
        : null,
      responseFormat: row.responseFormat as DsarRequestResponse["responseFormat"],
      identityVerified: row.identityVerified,
      identityVerifiedDate: row.identityVerifiedDate
        ? (row.identityVerifiedDate instanceof Date
            ? row.identityVerifiedDate.toISOString().split("T")[0]!
            : String(row.identityVerifiedDate))
        : null,
      identityVerifiedBy: row.identityVerifiedBy || null,
      rejectionReason: row.rejectionReason || null,
      notes: row.notes || null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  };

  /**
   * Map a database row to a DSAR data item response
   */
  private mapDataItemToResponse = (row: DsarDataItemRow): DsarDataItemResponse => {
    return {
      id: row.id,
      dsarRequestId: row.dsarRequestId,
      moduleName: row.moduleName,
      dataCategory: row.dataCategory,
      status: row.status as DsarDataItemResponse["status"],
      recordCount: Number(row.recordCount),
      dataExport: row.dataExport || null,
      redactionNotes: row.redactionNotes || null,
      gatheredBy: row.gatheredBy || null,
      gatheredAt: row.gatheredAt
        ? (row.gatheredAt instanceof Date ? row.gatheredAt.toISOString() : String(row.gatheredAt))
        : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  };

  /**
   * Map a database row to a DSAR audit log entry response
   */
  private mapAuditLogToResponse = (row: DsarAuditLogRow): DsarAuditLogEntry => {
    return {
      id: row.id,
      dsarRequestId: row.dsarRequestId,
      action: row.action,
      performedBy: row.performedBy,
      details: (row.details as Record<string, unknown>) || null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  };
}
