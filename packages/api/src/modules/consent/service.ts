/**
 * Consent Management Module - Service Layer
 *
 * Implements business logic for GDPR consent management.
 * Enforces consent lifecycle rules and emits domain events
 * via the outbox pattern.
 *
 * GDPR compliance:
 * - Consent must be freely given, specific, informed, and unambiguous
 * - Withdrawal must be as easy as granting
 * - Version tracking ensures re-consent when purposes change
 * - Audit trail provides proof of consent
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ConsentRepository,
  ConsentPurposeRow,
  ConsentRecordRow,
  ConsentDashboardStats,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateConsentPurpose,
  UpdateConsentPurpose,
  ConsentPurposeFilters,
  ConsentRecordFilters,
  ConsentMethod,
  ConsentPurposeResponse,
  ConsentRecordResponse,
  ConsentCheckResponse,
  ConsentDashboardResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Domain event types for consent module
 */
type ConsentDomainEventType =
  | "consent.purpose.created"
  | "consent.purpose.updated"
  | "consent.purpose.version_bumped"
  | "consent.granted"
  | "consent.withdrawn"
  | "consent.expired"
  | "consent.renewed";

/**
 * Fields that trigger a purpose version bump when changed.
 * Changing the scope, description, or data categories of a purpose
 * means existing consents were given under different terms.
 */
const VERSION_BUMP_FIELDS: (keyof UpdateConsentPurpose)[] = [
  "name",
  "description",
  "data_categories",
  "retention_period_days",
];

// =============================================================================
// Consent Service
// =============================================================================

export class ConsentService {
  constructor(
    private repository: ConsentRepository,
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
    eventType: ConsentDomainEventType,
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
   * Map a purpose row to API response format
   */
  private mapPurposeToResponse(row: ConsentPurposeRow): ConsentPurposeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      code: row.code,
      name: row.name,
      description: row.description,
      legal_basis: row.legalBasis as ConsentPurposeResponse["legal_basis"],
      data_categories: row.dataCategories,
      retention_period_days: row.retentionPeriodDays,
      is_required: row.isRequired,
      is_active: row.isActive,
      version: row.version,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  /**
   * Map a consent record row to API response format
   */
  private mapRecordToResponse(row: ConsentRecordRow): ConsentRecordResponse {
    const requiresReconsent =
      row.currentPurposeVersion !== undefined &&
      row.purposeVersion < row.currentPurposeVersion &&
      row.status === "granted";

    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      consent_purpose_id: row.consentPurposeId,
      purpose_code: row.purposeCode,
      purpose_name: row.purposeName,
      purpose_version: row.purposeVersion,
      current_purpose_version: row.currentPurposeVersion,
      status: row.status as ConsentRecordResponse["status"],
      granted_at: row.grantedAt?.toISOString() ?? null,
      withdrawn_at: row.withdrawnAt?.toISOString() ?? null,
      consent_method: row.consentMethod as ConsentRecordResponse["consent_method"],
      ip_address: row.ipAddress,
      withdrawal_reason: row.withdrawalReason,
      expires_at: row.expiresAt?.toISOString() ?? null,
      requires_reconsent: requiresReconsent,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  // ===========================================================================
  // Consent Purpose Business Logic
  // ===========================================================================

  /**
   * List consent purposes with filters
   */
  async listPurposes(
    context: TenantContext,
    filters: ConsentPurposeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<ConsentPurposeResponse>> {
    const result = await this.repository.findPurposes(context, filters, pagination);

    return {
      items: result.items.map((r) => this.mapPurposeToResponse(r)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a consent purpose by ID
   */
  async getPurpose(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<ConsentPurposeResponse>> {
    const row = await this.repository.findPurposeById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Consent purpose with ID '${id}' not found`,
        },
      };
    }

    return { success: true, data: this.mapPurposeToResponse(row) };
  }

  /**
   * Create a new consent purpose
   */
  async createPurpose(
    context: TenantContext,
    data: CreateConsentPurpose
  ): Promise<ServiceResult<ConsentPurposeResponse>> {
    // Check for duplicate code
    const existing = await this.repository.findPurposeByCode(context, data.code);
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A consent purpose with code '${data.code}' already exists`,
          details: { existingId: existing.id },
        },
      };
    }

    const row = await this.db.withTransaction(context, async (tx) => {
      const purpose = await this.repository.createPurpose(tx, context, data);

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "consent_purpose",
        purpose.id,
        "consent.purpose.created",
        {
          purpose: this.mapPurposeToResponse(purpose),
        }
      );

      return purpose;
    });

    return { success: true, data: this.mapPurposeToResponse(row) };
  }

  /**
   * Update a consent purpose.
   * If substantive fields change (name, description, data_categories, retention),
   * the version is bumped, which may require employees to re-consent.
   */
  async updatePurpose(
    context: TenantContext,
    id: string,
    data: UpdateConsentPurpose
  ): Promise<ServiceResult<ConsentPurposeResponse>> {
    // Determine if this update requires a version bump
    const shouldBumpVersion = VERSION_BUMP_FIELDS.some(
      (field) => data[field] !== undefined
    );

    const row = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updatePurpose(
        tx,
        context,
        id,
        data,
        shouldBumpVersion
      );

      if (!updated) {
        return null;
      }

      // Emit appropriate event
      const eventType: ConsentDomainEventType = shouldBumpVersion
        ? "consent.purpose.version_bumped"
        : "consent.purpose.updated";

      await this.emitEvent(
        tx,
        context,
        "consent_purpose",
        updated.id,
        eventType,
        {
          purpose: this.mapPurposeToResponse(updated),
          versionBumped: shouldBumpVersion,
        }
      );

      return updated;
    });

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Consent purpose with ID '${id}' not found`,
        },
      };
    }

    return { success: true, data: this.mapPurposeToResponse(row) };
  }

  // ===========================================================================
  // Consent Record Business Logic
  // ===========================================================================

  /**
   * List consent records with filters
   */
  async listRecords(
    context: TenantContext,
    filters: ConsentRecordFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<ConsentRecordResponse>> {
    const result = await this.repository.findRecords(context, filters, pagination);

    return {
      items: result.items.map((r) => this.mapRecordToResponse(r)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Grant consent for an employee on a specific purpose.
   *
   * If a previous consent record exists in withdrawn/expired state,
   * a new record is created (renewed). If already granted, returns conflict.
   */
  async grantConsent(
    context: TenantContext,
    employeeId: string,
    purposeId: string,
    method: ConsentMethod,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      expiresAt?: string;
    } = {}
  ): Promise<ServiceResult<ConsentRecordResponse>> {
    return this.db.withTransaction(context, async (tx) => {
      // Verify the purpose exists and is active
      const purposeRows = await tx<ConsentPurposeRow[]>`
        SELECT id, tenant_id, code, name, description,
               legal_basis, data_categories, retention_period_days,
               is_required, is_active, version,
               created_at, updated_at
        FROM consent_purposes
        WHERE id = ${purposeId}::uuid
      `;
      const purpose = purposeRows[0];

      if (!purpose) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Consent purpose with ID '${purposeId}' not found`,
          },
        };
      }

      if (!purpose.isActive) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Cannot grant consent for an inactive purpose",
          },
        };
      }

      // Verify the employee exists
      const employeeRows = await tx<Array<{ id: string }>>`
        SELECT id FROM employees WHERE id = ${employeeId}::uuid
      `;
      if (employeeRows.length === 0) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Employee with ID '${employeeId}' not found`,
          },
        };
      }

      // Check for existing active consent
      const existing = await this.repository.findCurrentConsentRecord(
        tx,
        employeeId,
        purposeId
      );

      if (existing && existing.status === "granted") {
        // Check if it needs re-consent due to version change
        if (existing.purposeVersion >= purpose.version) {
          return {
            success: false,
            error: {
              code: ErrorCodes.CONFLICT,
              message: "Consent is already granted for this purpose",
              details: { existingRecordId: existing.id },
            },
          };
        }
        // Version changed — allow re-consent by creating a new record
      }

      const expiresAt = metadata.expiresAt ? new Date(metadata.expiresAt) : null;
      const now = new Date();

      // Create new consent record
      const record = await this.repository.createConsentRecord(tx, context, {
        employeeId,
        consentPurposeId: purposeId,
        purposeVersion: purpose.version,
        status: "granted",
        grantedAt: now,
        consentMethod: method,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
        expiresAt,
      });

      // Determine audit action
      const auditAction = existing && (existing.status === "withdrawn" || existing.status === "expired")
        ? "renewed" as const
        : "granted" as const;

      // Write consent audit log entry
      await this.repository.addAuditEntry(tx, context, {
        consentRecordId: record.id,
        action: auditAction,
        performedBy: context.userId ?? null,
        details: {
          purposeCode: purpose.code,
          purposeVersion: purpose.version,
          consentMethod: method,
          ipAddress: metadata.ipAddress ?? null,
          previousRecordId: existing?.id ?? null,
          previousStatus: existing?.status ?? null,
        },
      });

      // Emit domain event
      const eventType: ConsentDomainEventType = auditAction === "renewed"
        ? "consent.renewed"
        : "consent.granted";

      await this.emitEvent(tx, context, "consent_record", record.id, eventType, {
        employeeId,
        purposeId,
        purposeCode: purpose.code,
        purposeVersion: purpose.version,
        method,
      });

      // Attach joined fields for the response
      const response: ConsentRecordResponse = {
        id: record.id,
        tenant_id: record.tenantId,
        employee_id: record.employeeId,
        consent_purpose_id: record.consentPurposeId,
        purpose_code: purpose.code,
        purpose_name: purpose.name,
        purpose_version: record.purposeVersion,
        current_purpose_version: purpose.version,
        status: record.status as ConsentRecordResponse["status"],
        granted_at: record.grantedAt?.toISOString() ?? null,
        withdrawn_at: record.withdrawnAt?.toISOString() ?? null,
        consent_method: record.consentMethod as ConsentRecordResponse["consent_method"],
        ip_address: record.ipAddress,
        withdrawal_reason: record.withdrawalReason,
        expires_at: record.expiresAt?.toISOString() ?? null,
        requires_reconsent: false,
        created_at: record.createdAt.toISOString(),
        updated_at: record.updatedAt.toISOString(),
      };

      return { success: true, data: response };
    });
  }

  /**
   * Withdraw consent for an employee on a specific purpose.
   *
   * GDPR requires that withdrawal must be as easy as granting.
   * Only granted consents can be withdrawn.
   */
  async withdrawConsent(
    context: TenantContext,
    employeeId: string,
    purposeId: string,
    reason?: string
  ): Promise<ServiceResult<ConsentRecordResponse>> {
    return this.db.withTransaction(context, async (tx) => {
      // Find the current consent record
      const existing = await this.repository.findCurrentConsentRecord(
        tx,
        employeeId,
        purposeId
      );

      if (!existing) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "No consent record found for this employee and purpose",
          },
        };
      }

      if (existing.status !== "granted") {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Cannot withdraw consent that is in '${existing.status}' status. Only granted consents can be withdrawn.`,
            details: { currentStatus: existing.status },
          },
        };
      }

      const now = new Date();

      // Update the record
      const updated = await this.repository.updateConsentRecordStatus(
        tx,
        existing.id,
        "withdrawn",
        {
          withdrawnAt: now,
          withdrawalReason: reason,
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to update consent record",
          },
        };
      }

      // Write consent audit log entry
      await this.repository.addAuditEntry(tx, context, {
        consentRecordId: existing.id,
        action: "withdrawn",
        performedBy: context.userId ?? null,
        details: {
          purposeCode: existing.purposeCode,
          withdrawalReason: reason ?? null,
          originalGrantedAt: existing.grantedAt?.toISOString() ?? null,
        },
      });

      // Emit domain event
      await this.emitEvent(tx, context, "consent_record", existing.id, "consent.withdrawn", {
        employeeId,
        purposeId,
        purposeCode: existing.purposeCode,
        reason: reason ?? null,
      });

      return {
        success: true,
        data: {
          id: updated.id,
          tenant_id: updated.tenantId,
          employee_id: updated.employeeId,
          consent_purpose_id: updated.consentPurposeId,
          purpose_code: existing.purposeCode,
          purpose_name: existing.purposeName,
          purpose_version: updated.purposeVersion,
          current_purpose_version: existing.currentPurposeVersion,
          status: updated.status as ConsentRecordResponse["status"],
          granted_at: updated.grantedAt?.toISOString() ?? null,
          withdrawn_at: updated.withdrawnAt?.toISOString() ?? null,
          consent_method: updated.consentMethod as ConsentRecordResponse["consent_method"],
          ip_address: updated.ipAddress,
          withdrawal_reason: updated.withdrawalReason,
          expires_at: updated.expiresAt?.toISOString() ?? null,
          requires_reconsent: false,
          created_at: updated.createdAt.toISOString(),
          updated_at: updated.updatedAt.toISOString(),
        },
      };
    });
  }

  /**
   * Get all consent records for an employee
   */
  async getEmployeeConsents(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<ConsentRecordResponse[]>> {
    const rows = await this.repository.findByEmployee(context, employeeId);

    return {
      success: true,
      data: rows.map((r) => this.mapRecordToResponse(r)),
    };
  }

  /**
   * Quick check whether an employee has active consent for a purpose code.
   * Returns a lightweight response suitable for authorization gates.
   */
  async checkConsent(
    context: TenantContext,
    employeeId: string,
    purposeCode: string
  ): Promise<ServiceResult<ConsentCheckResponse>> {
    // Find the purpose by code
    const purpose = await this.repository.findPurposeByCode(context, purposeCode);

    if (!purpose) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Consent purpose with code '${purposeCode}' not found`,
        },
      };
    }

    // Get the latest consent record
    const record = await this.repository.getConsentStatus(context, employeeId, purpose.id);

    const hasConsent = record?.status === "granted";
    const requiresReconsent = hasConsent && record.purposeVersion < purpose.version;

    return {
      success: true,
      data: {
        has_consent: hasConsent && !requiresReconsent,
        status: record?.status as ConsentCheckResponse["status"] ?? null,
        purpose_code: purpose.code,
        purpose_name: purpose.name,
        requires_reconsent: requiresReconsent,
        granted_at: record?.grantedAt?.toISOString() ?? null,
        expires_at: record?.expiresAt?.toISOString() ?? null,
      },
    };
  }

  /**
   * Get consent dashboard statistics
   */
  async getConsentDashboard(
    context: TenantContext
  ): Promise<ServiceResult<ConsentDashboardResponse>> {
    const stats = await this.repository.getDashboardStats(context);

    return {
      success: true,
      data: {
        total_purposes: stats.totalPurposes,
        active_purposes: stats.activePurposes,
        total_records: stats.totalRecords,
        by_status: stats.byStatus,
        requiring_reconsent: stats.requiringReconsent,
        expiring_soon: stats.expiringSoon,
      },
    };
  }

  /**
   * Find stale consents (purpose version has changed since consent was given)
   */
  async findStaleConsents(
    context: TenantContext
  ): Promise<ServiceResult<ConsentRecordResponse[]>> {
    const rows = await this.repository.findRequiringReconsent(context);

    return {
      success: true,
      data: rows.map((r) => this.mapRecordToResponse(r)),
    };
  }

  /**
   * Find consents expiring within N days
   */
  async findExpiringConsents(
    context: TenantContext,
    withinDays: number = 30
  ): Promise<ServiceResult<ConsentRecordResponse[]>> {
    const rows = await this.repository.findExpiring(context, withinDays);

    return {
      success: true,
      data: rows.map((r) => this.mapRecordToResponse(r)),
    };
  }
}
