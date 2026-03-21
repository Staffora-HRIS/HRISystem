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
  recordedTime: Date;
  deviceId: string | null;
  latitude: number | null;
  longitude: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  isManual: boolean;
  manualReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  sessionId: string | null;
  createdAt: Date;
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
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isOvernight: boolean;
  color: string | null;
  minStaff: number | null;
  maxStaff: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShiftAssignmentRow {
  id: string;
  tenantId: string;
  shiftId: string;
  employeeId: string;
  assignmentDate: Date;
  actualStartTime: Date | null;
  actualEndTime: Date | null;
  isPublished: boolean;
  attendanceStatus: string | null;
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

export interface ApprovalChainRow {
  id: string;
  tenantId: string;
  timesheetId: string;
  level: number;
  approverId: string;
  approverName?: string;
  status: string;
  decidedAt: Date | null;
  comments: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingApprovalRow {
  chainId: string;
  timesheetId: string;
  employeeId: string;
  employeeNumber: string;
  periodStart: Date;
  periodEnd: Date;
  totalRegularHours: number;
  totalOvertimeHours: number;
  level: number;
  submittedAt: Date;
}

// =============================================================================
// Repository Class
// =============================================================================

export class TimeRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Time Policies
  // ===========================================================================

  async createTimePolicy(
    ctx: TenantContext,
    data: {
      name: string;
      description?: string | null;
      policyType?: string;
      workingHoursPerDay?: number;
      workingDaysPerWeek?: number;
      breakDurationMinutes?: number;
      overtimeEnabled?: boolean;
      overtimeThresholdDaily?: number | null;
      overtimeThresholdWeekly?: number | null;
      overtimeRateMultiplier?: number;
      defaultStartTime?: string | null;
      defaultEndTime?: string | null;
      isDefault?: boolean;
      createdBy?: string;
    }
  ): Promise<any> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();

      // If setting as default, unset any existing default first
      if (data.isDefault) {
        await tx`
          UPDATE app.time_policies
          SET is_default = false, updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND is_default = true
            AND status = 'active'
        `;
      }

      const [row] = await tx`
        INSERT INTO app.time_policies (
          id, tenant_id, name, description, policy_type,
          working_hours_per_day, working_days_per_week,
          break_duration_minutes,
          overtime_enabled, overtime_threshold_daily, overtime_threshold_weekly,
          overtime_rate_multiplier,
          default_start_time, default_end_time,
          is_default, status, created_by
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid,
          ${data.name}, ${data.description ?? null},
          ${data.policyType ?? "standard"}::app.time_policy_type,
          ${data.workingHoursPerDay ?? 8}, ${data.workingDaysPerWeek ?? 5},
          ${data.breakDurationMinutes ?? 60},
          ${data.overtimeEnabled ?? true},
          ${data.overtimeThresholdDaily ?? null},
          ${data.overtimeThresholdWeekly ?? null},
          ${data.overtimeRateMultiplier ?? 1.5},
          ${data.defaultStartTime ?? null}::time,
          ${data.defaultEndTime ?? null}::time,
          ${data.isDefault ?? false},
          'active',
          ${data.createdBy ?? null}::uuid
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "time_policy", id, "time.policy.created", {
        policyId: id,
        name: data.name,
        policyType: data.policyType ?? "standard",
      });

      return row;
    });
  }

  async getTimePolicies(
    ctx: TenantContext,
    filters: { status?: string; cursor?: string; limit?: number }
  ): Promise<PaginatedResult<any>> {
    const limit = filters.limit || 50;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx`
        SELECT
          id, tenant_id, name, description, policy_type,
          working_hours_per_day, working_days_per_week,
          break_duration_minutes,
          overtime_enabled, overtime_threshold_daily, overtime_threshold_weekly,
          overtime_rate_multiplier,
          default_start_time, default_end_time,
          is_default, status,
          created_at, updated_at
        FROM app.time_policies
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.status ? tx`AND status = ${filters.status}::app.time_policy_status` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY is_default DESC, name ASC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data, cursor, hasMore };
  }

  async getTimePolicyById(ctx: TenantContext, id: string): Promise<any | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx`
        SELECT
          id, tenant_id, name, description, policy_type,
          working_hours_per_day, working_days_per_week,
          break_duration_minutes,
          overtime_enabled, overtime_threshold_daily, overtime_threshold_weekly,
          overtime_rate_multiplier,
          default_start_time, default_end_time,
          is_default, status,
          created_at, updated_at
        FROM app.time_policies
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? rows[0] : null;
  }

  async updateTimePolicy(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      policyType: string;
      workingHoursPerDay: number;
      workingDaysPerWeek: number;
      breakDurationMinutes: number;
      overtimeEnabled: boolean;
      overtimeThresholdDaily: number | null;
      overtimeThresholdWeekly: number | null;
      overtimeRateMultiplier: number;
      defaultStartTime: string | null;
      defaultEndTime: string | null;
      isDefault: boolean;
      updatedBy: string;
    }>
  ): Promise<any | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      // If setting as default, unset any existing default first
      if (data.isDefault) {
        await tx`
          UPDATE app.time_policies
          SET is_default = false, updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND is_default = true
            AND status = 'active'
            AND id != ${id}::uuid
        `;
      }

      const [row] = await tx`
        UPDATE app.time_policies SET
          name = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          policy_type = COALESCE(${data.policyType ?? null}::app.time_policy_type, policy_type),
          working_hours_per_day = COALESCE(${data.workingHoursPerDay ?? null}, working_hours_per_day),
          working_days_per_week = COALESCE(${data.workingDaysPerWeek ?? null}, working_days_per_week),
          break_duration_minutes = COALESCE(${data.breakDurationMinutes ?? null}, break_duration_minutes),
          overtime_enabled = COALESCE(${data.overtimeEnabled ?? null}, overtime_enabled),
          overtime_threshold_daily = COALESCE(${data.overtimeThresholdDaily ?? null}, overtime_threshold_daily),
          overtime_threshold_weekly = COALESCE(${data.overtimeThresholdWeekly ?? null}, overtime_threshold_weekly),
          overtime_rate_multiplier = COALESCE(${data.overtimeRateMultiplier ?? null}, overtime_rate_multiplier),
          default_start_time = COALESCE(${data.defaultStartTime ?? null}::time, default_start_time),
          default_end_time = COALESCE(${data.defaultEndTime ?? null}::time, default_end_time),
          is_default = COALESCE(${data.isDefault ?? null}, is_default),
          updated_by = COALESCE(${data.updatedBy ?? null}::uuid, updated_by),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "time_policy", id, "time.policy.updated", {
          policyId: id,
          changes: data,
        });
      }

      return row ?? null;
    });
  }

  async deleteTimePolicy(ctx: TenantContext, id: string): Promise<any | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Soft-delete by setting status to inactive
      const [row] = await tx`
        UPDATE app.time_policies SET
          status = 'inactive',
          is_default = false,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'active'
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "time_policy", id, "time.policy.deleted", {
          policyId: id,
        });
      }

      return row ?? null;
    });
  }

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
      isManual?: boolean;
      manualReason?: string;
      sessionId?: string;
    }
  ): Promise<TimeEventRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<TimeEventRow[]>`
        INSERT INTO app.time_events (
          id, tenant_id, employee_id, event_type, event_time,
          device_id, latitude, longitude, is_manual, manual_reason, session_id
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.eventType}, ${data.eventTime},
          ${data.deviceId || null}::uuid, ${data.latitude || null}, ${data.longitude || null},
          ${data.isManual || false}, ${data.manualReason || null}, ${data.sessionId || null}::uuid
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
        SELECT
          id, tenant_id, employee_id, event_type, event_time, recorded_time,
          device_id, latitude, longitude, ip_address, user_agent,
          is_manual, manual_reason, approved_by, approved_at, session_id, created_at
        FROM app.time_events
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
        SELECT
          id, tenant_id, employee_id, event_type, event_time, recorded_time,
          device_id, latitude, longitude, ip_address, user_agent,
          is_manual, manual_reason, approved_by, approved_at, session_id, created_at
        FROM app.time_events
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
          ${data.isTemplate ?? false}, 'draft'
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
        SELECT
          id, tenant_id, name, description, start_date, end_date,
          org_unit_id, is_template, status, created_at, updated_at
        FROM app.schedules
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.orgUnitId ? tx`AND org_unit_id = ${filters.orgUnitId}::uuid` : tx``}
        ${(filters as any).isTemplate !== undefined ? tx`AND is_template = ${(filters as any).isTemplate}` : tx``}
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
        SELECT
          id, tenant_id, name, description, start_date, end_date,
          org_unit_id, is_template, status, created_at, updated_at
        FROM app.schedules
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
      name: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      isOvernight?: boolean;
      color?: string;
    }
  ): Promise<ShiftRow> {
    return this.db.withTransaction(ctx, async (tx) => {
      const id = crypto.randomUUID();
      const [row] = await tx<ShiftRow[]>`
        INSERT INTO app.shifts (
          id, tenant_id, schedule_id, name,
          start_time, end_time, break_minutes, is_overnight, color
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.scheduleId}::uuid,
          ${data.name}, ${data.startTime}, ${data.endTime},
          ${data.breakMinutes || 0}, ${data.isOvernight || false}, ${data.color || null}
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "shift", id, "time.shift.created", {
        shiftId: id,
        name: data.name,
      });

      return row as ShiftRow;
    });
  }

  async getShiftById(ctx: TenantContext, id: string): Promise<ShiftRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ShiftRow[]>`
        SELECT
          id, tenant_id, schedule_id, name, start_time, end_time,
          break_minutes, is_overnight, color, min_staff, max_staff, metadata, created_at, updated_at
        FROM app.shifts
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as ShiftRow) : null;
  }

  async getShiftsBySchedule(
    ctx: TenantContext,
    scheduleId: string
  ): Promise<ShiftRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ShiftRow[]>`
        SELECT
          id, tenant_id, schedule_id, name, start_time, end_time,
          break_minutes, is_overnight, color, min_staff, max_staff, metadata, created_at, updated_at
        FROM app.shifts
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND schedule_id = ${scheduleId}::uuid
        ORDER BY start_time
      `;
      return rows as ShiftRow[];
    });
  }

  async updateShift(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      name: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      isOvernight: boolean;
      color: string;
    }>
  ): Promise<ShiftRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [row] = await tx<ShiftRow[]>`
        UPDATE app.shifts SET
          name = COALESCE(${data.name || null}, name),
          start_time = COALESCE(${data.startTime || null}, start_time),
          end_time = COALESCE(${data.endTime || null}, end_time),
          break_minutes = COALESCE(${data.breakMinutes ?? null}, break_minutes),
          is_overnight = COALESCE(${data.isOvernight ?? null}, is_overnight),
          color = COALESCE(${data.color || null}, color),
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
        SELECT
          id, tenant_id, employee_id, period_start, period_end, status,
          total_regular_hours, total_overtime_hours, submitted_at, approved_at, approved_by, created_at, updated_at
        FROM app.timesheets
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
        SELECT
          id, tenant_id, employee_id, period_start, period_end, status,
          total_regular_hours, total_overtime_hours, submitted_at, approved_at, approved_by, created_at, updated_at
        FROM app.timesheets
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as TimesheetRow) : null;
  }

  async getTimesheetLines(ctx: TenantContext, timesheetId: string): Promise<TimesheetLineRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<TimesheetLineRow[]>`
        SELECT
          id, timesheet_id, work_date as date, regular_hours, overtime_hours,
          break_minutes, notes
        FROM app.timesheet_lines
        WHERE timesheet_id = ${timesheetId}::uuid
        ORDER BY work_date
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

      // Insert new lines (batch insert)
      if (lines.length > 0) {
        await tx`
          INSERT INTO app.timesheet_lines ${(tx as any)(
            lines.map(line => ({
              id: crypto.randomUUID(),
              tenant_id: ctx.tenantId,
              timesheet_id: timesheetId,
              work_date: line.date,
              regular_hours: line.regularHours,
              overtime_hours: line.overtimeHours || 0,
              break_minutes: line.breakMinutes || 0,
              notes: line.notes || null,
            }))
          )}
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
          submitted_by = ${ctx.userId || null}::uuid,
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
          approved_by = ${approverId}::uuid,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'submitted'
        RETURNING *
      `;

      if (row) {
        // Use the security definer function to bypass RLS insert policy
        await tx`
          SELECT app.record_timesheet_approval(
            ${id}::uuid, 'approve', ${approverId}::uuid, ${comments || null}
          )
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
          rejected_at = now(),
          rejected_by = ${approverId}::uuid,
          rejection_reason = ${comments || "Rejected"},
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'submitted'
        RETURNING *
      `;

      if (row) {
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

  // ===========================================================================
  // Approval Chains
  // ===========================================================================

  async createApprovalChain(
    ctx: TenantContext,
    timesheetId: string,
    approverIds: string[]
  ): Promise<ApprovalChainRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Delete any existing chain entries for this timesheet (resubmission case)
      await tx`
        DELETE FROM app.timesheet_approval_chains
        WHERE timesheet_id = ${timesheetId}::uuid
      `;

      const entries: ApprovalChainRow[] = [];

      for (let i = 0; i < approverIds.length; i++) {
        const level = i + 1;
        const status = level === 1 ? "active" : "pending";
        const id = crypto.randomUUID();

        const [row] = await tx<ApprovalChainRow[]>`
          INSERT INTO app.timesheet_approval_chains (
            id, tenant_id, timesheet_id, level, approver_id, status
          ) VALUES (
            ${id}::uuid, ${ctx.tenantId}::uuid, ${timesheetId}::uuid,
            ${level}, ${approverIds[i]}::uuid, ${status}
          )
          RETURNING *
        `;

        entries.push(row as ApprovalChainRow);
      }

      await this.writeOutbox(
        tx,
        ctx.tenantId,
        "timesheet",
        timesheetId,
        "time.timesheet.approval_chain.created",
        {
          timesheetId,
          levels: approverIds.length,
          approverIds,
        }
      );

      return entries;
    });
  }

  async getApprovalChain(
    ctx: TenantContext,
    timesheetId: string
  ): Promise<ApprovalChainRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ApprovalChainRow[]>`
        SELECT
          ac.id, ac.tenant_id, ac.timesheet_id, ac.level,
          ac.approver_id, ac.status, ac.decided_at, ac.comments,
          ac.created_at, ac.updated_at,
          u.name AS approver_name
        FROM app.timesheet_approval_chains ac
        JOIN app.users u ON ac.approver_id = u.id
        WHERE ac.timesheet_id = ${timesheetId}::uuid
        ORDER BY ac.level
      `;
      return rows as ApprovalChainRow[];
    });
  }

  async getActiveChainEntry(
    ctx: TenantContext,
    timesheetId: string,
    approverId: string
  ): Promise<ApprovalChainRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ApprovalChainRow[]>`
        SELECT
          ac.id, ac.tenant_id, ac.timesheet_id, ac.level,
          ac.approver_id, ac.status, ac.decided_at, ac.comments,
          ac.created_at, ac.updated_at
        FROM app.timesheet_approval_chains ac
        WHERE ac.timesheet_id = ${timesheetId}::uuid
          AND ac.approver_id = ${approverId}::uuid
          AND ac.status = 'active'
      `;
    });
    return rows.length > 0 ? (rows[0] as ApprovalChainRow) : null;
  }

  async processChainDecision(
    ctx: TenantContext,
    timesheetId: string,
    approverId: string,
    decision: "approved" | "rejected",
    comments?: string
  ): Promise<{ action: string; level: number; timesheetStatus: string }> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Find the active chain entry for this approver
      const [activeEntry] = await tx<ApprovalChainRow[]>`
        SELECT * FROM app.timesheet_approval_chains
        WHERE timesheet_id = ${timesheetId}::uuid
          AND approver_id = ${approverId}::uuid
          AND status = 'active'
      `;

      if (!activeEntry) {
        throw new Error("No active approval chain entry found for this approver and timesheet");
      }

      // Get the max level
      const [maxResult] = await tx<{ maxLevel: number }[]>`
        SELECT MAX(level) AS max_level
        FROM app.timesheet_approval_chains
        WHERE timesheet_id = ${timesheetId}::uuid
      `;
      const maxLevel = maxResult?.maxLevel ?? activeEntry.level;

      // Record the decision on this chain entry
      await tx`
        UPDATE app.timesheet_approval_chains
        SET status = ${decision},
            decided_at = now(),
            comments = ${comments || null}
        WHERE id = ${activeEntry.id}::uuid
      `;

      let action: string;
      let timesheetStatus: string;

      if (decision === "approved") {
        // Record in the immutable approval history
        await tx`
          SELECT app.record_timesheet_approval(
            ${timesheetId}::uuid, 'approve', ${approverId}::uuid,
            ${comments || "Approved at level " + activeEntry.level}
          )
        `;

        if (activeEntry.level < maxLevel) {
          // Promote the next level to active
          await tx`
            UPDATE app.timesheet_approval_chains
            SET status = 'active'
            WHERE timesheet_id = ${timesheetId}::uuid
              AND level = ${activeEntry.level + 1}
              AND status = 'pending'
          `;

          action = "level_approved";
          timesheetStatus = "submitted";
        } else {
          // Final level approved: approve the timesheet
          await tx`
            UPDATE app.timesheets
            SET status = 'approved',
                approved_at = now(),
                approved_by = ${approverId}::uuid,
                updated_at = now()
            WHERE id = ${timesheetId}::uuid
              AND status = 'submitted'
          `;

          action = "fully_approved";
          timesheetStatus = "approved";
        }

        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "timesheet",
          timesheetId,
          action === "fully_approved"
            ? "time.timesheet.approved"
            : "time.timesheet.approval_chain.level_approved",
          {
            timesheetId,
            approverId,
            level: activeEntry.level,
            decision,
            action,
          }
        );
      } else {
        // Rejection: skip all remaining pending/active levels
        await tx`
          UPDATE app.timesheet_approval_chains
          SET status = 'skipped',
              decided_at = now(),
              comments = ${"Skipped due to rejection at level " + activeEntry.level}
          WHERE timesheet_id = ${timesheetId}::uuid
            AND status IN ('pending', 'active')
            AND level > ${activeEntry.level}
        `;

        // Record rejection in immutable approval history
        await tx`
          SELECT app.record_timesheet_approval(
            ${timesheetId}::uuid, 'reject', ${approverId}::uuid,
            ${comments || "Rejected at level " + activeEntry.level}
          )
        `;

        // Reject the timesheet itself
        await tx`
          UPDATE app.timesheets
          SET status = 'rejected',
              rejected_at = now(),
              rejected_by = ${approverId}::uuid,
              rejection_reason = ${comments || "Rejected at approval level " + activeEntry.level},
              updated_at = now()
          WHERE id = ${timesheetId}::uuid
            AND status = 'submitted'
        `;

        action = "rejected";
        timesheetStatus = "rejected";

        await this.writeOutbox(
          tx,
          ctx.tenantId,
          "timesheet",
          timesheetId,
          "time.timesheet.rejected",
          {
            timesheetId,
            approverId,
            level: activeEntry.level,
            decision,
            comments,
          }
        );
      }

      return {
        action,
        level: activeEntry.level,
        timesheetStatus,
      };
    });
  }

  async getPendingApprovals(
    ctx: TenantContext,
    approverId: string,
    filters: { cursor?: string; limit?: number }
  ): Promise<PaginatedResult<PendingApprovalRow>> {
    const limit = filters.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PendingApprovalRow[]>`
        SELECT
          ac.id AS chain_id,
          ac.timesheet_id,
          t.employee_id,
          e.employee_number,
          t.period_start,
          t.period_end,
          t.total_regular_hours,
          t.total_overtime_hours,
          ac.level,
          t.submitted_at
        FROM app.timesheet_approval_chains ac
        JOIN app.timesheets t ON ac.timesheet_id = t.id
        JOIN app.employees e ON t.employee_id = e.id
        WHERE ac.approver_id = ${approverId}::uuid
          AND ac.status = 'active'
          AND t.status = 'submitted'
          AND ac.tenant_id = ${ctx.tenantId}::uuid
          ${filters.cursor ? tx`AND ac.id < ${filters.cursor}::uuid` : tx``}
        ORDER BY t.submitted_at, ac.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.chainId ?? null : null;

    return { data: data as PendingApprovalRow[], cursor, hasMore };
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
