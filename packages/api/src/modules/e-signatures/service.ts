/**
 * E-Signatures Module - Service Layer
 *
 * Implements business logic for e-signature request management.
 * Supports:
 * - Internal "I agree" signatures with timestamp + IP logging
 * - External provider placeholders (DocuSign, HelloSign) for future integration
 * - State machine enforcement for signature lifecycle
 * - Outbox pattern for domain events
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ESignaturesRepository,
  SignatureRequestRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateSignatureRequest,
  SignatureRequestFilters,
  SignatureRequestResponse,
  SignatureEventResponse,
  SignatureStatus,
} from "./schemas";

// =============================================================================
// State Machine: Valid Transitions
// =============================================================================

/**
 * Allowed signature request status transitions.
 *
 * pending   -> sent, cancelled                  (request created, not yet delivered)
 * sent      -> viewed, signed, declined,        (delivered to signer)
 *              expired, cancelled, voided
 * viewed    -> signed, declined, expired,       (signer opened the document)
 *              cancelled, voided
 * signed    -> (terminal)
 * declined  -> (terminal)
 * expired   -> (terminal)
 * cancelled -> (terminal)
 * voided    -> (terminal)
 *
 * For internal provider, pending -> signed is also allowed (direct "I agree").
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  pending:   new Set(["sent", "signed", "cancelled"]),
  sent:      new Set(["viewed", "signed", "declined", "expired", "cancelled", "voided"]),
  viewed:    new Set(["signed", "declined", "expired", "cancelled", "voided"]),
  signed:    new Set(),
  declined:  new Set(),
  expired:   new Set(),
  cancelled: new Set(),
  voided:    new Set(),
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.has(to) ?? false;
}

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "esignatures.request.created"
  | "esignatures.request.sent"
  | "esignatures.request.viewed"
  | "esignatures.request.signed"
  | "esignatures.request.declined"
  | "esignatures.request.cancelled"
  | "esignatures.request.voided"
  | "esignatures.request.expired"
  | "esignatures.request.reminder_sent";

// =============================================================================
// Service
// =============================================================================

export class ESignaturesService {
  constructor(
    private repository: ESignaturesRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
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
        'signature_request',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  async listSignatureRequests(
    context: TenantContext,
    filters: SignatureRequestFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedServiceResult<SignatureRequestResponse>> {
    const result = await this.repository.findSignatureRequests(
      context,
      filters,
      pagination
    );

    return {
      items: result.items.map(this.mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getSignatureRequest(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    const row = await this.repository.findSignatureRequestById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  async getSignatureEvents(
    context: TenantContext,
    signatureRequestId: string
  ): Promise<ServiceResult<SignatureEventResponse[]>> {
    // Verify the request exists
    const row = await this.repository.findSignatureRequestById(
      context,
      signatureRequestId
    );
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found",
          details: { signatureRequestId },
        },
      };
    }

    const events = await this.repository.findEventsByRequestId(
      context,
      signatureRequestId
    );

    return {
      success: true,
      data: events.map(this.mapEventToResponse),
    };
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  async createSignatureRequest(
    context: TenantContext,
    data: CreateSignatureRequest
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      // Verify the document exists within this tenant
      const docs = await tx<{ id: string }[]>`
        SELECT id FROM app.documents
        WHERE id = ${data.document_id}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND deleted_at IS NULL
      `;

      if (docs.length === 0) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Document not found",
            details: { document_id: data.document_id },
          },
        };
      }

      // If signer_employee_id provided, verify the employee exists
      if (data.signer_employee_id) {
        const emps = await tx<{ id: string }[]>`
          SELECT id FROM app.employees
          WHERE id = ${data.signer_employee_id}::uuid
            AND tenant_id = ${context.tenantId}::uuid
        `;
        if (emps.length === 0) {
          return {
            success: false as const,
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: "Signer employee not found",
              details: { signer_employee_id: data.signer_employee_id },
            },
          };
        }
      }

      const row = await this.repository.createSignatureRequest(tx, context, data);

      // Record the initial event
      await this.repository.insertEvent(tx, context, {
        signatureRequestId: row.id,
        fromStatus: null,
        toStatus: "pending",
        actorId: context.userId ?? null,
        actorIp: null,
      });

      // Outbox event
      await this.emitEvent(tx, context, row.id, "esignatures.request.created", {
        signatureRequestId: row.id,
        documentId: data.document_id,
        signerEmail: data.signer_email,
        provider: data.provider ?? "internal",
      });

      return { success: true as const, data: row };
    });

    if (!result.success) {
      return result as ServiceResult<SignatureRequestResponse>;
    }

    return {
      success: true,
      data: this.mapToResponse(result.data!),
    };
  }

  // ===========================================================================
  // Send (mark as sent — for external providers or manual dispatch)
  // ===========================================================================

  async sendSignatureRequest(
    context: TenantContext,
    id: string,
    providerReference?: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    return this.transitionStatus(context, id, "sent", {
      sentAt: new Date(),
      ...(providerReference ? { providerReference } : {}),
    }, "esignatures.request.sent");
  }

  // ===========================================================================
  // Mark as Viewed
  // ===========================================================================

  async markViewed(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    return this.transitionStatus(context, id, "viewed", {
      viewedAt: new Date(),
    }, "esignatures.request.viewed");
  }

  // ===========================================================================
  // Internal Sign ("I agree")
  // ===========================================================================

  async signInternal(
    context: TenantContext,
    id: string,
    ip: string | null,
    userAgent: string | null
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    const existing = await this.repository.findSignatureRequestById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found",
          details: { id },
        },
      };
    }

    if (existing.provider !== "internal") {
      return {
        success: false,
        error: {
          code: "INVALID_PROVIDER",
          message: "This signature request uses an external provider. Internal signing is not available.",
          details: { provider: existing.provider },
        },
      };
    }

    return this.transitionStatus(context, id, "signed", {
      signedAt: new Date(),
      signatureIp: ip,
      signatureUserAgent: userAgent,
    }, "esignatures.request.signed");
  }

  // ===========================================================================
  // Decline
  // ===========================================================================

  async declineSignature(
    context: TenantContext,
    id: string,
    reason?: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    return this.transitionStatus(context, id, "declined", {
      declinedAt: new Date(),
      declineReason: reason ?? null,
    }, "esignatures.request.declined");
  }

  // ===========================================================================
  // Cancel
  // ===========================================================================

  async cancelSignatureRequest(
    context: TenantContext,
    id: string,
    reason?: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    return this.transitionStatus(context, id, "cancelled", {}, "esignatures.request.cancelled", {
      reason,
    });
  }

  // ===========================================================================
  // Void (admin-level cancellation after signing/sending)
  // ===========================================================================

  async voidSignatureRequest(
    context: TenantContext,
    id: string,
    reason?: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    return this.transitionStatus(context, id, "voided", {}, "esignatures.request.voided", {
      reason,
    });
  }

  // ===========================================================================
  // Send Reminder
  // ===========================================================================

  async sendReminder(
    context: TenantContext,
    id: string,
    message?: string
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    const existing = await this.repository.findSignatureRequestById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found",
          details: { id },
        },
      };
    }

    // Can only send reminders for active (non-terminal) requests
    const activeStatuses = new Set(["pending", "sent", "viewed"]);
    if (!activeStatuses.has(existing.status)) {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot send reminder for a signature request in '${existing.status}' status`,
          details: { currentStatus: existing.status },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      await this.repository.incrementReminderCount(tx, context, id);

      await this.emitEvent(tx, context, id, "esignatures.request.reminder_sent", {
        signatureRequestId: id,
        reminderCount: existing.reminderCount + 1,
        message,
      });

      return await this.repository.findSignatureRequestById(context, id);
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found after update",
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(result),
    };
  }

  // ===========================================================================
  // State Transition Helper
  // ===========================================================================

  private async transitionStatus(
    context: TenantContext,
    id: string,
    toStatus: SignatureStatus,
    extraFields: Record<string, unknown>,
    eventType: DomainEventType,
    eventMetadata?: Record<string, unknown>
  ): Promise<ServiceResult<SignatureRequestResponse>> {
    const existing = await this.repository.findSignatureRequestById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found",
          details: { id },
        },
      };
    }

    if (!isValidTransition(existing.status, toStatus)) {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot transition from '${existing.status}' to '${toStatus}'`,
          details: {
            currentStatus: existing.status,
            requestedStatus: toStatus,
            allowedTransitions: [...(VALID_TRANSITIONS[existing.status] ?? [])],
          },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateSignatureRequestStatus(
        tx,
        context,
        id,
        toStatus,
        extraFields
      );

      if (!updated) {
        return null;
      }

      // Record the transition event
      await this.repository.insertEvent(tx, context, {
        signatureRequestId: id,
        fromStatus: existing.status,
        toStatus,
        actorId: context.userId ?? null,
        actorIp: (extraFields.signatureIp as string) ?? null,
        metadata: eventMetadata,
      });

      // Outbox event
      await this.emitEvent(tx, context, id, eventType, {
        signatureRequestId: id,
        fromStatus: existing.status,
        toStatus,
        ...eventMetadata,
      });

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Signature request not found during update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(result),
    };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapToResponse(row: SignatureRequestRow): SignatureRequestResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      document_id: row.documentId,
      signer_employee_id: row.signerEmployeeId,
      signer_employee_name: row.signerEmployeeName ?? undefined,
      signer_email: row.signerEmail,
      provider: row.provider,
      provider_reference: row.providerReference,
      status: row.status,
      message: row.message,
      signature_statement: row.signatureStatement,
      sent_at: row.sentAt?.toISOString() ?? null,
      viewed_at: row.viewedAt?.toISOString() ?? null,
      signed_at: row.signedAt?.toISOString() ?? null,
      declined_at: row.declinedAt?.toISOString() ?? null,
      expires_at: row.expiresAt?.toISOString() ?? null,
      signed_document_url: row.signedDocumentUrl,
      decline_reason: row.declineReason,
      reminder_count: row.reminderCount,
      requested_by: row.requestedBy,
      requested_by_name: row.requestedByName ?? undefined,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private mapEventToResponse(row: {
    id: string;
    signatureRequestId: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): SignatureEventResponse {
    return {
      id: row.id,
      signature_request_id: row.signatureRequestId,
      from_status: row.fromStatus,
      to_status: row.toStatus,
      actor_id: row.actorId,
      metadata: row.metadata,
      created_at: row.createdAt.toISOString(),
    };
  }
}
