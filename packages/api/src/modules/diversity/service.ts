/**
 * Diversity Monitoring Module - Service Layer
 *
 * Implements business logic for voluntary diversity data collection.
 * Enforces consent requirements and ensures aggregate-only reporting.
 * Emits domain events via the outbox pattern.
 *
 * Legal basis: Equality Act 2010 (UK)
 * - All fields are voluntary
 * - Consent must be explicitly given before data is stored
 * - Aggregate reporting only (no individual identification)
 * - Employees can withdraw data at any time
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DiversityRepository,
  DiversityDataRow,
  AggregateStats,
  CompletionRate,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  UpsertDiversityData,
  DiversityDataResponse,
  AggregateStatsResponse,
  CompletionRateResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Domain event types for diversity module
 */
type DiversityDomainEventType =
  | "diversity.data.submitted"
  | "diversity.data.updated"
  | "diversity.data.withdrawn";

// =============================================================================
// Diversity Service
// =============================================================================

export class DiversityService {
  constructor(
    private repository: DiversityRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox in the same transaction as the business write.
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: DiversityDomainEventType,
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
        'diversity_data',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Row → Response Mapping
  // ===========================================================================

  private mapRowToResponse(row: DiversityDataRow): DiversityDataResponse {
    return {
      id: row.id,
      employeeId: row.employeeId,
      ethnicity: row.ethnicity,
      ethnicityOther: row.ethnicityOther,
      disabilityStatus: row.disabilityStatus,
      disabilityDetails: row.disabilityDetails,
      religionBelief: row.religionBelief,
      religionOther: row.religionOther,
      sexualOrientation: row.sexualOrientation,
      sexualOrientationOther: row.sexualOrientationOther,
      consentGiven: row.consentGiven,
      consentDate: row.consentDate?.toISOString() ?? null,
      dataCollectedAt: row.dataCollectedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  // ===========================================================================
  // Get Own Data
  // ===========================================================================

  /**
   * Get diversity data for the currently authenticated employee.
   */
  async getMyData(
    context: TenantContext
  ): Promise<ServiceResult<DiversityDataResponse>> {
    if (!context.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "Authentication required",
        },
      };
    }

    const row = await this.repository.getByUserId(context);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No diversity data found. You have not submitted any data yet.",
        },
      };
    }

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  // ===========================================================================
  // Submit / Update Own Data
  // ===========================================================================

  /**
   * Submit or update diversity data for the currently authenticated employee.
   * Consent must be explicitly given (consent_given: true) before storing data.
   */
  async upsertMyData(
    context: TenantContext,
    input: UpsertDiversityData,
    clientIp?: string | null
  ): Promise<ServiceResult<DiversityDataResponse>> {
    if (!context.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "Authentication required",
        },
      };
    }

    // Consent must be explicitly given before storing any data
    if (!input.consent_given) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Explicit consent is required before diversity data can be stored. " +
            "Please set consent_given to true to confirm your consent.",
          details: { field: "consent_given" },
        },
      };
    }

    // Resolve employee ID from the authenticated user
    const employeeId = await this.repository.resolveEmployeeId(context);
    if (!employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No employee record found for the current user",
        },
      };
    }

    // Check if this is an insert or update (for event type)
    const existing = await this.repository.getByUserId(context);
    const isUpdate = !!existing;

    // Perform upsert within a transaction (with outbox event)
    const row = await this.db.withTransaction(
      { tenantId: context.tenantId, userId: context.userId },
      async (tx: TransactionSql) => {
        const upserted = await this.repository.upsert(tx, context, employeeId, {
          ethnicity: input.ethnicity ?? null,
          ethnicityOther: input.ethnicity_other ?? null,
          disabilityStatus: input.disability_status ?? null,
          disabilityDetails: input.disability_details ?? null,
          religionBelief: input.religion_belief ?? null,
          religionOther: input.religion_other ?? null,
          sexualOrientation: input.sexual_orientation ?? null,
          sexualOrientationOther: input.sexual_orientation_other ?? null,
          consentGiven: input.consent_given,
          consentDate: new Date(),
          consentIp: clientIp ?? null,
        });

        // Emit domain event in the same transaction
        await this.emitEvent(
          tx,
          context,
          upserted.id,
          isUpdate ? "diversity.data.updated" : "diversity.data.submitted",
          {
            diversityDataId: upserted.id,
            employeeId,
            // Do NOT include the actual diversity data in the event payload.
            // Only record the fact that data was submitted/updated for audit.
            action: isUpdate ? "updated" : "submitted",
          }
        );

        return upserted;
      }
    );

    return {
      success: true,
      data: this.mapRowToResponse(row),
    };
  }

  // ===========================================================================
  // Withdraw (Delete) Own Data
  // ===========================================================================

  /**
   * Delete the current employee's diversity data.
   * This is the employee exercising their right to withdraw voluntarily provided data.
   */
  async withdrawMyData(
    context: TenantContext
  ): Promise<ServiceResult<{ message: string }>> {
    if (!context.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "Authentication required",
        },
      };
    }

    const employeeId = await this.repository.resolveEmployeeId(context);
    if (!employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No employee record found for the current user",
        },
      };
    }

    // Check if data exists before attempting to delete
    const existing = await this.repository.getByUserId(context);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No diversity data found to withdraw",
        },
      };
    }

    await this.db.withTransaction(
      { tenantId: context.tenantId, userId: context.userId },
      async (tx: TransactionSql) => {
        await this.repository.deleteByEmployeeId(tx, context, employeeId);

        // Emit withdrawal event in the same transaction
        await this.emitEvent(
          tx,
          context,
          existing.id,
          "diversity.data.withdrawn",
          {
            diversityDataId: existing.id,
            employeeId,
            action: "withdrawn",
          }
        );
      }
    );

    return {
      success: true,
      data: {
        message: "Diversity data has been withdrawn and deleted successfully",
      },
    };
  }

  // ===========================================================================
  // Aggregate Stats (admin only)
  // ===========================================================================

  /**
   * Get aggregate diversity statistics for the tenant.
   * Returns counts by category only -- never individual records.
   */
  async getAggregateStats(
    context: TenantContext
  ): Promise<ServiceResult<AggregateStatsResponse>> {
    const stats: AggregateStats =
      await this.repository.getAggregateStats(context);

    return {
      success: true,
      data: {
        totalResponses: stats.totalResponses,
        ethnicity: stats.ethnicity,
        disabilityStatus: stats.disabilityStatus,
        religionBelief: stats.religionBelief,
        sexualOrientation: stats.sexualOrientation,
      },
    };
  }

  // ===========================================================================
  // Completion Rate (admin only)
  // ===========================================================================

  /**
   * Get diversity data completion rate for the tenant.
   * Returns the percentage of active employees who have submitted data.
   */
  async getCompletionRate(
    context: TenantContext
  ): Promise<ServiceResult<CompletionRateResponse>> {
    const rate: CompletionRate =
      await this.repository.getCompletionRate(context);

    return {
      success: true,
      data: {
        totalEmployees: rate.totalEmployees,
        totalSubmissions: rate.totalSubmissions,
        completionRate: rate.completionRate,
      },
    };
  }
}
