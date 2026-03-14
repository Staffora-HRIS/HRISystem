/**
 * Disciplinary & Grievance Module - Repository Layer
 *
 * Database operations for ACAS-compliant disciplinary and grievance cases.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  DisciplinaryCaseResponse,
  StageHistoryEntry,
  DisciplinaryStage,
} from "./disciplinary.schemas";

// =============================================================================
// DB Row Types (after camelCase transform from postgres.js)
// =============================================================================

interface DisciplinaryCaseDbRow {
  id: string;
  tenantId: string;
  caseId: string;
  employeeId: string;
  caseType: string;
  stage: string;
  allegationSummary: string | null;
  investigationFindings: string | null;
  investigatorId: string | null;
  investigationStartedAt: Date | null;
  investigationCompletedAt: Date | null;
  evidenceDocuments: unknown;
  notificationSentAt: Date | null;
  notificationSentBy: string | null;
  notificationContent: string | null;
  hearingDate: Date | null;
  hearingLocation: string | null;
  hearingNoticeSentAt: Date | null;
  companionName: string | null;
  companionType: string | null;
  companionOrganisation: string | null;
  hearingNotes: string | null;
  hearingAttended: boolean | null;
  hearingConductedBy: string | null;
  decision: string | null;
  decisionDate: Date | null;
  decisionBy: string | null;
  decisionReason: string | null;
  decisionLetterSentAt: Date | null;
  warningExpiryDate: string | null;
  rightToAppealExpires: Date | null;
  appealSubmitted: boolean;
  appealDate: Date | null;
  appealGrounds: string | null;
  appealHeardBy: string | null;
  appealHearingDate: Date | null;
  appealOutcome: string | null;
  appealOutcomeReason: string | null;
  appealDateDecided: Date | null;
  informalResolutionAttempted: boolean;
  informalResolutionNotes: string | null;
  informalResolutionDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

interface StageHistoryDbRow {
  id: string;
  fromStage: string | null;
  toStage: string;
  changedBy: string | null;
  notes: string | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class DisciplinaryRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async createDisciplinaryCase(
    tx: TransactionSql,
    ctx: TenantContext,
    data: {
      caseId: string;
      employeeId: string;
      caseType: string;
      allegationSummary?: string;
      investigatorId?: string;
      initialStage: string;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      INSERT INTO app.disciplinary_cases (
        id, tenant_id, case_id, employee_id, case_type, stage,
        allegation_summary, investigator_id,
        investigation_started_at, created_by
      ) VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${data.caseId}::uuid,
        ${data.employeeId}::uuid,
        ${data.caseType}::app.disciplinary_case_type,
        ${data.initialStage}::app.disciplinary_stage,
        ${data.allegationSummary || null},
        ${data.investigatorId || null}::uuid,
        ${data.initialStage === "investigation" ? new Date() : null}::timestamptz,
        ${ctx.userId || null}::uuid
      )
      RETURNING *
    `;

    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async getDisciplinaryCaseByCaseId(
    ctx: TenantContext,
    caseId: string
  ): Promise<DisciplinaryCaseResponse | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<DisciplinaryCaseDbRow[]>`
          SELECT *
          FROM app.disciplinary_cases
          WHERE case_id = ${caseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return row ? this.mapRow(row) : null;
  }

  async getDisciplinaryCaseById(
    ctx: TenantContext,
    id: string
  ): Promise<DisciplinaryCaseResponse | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<DisciplinaryCaseDbRow[]>`
          SELECT *
          FROM app.disciplinary_cases
          WHERE id = ${id}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return row ? this.mapRow(row) : null;
  }

  async getStageHistory(
    ctx: TenantContext,
    disciplinaryCaseId: string
  ): Promise<StageHistoryEntry[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<StageHistoryDbRow[]>`
          SELECT id, from_stage, to_stage, changed_by, notes, created_at
          FROM app.disciplinary_stage_history
          WHERE disciplinary_case_id = ${disciplinaryCaseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY created_at ASC
        `;
      }
    );

    return rows.map(this.mapStageHistoryRow);
  }

  // ---------------------------------------------------------------------------
  // Update Operations (within caller's transaction)
  // ---------------------------------------------------------------------------

  async updateStage(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    fromStage: DisciplinaryStage | null,
    toStage: DisciplinaryStage,
    notes?: string
  ): Promise<void> {
    // Update the case stage
    await tx`
      UPDATE app.disciplinary_cases
      SET stage = ${toStage}::app.disciplinary_stage,
          updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
    `;

    // Record in stage history (immutable audit trail)
    await tx`
      INSERT INTO app.disciplinary_stage_history (
        id, tenant_id, disciplinary_case_id, from_stage, to_stage, changed_by, notes
      ) VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${id}::uuid,
        ${fromStage}::app.disciplinary_stage,
        ${toStage}::app.disciplinary_stage,
        ${ctx.userId || null}::uuid,
        ${notes || null}
      )
    `;
  }

  async recordInvestigation(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      investigationFindings: string;
      investigatorId?: string;
      evidenceDocuments?: unknown[];
    }
  ): Promise<DisciplinaryCaseResponse> {
    const evidenceJson = data.evidenceDocuments
      ? JSON.stringify(data.evidenceDocuments)
      : null;

    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        investigation_findings = ${data.investigationFindings},
        investigator_id = COALESCE(${data.investigatorId || null}::uuid, investigator_id),
        evidence_documents = COALESCE(${evidenceJson}::jsonb, evidence_documents),
        investigation_completed_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async recordNotification(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      hearingDate: string;
      hearingLocation: string;
      notificationContent?: string;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        hearing_date = ${data.hearingDate}::timestamptz,
        hearing_location = ${data.hearingLocation},
        notification_content = ${data.notificationContent || null},
        notification_sent_at = now(),
        notification_sent_by = ${ctx.userId || null}::uuid,
        hearing_notice_sent_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async recordHearing(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      hearingNotes: string;
      hearingAttended: boolean;
      companionName?: string;
      companionType?: string;
      companionOrganisation?: string;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        hearing_notes = ${data.hearingNotes},
        hearing_attended = ${data.hearingAttended},
        companion_name = ${data.companionName || null},
        companion_type = ${data.companionType || null}::app.companion_type,
        companion_organisation = ${data.companionOrganisation || null},
        hearing_conducted_by = ${ctx.userId || null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async recordDecision(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      decision: string;
      decisionReason: string;
      warningExpiryDate?: string;
      rightToAppealExpires: Date;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        decision = ${data.decision}::app.disciplinary_decision,
        decision_date = now(),
        decision_by = ${ctx.userId || null}::uuid,
        decision_reason = ${data.decisionReason},
        decision_letter_sent_at = now(),
        warning_expiry_date = ${data.warningExpiryDate || null}::date,
        right_to_appeal_expires = ${data.rightToAppealExpires}::timestamptz,
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async submitAppeal(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      appealGrounds: string;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        appeal_submitted = true,
        appeal_date = now(),
        appeal_grounds = ${data.appealGrounds},
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async recordAppealOutcome(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      appealOutcome: string;
      appealOutcomeReason: string;
      appealHeardBy: string;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        appeal_outcome = ${data.appealOutcome}::app.appeal_outcome,
        appeal_outcome_reason = ${data.appealOutcomeReason},
        appeal_heard_by = ${data.appealHeardBy}::uuid,
        appeal_hearing_date = now(),
        appeal_date_decided = now(),
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async recordInformalResolution(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      informalResolutionNotes: string;
    }
  ): Promise<DisciplinaryCaseResponse> {
    const [row] = await tx<DisciplinaryCaseDbRow[]>`
      UPDATE app.disciplinary_cases SET
        informal_resolution_attempted = true,
        informal_resolution_notes = ${data.informalResolutionNotes},
        informal_resolution_date = now(),
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // Row Mapping
  // ---------------------------------------------------------------------------

  private mapRow(row: DisciplinaryCaseDbRow): DisciplinaryCaseResponse {
    const evidence = Array.isArray(row.evidenceDocuments)
      ? (row.evidenceDocuments as Array<Record<string, unknown>>)
      : [];

    return {
      id: row.id,
      tenantId: row.tenantId,
      caseId: row.caseId,
      employeeId: row.employeeId,
      caseType: row.caseType as DisciplinaryCaseResponse["caseType"],
      stage: row.stage as DisciplinaryCaseResponse["stage"],

      allegationSummary: row.allegationSummary,
      investigationFindings: row.investigationFindings,
      investigatorId: row.investigatorId,
      investigationStartedAt: row.investigationStartedAt?.toISOString() || null,
      investigationCompletedAt: row.investigationCompletedAt?.toISOString() || null,
      evidenceDocuments: evidence.map((doc) => ({
        documentId: (doc.documentId as string) || undefined,
        name: (doc.name as string) || "",
        description: (doc.description as string) || undefined,
        uploadedAt: (doc.uploadedAt as string) || undefined,
      })),

      notificationSentAt: row.notificationSentAt?.toISOString() || null,
      notificationContent: row.notificationContent,

      hearingDate: row.hearingDate?.toISOString() || null,
      hearingLocation: row.hearingLocation,
      hearingNoticeSentAt: row.hearingNoticeSentAt?.toISOString() || null,
      companionName: row.companionName,
      companionType: row.companionType as DisciplinaryCaseResponse["companionType"],
      companionOrganisation: row.companionOrganisation,
      hearingNotes: row.hearingNotes,
      hearingAttended: row.hearingAttended,

      decision: row.decision as DisciplinaryCaseResponse["decision"],
      decisionDate: row.decisionDate?.toISOString() || null,
      decisionReason: row.decisionReason,
      warningExpiryDate: row.warningExpiryDate || null,

      rightToAppealExpires: row.rightToAppealExpires?.toISOString() || null,
      appealSubmitted: row.appealSubmitted,
      appealDate: row.appealDate?.toISOString() || null,
      appealGrounds: row.appealGrounds,
      appealHeardBy: row.appealHeardBy,
      appealHearingDate: row.appealHearingDate?.toISOString() || null,
      appealOutcome: row.appealOutcome as DisciplinaryCaseResponse["appealOutcome"],
      appealOutcomeReason: row.appealOutcomeReason,
      appealDateDecided: row.appealDateDecided?.toISOString() || null,

      informalResolutionAttempted: row.informalResolutionAttempted,
      informalResolutionNotes: row.informalResolutionNotes,
      informalResolutionDate: row.informalResolutionDate?.toISOString() || null,

      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString() || String(row.updatedAt),
    };
  }

  private mapStageHistoryRow(row: StageHistoryDbRow): StageHistoryEntry {
    return {
      id: row.id,
      fromStage: row.fromStage as StageHistoryEntry["fromStage"],
      toStage: row.toStage as StageHistoryEntry["toStage"],
      changedBy: row.changedBy,
      notes: row.notes,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
    };
  }
}
