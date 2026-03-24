/**
 * Core HR Module - Employee Lifecycle Service
 *
 * Implements business logic for employee lifecycle operations:
 * hiring, termination, rehire, status transitions, NI category
 * updates, and statutory notice period calculations.
 *
 * Enforces invariants, validates state machine transitions,
 * and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { HRRepository, EmployeeRow } from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  canTransition as canTransitionEmployee,
  getValidTransitions as getValidEmployeeTransitions,
  EmployeeStates,
} from "@staffora/shared/state-machines";
import { calculateStatutoryNoticePeriod } from "@staffora/shared/utils";
import type {
  CreateEmployee,
  EmployeeStatusTransition,
  EmployeeTermination,
  EmployeeResponse,
  RehireEmployee,
  EmploymentRecordResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type LifecycleDomainEventType =
  | "hr.employee.created"
  | "hr.employee.terminated"
  | "hr.employee.rehired"
  | "hr.employee.status_changed"
  | "hr.employee.ni_category_changed"
  | "benefits.enrollment.ceased";

// =============================================================================
// Employee Lifecycle Service
// =============================================================================

export class EmployeeLifecycleService {
  constructor(
    private repository: HRRepository,
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
    eventType: LifecycleDomainEventType,
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
  // Hire
  // ===========================================================================

  /**
   * Hire a new employee
   */
  async hireEmployee(
    context: TenantContext,
    data: CreateEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<{ employeeId: string }>> {
    // Validate position exists and has headcount
    const positionHeadcount = await this.repository.getPositionHeadcount(
      context,
      data.position.position_id
    );

    if (positionHeadcount.headcount === 0) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: data.position.position_id },
        },
      };
    }

    if (positionHeadcount.currentCount >= positionHeadcount.headcount) {
      return {
        success: false,
        error: {
          code: "POSITION_OVERFILLED",
          message: "Position is already at maximum headcount",
          details: {
            position_id: data.position.position_id,
            headcount: positionHeadcount.headcount,
            current_count: positionHeadcount.currentCount,
          },
        },
      };
    }

    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.position.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "ORG_UNIT_NOT_FOUND",
          message: "Org unit not found",
          details: { org_unit_id: data.position.org_unit_id },
        },
      };
    }

    // Validate manager exists if specified
    if (data.manager_id) {
      const managerResult = await this.repository.findEmployeeById(context, data.manager_id);
      if (!managerResult.employee) {
        return {
          success: false,
          error: {
            code: "MANAGER_NOT_FOUND",
            message: "Manager not found",
            details: { manager_id: data.manager_id },
          },
        };
      }
      if (managerResult.employee.status !== "active" && managerResult.employee.status !== "on_leave") {
        return {
          success: false,
          error: {
            code: "INVALID_MANAGER",
            message: "Manager is not in active status",
            details: { manager_id: data.manager_id, status: managerResult.employee.status },
          },
        };
      }
    }

    // Generate employee number if not provided
    const employeeNumber = data.employee_number ||
      await this.repository.generateEmployeeNumber(context);

    // Create employee in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const created = await this.repository.createEmployee(
        tx,
        context,
        data,
        employeeNumber,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", created.employee.id, "hr.employee.created", {
        employeeId: created.employee.id,
        employeeNumber,
        hireDate: data.contract.hire_date,
      });

      return created;
    });

    return {
      success: true,
      data: { employeeId: result.employee.id },
    };
  }

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  /**
   * Transition employee status
   */
  async transitionStatus(
    context: TenantContext,
    employeeId: string,
    data: EmployeeStatusTransition,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Get current employee
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const currentStatus = employeeResult.employee.status;

    // Validate state machine transition (uses @staffora/shared employee lifecycle)
    if (!canTransitionEmployee(currentStatus, data.to_status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INVALID_LIFECYCLE_TRANSITION,
          message: `Cannot transition from ${currentStatus} to ${data.to_status}`,
          details: {
            current_status: currentStatus,
            requested_status: data.to_status,
            valid_transitions: getValidEmployeeTransitions(currentStatus),
          },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.transitionEmployeeStatus(
        tx,
        context,
        employeeId,
        data.to_status,
        data.effective_date,
        data.reason || null,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.status_changed", {
        employeeId,
        fromStatus: currentStatus,
        toStatus: data.to_status,
        effectiveDate: data.effective_date,
        reason: data.reason,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Termination
  // ===========================================================================

  /**
   * Terminate employee
   */
  async terminateEmployee(
    context: TenantContext,
    employeeId: string,
    data: EmployeeTermination,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Get current employee
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const currentStatus = employeeResult.employee.status;

    // Validate can terminate (not already terminated, not pending)
    if (currentStatus === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "ALREADY_TERMINATED",
          message: "Employee is already terminated",
          details: { id: employeeId },
        },
      };
    }

    if (currentStatus === EmployeeStates.PENDING) {
      return {
        success: false,
        error: {
          code: "CANNOT_TERMINATE_PENDING",
          message: "Cannot terminate employee that never started. Delete the record instead.",
          details: { id: employeeId },
        },
      };
    }

    // Validate termination date is after hire date
    const hireDate = new Date(employeeResult.employee.hireDate);
    const terminationDate = new Date(data.termination_date);
    if (terminationDate < hireDate) {
      return {
        success: false,
        error: {
          code: "INVALID_TERMINATION_DATE",
          message: "Termination date cannot be before hire date",
          details: {
            hire_date: employeeResult.employee.hireDate,
            termination_date: data.termination_date,
          },
        },
      };
    }

    // Terminate in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.terminateEmployee(
        tx,
        context,
        employeeId,
        data.termination_date,
        data.reason,
        context.userId || "system"
      );

      // End all active benefit enrollments
      await tx`
        UPDATE app.benefit_enrollments
        SET effective_to = ${data.termination_date}::date,
            updated_at = now()
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND (effective_to IS NULL OR effective_to > ${data.termination_date}::date)
          AND status = 'active'
      `;

      // Emit termination event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.terminated", {
        employeeId,
        terminationDate: data.termination_date,
        reason: data.reason,
      });

      // Emit benefits cessation event
      await this.emitEvent(tx, context, "employee", employeeId, "benefits.enrollment.ceased", {
        employeeId,
        terminationDate: data.termination_date,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Rehire
  // ===========================================================================

  /**
   * Rehire a terminated employee.
   *
   * Creates a new employment record linking to the previous terminated record,
   * preserving the full employment history chain. Reactivates the employee
   * with new contract, position, and compensation records.
   *
   * The employee status transitions: terminated -> pending (rehire sets pending,
   * then the normal activation flow brings them to active).
   */
  async rehireEmployee(
    context: TenantContext,
    employeeId: string,
    data: RehireEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<{ employment_records: EmploymentRecordResponse[] }>> {
    // Validate employee exists
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    // Validate employee is terminated (only terminated employees can be rehired)
    if (employeeResult.employee.status !== EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Only terminated employees can be rehired",
          details: {
            id: employeeId,
            current_status: employeeResult.employee.status,
            required_status: "terminated",
          },
        },
      };
    }

    // Validate rehire date is after termination date
    const terminationDate = employeeResult.employee.terminationDate
      ? new Date(employeeResult.employee.terminationDate)
      : null;
    const rehireDate = new Date(data.rehire_date);

    if (terminationDate && rehireDate <= terminationDate) {
      return {
        success: false,
        error: {
          code: "INVALID_REHIRE_DATE",
          message: "Rehire date must be after the termination date",
          details: {
            termination_date: employeeResult.employee.terminationDate,
            rehire_date: data.rehire_date,
          },
        },
      };
    }

    // Validate position exists and has headcount
    const positionHeadcount = await this.repository.getPositionHeadcount(
      context,
      data.position.position_id
    );

    if (positionHeadcount.headcount === 0) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: data.position.position_id },
        },
      };
    }

    if (positionHeadcount.currentCount >= positionHeadcount.headcount) {
      return {
        success: false,
        error: {
          code: "POSITION_OVERFILLED",
          message: "Position is already at maximum headcount",
          details: {
            position_id: data.position.position_id,
            headcount: positionHeadcount.headcount,
            current_count: positionHeadcount.currentCount,
          },
        },
      };
    }

    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.position.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "ORG_UNIT_NOT_FOUND",
          message: "Org unit not found",
          details: { org_unit_id: data.position.org_unit_id },
        },
      };
    }

    // Validate manager exists if specified
    if (data.manager_id) {
      const managerResult = await this.repository.findEmployeeById(context, data.manager_id);
      if (!managerResult.employee) {
        return {
          success: false,
          error: {
            code: "MANAGER_NOT_FOUND",
            message: "Manager not found",
            details: { manager_id: data.manager_id },
          },
        };
      }
      if (managerResult.employee.status !== "active" && managerResult.employee.status !== "on_leave") {
        return {
          success: false,
          error: {
            code: "INVALID_MANAGER",
            message: "Manager is not in active status",
            details: { manager_id: data.manager_id, status: managerResult.employee.status },
          },
        };
      }
    }

    // Perform rehire in a single transaction
    await this.db.withTransaction(context, async (tx) => {
      // 1. Close the current employment record if it exists
      //    (if the employee was hired before this feature existed, there may not be one)
      const currentRecord = await tx<{ id: string }[]>`
        SELECT id FROM app.employment_records
        WHERE employee_id = ${employeeId}::uuid AND is_current = true
        LIMIT 1
      `;

      let previousEmploymentId: string | null = null;

      if (currentRecord.length > 0) {
        // Close the existing current record
        previousEmploymentId = currentRecord[0]!.id;
        await this.repository.closeCurrentEmploymentRecord(
          tx,
          context,
          employeeId,
          employeeResult.employee!.terminationDate
            ? new Date(employeeResult.employee!.terminationDate).toISOString().split("T")[0]!
            : data.rehire_date,
          employeeResult.employee!.terminationReason || "terminated"
        );
      } else {
        // No employment record exists yet; create a closed one for the prior employment
        const maxNum = await this.repository.getMaxEmploymentNumber(tx, employeeId);
        const priorRows = await tx<{ id: string }[]>`
          INSERT INTO app.employment_records (
            tenant_id, employee_id, employment_number,
            start_date, end_date, termination_reason,
            is_current
          )
          VALUES (
            ${context.tenantId}::uuid, ${employeeId}::uuid, ${maxNum + 1},
            ${new Date(employeeResult.employee!.hireDate).toISOString().split("T")[0]}::date,
            ${employeeResult.employee!.terminationDate ? new Date(employeeResult.employee!.terminationDate).toISOString().split("T")[0] : data.rehire_date}::date,
            ${employeeResult.employee!.terminationReason || "terminated"},
            false
          )
          RETURNING id
        `;
        previousEmploymentId = priorRows[0]?.id || null;
      }

      // 2. Create a new employment record for the rehire
      const maxNum = await this.repository.getMaxEmploymentNumber(tx, employeeId);
      await this.repository.createEmploymentRecord(tx, context, {
        employeeId,
        employmentNumber: maxNum + 1,
        startDate: data.rehire_date,
        previousEmploymentId,
      });

      // 3. Reactivate the employee (status -> pending, new hire_date, clear termination)
      await this.repository.rehireEmployee(
        tx,
        context,
        employeeId,
        data.rehire_date,
        context.userId || "system"
      );

      // 4. Create new contract record
      await this.repository.updateEmployeeContract(
        tx,
        context,
        employeeId,
        {
          effective_from: data.rehire_date,
          contract_type: data.contract.contract_type,
          employment_type: data.contract.employment_type,
          fte: data.contract.fte,
          working_hours_per_week: data.contract.working_hours_per_week,
          probation_end_date: data.contract.probation_end_date,
          notice_period_days: data.contract.notice_period_days,
        },
        context.userId || "system"
      );

      // 5. Create new position assignment
      await this.repository.updateEmployeePosition(
        tx,
        context,
        employeeId,
        {
          effective_from: data.rehire_date,
          position_id: data.position.position_id,
          org_unit_id: data.position.org_unit_id,
          is_primary: data.position.is_primary !== false,
          assignment_reason: "rehire",
        },
        context.userId || "system"
      );

      // 6. Create new compensation record
      await this.repository.updateEmployeeCompensation(
        tx,
        context,
        employeeId,
        {
          effective_from: data.rehire_date,
          base_salary: data.compensation.base_salary,
          currency: data.compensation.currency,
          pay_frequency: data.compensation.pay_frequency,
          change_reason: "rehire",
        },
        context.userId || "system"
      );

      // 7. Create reporting line if manager specified
      if (data.manager_id) {
        await this.repository.updateEmployeeManager(
          tx,
          context,
          employeeId,
          {
            effective_from: data.rehire_date,
            manager_id: data.manager_id,
            relationship_type: "direct",
            is_primary: true,
          },
          context.userId || "system"
        );
      }

      // 8. Emit rehire domain event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.rehired", {
        employeeId,
        rehireDate: data.rehire_date,
        previousEmploymentId,
        reason: data.reason || "rehire",
      });
    });

    // Fetch employment records
    const employmentRecords = await this.repository.getEmploymentRecords(context, employeeId);

    // Helper to safely convert date to YYYY-MM-DD string
    const toDateString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }
      if (typeof value === "string") {
        return value.includes("T") ? value.split("T")[0]! : value;
      }
      return "";
    };

    const toISOString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        return value;
      }
      return new Date().toISOString();
    };

    return {
      success: true,
      data: {
        employment_records: employmentRecords.map((rec) => {
          const raw = rec as Record<string, unknown>;
          return {
            id: String(raw.id),
            tenant_id: String(raw.tenantId ?? raw.tenant_id),
            employee_id: String(raw.employeeId ?? raw.employee_id),
            employment_number: Number(raw.employmentNumber ?? raw.employment_number),
            start_date: toDateString(raw.startDate ?? raw.start_date),
            end_date: (raw.endDate ?? raw.end_date) ? toDateString(raw.endDate ?? raw.end_date) : null,
            termination_reason: (raw.terminationReason ?? raw.termination_reason) as string | null,
            is_current: Boolean(raw.isCurrent ?? raw.is_current),
            previous_employment_id: (raw.previousEmploymentId ?? raw.previous_employment_id) as string | null,
            created_at: toISOString(raw.createdAt ?? raw.created_at),
          };
        }),
      },
    };
  }

  // ===========================================================================
  // NI Category
  // ===========================================================================

  /**
   * Update employee NI category
   */
  async updateNiCategory(
    context: TenantContext,
    employeeId: string,
    niCategory: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Get current employee
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    // Cannot update terminated employees
    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot update NI category for terminated employee",
          details: { id: employeeId },
        },
      };
    }

    const previousCategory = employeeResult.employee.niCategory ?? "A";

    // Update in transaction with outbox event
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateNiCategory(tx, context, employeeId, niCategory);

      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.ni_category_changed", {
        employeeId,
        previousCategory,
        newCategory: niCategory,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Statutory Notice Calculation (UK Employment Rights Act 1996, s.86)
  // ===========================================================================

  /**
   * Calculate the statutory minimum notice period for an employee.
   *
   * UK Employment Rights Act 1996, s.86:
   *  - < 1 month continuous service: no statutory entitlement
   *  - 1 month to 2 years: minimum 1 week
   *  - 2+ complete years: 1 week per year, maximum 12 weeks
   *
   * Returns { statutory_notice_weeks, contractual_notice_days, is_compliant }
   */
  async getStatutoryNoticePeriod(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<{
    employee_id: string;
    hire_date: string;
    reference_date: string;
    years_of_service: number;
    months_of_service: number;
    statutory_notice_weeks: number;
    statutory_notice_days: number;
    contractual_notice_days: number | null;
    is_compliant: boolean;
    compliance_message: string;
  }>> {
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const employee = employeeResult.employee;
    const referenceDate = employee.terminationDate
      ? new Date(employee.terminationDate)
      : new Date();

    // Get current contractual notice period from the active employment contract
    const contractRows = await this.db.withTransaction(context, async (tx) => {
      return tx`
        SELECT notice_period_days
        FROM app.employment_contracts
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND effective_to IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      `;
    });

    const contractualNoticeDays = (contractRows[0] as any)?.noticePeriodDays ?? null;

    // Delegate calculation to the shared utility (UK Employment Rights Act 1996, s.86)
    const notice = calculateStatutoryNoticePeriod({
      hireDate: employee.hireDate,
      referenceDate,
      contractualNoticeDays,
    });

    return {
      success: true,
      data: {
        employee_id: employeeId,
        hire_date: String(employee.hireDate),
        reference_date: referenceDate.toISOString().split("T")[0],
        years_of_service: notice.yearsOfService,
        months_of_service: notice.monthsOfService,
        statutory_notice_weeks: notice.statutoryNoticeWeeks,
        statutory_notice_days: notice.statutoryNoticeDays,
        contractual_notice_days: notice.contractualNoticeDays,
        is_compliant: notice.isCompliant,
        compliance_message: notice.complianceMessage,
      },
    };
  }
}
