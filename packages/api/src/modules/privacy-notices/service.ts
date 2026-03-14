/**
 * Privacy Notices Module - Service Layer
 *
 * Implements business logic for UK GDPR privacy notice management.
 * Enforces notice versioning, deactivation of previous versions,
 * and emits domain events via the outbox pattern.
 *
 * UK GDPR compliance:
 * - Privacy notices must be versioned so employees know which version they acknowledged
 * - Creating a new notice auto-deactivates previous current notices
 * - Outstanding acknowledgements are tracked per active employee
 * - Compliance summary provides audit-ready reporting
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  PrivacyNoticeRepository,
  PrivacyNoticeRow,
  AcknowledgementRow,
  OutstandingRow,
  NoticeComplianceRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreatePrivacyNotice,
  UpdatePrivacyNotice,
  PrivacyNoticeFilters,
  PrivacyNoticeResponse,
  AcknowledgementResponse,
  OutstandingAcknowledgement,
  ComplianceSummaryResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Domain event types for privacy notices module
 */
type PrivacyNoticeDomainEventType =
  | "privacy_notice.created"
  | "privacy_notice.updated"
  | "privacy_notice.deactivated"
  | "privacy_notice.acknowledged";

// =============================================================================
// Privacy Notice Service
// =============================================================================

export class PrivacyNoticeService {
  constructor(
    private repository: PrivacyNoticeRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox (same transaction as business write)
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: PrivacyNoticeDomainEventType,
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
  // Response Mapping
  // ===========================================================================

  /**
   * Map a privacy notice row to API response format
   */
  private mapNoticeToResponse(row: PrivacyNoticeRow): PrivacyNoticeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      title: row.title,
      version: row.version,
      content: row.content,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]!
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]!
          : String(row.effectiveTo)
        : null,
      is_current: row.isCurrent,
      created_by: row.createdBy,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  /**
   * Map an acknowledgement row to API response format
   */
  private mapAcknowledgementToResponse(row: AcknowledgementRow): AcknowledgementResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      privacy_notice_id: row.privacyNoticeId,
      employee_id: row.employeeId,
      acknowledged_at: row.acknowledgedAt instanceof Date
        ? row.acknowledgedAt.toISOString()
        : String(row.acknowledgedAt),
      ip_address: row.ipAddress,
      user_agent: row.userAgent,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  /**
   * Map an outstanding row to API response format
   */
  private mapOutstandingToResponse(row: OutstandingRow): OutstandingAcknowledgement {
    return {
      employee_id: row.employeeId,
      employee_number: row.employeeNumber,
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
      privacy_notice_id: row.privacyNoticeId,
      privacy_notice_title: row.privacyNoticeTitle,
      privacy_notice_version: row.privacyNoticeVersion,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]!
        : String(row.effectiveFrom),
    };
  }

  // ===========================================================================
  // Privacy Notice Operations
  // ===========================================================================

  /**
   * Create a new privacy notice.
   * Automatically deactivates all previous current notices and
   * auto-increments the version based on the title.
   */
  async createNotice(
    ctx: TenantContext,
    data: CreatePrivacyNotice
  ): Promise<ServiceResult<PrivacyNoticeResponse>> {
    try {
      const result = await this.db.withTransaction(ctx, async (tx) => {
        // Determine the next version number for this title
        const maxVersion = await this.repository.getMaxVersion(tx, data.title);
        const nextVersion = maxVersion + 1;

        // Deactivate all current notices
        await this.repository.deactivateCurrentNotices(tx);

        // Create the new notice
        const row = await this.repository.create(tx, ctx, data, nextVersion);

        // Emit domain event
        await this.emitEvent(
          tx,
          ctx,
          "privacy_notice",
          row.id,
          "privacy_notice.created",
          {
            notice: { id: row.id, title: row.title, version: nextVersion },
          }
        );

        return row;
      });

      return {
        success: true,
        data: this.mapNoticeToResponse(result),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to create privacy notice",
        },
      };
    }
  }

  /**
   * List privacy notices with optional filters
   */
  async listNotices(
    ctx: TenantContext,
    filters: PrivacyNoticeFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<PrivacyNoticeResponse>> {
    const result = await this.repository.findNotices(ctx, filters, pagination);

    return {
      items: result.items.map((row) => this.mapNoticeToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a privacy notice by ID
   */
  async getNotice(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<PrivacyNoticeResponse>> {
    const row = await this.repository.findById(ctx, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Privacy notice not found",
        },
      };
    }

    return {
      success: true,
      data: this.mapNoticeToResponse(row),
    };
  }

  /**
   * Update a privacy notice
   */
  async updateNotice(
    ctx: TenantContext,
    id: string,
    data: UpdatePrivacyNotice
  ): Promise<ServiceResult<PrivacyNoticeResponse>> {
    // Verify notice exists
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Privacy notice not found",
        },
      };
    }

    try {
      const result = await this.db.withTransaction(ctx, async (tx) => {
        const updated = await this.repository.update(tx, id, data);

        if (!updated) {
          throw new Error("Failed to update privacy notice");
        }

        // Emit domain event
        await this.emitEvent(
          tx,
          ctx,
          "privacy_notice",
          id,
          "privacy_notice.updated",
          {
            notice: { id, title: updated.title, version: updated.version },
            changes: data,
          }
        );

        return updated;
      });

      return {
        success: true,
        data: this.mapNoticeToResponse(result),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to update privacy notice",
        },
      };
    }
  }

  // ===========================================================================
  // Acknowledgement Operations
  // ===========================================================================

  /**
   * Acknowledge a privacy notice for an employee.
   * Returns CONFLICT if already acknowledged.
   */
  async acknowledgeNotice(
    ctx: TenantContext,
    noticeId: string,
    employeeId: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<ServiceResult<AcknowledgementResponse>> {
    // Verify notice exists
    const notice = await this.repository.findById(ctx, noticeId);
    if (!notice) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Privacy notice not found",
        },
      };
    }

    // Check if already acknowledged
    const existingAck = await this.repository.findAcknowledgement(ctx, noticeId, employeeId);
    if (existingAck) {
      return {
        success: false,
        error: {
          code: "ALREADY_ACKNOWLEDGED",
          message: "Employee has already acknowledged this privacy notice",
          details: {
            acknowledged_at: existingAck.acknowledgedAt instanceof Date
              ? existingAck.acknowledgedAt.toISOString()
              : String(existingAck.acknowledgedAt),
          },
        },
      };
    }

    try {
      const result = await this.db.withTransaction(ctx, async (tx) => {
        const ack = await this.repository.createAcknowledgement(
          tx, ctx, noticeId, employeeId, ipAddress, userAgent
        );

        // Emit domain event
        await this.emitEvent(
          tx,
          ctx,
          "privacy_notice",
          noticeId,
          "privacy_notice.acknowledged",
          {
            noticeId,
            employeeId,
            noticeTitle: notice.title,
            noticeVersion: notice.version,
          }
        );

        return ack;
      });

      return {
        success: true,
        data: this.mapAcknowledgementToResponse(result),
      };
    } catch (error) {
      // Handle unique constraint violation gracefully
      if (error instanceof Error && error.message.includes("unique")) {
        return {
          success: false,
          error: {
            code: "ALREADY_ACKNOWLEDGED",
            message: "Employee has already acknowledged this privacy notice",
          },
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record acknowledgement",
        },
      };
    }
  }

  /**
   * Get outstanding acknowledgements - active employees who have not
   * acknowledged the current privacy notice(s)
   */
  async getOutstanding(
    ctx: TenantContext
  ): Promise<ServiceResult<OutstandingAcknowledgement[]>> {
    try {
      const rows = await this.repository.findOutstanding(ctx);

      return {
        success: true,
        data: rows.map((row) => this.mapOutstandingToResponse(row)),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to get outstanding acknowledgements",
        },
      };
    }
  }

  /**
   * Get compliance summary across all current privacy notices
   */
  async getComplianceSummary(
    ctx: TenantContext
  ): Promise<ServiceResult<ComplianceSummaryResponse>> {
    try {
      const { notices, totalActiveEmployees } = await this.repository.getComplianceStats(ctx);

      // Calculate per-notice compliance rates
      const noticeStats = notices.map((n: NoticeComplianceRow) => ({
        notice_id: n.noticeId,
        title: n.title,
        version: n.version,
        effective_from: n.effectiveFrom instanceof Date
          ? n.effectiveFrom.toISOString().split("T")[0]!
          : String(n.effectiveFrom),
        acknowledged_count: n.acknowledgedCount,
        outstanding_count: n.outstandingCount,
        compliance_rate: totalActiveEmployees > 0
          ? Math.round((n.acknowledgedCount / totalActiveEmployees) * 10000) / 100
          : 0,
      }));

      // Calculate overall totals
      const totalAcknowledged = noticeStats.reduce((sum, n) => sum + n.acknowledged_count, 0);
      const totalOutstanding = noticeStats.reduce((sum, n) => sum + n.outstanding_count, 0);
      const totalExpected = notices.length * totalActiveEmployees;

      const overallComplianceRate = totalExpected > 0
        ? Math.round((totalAcknowledged / totalExpected) * 10000) / 100
        : 0;

      return {
        success: true,
        data: {
          total_current_notices: notices.length,
          total_active_employees: totalActiveEmployees,
          total_acknowledged: totalAcknowledged,
          total_outstanding: totalOutstanding,
          compliance_rate: overallComplianceRate,
          notices: noticeStats,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to get compliance summary",
        },
      };
    }
  }
}
