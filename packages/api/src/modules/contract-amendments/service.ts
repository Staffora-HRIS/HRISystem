/**
 * Contract Amendments Module - Service Layer
 *
 * Implements business logic for contract amendment operations.
 * Enforces invariants (notification lead time, acknowledgement flow)
 * and emits domain events via the outbox pattern.
 *
 * Employment Rights Act 1996, s.4 requires employers to notify employees
 * of changes to terms and conditions no later than 1 month before the
 * change takes effect.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ContractAmendmentRepository,
  ContractAmendmentRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateContractAmendment,
  UpdateContractAmendment,
  ContractAmendmentFilters,
  PaginationQuery,
  ContractAmendmentResponse,
  AmendmentStatusTransition,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum notification lead time in days.
 * ERA 1996 s.4 requires at least 1 month (approximately 30 days).
 * The DB constraint enforces `notification_date <= effective_date - INTERVAL '1 month'`.
 * We validate at the service level as well for early feedback.
 */
const MIN_NOTIFICATION_LEAD_DAYS = 30;

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "hr.contract_amendment.created"
  | "hr.contract_amendment.updated"
  | "hr.contract_amendment.notification_sent"
  | "hr.contract_amendment.acknowledged";

// =============================================================================
// Service
// =============================================================================

export class ContractAmendmentService {
  constructor(
    private repository: ContractAmendmentRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction
   */
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
  // Mapping
  // ===========================================================================

  /**
   * Map a database row to the API response shape.
   * DB columns are camelCase (postgres.js transform); response uses snake_case.
   */
  private mapToResponse(row: ContractAmendmentRow): ContractAmendmentResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      contract_id: row.contractId,
      amendment_type: row.amendmentType,
      description: row.description,
      effective_date: row.effectiveDate instanceof Date
        ? row.effectiveDate.toISOString().split("T")[0]!
        : String(row.effectiveDate),
      notification_date: row.notificationDate instanceof Date
        ? row.notificationDate.toISOString().split("T")[0]!
        : String(row.notificationDate),
      notification_sent: row.notificationSent,
      acknowledged_by_employee: row.acknowledgedByEmployee,
      acknowledged_at: row.acknowledgedAt
        ? row.acknowledgedAt.toISOString()
        : null,
      created_by: row.createdBy,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  // ===========================================================================
  // Validation Helpers
  // ===========================================================================

  /**
   * Validate that notification_date is at least 1 month (30 days)
   * before effective_date. Returns an error result if invalid.
   */
  private validateNotificationLeadTime(
    notificationDate: string,
    effectiveDate: string
  ): ServiceResult<null> | null {
    const notification = new Date(notificationDate);
    const effective = new Date(effectiveDate);
    const diffMs = effective.getTime() - notification.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < MIN_NOTIFICATION_LEAD_DAYS) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Notification date must be at least ${MIN_NOTIFICATION_LEAD_DAYS} days before the effective date (Employment Rights Act 1996, s.4)`,
          details: {
            notification_date: notificationDate,
            effective_date: effectiveDate,
            days_gap: Math.floor(diffDays),
            required_gap: MIN_NOTIFICATION_LEAD_DAYS,
          },
        },
      };
    }

    return null; // valid
  }

  // ===========================================================================
  // List Amendments
  // ===========================================================================

  async listAmendments(
    context: TenantContext,
    filters: ContractAmendmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<ContractAmendmentResponse>> {
    const result = await this.repository.findAmendments(context, filters, pagination);

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get Amendment by ID
  // ===========================================================================

  async getAmendment(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<ContractAmendmentResponse>> {
    const row = await this.repository.findById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Contract amendment not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // Create Amendment
  // ===========================================================================

  async createAmendment(
    context: TenantContext,
    data: CreateContractAmendment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<ContractAmendmentResponse>> {
    // 1. Validate notification lead time
    const leadTimeError = this.validateNotificationLeadTime(
      data.notification_date,
      data.effective_date
    );
    if (leadTimeError) {
      return leadTimeError as ServiceResult<ContractAmendmentResponse>;
    }

    // 2. Validate employee exists
    const employeeExists = await this.repository.employeeExists(context, data.employee_id);
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

    // 3. Validate contract exists
    const contractExists = await this.repository.contractExists(context, data.contract_id);
    if (!contractExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employment contract not found",
          details: { contract_id: data.contract_id },
        },
      };
    }

    // 4. Create amendment + outbox in same transaction
    const row = await this.db.withTransaction(context, async (tx) => {
      const amendment = await this.repository.create(
        tx,
        context,
        data,
        context.userId || null
      );

      await this.emitEvent(
        tx,
        context,
        "contract_amendment",
        amendment.id,
        "hr.contract_amendment.created",
        { amendment: this.mapToResponse(amendment) }
      );

      return amendment;
    });

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // Update Amendment
  // ===========================================================================

  async updateAmendment(
    context: TenantContext,
    id: string,
    data: UpdateContractAmendment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<ContractAmendmentResponse>> {
    // 1. Check exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Contract amendment not found",
          details: { id },
        },
      };
    }

    // 2. Cannot update an acknowledged amendment
    if (existing.acknowledgedByEmployee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Cannot update an amendment that has already been acknowledged by the employee",
          details: { id, acknowledged_at: existing.acknowledgedAt?.toISOString() },
        },
      };
    }

    // 3. If dates are changing, re-validate lead time
    const effectiveDate = data.effective_date
      || (existing.effectiveDate instanceof Date
        ? existing.effectiveDate.toISOString().split("T")[0]!
        : String(existing.effectiveDate));
    const notificationDate = data.notification_date
      || (existing.notificationDate instanceof Date
        ? existing.notificationDate.toISOString().split("T")[0]!
        : String(existing.notificationDate));

    const leadTimeError = this.validateNotificationLeadTime(notificationDate, effectiveDate);
    if (leadTimeError) {
      return leadTimeError as ServiceResult<ContractAmendmentResponse>;
    }

    // 4. Update + outbox in same transaction
    const row = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.update(tx, id, data);

      await this.emitEvent(
        tx,
        context,
        "contract_amendment",
        updated.id,
        "hr.contract_amendment.updated",
        {
          amendment: this.mapToResponse(updated),
          previous: this.mapToResponse(existing),
        }
      );

      return updated;
    });

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // Status Transitions (send_notification / acknowledge)
  // ===========================================================================

  async transitionStatus(
    context: TenantContext,
    id: string,
    transition: AmendmentStatusTransition,
    _idempotencyKey?: string
  ): Promise<ServiceResult<ContractAmendmentResponse>> {
    // 1. Check exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Contract amendment not found",
          details: { id },
        },
      };
    }

    // 2. Dispatch on action
    if (transition.action === "send_notification") {
      return this.sendNotification(context, id, existing);
    }

    if (transition.action === "acknowledge") {
      return this.acknowledge(context, id, existing);
    }

    // Should not reach here due to TypeBox validation, but guard anyway
    return {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: `Unknown action: ${(transition as { action: string }).action}`,
      },
    };
  }

  // ===========================================================================
  // Send Notification
  // ===========================================================================

  private async sendNotification(
    context: TenantContext,
    id: string,
    existing: ContractAmendmentRow
  ): Promise<ServiceResult<ContractAmendmentResponse>> {
    if (existing.notificationSent) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Notification has already been sent for this amendment",
          details: { id },
        },
      };
    }

    const row = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.markNotificationSent(tx, id);

      await this.emitEvent(
        tx,
        context,
        "contract_amendment",
        updated.id,
        "hr.contract_amendment.notification_sent",
        { amendment: this.mapToResponse(updated) }
      );

      return updated;
    });

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // Acknowledge
  // ===========================================================================

  private async acknowledge(
    context: TenantContext,
    id: string,
    existing: ContractAmendmentRow
  ): Promise<ServiceResult<ContractAmendmentResponse>> {
    // Notification must have been sent before acknowledgement
    if (!existing.notificationSent) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Cannot acknowledge an amendment before the notification has been sent",
          details: { id },
        },
      };
    }

    if (existing.acknowledgedByEmployee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Amendment has already been acknowledged",
          details: { id, acknowledged_at: existing.acknowledgedAt?.toISOString() },
        },
      };
    }

    const row = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.markAcknowledged(tx, id);

      await this.emitEvent(
        tx,
        context,
        "contract_amendment",
        updated.id,
        "hr.contract_amendment.acknowledged",
        { amendment: this.mapToResponse(updated) }
      );

      return updated;
    });

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }
}
