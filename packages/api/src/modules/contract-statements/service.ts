/**
 * Contract Statements Module - Service Layer
 *
 * Implements business logic for generating and managing UK Written Statements
 * of Employment Particulars (Employment Rights Act 1996 s.1-7B).
 *
 * Since 6 April 2020, all UK employees must receive a written statement
 * on or before their first day of work. The statement must include all
 * 12 legally required particulars:
 *
 *  1. Employer's name
 *  2. Employee's name, start date, job title
 *  3. Place of work
 *  4. Pay rate and intervals
 *  5. Hours of work
 *  6. Holiday entitlement
 *  7. Sick pay and procedures
 *  8. Notice periods
 *  9. Pension arrangements
 * 10. Probationary period
 * 11. Training requirements
 * 12. Disciplinary/grievance procedures
 *
 * Enforces invariants, gathers data from multiple HR tables,
 * and emits domain events via the outbox pattern.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  ContractStatementsRepository,
  ContractStatementRow,
  StatementListRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  GenerateStatementBody,
  StatementFilters,
  AllStatementsFilters,
  PaginationQuery,
  StatementContent,
  ContractStatementResponse,
  StatementListItem,
  ComplianceStatusResponse,
  ComplianceEmployeeItem,
} from "./schemas";

// =============================================================================
// Pay Frequency Multipliers (for annual equivalent calculation)
// =============================================================================

const PAY_FREQUENCY_ANNUAL_MULTIPLIER: Record<string, number> = {
  monthly: 12,
  bi_weekly: 26,
  weekly: 52,
  semi_monthly: 24,
  annual: 1,
};

// =============================================================================
// Service
// =============================================================================

export class ContractStatementsService {
  constructor(
    private repository: ContractStatementsRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Generate Statement
  // ---------------------------------------------------------------------------

  /**
   * Generate a written statement of employment particulars for an employee.
   *
   * Gathers all 12 legally required Section 1 particulars from:
   * - employees + employee_personal (name, hire date)
   * - employment_contracts (type, hours, FTE, notice, probation)
   * - position_assignments + positions + org_units (title, location)
   * - compensation_history (pay, currency, frequency)
   * - leave_balances + leave_types (holiday entitlement)
   * - tenants (employer name)
   * - employee_addresses (employee address)
   *
   * If no contract_id is provided, the current effective contract is used.
   *
   * Writes the statement record and an outbox event atomically.
   */
  async generateStatement(
    ctx: TenantContext,
    employeeId: string,
    input: GenerateStatementBody,
    idempotencyKey?: string
  ): Promise<ServiceResult<ContractStatementResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      // Validate employee exists and belongs to tenant
      const employee = await this.repository.getEmployeeData(tx, employeeId);
      if (!employee) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Employee not found: ${employeeId}`,
          },
        };
      }

      // Resolve contract: use provided ID or find current effective contract
      let contract;
      if (input.contract_id) {
        contract = await this.repository.getContractData(tx, input.contract_id);
        if (!contract) {
          return {
            success: false,
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: `Contract not found: ${input.contract_id}`,
            },
          };
        }
        // Verify contract belongs to this employee
        if (contract.employeeId !== employeeId) {
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "Contract does not belong to the specified employee",
            },
          };
        }
      } else {
        contract = await this.repository.getCurrentContract(tx, employeeId);
        if (!contract) {
          return {
            success: false,
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: `No current employment contract found for employee: ${employeeId}`,
            },
          };
        }
      }

      // Gather position data
      const position = await this.repository.getPositionData(tx, employeeId);

      // Gather compensation data
      const compensation = await this.repository.getCompensationData(
        tx,
        employeeId
      );

      // Gather employee address
      const address = await this.repository.getEmployeeAddress(tx, employeeId);

      // Gather annual leave balance for holiday entitlement
      const currentYear = new Date().getFullYear();
      const leaveBalance = await this.repository.getAnnualLeaveBalance(
        tx,
        employeeId,
        currentYear
      );

      // Build the employee name
      const employeeName = [
        employee.firstName,
        employee.middleName,
        employee.lastName,
      ]
        .filter(Boolean)
        .join(" ");

      // Build employee address string
      const employeeAddress = address
        ? [
            address.streetLine1,
            address.streetLine2,
            address.city,
            address.stateProvince,
            address.postalCode,
            address.country,
          ]
            .filter(Boolean)
            .join(", ")
        : null;

      // Calculate annual salary equivalent
      const baseSalary = compensation
        ? parseFloat(String(compensation.baseSalary))
        : 0;
      const payFrequency = compensation?.payFrequency || "monthly";
      const multiplier = PAY_FREQUENCY_ANNUAL_MULTIPLIER[payFrequency] || 12;
      const annualEquivalent = baseSalary * multiplier;

      // Calculate holiday entitlement from leave balance
      let holidayEntitlement = null;
      if (leaveBalance) {
        const totalEntitlement =
          parseFloat(String(leaveBalance.openingBalance)) +
          parseFloat(String(leaveBalance.accrued)) +
          parseFloat(String(leaveBalance.adjustments));
        holidayEntitlement = {
          days_per_year: totalEntitlement,
          includes_bank_holidays: false,
        };
      }

      // Calculate probation details
      let probation = null;
      if (contract.probationEndDate) {
        const probEndDate = new Date(contract.probationEndDate);
        const hireDate = employee.hireDate
          ? new Date(employee.hireDate)
          : null;
        let durationMonths: number | null = null;
        if (hireDate) {
          // Calculate approximate months between hire date and probation end
          durationMonths =
            (probEndDate.getFullYear() - hireDate.getFullYear()) * 12 +
            (probEndDate.getMonth() - hireDate.getMonth());
        }
        probation = {
          end_date: probEndDate.toISOString().split("T")[0],
          duration_months: durationMonths,
          conditions: null as string | null,
        };
      }

      // Assemble all 12 legally required Section 1 particulars
      const content: StatementContent = {
        // 1. Employer particulars
        employer_name: "",
        employer_address: null,

        // 2. Employee particulars
        employee_name: employeeName || "Unknown",
        employee_address: employeeAddress,

        // Job details
        job_title: position?.positionTitle || "Not assigned",
        job_description: position?.positionDescription || null,

        // Dates
        start_date: employee.hireDate
          ? new Date(employee.hireDate).toISOString().split("T")[0]
          : "",
        continuous_employment_date: employee.hireDate
          ? new Date(employee.hireDate).toISOString().split("T")[0]
          : null,

        // 4. Pay rate and intervals
        pay: {
          base_salary: baseSalary,
          currency: compensation?.currency || "GBP",
          pay_frequency: payFrequency,
          annual_equivalent: annualEquivalent,
        },

        // 5. Hours of work
        hours: {
          hours_per_week: contract.workingHoursPerWeek
            ? parseFloat(String(contract.workingHoursPerWeek))
            : null,
          fte: parseFloat(String(contract.fte)),
          employment_type: contract.employmentType,
        },

        // 6. Holiday entitlement
        holiday_entitlement: holidayEntitlement,

        // 3. Place of work
        location: {
          org_unit_name: position?.orgUnitName || "Not assigned",
          org_unit_code: position?.orgUnitCode || "N/A",
        },

        // 8. Notice periods
        notice_periods: {
          employer_notice_days: contract.noticePeriodDays || null,
          employee_notice_days: contract.noticePeriodDays || null,
        },

        // Contract type
        contract_type: contract.contractType,

        // 10. Probationary period
        probation,

        // 9. Pension arrangements
        pension: {
          scheme_name: null,
          enrolled: false,
          auto_enrolment_date: null,
        },

        // 7. Sick pay and procedures
        sick_pay: {
          company_sick_pay: false,
          ssp_qualifying_days: 3,
          policy_reference: null,
        },

        // 11. Training requirements
        training_requirements: {
          mandatory_training_required: false,
          description: null,
          employer_funded: true,
        },

        // Collective agreements
        collective_agreements: null,

        // 12. Disciplinary and grievance procedures
        disciplinary_procedure: null,
        grievance_procedure: null,
      };

      // Fetch tenant name via system context (tenants table has no RLS)
      try {
        const tenantData = await this.db.withSystemContext(async (sysTx) => {
          return await this.repository.getTenantData(sysTx, ctx.tenantId);
        });
        if (tenantData) {
          content.employer_name = tenantData.name;
          const settings = tenantData.settings as Record<string, unknown>;
          if (settings && typeof settings.address === "string") {
            content.employer_address = settings.address;
          }
        }
      } catch {
        content.employer_name = "Unknown Employer";
      }

      // Determine statement type (default: section_1)
      const statementType = input.statement_type || "section_1";

      // Insert the statement record and outbox event atomically
      const [row] = await this.repository.create(tx, {
        tenantId: ctx.tenantId,
        employeeId,
        contractId: contract.id,
        statementType,
        generatedBy: ctx.userId || "",
        templateId: input.template_id || null,
        content,
      });

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to create contract statement record",
          },
        };
      }

      // Write outbox event in the same transaction
      await this.repository.writeOutboxEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "contract_statement",
        aggregateId: row.id,
        eventType: "hr.contract_statement.generated",
        payload: {
          statementId: row.id,
          employeeId,
          contractId: contract.id,
          statementType,
          actor: ctx.userId,
        },
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Get Statement by ID
  // ---------------------------------------------------------------------------

  async getStatement(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ContractStatementResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.findById(tx, id);
      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Contract statement not found: ${id}`,
          },
        };
      }

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // List Statements for Employee
  // ---------------------------------------------------------------------------

  async listStatements(
    ctx: TenantContext,
    employeeId: string,
    filters: StatementFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<StatementListItem>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.listByEmployee(
        tx,
        employeeId,
        filters,
        pagination
      );

      return {
        items: result.items.map((row) => this.mapListItemToResponse(row)),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // List All Statements (tenant-wide)
  // ---------------------------------------------------------------------------

  async listAllStatements(
    ctx: TenantContext,
    filters: AllStatementsFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<StatementListItem>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.listAll(tx, filters, pagination);

      return {
        items: result.items.map((row) => this.mapListItemToResponse(row)),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Issue Statement
  // ---------------------------------------------------------------------------

  /**
   * Mark a statement as formally issued to the employee.
   * The statement must exist and not already be issued.
   */
  async issueStatement(
    ctx: TenantContext,
    id: string,
    issuedAt?: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<ContractStatementResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.findById(tx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Contract statement not found: ${id}`,
          },
        };
      }

      if (existing.issuedAt) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Statement has already been issued",
          },
        };
      }

      const issueDate = issuedAt ? new Date(issuedAt) : new Date();
      const row = await this.repository.markIssued(tx, id, issueDate);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to issue statement",
          },
        };
      }

      // Write outbox event
      await this.repository.writeOutboxEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "contract_statement",
        aggregateId: id,
        eventType: "hr.contract_statement.issued",
        payload: {
          statementId: id,
          employeeId: row.employeeId,
          issuedAt: issueDate.toISOString(),
          actor: ctx.userId,
        },
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Acknowledge Statement (markAcknowledged)
  // ---------------------------------------------------------------------------

  /**
   * Mark a statement as acknowledged by the employee.
   * The statement must be issued first before it can be acknowledged.
   */
  async markAcknowledged(
    ctx: TenantContext,
    id: string,
    acknowledgedAt?: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<ContractStatementResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.findById(tx, id);
      if (!existing) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Contract statement not found: ${id}`,
          },
        };
      }

      if (!existing.issuedAt) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Statement must be issued before it can be acknowledged",
          },
        };
      }

      if (existing.acknowledgedByEmployee) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Statement has already been acknowledged",
          },
        };
      }

      const ackDate = acknowledgedAt ? new Date(acknowledgedAt) : new Date();
      const row = await this.repository.markAcknowledged(tx, id, ackDate);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to acknowledge statement",
          },
        };
      }

      // Write outbox event
      await this.repository.writeOutboxEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "contract_statement",
        aggregateId: id,
        eventType: "hr.contract_statement.acknowledged",
        payload: {
          statementId: id,
          employeeId: row.employeeId,
          acknowledgedAt: ackDate.toISOString(),
          actor: ctx.userId,
        },
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Compliance Status
  // ---------------------------------------------------------------------------

  /**
   * Check compliance status for the tenant.
   * Identifies employees who do not have a day-one written statement
   * as required since 6 April 2020.
   *
   * Returns a summary with total counts and a list of overdue employees
   * (those without statements or with unissued statements).
   */
  async checkComplianceStatus(
    ctx: TenantContext
  ): Promise<ServiceResult<ComplianceStatusResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const complianceData = await this.repository.getComplianceData(tx);
      const totalActive = await this.repository.getActiveEmployeeCount(tx);

      let withStatement = 0;
      let withAcknowledged = 0;
      const overdueEmployees: ComplianceEmployeeItem[] = [];

      const now = new Date();

      for (const row of complianceData) {
        const employeeName = [row.firstName, row.lastName]
          .filter(Boolean)
          .join(" ");

        const hireDate = new Date(row.hireDate);
        const daysSinceStart = Math.floor(
          (now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Employee is overdue if they started and have no statement,
        // or have a statement that has not been issued
        const isOverdue =
          !row.hasDayOneStatement ||
          (row.hasDayOneStatement && !row.statementIssuedAt);

        if (row.hasDayOneStatement) {
          withStatement++;
        }
        if (row.statementAcknowledged) {
          withAcknowledged++;
        }

        if (isOverdue) {
          overdueEmployees.push({
            employee_id: row.employeeId,
            employee_number: row.employeeNumber,
            employee_name: employeeName || "Unknown",
            hire_date: hireDate.toISOString().split("T")[0],
            status: row.status,
            has_day_one_statement: row.hasDayOneStatement,
            statement_issued_at: row.statementIssuedAt
              ? new Date(row.statementIssuedAt).toISOString()
              : null,
            statement_acknowledged: row.statementAcknowledged,
            days_since_start: daysSinceStart,
            is_overdue: true,
          });
        }
      }

      const withoutStatement = totalActive - withStatement;
      const compliancePercentage =
        totalActive > 0
          ? Math.round((withStatement / totalActive) * 10000) / 100
          : 100;

      return {
        success: true,
        data: {
          total_active_employees: totalActive,
          employees_with_statement: withStatement,
          employees_without_statement: withoutStatement,
          employees_with_acknowledged_statement: withAcknowledged,
          compliance_percentage: compliancePercentage,
          overdue_employees: overdueEmployees,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Mapping Helpers
  // ---------------------------------------------------------------------------

  private mapToResponse(row: ContractStatementRow): ContractStatementResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      contract_id: row.contractId,
      statement_type: row.statementType as "section_1" | "section_2",
      generated_at: row.generatedAt
        ? new Date(row.generatedAt).toISOString()
        : new Date().toISOString(),
      generated_by: row.generatedBy,
      template_id: row.templateId || null,
      content: row.content,
      pdf_file_key: row.pdfFileKey || null,
      issued_at: row.issuedAt
        ? new Date(row.issuedAt).toISOString()
        : null,
      acknowledged_at: row.acknowledgedAt
        ? new Date(row.acknowledgedAt).toISOString()
        : null,
      acknowledged_by_employee: row.acknowledgedByEmployee ?? false,
      version: row.version ?? 1,
      created_at: row.createdAt
        ? new Date(row.createdAt).toISOString()
        : new Date().toISOString(),
      updated_at: row.updatedAt
        ? new Date(row.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  }

  private mapListItemToResponse(row: StatementListRow): StatementListItem {
    return {
      id: row.id,
      employee_id: row.employeeId,
      contract_id: row.contractId,
      statement_type: row.statementType as "section_1" | "section_2",
      generated_at: row.generatedAt
        ? new Date(row.generatedAt).toISOString()
        : new Date().toISOString(),
      issued_at: row.issuedAt
        ? new Date(row.issuedAt).toISOString()
        : null,
      acknowledged_at: row.acknowledgedAt
        ? new Date(row.acknowledgedAt).toISOString()
        : null,
      acknowledged_by_employee: row.acknowledgedByEmployee ?? false,
      employee_name: row.employeeName || undefined,
    };
  }
}
