/**
 * Benefits Module - Service Layer
 *
 * Implements business logic for Benefits Administration.
 * Enforces eligibility rules, validates enrollments, and emits domain events.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  BenefitsRepository,
  CarrierRow,
  PlanRow,
  DependentRow,
  EnrollmentRow,
  LifeEventRow,
  OpenEnrollmentRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateCarrier,
  UpdateCarrier,
  CreatePlan,
  UpdatePlan,
  PlanFilters,
  CreateDependent,
  UpdateDependent,
  CreateEnrollment,
  UpdateEnrollment,
  WaiveEnrollment,
  EnrollmentFilters,
  CreateLifeEvent,
  ReviewLifeEvent,
  CreateOpenEnrollment,
  SubmitElections,
  PaginationQuery,
  CarrierResponse,
  PlanResponse,
  DependentResponse,
  EnrollmentResponse,
  LifeEventResponse,
  OpenEnrollmentResponse,
  BenefitCostSummary,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type DomainEventType =
  | "benefits.carrier.created"
  | "benefits.carrier.updated"
  | "benefits.plan.created"
  | "benefits.plan.updated"
  | "benefits.enrollment.created"
  | "benefits.enrollment.updated"
  | "benefits.enrollment.terminated"
  | "benefits.enrollment.waived"
  | "benefits.life_event.created"
  | "benefits.life_event.approved"
  | "benefits.life_event.rejected"
  | "benefits.open_enrollment.created"
  | "benefits.open_enrollment.activated"
  | "benefits.elections.submitted";

// =============================================================================
// Benefits Service
// =============================================================================

export class BenefitsService {
  constructor(
    private repository: BenefitsRepository,
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
  // Carrier Methods
  // ===========================================================================

  async listCarriers(
    context: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<CarrierResponse>> {
    const result = await this.repository.findCarriers(context, pagination);

    return {
      items: result.items.map(this.mapCarrierToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getCarrier(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<CarrierResponse>> {
    const carrier = await this.repository.findCarrierById(context, id);

    if (!carrier) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Carrier not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapCarrierToResponse(carrier),
    };
  }

  async createCarrier(
    context: TenantContext,
    data: CreateCarrier
  ): Promise<ServiceResult<CarrierResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const carrier = await this.repository.createCarrier(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "benefit_carrier",
        carrier.id,
        "benefits.carrier.created",
        { carrier: this.mapCarrierToResponse(carrier) }
      );

      return carrier;
    });

    return {
      success: true,
      data: this.mapCarrierToResponse(result),
    };
  }

  async updateCarrier(
    context: TenantContext,
    id: string,
    data: UpdateCarrier
  ): Promise<ServiceResult<CarrierResponse>> {
    const existing = await this.repository.findCarrierById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Carrier not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const carrier = await this.repository.updateCarrier(tx, context, id, data);

      if (carrier) {
        await this.emitEvent(
          tx,
          context,
          "benefit_carrier",
          id,
          "benefits.carrier.updated",
          { carrier: this.mapCarrierToResponse(carrier), changes: data }
        );
      }

      return carrier;
    });

    return {
      success: true,
      data: this.mapCarrierToResponse(result!),
    };
  }

  // ===========================================================================
  // Plan Methods
  // ===========================================================================

  async listPlans(
    context: TenantContext,
    filters: PlanFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PlanResponse>> {
    const result = await this.repository.findPlans(context, filters, pagination);

    const itemsWithCosts = await Promise.all(
      result.items.map(async (plan) => {
        const costs = await this.repository.getPlanCosts(context, plan.id);
        return { ...plan, costs };
      })
    );

    return {
      items: itemsWithCosts.map(this.mapPlanToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getPlan(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PlanResponse>> {
    const plan = await this.repository.findPlanById(context, id);

    if (!plan) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Plan not found",
          details: { id },
        },
      };
    }

    const costs = await this.repository.getPlanCosts(context, id);
    const planWithCosts = { ...plan, costs };

    return {
      success: true,
      data: this.mapPlanToResponse(planWithCosts),
    };
  }

  async createPlan(
    context: TenantContext,
    data: CreatePlan
  ): Promise<ServiceResult<PlanResponse>> {
    // Validate carrier exists if specified
    if (data.carrier_id) {
      const carrier = await this.repository.findCarrierById(context, data.carrier_id);
      if (!carrier) {
        return {
          success: false,
          error: {
            code: "INVALID_CARRIER",
            message: "Carrier not found",
            details: { carrier_id: data.carrier_id },
          },
        };
      }
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const plan = await this.repository.createPlan(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "benefit_plan",
        plan.id,
        "benefits.plan.created",
        { planId: plan.id, name: plan.name, category: plan.category }
      );

      return plan;
    });

    const costs = await this.repository.getPlanCosts(context, result.id);
    const planWithCosts = { ...result, costs };

    return {
      success: true,
      data: this.mapPlanToResponse(planWithCosts),
    };
  }

  async updatePlan(
    context: TenantContext,
    id: string,
    data: UpdatePlan
  ): Promise<ServiceResult<PlanResponse>> {
    const existing = await this.repository.findPlanById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Plan not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const plan = await this.repository.updatePlan(tx, context, id, data);

      if (plan) {
        await this.emitEvent(
          tx,
          context,
          "benefit_plan",
          id,
          "benefits.plan.updated",
          { plan, changes: data }
        );
      }

      return plan;
    });

    const costs = await this.repository.getPlanCosts(context, id);
    const planWithCosts = { ...result!, costs };

    return {
      success: true,
      data: this.mapPlanToResponse(planWithCosts),
    };
  }

  // ===========================================================================
  // Dependent Methods
  // ===========================================================================

  async listDependents(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<DependentResponse[]>> {
    const dependents = await this.repository.findDependents(context, employeeId);

    return {
      success: true,
      data: dependents.map(this.mapDependentToResponse),
    };
  }

  async createDependent(
    context: TenantContext,
    employeeId: string,
    data: CreateDependent
  ): Promise<ServiceResult<DependentResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return await this.repository.createDependent(tx, context, employeeId, data);
    });

    return {
      success: true,
      data: this.mapDependentToResponse(result),
    };
  }

  async updateDependent(
    context: TenantContext,
    id: string,
    data: UpdateDependent
  ): Promise<ServiceResult<DependentResponse>> {
    const existing = await this.repository.findDependentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Dependent not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      return await this.repository.updateDependent(tx, context, id, data);
    });

    return {
      success: true,
      data: this.mapDependentToResponse(result!),
    };
  }

  async deleteDependent(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findDependentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Dependent not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteDependent(tx, context, id);
    });

    return { success: true };
  }

  // ===========================================================================
  // Enrollment Methods
  // ===========================================================================

  async listEnrollments(
    context: TenantContext,
    filters: EnrollmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EnrollmentResponse>> {
    const result = await this.repository.findEnrollments(context, filters, pagination);

    const enrichedItems = await Promise.all(
      result.items.map(async (enrollment) => {
        const dependents = await this.getDependentDetails(context, enrollment.coveredDependents);
        return { ...enrollment, dependentDetails: dependents };
      })
    );

    return {
      items: enrichedItems.map(this.mapEnrollmentToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getEnrollment(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EnrollmentResponse>> {
    const enrollment = await this.repository.findEnrollmentById(context, id);

    if (!enrollment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Enrollment not found",
          details: { id },
        },
      };
    }

    const dependents = await this.getDependentDetails(context, enrollment.coveredDependents);
    const enriched = { ...enrollment, dependentDetails: dependents };

    return {
      success: true,
      data: this.mapEnrollmentToResponse(enriched),
    };
  }

  async getEmployeeEnrollments(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EnrollmentResponse[]>> {
    const enrollments = await this.repository.getActiveEnrollments(context, employeeId);

    const enrichedEnrollments = await Promise.all(
      enrollments.map(async (enrollment) => {
        const dependents = await this.getDependentDetails(context, enrollment.coveredDependents);
        return { ...enrollment, dependentDetails: dependents };
      })
    );

    return {
      success: true,
      data: enrichedEnrollments.map(this.mapEnrollmentToResponse),
    };
  }

  async enrollEmployee(
    context: TenantContext,
    data: CreateEnrollment
  ): Promise<ServiceResult<EnrollmentResponse>> {
    // Validate plan exists and is active
    const plan = await this.repository.findPlanById(context, data.plan_id);
    if (!plan) {
      return {
        success: false,
        error: {
          code: "PLAN_NOT_FOUND",
          message: "Benefit plan not found",
          details: { plan_id: data.plan_id },
        },
      };
    }

    if (!plan.isActive) {
      return {
        success: false,
        error: {
          code: "PLAN_INACTIVE",
          message: "Benefit plan is not active",
          details: { plan_id: data.plan_id },
        },
      };
    }

    // Validate dependents if provided
    if (data.covered_dependents && data.covered_dependents.length > 0) {
      for (const depId of data.covered_dependents) {
        const dep = await this.repository.findDependentById(context, depId);
        if (!dep || dep.employeeId !== data.employee_id) {
          return {
            success: false,
            error: {
              code: "INVALID_DEPENDENT",
              message: "Dependent not found or does not belong to employee",
              details: { dependent_id: depId },
            },
          };
        }
      }
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const enrollment = await this.repository.createEnrollment(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "benefit_enrollment",
        enrollment.id,
        "benefits.enrollment.created",
        {
          enrollmentId: enrollment.id,
          employeeId: data.employee_id,
          planId: data.plan_id,
          coverageLevel: data.coverage_level,
        }
      );

      return enrollment;
    });

    const dependents = await this.getDependentDetails(context, result.coveredDependents);
    const enriched = { ...result, dependentDetails: dependents };

    return {
      success: true,
      data: this.mapEnrollmentToResponse(enriched),
    };
  }

  async updateEnrollment(
    context: TenantContext,
    id: string,
    data: UpdateEnrollment
  ): Promise<ServiceResult<EnrollmentResponse>> {
    const existing = await this.repository.findEnrollmentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Enrollment not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const enrollment = await this.repository.updateEnrollment(tx, context, id, data);

      if (enrollment) {
        await this.emitEvent(
          tx,
          context,
          "benefit_enrollment",
          id,
          "benefits.enrollment.updated",
          { enrollment, changes: data }
        );
      }

      return enrollment;
    });

    const dependents = await this.getDependentDetails(context, result!.coveredDependents);
    const enriched = { ...result!, dependentDetails: dependents };

    return {
      success: true,
      data: this.mapEnrollmentToResponse(enriched),
    };
  }

  async terminateEnrollment(
    context: TenantContext,
    id: string,
    effectiveDate: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findEnrollmentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Enrollment not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.terminateEnrollment(tx, context, id, effectiveDate);

      await this.emitEvent(
        tx,
        context,
        "benefit_enrollment",
        id,
        "benefits.enrollment.terminated",
        { enrollmentId: id, effectiveDate }
      );
    });

    return { success: true };
  }

  async getEmployeeBenefitCosts(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<BenefitCostSummary[]>> {
    const costs = await this.repository.getEmployeeBenefitCosts(context, employeeId);

    return {
      success: true,
      data: costs.map((c) => ({
        category: c.category,
        employee_total: c.employeeTotal,
        employer_total: c.employerTotal,
        grand_total: c.grandTotal,
      })),
    };
  }

  // ===========================================================================
  // Life Event Methods
  // ===========================================================================

  async listLifeEvents(
    context: TenantContext,
    employeeId?: string,
    status?: "pending" | "approved" | "rejected" | "expired"
  ): Promise<ServiceResult<LifeEventResponse[]>> {
    const events = await this.repository.findLifeEvents(context, employeeId, status);

    return {
      success: true,
      data: events.map(this.mapLifeEventToResponse),
    };
  }

  async getLifeEvent(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<LifeEventResponse>> {
    const event = await this.repository.findLifeEventById(context, id);

    if (!event) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Life event not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapLifeEventToResponse(event),
    };
  }

  async createLifeEvent(
    context: TenantContext,
    employeeId: string,
    data: CreateLifeEvent
  ): Promise<ServiceResult<LifeEventResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const event = await this.repository.createLifeEvent(tx, context, employeeId, data);

      await this.emitEvent(
        tx,
        context,
        "life_event",
        event.id,
        "benefits.life_event.created",
        {
          eventId: event.id,
          employeeId,
          eventType: data.event_type,
          eventDate: data.event_date,
        }
      );

      return event;
    });

    return {
      success: true,
      data: this.mapLifeEventToResponse(result),
    };
  }

  async reviewLifeEvent(
    context: TenantContext,
    id: string,
    data: ReviewLifeEvent
  ): Promise<ServiceResult<LifeEventResponse>> {
    const existing = await this.repository.findLifeEventById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Life event not found",
          details: { id },
        },
      };
    }

    if (existing.status !== "pending") {
      return {
        success: false,
        error: {
          code: "ALREADY_REVIEWED",
          message: "Life event has already been reviewed",
          details: { id, currentStatus: existing.status },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const event = await this.repository.reviewLifeEvent(
        tx,
        context,
        id,
        data.status,
        data.rejection_reason
      );

      if (event) {
        const eventType = data.status === "approved"
          ? "benefits.life_event.approved"
          : "benefits.life_event.rejected";

        await this.emitEvent(
          tx,
          context,
          "life_event",
          id,
          eventType,
          { event, reviewedBy: context.userId }
        );
      }

      return event;
    });

    return {
      success: true,
      data: this.mapLifeEventToResponse(result!),
    };
  }

  // ===========================================================================
  // Open Enrollment Methods
  // ===========================================================================

  async listOpenEnrollmentPeriods(
    context: TenantContext,
    activeOnly: boolean = false
  ): Promise<ServiceResult<OpenEnrollmentResponse[]>> {
    const periods = await this.repository.findOpenEnrollmentPeriods(context, activeOnly);

    return {
      success: true,
      data: periods.map(this.mapOpenEnrollmentToResponse),
    };
  }

  async getOpenEnrollmentPeriod(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<OpenEnrollmentResponse>> {
    const period = await this.repository.findOpenEnrollmentById(context, id);

    if (!period) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Open enrollment period not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapOpenEnrollmentToResponse(period),
    };
  }

  async getCurrentOpenEnrollment(
    context: TenantContext
  ): Promise<ServiceResult<OpenEnrollmentResponse | null>> {
    const period = await this.repository.getCurrentOpenEnrollment(context);

    return {
      success: true,
      data: period ? this.mapOpenEnrollmentToResponse(period) : null,
    };
  }

  async createOpenEnrollment(
    context: TenantContext,
    data: CreateOpenEnrollment
  ): Promise<ServiceResult<OpenEnrollmentResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const period = await this.repository.createOpenEnrollment(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "open_enrollment",
        period.id,
        "benefits.open_enrollment.created",
        { periodId: period.id, name: data.name }
      );

      return period;
    });

    return {
      success: true,
      data: this.mapOpenEnrollmentToResponse(result),
    };
  }

  async activateOpenEnrollment(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findOpenEnrollmentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Open enrollment period not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.activateOpenEnrollment(tx, context, id);

      await this.emitEvent(
        tx,
        context,
        "open_enrollment",
        id,
        "benefits.open_enrollment.activated",
        { periodId: id }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async getDependentDetails(
    context: TenantContext,
    dependentIds: string[]
  ): Promise<{ id: string; name: string; relationship: string }[]> {
    if (!dependentIds || dependentIds.length === 0) {
      return [];
    }

    const dependents: { id: string; name: string; relationship: string }[] = [];

    for (const id of dependentIds) {
      const dep = await this.repository.findDependentById(context, id);
      if (dep) {
        dependents.push({
          id: dep.id,
          name: `${dep.firstName} ${dep.lastName}`,
          relationship: dep.relationship,
        });
      }
    }

    return dependents;
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapCarrierToResponse(row: CarrierRow): CarrierResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      code: row.code,
      contact_email: row.contactEmail,
      contact_phone: row.contactPhone,
      website: row.website,
      address: row.address,
      notes: row.notes,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private mapPlanToResponse(
    row: PlanRow & { costs?: { coverageLevel: string; employeeCost: string; employerCost: string; totalCost: string }[] }
  ): PlanResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      plan_code: row.planCode,
      category: row.category,
      carrier_id: row.carrierId,
      carrier_name: row.carrierName,
      description: row.description,
      contribution_type: row.contributionType as "employee_only" | "employer_only" | "shared" | "voluntary",
      effective_from: row.effectiveFrom.toISOString().split("T")[0]!,
      effective_to: row.effectiveTo?.toISOString().split("T")[0] || null,
      waiting_period_days: row.waitingPeriodDays,
      is_active: row.isActive,
      costs: row.costs?.map((c) => ({
        coverage_level: c.coverageLevel as "employee_only" | "employee_spouse" | "employee_children" | "family",
        employee_cost: parseFloat(c.employeeCost),
        employer_cost: parseFloat(c.employerCost),
        total_cost: parseFloat(c.totalCost),
      })),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private mapDependentToResponse(row: DependentRow): DependentResponse {
    const dob = new Date(row.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear() -
      (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);

    return {
      id: row.id,
      employee_id: row.employeeId,
      first_name: row.firstName,
      middle_name: row.middleName,
      last_name: row.lastName,
      full_name: row.middleName
        ? `${row.firstName} ${row.middleName} ${row.lastName}`
        : `${row.firstName} ${row.lastName}`,
      relationship: row.relationship,
      date_of_birth: row.dateOfBirth.toISOString().split("T")[0]!,
      age,
      gender: row.gender,
      disabled: row.disabled,
      full_time_student: row.fullTimeStudent,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
    };
  }

  private mapEnrollmentToResponse(
    row: EnrollmentRow & { dependentDetails?: { id: string; name: string; relationship: string }[] }
  ): EnrollmentResponse {
    return {
      id: row.id,
      employee_id: row.employeeId,
      plan_id: row.planId,
      plan_name: row.planName || "",
      plan_category: row.planCategory || "other",
      coverage_level: row.coverageLevel,
      status: row.status,
      effective_from: row.effectiveFrom.toISOString().split("T")[0]!,
      effective_to: row.effectiveTo?.toISOString().split("T")[0] || null,
      employee_contribution: parseFloat(row.employeeContribution),
      employer_contribution: parseFloat(row.employerContribution),
      total_contribution: parseFloat(row.employeeContribution) + parseFloat(row.employerContribution),
      covered_dependents: row.dependentDetails || [],
      enrollment_type: row.enrollmentType,
      created_at: row.createdAt.toISOString(),
    };
  }

  private mapLifeEventToResponse(row: LifeEventRow): LifeEventResponse {
    const today = new Date();
    const windowEnd = new Date(row.enrollmentWindowEnd);
    const daysRemaining = Math.max(0, Math.ceil((windowEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      id: row.id,
      employee_id: row.employeeId,
      employee_name: row.employeeName,
      event_type: row.eventType,
      event_date: row.eventDate.toISOString().split("T")[0]!,
      description: row.description,
      enrollment_window_start: row.enrollmentWindowStart.toISOString().split("T")[0]!,
      enrollment_window_end: row.enrollmentWindowEnd.toISOString().split("T")[0]!,
      days_remaining: daysRemaining,
      status: row.status,
      documentation: row.documentation,
      reviewed_by: row.reviewedBy,
      reviewed_at: row.reviewedAt?.toISOString() || null,
      created_at: row.createdAt.toISOString(),
    };
  }

  private mapOpenEnrollmentToResponse(row: OpenEnrollmentRow): OpenEnrollmentResponse {
    const today = new Date();
    const endDate = new Date(row.endDate);
    const startDate = new Date(row.startDate);
    const daysRemaining = row.isActive && today >= startDate && today <= endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : undefined;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      start_date: row.startDate.toISOString().split("T")[0]!,
      end_date: row.endDate.toISOString().split("T")[0]!,
      coverage_effective_date: row.coverageEffectiveDate.toISOString().split("T")[0]!,
      plan_year_start: row.planYearStart.toISOString().split("T")[0]!,
      plan_year_end: row.planYearEnd.toISOString().split("T")[0]!,
      is_active: row.isActive,
      days_remaining: daysRemaining,
      created_at: row.createdAt.toISOString(),
    };
  }
}
