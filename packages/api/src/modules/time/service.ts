/**
 * Time & Attendance Service
 *
 * Business logic for time tracking operations including validation
 * and state machine enforcement.
 */

import { TimeRepository, type TenantContext } from "./repository";
import type {
  CreateTimeEvent,
  CreateSchedule,
  UpdateSchedule,
  CreateShift,
  UpdateShift,
  CreateTimesheet,
  TimesheetLine,
  CreateSwapRequest,
  TimeEventFilters,
  TimesheetFilters,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

type PaginatedResult = ServiceResult<{ items: unknown[]; cursor: string | null; hasMore: boolean }>;

// =============================================================================
// Error Codes
// =============================================================================

export const TimeErrorCodes = {
  TIME_EVENT_NOT_FOUND: "TIME_EVENT_NOT_FOUND",
  SCHEDULE_NOT_FOUND: "SCHEDULE_NOT_FOUND",
  SHIFT_NOT_FOUND: "SHIFT_NOT_FOUND",
  TIMESHEET_NOT_FOUND: "TIMESHEET_NOT_FOUND",
  TIMESHEET_ALREADY_SUBMITTED: "TIMESHEET_ALREADY_SUBMITTED",
  TIMESHEET_ALREADY_APPROVED: "TIMESHEET_ALREADY_APPROVED",
  TIMESHEET_NOT_SUBMITTED: "TIMESHEET_NOT_SUBMITTED",
  INVALID_TIME_SEQUENCE: "INVALID_TIME_SEQUENCE",
  SHIFT_OVERLAP: "SHIFT_OVERLAP",
  INVALID_DATE_RANGE: "INVALID_DATE_RANGE",
} as const;

// =============================================================================
// Service Class
// =============================================================================

export class TimeService {
  constructor(private repo: TimeRepository) {}

  // ===========================================================================
  // Time Events
  // ===========================================================================

  async createTimeEvent(
    ctx: TenantContext,
    input: CreateTimeEvent
  ): Promise<ServiceResult<unknown>> {
    try {
      // Validate event time sequence
      const lastEvent = await this.getLastTimeEvent(ctx, input.employeeId);
      if (lastEvent) {
        const isValid = this.validateTimeSequence(lastEvent.eventType, input.eventType);
        if (!isValid) {
          return {
            success: false,
            error: {
              code: TimeErrorCodes.INVALID_TIME_SEQUENCE,
              message: `Cannot record ${input.eventType} after ${lastEvent.eventType}`,
              details: { lastEventType: lastEvent.eventType, newEventType: input.eventType },
            },
          };
        }
      }

      const event = await this.repo.createTimeEvent(ctx, {
        employeeId: input.employeeId,
        eventType: input.eventType,
        eventTime: new Date(input.eventTime),
        deviceId: input.deviceId,
        latitude: input.latitude,
        longitude: input.longitude,
        notes: input.notes,
      });

      return { success: true, data: this.formatTimeEvent(event) };
    } catch (error) {
      console.error("Error creating time event:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create time event",
        },
      };
    }
  }

  async getTimeEvents(
    ctx: TenantContext,
    filters: TimeEventFilters
  ): Promise<PaginatedResult> {
    try {
      const result = await this.repo.getTimeEvents(ctx, {
        employeeId: filters.employeeId,
        eventType: filters.eventType,
        from: filters.from ? new Date(filters.from) : undefined,
        to: filters.to ? new Date(filters.to) : undefined,
        deviceId: filters.deviceId,
        cursor: filters.cursor,
        limit: filters.limit,
      });

      return {
        success: true,
        data: {
          items: result.data.map(this.formatTimeEvent),
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error fetching time events:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch time events",
        },
      };
    }
  }

  async getTimeEventById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const event = await this.repo.getTimeEventById(ctx, id);
      if (!event) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIME_EVENT_NOT_FOUND,
            message: "Time event not found",
          },
        };
      }

      return { success: true, data: this.formatTimeEvent(event) };
    } catch (error) {
      console.error("Error fetching time event:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch time event",
        },
      };
    }
  }

  // ===========================================================================
  // Schedules
  // ===========================================================================

  async createSchedule(
    ctx: TenantContext,
    input: CreateSchedule
  ): Promise<ServiceResult<unknown>> {
    try {
      // Validate date range
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      if (endDate < startDate) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.INVALID_DATE_RANGE,
            message: "End date must be after start date",
          },
        };
      }

      const schedule = await this.repo.createSchedule(ctx, {
        name: input.name,
        description: input.description,
        startDate,
        endDate,
        orgUnitId: input.orgUnitId,
        isTemplate: input.isTemplate,
      });

      return { success: true, data: this.formatSchedule(schedule) };
    } catch (error) {
      console.error("Error creating schedule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create schedule",
        },
      };
    }
  }

  async getSchedules(
    ctx: TenantContext,
    filters: { orgUnitId?: string; isTemplate?: boolean; cursor?: string; limit?: number }
  ): Promise<PaginatedResult> {
    try {
      const result = await this.repo.getSchedules(ctx, filters);
      return {
        success: true,
        data: {
          items: result.data.map(this.formatSchedule),
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error fetching schedules:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch schedules",
        },
      };
    }
  }

  async getScheduleById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const schedule = await this.repo.getScheduleById(ctx, id);
      if (!schedule) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.SCHEDULE_NOT_FOUND,
            message: "Schedule not found",
          },
        };
      }

      return { success: true, data: this.formatSchedule(schedule) };
    } catch (error) {
      console.error("Error fetching schedule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch schedule",
        },
      };
    }
  }

  async updateSchedule(
    ctx: TenantContext,
    id: string,
    input: UpdateSchedule
  ): Promise<ServiceResult<unknown>> {
    try {
      const schedule = await this.repo.updateSchedule(ctx, id, {
        name: input.name,
        description: input.description,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        orgUnitId: input.orgUnitId,
        isTemplate: input.isTemplate,
      });

      if (!schedule) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.SCHEDULE_NOT_FOUND,
            message: "Schedule not found",
          },
        };
      }

      return { success: true, data: this.formatSchedule(schedule) };
    } catch (error) {
      console.error("Error updating schedule:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update schedule",
        },
      };
    }
  }

  // ===========================================================================
  // Shifts
  // ===========================================================================

  async createShift(
    ctx: TenantContext,
    input: CreateShift
  ): Promise<ServiceResult<unknown>> {
    try {
      const shift = await this.repo.createShift(ctx, {
        scheduleId: input.scheduleId,
        employeeId: input.employeeId,
        shiftDate: new Date(input.shiftDate),
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        positionId: input.positionId,
        notes: input.notes,
      });

      return { success: true, data: this.formatShift(shift) };
    } catch (error) {
      console.error("Error creating shift:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create shift",
        },
      };
    }
  }

  async getShiftById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const shift = await this.repo.getShiftById(ctx, id);
      if (!shift) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.SHIFT_NOT_FOUND,
            message: "Shift not found",
          },
        };
      }

      return { success: true, data: this.formatShift(shift) };
    } catch (error) {
      console.error("Error fetching shift:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch shift",
        },
      };
    }
  }

  async getShiftsBySchedule(
    ctx: TenantContext,
    scheduleId: string,
    filters: { employeeId?: string; from?: string; to?: string }
  ): Promise<ServiceResult<unknown[]>> {
    try {
      const shifts = await this.repo.getShiftsBySchedule(ctx, scheduleId, {
        employeeId: filters.employeeId,
        from: filters.from ? new Date(filters.from) : undefined,
        to: filters.to ? new Date(filters.to) : undefined,
      });

      return { success: true, data: shifts.map(this.formatShift) };
    } catch (error) {
      console.error("Error fetching shifts:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch shifts",
        },
      };
    }
  }

  async updateShift(
    ctx: TenantContext,
    id: string,
    input: UpdateShift
  ): Promise<ServiceResult<unknown>> {
    try {
      const shift = await this.repo.updateShift(ctx, id, {
        shiftDate: input.shiftDate ? new Date(input.shiftDate) : undefined,
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        positionId: input.positionId,
        notes: input.notes,
      });

      if (!shift) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.SHIFT_NOT_FOUND,
            message: "Shift not found",
          },
        };
      }

      return { success: true, data: this.formatShift(shift) };
    } catch (error) {
      console.error("Error updating shift:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update shift",
        },
      };
    }
  }

  // ===========================================================================
  // Timesheets
  // ===========================================================================

  async createTimesheet(
    ctx: TenantContext,
    input: CreateTimesheet
  ): Promise<ServiceResult<unknown>> {
    try {
      const timesheet = await this.repo.createTimesheet(ctx, {
        employeeId: input.employeeId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
      });

      return { success: true, data: this.formatTimesheet(timesheet) };
    } catch (error) {
      console.error("Error creating timesheet:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create timesheet",
        },
      };
    }
  }

  async getTimesheets(
    ctx: TenantContext,
    filters: TimesheetFilters
  ): Promise<PaginatedResult> {
    try {
      const result = await this.repo.getTimesheets(ctx, {
        employeeId: filters.employeeId,
        status: filters.status,
        periodStart: filters.periodStart ? new Date(filters.periodStart) : undefined,
        periodEnd: filters.periodEnd ? new Date(filters.periodEnd) : undefined,
        cursor: filters.cursor,
        limit: filters.limit,
      });

      return {
        success: true,
        data: {
          items: result.data.map(this.formatTimesheet),
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error fetching timesheets:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch timesheets",
        },
      };
    }
  }

  async getTimesheetById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const timesheet = await this.repo.getTimesheetById(ctx, id);
      if (!timesheet) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIMESHEET_NOT_FOUND,
            message: "Timesheet not found",
          },
        };
      }

      const lines = await this.repo.getTimesheetLines(ctx, id);

      return {
        success: true,
        data: {
          ...this.formatTimesheet(timesheet),
          lines: lines.map((l) => ({
            id: l.id,
            date: l.date.toISOString().split("T")[0],
            regularHours: l.regularHours,
            overtimeHours: l.overtimeHours,
            breakMinutes: l.breakMinutes,
            projectId: l.projectId,
            taskCode: l.taskCode,
            notes: l.notes,
          })),
        },
      };
    } catch (error) {
      console.error("Error fetching timesheet:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to fetch timesheet",
        },
      };
    }
  }

  async updateTimesheetLines(
    ctx: TenantContext,
    id: string,
    lines: TimesheetLine[]
  ): Promise<ServiceResult<unknown>> {
    try {
      const timesheet = await this.repo.getTimesheetById(ctx, id);
      if (!timesheet) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIMESHEET_NOT_FOUND,
            message: "Timesheet not found",
          },
        };
      }

      if (timesheet.status !== "draft") {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIMESHEET_ALREADY_SUBMITTED,
            message: "Cannot modify a submitted timesheet",
          },
        };
      }

      await this.repo.updateTimesheetLines(
        ctx,
        id,
        lines.map((l) => ({
          date: new Date(l.date),
          regularHours: l.regularHours,
          overtimeHours: l.overtimeHours,
          breakMinutes: l.breakMinutes,
          projectId: l.projectId,
          taskCode: l.taskCode,
          notes: l.notes,
        }))
      );

      return this.getTimesheetById(ctx, id);
    } catch (error) {
      console.error("Error updating timesheet lines:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update timesheet lines",
        },
      };
    }
  }

  async submitTimesheet(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const timesheet = await this.repo.submitTimesheet(ctx, id);
      if (!timesheet) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIMESHEET_NOT_FOUND,
            message: "Timesheet not found or not in draft status",
          },
        };
      }

      return { success: true, data: this.formatTimesheet(timesheet) };
    } catch (error) {
      console.error("Error submitting timesheet:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to submit timesheet",
        },
      };
    }
  }

  async approveTimesheet(
    ctx: TenantContext,
    id: string,
    approverId: string,
    comments?: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const timesheet = await this.repo.approveTimesheet(ctx, id, approverId, comments);
      if (!timesheet) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIMESHEET_NOT_SUBMITTED,
            message: "Timesheet not found or not in submitted status",
          },
        };
      }

      return { success: true, data: this.formatTimesheet(timesheet) };
    } catch (error) {
      console.error("Error approving timesheet:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to approve timesheet",
        },
      };
    }
  }

  async rejectTimesheet(
    ctx: TenantContext,
    id: string,
    approverId: string,
    comments?: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const timesheet = await this.repo.rejectTimesheet(ctx, id, approverId, comments);
      if (!timesheet) {
        return {
          success: false,
          error: {
            code: TimeErrorCodes.TIMESHEET_NOT_SUBMITTED,
            message: "Timesheet not found or not in submitted status",
          },
        };
      }

      return { success: true, data: this.formatTimesheet(timesheet) };
    } catch (error) {
      console.error("Error rejecting timesheet:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to reject timesheet",
        },
      };
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async getLastTimeEvent(ctx: TenantContext, employeeId: string) {
    const result = await this.repo.getTimeEvents(ctx, {
      employeeId,
      limit: 1,
    });
    return result.data.length > 0 ? result.data[0] : null;
  }

  private validateTimeSequence(lastEventType: string, newEventType: string): boolean {
    const validTransitions: Record<string, string[]> = {
      clock_in: ["break_start", "clock_out"],
      clock_out: ["clock_in"],
      break_start: ["break_end"],
      break_end: ["break_start", "clock_out"],
    };

    // If no previous event, only clock_in is valid
    if (!lastEventType) {
      return newEventType === "clock_in";
    }

    return validTransitions[lastEventType]?.includes(newEventType) ?? false;
  }

  private formatTimeEvent(event: any) {
    return {
      id: event.id,
      tenantId: event.tenantId,
      employeeId: event.employeeId,
      eventType: event.eventType,
      eventTime: event.eventTime instanceof Date ? event.eventTime.toISOString() : event.eventTime,
      deviceId: event.deviceId,
      latitude: event.latitude,
      longitude: event.longitude,
      notes: event.notes,
      createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
      updatedAt: event.updatedAt instanceof Date ? event.updatedAt.toISOString() : event.updatedAt,
    };
  }

  private formatSchedule(schedule: any) {
    return {
      id: schedule.id,
      tenantId: schedule.tenantId,
      name: schedule.name,
      description: schedule.description,
      startDate: schedule.startDate instanceof Date ? schedule.startDate.toISOString().split("T")[0] : schedule.startDate,
      endDate: schedule.endDate instanceof Date ? schedule.endDate.toISOString().split("T")[0] : schedule.endDate,
      orgUnitId: schedule.orgUnitId,
      isTemplate: schedule.isTemplate,
      status: schedule.status,
      createdAt: schedule.createdAt instanceof Date ? schedule.createdAt.toISOString() : schedule.createdAt,
      updatedAt: schedule.updatedAt instanceof Date ? schedule.updatedAt.toISOString() : schedule.updatedAt,
    };
  }

  private formatShift(shift: any) {
    return {
      id: shift.id,
      tenantId: shift.tenantId,
      scheduleId: shift.scheduleId,
      employeeId: shift.employeeId,
      shiftDate: shift.shiftDate instanceof Date ? shift.shiftDate.toISOString().split("T")[0] : shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      actualStartTime: shift.actualStartTime,
      actualEndTime: shift.actualEndTime,
      status: shift.status,
      positionId: shift.positionId,
      notes: shift.notes,
      createdAt: shift.createdAt instanceof Date ? shift.createdAt.toISOString() : shift.createdAt,
      updatedAt: shift.updatedAt instanceof Date ? shift.updatedAt.toISOString() : shift.updatedAt,
    };
  }

  private formatTimesheet(timesheet: any) {
    return {
      id: timesheet.id,
      tenantId: timesheet.tenantId,
      employeeId: timesheet.employeeId,
      periodStart: timesheet.periodStart instanceof Date ? timesheet.periodStart.toISOString().split("T")[0] : timesheet.periodStart,
      periodEnd: timesheet.periodEnd instanceof Date ? timesheet.periodEnd.toISOString().split("T")[0] : timesheet.periodEnd,
      status: timesheet.status,
      totalRegularHours: timesheet.totalRegularHours,
      totalOvertimeHours: timesheet.totalOvertimeHours,
      submittedAt: timesheet.submittedAt instanceof Date ? timesheet.submittedAt.toISOString() : timesheet.submittedAt,
      approvedAt: timesheet.approvedAt instanceof Date ? timesheet.approvedAt.toISOString() : timesheet.approvedAt,
      approvedById: timesheet.approvedById,
      createdAt: timesheet.createdAt instanceof Date ? timesheet.createdAt.toISOString() : timesheet.createdAt,
      updatedAt: timesheet.updatedAt instanceof Date ? timesheet.updatedAt.toISOString() : timesheet.updatedAt,
    };
  }
}
