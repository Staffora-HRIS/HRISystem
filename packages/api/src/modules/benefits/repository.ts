/**
 * Benefits Module - Repository Layer
 *
 * Provides data access methods for Benefits Administration.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
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
  EnrollmentFilters,
  CreateLifeEvent,
  CreateOpenEnrollment,
  PaginationQuery,
  BenefitCategory,
  CoverageLevel,
  EnrollmentStatus,
  LifeEventStatus,
  LifeEventType,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface CarrierRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: Record<string, unknown> | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  planCode: string | null;
  category: BenefitCategory;
  carrierId: string | null;
  carrierName?: string | null;
  description: string | null;
  contributionType: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  waitingPeriodDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanCostRow extends Row {
  id: string;
  planId: string;
  coverageLevel: CoverageLevel;
  employeeCost: string;
  employerCost: string;
  totalCost: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface DependentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  relationship: string;
  dateOfBirth: Date;
  gender: string | null;
  ssnLastFour: string | null;
  disabled: boolean;
  fullTimeStudent: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  planId: string;
  planName?: string;
  planCategory?: BenefitCategory;
  coverageLevel: CoverageLevel;
  status: EnrollmentStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  employeeContribution: string;
  employerContribution: string;
  totalContribution?: string;
  coveredDependents: string[];
  enrollmentType: string;
  lifeEventId: string | null;
  waiverReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LifeEventRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName?: string;
  eventType: LifeEventType;
  eventDate: Date;
  description: string | null;
  documentation: unknown[];
  enrollmentWindowStart: Date;
  enrollmentWindowEnd: Date;
  status: LifeEventStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenEnrollmentRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  coverageEffectiveDate: Date;
  planYearStart: Date;
  planYearEnd: Date;
  isActive: boolean;
  eligiblePlanIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Benefits Repository
// =============================================================================

export class BenefitsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Carrier Methods
  // ===========================================================================

  async findCarriers(
    context: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<CarrierRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CarrierRow[]>`
        SELECT id, tenant_id, name, code, contact_email, contact_phone,
               website, address, notes, is_active, created_at, updated_at
        FROM app.benefit_carriers
        WHERE is_active = true
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY name, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findCarrierById(
    context: TenantContext,
    id: string
  ): Promise<CarrierRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CarrierRow[]>`
        SELECT id, tenant_id, name, code, contact_email, contact_phone,
               website, address, notes, is_active, created_at, updated_at
        FROM app.benefit_carriers
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async createCarrier(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateCarrier
  ): Promise<CarrierRow> {
    const rows = await tx<CarrierRow[]>`
      INSERT INTO app.benefit_carriers (
        tenant_id, name, code, contact_email, contact_phone,
        website, address, notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.name},
        ${data.code || null},
        ${data.contact_email || null},
        ${data.contact_phone || null},
        ${data.website || null},
        ${data.address ? JSON.stringify(data.address) : null}::jsonb,
        ${data.notes || null}
      )
      RETURNING id, tenant_id, name, code, contact_email, contact_phone,
                website, address, notes, is_active, created_at, updated_at
    `;

    return rows[0]!;
  }

  async updateCarrier(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateCarrier
  ): Promise<CarrierRow | null> {
    const rows = await tx<CarrierRow[]>`
      UPDATE app.benefit_carriers
      SET
        name = COALESCE(${data.name}, name),
        code = COALESCE(${data.code}, code),
        contact_email = COALESCE(${data.contact_email}, contact_email),
        contact_phone = COALESCE(${data.contact_phone}, contact_phone),
        website = COALESCE(${data.website}, website),
        address = COALESCE(${data.address ? JSON.stringify(data.address) : null}::jsonb, address),
        notes = COALESCE(${data.notes}, notes),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, name, code, contact_email, contact_phone,
                website, address, notes, is_active, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Plan Methods
  // ===========================================================================

  async findPlans(
    context: TenantContext,
    filters: PlanFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PlanRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PlanRow[]>`
        SELECT
          bp.id, bp.tenant_id, bp.name, bp.plan_code, bp.category,
          bp.carrier_id, bc.name as carrier_name, bp.description,
          bp.contribution_type, bp.effective_from, bp.effective_to,
          bp.waiting_period_days, bp.is_active, bp.created_at, bp.updated_at
        FROM app.benefit_plans bp
        LEFT JOIN app.benefit_carriers bc ON bp.carrier_id = bc.id
        WHERE 1=1
          ${filters.category ? tx`AND bp.category = ${filters.category}::app.benefit_category` : tx``}
          ${filters.is_active !== undefined ? tx`AND bp.is_active = ${filters.is_active}` : tx``}
          ${filters.search ? tx`AND (bp.name ILIKE ${'%' + filters.search + '%'} OR bp.plan_code ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${cursor ? tx`AND bp.id > ${cursor}::uuid` : tx``}
        ORDER BY bp.category, bp.name, bp.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findPlanById(
    context: TenantContext,
    id: string
  ): Promise<PlanRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PlanRow[]>`
        SELECT
          bp.id, bp.tenant_id, bp.name, bp.plan_code, bp.category,
          bp.carrier_id, bc.name as carrier_name, bp.description,
          bp.contribution_type, bp.effective_from, bp.effective_to,
          bp.waiting_period_days, bp.is_active, bp.created_at, bp.updated_at
        FROM app.benefit_plans bp
        LEFT JOIN app.benefit_carriers bc ON bp.carrier_id = bc.id
        WHERE bp.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async getPlanCosts(
    context: TenantContext,
    planId: string,
    asOfDate: string = new Date().toISOString().split("T")[0]!
  ): Promise<PlanCostRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PlanCostRow[]>`
        SELECT id, plan_id, coverage_level,
               employee_cost::text, employer_cost::text, total_cost::text,
               effective_from, effective_to
        FROM app.benefit_plan_costs
        WHERE plan_id = ${planId}::uuid
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to > ${asOfDate}::date)
        ORDER BY
          CASE coverage_level
            WHEN 'employee_only' THEN 1
            WHEN 'employee_spouse' THEN 2
            WHEN 'employee_children' THEN 3
            WHEN 'family' THEN 4
          END
      `;
      return rows;
    });

    return result;
  }

  async createPlan(
    tx: TransactionSql,
    context: TenantContext,
    data: CreatePlan
  ): Promise<PlanRow> {
    const rows = await tx<PlanRow[]>`
      INSERT INTO app.benefit_plans (
        tenant_id, name, plan_code, category, carrier_id, description,
        contribution_type, effective_from, effective_to, waiting_period_days
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.name},
        ${data.plan_code || null},
        ${data.category}::app.benefit_category,
        ${data.carrier_id || null}::uuid,
        ${data.description || null},
        ${data.contribution_type}::app.contribution_type,
        ${data.effective_from}::date,
        ${data.effective_to || null}::date,
        ${data.waiting_period_days || 0}
      )
      RETURNING id, tenant_id, name, plan_code, category, carrier_id,
                description, contribution_type, effective_from, effective_to,
                waiting_period_days, is_active, created_at, updated_at
    `;

    const plan = rows[0]!;

    // Insert plan costs if provided
    if (data.costs && data.costs.length > 0) {
      for (const cost of data.costs) {
        await tx`
          INSERT INTO app.benefit_plan_costs (
            tenant_id, plan_id, coverage_level, employee_cost, employer_cost, effective_from
          )
          VALUES (
            ${context.tenantId}::uuid,
            ${plan.id}::uuid,
            ${cost.coverage_level}::app.coverage_level,
            ${cost.employee_cost},
            ${cost.employer_cost},
            ${data.effective_from}::date
          )
        `;
      }
    }

    return plan;
  }

  async updatePlan(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdatePlan
  ): Promise<PlanRow | null> {
    const rows = await tx<PlanRow[]>`
      UPDATE app.benefit_plans
      SET
        name = COALESCE(${data.name}, name),
        plan_code = COALESCE(${data.plan_code}, plan_code),
        category = COALESCE(${data.category}::app.benefit_category, category),
        carrier_id = COALESCE(${data.carrier_id}::uuid, carrier_id),
        description = COALESCE(${data.description}, description),
        contribution_type = COALESCE(${data.contribution_type}::app.contribution_type, contribution_type),
        effective_from = COALESCE(${data.effective_from}::date, effective_from),
        effective_to = COALESCE(${data.effective_to}::date, effective_to),
        waiting_period_days = COALESCE(${data.waiting_period_days}, waiting_period_days),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, name, plan_code, category, carrier_id,
                description, contribution_type, effective_from, effective_to,
                waiting_period_days, is_active, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Dependent Methods
  // ===========================================================================

  async findDependents(
    context: TenantContext,
    employeeId: string
  ): Promise<DependentRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<DependentRow[]>`
        SELECT id, tenant_id, employee_id, first_name, middle_name, last_name,
               relationship, date_of_birth, gender, ssn_last_four,
               disabled, full_time_student, is_active, created_at, updated_at
        FROM app.benefit_dependents
        WHERE employee_id = ${employeeId}::uuid
          AND is_active = true
        ORDER BY relationship, first_name
      `;
      return rows;
    });

    return result;
  }

  async findDependentById(
    context: TenantContext,
    id: string
  ): Promise<DependentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<DependentRow[]>`
        SELECT id, tenant_id, employee_id, first_name, middle_name, last_name,
               relationship, date_of_birth, gender, ssn_last_four,
               disabled, full_time_student, is_active, created_at, updated_at
        FROM app.benefit_dependents
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async createDependent(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: CreateDependent
  ): Promise<DependentRow> {
    const rows = await tx<DependentRow[]>`
      INSERT INTO app.benefit_dependents (
        tenant_id, employee_id, first_name, middle_name, last_name,
        relationship, date_of_birth, gender, ssn_last_four,
        disabled, full_time_student
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.first_name},
        ${data.middle_name || null},
        ${data.last_name},
        ${data.relationship},
        ${data.date_of_birth}::date,
        ${data.gender || null}::app.gender,
        ${data.ssn_last_four || null},
        ${data.disabled || false},
        ${data.full_time_student || false}
      )
      RETURNING id, tenant_id, employee_id, first_name, middle_name, last_name,
                relationship, date_of_birth, gender, ssn_last_four,
                disabled, full_time_student, is_active, created_at, updated_at
    `;

    return rows[0]!;
  }

  async updateDependent(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateDependent
  ): Promise<DependentRow | null> {
    const rows = await tx<DependentRow[]>`
      UPDATE app.benefit_dependents
      SET
        first_name = COALESCE(${data.first_name}, first_name),
        middle_name = COALESCE(${data.middle_name}, middle_name),
        last_name = COALESCE(${data.last_name}, last_name),
        relationship = COALESCE(${data.relationship}, relationship),
        date_of_birth = COALESCE(${data.date_of_birth}::date, date_of_birth),
        gender = COALESCE(${data.gender}::app.gender, gender),
        disabled = COALESCE(${data.disabled}, disabled),
        full_time_student = COALESCE(${data.full_time_student}, full_time_student),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, employee_id, first_name, middle_name, last_name,
                relationship, date_of_birth, gender, ssn_last_four,
                disabled, full_time_student, is_active, created_at, updated_at
    `;

    return rows[0] || null;
  }

  async deleteDependent(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.benefit_dependents
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Enrollment Methods
  // ===========================================================================

  async findEnrollments(
    context: TenantContext,
    filters: EnrollmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EnrollmentRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EnrollmentRow[]>`
        SELECT
          be.id, be.tenant_id, be.employee_id, be.plan_id,
          bp.name as plan_name, bp.category as plan_category,
          be.coverage_level, be.status, be.effective_from, be.effective_to,
          be.employee_contribution::text, be.employer_contribution::text,
          (be.employee_contribution + be.employer_contribution)::text as total_contribution,
          be.covered_dependents, be.enrollment_type, be.life_event_id,
          be.waiver_reason, be.created_at, be.updated_at
        FROM app.benefit_enrollments be
        INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
        WHERE 1=1
          ${filters.employee_id ? tx`AND be.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.plan_id ? tx`AND be.plan_id = ${filters.plan_id}::uuid` : tx``}
          ${filters.status ? tx`AND be.status = ${filters.status}::app.enrollment_status` : tx``}
          ${filters.category ? tx`AND bp.category = ${filters.category}::app.benefit_category` : tx``}
          ${cursor ? tx`AND be.id > ${cursor}::uuid` : tx``}
        ORDER BY bp.category, bp.name, be.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findEnrollmentById(
    context: TenantContext,
    id: string
  ): Promise<EnrollmentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EnrollmentRow[]>`
        SELECT
          be.id, be.tenant_id, be.employee_id, be.plan_id,
          bp.name as plan_name, bp.category as plan_category,
          be.coverage_level, be.status, be.effective_from, be.effective_to,
          be.employee_contribution::text, be.employer_contribution::text,
          (be.employee_contribution + be.employer_contribution)::text as total_contribution,
          be.covered_dependents, be.enrollment_type, be.life_event_id,
          be.waiver_reason, be.created_at, be.updated_at
        FROM app.benefit_enrollments be
        INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
        WHERE be.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async getActiveEnrollments(
    context: TenantContext,
    employeeId: string,
    asOfDate: string = new Date().toISOString().split("T")[0]!
  ): Promise<EnrollmentRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EnrollmentRow[]>`
        SELECT
          be.id, be.tenant_id, be.employee_id, be.plan_id,
          bp.name as plan_name, bp.category as plan_category,
          be.coverage_level, be.status, be.effective_from, be.effective_to,
          be.employee_contribution::text, be.employer_contribution::text,
          (be.employee_contribution + be.employer_contribution)::text as total_contribution,
          be.covered_dependents, be.enrollment_type, be.life_event_id,
          be.waiver_reason, be.created_at, be.updated_at
        FROM app.benefit_enrollments be
        INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
        WHERE be.employee_id = ${employeeId}::uuid
          AND be.status = 'active'
          AND be.effective_from <= ${asOfDate}::date
          AND (be.effective_to IS NULL OR be.effective_to > ${asOfDate}::date)
        ORDER BY bp.category, bp.name
      `;
      return rows;
    });

    return result;
  }

  async createEnrollment(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateEnrollment
  ): Promise<EnrollmentRow> {
    // Get plan costs for coverage level
    const costs = await tx<{ employeeCost: string; employerCost: string }[]>`
      SELECT employee_cost::text, employer_cost::text
      FROM app.benefit_plan_costs
      WHERE plan_id = ${data.plan_id}::uuid
        AND coverage_level = ${data.coverage_level}::app.coverage_level
        AND effective_from <= ${data.effective_from}::date
        AND (effective_to IS NULL OR effective_to > ${data.effective_from}::date)
      LIMIT 1
    `;

    const employeeCost = costs[0]?.employeeCost || "0";
    const employerCost = costs[0]?.employerCost || "0";

    const rows = await tx<EnrollmentRow[]>`
      INSERT INTO app.benefit_enrollments (
        tenant_id, employee_id, plan_id, coverage_level, status,
        effective_from, employee_contribution, employer_contribution,
        covered_dependents, enrollment_type, life_event_id
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.plan_id}::uuid,
        ${data.coverage_level}::app.coverage_level,
        'active'::app.enrollment_status,
        ${data.effective_from}::date,
        ${employeeCost}::decimal,
        ${employerCost}::decimal,
        ${data.covered_dependents || []}::uuid[],
        ${data.enrollment_type || "new_hire"},
        ${data.life_event_id || null}::uuid
      )
      RETURNING id, tenant_id, employee_id, plan_id, coverage_level, status,
                effective_from, effective_to, employee_contribution::text,
                employer_contribution::text, covered_dependents, enrollment_type,
                life_event_id, waiver_reason, created_at, updated_at
    `;

    return rows[0]!;
  }

  async updateEnrollment(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateEnrollment
  ): Promise<EnrollmentRow | null> {
    const rows = await tx<EnrollmentRow[]>`
      UPDATE app.benefit_enrollments
      SET
        coverage_level = COALESCE(${data.coverage_level}::app.coverage_level, coverage_level),
        covered_dependents = COALESCE(${data.covered_dependents}::uuid[], covered_dependents),
        effective_to = COALESCE(${data.effective_to}::date, effective_to),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, employee_id, plan_id, coverage_level, status,
                effective_from, effective_to, employee_contribution::text,
                employer_contribution::text, covered_dependents, enrollment_type,
                life_event_id, waiver_reason, created_at, updated_at
    `;

    return rows[0] || null;
  }

  async terminateEnrollment(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    effectiveDate: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.benefit_enrollments
      SET
        status = 'terminated'::app.enrollment_status,
        effective_to = ${effectiveDate}::date,
        updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Life Event Methods
  // ===========================================================================

  async findLifeEvents(
    context: TenantContext,
    employeeId?: string,
    status?: LifeEventStatus
  ): Promise<LifeEventRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<LifeEventRow[]>`
        SELECT
          le.id, le.tenant_id, le.employee_id,
          app.get_employee_display_name(le.employee_id) as employee_name,
          le.event_type, le.event_date, le.description, le.documentation,
          le.enrollment_window_start, le.enrollment_window_end,
          le.status, le.rejection_reason, le.reviewed_by, le.reviewed_at,
          le.created_at, le.updated_at
        FROM app.life_events le
        WHERE 1=1
          ${employeeId ? tx`AND le.employee_id = ${employeeId}::uuid` : tx``}
          ${status ? tx`AND le.status = ${status}::app.life_event_status` : tx``}
        ORDER BY le.created_at DESC
      `;
      return rows;
    });

    return result;
  }

  async findLifeEventById(
    context: TenantContext,
    id: string
  ): Promise<LifeEventRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<LifeEventRow[]>`
        SELECT
          le.id, le.tenant_id, le.employee_id,
          app.get_employee_display_name(le.employee_id) as employee_name,
          le.event_type, le.event_date, le.description, le.documentation,
          le.enrollment_window_start, le.enrollment_window_end,
          le.status, le.rejection_reason, le.reviewed_by, le.reviewed_at,
          le.created_at, le.updated_at
        FROM app.life_events le
        WHERE le.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async createLifeEvent(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: CreateLifeEvent
  ): Promise<LifeEventRow> {
    const eventDate = new Date(data.event_date);
    const windowEnd = new Date(eventDate);
    windowEnd.setDate(windowEnd.getDate() + 30);

    const rows = await tx<LifeEventRow[]>`
      INSERT INTO app.life_events (
        tenant_id, employee_id, event_type, event_date, description,
        documentation, enrollment_window_start, enrollment_window_end
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.event_type}::app.life_event_type,
        ${data.event_date}::date,
        ${data.description || null},
        ${JSON.stringify(data.documentation || [])}::jsonb,
        ${data.event_date}::date,
        ${windowEnd.toISOString().split("T")[0]}::date
      )
      RETURNING id, tenant_id, employee_id, event_type, event_date, description,
                documentation, enrollment_window_start, enrollment_window_end,
                status, rejection_reason, reviewed_by, reviewed_at,
                created_at, updated_at
    `;

    return rows[0]!;
  }

  async reviewLifeEvent(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    status: "approved" | "rejected",
    rejectionReason?: string
  ): Promise<LifeEventRow | null> {
    const rows = await tx<LifeEventRow[]>`
      UPDATE app.life_events
      SET
        status = ${status}::app.life_event_status,
        rejection_reason = ${rejectionReason || null},
        reviewed_by = ${context.userId}::uuid,
        reviewed_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, employee_id, event_type, event_date, description,
                documentation, enrollment_window_start, enrollment_window_end,
                status, rejection_reason, reviewed_by, reviewed_at,
                created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Open Enrollment Methods
  // ===========================================================================

  async findOpenEnrollmentPeriods(
    context: TenantContext,
    activeOnly: boolean = false
  ): Promise<OpenEnrollmentRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OpenEnrollmentRow[]>`
        SELECT id, tenant_id, name, description, start_date, end_date,
               coverage_effective_date, plan_year_start, plan_year_end,
               is_active, eligible_plan_ids, created_at, updated_at
        FROM app.open_enrollment_periods
        WHERE 1=1
          ${activeOnly ? tx`AND is_active = true` : tx``}
        ORDER BY start_date DESC
      `;
      return rows;
    });

    return result;
  }

  async findOpenEnrollmentById(
    context: TenantContext,
    id: string
  ): Promise<OpenEnrollmentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OpenEnrollmentRow[]>`
        SELECT id, tenant_id, name, description, start_date, end_date,
               coverage_effective_date, plan_year_start, plan_year_end,
               is_active, eligible_plan_ids, created_at, updated_at
        FROM app.open_enrollment_periods
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async getCurrentOpenEnrollment(
    context: TenantContext,
    asOfDate: string = new Date().toISOString().split("T")[0]!
  ): Promise<OpenEnrollmentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OpenEnrollmentRow[]>`
        SELECT id, tenant_id, name, description, start_date, end_date,
               coverage_effective_date, plan_year_start, plan_year_end,
               is_active, eligible_plan_ids, created_at, updated_at
        FROM app.open_enrollment_periods
        WHERE is_active = true
          AND start_date <= ${asOfDate}::date
          AND end_date >= ${asOfDate}::date
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  async createOpenEnrollment(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateOpenEnrollment
  ): Promise<OpenEnrollmentRow> {
    const rows = await tx<OpenEnrollmentRow[]>`
      INSERT INTO app.open_enrollment_periods (
        tenant_id, name, description, start_date, end_date,
        coverage_effective_date, plan_year_start, plan_year_end,
        eligible_plan_ids
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.name},
        ${data.description || null},
        ${data.start_date}::date,
        ${data.end_date}::date,
        ${data.coverage_effective_date}::date,
        ${data.plan_year_start}::date,
        ${data.plan_year_end}::date,
        ${data.eligible_plan_ids || []}::uuid[]
      )
      RETURNING id, tenant_id, name, description, start_date, end_date,
                coverage_effective_date, plan_year_start, plan_year_end,
                is_active, eligible_plan_ids, created_at, updated_at
    `;

    return rows[0]!;
  }

  async activateOpenEnrollment(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    // Deactivate all other periods first
    await tx`
      UPDATE app.open_enrollment_periods
      SET is_active = false, updated_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND id != ${id}::uuid
    `;

    const result = await tx`
      UPDATE app.open_enrollment_periods
      SET is_active = true, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Cost Summary Methods
  // ===========================================================================

  async getEmployeeBenefitCosts(
    context: TenantContext,
    employeeId: string,
    asOfDate: string = new Date().toISOString().split("T")[0]!
  ): Promise<{ category: BenefitCategory; employeeTotal: number; employerTotal: number; grandTotal: number }[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ category: BenefitCategory; employeeTotal: string; employerTotal: string; grandTotal: string }[]>`
        SELECT
          bp.category,
          SUM(be.employee_contribution)::text as employee_total,
          SUM(be.employer_contribution)::text as employer_total,
          SUM(be.employee_contribution + be.employer_contribution)::text as grand_total
        FROM app.benefit_enrollments be
        INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
        WHERE be.employee_id = ${employeeId}::uuid
          AND be.status = 'active'
          AND be.effective_from <= ${asOfDate}::date
          AND (be.effective_to IS NULL OR be.effective_to > ${asOfDate}::date)
        GROUP BY bp.category
        ORDER BY bp.category
      `;
      return rows;
    });

    return result.map((r) => ({
      category: r.category,
      employeeTotal: parseFloat(r.employeeTotal),
      employerTotal: parseFloat(r.employerTotal),
      grandTotal: parseFloat(r.grandTotal),
    }));
  }
}
