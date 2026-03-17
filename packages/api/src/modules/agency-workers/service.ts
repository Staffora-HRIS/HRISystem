/**
 * Agency Workers Regulations (AWR) Module - Service Layer
 *
 * Business logic for tracking agency worker assignments and enforcing
 * the AWR 2010 12-week qualifying period rules.
 *
 * Key AWR rules implemented:
 * 1. qualifying_date = start_date + 12 calendar weeks (84 days)
 * 2. Breaks affect the qualifying clock differently based on reason:
 *    - annual_leave, shutdown (<=6wk): clock continues (no adjustment)
 *    - sickness (<=28wk), jury_service, maternity (<=26wk), strike_lockout: clock pauses (qualifying_date shifts forward)
 *    - end_of_assignment / other (>6wk gap): clock resets
 *    - end_of_assignment / other (<=6wk gap): clock continues
 * 3. Once qualified, the worker is entitled to same pay/conditions as comparable permanent staff.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  AgencyWorkerRepository,
  type AssignmentRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreateAssignment,
  UpdateAssignment,
  AddBreak,
  AssignmentFilters,
  AssignmentResponse,
  BreakRecord,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** 12 calendar weeks in days */
const QUALIFYING_WEEKS = 12;
const QUALIFYING_DAYS = QUALIFYING_WEEKS * 7; // 84 days

/** Maximum break duration (in weeks) before clock resets for general gaps */
const MAX_CONTINUING_BREAK_WEEKS = 6;
const MAX_CONTINUING_BREAK_DAYS = MAX_CONTINUING_BREAK_WEEKS * 7;

/** Maximum sickness break before it becomes a reset (28 weeks per AWR) */
const MAX_SICKNESS_PAUSE_WEEKS = 28;

/** Maximum maternity break pause (26 weeks per AWR) */
const MAX_MATERNITY_PAUSE_WEEKS = 26;

// =============================================================================
// Helpers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Determine the clock effect for a break based on AWR rules.
 */
function determineClockEffect(
  reason: string,
  breakStartDate: string,
  breakEndDate: string | null
): "continues" | "pauses" | "resets" {
  // If no end date, we cannot determine duration yet; default to "pauses"
  // (most cautious interpretation -- clock stops until break ends)
  if (!breakEndDate) {
    if (reason === "annual_leave" || reason === "shutdown") return "continues";
    if (
      reason === "sickness" ||
      reason === "jury_service" ||
      reason === "maternity" ||
      reason === "strike_lockout"
    ) {
      return "pauses";
    }
    // end_of_assignment / other with no end date -- cannot know duration yet
    return "pauses";
  }

  const start = parseDate(breakStartDate);
  const end = parseDate(breakEndDate);
  const breakDays = daysBetween(start, end);

  switch (reason) {
    case "annual_leave":
      return "continues";

    case "shutdown":
      // Shutdown up to 6 weeks: clock continues; beyond: resets
      return breakDays <= MAX_CONTINUING_BREAK_DAYS ? "continues" : "resets";

    case "sickness":
      // Sickness up to 28 weeks: clock pauses; beyond: resets
      return breakDays <= MAX_SICKNESS_PAUSE_WEEKS * 7 ? "pauses" : "resets";

    case "maternity":
      // Maternity up to 26 weeks: clock pauses; beyond: resets
      return breakDays <= MAX_MATERNITY_PAUSE_WEEKS * 7 ? "pauses" : "resets";

    case "jury_service":
    case "strike_lockout":
      return "pauses";

    case "end_of_assignment":
    case "other":
    default:
      // Gap <= 6 weeks: clock continues; gap > 6 weeks: clock resets
      return breakDays <= MAX_CONTINUING_BREAK_DAYS ? "continues" : "resets";
  }
}

/**
 * Recalculate qualifying_date based on start_date and all breaks.
 *
 * Algorithm:
 * 1. Start with qualifying_date = start_date + 84 days
 * 2. For each break (sorted by start_date):
 *    - "continues": no change
 *    - "pauses": add break duration to qualifying_date
 *    - "resets": recalculate qualifying_date = break_end_date + 84 days
 *
 * Returns { qualifyingDate, qualified } based on current date.
 */
function recalculateQualifying(
  startDate: Date,
  breaks: BreakRecord[]
): { qualifyingDate: Date; qualified: boolean } {
  // Sort breaks by start_date
  const sortedBreaks = [...breaks].sort(
    (a, b) => parseDate(a.start_date).getTime() - parseDate(b.start_date).getTime()
  );

  let qualifyingDate = addDays(startDate, QUALIFYING_DAYS);

  for (const brk of sortedBreaks) {
    if (!brk.end_date) {
      // Open-ended break: if it pauses, we cannot determine final date
      // but we shift qualifying_date to the future as a safety measure
      if (brk.clock_effect === "pauses") {
        // Shift by days elapsed so far (from break start to now)
        const breakStart = parseDate(brk.start_date);
        const now = new Date();
        const pauseDays = Math.max(0, daysBetween(breakStart, now));
        qualifyingDate = addDays(qualifyingDate, pauseDays);
      } else if (brk.clock_effect === "resets") {
        // Reset: qualifying date is unknown until break ends
        // Set far in future
        qualifyingDate = addDays(new Date(), QUALIFYING_DAYS);
      }
      // "continues": no change
      continue;
    }

    const breakStart = parseDate(brk.start_date);
    const breakEnd = parseDate(brk.end_date);
    const breakDays = Math.max(0, daysBetween(breakStart, breakEnd));

    switch (brk.clock_effect) {
      case "continues":
        // No adjustment needed
        break;
      case "pauses":
        // Shift qualifying_date forward by the break duration
        qualifyingDate = addDays(qualifyingDate, breakDays);
        break;
      case "resets":
        // Clock resets: qualifying_date starts fresh from break end
        qualifyingDate = addDays(breakEnd, QUALIFYING_DAYS);
        break;
    }
  }

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const qualified = now >= qualifyingDate;

  return { qualifyingDate, qualified };
}

// =============================================================================
// Response Mapper
// =============================================================================

function mapAssignmentToResponse(row: AssignmentRow): AssignmentResponse {
  const startDate = row.startDate instanceof Date ? row.startDate : new Date(String(row.startDate));
  const qualifyingDate = row.qualifyingDate instanceof Date ? row.qualifyingDate : new Date(String(row.qualifyingDate));

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const daysUntilQualifying = row.qualified ? 0 : Math.max(0, daysBetween(now, qualifyingDate));
  const weeksCompleted = Math.min(
    QUALIFYING_WEEKS,
    Math.floor(daysBetween(startDate, row.qualified ? qualifyingDate : now) / 7)
  );

  const breaks = (Array.isArray(row.breaks) ? row.breaks : []) as BreakRecord[];

  return {
    id: row.id,
    tenant_id: row.tenantId,
    worker_id: row.workerId,
    agency_id: row.agencyId,
    status: row.status as AssignmentResponse["status"],
    role: row.role,
    department: row.department,
    start_date: formatDate(row.startDate)!,
    end_date: formatDate(row.endDate),
    qualifying_date: formatDate(row.qualifyingDate)!,
    qualified: row.qualified,
    hourly_rate: Number(row.hourlyRate),
    comparable_rate: row.comparableRate ? Number(row.comparableRate) : null,
    breaks,
    notes: row.notes,
    days_until_qualifying: daysUntilQualifying,
    weeks_completed: weeksCompleted,
    worker_name: row.workerName,
    agency_name: row.agencyName,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class AgencyWorkerService {
  constructor(
    private repository: AgencyWorkerRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Assignment CRUD
  // ===========================================================================

  async listAssignments(
    ctx: TenantContext,
    filters: AssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentResponse>> {
    const result = await this.repository.listAssignments(ctx, filters, pagination);
    return {
      items: result.items.map(mapAssignmentToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getAssignment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<AssignmentResponse>> {
    const row = await this.repository.getAssignmentById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Agency worker assignment not found", details: { id } },
      };
    }
    return { success: true, data: mapAssignmentToResponse(row) };
  }

  async createAssignment(
    ctx: TenantContext,
    data: CreateAssignment
  ): Promise<ServiceResult<AssignmentResponse>> {
    // Calculate initial qualifying_date = start_date + 12 weeks
    const startDate = parseDate(data.start_date);
    const qualifyingDate = addDays(startDate, QUALIFYING_DAYS);
    const qualifyingDateStr = formatDate(qualifyingDate)!;

    return await this.db.withTransaction(ctx, async (tx) => {
      const assignment = await this.repository.createAssignment(
        ctx,
        { ...data, qualifying_date: qualifyingDateStr },
        tx
      );

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "agency_worker_assignment",
        aggregateId: assignment.id,
        eventType: "awr.assignment.created",
        payload: {
          assignment: mapAssignmentToResponse(assignment),
          qualifyingDate: qualifyingDateStr,
        },
        userId: ctx.userId,
      });

      return { success: true, data: mapAssignmentToResponse(assignment) };
    });
  }

  async updateAssignment(
    ctx: TenantContext,
    id: string,
    data: UpdateAssignment
  ): Promise<ServiceResult<AssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Agency worker assignment not found", details: { id } },
        };
      }

      // Prevent reverting qualified status
      if (existing.qualified && data.status && data.status !== "qualified" && data.status !== "ended") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Cannot change status of a qualified assignment except to 'ended'",
            details: { current: existing.status, requested: data.status },
          },
        };
      }

      const updated = await this.repository.updateAssignment(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update assignment" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "agency_worker_assignment",
        aggregateId: id,
        eventType: "awr.assignment.updated",
        payload: { assignment: mapAssignmentToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapAssignmentToResponse(updated) };
    });
  }

  async deleteAssignment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Agency worker assignment not found", details: { id } },
        };
      }

      const deleted = await this.repository.deleteAssignment(id, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "agency_worker_assignment",
        aggregateId: id,
        eventType: "awr.assignment.deleted",
        payload: { assignmentId: id },
        userId: ctx.userId,
      });

      return { success: true as const, data: { deleted } };
    });
  }

  // ===========================================================================
  // Break Management
  // ===========================================================================

  async addBreak(
    ctx: TenantContext,
    assignmentId: string,
    data: AddBreak
  ): Promise<ServiceResult<AssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(assignmentId, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Agency worker assignment not found", details: { id: assignmentId } },
        };
      }

      if (existing.status === "ended") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Cannot add a break to an ended assignment",
          },
        };
      }

      // Determine clock effect based on AWR rules
      const clockEffect = determineClockEffect(data.reason, data.start_date, data.end_date ?? null);

      const newBreak: BreakRecord = {
        reason: data.reason,
        start_date: data.start_date,
        end_date: data.end_date ?? null,
        clock_effect: clockEffect,
      };

      const currentBreaks = (Array.isArray(existing.breaks) ? existing.breaks : []) as BreakRecord[];
      const updatedBreaks = [...currentBreaks, newBreak];

      // Recalculate qualifying date with the new break
      const startDate = existing.startDate instanceof Date
        ? existing.startDate
        : new Date(String(existing.startDate));
      const { qualifyingDate, qualified } = recalculateQualifying(startDate, updatedBreaks);
      const qualifyingDateStr = formatDate(qualifyingDate)!;

      // If qualified, update status to 'qualified'
      const newStatus = qualified ? "qualified" : (data.end_date ? "active" : "on_break");

      const updated = await this.repository.updateBreaksAndQualifying(
        assignmentId,
        updatedBreaks,
        qualifyingDateStr,
        qualified,
        newStatus,
        tx
      );

      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update assignment" },
        };
      }

      const eventType = qualified
        ? "awr.assignment.qualified"
        : clockEffect === "resets"
          ? "awr.qualifying_clock.reset"
          : "awr.break.added";

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "agency_worker_assignment",
        aggregateId: assignmentId,
        eventType,
        payload: {
          assignment: mapAssignmentToResponse(updated),
          break: newBreak,
          clockEffect,
          qualifyingDate: qualifyingDateStr,
          qualified,
        },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapAssignmentToResponse(updated) };
    });
  }

  // ===========================================================================
  // Qualifying Soon
  // ===========================================================================

  async listQualifyingSoon(
    ctx: TenantContext,
    days: number,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentResponse>> {
    const result = await this.repository.listQualifyingSoon(ctx, days, pagination);
    return {
      items: result.items.map(mapAssignmentToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }
}

// Export for scheduler usage
export { recalculateQualifying, determineClockEffect, QUALIFYING_DAYS };
