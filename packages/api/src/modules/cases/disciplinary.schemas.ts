/**
 * Disciplinary & Grievance Module - TypeBox Schemas
 *
 * ACAS Code of Practice compliant validation schemas.
 * Non-compliance with ACAS Code results in up to 25% tribunal award uplift
 * (s.207A Trade Union and Labour Relations (Consolidation) Act 1992).
 */

import { t } from "elysia";

// =============================================================================
// Shared Enums
// =============================================================================

export const DisciplinaryCaseTypeSchema = t.Union([
  t.Literal("disciplinary"),
  t.Literal("grievance"),
]);

export const DisciplinaryStageSchema = t.Union([
  t.Literal("informal_resolution"),
  t.Literal("formal_submission"),
  t.Literal("investigation"),
  t.Literal("notification"),
  t.Literal("hearing"),
  t.Literal("decision"),
  t.Literal("appeal"),
  t.Literal("closed"),
]);

export const DisciplinaryDecisionSchema = t.Union([
  t.Literal("no_action"),
  t.Literal("verbal_warning"),
  t.Literal("written_warning"),
  t.Literal("final_written_warning"),
  t.Literal("dismissal"),
  t.Literal("uphold_grievance"),
  t.Literal("partial_uphold"),
  t.Literal("reject_grievance"),
]);

export const CompanionTypeSchema = t.Union([
  t.Literal("trade_union_rep"),
  t.Literal("colleague"),
]);

export const AppealOutcomeSchema = t.Union([
  t.Literal("upheld"),
  t.Literal("partially_upheld"),
  t.Literal("rejected"),
]);

const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a disciplinary or grievance case linked to an existing HR case.
 */
export const CreateDisciplinaryCaseSchema = t.Object({
  employeeId: UuidSchema,
  caseType: DisciplinaryCaseTypeSchema,
  allegationSummary: t.Optional(t.String({ maxLength: 10000 })),
  investigatorId: t.Optional(UuidSchema),
});

/**
 * Record investigation findings and evidence.
 */
export const RecordInvestigationSchema = t.Object({
  investigationFindings: t.String({ minLength: 1, maxLength: 20000 }),
  investigatorId: t.Optional(UuidSchema),
  evidenceDocuments: t.Optional(t.Array(t.Object({
    documentId: t.Optional(UuidSchema),
    name: t.String({ minLength: 1, maxLength: 500 }),
    description: t.Optional(t.String({ maxLength: 2000 })),
    uploadedAt: t.Optional(t.String()),
  }))),
});

/**
 * Schedule a hearing.
 * ACAS Code para 12: minimum 5 working days notice.
 */
export const ScheduleHearingSchema = t.Object({
  hearingDate: t.String({ format: "date-time" }),
  hearingLocation: t.String({ minLength: 1, maxLength: 500 }),
  notificationContent: t.Optional(t.String({ maxLength: 10000 })),
});

/**
 * Record hearing notes and companion details.
 * Right to be accompanied: s.10 TULRCA 1992.
 */
export const RecordHearingSchema = t.Object({
  hearingNotes: t.String({ minLength: 1, maxLength: 20000 }),
  hearingAttended: t.Boolean(),
  companionName: t.Optional(t.String({ maxLength: 200 })),
  companionType: t.Optional(CompanionTypeSchema),
  companionOrganisation: t.Optional(t.String({ maxLength: 200 })),
});

/**
 * Record disciplinary/grievance decision with reasons.
 * ACAS Code para 19: decision communicated in writing with reasons.
 * Auto-calculates 5 working day appeal deadline.
 */
export const RecordDecisionSchema = t.Object({
  decision: DisciplinaryDecisionSchema,
  decisionReason: t.String({ minLength: 1, maxLength: 10000 }),
  warningExpiryDate: t.Optional(t.String({ format: "date" })),
});

/**
 * Submit an appeal within the appeal window.
 * ACAS Code para 26: right to appeal must be offered.
 */
export const SubmitAppealSchema = t.Object({
  appealGrounds: t.String({ minLength: 1, maxLength: 10000 }),
});

/**
 * Record appeal outcome.
 * ACAS Code para 27: appeal heard by different, more senior manager.
 */
export const RecordAppealOutcomeSchema = t.Object({
  appealOutcome: AppealOutcomeSchema,
  appealOutcomeReason: t.String({ minLength: 1, maxLength: 10000 }),
  appealHeardBy: UuidSchema,
});

/**
 * Record informal resolution attempt (grievance only).
 */
export const RecordInformalResolutionSchema = t.Object({
  informalResolutionNotes: t.String({ minLength: 1, maxLength: 10000 }),
  resolved: t.Boolean(),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const DisciplinaryCaseResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  caseId: UuidSchema,
  employeeId: UuidSchema,
  caseType: DisciplinaryCaseTypeSchema,
  stage: DisciplinaryStageSchema,

  // Investigation
  allegationSummary: t.Union([t.String(), t.Null()]),
  investigationFindings: t.Union([t.String(), t.Null()]),
  investigatorId: t.Union([UuidSchema, t.Null()]),
  investigationStartedAt: t.Union([t.String(), t.Null()]),
  investigationCompletedAt: t.Union([t.String(), t.Null()]),
  evidenceDocuments: t.Array(t.Object({
    documentId: t.Optional(UuidSchema),
    name: t.String(),
    description: t.Optional(t.String()),
    uploadedAt: t.Optional(t.String()),
  })),

  // Notification
  notificationSentAt: t.Union([t.String(), t.Null()]),
  notificationContent: t.Union([t.String(), t.Null()]),

  // Hearing
  hearingDate: t.Union([t.String(), t.Null()]),
  hearingLocation: t.Union([t.String(), t.Null()]),
  hearingNoticeSentAt: t.Union([t.String(), t.Null()]),
  companionName: t.Union([t.String(), t.Null()]),
  companionType: t.Union([CompanionTypeSchema, t.Null()]),
  companionOrganisation: t.Union([t.String(), t.Null()]),
  hearingNotes: t.Union([t.String(), t.Null()]),
  hearingAttended: t.Union([t.Boolean(), t.Null()]),

  // Decision
  decision: t.Union([DisciplinaryDecisionSchema, t.Null()]),
  decisionDate: t.Union([t.String(), t.Null()]),
  decisionReason: t.Union([t.String(), t.Null()]),
  warningExpiryDate: t.Union([t.String(), t.Null()]),

  // Appeal
  rightToAppealExpires: t.Union([t.String(), t.Null()]),
  appealSubmitted: t.Boolean(),
  appealDate: t.Union([t.String(), t.Null()]),
  appealGrounds: t.Union([t.String(), t.Null()]),
  appealHeardBy: t.Union([UuidSchema, t.Null()]),
  appealHearingDate: t.Union([t.String(), t.Null()]),
  appealOutcome: t.Union([AppealOutcomeSchema, t.Null()]),
  appealOutcomeReason: t.Union([t.String(), t.Null()]),
  appealDateDecided: t.Union([t.String(), t.Null()]),

  // Informal resolution (grievance)
  informalResolutionAttempted: t.Boolean(),
  informalResolutionNotes: t.Union([t.String(), t.Null()]),
  informalResolutionDate: t.Union([t.String(), t.Null()]),

  // Metadata
  createdAt: t.String(),
  updatedAt: t.String(),
});

/**
 * ACAS compliance check response.
 * Lists which ACAS Code steps have been followed and which are missing.
 */
export const AcasComplianceResponseSchema = t.Object({
  caseId: UuidSchema,
  caseType: DisciplinaryCaseTypeSchema,
  stage: DisciplinaryStageSchema,
  overallCompliant: t.Boolean(),
  complianceScore: t.Number(),
  steps: t.Array(t.Object({
    step: t.String(),
    description: t.String(),
    acasReference: t.String(),
    status: t.Union([
      t.Literal("completed"),
      t.Literal("pending"),
      t.Literal("missing"),
      t.Literal("not_applicable"),
    ]),
    completedAt: t.Union([t.String(), t.Null()]),
    notes: t.Union([t.String(), t.Null()]),
  })),
  risks: t.Array(t.Object({
    severity: t.Union([t.Literal("high"), t.Literal("medium"), t.Literal("low")]),
    description: t.String(),
  })),
});

export const StageHistoryEntrySchema = t.Object({
  id: UuidSchema,
  fromStage: t.Union([DisciplinaryStageSchema, t.Null()]),
  toStage: DisciplinaryStageSchema,
  changedBy: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type DisciplinaryCaseType = typeof DisciplinaryCaseTypeSchema.static;
export type DisciplinaryStage = typeof DisciplinaryStageSchema.static;
export type DisciplinaryDecision = typeof DisciplinaryDecisionSchema.static;
export type CompanionType = typeof CompanionTypeSchema.static;
export type AppealOutcome = typeof AppealOutcomeSchema.static;

export type CreateDisciplinaryCase = typeof CreateDisciplinaryCaseSchema.static;
export type RecordInvestigation = typeof RecordInvestigationSchema.static;
export type ScheduleHearing = typeof ScheduleHearingSchema.static;
export type RecordHearing = typeof RecordHearingSchema.static;
export type RecordDecision = typeof RecordDecisionSchema.static;
export type SubmitAppeal = typeof SubmitAppealSchema.static;
export type RecordAppealOutcome = typeof RecordAppealOutcomeSchema.static;
export type RecordInformalResolution = typeof RecordInformalResolutionSchema.static;

export type DisciplinaryCaseResponse = typeof DisciplinaryCaseResponseSchema.static;
export type AcasComplianceResponse = typeof AcasComplianceResponseSchema.static;
export type StageHistoryEntry = typeof StageHistoryEntrySchema.static;
