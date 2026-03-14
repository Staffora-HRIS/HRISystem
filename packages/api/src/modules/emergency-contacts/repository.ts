/**
 * Emergency Contacts Module - Repository Layer
 *
 * Provides data access methods for emergency contact entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateEmergencyContact,
  UpdateEmergencyContact,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row type for emergency contacts
 */
export interface EmergencyContactRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  contactName: string;
  relationship: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  email: string | null;
  address: string | null;
  isPrimary: boolean;
  priority: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class EmergencyContactRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * List emergency contacts for an employee with cursor-based pagination
   */
  async listByEmployee(
    context: TenantContext,
    employeeId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EmergencyContactRow>> {
    const limit = pagination.limit ? Number(pagination.limit) : 50;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    const rows = await this.db.withTransaction(context, async (tx) => {
      if (pagination.cursor) {
        return await tx<EmergencyContactRow[]>`
          SELECT
            id, tenant_id, employee_id, contact_name, relationship,
            phone_primary, phone_secondary, email, address,
            is_primary, priority, notes, created_at, updated_at
          FROM emergency_contacts
          WHERE employee_id = ${employeeId}::uuid
            AND id > ${pagination.cursor}::uuid
          ORDER BY priority ASC, id ASC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx<EmergencyContactRow[]>`
        SELECT
          id, tenant_id, employee_id, contact_name, relationship,
          phone_primary, phone_secondary, email, address,
          is_primary, priority, notes, created_at, updated_at
        FROM emergency_contacts
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY priority ASC, id ASC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find emergency contact by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<EmergencyContactRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<EmergencyContactRow[]>`
        SELECT
          id, tenant_id, employee_id, contact_name, relationship,
          phone_primary, phone_secondary, email, address,
          is_primary, priority, notes, created_at, updated_at
        FROM emergency_contacts
        WHERE id = ${id}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  /**
   * Count emergency contacts for an employee
   */
  async countByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM emergency_contacts
        WHERE employee_id = ${employeeId}::uuid
      `;
    });

    return parseInt(rows[0]?.count ?? "0", 10);
  }

  // ---------------------------------------------------------------------------
  // Write Operations (require transaction handle)
  // ---------------------------------------------------------------------------

  /**
   * Create an emergency contact
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: CreateEmergencyContact
  ): Promise<EmergencyContactRow> {
    const rows = await tx<EmergencyContactRow[]>`
      INSERT INTO emergency_contacts (
        tenant_id, employee_id, contact_name, relationship,
        phone_primary, phone_secondary, email, address,
        is_primary, priority, notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.contact_name},
        ${data.relationship},
        ${data.phone_primary},
        ${data.phone_secondary ?? null},
        ${data.email ?? null},
        ${data.address ?? null},
        ${data.is_primary ?? false},
        ${data.priority ?? 1},
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, contact_name, relationship,
        phone_primary, phone_secondary, email, address,
        is_primary, priority, notes, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update an emergency contact
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateEmergencyContact
  ): Promise<EmergencyContactRow | null> {
    const rows = await tx<EmergencyContactRow[]>`
      UPDATE emergency_contacts
      SET
        contact_name    = COALESCE(${data.contact_name ?? null}, contact_name),
        relationship    = COALESCE(${data.relationship ?? null}, relationship),
        phone_primary   = COALESCE(${data.phone_primary ?? null}, phone_primary),
        phone_secondary = CASE WHEN ${data.phone_secondary !== undefined} THEN ${data.phone_secondary ?? null} ELSE phone_secondary END,
        email           = CASE WHEN ${data.email !== undefined} THEN ${data.email ?? null} ELSE email END,
        address         = CASE WHEN ${data.address !== undefined} THEN ${data.address ?? null} ELSE address END,
        is_primary      = COALESCE(${data.is_primary ?? null}, is_primary),
        priority        = COALESCE(${data.priority ?? null}, priority),
        notes           = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, contact_name, relationship,
        phone_primary, phone_secondary, email, address,
        is_primary, priority, notes, created_at, updated_at
    `;

    return rows[0] ?? null;
  }

  /**
   * Delete an emergency contact
   */
  async delete(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const rows = await tx<{ id: string }[]>`
      DELETE FROM emergency_contacts
      WHERE id = ${id}::uuid
      RETURNING id
    `;

    return rows.length > 0;
  }

  /**
   * Unset primary flag for all contacts of an employee.
   * Called within a transaction before setting a new primary contact.
   */
  async unsetPrimaryForEmployee(
    tx: TransactionSql,
    _context: TenantContext,
    employeeId: string,
    excludeId?: string
  ): Promise<void> {
    if (excludeId) {
      await tx`
        UPDATE emergency_contacts
        SET is_primary = false
        WHERE employee_id = ${employeeId}::uuid
          AND is_primary = true
          AND id != ${excludeId}::uuid
      `;
    } else {
      await tx`
        UPDATE emergency_contacts
        SET is_primary = false
        WHERE employee_id = ${employeeId}::uuid
          AND is_primary = true
      `;
    }
  }
}
