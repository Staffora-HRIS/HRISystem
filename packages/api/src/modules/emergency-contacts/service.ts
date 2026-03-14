/**
 * Emergency Contacts Module - Service Layer
 *
 * Implements business logic for emergency contact operations.
 * Enforces invariants (single primary per employee, employee existence)
 * and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  EmergencyContactRepository,
  EmergencyContactRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateEmergencyContact,
  UpdateEmergencyContact,
  EmergencyContactResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "hr.emergency_contact.created"
  | "hr.emergency_contact.updated"
  | "hr.emergency_contact.deleted";

// =============================================================================
// Emergency Contact Service
// =============================================================================

export class EmergencyContactService {
  constructor(
    private repository: EmergencyContactRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Domain Event Emission
  // ---------------------------------------------------------------------------

  /**
   * Emit domain event to outbox (same transaction as business write)
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map database row to API response shape
   */
  private mapToResponse(row: EmergencyContactRow): EmergencyContactResponse {
    return {
      id: row.id,
      employeeId: row.employeeId,
      contactName: row.contactName,
      relationship: row.relationship,
      phonePrimary: row.phonePrimary,
      phoneSecondary: row.phoneSecondary,
      email: row.email,
      address: row.address,
      isPrimary: row.isPrimary,
      priority: row.priority,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Verify that the employee exists.
   * Returns success=false if not found.
   */
  private async verifyEmployeeExists(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<void>> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ id: string }[]>`
        SELECT id FROM employees WHERE id = ${employeeId}::uuid
      `;
    });

    if (rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
          details: { employeeId },
        },
      };
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  /**
   * List emergency contacts for an employee
   */
  async listByEmployee(
    context: TenantContext,
    employeeId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EmergencyContactResponse>> {
    // Verify employee exists
    const check = await this.verifyEmployeeExists(context, employeeId);
    if (!check.success) {
      // Return empty list rather than error for non-existent employee
      // (the route handler will get a 404 from employee lookup if needed)
      return { items: [], nextCursor: null, hasMore: false };
    }

    const result = await this.repository.listByEmployee(
      context,
      employeeId,
      pagination
    );

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Get
  // ---------------------------------------------------------------------------

  /**
   * Get a single emergency contact by ID
   */
  async getById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EmergencyContactResponse>> {
    const row = await this.repository.findById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Emergency contact with ID '${id}' not found`,
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create an emergency contact for an employee.
   *
   * Business rules:
   * - Employee must exist.
   * - If is_primary=true, unset primary flag on all other contacts for this employee.
   * - If this is the first contact for the employee, recommend setting as primary
   *   (logged but not enforced — the caller may know what they are doing).
   */
  async create(
    context: TenantContext,
    employeeId: string,
    data: CreateEmergencyContact,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EmergencyContactResponse>> {
    // Verify employee exists
    const check = await this.verifyEmployeeExists(context, employeeId);
    if (!check.success) {
      return {
        success: false,
        error: check.error,
      };
    }

    // Create inside a transaction so outbox + primary-flag management are atomic
    const contact = await this.db.withTransaction(context, async (tx) => {
      // If the new contact is marked as primary, unset existing primary contacts
      if (data.is_primary) {
        await this.repository.unsetPrimaryForEmployee(tx, context, employeeId);
      }

      // If this is the first contact and is_primary is not explicitly set, make it primary
      const existingCount = await this.repository.countByEmployee(context, employeeId);
      const effectiveData = { ...data };
      if (existingCount === 0 && effectiveData.is_primary === undefined) {
        effectiveData.is_primary = true;
      }

      // Create the contact
      const row = await this.repository.create(tx, context, employeeId, effectiveData);

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "emergency_contact",
        row.id,
        "hr.emergency_contact.created",
        { emergencyContact: this.mapToResponse(row), employeeId }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(contact),
    };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update an emergency contact.
   *
   * Business rules:
   * - Contact must exist.
   * - If is_primary is being set to true, unset all other primaries for that employee.
   */
  async update(
    context: TenantContext,
    id: string,
    data: UpdateEmergencyContact,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EmergencyContactResponse>> {
    // Verify contact exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Emergency contact with ID '${id}' not found`,
          details: { id },
        },
      };
    }

    const updated = await this.db.withTransaction(context, async (tx) => {
      // If setting this contact as primary, unset others first
      if (data.is_primary === true && !existing.isPrimary) {
        await this.repository.unsetPrimaryForEmployee(
          tx,
          context,
          existing.employeeId,
          id
        );
      }

      // Update the contact
      const row = await this.repository.update(tx, context, id, data);

      if (!row) {
        throw new Error(`Emergency contact '${id}' disappeared during update`);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "emergency_contact",
        row.id,
        "hr.emergency_contact.updated",
        {
          emergencyContact: this.mapToResponse(row),
          employeeId: row.employeeId,
          changes: data,
        }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(updated),
    };
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Delete an emergency contact.
   *
   * If the deleted contact was the primary and other contacts remain,
   * the caller should be aware that no primary is set (we do not
   * auto-promote another contact to avoid surprising behaviour).
   */
  async delete(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Verify contact exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Emergency contact with ID '${id}' not found`,
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      const deleted = await this.repository.delete(tx, context, id);

      if (!deleted) {
        throw new Error(`Emergency contact '${id}' disappeared during delete`);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "emergency_contact",
        id,
        "hr.emergency_contact.deleted",
        {
          emergencyContact: this.mapToResponse(existing),
          employeeId: existing.employeeId,
        }
      );
    });

    return { success: true };
  }
}
