/**
 * Data Breach Module - Repository Layer
 *
 * Provides data access methods for data breach entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Enhanced for full ICO breach notification lifecycle.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  ReportBreach,
  AssessBreach,
  NotifyIco,
  NotifySubjects,
  CloseBreach,
  CreateTimelineEntry,
  BreachFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface BreachRow extends Row {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  detectedAt: Date;
  detectedBy: string;
  severity: string;
  status: string;
  breachCategory: string | null;
  breachType: string | null;
  natureOfBreach: string | null;
  dataCategoriesAffected: string[] | null;
  estimatedIndividualsAffected: number | null;
  likelyConsequences: string | null;
  measuresTaken: string | null;
  containmentActions: string | null;
  rootCause: string | null;
  // Risk assessment
  riskToIndividuals: boolean | null;
  highRiskToIndividuals: boolean | null;
  icoNotificationRequired: boolean | null;
  subjectNotificationRequired: boolean | null;
  assessmentNotes: string | null;
  assessedAt: Date | null;
  assessedBy: string | null;
  // ICO notification
  icoNotified: boolean;
  icoNotificationDate: Date | null;
  icoReference: string | null;
  icoDeadline: Date | null;
  icoNotifiedWithin72h: boolean | null;
  // DPO details
  dpoName: string | null;
  dpoEmail: string | null;
  dpoPhone: string | null;
  dpoNotified: boolean;
  dpoNotificationDate: Date | null;
  // Data subject notification
  individualsNotified: boolean;
  individualsNotificationDate: Date | null;
  subjectNotificationMethod: string | null;
  subjectsNotifiedCount: number | null;
  subjectNotificationContent: string | null;
  subjectsNotificationDate: Date | null;
  // Resolution
  lessonsLearned: string | null;
  remediationPlan: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  closedBy: string | null;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface TimelineEntryRow extends Row {
  id: string;
  tenantId: string;
  breachId: string;
  action: string;
  actionBy: string | null;
  actionAt: Date;
  notes: string | null;
  createdAt: Date;
}

// =============================================================================
// Column Lists (explicit, avoiding SELECT *)
// =============================================================================

const BREACH_COLUMNS = `
  id, tenant_id, title, description, detected_at, detected_by,
  severity, status, breach_category, breach_type,
  nature_of_breach, data_categories_affected,
  estimated_individuals_affected, likely_consequences, measures_taken,
  containment_actions, root_cause,
  risk_to_individuals, high_risk_to_individuals,
  ico_notification_required, subject_notification_required,
  assessment_notes, assessed_at, assessed_by,
  ico_notified, ico_notification_date, ico_reference, ico_deadline,
  ico_notified_within_72h,
  dpo_name, dpo_email, dpo_phone,
  dpo_notified, dpo_notification_date,
  individuals_notified, individuals_notification_date,
  subject_notification_method, subjects_notified_count,
  subject_notification_content, subjects_notification_date,
  lessons_learned, remediation_plan, resolved_at, closed_at, closed_by,
  created_at, updated_at
`;

const TIMELINE_COLUMNS = `
  id, tenant_id, breach_id, action, action_by, action_at, notes, created_at
`;

// =============================================================================
// Repository
// =============================================================================

export class DataBreachRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Breach Operations
  // ===========================================================================

  async listBreaches(
    ctx: TenantContext,
    filters: BreachFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<BreachRow>> {
    const limit = pagination.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<BreachRow[]>`
        SELECT ${tx.unsafe(BREACH_COLUMNS)}
        FROM data_breaches
        WHERE 1=1
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.severity ? tx`AND severity = ${filters.severity}` : tx``}
          ${filters.breach_category ? tx`AND breach_category = ${filters.breach_category}` : tx``}
          ${filters.breach_type ? tx`AND breach_type = ${filters.breach_type}` : tx``}
          ${filters.detected_from ? tx`AND detected_at >= ${filters.detected_from}::date` : tx``}
          ${filters.detected_to ? tx`AND detected_at <= ${filters.detected_to}::date + interval '1 day'` : tx``}
          ${filters.search ? tx`AND (
            title ILIKE ${"%" + filters.search + "%"}
            OR description ILIKE ${"%" + filters.search + "%"}
            OR nature_of_breach ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${filters.ico_overdue ? tx`AND ico_notified = false AND ico_deadline < now() AND status NOT IN ('closed', 'remediation_only')` : tx``}
        ORDER BY detected_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getBreachById(
    ctx: TenantContext,
    id: string
  ): Promise<BreachRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<BreachRow[]>`
        SELECT ${tx.unsafe(BREACH_COLUMNS)}
        FROM data_breaches
        WHERE id = ${id}
      `;
    });

    return rows.length > 0 ? rows[0] : null;
  }

  async createBreach(
    tx: TransactionSql,
    ctx: TenantContext,
    data: ReportBreach & { icoDeadline: Date }
  ): Promise<BreachRow> {
    const rows = await tx<BreachRow[]>`
      INSERT INTO data_breaches (
        tenant_id, title, description, detected_at, detected_by,
        severity, status, breach_category, breach_type,
        nature_of_breach, data_categories_affected,
        estimated_individuals_affected, likely_consequences, measures_taken,
        ico_deadline
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.title},
        ${data.description || null},
        ${data.discovery_date}::timestamptz,
        ${ctx.userId || null}::uuid,
        ${data.severity || "medium"},
        'reported',
        ${data.breach_category},
        ${data.breach_type || null},
        ${data.nature_of_breach},
        ${data.data_categories_affected || null},
        ${data.estimated_individuals_affected ?? null},
        ${data.likely_consequences || null},
        ${data.measures_taken || null},
        ${data.icoDeadline.toISOString()}::timestamptz
      )
      RETURNING ${tx.unsafe(BREACH_COLUMNS)}
    `;

    return rows[0];
  }

  async assessBreach(
    tx: TransactionSql,
    id: string,
    data: AssessBreach,
    currentStatus: string,
    assessedBy: string
  ): Promise<BreachRow | null> {
    const rows = await tx<BreachRow[]>`
      UPDATE data_breaches
      SET
        severity = ${data.severity},
        status = 'assessing',
        risk_to_individuals = ${data.risk_to_individuals},
        high_risk_to_individuals = ${data.high_risk_to_individuals},
        ico_notification_required = ${data.ico_notification_required},
        subject_notification_required = ${data.subject_notification_required},
        assessment_notes = ${data.assessment_notes || null},
        assessed_at = now(),
        assessed_by = ${assessedBy}::uuid,
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(BREACH_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  async notifyIco(
    tx: TransactionSql,
    id: string,
    data: NotifyIco,
    currentStatus: string,
    icoDeadline: Date | null
  ): Promise<BreachRow | null> {
    // Calculate whether notification was within 72 hours
    const notificationDate = new Date(data.ico_notification_date);
    const within72h = icoDeadline ? notificationDate <= icoDeadline : null;

    const rows = await tx<BreachRow[]>`
      UPDATE data_breaches
      SET
        status = 'ico_notified',
        ico_notified = true,
        ico_notification_date = ${data.ico_notification_date}::timestamptz,
        ico_reference = ${data.ico_reference},
        ico_notified_within_72h = ${within72h},
        dpo_name = ${data.dpo_name},
        dpo_email = ${data.dpo_email},
        dpo_phone = ${data.dpo_phone || null},
        dpo_notified = true,
        dpo_notification_date = now(),
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(BREACH_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  async notifySubjects(
    tx: TransactionSql,
    id: string,
    data: NotifySubjects,
    currentStatus: string
  ): Promise<BreachRow | null> {
    const rows = await tx<BreachRow[]>`
      UPDATE data_breaches
      SET
        status = 'subjects_notified',
        individuals_notified = true,
        individuals_notification_date = ${data.notification_date}::timestamptz,
        subject_notification_method = ${data.subject_notification_method},
        subjects_notified_count = ${data.subjects_notified_count},
        subject_notification_content = ${data.subject_notification_content},
        subjects_notification_date = ${data.notification_date}::timestamptz,
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(BREACH_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  async closeBreach(
    tx: TransactionSql,
    id: string,
    data: CloseBreach,
    currentStatus: string,
    closedBy: string
  ): Promise<BreachRow | null> {
    const rows = await tx<BreachRow[]>`
      UPDATE data_breaches
      SET
        status = 'closed',
        lessons_learned = ${data.lessons_learned},
        remediation_plan = ${data.remediation_plan},
        resolved_at = now(),
        closed_at = now(),
        closed_by = ${closedBy}::uuid,
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(BREACH_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Transition a breach to remediation_only status.
   * Used when assessment determines ICO/subject notification is not required.
   */
  async transitionToRemediationOnly(
    tx: TransactionSql,
    id: string,
    currentStatus: string,
    notes: string | null
  ): Promise<BreachRow | null> {
    const rows = await tx<BreachRow[]>`
      UPDATE data_breaches
      SET
        status = 'remediation_only',
        ${notes ? tx`assessment_notes = COALESCE(assessment_notes, '') || E'\n' || ${notes},` : tx``}
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(BREACH_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  async getOverdueBreaches(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<BreachRow>> {
    const limit = pagination.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<BreachRow[]>`
        SELECT ${tx.unsafe(BREACH_COLUMNS)}
        FROM data_breaches
        WHERE ico_notified = false
          AND status NOT IN ('closed', 'remediation_only')
          AND ico_deadline < now()
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY ico_deadline ASC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  async getDashboardStats(
    ctx: TenantContext
  ): Promise<{
    openBreaches: number;
    overdueIcoNotifications: number;
    pendingIcoNotifications: number;
    pendingSubjectNotifications: number;
    recentlyClosed: number;
    bySeverity: { low: number; medium: number; high: number; critical: number };
    byStatus: Record<string, number>;
    avgHoursToIcoNotification: number | null;
  }> {
    const stats = await this.db.withTransaction(ctx, async (tx) => {
      // Open breaches count
      const [openResult] = await tx<[{ count: string }]>`
        SELECT COUNT(*)::text AS count FROM data_breaches
        WHERE status NOT IN ('closed')
      `;

      // Overdue ICO notifications (past 72h, not notified, not closed/remediation)
      const [overdueResult] = await tx<[{ count: string }]>`
        SELECT COUNT(*)::text AS count FROM data_breaches
        WHERE ico_notified = false
          AND status NOT IN ('closed', 'remediation_only')
          AND ico_deadline < now()
      `;

      // Pending ICO notifications (assessed as required, not yet notified)
      const [pendingIcoResult] = await tx<[{ count: string }]>`
        SELECT COUNT(*)::text AS count FROM data_breaches
        WHERE ico_notification_required = true
          AND ico_notified = false
          AND status NOT IN ('closed', 'remediation_only')
      `;

      // Pending subject notifications (ICO notified, subject notification required, not yet done)
      const [pendingSubjectResult] = await tx<[{ count: string }]>`
        SELECT COUNT(*)::text AS count FROM data_breaches
        WHERE subject_notification_required = true
          AND individuals_notified = false
          AND status IN ('ico_notified', 'notified_ico')
      `;

      // Recently closed (last 30 days)
      const [recentlyClosedResult] = await tx<[{ count: string }]>`
        SELECT COUNT(*)::text AS count FROM data_breaches
        WHERE status = 'closed'
          AND closed_at >= now() - interval '30 days'
      `;

      // By severity (open breaches only)
      const severityRows = await tx<{ severity: string; count: string }[]>`
        SELECT severity, COUNT(*)::text AS count FROM data_breaches
        WHERE status NOT IN ('closed')
        GROUP BY severity
      `;

      // By status (all)
      const statusRows = await tx<{ status: string; count: string }[]>`
        SELECT status, COUNT(*)::text AS count FROM data_breaches
        GROUP BY status
      `;

      // Average hours to ICO notification
      const [avgResult] = await tx<[{ avg_hours: string | null }]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM (ico_notification_date - detected_at)) / 3600)::numeric(10,1)::text
            AS avg_hours
        FROM data_breaches
        WHERE ico_notified = true AND ico_notification_date IS NOT NULL
      `;

      const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const row of severityRows) {
        if (row.severity in bySeverity) {
          bySeverity[row.severity as keyof typeof bySeverity] = parseInt(row.count, 10);
        }
      }

      const byStatus: Record<string, number> = {};
      for (const row of statusRows) {
        byStatus[row.status] = parseInt(row.count, 10);
      }

      return {
        openBreaches: parseInt(openResult.count, 10),
        overdueIcoNotifications: parseInt(overdueResult.count, 10),
        pendingIcoNotifications: parseInt(pendingIcoResult.count, 10),
        pendingSubjectNotifications: parseInt(pendingSubjectResult.count, 10),
        recentlyClosed: parseInt(recentlyClosedResult.count, 10),
        bySeverity,
        byStatus,
        avgHoursToIcoNotification: avgResult.avg_hours ? parseFloat(avgResult.avg_hours) : null,
      };
    });

    return stats;
  }

  // ===========================================================================
  // Timeline Operations
  // ===========================================================================

  async getTimeline(
    ctx: TenantContext,
    breachId: string
  ): Promise<TimelineEntryRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TimelineEntryRow[]>`
        SELECT ${tx.unsafe(TIMELINE_COLUMNS)}
        FROM data_breach_timeline
        WHERE breach_id = ${breachId}
        ORDER BY action_at DESC
      `;
    });
  }

  async createTimelineEntry(
    tx: TransactionSql,
    ctx: TenantContext,
    breachId: string,
    data: CreateTimelineEntry
  ): Promise<TimelineEntryRow> {
    const rows = await tx<TimelineEntryRow[]>`
      INSERT INTO data_breach_timeline (
        tenant_id, breach_id, action, action_by, notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${breachId}::uuid,
        ${data.action},
        ${ctx.userId || null}::uuid,
        ${data.notes || null}
      )
      RETURNING ${tx.unsafe(TIMELINE_COLUMNS)}
    `;

    return rows[0];
  }
}
