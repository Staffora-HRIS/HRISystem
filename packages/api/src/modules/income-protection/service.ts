/**
 * Income Protection Module - Service Layer
 *
 * Business logic for income protection policy and enrollment management.
 *
 * Key rules:
 * - Policies have a lifecycle: draft -> active -> suspended/terminated
 * - Enrollments require an active policy
 * - No overlapping active enrollments for the same employee + policy
 * - Benefit amount is calculated from salary and policy rules on enrollment
 * - effective_to >= effective_from (if provided)
 * - All writes emit domain events in the same transaction
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  IncomeProtectionRepository,
  PolicyRow,
  EnrollmentRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreatePolicy,
  UpdatePolicy,
  PolicyFilters,
  PolicyResponse,
  CreateEnrollment,
  UpdateEnrollment,
  EnrollmentFilters,
  EnrollmentResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "benefits.income_protection.policy.created"
  | "benefits.income_protection.policy.updated"
  | "benefits.income_protection.enrollment.created"
  | "benefits.income_protection.enrollment.updated";

// =============================================================================
// Valid Policy Status Transitions
// =============================================================================

const VALID_POLICY_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "terminated"],
  active: ["suspended", "terminated"],
  suspended: ["active", "terminated"],
  terminated: [],
};

// =============================================================================
// Service
// =============================================================================

export class IncomeProtectionService {
  constructor(
    private repository: IncomeProtectionRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

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
  // Mappers
  // ===========================================================================

  private mapPolicyToResponse(row: PolicyRow): PolicyResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      policy_number: row.policyNumber,
      provider_name: row.providerName,
      provider_contact_email: row.providerContactEmail,
      provider_contact_phone: row.providerContactPhone,
      status: row.status,
      benefit_basis: row.benefitBasis,
      benefit_percentage: row.benefitPercentage != null ? Number(row.benefitPercentage) : null,
      benefit_fixed_amount: row.benefitFixedAmount != null ? Number(row.benefitFixedAmount) : null,
      benefit_cap: row.benefitCap != null ? Number(row.benefitCap) : null,
      deferred_period: row.deferredPeriod,
      max_benefit_age: row.maxBenefitAge,
      employer_contribution_pct: Number(row.employerContributionPct),
      employee_contribution_pct: Number(row.employeeContributionPct),
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]!
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]!
          : String(row.effectiveTo)
        : null,
      eligibility_rules: row.eligibilityRules,
      notes: row.notes,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  private mapEnrollmentToResponse(row: EnrollmentRow): EnrollmentResponse {
    const response: EnrollmentResponse = {
      id: row.id,
      tenant_id: row.tenantId,
      policy_id: row.policyId,
      employee_id: row.employeeId,
      status: row.status,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]!
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]!
          : String(row.effectiveTo)
        : null,
      annual_salary_at_enrollment: row.annualSalaryAtEnrollment != null
        ? Number(row.annualSalaryAtEnrollment)
        : null,
      annual_benefit_amount: row.annualBenefitAmount != null
        ? Number(row.annualBenefitAmount)
        : null,
      employee_premium_monthly: Number(row.employeePremiumMonthly),
      employer_premium_monthly: Number(row.employerPremiumMonthly),
      claim_start_date: row.claimStartDate
        ? row.claimStartDate instanceof Date
          ? row.claimStartDate.toISOString().split("T")[0]!
          : String(row.claimStartDate)
        : null,
      claim_end_date: row.claimEndDate
        ? row.claimEndDate instanceof Date
          ? row.claimEndDate.toISOString().split("T")[0]!
          : String(row.claimEndDate)
        : null,
      claim_reason: row.claimReason,
      notes: row.notes,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };

    if (row.policyName) {
      response.policy_name = row.policyName;
    }
    if (row.providerName) {
      response.provider_name = row.providerName;
    }

    return response;
  }

  // ===========================================================================
  // Benefit Calculation
  // ===========================================================================

  /**
   * Calculate the annual benefit amount based on policy rules and salary.
   * Returns null if insufficient data to calculate.
   */
  private calculateAnnualBenefit(
    policy: PolicyRow,
    annualSalary: number | null | undefined
  ): number | null {
    if (policy.benefitBasis === "fixed_amount") {
      const fixedAmount = policy.benefitFixedAmount != null
        ? Number(policy.benefitFixedAmount)
        : null;
      if (fixedAmount == null) return null;
      const cap = policy.benefitCap != null ? Number(policy.benefitCap) : null;
      return cap != null ? Math.min(fixedAmount, cap) : fixedAmount;
    }

    if (policy.benefitBasis === "percentage_of_salary") {
      if (annualSalary == null) return null;
      const percentage = policy.benefitPercentage != null
        ? Number(policy.benefitPercentage)
        : null;
      if (percentage == null) return null;
      const rawBenefit = (annualSalary * percentage) / 100;
      const cap = policy.benefitCap != null ? Number(policy.benefitCap) : null;
      return cap != null ? Math.min(rawBenefit, cap) : rawBenefit;
    }

    // Tiered calculation would need additional configuration
    return null;
  }

  // ===========================================================================
  // Policy Methods
  // ===========================================================================

  async createPolicy(
    context: TenantContext,
    data: CreatePolicy,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PolicyResponse>> {
    // Validate effective dates
    if (data.effective_to && data.effective_to <= data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be after effective_from",
          details: {
            effective_from: data.effective_from,
            effective_to: data.effective_to,
          },
        },
      };
    }

    // Validate benefit basis has corresponding value
    if (data.benefit_basis === "percentage_of_salary" && data.benefit_percentage == null) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "benefit_percentage is required when benefit_basis is percentage_of_salary",
        },
      };
    }

    if (data.benefit_basis === "fixed_amount" && data.benefit_fixed_amount == null) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "benefit_fixed_amount is required when benefit_basis is fixed_amount",
        },
      };
    }

    // Validate contribution percentages do not exceed 100
    const employerPct = data.employer_contribution_pct ?? 100;
    const employeePct = data.employee_contribution_pct ?? 0;
    if (employerPct + employeePct > 100) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "employer_contribution_pct + employee_contribution_pct must not exceed 100",
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createPolicy(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "income_protection_policy",
        row.id,
        "benefits.income_protection.policy.created",
        { policy: this.mapPolicyToResponse(row) }
      );

      return {
        success: true,
        data: this.mapPolicyToResponse(row),
      };
    });
  }

  async getPolicyById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PolicyResponse>> {
    const row = await this.repository.findPolicyById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Income protection policy ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapPolicyToResponse(row),
    };
  }

  async listPolicies(
    context: TenantContext,
    filters: PolicyFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PolicyResponse>> {
    const result = await this.repository.findAllPolicies(context, filters, pagination);
    return {
      items: result.items.map((row) => this.mapPolicyToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async updatePolicy(
    context: TenantContext,
    id: string,
    data: UpdatePolicy,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PolicyResponse>> {
    const existing = await this.repository.findPolicyById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Income protection policy ${id} not found`,
        },
      };
    }

    // Validate status transition if status is changing
    if (data.status && data.status !== existing.status) {
      const allowedTransitions = VALID_POLICY_TRANSITIONS[existing.status] || [];
      if (!allowedTransitions.includes(data.status)) {
        return {
          success: false,
          error: {
            code: "STATE_MACHINE_VIOLATION",
            message: `Cannot transition policy from '${existing.status}' to '${data.status}'`,
            details: {
              current_status: existing.status,
              requested_status: data.status,
              allowed_transitions: allowedTransitions,
            },
          },
        };
      }
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updatePolicy(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Income protection policy ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "income_protection_policy",
        row.id,
        "benefits.income_protection.policy.updated",
        {
          policy: this.mapPolicyToResponse(row),
          previous: this.mapPolicyToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapPolicyToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Enrollment Methods
  // ===========================================================================

  async createEnrollment(
    context: TenantContext,
    data: CreateEnrollment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EnrollmentResponse>> {
    // Validate effective dates
    if (data.effective_to && data.effective_to < data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be on or after effective_from",
          details: {
            effective_from: data.effective_from,
            effective_to: data.effective_to,
          },
        },
      };
    }

    // Verify policy exists and is active
    const policy = await this.repository.findPolicyById(context, data.policy_id);
    if (!policy) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Income protection policy ${data.policy_id} not found`,
        },
      };
    }

    if (policy.status !== "active") {
      return {
        success: false,
        error: {
          code: "POLICY_NOT_ACTIVE",
          message: "Cannot enroll in a policy that is not active",
          details: { policy_id: data.policy_id, policy_status: policy.status },
        },
      };
    }

    // Calculate annual benefit amount
    const annualBenefitAmount = this.calculateAnnualBenefit(
      policy,
      data.annual_salary_at_enrollment
    );

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping enrollments under the same policy
      const hasOverlap = await this.repository.hasOverlappingEnrollment(
        context,
        data.employee_id,
        data.policy_id,
        data.effective_from,
        data.effective_to,
        tx
      );

      if (hasOverlap) {
        return {
          success: false,
          error: {
            code: "EFFECTIVE_DATE_OVERLAP",
            message: "Employee already has an active enrollment in this policy that overlaps with the given date range",
            details: {
              employee_id: data.employee_id,
              policy_id: data.policy_id,
              effective_from: data.effective_from,
              effective_to: data.effective_to,
            },
          },
        };
      }

      const row = await this.repository.createEnrollment(
        context,
        data,
        annualBenefitAmount,
        tx
      );

      await this.emitEvent(
        tx,
        context,
        "income_protection_enrollment",
        row.id,
        "benefits.income_protection.enrollment.created",
        {
          enrollment: this.mapEnrollmentToResponse(row),
          employee_id: data.employee_id,
          policy_id: data.policy_id,
        }
      );

      return {
        success: true,
        data: this.mapEnrollmentToResponse(row),
      };
    });
  }

  async getEnrollmentById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EnrollmentResponse>> {
    const row = await this.repository.findEnrollmentById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Income protection enrollment ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapEnrollmentToResponse(row),
    };
  }

  async listEnrollments(
    context: TenantContext,
    filters: EnrollmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EnrollmentResponse>> {
    const result = await this.repository.findAllEnrollments(context, filters, pagination);
    return {
      items: result.items.map((row) => this.mapEnrollmentToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async updateEnrollment(
    context: TenantContext,
    id: string,
    data: UpdateEnrollment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EnrollmentResponse>> {
    const existing = await this.repository.findEnrollmentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Income protection enrollment ${id} not found`,
        },
      };
    }

    // Validate claim dates
    if (data.claim_end_date && !data.claim_start_date && !existing.claimStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "claim_start_date must be set before claim_end_date",
        },
      };
    }

    // If setting status to on_claim, require claim_start_date
    if (data.status === "on_claim" && !data.claim_start_date && !existing.claimStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "claim_start_date is required when setting status to on_claim",
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updateEnrollment(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Income protection enrollment ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "income_protection_enrollment",
        row.id,
        "benefits.income_protection.enrollment.updated",
        {
          enrollment: this.mapEnrollmentToResponse(row),
          previous: this.mapEnrollmentToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapEnrollmentToResponse(row),
      };
    });
  }
}
