/**
 * Case Hearings Module - Repository Layer
 *
 * Database operations for hearing scheduling and management.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { HearingResponse, CreateHearing, UpdateHearing } from "./hearings.schemas";

// =============================================================================
// DB Row Types (after camelCase transform from postgres.js)
// =============================================================================

interface HearingDbRow {
  id: string;
  tenantId: string;
  caseId: string;
  hearingType: string;
  status: string;
  scheduledDate: Date;
  location: string;
  chairPersonId: string | null;
  hrRepresentativeId: string | null;
  employeeId: string;
  companionId: string | null;
  companionType: string | null;
  noticeSentAt: Date | null;
  minimumNoticeDays: number;
  outcome: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class HearingsRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async createHearing(
    tx: TransactionSql,
    ctx: TenantContext,
    caseId: string,
    data: CreateHearing
  ): Promise<HearingResponse> {
    const noticeSentAt = data.noticeSentAt || new Date().toISOString();
    const minimumNoticeDays = data.minimumNoticeDays ?? 5;

    const [row] = await tx<HearingDbRow[]>`
      INSERT INTO app.case_hearings (
        id, tenant_id, case_id, hearing_type, status,
        scheduled_date, location,
        chair_person_id, hr_representative_id, employee_id,
        companion_id, companion_type,
        notice_sent_at, minimum_notice_days,
        notes, created_by
      ) VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${caseId}::uuid,
        ${data.hearingType}::app.hearing_type,
        'scheduled'::app.hearing_status,
        ${data.scheduledDate}::timestamptz,
        ${data.location},
        ${data.chairPersonId || null}::uuid,
        ${data.hrRepresentativeId || null}::uuid,
        ${data.employeeId}::uuid,
        ${data.companionId || null}::uuid,
        ${data.companionType || null}::app.companion_type,
        ${noticeSentAt}::timestamptz,
        ${minimumNoticeDays},
        ${data.notes || null},
        ${ctx.userId || null}::uuid
      )
      RETURNING *
    `;

    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async getHearingById(
    ctx: TenantContext,
    hearingId: string
  ): Promise<HearingResponse | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<HearingDbRow[]>`
          SELECT *
          FROM app.case_hearings
          WHERE id = ${hearingId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return row ? this.mapRow(row) : null;
  }

  async listHearingsByCaseId(
    ctx: TenantContext,
    caseId: string
  ): Promise<HearingResponse[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<HearingDbRow[]>`
          SELECT *
          FROM app.case_hearings
          WHERE case_id = ${caseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY scheduled_date ASC
        `;
      }
    );

    return rows.map((row) => this.mapRow(row));
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  async updateHearing(
    tx: TransactionSql,
    ctx: TenantContext,
    hearingId: string,
    data: UpdateHearing
  ): Promise<HearingResponse | null> {
    const [row] = await tx<HearingDbRow[]>`
      UPDATE app.case_hearings SET
        scheduled_date = COALESCE(${data.scheduledDate || null}::timestamptz, scheduled_date),
        location = COALESCE(${data.location || null}, location),
        status = COALESCE(${data.status || null}::app.hearing_status, status),
        chair_person_id = COALESCE(${data.chairPersonId || null}::uuid, chair_person_id),
        hr_representative_id = COALESCE(${data.hrRepresentativeId || null}::uuid, hr_representative_id),
        companion_id = COALESCE(${data.companionId || null}::uuid, companion_id),
        companion_type = COALESCE(${data.companionType || null}::app.companion_type, companion_type),
        notice_sent_at = COALESCE(${data.noticeSentAt || null}::timestamptz, notice_sent_at),
        minimum_notice_days = COALESCE(${data.minimumNoticeDays ?? null}, minimum_notice_days),
        outcome = COALESCE(${data.outcome || null}, outcome),
        notes = COALESCE(${data.notes || null}, notes),
        updated_at = now()
      WHERE id = ${hearingId}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING *
    `;

    return row ? this.mapRow(row) : null;
  }

  // ---------------------------------------------------------------------------
  // Row Mapping
  // ---------------------------------------------------------------------------

  private mapRow(row: HearingDbRow): HearingResponse {
    const noticeSentAt = row.noticeSentAt;
    const scheduledDate = row.scheduledDate;
    const minimumNoticeDays = row.minimumNoticeDays;

    // Calculate notice compliance:
    // The number of working days between notice_sent_at and scheduled_date
    // must be >= minimum_notice_days
    const noticeCompliant = this.isNoticeCompliant(noticeSentAt, scheduledDate, minimumNoticeDays);

    return {
      id: row.id,
      tenantId: row.tenantId,
      caseId: row.caseId,
      hearingType: row.hearingType as HearingResponse["hearingType"],
      status: row.status as HearingResponse["status"],
      scheduledDate: row.scheduledDate?.toISOString() || String(row.scheduledDate),
      location: row.location,
      chairPersonId: row.chairPersonId,
      hrRepresentativeId: row.hrRepresentativeId,
      employeeId: row.employeeId,
      companionId: row.companionId,
      companionType: row.companionType as HearingResponse["companionType"],
      noticeSentAt: row.noticeSentAt?.toISOString() || null,
      minimumNoticeDays: row.minimumNoticeDays,
      noticeCompliant,
      outcome: row.outcome,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString() || String(row.updatedAt),
    };
  }

  /**
   * Calculate whether the notice period is ACAS-compliant.
   *
   * Counts working days (excluding Saturday and Sunday) between
   * noticeSentAt and scheduledDate. Must be >= minimumNoticeDays.
   */
  private isNoticeCompliant(
    noticeSentAt: Date | null,
    scheduledDate: Date,
    minimumNoticeDays: number
  ): boolean {
    if (!noticeSentAt) return false;
    if (minimumNoticeDays === 0) return true;

    const workingDays = this.countWorkingDays(noticeSentAt, scheduledDate);
    return workingDays >= minimumNoticeDays;
  }

  /**
   * Count working days between two dates (excludes Saturdays and Sundays).
   * Does not exclude bank holidays -- that would require a separate lookup.
   */
  private countWorkingDays(from: Date, to: Date): number {
    let count = 0;
    const current = new Date(from);
    // Start counting from the day after notice was sent
    current.setDate(current.getDate() + 1);

    while (current < to) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }
}
