/**
 * Contract Amendments Module - Repository Layer
 *
 * Provides data access methods for contract amendment records.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateContractAmendment,
  UpdateContractAmendment,
  ContractAmendmentFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for contract_amendments table.
 * Property names are camelCase (postgres.js toCamel transform).
 */
export interface ContractAmendmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  contractId: string;
  amendmentType: string;
  description: string;
  effectiveDate: Date;
  notificationDate: Date;
  notificationSent: boolean;
  acknowledgedByEmployee: boolean;
  acknowledgedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ContractAmendmentRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Find contract amendments with filters and cursor-based pagination
   */
  async findAmendments(
    context: TenantContext,
    filters: ContractAmendmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<ContractAmendmentRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ContractAmendmentRow[]>`
        SELECT
          id, tenant_id, employee_id, contract_id,
          amendment_type, description,
          effective_date, notification_date,
          notification_sent, acknowledged_by_employee, acknowledged_at,
          created_by, created_at, updated_at
        FROM app.contract_amendments
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.contract_id ? tx`AND contract_id = ${filters.contract_id}::uuid` : tx``}
          ${filters.amendment_type ? tx`AND amendment_type = ${filters.amendment_type}` : tx``}
          ${filters.notification_sent !== undefined ? tx`AND notification_sent = ${filters.notification_sent}` : tx``}
          ${filters.acknowledged !== undefined ? tx`AND acknowledged_by_employee = ${filters.acknowledged}` : tx``}
          ${filters.effective_date_from ? tx`AND effective_date >= ${filters.effective_date_from}::date` : tx``}
          ${filters.effective_date_to ? tx`AND effective_date <= ${filters.effective_date_to}::date` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a single contract amendment by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<ContractAmendmentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ContractAmendmentRow[]>`
        SELECT
          id, tenant_id, employee_id, contract_id,
          amendment_type, description,
          effective_date, notification_date,
          notification_sent, acknowledged_by_employee, acknowledged_at,
          created_by, created_at, updated_at
        FROM app.contract_amendments
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  // ===========================================================================
  // Write Operations (accept tx for outbox atomicity)
  // ===========================================================================

  /**
   * Create a contract amendment record.
   * Called within a transaction so outbox writes can happen atomically.
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateContractAmendment,
    createdBy: string | null
  ): Promise<ContractAmendmentRow> {
    const rows = await tx<ContractAmendmentRow[]>`
      INSERT INTO app.contract_amendments (
        tenant_id, employee_id, contract_id,
        amendment_type, description,
        effective_date, notification_date,
        created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.contract_id}::uuid,
        ${data.amendment_type},
        ${data.description},
        ${data.effective_date}::date,
        ${data.notification_date}::date,
        ${createdBy}::uuid
      )
      RETURNING
        id, tenant_id, employee_id, contract_id,
        amendment_type, description,
        effective_date, notification_date,
        notification_sent, acknowledged_by_employee, acknowledged_at,
        created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update a contract amendment record.
   * Called within a transaction so outbox writes can happen atomically.
   */
  async update(
    tx: TransactionSql,
    id: string,
    data: UpdateContractAmendment
  ): Promise<ContractAmendmentRow> {
    const rows = await tx<ContractAmendmentRow[]>`
      UPDATE app.contract_amendments
      SET
        ${data.amendment_type !== undefined ? tx`amendment_type = ${data.amendment_type},` : tx``}
        ${data.description !== undefined ? tx`description = ${data.description},` : tx``}
        ${data.effective_date !== undefined ? tx`effective_date = ${data.effective_date}::date,` : tx``}
        ${data.notification_date !== undefined ? tx`notification_date = ${data.notification_date}::date,` : tx``}
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, contract_id,
        amendment_type, description,
        effective_date, notification_date,
        notification_sent, acknowledged_by_employee, acknowledged_at,
        created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Mark notification as sent
   */
  async markNotificationSent(
    tx: TransactionSql,
    id: string
  ): Promise<ContractAmendmentRow> {
    const rows = await tx<ContractAmendmentRow[]>`
      UPDATE app.contract_amendments
      SET notification_sent = true,
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, contract_id,
        amendment_type, description,
        effective_date, notification_date,
        notification_sent, acknowledged_by_employee, acknowledged_at,
        created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Mark amendment as acknowledged by the employee
   */
  async markAcknowledged(
    tx: TransactionSql,
    id: string
  ): Promise<ContractAmendmentRow> {
    const rows = await tx<ContractAmendmentRow[]>`
      UPDATE app.contract_amendments
      SET acknowledged_by_employee = true,
          acknowledged_at = now(),
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, contract_id,
        amendment_type, description,
        effective_date, notification_date,
        notification_sent, acknowledged_by_employee, acknowledged_at,
        created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Check if an employee exists (for FK validation before insert)
   */
  async employeeExists(
    context: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.employees WHERE id = ${employeeId}::uuid
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check if a contract exists (for FK validation before insert)
   */
  async contractExists(
    context: TenantContext,
    contractId: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.employment_contracts WHERE id = ${contractId}::uuid
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }
}
