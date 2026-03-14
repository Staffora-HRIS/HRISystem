/**
 * Data Erasure Module - Service Layer
 *
 * Implements GDPR Article 17 (Right to Erasure) business logic.
 * Enforces the erasure request state machine, runs anonymization,
 * tracks per-table results, and emits domain events via the outbox pattern.
 *
 * State machine:
 *   received -> reviewing -> approved -> in_progress -> completed | partially_completed
 *   received -> rejected
 *   reviewing -> rejected
 *
 * Key invariants:
 *   - Approver must be different from the requester
 *   - Only approved requests can be executed
 *   - Anonymization runs in a single transaction with outbox event
 *   - Certificate generation is a placeholder (PDF worker integration point)
 *   - Audit log entries are written for every state change
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DataErasureRepository,
  ErasureRequestRow,
  ErasureItemRow,
  ErasureAuditLogRow,
} from "./repository";
import type {
  ServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  ErasureRequestStatus,
  ErasureRequestFilters,
  PaginationQuery,
  ErasureRequestResponse,
  ErasureRequestDetailResponse,
  ErasureItemResponse,
  ErasureAuditLogEntry,
  RetentionConflictsResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Valid state transitions for erasure requests
 */
const VALID_STATUS_TRANSITIONS: Record<
  ErasureRequestStatus,
  ErasureRequestStatus[]
> = {
  received: ["reviewing", "rejected"],
  reviewing: ["approved", "rejected"],
  approved: ["in_progress"],
  in_progress: ["completed", "partially_completed"],
  completed: [],
  rejected: [],
  partially_completed: [],
};

/**
 * Domain event types for erasure operations
 */
type ErasureDomainEventType =
  | "gdpr.erasure.requested"
  | "gdpr.erasure.approved"
  | "gdpr.erasure.rejected"
  | "gdpr.erasure.executed"
  | "gdpr.erasure.completed"
  | "gdpr.erasure.partially_completed"
  | "gdpr.erasure.certificate_requested";

/**
 * Tables that will be anonymized and their module associations
 */
const ANONYMIZABLE_TABLES = [
  { tableName: "employees", moduleName: "hr" },
  { tableName: "employee_personal", moduleName: "hr" },
  { tableName: "employee_contacts", moduleName: "hr" },
  { tableName: "employee_addresses", moduleName: "hr" },
  { tableName: "employee_identifiers", moduleName: "hr" },
] as const;

/**
 * Tables with statutory retention requirements
 */
const RETAINED_TABLES = [
  {
    tableName: "compensation_history",
    moduleName: "hr",
    reason:
      "Compensation records retained for tax/payroll statutory obligations (HMRC — 6-year minimum)",
  },
  {
    tableName: "audit_log",
    moduleName: "system",
    reason:
      "Audit logs retained for legal and compliance requirements — references anonymized data only",
  },
] as const;

// =============================================================================
// Service
// =============================================================================

export class DataErasureService {
  constructor(
    private repository: DataErasureRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox (same transaction)
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: ErasureDomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        'erasure_request',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Row Formatting
  // ===========================================================================

  /**
   * Format an erasure request row for API response
   */
  private formatRequest(row: ErasureRequestRow): ErasureRequestResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      requestedByUserId: row.requestedByUserId,
      status: row.status,
      receivedDate: row.receivedDate instanceof Date
        ? row.receivedDate.toISOString().split("T")[0]
        : String(row.receivedDate),
      deadlineDate: row.deadlineDate instanceof Date
        ? row.deadlineDate.toISOString().split("T")[0]
        : String(row.deadlineDate),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt
        ? row.approvedAt instanceof Date
          ? row.approvedAt.toISOString()
          : String(row.approvedAt)
        : null,
      completedAt: row.completedAt
        ? row.completedAt instanceof Date
          ? row.completedAt.toISOString()
          : String(row.completedAt)
        : null,
      rejectionReason: row.rejectionReason,
      notes: row.notes,
      certificateFileKey: row.certificateFileKey,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  /**
   * Format an erasure item row for API response
   */
  private formatItem(row: ErasureItemRow): ErasureItemResponse {
    return {
      id: row.id,
      erasureRequestId: row.erasureRequestId,
      tableName: row.tableName,
      moduleName: row.moduleName,
      recordCount: row.recordCount,
      actionTaken: row.actionTaken,
      retentionReason: row.retentionReason,
      completedAt: row.completedAt
        ? row.completedAt instanceof Date
          ? row.completedAt.toISOString()
          : String(row.completedAt)
        : null,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  /**
   * Format an audit log row for API response
   */
  private formatAuditLog(row: ErasureAuditLogRow): ErasureAuditLogEntry {
    return {
      id: row.id,
      erasureRequestId: row.erasureRequestId,
      action: row.action,
      performedBy: row.performedBy,
      details: row.details,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }

  // ===========================================================================
  // Create Request
  // ===========================================================================

  /**
   * Create a new erasure request.
   * Validates employee exists and no active request is pending.
   * Sets the GDPR 30-day deadline automatically.
   */
  async createRequest(
    ctx: TenantContext,
    data: {
      employeeId: string;
      receivedDate?: string;
      notes?: string;
    }
  ): Promise<ServiceResult<ErasureRequestResponse>> {
    // Validate employee exists
    const exists = await this.repository.employeeExists(ctx, data.employeeId);
    if (!exists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // Check for existing active request
      const hasActive = await this.repository.hasActiveRequest(
        tx,
        data.employeeId
      );
      if (hasActive) {
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message:
              "An active erasure request already exists for this employee. Complete or reject it before creating a new one.",
          },
        };
      }

      const requestId = crypto.randomUUID();
      const receivedDate = data.receivedDate || new Date().toISOString().split("T")[0];

      // Calculate 30-day deadline
      const receivedDateObj = new Date(receivedDate);
      receivedDateObj.setDate(receivedDateObj.getDate() + 30);
      const deadlineDate = receivedDateObj.toISOString().split("T")[0];

      const row = await this.repository.createRequest(tx, {
        id: requestId,
        tenantId: ctx.tenantId,
        employeeId: data.employeeId,
        requestedByUserId: ctx.userId!,
        receivedDate,
        deadlineDate,
        notes: data.notes,
      });

      // Write audit log
      await this.repository.writeAuditLog(tx, {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        erasureRequestId: requestId,
        action: "request_created",
        performedBy: ctx.userId!,
        details: {
          employeeId: data.employeeId,
          receivedDate,
          deadlineDate,
        },
      });

      // Emit domain event in same transaction
      await this.emitEvent(tx, ctx, requestId, "gdpr.erasure.requested", {
        requestId,
        employeeId: data.employeeId,
        receivedDate,
        deadlineDate,
      });

      return {
        success: true,
        data: this.formatRequest(row),
      };
    });
  }

  // ===========================================================================
  // Get Request
  // ===========================================================================

  /**
   * Get a single erasure request by ID
   */
  async getRequest(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<ErasureRequestResponse>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    return {
      success: true,
      data: this.formatRequest(row),
    };
  }

  /**
   * Get a single erasure request by ID with items and audit log
   */
  async getRequestDetail(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<ErasureRequestDetailResponse>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    const [items, auditLog] = await Promise.all([
      this.repository.getItemsByRequestId(ctx, requestId),
      this.repository.getAuditLog(ctx, requestId),
    ]);

    return {
      success: true,
      data: {
        ...this.formatRequest(row),
        items: items.map((item) => this.formatItem(item)),
        auditLog: auditLog.map((entry) => this.formatAuditLog(entry)),
      },
    };
  }

  // ===========================================================================
  // List Requests
  // ===========================================================================

  /**
   * List erasure requests with filtering and pagination
   */
  async listRequests(
    ctx: TenantContext,
    filters: ErasureRequestFilters,
    pagination: PaginationQuery
  ): Promise<{
    items: ErasureRequestResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const result = await this.repository.listRequests(
      ctx,
      filters,
      pagination
    );

    return {
      items: result.items.map((row) => this.formatRequest(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Approve Request
  // ===========================================================================

  /**
   * Approve an erasure request.
   * Requires a different user than the requester (four-eyes principle).
   */
  async approveRequest(
    ctx: TenantContext,
    requestId: string,
    notes?: string
  ): Promise<ServiceResult<ErasureRequestResponse>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    // Validate state transition
    const validTransitions = VALID_STATUS_TRANSITIONS[row.status];
    if (!validTransitions.includes("approved")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot approve request in status '${row.status}'. Valid transitions from '${row.status}': ${validTransitions.join(", ") || "none"}`,
        },
      };
    }

    // Four-eyes principle: approver must be different from requester
    if (ctx.userId === row.requestedByUserId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message:
            "The approver must be a different user than the requester (four-eyes principle)",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // If currently 'received', first transition to 'reviewing', then to 'approved'
      // (We allow direct received -> approved by going through reviewing internally)
      let currentStatus = row.status;
      if (currentStatus === "received") {
        await this.repository.updateRequestStatus(tx, requestId, "reviewing");
        await this.repository.writeAuditLog(tx, {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          erasureRequestId: requestId,
          action: "status_changed",
          performedBy: ctx.userId!,
          details: { from: "received", to: "reviewing" },
        });
        currentStatus = "reviewing";
      }

      const updated = await this.repository.updateRequestStatus(
        tx,
        requestId,
        "approved",
        {
          approvedBy: ctx.userId!,
          approvedAt: new Date(),
          notes,
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update erasure request",
          },
        };
      }

      // Write audit log
      await this.repository.writeAuditLog(tx, {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        erasureRequestId: requestId,
        action: "request_approved",
        performedBy: ctx.userId!,
        details: {
          from: currentStatus,
          to: "approved",
          notes,
        },
      });

      // Emit domain event
      await this.emitEvent(tx, ctx, requestId, "gdpr.erasure.approved", {
        requestId,
        employeeId: row.employeeId,
        approvedBy: ctx.userId,
      });

      return {
        success: true,
        data: this.formatRequest(updated),
      };
    });
  }

  // ===========================================================================
  // Reject Request
  // ===========================================================================

  /**
   * Reject an erasure request with a documented reason.
   */
  async rejectRequest(
    ctx: TenantContext,
    requestId: string,
    reason: string
  ): Promise<ServiceResult<ErasureRequestResponse>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    // Validate state transition
    const validTransitions = VALID_STATUS_TRANSITIONS[row.status];
    if (!validTransitions.includes("rejected")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot reject request in status '${row.status}'. Valid transitions from '${row.status}': ${validTransitions.join(", ") || "none"}`,
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateRequestStatus(
        tx,
        requestId,
        "rejected",
        {
          rejectionReason: reason,
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update erasure request",
          },
        };
      }

      // Write audit log
      await this.repository.writeAuditLog(tx, {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        erasureRequestId: requestId,
        action: "request_rejected",
        performedBy: ctx.userId!,
        details: {
          from: row.status,
          to: "rejected",
          reason,
        },
      });

      // Emit domain event
      await this.emitEvent(tx, ctx, requestId, "gdpr.erasure.rejected", {
        requestId,
        employeeId: row.employeeId,
        reason,
      });

      return {
        success: true,
        data: this.formatRequest(updated),
      };
    });
  }

  // ===========================================================================
  // Execute Erasure
  // ===========================================================================

  /**
   * Execute the erasure (anonymization) for an approved request.
   * Runs the database anonymization function, records per-table results,
   * and creates erasure_items for tracking. Also records retained tables.
   */
  async executeErasure(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<ErasureRequestDetailResponse>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    // Must be in 'approved' status
    if (row.status !== "approved") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot execute erasure for request in status '${row.status}'. Request must be approved first.`,
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // Transition to in_progress
      await this.repository.updateRequestStatus(tx, requestId, "in_progress");

      await this.repository.writeAuditLog(tx, {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        erasureRequestId: requestId,
        action: "execution_started",
        performedBy: ctx.userId!,
        details: { employeeId: row.employeeId },
      });

      // Execute the anonymization function
      const anonymizationResult = await this.repository.executeAnonymization(
        tx,
        ctx.tenantId,
        row.employeeId
      );

      // Record erasure items for each anonymized table
      const items: ErasureItemRow[] = [];
      const now = new Date();

      for (const table of ANONYMIZABLE_TABLES) {
        const count = anonymizationResult[table.tableName] ?? 0;
        const item = await this.repository.createItem(tx, {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          erasureRequestId: requestId,
          tableName: table.tableName,
          moduleName: table.moduleName,
          recordCount: count,
          actionTaken: count > 0 ? "anonymized" : "anonymized",
          completedAt: now,
        });
        items.push(item);
      }

      // Record retained tables
      for (const table of RETAINED_TABLES) {
        const item = await this.repository.createItem(tx, {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          erasureRequestId: requestId,
          tableName: table.tableName,
          moduleName: table.moduleName,
          recordCount: 0,
          actionTaken: "retained",
          retentionReason: table.reason,
          completedAt: now,
        });
        items.push(item);
      }

      // Check if any retained items indicate partial completion
      const hasRetained = items.some((i) => i.actionTaken === "retained");
      const finalStatus: ErasureRequestStatus = hasRetained
        ? "partially_completed"
        : "completed";

      // Update status
      const updated = await this.repository.updateRequestStatus(
        tx,
        requestId,
        finalStatus,
        {
          completedAt: now,
        }
      );

      // Write completion audit log
      await this.repository.writeAuditLog(tx, {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        erasureRequestId: requestId,
        action: `execution_${finalStatus}`,
        performedBy: ctx.userId!,
        details: {
          anonymizationResult,
          retainedTables: RETAINED_TABLES.map((t) => t.tableName),
          finalStatus,
        },
      });

      // Emit domain event
      const eventType: ErasureDomainEventType =
        finalStatus === "completed"
          ? "gdpr.erasure.completed"
          : "gdpr.erasure.partially_completed";

      await this.emitEvent(tx, ctx, requestId, eventType, {
        requestId,
        employeeId: row.employeeId,
        anonymizationResult,
        finalStatus,
      });

      // Emit PDF certificate generation event so the PDF worker
      // can produce the erasure certificate asynchronously
      await this.emitEvent(
        tx,
        ctx,
        requestId,
        "gdpr.erasure.certificate_requested",
        {
          requestId,
          employeeId: row.employeeId,
          completedAt: new Date().toISOString(),
          tablesAnonymised: items.map((i) => i.tableName),
        }
      );

      // Get the full audit log for the response
      const auditLog = await tx<ErasureAuditLogRow[]>`
        SELECT
          id, tenant_id, erasure_request_id,
          action, performed_by, details,
          created_at
        FROM erasure_audit_log
        WHERE erasure_request_id = ${requestId}::uuid
        ORDER BY created_at ASC
      `;

      return {
        success: true,
        data: {
          ...this.formatRequest(updated!),
          items: items.map((item) => this.formatItem(item)),
          auditLog: auditLog.map((entry) => this.formatAuditLog(entry)),
        },
      };
    });
  }

  // ===========================================================================
  // Complete Request (with certificate)
  // ===========================================================================

  /**
   * Complete an erasure request by attaching the certificate reference.
   * This is called after the erasure has been executed and a certificate generated.
   * If the request is already completed/partially_completed, this just
   * updates the certificate key.
   */
  async completeRequest(
    ctx: TenantContext,
    requestId: string,
    certificateFileKey?: string
  ): Promise<ServiceResult<ErasureRequestResponse>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    // Must be completed or partially_completed
    if (
      row.status !== "completed" &&
      row.status !== "partially_completed" &&
      row.status !== "in_progress"
    ) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot finalize request in status '${row.status}'. Must be completed, partially_completed, or in_progress.`,
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateRequestStatus(
        tx,
        requestId,
        row.status === "in_progress" ? "completed" : row.status,
        {
          certificateFileKey: certificateFileKey || undefined,
          completedAt: row.completedAt ? undefined : new Date(),
        }
      );

      await this.repository.writeAuditLog(tx, {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        erasureRequestId: requestId,
        action: "certificate_attached",
        performedBy: ctx.userId!,
        details: {
          certificateFileKey,
        },
      });

      return {
        success: true,
        data: this.formatRequest(updated!),
      };
    });
  }

  // ===========================================================================
  // Generate Erasure Certificate
  // ===========================================================================

  /**
   * Generate an erasure certificate as proof of data deletion.
   * Returns a certificate data structure. Actual PDF generation
   * would be handled by the PDF worker.
   */
  async generateErasureCertificate(
    ctx: TenantContext,
    requestId: string
  ): Promise<
    ServiceResult<{
      requestId: string;
      employeeId: string;
      issuedAt: string;
      issuedBy: string;
      tablesProcessed: Array<{
        tableName: string;
        action: string;
        recordCount: number;
        retentionReason: string | null;
      }>;
      statement: string;
    }>
  > {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    if (
      row.status !== "completed" &&
      row.status !== "partially_completed"
    ) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message:
            "Certificate can only be generated for completed or partially completed requests",
        },
      };
    }

    const items = await this.repository.getItemsByRequestId(ctx, requestId);

    const tablesProcessed = items.map((item) => ({
      tableName: item.tableName,
      action: item.actionTaken,
      recordCount: item.recordCount,
      retentionReason: item.retentionReason,
    }));

    const statement =
      row.status === "completed"
        ? "All personal data for the data subject has been anonymized in accordance with GDPR Article 17 (Right to Erasure). No personally identifiable information remains in active data stores."
        : "Personal data for the data subject has been partially anonymized in accordance with GDPR Article 17. Some data has been retained due to statutory obligations as detailed below. Retained data will be erased upon expiry of the applicable retention period.";

    return {
      success: true,
      data: {
        requestId: row.id,
        employeeId: row.employeeId,
        issuedAt: new Date().toISOString(),
        issuedBy: ctx.userId!,
        tablesProcessed,
        statement,
      },
    };
  }

  // ===========================================================================
  // Retention Conflicts
  // ===========================================================================

  /**
   * Check what data cannot be fully erased for an employee
   * due to statutory retention requirements.
   */
  async getRetentionConflicts(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<RetentionConflictsResponse>> {
    const exists = await this.repository.employeeExists(ctx, employeeId);
    if (!exists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
        },
      };
    }

    const conflicts = await this.repository.getRetentionConflicts(
      ctx,
      employeeId
    );

    return {
      success: true,
      data: {
        employeeId,
        conflicts: conflicts.map((c) => ({
          tableName: c.tableName,
          moduleName: c.moduleName,
          recordCount: c.recordCount,
          reason: c.reason,
        })),
        // Can always proceed — conflicts mean partial completion, not blocking
        canProceed: true,
      },
    };
  }

  // ===========================================================================
  // Overdue Requests
  // ===========================================================================

  /**
   * Get all overdue erasure requests (past the 30-day GDPR deadline)
   */
  async getOverdueRequests(
    ctx: TenantContext
  ): Promise<ServiceResult<{ items: ErasureRequestResponse[]; total: number }>> {
    const rows = await this.repository.getOverdueRequests(ctx);

    return {
      success: true,
      data: {
        items: rows.map((row) => this.formatRequest(row)),
        total: rows.length,
      },
    };
  }

  // ===========================================================================
  // Audit Log
  // ===========================================================================

  /**
   * Get the audit log for a specific erasure request
   */
  async getAuditLog(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<ErasureAuditLogEntry[]>> {
    const row = await this.repository.getRequestById(ctx, requestId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Erasure request not found",
        },
      };
    }

    const entries = await this.repository.getAuditLog(ctx, requestId);

    return {
      success: true,
      data: entries.map((entry) => this.formatAuditLog(entry)),
    };
  }
}
