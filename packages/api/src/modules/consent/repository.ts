/**
 * Consent Management Module - Repository Layer
 *
 * Provides data access methods for GDPR consent entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateConsentPurpose,
  UpdateConsentPurpose,
  ConsentPurposeFilters,
  ConsentRecordFilters,
  ConsentMethod,
  ConsentAuditAction,
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
 * Database row types
 */
export interface ConsentPurposeRow extends Row {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string;
  legalBasis: string;
  dataCategories: string[];
  retentionPeriodDays: number | null;
  isRequired: boolean;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentRecordRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  consentPurposeId: string;
  purposeVersion: number;
  status: string;
  grantedAt: Date | null;
  withdrawnAt: Date | null;
  consentMethod: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  withdrawalReason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  purposeCode?: string;
  purposeName?: string;
  currentPurposeVersion?: number;
}

export interface ConsentAuditLogRow extends Row {
  id: string;
  tenantId: string;
  consentRecordId: string;
  action: string;
  performedBy: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface ConsentDashboardStats {
  totalPurposes: number;
  activePurposes: number;
  totalRecords: number;
  byStatus: {
    pending: number;
    granted: number;
    withdrawn: number;
    expired: number;
  };
  requiringReconsent: number;
  expiringSoon: number;
}

// =============================================================================
// Consent Repository
// =============================================================================

export class ConsentRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Consent Purposes
  // ===========================================================================

  /**
   * Find consent purposes with filters and cursor pagination
   */
  async findPurposes(
    context: TenantContext,
    filters: ConsentPurposeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<ConsentPurposeRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ConsentPurposeRow[]>`
        SELECT
          id, tenant_id, code, name, description,
          legal_basis, data_categories, retention_period_days,
          is_required, is_active, version,
          created_at, updated_at
        FROM consent_purposes
        WHERE 1=1
          ${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
          ${filters.legal_basis ? tx`AND legal_basis = ${filters.legal_basis}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR code ILIKE ${"%" + filters.search + "%"} OR description ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Find a consent purpose by ID
   */
  async findPurposeById(
    context: TenantContext,
    id: string
  ): Promise<ConsentPurposeRow | null> {
    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ConsentPurposeRow[]>`
        SELECT
          id, tenant_id, code, name, description,
          legal_basis, data_categories, retention_period_days,
          is_required, is_active, version,
          created_at, updated_at
        FROM consent_purposes
        WHERE id = ${id}
      `;
      return rows[0] ?? null;
    });
  }

  /**
   * Find a consent purpose by code
   */
  async findPurposeByCode(
    context: TenantContext,
    code: string
  ): Promise<ConsentPurposeRow | null> {
    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ConsentPurposeRow[]>`
        SELECT
          id, tenant_id, code, name, description,
          legal_basis, data_categories, retention_period_days,
          is_required, is_active, version,
          created_at, updated_at
        FROM consent_purposes
        WHERE code = ${code}
      `;
      return rows[0] ?? null;
    });
  }

  /**
   * Create a consent purpose
   */
  async createPurpose(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateConsentPurpose
  ): Promise<ConsentPurposeRow> {
    const id = crypto.randomUUID();
    const rows = await tx<ConsentPurposeRow[]>`
      INSERT INTO consent_purposes (
        id, tenant_id, code, name, description,
        legal_basis, data_categories, retention_period_days,
        is_required, version
      )
      VALUES (
        ${id}, ${context.tenantId}::uuid, ${data.code}, ${data.name}, ${data.description},
        ${data.legal_basis}, ${data.data_categories}, ${data.retention_period_days ?? null},
        ${data.is_required ?? false}, 1
      )
      RETURNING
        id, tenant_id, code, name, description,
        legal_basis, data_categories, retention_period_days,
        is_required, is_active, version,
        created_at, updated_at
    `;
    return rows[0]!;
  }

  /**
   * Update a consent purpose
   * Returns the updated row, or null if not found
   */
  async updatePurpose(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateConsentPurpose,
    bumpVersion: boolean
  ): Promise<ConsentPurposeRow | null> {
    // Build SET clause dynamically
    const setClauses: string[] = [];
    const values: Record<string, unknown> = {};

    if (data.name !== undefined) {
      values.name = data.name;
    }
    if (data.description !== undefined) {
      values.description = data.description;
    }
    if (data.data_categories !== undefined) {
      values.dataCategories = data.data_categories;
    }
    if (data.retention_period_days !== undefined) {
      values.retentionPeriodDays = data.retention_period_days;
    }
    if (data.is_required !== undefined) {
      values.isRequired = data.is_required;
    }
    if (data.is_active !== undefined) {
      values.isActive = data.is_active;
    }

    // Use a single update with conditional version bump
    const rows = await tx<ConsentPurposeRow[]>`
      UPDATE consent_purposes
      SET
        name = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        data_categories = COALESCE(${data.data_categories ?? null}, data_categories),
        retention_period_days = ${data.retention_period_days !== undefined ? data.retention_period_days : tx`retention_period_days`},
        is_required = COALESCE(${data.is_required ?? null}, is_required),
        is_active = COALESCE(${data.is_active ?? null}, is_active),
        version = ${bumpVersion ? tx`version + 1` : tx`version`},
        updated_at = now()
      WHERE id = ${id}
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id, tenant_id, code, name, description,
        legal_basis, data_categories, retention_period_days,
        is_required, is_active, version,
        created_at, updated_at
    `;

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Consent Records
  // ===========================================================================

  /**
   * Find consent records with filters and cursor pagination
   */
  async findRecords(
    context: TenantContext,
    filters: ConsentRecordFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<ConsentRecordRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ConsentRecordRow[]>`
        SELECT
          cr.id, cr.tenant_id, cr.employee_id, cr.consent_purpose_id,
          cr.purpose_version, cr.status,
          cr.granted_at, cr.withdrawn_at,
          cr.consent_method, cr.ip_address,
          cr.withdrawal_reason, cr.expires_at,
          cr.created_at, cr.updated_at,
          cp.code AS purpose_code,
          cp.name AS purpose_name,
          cp.version AS current_purpose_version
        FROM consent_records cr
        JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE 1=1
          ${filters.employee_id ? tx`AND cr.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.consent_purpose_id ? tx`AND cr.consent_purpose_id = ${filters.consent_purpose_id}::uuid` : tx``}
          ${filters.status ? tx`AND cr.status = ${filters.status}` : tx``}
          ${pagination.cursor ? tx`AND cr.id < ${pagination.cursor}` : tx``}
        ORDER BY cr.created_at DESC, cr.id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Find all consent records for a specific employee
   */
  async findByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ConsentRecordRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<ConsentRecordRow[]>`
        SELECT
          cr.id, cr.tenant_id, cr.employee_id, cr.consent_purpose_id,
          cr.purpose_version, cr.status,
          cr.granted_at, cr.withdrawn_at,
          cr.consent_method, cr.ip_address,
          cr.withdrawal_reason, cr.expires_at,
          cr.created_at, cr.updated_at,
          cp.code AS purpose_code,
          cp.name AS purpose_name,
          cp.version AS current_purpose_version
        FROM consent_records cr
        JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE cr.employee_id = ${employeeId}::uuid
        ORDER BY cr.created_at DESC
      `;
    });
  }

  /**
   * Get the current consent status for an employee + purpose combination
   */
  async getConsentStatus(
    context: TenantContext,
    employeeId: string,
    purposeId: string
  ): Promise<ConsentRecordRow | null> {
    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ConsentRecordRow[]>`
        SELECT
          cr.id, cr.tenant_id, cr.employee_id, cr.consent_purpose_id,
          cr.purpose_version, cr.status,
          cr.granted_at, cr.withdrawn_at,
          cr.consent_method, cr.ip_address,
          cr.withdrawal_reason, cr.expires_at,
          cr.created_at, cr.updated_at,
          cp.code AS purpose_code,
          cp.name AS purpose_name,
          cp.version AS current_purpose_version
        FROM consent_records cr
        JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE cr.employee_id = ${employeeId}::uuid
          AND cr.consent_purpose_id = ${purposeId}::uuid
        ORDER BY cr.created_at DESC
        LIMIT 1
      `;
      return rows[0] ?? null;
    });
  }

  /**
   * Find the current consent record for employee + purpose (within a transaction)
   */
  async findCurrentConsentRecord(
    tx: TransactionSql,
    employeeId: string,
    purposeId: string
  ): Promise<ConsentRecordRow | null> {
    const rows = await tx<ConsentRecordRow[]>`
      SELECT
        cr.id, cr.tenant_id, cr.employee_id, cr.consent_purpose_id,
        cr.purpose_version, cr.status,
        cr.granted_at, cr.withdrawn_at,
        cr.consent_method, cr.ip_address,
        cr.withdrawal_reason, cr.expires_at,
        cr.created_at, cr.updated_at,
        cp.code AS purpose_code,
        cp.name AS purpose_name,
        cp.version AS current_purpose_version
      FROM consent_records cr
      JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
      WHERE cr.employee_id = ${employeeId}::uuid
        AND cr.consent_purpose_id = ${purposeId}::uuid
      ORDER BY cr.created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /**
   * Create a consent record (grant)
   */
  async createConsentRecord(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      employeeId: string;
      consentPurposeId: string;
      purposeVersion: number;
      status: string;
      grantedAt: Date | null;
      consentMethod: ConsentMethod | null;
      ipAddress: string | null;
      userAgent: string | null;
      expiresAt: Date | null;
    }
  ): Promise<ConsentRecordRow> {
    const id = crypto.randomUUID();
    const rows = await tx<ConsentRecordRow[]>`
      INSERT INTO consent_records (
        id, tenant_id, employee_id, consent_purpose_id,
        purpose_version, status, granted_at,
        consent_method, ip_address, user_agent,
        expires_at
      )
      VALUES (
        ${id}, ${context.tenantId}::uuid, ${data.employeeId}::uuid, ${data.consentPurposeId}::uuid,
        ${data.purposeVersion}, ${data.status}, ${data.grantedAt},
        ${data.consentMethod}, ${data.ipAddress}, ${data.userAgent},
        ${data.expiresAt}
      )
      RETURNING
        id, tenant_id, employee_id, consent_purpose_id,
        purpose_version, status,
        granted_at, withdrawn_at,
        consent_method, ip_address,
        withdrawal_reason, expires_at,
        created_at, updated_at
    `;
    return rows[0]!;
  }

  /**
   * Update a consent record status (withdraw, expire)
   */
  async updateConsentRecordStatus(
    tx: TransactionSql,
    id: string,
    status: string,
    extra: {
      withdrawnAt?: Date;
      withdrawalReason?: string;
    } = {}
  ): Promise<ConsentRecordRow | null> {
    const rows = await tx<ConsentRecordRow[]>`
      UPDATE consent_records
      SET
        status = ${status},
        withdrawn_at = COALESCE(${extra.withdrawnAt ?? null}, withdrawn_at),
        withdrawal_reason = COALESCE(${extra.withdrawalReason ?? null}, withdrawal_reason),
        updated_at = now()
      WHERE id = ${id}
      RETURNING
        id, tenant_id, employee_id, consent_purpose_id,
        purpose_version, status,
        granted_at, withdrawn_at,
        consent_method, ip_address,
        withdrawal_reason, expires_at,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Find consents expiring within N days
   */
  async findExpiring(
    context: TenantContext,
    withinDays: number = 30
  ): Promise<ConsentRecordRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<ConsentRecordRow[]>`
        SELECT
          cr.id, cr.tenant_id, cr.employee_id, cr.consent_purpose_id,
          cr.purpose_version, cr.status,
          cr.granted_at, cr.withdrawn_at,
          cr.consent_method, cr.ip_address,
          cr.withdrawal_reason, cr.expires_at,
          cr.created_at, cr.updated_at,
          cp.code AS purpose_code,
          cp.name AS purpose_name,
          cp.version AS current_purpose_version
        FROM consent_records cr
        JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE cr.status = 'granted'
          AND cr.expires_at IS NOT NULL
          AND cr.expires_at <= now() + (${withinDays} || ' days')::interval
          AND cr.expires_at > now()
        ORDER BY cr.expires_at ASC
      `;
    });
  }

  /**
   * Find consents that require re-consent because the purpose version changed
   */
  async findRequiringReconsent(
    context: TenantContext
  ): Promise<ConsentRecordRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<ConsentRecordRow[]>`
        SELECT
          cr.id, cr.tenant_id, cr.employee_id, cr.consent_purpose_id,
          cr.purpose_version, cr.status,
          cr.granted_at, cr.withdrawn_at,
          cr.consent_method, cr.ip_address,
          cr.withdrawal_reason, cr.expires_at,
          cr.created_at, cr.updated_at,
          cp.code AS purpose_code,
          cp.name AS purpose_name,
          cp.version AS current_purpose_version
        FROM consent_records cr
        JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE cr.status = 'granted'
          AND cr.purpose_version < cp.version
        ORDER BY cr.created_at DESC
      `;
    });
  }

  // ===========================================================================
  // Consent Audit Log
  // ===========================================================================

  /**
   * Add an immutable audit log entry
   */
  async addAuditEntry(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      consentRecordId: string;
      action: ConsentAuditAction;
      performedBy: string | null;
      details: Record<string, unknown>;
    }
  ): Promise<ConsentAuditLogRow> {
    const id = crypto.randomUUID();
    const rows = await tx<ConsentAuditLogRow[]>`
      INSERT INTO consent_audit_log (
        id, tenant_id, consent_record_id,
        action, performed_by, details
      )
      VALUES (
        ${id}, ${context.tenantId}::uuid, ${data.consentRecordId}::uuid,
        ${data.action}, ${data.performedBy}, ${JSON.stringify(data.details)}::jsonb
      )
      RETURNING
        id, tenant_id, consent_record_id,
        action, performed_by, details,
        created_at
    `;
    return rows[0]!;
  }

  /**
   * Get audit log entries for a consent record
   */
  async getAuditLog(
    context: TenantContext,
    consentRecordId: string
  ): Promise<ConsentAuditLogRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<ConsentAuditLogRow[]>`
        SELECT
          id, tenant_id, consent_record_id,
          action, performed_by, details,
          created_at
        FROM consent_audit_log
        WHERE consent_record_id = ${consentRecordId}::uuid
        ORDER BY created_at ASC
      `;
    });
  }

  // ===========================================================================
  // Dashboard / Statistics
  // ===========================================================================

  /**
   * Get consent dashboard statistics
   */
  async getDashboardStats(
    context: TenantContext
  ): Promise<ConsentDashboardStats> {
    return this.db.withTransaction(context, async (tx) => {
      // Purpose counts
      const purposeStats = await tx<Array<{ total: string; active: string }>>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE is_active = true)::text AS active
        FROM consent_purposes
      `;

      // Record counts by status
      const recordStats = await tx<Array<{
        total: string;
        pending: string;
        granted: string;
        withdrawn: string;
        expired: string;
      }>>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE status = 'granted')::text AS granted,
          COUNT(*) FILTER (WHERE status = 'withdrawn')::text AS withdrawn,
          COUNT(*) FILTER (WHERE status = 'expired')::text AS expired
        FROM consent_records
      `;

      // Requiring re-consent (purpose version advanced past the consent version)
      const reconsentStats = await tx<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count
        FROM consent_records cr
        JOIN consent_purposes cp ON cp.id = cr.consent_purpose_id
        WHERE cr.status = 'granted'
          AND cr.purpose_version < cp.version
      `;

      // Expiring soon (within 30 days)
      const expiringStats = await tx<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count
        FROM consent_records
        WHERE status = 'granted'
          AND expires_at IS NOT NULL
          AND expires_at <= now() + interval '30 days'
          AND expires_at > now()
      `;

      const ps = purposeStats[0]!;
      const rs = recordStats[0]!;

      return {
        totalPurposes: parseInt(ps.total, 10),
        activePurposes: parseInt(ps.active, 10),
        totalRecords: parseInt(rs.total, 10),
        byStatus: {
          pending: parseInt(rs.pending, 10),
          granted: parseInt(rs.granted, 10),
          withdrawn: parseInt(rs.withdrawn, 10),
          expired: parseInt(rs.expired, 10),
        },
        requiringReconsent: parseInt(reconsentStats[0]?.count ?? "0", 10),
        expiringSoon: parseInt(expiringStats[0]?.count ?? "0", 10),
      };
    });
  }
}
