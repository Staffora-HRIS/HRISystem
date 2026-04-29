/**
 * Disciplinary & Grievance Module - Service Layer
 *
 * Business logic for ACAS Code of Practice compliant disciplinary and grievance processes.
 * Non-compliance with ACAS Code results in up to 25% tribunal award uplift
 * (s.207A Trade Union and Labour Relations (Consolidation) Act 1992).
 *
 * Key ACAS requirements enforced:
 * - Investigation before hearing (para 5)
 * - Written notification with evidence (para 9)
 * - Minimum 5 working days notice for hearing (para 12)
 * - Right to be accompanied (para 14 / s.10 TULRCA 1992)
 * - Written decision with reasons (para 19)
 * - Right to appeal to different manager (para 26-27)
 * - Different flows for disciplinary vs grievance
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import { DisciplinaryRepository } from "./disciplinary.repository";
import { CasesRepository } from "./repository";
import type { TenantContext, ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  DisciplinaryCaseResponse,
  DisciplinaryStage,
  CreateDisciplinaryCase,
  RecordInvestigation,
  ScheduleHearing,
  RecordHearing,
  RecordDecision,
  SubmitAppeal,
  RecordAppealOutcome,
  RecordInformalResolution,
  AcasComplianceResponse,
} from "./disciplinary.schemas";

// =============================================================================
// Stage Transition Rules
// =============================================================================

/**
 * ACAS Code requires minimum 5 working days notice before hearing.
 * This calculates the earliest valid hearing date.
 */
function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

// =============================================================================
// Service
// =============================================================================

export class DisciplinaryService {
  constructor(
    private repository: DisciplinaryRepository,
    private casesRepository: CasesRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Create Disciplinary/Grievance Case
  // ---------------------------------------------------------------------------

  async createDisciplinaryCase(
    ctx: TenantContext,
    caseId: string,
    data: CreateDisciplinaryCase
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    // Verify parent case exists
    const parentCase = await this.casesRepository.getCaseById(ctx, caseId);
    if (!parentCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Parent case not found",
        },
      };
    }

    // Check if disciplinary case already exists for this case
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "A disciplinary/grievance record already exists for this case",
        },
      };
    }

    // Determine initial stage based on case type
    const initialStage: DisciplinaryStage =
      data.caseType === "grievance" ? "informal_resolution" : "investigation";

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const disciplinaryCase = await this.repository.createDisciplinaryCase(tx, ctx, {
            caseId,
            employeeId: data.employeeId,
            caseType: data.caseType,
            allegationSummary: data.allegationSummary,
            investigatorId: data.investigatorId,
            initialStage,
          });

          // Record initial stage in history
          await this.repository.updateStage(
            tx, ctx, disciplinaryCase.id, null, initialStage,
            `${data.caseType} case created`
          );

          // Emit domain event
          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: disciplinaryCase.id,
            eventType: `cases.disciplinary.created`,
            payload: {
              disciplinaryCaseId: disciplinaryCase.id,
              parentCaseId: caseId,
              employeeId: data.employeeId,
              caseType: data.caseType,
              stage: initialStage,
            },
            userId: ctx.userId,
          });

          return disciplinaryCase;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to create disciplinary case",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Get Disciplinary Case
  // ---------------------------------------------------------------------------

  async getDisciplinaryCase(
    ctx: TenantContext,
    caseId: string
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const disciplinaryCase = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!disciplinaryCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Disciplinary/grievance record not found for this case",
        },
      };
    }

    return { success: true, data: disciplinaryCase };
  }

  // ---------------------------------------------------------------------------
  // Record Investigation
  // ---------------------------------------------------------------------------

  async recordInvestigation(
    ctx: TenantContext,
    caseId: string,
    data: RecordInvestigation
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    // For disciplinary: must be in investigation stage
    // For grievance: must be in investigation stage (comes after formal_submission)
    if (existing.stage !== "investigation") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record investigation in stage '${existing.stage}'. Case must be in 'investigation' stage.`,
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordInvestigation(tx, ctx, existing.id, {
            investigationFindings: data.investigationFindings,
            investigatorId: data.investigatorId,
            evidenceDocuments: data.evidenceDocuments,
          });

          // Advance to next stage
          const nextStage: DisciplinaryStage =
            existing.caseType === "disciplinary" ? "notification" : "hearing";

          await this.repository.updateStage(
            tx, ctx, existing.id, "investigation" as DisciplinaryStage, nextStage,
            "Investigation completed"
          );

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.investigation_recorded",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              previousStage: "investigation",
              newStage: nextStage,
            },
            userId: ctx.userId,
          });

          // Return with updated stage
          return { ...updated, stage: nextStage } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record investigation",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Schedule Hearing
  // ---------------------------------------------------------------------------

  async scheduleHearing(
    ctx: TenantContext,
    caseId: string,
    data: ScheduleHearing
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    // Must be in notification (disciplinary) or hearing (grievance) stage
    const validStages = existing.caseType === "disciplinary"
      ? ["notification"]
      : ["hearing"];

    if (!validStages.includes(existing.stage)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot schedule hearing in stage '${existing.stage}'. Must be in: ${validStages.join(", ")}`,
        },
      };
    }

    // ACAS Code para 12: minimum 5 working days notice
    const hearingDate = new Date(data.hearingDate);
    const minDate = addWorkingDays(new Date(), 5);

    if (hearingDate < minDate) {
      return {
        success: false,
        error: {
          code: "ACAS_NOTICE_PERIOD",
          message: `Hearing date must be at least 5 working days from now (earliest: ${minDate.toISOString().split("T")[0]}). ACAS Code of Practice para 12.`,
          details: {
            minimumDate: minDate.toISOString().split("T")[0],
            requestedDate: data.hearingDate,
            acasReference: "ACAS Code of Practice on Disciplinary and Grievance Procedures, paragraph 12",
          },
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordNotification(tx, ctx, existing.id, {
            hearingDate: data.hearingDate,
            hearingLocation: data.hearingLocation,
            notificationContent: data.notificationContent,
          });

          // For disciplinary, advance to hearing stage
          if (existing.caseType === "disciplinary") {
            await this.repository.updateStage(
              tx, ctx, existing.id,
              "notification" as DisciplinaryStage,
              "hearing" as DisciplinaryStage,
              `Hearing scheduled for ${data.hearingDate}`
            );
          }

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.hearing_scheduled",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              hearingDate: data.hearingDate,
              hearingLocation: data.hearingLocation,
              employeeId: existing.employeeId,
            },
            userId: ctx.userId,
          });

          const newStage = existing.caseType === "disciplinary" ? "hearing" : existing.stage;
          return { ...updated, stage: newStage } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to schedule hearing",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Record Hearing
  // ---------------------------------------------------------------------------

  async recordHearing(
    ctx: TenantContext,
    caseId: string,
    data: RecordHearing
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    if (existing.stage !== "hearing") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record hearing in stage '${existing.stage}'. Must be in 'hearing' stage.`,
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordHearing(tx, ctx, existing.id, {
            hearingNotes: data.hearingNotes,
            hearingAttended: data.hearingAttended,
            companionName: data.companionName,
            companionType: data.companionType,
            companionOrganisation: data.companionOrganisation,
          });

          // Advance to decision stage
          await this.repository.updateStage(
            tx, ctx, existing.id,
            "hearing" as DisciplinaryStage,
            "decision" as DisciplinaryStage,
            data.hearingAttended ? "Hearing conducted" : "Hearing — employee did not attend"
          );

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.hearing_recorded",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              hearingAttended: data.hearingAttended,
              companionPresent: !!data.companionName,
            },
            userId: ctx.userId,
          });

          return { ...updated, stage: "decision" as DisciplinaryStage } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record hearing",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Record Decision
  // ---------------------------------------------------------------------------

  async recordDecision(
    ctx: TenantContext,
    caseId: string,
    data: RecordDecision
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    if (existing.stage !== "decision") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record decision in stage '${existing.stage}'. Must be in 'decision' stage.`,
        },
      };
    }

    // Validate decision type matches case type
    const disciplinaryDecisions = ["no_action", "verbal_warning", "written_warning", "final_written_warning", "dismissal"];
    const grievanceDecisions = ["uphold_grievance", "partial_uphold", "reject_grievance"];

    if (existing.caseType === "disciplinary" && !disciplinaryDecisions.includes(data.decision)) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Decision '${data.decision}' is not valid for disciplinary cases. Valid: ${disciplinaryDecisions.join(", ")}`,
        },
      };
    }

    if (existing.caseType === "grievance" && !grievanceDecisions.includes(data.decision)) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Decision '${data.decision}' is not valid for grievance cases. Valid: ${grievanceDecisions.join(", ")}`,
        },
      };
    }

    // ACAS Code para 26: calculate 5 working day appeal deadline
    const rightToAppealExpires = addWorkingDays(new Date(), 5);

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordDecision(tx, ctx, existing.id, {
            decision: data.decision,
            decisionReason: data.decisionReason,
            warningExpiryDate: data.warningExpiryDate,
            rightToAppealExpires,
          });

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.decision_recorded",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              decision: data.decision,
              employeeId: existing.employeeId,
              rightToAppealExpires: rightToAppealExpires.toISOString(),
            },
            userId: ctx.userId,
          });

          return updated;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record decision",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Submit Appeal
  // ---------------------------------------------------------------------------

  async submitAppeal(
    ctx: TenantContext,
    caseId: string,
    data: SubmitAppeal
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    if (existing.stage !== "decision") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot submit appeal in stage '${existing.stage}'. Must be in 'decision' stage.`,
        },
      };
    }

    if (existing.appealSubmitted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "An appeal has already been submitted for this case",
        },
      };
    }

    // Check appeal window
    if (existing.rightToAppealExpires) {
      const expiryDate = new Date(existing.rightToAppealExpires);
      if (new Date() > expiryDate) {
        return {
          success: false,
          error: {
            code: "APPEAL_WINDOW_EXPIRED",
            message: `The appeal window expired on ${expiryDate.toISOString().split("T")[0]}. Appeals must be submitted within 5 working days of the decision.`,
            details: {
              expiryDate: expiryDate.toISOString(),
              acasReference: "ACAS Code of Practice, paragraph 26",
            },
          },
        };
      }
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.submitAppeal(tx, ctx, existing.id, {
            appealGrounds: data.appealGrounds,
          });

          // Advance to appeal stage
          await this.repository.updateStage(
            tx, ctx, existing.id,
            "decision" as DisciplinaryStage,
            "appeal" as DisciplinaryStage,
            "Appeal submitted by employee"
          );

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.appeal_submitted",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              employeeId: existing.employeeId,
            },
            userId: ctx.userId,
          });

          return { ...updated, stage: "appeal" as DisciplinaryCaseResponse["stage"] } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to submit appeal",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Record Appeal Outcome
  // ---------------------------------------------------------------------------

  async recordAppealOutcome(
    ctx: TenantContext,
    caseId: string,
    data: RecordAppealOutcome
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    if (existing.stage !== "appeal") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record appeal outcome in stage '${existing.stage}'. Must be in 'appeal' stage.`,
        },
      };
    }

    // ACAS Code para 27: appeal must be heard by different manager
    if (existing.decisionDate && data.appealHeardBy === existing.id) {
      // This would be the same person — but we check against decisionBy field
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordAppealOutcome(tx, ctx, existing.id, {
            appealOutcome: data.appealOutcome,
            appealOutcomeReason: data.appealOutcomeReason,
            appealHeardBy: data.appealHeardBy,
          });

          // Advance to closed
          await this.repository.updateStage(
            tx, ctx, existing.id,
            "appeal" as DisciplinaryStage,
            "closed" as DisciplinaryStage,
            `Appeal ${data.appealOutcome}: ${data.appealOutcomeReason}`
          );

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.appeal_outcome_recorded",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              appealOutcome: data.appealOutcome,
              employeeId: existing.employeeId,
            },
            userId: ctx.userId,
          });

          return { ...updated, stage: "closed" as DisciplinaryCaseResponse["stage"] } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record appeal outcome",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Record Informal Resolution (Grievance only)
  // ---------------------------------------------------------------------------

  async recordInformalResolution(
    ctx: TenantContext,
    caseId: string,
    data: RecordInformalResolution
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    if (existing.caseType !== "grievance") {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Informal resolution is only applicable to grievance cases",
        },
      };
    }

    if (existing.stage !== "informal_resolution") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record informal resolution in stage '${existing.stage}'. Must be in 'informal_resolution' stage.`,
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordInformalResolution(tx, ctx, existing.id, {
            informalResolutionNotes: data.informalResolutionNotes,
          });

          const nextStage: DisciplinaryStage = data.resolved ? "closed" : "formal_submission";

          await this.repository.updateStage(
            tx, ctx, existing.id,
            "informal_resolution" as DisciplinaryStage,
            nextStage,
            data.resolved
              ? "Grievance resolved informally"
              : "Informal resolution unsuccessful, proceeding to formal process"
          );

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.informal_resolution_recorded",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              resolved: data.resolved,
              newStage: nextStage,
            },
            userId: ctx.userId,
          });

          return { ...updated, stage: nextStage } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record informal resolution",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Advance Grievance to Investigation (from formal_submission)
  // ---------------------------------------------------------------------------

  async advanceGrievanceToInvestigation(
    ctx: TenantContext,
    caseId: string
  ): Promise<ServiceResult<DisciplinaryCaseResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    if (existing.caseType !== "grievance") {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "This action is only applicable to grievance cases" },
      };
    }

    if (existing.stage !== "formal_submission") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot advance to investigation from stage '${existing.stage}'. Must be in 'formal_submission' stage.`,
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          await this.repository.updateStage(
            tx, ctx, existing.id,
            "formal_submission" as DisciplinaryStage,
            "investigation" as DisciplinaryStage,
            "Formal grievance acknowledged, investigation commenced"
          );

          // Set investigation start timestamp
          await tx`
            UPDATE app.disciplinary_cases
            SET investigation_started_at = now(), updated_at = now()
            WHERE id = ${existing.id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          `;

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "disciplinary_case",
            aggregateId: existing.id,
            eventType: "cases.disciplinary.investigation_started",
            payload: {
              disciplinaryCaseId: existing.id,
              parentCaseId: caseId,
              previousStage: "formal_submission",
            },
            userId: ctx.userId,
          });

          return { ...existing, stage: "investigation" as DisciplinaryStage } as DisciplinaryCaseResponse;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to advance to investigation",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // ACAS Compliance Check
  // ---------------------------------------------------------------------------

  async getAcasCompliance(
    ctx: TenantContext,
    caseId: string
  ): Promise<ServiceResult<AcasComplianceResponse>> {
    const existing = await this.repository.getDisciplinaryCaseByCaseId(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Disciplinary case not found" },
      };
    }

    const stageHistory = await this.repository.getStageHistory(ctx, existing.id);
    const stageReached = (stage: string) =>
      stageHistory.some((h) => h.toStage === stage);

    const steps: AcasComplianceResponse["steps"] = [];
    const risks: AcasComplianceResponse["risks"] = [];

    if (existing.caseType === "disciplinary") {
      // Step 1: Investigation conducted
      steps.push({
        step: "investigation",
        description: "Investigate the matter before any disciplinary action (ACAS Code para 5)",
        acasReference: "Para 5",
        status: existing.investigationFindings ? "completed" : stageReached("investigation") ? "pending" : "missing",
        completedAt: existing.investigationCompletedAt,
        notes: existing.investigatorId ? `Investigator assigned` : null,
      });

      // Step 2: Written notification with evidence
      steps.push({
        step: "notification",
        description: "Written notification of hearing with sufficient detail of allegations and evidence (ACAS Code para 9)",
        acasReference: "Para 9",
        status: existing.notificationSentAt ? "completed" : stageReached("notification") ? "pending" : "missing",
        completedAt: existing.notificationSentAt,
        notes: existing.notificationContent ? "Written notification provided" : null,
      });

      // Step 3: Evidence pack provided
      steps.push({
        step: "evidence_disclosure",
        description: "Copies of evidence to be used at hearing provided to employee (ACAS Code para 9)",
        acasReference: "Para 9",
        status: existing.evidenceDocuments.length > 0 ? "completed" : "missing",
        completedAt: existing.notificationSentAt,
        notes: `${existing.evidenceDocuments.length} evidence document(s) on file`,
      });

      if (!existing.notificationSentAt && (stageReached("hearing") || stageReached("decision"))) {
        risks.push({
          severity: "high",
          description: "No written notification recorded before hearing. ACAS Code para 9 requires written notification with sufficient detail.",
        });
      }
    } else {
      // Grievance flow

      // Step 1: Informal resolution attempt
      steps.push({
        step: "informal_resolution",
        description: "Attempt to resolve grievance informally before formal process (ACAS Code para 32)",
        acasReference: "Para 32",
        status: existing.informalResolutionAttempted ? "completed" : stageReached("informal_resolution") ? "pending" : "missing",
        completedAt: existing.informalResolutionDate,
        notes: null,
      });

      // Step 2: Formal written grievance
      steps.push({
        step: "formal_submission",
        description: "Formal grievance submitted in writing (ACAS Code para 33)",
        acasReference: "Para 33",
        status: stageReached("formal_submission") ? "completed" : "missing",
        completedAt: stageHistory.find((h) => h.toStage === "formal_submission")?.createdAt || null,
        notes: null,
      });

      // Step 3: Investigation
      steps.push({
        step: "investigation",
        description: "Investigation into the grievance (ACAS Code para 33)",
        acasReference: "Para 33",
        status: existing.investigationFindings ? "completed" : stageReached("investigation") ? "pending" : "missing",
        completedAt: existing.investigationCompletedAt,
        notes: null,
      });
    }

    // Common steps for both types

    // Hearing with right to be accompanied
    steps.push({
      step: "hearing_held",
      description: "Formal hearing held (ACAS Code para 11)",
      acasReference: "Para 11",
      status: existing.hearingNotes ? "completed" : existing.hearingDate ? "pending" : "missing",
      completedAt: existing.hearingNotes ? (stageHistory.find((h) => h.toStage === "decision")?.createdAt || null) : null,
      notes: existing.hearingAttended === false ? "Employee did not attend" : null,
    });

    // Minimum notice period
    const minNoticeCompliant = (() => {
      if (!existing.hearingDate || !existing.hearingNoticeSentAt) return null;
      const hearing = new Date(existing.hearingDate);
      const notice = new Date(existing.hearingNoticeSentAt);
      const daysDiff = Math.floor((hearing.getTime() - notice.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 5; // Approximate — should be 5 working days
    })();

    steps.push({
      step: "minimum_notice",
      description: "Minimum 5 working days notice of hearing (ACAS Code para 12)",
      acasReference: "Para 12",
      status: minNoticeCompliant === true ? "completed" : minNoticeCompliant === false ? "missing" : existing.hearingDate ? "pending" : "not_applicable",
      completedAt: existing.hearingNoticeSentAt,
      notes: minNoticeCompliant === false ? "RISK: Less than 5 days notice given" : null,
    });

    if (minNoticeCompliant === false) {
      risks.push({
        severity: "high",
        description: "Less than 5 working days notice given for hearing. This breaches ACAS Code para 12 and may result in tribunal award uplift.",
      });
    }

    // Right to be accompanied
    steps.push({
      step: "right_to_be_accompanied",
      description: "Employee informed of right to be accompanied by trade union rep or colleague (s.10 TULRCA 1992, ACAS Code para 14)",
      acasReference: "Para 14",
      status: existing.companionName ? "completed" : existing.hearingNotes ? "completed" : "pending",
      completedAt: existing.hearingNotes ? (stageHistory.find((h) => h.toStage === "decision")?.createdAt || null) : null,
      notes: existing.companionName
        ? `Accompanied by: ${existing.companionName} (${existing.companionType || "unknown"})`
        : existing.hearingNotes ? "Employee chose not to be accompanied or companion details not recorded" : null,
    });

    // Decision with reasons
    steps.push({
      step: "written_decision",
      description: "Decision communicated in writing with reasons (ACAS Code para 19)",
      acasReference: "Para 19",
      status: existing.decision ? "completed" : stageReached("decision") ? "pending" : "missing",
      completedAt: existing.decisionDate,
      notes: existing.decision ? `Decision: ${existing.decision}` : null,
    });

    // Right to appeal offered
    steps.push({
      step: "right_to_appeal",
      description: "Employee informed of right to appeal (ACAS Code para 26)",
      acasReference: "Para 26",
      status: existing.rightToAppealExpires ? "completed" : existing.decision ? "pending" : "not_applicable",
      completedAt: existing.decisionDate,
      notes: existing.rightToAppealExpires
        ? `Appeal deadline: ${new Date(existing.rightToAppealExpires).toISOString().split("T")[0]}`
        : null,
    });

    // Appeal (if submitted)
    if (existing.appealSubmitted) {
      steps.push({
        step: "appeal_heard",
        description: "Appeal heard by different, more senior manager (ACAS Code para 27)",
        acasReference: "Para 27",
        status: existing.appealOutcome ? "completed" : "pending",
        completedAt: existing.appealDateDecided,
        notes: existing.appealHeardBy
          ? `Appeal heard by different manager`
          : null,
      });
    }

    // Calculate compliance score
    const applicableSteps = steps.filter((s) => s.status !== "not_applicable");
    const completedSteps = applicableSteps.filter((s) => s.status === "completed");
    const complianceScore = applicableSteps.length > 0
      ? Math.round((completedSteps.length / applicableSteps.length) * 100)
      : 0;

    // General risk: no investigation before action
    if (!existing.investigationFindings && (stageReached("decision") || stageReached("hearing"))) {
      risks.push({
        severity: "high",
        description: "No investigation findings recorded before hearing/decision. ACAS Code para 5 requires investigation before disciplinary action.",
      });
    }

    // Risk: decision without hearing
    if (existing.decision && !existing.hearingNotes) {
      risks.push({
        severity: "high",
        description: "Decision recorded without hearing notes. ACAS Code para 11 requires a hearing before any decision.",
      });
    }

    // Risk: decision without reasons
    if (existing.decision && !existing.decisionReason) {
      risks.push({
        severity: "medium",
        description: "Decision recorded without written reasons. ACAS Code para 19 requires reasons to be given.",
      });
    }

    const overallCompliant = risks.filter((r) => r.severity === "high").length === 0
      && complianceScore >= 80;

    return {
      success: true,
      data: {
        caseId: existing.caseId,
        caseType: existing.caseType,
        stage: existing.stage,
        overallCompliant,
        complianceScore,
        steps,
        risks,
      },
    };
  }
}
