/**
 * Data Breach Module - TypeBox Schemas
 *
 * Defines validation schemas for all Data Breach API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK GDPR Articles 33-34 require:
 * - Reporting personal data breaches to ICO within 72 hours
 * - Notifying affected individuals when high risk
 * - Maintaining a breach register with facts, effects, and remedial actions
 *
 * State machine: reported -> assessing -> ico_notified -> subjects_notified -> closed
 *                                      \-> remediation_only -> closed
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const BreachSeveritySchema = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("critical"),
]);

export type BreachSeverity = Static<typeof BreachSeveritySchema>;

/** Breach classification per ICO guidance */
export const BreachCategorySchema = t.Union([
  t.Literal("confidentiality"),
  t.Literal("integrity"),
  t.Literal("availability"),
]);

export type BreachCategory = Static<typeof BreachCategorySchema>;

/**
 * Enhanced status enum matching the shared state machine.
 * Backward-compatible: old statuses (detected, investigating, etc.) still exist
 * in the DB enum but the service layer uses the new lifecycle.
 */
export const BreachStatusSchema = t.Union([
  t.Literal("reported"),
  t.Literal("assessing"),
  t.Literal("ico_notified"),
  t.Literal("subjects_notified"),
  t.Literal("remediation_only"),
  t.Literal("closed"),
  // Legacy statuses (kept for DB compatibility; new code should not produce these)
  t.Literal("detected"),
  t.Literal("investigating"),
  t.Literal("contained"),
  t.Literal("notified_ico"),
  t.Literal("notified_individuals"),
  t.Literal("resolved"),
]);

export type BreachStatus = Static<typeof BreachStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

// =============================================================================
// Report Breach Schema (POST /incidents)
// =============================================================================

export const ReportBreachSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 10000 })),
  /** When the breach was discovered */
  discovery_date: t.String({ format: "date-time" }),
  /** Breach classification: confidentiality, integrity, availability */
  breach_category: BreachCategorySchema,
  /** Free-text breach type for additional detail (e.g. "phishing", "lost laptop") */
  breach_type: t.Optional(t.String({ maxLength: 100 })),
  /** Nature of the personal data involved */
  nature_of_breach: t.String({ minLength: 1, maxLength: 10000 }),
  /** Categories of personal data affected */
  data_categories_affected: t.Optional(t.Array(t.String({ maxLength: 100 }))),
  /** Estimated number of data subjects affected */
  estimated_individuals_affected: t.Optional(t.Number({ minimum: 0 })),
  /** Description of likely consequences for data subjects */
  likely_consequences: t.Optional(t.String({ maxLength: 10000 })),
  /** Measures taken or proposed to address the breach */
  measures_taken: t.Optional(t.String({ maxLength: 10000 })),
  /** Initial severity assessment */
  severity: t.Optional(BreachSeveritySchema),
});

export type ReportBreach = Static<typeof ReportBreachSchema>;

// =============================================================================
// Assess Breach Schema (PATCH /incidents/:id/assess)
// =============================================================================

export const AssessBreachSchema = t.Object({
  /** Overall severity */
  severity: BreachSeveritySchema,
  /** Is the breach likely to result in a risk to individuals' rights and freedoms? */
  risk_to_individuals: t.Boolean(),
  /** Is the breach likely to result in a HIGH risk to individuals? */
  high_risk_to_individuals: t.Boolean(),
  /** Is ICO notification required? (threshold: likely to result in risk) */
  ico_notification_required: t.Boolean(),
  /** Is data subject notification required? (threshold: likely to result in HIGH risk) */
  subject_notification_required: t.Boolean(),
  /** Assessment notes / reasoning */
  assessment_notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type AssessBreach = Static<typeof AssessBreachSchema>;

// =============================================================================
// Notify ICO Schema (POST /incidents/:id/notify-ico)
// =============================================================================

export const NotifyIcoSchema = t.Object({
  /** DPO or reporter name */
  dpo_name: t.String({ minLength: 1, maxLength: 255 }),
  /** DPO contact email */
  dpo_email: t.String({ minLength: 1, maxLength: 255 }),
  /** DPO contact phone */
  dpo_phone: t.Optional(t.String({ maxLength: 50 })),
  /** ICO reference number received */
  ico_reference: t.String({ minLength: 1, maxLength: 100 }),
  /** Date/time the ICO was notified */
  ico_notification_date: t.String({ format: "date-time" }),
});

export type NotifyIco = Static<typeof NotifyIcoSchema>;

// =============================================================================
// Notify Data Subjects Schema (POST /incidents/:id/notify-subjects)
// =============================================================================

export const NotifySubjectsSchema = t.Object({
  /** Method of communication (email, letter, public notice, etc.) */
  subject_notification_method: t.String({ minLength: 1, maxLength: 100 }),
  /** Number of subjects notified */
  subjects_notified_count: t.Number({ minimum: 1 }),
  /** Date the notification was sent */
  notification_date: t.String({ format: "date-time" }),
  /** Content or summary of the notification sent */
  subject_notification_content: t.String({ minLength: 1, maxLength: 10000 }),
});

export type NotifySubjects = Static<typeof NotifySubjectsSchema>;

// =============================================================================
// Close Breach Schema (PATCH /incidents/:id/close)
// =============================================================================

export const CloseBreachSchema = t.Object({
  /** Lessons learned from the breach */
  lessons_learned: t.String({ minLength: 1, maxLength: 10000 }),
  /** Remediation plan to prevent recurrence */
  remediation_plan: t.String({ minLength: 1, maxLength: 10000 }),
});

export type CloseBreach = Static<typeof CloseBreachSchema>;

// =============================================================================
// Create Timeline Entry Schema (POST /incidents/:id/timeline)
// =============================================================================

export const CreateTimelineEntrySchema = t.Object({
  action: t.String({ minLength: 1, maxLength: 255 }),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateTimelineEntry = Static<typeof CreateTimelineEntrySchema>;

// =============================================================================
// Breach Filters Schema
// =============================================================================

export const BreachFiltersSchema = t.Object({
  status: t.Optional(BreachStatusSchema),
  severity: t.Optional(BreachSeveritySchema),
  breach_category: t.Optional(BreachCategorySchema),
  breach_type: t.Optional(t.String({ maxLength: 100 })),
  search: t.Optional(t.String({ minLength: 1 })),
  detected_from: t.Optional(t.String({ format: "date" })),
  detected_to: t.Optional(t.String({ format: "date" })),
  ico_overdue: t.Optional(t.Boolean()),
});

export type BreachFilters = Static<typeof BreachFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const BreachResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  // Discovery & detection
  discovery_date: t.String(),
  detected_by: UuidSchema,
  severity: BreachSeveritySchema,
  status: t.String(), // Broad string to handle both old and new statuses
  breach_category: t.Union([t.String(), t.Null()]),
  breach_type: t.Union([t.String(), t.Null()]),
  nature_of_breach: t.Union([t.String(), t.Null()]),
  data_categories_affected: t.Union([t.Array(t.String()), t.Null()]),
  estimated_individuals_affected: t.Union([t.Number(), t.Null()]),
  likely_consequences: t.Union([t.String(), t.Null()]),
  measures_taken: t.Union([t.String(), t.Null()]),
  // Containment
  containment_actions: t.Union([t.String(), t.Null()]),
  root_cause: t.Union([t.String(), t.Null()]),
  // Risk assessment
  risk_to_individuals: t.Union([t.Boolean(), t.Null()]),
  high_risk_to_individuals: t.Union([t.Boolean(), t.Null()]),
  ico_notification_required: t.Union([t.Boolean(), t.Null()]),
  subject_notification_required: t.Union([t.Boolean(), t.Null()]),
  assessment_notes: t.Union([t.String(), t.Null()]),
  assessed_at: t.Union([t.String(), t.Null()]),
  // ICO notification (Article 33)
  ico_notified: t.Boolean(),
  ico_notification_date: t.Union([t.String(), t.Null()]),
  ico_reference: t.Union([t.String(), t.Null()]),
  ico_deadline: t.Union([t.String(), t.Null()]),
  ico_notified_within_72h: t.Union([t.Boolean(), t.Null()]),
  // DPO details
  dpo_name: t.Union([t.String(), t.Null()]),
  dpo_email: t.Union([t.String(), t.Null()]),
  dpo_phone: t.Union([t.String(), t.Null()]),
  // Data subject notification (Article 34)
  individuals_notified: t.Boolean(),
  subject_notification_method: t.Union([t.String(), t.Null()]),
  subjects_notified_count: t.Union([t.Number(), t.Null()]),
  subject_notification_content: t.Union([t.String(), t.Null()]),
  subjects_notification_date: t.Union([t.String(), t.Null()]),
  // Resolution
  lessons_learned: t.Union([t.String(), t.Null()]),
  remediation_plan: t.Union([t.String(), t.Null()]),
  resolved_at: t.Union([t.String(), t.Null()]),
  closed_at: t.Union([t.String(), t.Null()]),
  // Computed fields
  is_overdue: t.Boolean(),
  hours_remaining: t.Union([t.Number(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type BreachResponse = Static<typeof BreachResponseSchema>;

export const TimelineEntryResponseSchema = t.Object({
  id: UuidSchema,
  breach_id: UuidSchema,
  action: t.String(),
  action_by: t.Union([UuidSchema, t.Null()]),
  action_at: t.String(),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type TimelineEntryResponse = Static<typeof TimelineEntryResponseSchema>;

export const BreachListResponseSchema = t.Object({
  items: t.Array(BreachResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  total: t.Optional(t.Number()),
});

export type BreachListResponse = Static<typeof BreachListResponseSchema>;

// =============================================================================
// Dashboard Response Schema
// =============================================================================

export const BreachDashboardResponseSchema = t.Object({
  /** Total open breaches (not closed) */
  open_breaches: t.Number(),
  /** Breaches past 72h without ICO notification */
  overdue_ico_notifications: t.Number(),
  /** Breaches requiring ICO notification (assessed, not yet notified) */
  pending_ico_notifications: t.Number(),
  /** Breaches requiring subject notification (ICO notified, subjects not yet notified) */
  pending_subject_notifications: t.Number(),
  /** Breaches closed in the last 30 days */
  recently_closed: t.Number(),
  /** Breakdown by severity */
  by_severity: t.Object({
    low: t.Number(),
    medium: t.Number(),
    high: t.Number(),
    critical: t.Number(),
  }),
  /** Breakdown by status */
  by_status: t.Record(t.String(), t.Number()),
  /** Average hours to ICO notification (for breaches where ICO was notified) */
  avg_hours_to_ico_notification: t.Union([t.Number(), t.Null()]),
});

export type BreachDashboardResponse = Static<typeof BreachDashboardResponseSchema>;

// =============================================================================
// Legacy schemas kept for backward compatibility
// =============================================================================

/** @deprecated Use ReportBreachSchema instead */
export const CreateBreachSchema = ReportBreachSchema;
export type CreateBreach = ReportBreach;

/** @deprecated Use individual action schemas instead */
export const UpdateBreachStatusSchema = t.Object({
  status: BreachStatusSchema,
  notes: t.Optional(t.String({ maxLength: 5000 })),
  ico_reference: t.Optional(t.String({ maxLength: 100 })),
  ico_notification_date: t.Optional(t.String({ format: "date-time" })),
  individuals_notification_date: t.Optional(t.String({ format: "date-time" })),
  dpo_notified: t.Optional(t.Boolean()),
  dpo_notification_date: t.Optional(t.String({ format: "date-time" })),
  containment_actions: t.Optional(t.String({ maxLength: 10000 })),
  root_cause: t.Optional(t.String({ maxLength: 10000 })),
  lessons_learned: t.Optional(t.String({ maxLength: 10000 })),
  remediation_plan: t.Optional(t.String({ maxLength: 10000 })),
});

export type UpdateBreachStatus = Static<typeof UpdateBreachStatusSchema>;
