/**
 * Time & Attendance Repository
 *
 * Data access layer for time tracking operations.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface TimeEventRow {
  id: string;
  tenantId: string;
  employeeId: string;
  eventType: string;
  eventTime: Date;
  deviceId: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  orgUnitId: string | null;
  isTemplate: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShiftRow {
  id: string;
  tenantId: string;
  scheduleId: string;
  employeeId: string;
  shiftDate: Date;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  actualStartTime: string | null;
  actualEndTime: string | null;
  status: string;
  positionId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimesheetRow {
  id: string;
  tenantId: string;
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  totalRegularHours: number;
  totalOvertimeHours: number;
  submittedAt: Date | null;
  approvedAt: Date | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimesheetLineRow {
  id: string;
  timesheetId: string;
  date: Date;
  regularHours: number;
  overtimeHours: number;
  breakMinutes: number;
  projectId: string | null;
  taskCode: string | null;
  notes: string | null;
}

export interface SwapRequestRow {
  id: string;
  tenantId: string;
  sourceShiftId: string;
  requestingEmployeeId: string;
  targetEmployeeId: string;
  targetShiftId: string | null;
  status: string;
  reason: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository Class
// =============================================================================

export class TimeRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Time Events
  // ===========================================================================

  async createTimeEvent(
    ctx: TenantContext,
    data: {
      employeeId: string;
      eventType: string;
      eventTime: Date;
      deviceId?: string;
      latitude?: number;
      longitude?: number;
      notes?: string;
    }
  ): Promise<TimeEventRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<TimeEventRow[]>`
        INSERT INTO app.time_events (
          id, tenant_id, employee_id, event_type, event_time,
          device_id, latitude, longitude, notes
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.eventType}, ${data.eventTime},
          ${data.deviceId || null}::uuid, ${data.latitude || null}, ${data.longitude || null},
          ${data.notes || null}
        )
        RETURNING *
      `;

      // Write to outbox
      await this.writeOutbox(tx, ctx.tenantId, "time_event", id, "time.event.recorded", {
        eventId: id,
        employeeId: data.employeeId,
        eventType: data.eventType,
        eventTime: data.eventTime,
      });

      return row as TimeEventRow;
    });
  }

  async getTimeEvents(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      eventType?: string;
      from?: Date;
      to?: Date;
      deviceId?: string;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<TimeEventRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<TimeEventRow[]>`
        SELECT * FROM app.time_events
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.eventType ? tx`AND event_type = ${filters.eventType}` : tx``}
        ${filters.from ? tx`AND event_time >= ${filters.from}` : tx``}
        ${filters.to ? tx`AND event_time <= ${filters.to}` : tx``}
        ${filters.deviceId ? tx`AND device_id = ${filters.deviceId}::uuid` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY event_time DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as TimeEventRow[], cursor, hasMore };
  }

  async getTimeEventById(ctx: TenantContext, id: string): Promise<TimeEventRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<TimeEventRow[]>`
        SELECT * FROM app.time_events
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as TimeEventRow) : null;
  }

  // ===========================================================================
  // Schedules
  // ===========================================================================

  async createSchedule(
    ctx: TenantContext,
    data: {
      name: string;
      description?: string;
      startDate: Date;
      endDate: Date;
      orgUnitId?: string;
      isTemplate?: boolean;
    }
  ): Promise<ScheduleRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<ScheduleRow[]>`
        INSERT INTO app.schedules (
          id, tenant_id, name, description, start_date, end_date,
          org_unit_id, is_template, status
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.name}, ${data.description || null},
          ${data.startDate}, ${data.endDate}, ${data.orgUnitId || null}::uuid,
          ${data.isTemplate || false}, 'draft'
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "schedule", id, "time.schedule.created", {
        scheduleId: id,
        name: data.name,
      });

      return row as ScheduleRow;
    });
  }

  async getSchedules(
    ctx: TenantContext,
    filters: { orgUnitId?: string; isTemplate?: boolean; cursor?: string; limit?: number }
  ): Promise<PaginatedResult<ScheduleRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ScheduleRow[]>`
        SELECT * FROM app.schedules
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.orgUnitId ? tx`AND org_unit_id = ${filters.orgUnitId}::uuid` : tx``}
        ${filters.isTemplate !== undefined ? tx`AND is_template = ${filters.isTemplate}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY start_date DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as ScheduleRow[], cursor, hasMore };
  }

  async getScheduleById(ctx: TenantContext, id: string): Promise<ScheduleRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ScheduleRow[]>`
        SELECT * FROM app.schedules
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ScheduleRow) : null;
  }

  async updateSchedule(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      startDate: Date;
      endDate: Date;
      orgUnitId: string;
      isTemplate: boolean;
    }>
  ): Promise<ScheduleRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ScheduleRow[]>`
        UPDATE app.schedules SET
          name = COALESCE(${data.name || null}, name),
          description = COALESCE(${data.description || null}, description),
          start_date = COALESCE(${data.startDate || null}, start_date),
          end_date = COALESCE(${data.endDate || null}, end_date),
          org_unit_id = COALESCE(${data.orgUnitId || null}::uuid, org_unit_id),
          is_template = COALESCE(${data.isTemplate ?? null}, is_template),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "schedule", id, "time.schedule.updated", {
          scheduleId: id,
          changes: data,
        });
      }

      return row as ScheduleRow | null;
    });
  }

  // ===========================================================================
  // Shifts
  // ===========================================================================

  async createShift(
    ctx: TenantContext,
    data: {
      scheduleId: string;
      employeeId: string;
      shiftDate: Date;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      positionId?: string;
      notes?: string;
    }
  ): Promise<ShiftRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<ShiftRow[]>`
        INSERT INTO app.shifts (
          id, tenant_id, schedule_id, employee_id, shift_date,
          start_time, end_time, break_minutes, position_id, notes, status
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.scheduleId}::uuid,
          ${data.employeeId}::uuid, ${data.shiftDate}, ${data.startTime}, ${data.endTime},
          ${data.breakMinutes || 0}, ${data.positionId || null}::uuid, ${data.notes || null},
          'scheduled'
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "shift", id, "time.shift.created", {
        shiftId: id,
        employeeId: data.employeeId,
        shiftDate: data.shiftDate,
      });

      return row as ShiftRow;
    });
  }

  async getShiftById(ctx: TenantContext, id: string): Promise<ShiftRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ShiftRow[]>`
        SELECT * FROM app.shifts
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ShiftRow) : null;
  }

  async getShiftsBySchedule(
    ctx: TenantContext,
    scheduleId: string,
    filters: { employeeId?: string; from?: Date; to?: Date }
  ): Promise<ShiftRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ShiftRow[]>`
        SELECT * FROM app.shifts
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND schedule_id = ${scheduleId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.from ? tx`AND shift_date >= ${filters.from}` : tx``}
        ${filters.to ? tx`AND shift_date <= ${filters.to}` : tx``}
        ORDER BY shift_date, start_time
      `;
      return rows as ShiftRow[];
    });
  }

  async updateShift(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      shiftDate: Date;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      status: string;
      actualStartTime: string;
      actualEndTime: string;
      positionId: string;
      notes: string;
    }>
  ): Promise<ShiftRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftRow[]>`
        UPDATE app.shifts SET
          shift_date = COALESCE(${data.shiftDate || null}, shift_date),
          start_time = COALESCE(${data.startTime || null}, start_time),
          end_time = COALESCE(${data.endTime || null}, end_time),
          break_minutes = COALESCE(${data.breakMinutes ?? null}, break_minutes),
          status = COALESCE(${data.status || null}, status),
          actual_start_time = COALESCE(${data.actualStartTime || null}, actual_start_time),
          actual_end_time = COALESCE(${data.actualEndTime || null}, actual_end_time),
          position_id = COALESCE(${data.positionId || null}::uuid, position_id),
          notes = COALESCE(${data.notes || null}, notes),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "shift", id, "time.shift.updated", {
          shiftId: id,
          changes: data,
        });
      }

      return row as ShiftRow | null;
    });
  }

  // ===========================================================================
  // Timesheets
  // ===========================================================================

  async createTimesheet(
    ctx: TenantContext,
    data: { employeeId: string; periodStart: Date; periodEnd: Date }
  ): Promise<TimesheetRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<TimesheetRow[]>`
        INSERT INTO app.timesheets (
          id, tenant_id, employee_id, period_start, period_end, status
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.periodStart}, ${data.periodEnd}, 'draft'
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "timesheet", id, "time.timesheet.created", {
        timesheetId: id,
        employeeId: data.employeeId,
      });

      return row as TimesheetRow;
    });
  }

  async getTimesheets(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      status?: string;
      periodStart?: Date;
      periodEnd?: Date;
      cursor?: string;
      limit?: number;
    }
  ): Promise<PaginatedResult<TimesheetRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<TimesheetRow[]>`
        SELECT * FROM app.timesheets
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.status ? tx`AND status = ${filters.status}` : tx``}
        ${filters.periodStart ? tx`AND period_start >= ${filters.periodStart}` : tx``}
        ${filters.periodEnd ? tx`AND period_end <= ${filters.periodEnd}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY period_start DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as TimesheetRow[], cursor, hasMore };
  }

  async getTimesheetById(ctx: TenantContext, id: string): Promise<TimesheetRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<TimesheetRow[]>`
        SELECT * FROM app.timesheets
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as TimesheetRow) : null;
  }

  async getTimesheetLines(ctx: TenantContext, timesheetId: string): Promise<TimesheetLineRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<TimesheetLineRow[]>`
        SELECT * FROM app.timesheet_lines
        WHERE timesheet_id = ${timesheetId}::uuid
        ORDER BY date
      `;
      return rows as TimesheetLineRow[];
    });
  }

  async updateTimesheetLines(
    ctx: TenantContext,
    timesheetId: string,
    lines: Array<{
      date: Date;
      regularHours: number;
      overtimeHours?: number;
      breakMinutes?: number;
      projectId?: string;
      taskCode?: string;
      notes?: string;
    }>
  ): Promise<void> {
    await this.db.withTransaction(ctx, async (tx) => {
      // Delete existing lines
      await tx`DELETE FROM app.timesheet_lines WHERE timesheet_id = ${timesheetId}::uuid`;

      // Insert new lines
      for (const line of lines) {
        const lineId = crypto.randomUUID();
        await tx`
          INSERT INTO app.timesheet_lines (
            id, timesheet_id, date, regular_hours, overtime_hours,
            break_minutes, project_id, task_code, notes
          ) VALUES (
            ${lineId}::uuid, ${timesheetId}::uuid, ${line.date},
            ${line.regularHours}, ${line.overtimeHours || 0},
            ${line.breakMinutes || 0}, ${line.projectId || null}::uuid,
            ${line.taskCode || null}, ${line.notes || null}
          )
        `;
      }

      // Update totals
      const totals = lines.reduce(
        (acc, line) => ({
          regular: acc.regular + line.regularHours,
          overtime: acc.overtime + (line.overtimeHours || 0),
        }),
        { regular: 0, overtime: 0 }
      );

      await tx`
        UPDATE app.timesheets SET
          total_regular_hours = ${totals.regular},
          total_overtime_hours = ${totals.overtime},
          updated_at = now()
        WHERE id = ${timesheetId}::uuid
      `;

      await this.writeOutbox(tx, ctx.tenantId, "timesheet", timesheetId, "time.timesheet.updated", {
        timesheetId,
        totalRegularHours: totals.regular,
        totalOvertimeHours: totals.overtime,
      });
    });
  }

  async submitTimesheet(ctx: TenantContext, id: string): Promise<TimesheetRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<TimesheetRow[]>`
        UPDATE app.timesheets SET
          status = 'submitted',
          submitted_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'draft'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "timesheet", id, "time.timesheet.submitted", {
          timesheetId: id,
          employeeId: row.employeeId,
        });
      }

      return row as TimesheetRow | null;
    });
  }

  async approveTimesheet(
    ctx: TenantContext,
    id: string,
    approverId: string,
    comments?: string
  ): Promise<TimesheetRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<TimesheetRow[]>`
        UPDATE app.timesheets SET
          status = 'approved',
          approved_at = now(),
          approved_by_id = ${approverId}::uuid,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'submitted'
        RETURNING *
      `;

      if (row) {
        // Write approval record
        await tx`
          INSERT INTO app.timesheet_approvals (id, timesheet_id, approver_id, action, comments)
          VALUES (${crypto.randomUUID()}::uuid, ${id}::uuid, ${approverId}::uuid, 'approved', ${comments || null})
        `;

        await this.writeOutbox(tx, ctx.tenantId, "timesheet", id, "time.timesheet.approved", {
          timesheetId: id,
          employeeId: row.employeeId,
          approverId,
        });
      }

      return row as TimesheetRow | null;
    });
  }

  async rejectTimesheet(
    ctx: TenantContext,
    id: string,
    approverId: string,
    comments?: string
  ): Promise<TimesheetRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<TimesheetRow[]>`
        UPDATE app.timesheets SET
          status = 'rejected',
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'submitted'
        RETURNING *
      `;

      if (row) {
        await tx`
          INSERT INTO app.timesheet_approvals (id, timesheet_id, approver_id, action, comments)
          VALUES (${crypto.randomUUID()}::uuid, ${id}::uuid, ${approverId}::uuid, 'rejected', ${comments || null})
        `;

        await this.writeOutbox(tx, ctx.tenantId, "timesheet", id, "time.timesheet.rejected", {
          timesheetId: id,
          employeeId: row.employeeId,
          approverId,
          comments,
        });
      }

      return row as TimesheetRow | null;
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  async getScheduleAssignments(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(ctx, async (tx: any) => {
      return tx`
        SELECT
          sa.id,
          sa.employee_id,
          ep.first_name || ' ' || ep.last_name as employee_name,
          s.schedule_id,
          sc.name as schedule_name,
          sa.assignment_date as effective_from,
          NULL as effective_to
        FROM app.shift_assignments sa
        JOIN app.shifts s ON s.id = sa.shift_id
        JOIN app.schedules sc ON sc.id = s.schedule_id
        JOIN app.employees e ON e.id = sa.employee_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
        WHERE sa.tenant_id = ${ctx.tenantId}::uuid
          AND sa.is_published = true
        ORDER BY sa.assignment_date DESC
        LIMIT 100
      `;
    });
  }

  async getStats(ctx: TenantContext): Promise<{
    pendingApprovals: number;
    totalHoursThisWeek: number;
    overtimeHoursThisWeek: number;
    activeEmployees: number;
  }> {
    return this.db.withTransaction(ctx, async (tx: any) => {
      const [pending] = await tx`
        SELECT COUNT(*)::int as count
        FROM app.timesheets
        WHERE status = 'submitted'
          AND tenant_id = ${ctx.tenantId}::uuid
      `;

      const [hours] = await tx`
        SELECT
          COALESCE(SUM(total_regular_hours), 0)::numeric as regular,
          COALESCE(SUM(total_overtime_hours), 0)::numeric as overtime
        FROM app.timesheets
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND period_start >= date_trunc('week', CURRENT_DATE)
          AND period_start < date_trunc('week', CURRENT_DATE) + interval '7 days'
      `;

      const [active] = await tx`
        SELECT COUNT(*)::int as count
        FROM app.employees
        WHERE status = 'active'
          AND tenant_id = ${ctx.tenantId}::uuid
      `;

      return {
        pendingApprovals: pending?.count ?? 0,
        totalHoursThisWeek: Number(hours?.regular ?? 0),
        overtimeHoursThisWeek: Number(hours?.overtime ?? 0),
        activeEmployees: active?.count ?? 0,
      };
    });
  }

  private async writeOutbox(
    tx: TransactionSql,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${tenantId}::uuid,
        ${aggregateType}, ${aggregateId}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb
      )
    `;
  }
}
