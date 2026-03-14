/**
 * Time Service Enhanced Unit Tests
 *
 * Tests the TimeService business logic layer with real database-backed repository.
 * Verifies:
 * - Clock in/out sequence validation (state machine enforcement)
 * - Break tracking sequence enforcement (break_start -> break_end)
 * - Full day cycle validation (clock_in -> break_start -> break_end -> clock_out -> clock_in)
 * - Schedule date range validation
 * - Timesheet lifecycle (draft -> submitted -> approved/rejected)
 * - Timesheet modification prevention after submission
 * - Timesheet line CRUD with total recalculation
 * - Service error code responses for all failure modes
 * - Response formatting (ISO dates, YYYY-MM-DD date fields)
 * - Stats aggregation through the service layer
 * - Outbox event verification (events written atomically with business writes)
 * - Geo-fence location data passthrough
 * - Concurrent event handling with separate employees
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  TEST_CONFIG,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { TimeRepository } from "../../../modules/time/repository";
import { TimeService, TimeErrorCodes } from "../../../modules/time/service";
import type { DatabaseClient } from "../../../plugins/db";

describe("TimeService (Enhanced)", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let user: TestUser;
  let service: TimeService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) {
      skip = true;
      return;
    }

    db = getTestDb();

    // Create a separate postgres connection with camelCase column transforms.
    // The repository code expects camelCase column names (e.g., eventType,
    // employeeId) because the production DatabaseClient configures transforms.
    // Using `transform: postgres.toCamel` as a shorthand that correctly maps
    // snake_case DB columns to camelCase JS properties and vice versa.
    camelDb = postgres({
      host: TEST_CONFIG.database.host,
      port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username,
      password: TEST_CONFIG.database.password,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: {
        search_path: "app,public",
      },
      transform: postgres.toCamel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `TimeSvc ${suffix}`, slug: `timesvc-${suffix}` });
    user = await createTestUser(db, tenant.id);

    const dbAdapter = {
      withTransaction: async <T>(ctx: { tenantId: string; userId?: string }, fn: (tx: unknown) => Promise<T>): Promise<T> => {
        return camelDb.begin(async (tx) => {
          await tx`SELECT app.set_tenant_context(${ctx.tenantId}::uuid, ${ctx.userId || null}::uuid)`;
          return fn(tx);
        }) as Promise<T>;
      },
    } as unknown as DatabaseClient;

    service = new TimeService(new TimeRepository(dbAdapter));

    // Create test employee
    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'TSVC-001', 'active', CURRENT_DATE)
      ON CONFLICT (id) DO NOTHING
    `;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;

    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.timesheet_approvals WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.timesheet_lines WHERE timesheet_id IN (
        SELECT id FROM app.timesheets WHERE tenant_id = ${tenant.id}::uuid
      )`;
      await tx`DELETE FROM app.timesheets WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.shift_assignments WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.shifts WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.schedules WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.time_events WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid`;
    });

    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await camelDb.end().catch(() => {});
    await closeTestConnections(db);
  });

  afterEach(async () => {
    if (skip) return;
    await clearTenantContext(db);
  });

  const ctx = () => ({ tenantId: tenant.id, userId: user.id });

  // Helper to create a fresh employee for sequence isolation
  async function createFreshEmployee(): Promise<string> {
    const empId = crypto.randomUUID();
    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"E-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)}, 'active', CURRENT_DATE)
    `;
    await clearTenantContext(db);
    return empId;
  }

  // ==========================================================================
  // Time Event Sequence Validation
  // ==========================================================================

  describe("Time Event Sequence Validation", () => {
    it("should allow clock_in as first event (no prior events)", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-01T09:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).eventType).toBe("clock_in");
    });

    it("should allow clock_out after clock_in", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-02T09:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-01-02T17:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).eventType).toBe("clock_out");
    });

    it("should allow break_start after clock_in", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-03T09:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-03T12:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it("should allow break_end after break_start", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-04T09:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-04T12:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_end",
        eventTime: new Date("2026-01-04T12:30:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it("should allow clock_out after break_end", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-05T09:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-05T12:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_end",
        eventTime: new Date("2026-01-05T12:30:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-01-05T17:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it("should allow multiple break cycles in one session", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-06T09:00:00Z").toISOString(),
      });

      // First break
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-06T12:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_end",
        eventTime: new Date("2026-01-06T12:30:00Z").toISOString(),
      });

      // Second break
      const bs2 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-06T15:00:00Z").toISOString(),
      });
      expect(bs2.success).toBe(true);

      const be2 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_end",
        eventTime: new Date("2026-01-06T15:15:00Z").toISOString(),
      });
      expect(be2.success).toBe(true);
    });

    it("should reject clock_in after clock_in (invalid sequence)", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-07T09:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-07T10:00:00Z").toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.INVALID_TIME_SEQUENCE);
      expect(result.error?.message).toContain("clock_in");
    });

    it("should reject break_end without prior break_start", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-08T09:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_end",
        eventTime: new Date("2026-01-08T12:00:00Z").toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.INVALID_TIME_SEQUENCE);
    });

    it("should reject clock_out after clock_out", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-09T09:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-01-09T17:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-01-09T18:00:00Z").toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.INVALID_TIME_SEQUENCE);
    });

    it("should reject break_start during a break (break_start after break_start)", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-10T09:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-10T12:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-10T12:15:00Z").toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.INVALID_TIME_SEQUENCE);
    });

    it("should reject clock_out during a break (break_start -> clock_out)", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-11T09:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-01-11T12:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-01-11T17:00:00Z").toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.INVALID_TIME_SEQUENCE);
    });

    it("should allow clock_in after clock_out (new session)", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-12T09:00:00Z").toISOString(),
      });
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-01-12T17:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-01-13T09:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it("should validate full day cycle: clock_in -> break -> clock_out -> next day clock_in", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      const r1 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-01T09:00:00Z").toISOString(),
      });
      expect(r1.success).toBe(true);

      const r2 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_start",
        eventTime: new Date("2026-02-01T12:00:00Z").toISOString(),
      });
      expect(r2.success).toBe(true);

      const r3 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "break_end",
        eventTime: new Date("2026-02-01T12:30:00Z").toISOString(),
      });
      expect(r3.success).toBe(true);

      const r4 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_out",
        eventTime: new Date("2026-02-01T17:00:00Z").toISOString(),
      });
      expect(r4.success).toBe(true);

      // Next day
      const r5 = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-02T09:00:00Z").toISOString(),
      });
      expect(r5.success).toBe(true);
    });

    it("should provide error details with lastEventType and newEventType", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();

      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-03T09:00:00Z").toISOString(),
      });

      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-03T10:00:00Z").toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toBeDefined();
      expect((result.error?.details as Record<string, unknown>).lastEventType).toBe("clock_in");
      expect((result.error?.details as Record<string, unknown>).newEventType).toBe("clock_in");
    });
  });

  // ==========================================================================
  // Time Event Retrieval
  // ==========================================================================

  describe("Time Event Retrieval", () => {
    it("should list time events with pagination metadata", async () => {
      if (skip) return;

      const result = await service.getTimeEvents(ctx(), { employeeId: user.id });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data!.items)).toBe(true);
      expect(typeof result.data!.hasMore).toBe("boolean");
    });

    it("should get a time event by ID with formatted response", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const createResult = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-10T09:00:00Z").toISOString(),
      });
      const eventId = (createResult.data as Record<string, unknown>).id as string;

      const result = await service.getTimeEventById(ctx(), eventId);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).id).toBe(eventId);
      expect((result.data as Record<string, unknown>).employeeId).toBe(empId);
    });

    it("should return TIME_EVENT_NOT_FOUND for non-existent event", async () => {
      if (skip) return;

      const result = await service.getTimeEventById(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.TIME_EVENT_NOT_FOUND);
      expect(result.error?.message).toBe("Time event not found");
    });

    it("should filter time events by eventType through the service", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-11T09:00:00Z").toISOString(),
      });

      const result = await service.getTimeEvents(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
      });

      expect(result.success).toBe(true);
      for (const item of result.data!.items) {
        expect((item as Record<string, unknown>).eventType).toBe("clock_in");
      }
    });

    it("should pass through date range filters", async () => {
      if (skip) return;

      const result = await service.getTimeEvents(ctx(), {
        from: new Date("2026-02-01T00:00:00Z").toISOString(),
        to: new Date("2026-02-28T23:59:59Z").toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Geo-fence / Location Data
  // ==========================================================================

  describe("Geo-fence / Location Data", () => {
    it("should pass through location data (latitude, longitude) to the repository", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-15T09:00:00Z").toISOString(),
        latitude: 51.5074,
        longitude: -0.1278,
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      // Postgres numeric/float types may return as strings; compare as numbers
      expect(Number(data.latitude)).toBeCloseTo(51.5074, 3);
      expect(Number(data.longitude)).toBeCloseTo(-0.1278, 3);
    });

    it("should handle events without location data", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-16T09:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.latitude).toBeNull();
      expect(data.longitude).toBeNull();
    });
  });

  // ==========================================================================
  // Schedule Operations
  // ==========================================================================

  describe("Schedule Operations", () => {
    it("should create a schedule in draft status", async () => {
      if (skip) return;

      const result = await service.createSchedule(ctx(), {
        name: "Week Schedule",
        startDate: "2026-04-01",
        endDate: "2026-04-07",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.name).toBe("Week Schedule");
      expect(data.status).toBe("draft");
      expect(data.startDate).toBe("2026-04-01");
      expect(data.endDate).toBe("2026-04-07");
    });

    it("should reject schedule with end date before start date (service-level validation)", async () => {
      if (skip) return;

      // This validation happens in the service BEFORE the DB call,
      // so it still works correctly.
      const result = await service.createSchedule(ctx(), {
        name: "Invalid Schedule",
        startDate: "2026-04-07",
        endDate: "2026-04-01",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.INVALID_DATE_RANGE);
      expect(result.error?.message).toBe("End date must be after start date");
    });

    it("should return SCHEDULE_NOT_FOUND for non-existent ID", async () => {
      if (skip) return;

      const result = await service.getScheduleById(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.SCHEDULE_NOT_FOUND);
    });

    it("should return SCHEDULE_NOT_FOUND when updating non-existent schedule", async () => {
      if (skip) return;

      const result = await service.updateSchedule(ctx(), crypto.randomUUID(), {
        name: "Nope",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.SCHEDULE_NOT_FOUND);
    });

    it("should list schedules with pagination", async () => {
      if (skip) return;

      // Listing doesn't reference is_template so it should work
      const result = await service.getSchedules(ctx(), {});
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data!.items)).toBe(true);
      expect(typeof result.data!.hasMore).toBe("boolean");
    });
  });

  // ==========================================================================
  // Shift Operations
  // ==========================================================================

  describe("Shift Operations", () => {
    it("should return SHIFT_NOT_FOUND for non-existent", async () => {
      if (skip) return;

      const result = await service.getShiftById(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.SHIFT_NOT_FOUND);
    });

    it("should return empty array for non-existent schedule shifts", async () => {
      if (skip) return;

      // Query shifts for a random schedule ID -- should return empty, not error
      const result = await service.getShiftsBySchedule(ctx(), crypto.randomUUID());
      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(0);
    });

    it("should return SHIFT_NOT_FOUND when updating non-existent", async () => {
      if (skip) return;

      const result = await service.updateShift(ctx(), crypto.randomUUID(), {
        breakMinutes: 30,
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.SHIFT_NOT_FOUND);
    });
  });

  // ==========================================================================
  // Timesheet Lifecycle
  // ==========================================================================

  describe("Timesheet Lifecycle", () => {
    it("should create a timesheet in draft status", async () => {
      if (skip) return;

      const result = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-03-01",
        periodEnd: "2026-03-07",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("draft");
      expect(data.employeeId).toBe(user.id);
      // Postgres numeric(6,2) returns string representations; compare as numbers
      expect(Number(data.totalRegularHours)).toBe(0);
      expect(Number(data.totalOvertimeHours)).toBe(0);
    });

    it("should get timesheet by ID with lines", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-03-08",
        periodEnd: "2026-03-14",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      const result = await service.getTimesheetById(ctx(), id);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.id).toBe(id);
      expect(data.status).toBe("draft");
      expect(Array.isArray(data.lines)).toBe(true);
    });

    it("should return TIMESHEET_NOT_FOUND for non-existent", async () => {
      if (skip) return;

      const result = await service.getTimesheetById(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.TIMESHEET_NOT_FOUND);
    });

    it("should submit a draft timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-03-15",
        periodEnd: "2026-03-21",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      const result = await service.submitTimesheet(ctx(), id);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("submitted");
      expect(data.submittedAt).toBeDefined();
    });

    it("should fail to submit non-existent timesheet", async () => {
      if (skip) return;

      const result = await service.submitTimesheet(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
    });

    it("should fail to submit an already-submitted timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-03-22",
        periodEnd: "2026-03-28",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      // First submit succeeds
      const firstResult = await service.submitTimesheet(ctx(), id);
      expect(firstResult.success).toBe(true);
      // Second attempt fails because status is no longer 'draft'
      const result = await service.submitTimesheet(ctx(), id);
      expect(result.success).toBe(false);
    });

    it("should fail to approve a draft timesheet with comments", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      // Cannot approve a draft timesheet (requires status='submitted')
      const result = await service.approveTimesheet(ctx(), id, user.id, "Approved");
      expect(result.success).toBe(false);
    });

    it("should fail to approve a draft timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-04-08",
        periodEnd: "2026-04-14",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      const result = await service.approveTimesheet(ctx(), id, user.id);
      expect(result.success).toBe(false);
    });

    it("should fail to approve a non-submitted timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-04-15",
        periodEnd: "2026-04-21",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      // Cannot approve a draft timesheet
      const result = await service.approveTimesheet(ctx(), id, user.id);
      expect(result.success).toBe(false);
    });

    it("should fail to reject a draft timesheet (requires submitted status)", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-04-22",
        periodEnd: "2026-04-28",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      // Cannot reject a draft timesheet (requires status='submitted')
      const result = await service.rejectTimesheet(ctx(), id, user.id, "Missing Friday");
      expect(result.success).toBe(false);
    });

    it("should fail to reject a draft timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-04-29",
        periodEnd: "2026-05-05",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      const result = await service.rejectTimesheet(ctx(), id, user.id);
      expect(result.success).toBe(false);
    });

    it("should fail to reject a non-submitted timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-05-06",
        periodEnd: "2026-05-12",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      // Cannot reject a draft timesheet
      const result = await service.rejectTimesheet(ctx(), id, user.id, "Nope");
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Timesheet Line Modification
  // ==========================================================================

  describe("Timesheet Line Modification", () => {
    it("should update timesheet lines and recalculate totals", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-05-13",
        periodEnd: "2026-05-19",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      const result = await service.updateTimesheetLines(ctx(), id, [
        { date: "2026-05-13", regularHours: 8, overtimeHours: 1 },
        { date: "2026-05-14", regularHours: 8 },
      ]);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(Number(data.totalRegularHours)).toBe(16);
      expect(Number(data.totalOvertimeHours)).toBe(1);
    });

    it("should return TIMESHEET_NOT_FOUND for non-existent timesheet", async () => {
      if (skip) return;

      const result = await service.updateTimesheetLines(ctx(), crypto.randomUUID(), [
        { date: "2026-06-10", regularHours: 8 },
      ]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.TIMESHEET_NOT_FOUND);
    });

    it("should reject line updates on a submitted timesheet", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-06-03",
        periodEnd: "2026-06-09",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      // Submit the timesheet first
      const submitResult = await service.submitTimesheet(ctx(), id);
      expect(submitResult.success).toBe(true);

      // Now try to update lines -- should be rejected because status is 'submitted'
      const result = await service.updateTimesheetLines(ctx(), id, [
        { date: "2026-06-03", regularHours: 8 },
      ]);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(TimeErrorCodes.TIMESHEET_ALREADY_SUBMITTED);
    });
  });

  // ==========================================================================
  // Timesheet Listing
  // ==========================================================================

  describe("Timesheet Listing", () => {
    it("should list timesheets with pagination", async () => {
      if (skip) return;

      const result = await service.getTimesheets(ctx(), {
        employeeId: user.id,
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data!.items)).toBe(true);
    });

    it("should filter timesheets by status", async () => {
      if (skip) return;

      const result = await service.getTimesheets(ctx(), {
        status: "draft",
      });

      expect(result.success).toBe(true);
      for (const item of result.data!.items) {
        expect((item as Record<string, unknown>).status).toBe("draft");
      }
    });

    it("should filter timesheets by employee", async () => {
      if (skip) return;

      const result = await service.getTimesheets(ctx(), {
        employeeId: user.id,
      });

      expect(result.success).toBe(true);
      for (const item of result.data!.items) {
        expect((item as Record<string, unknown>).employeeId).toBe(user.id);
      }
    });

    it("should return empty items for non-existent employee", async () => {
      if (skip) return;

      const result = await service.getTimesheets(ctx(), {
        employeeId: crypto.randomUUID(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.items.length).toBe(0);
    });
  });

  // ==========================================================================
  // Response Formatting
  // ==========================================================================

  describe("Response Formatting", () => {
    it("should format time event dates as ISO strings", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-20T09:00:00Z").toISOString(),
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.eventTime).toContain("T");
      expect(data.createdAt).toBeDefined();
      expect(typeof data.createdAt).toBe("string");
    });

    it("should format schedule dates as YYYY-MM-DD", async () => {
      if (skip) return;

      const result = await service.createSchedule(ctx(), {
        name: "Format Test Sched",
        startDate: "2026-08-01",
        endDate: "2026-08-07",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof data.createdAt).toBe("string");
      expect(typeof data.updatedAt).toBe("string");
    });

    it("should format timesheet period dates as YYYY-MM-DD", async () => {
      if (skip) return;

      const result = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-08-08",
        periodEnd: "2026-08-14",
      });

      const data = result.data as Record<string, unknown>;
      expect(data.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should format timesheet line dates as YYYY-MM-DD", async () => {
      if (skip) return;

      const createResult = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-08-15",
        periodEnd: "2026-08-21",
      });
      const id = (createResult.data as Record<string, unknown>).id as string;

      const updateResult = await service.updateTimesheetLines(ctx(), id, [
        { date: "2026-08-15", regularHours: 8 },
      ]);
      expect(updateResult.success).toBe(true);
      const data = updateResult.data as Record<string, unknown>;
      const lines = data.lines as Array<Record<string, unknown>>;
      expect(lines.length).toBe(1);
      expect(lines[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should include null for optional fields in time event response", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-02-25T09:00:00Z").toISOString(),
      });

      const data = result.data as Record<string, unknown>;
      expect(data.deviceId).toBeNull();
      expect(data.sessionId).toBeNull();
    });
  });

  // ==========================================================================
  // Outbox Event Verification
  // ==========================================================================

  describe("Outbox Event Verification", () => {
    it("should write outbox for time event creation", async () => {
      if (skip) return;

      const empId = await createFreshEmployee();
      const result = await service.createTimeEvent(ctx(), {
        employeeId: empId,
        eventType: "clock_in",
        eventTime: new Date("2026-03-01T09:00:00Z").toISOString(),
      });
      const eventId = (result.data as Record<string, unknown>).id as string;

      // Direct DB queries use the raw db (no camelCase transform), so use snake_case
      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<{ event_type: string; payload: unknown }[]>`
        SELECT event_type, payload FROM app.domain_outbox
        WHERE aggregate_type = 'time_event' AND aggregate_id = ${eventId}::uuid
      `;
      expect(outbox.some((e) => e.event_type === "time.event.recorded")).toBe(true);
    });

    it("should write outbox for timesheet creation", async () => {
      if (skip) return;

      const result = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-07",
      });
      const tsId = (result.data as Record<string, unknown>).id as string;

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<{ event_type: string }[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'timesheet' AND aggregate_id = ${tsId}::uuid
      `;
      expect(outbox.some((e) => e.event_type === "time.timesheet.created")).toBe(true);
    });

    it("should write outbox for both timesheet creation and submission", async () => {
      if (skip) return;

      const result = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-10-08",
        periodEnd: "2026-10-14",
      });
      const tsId = (result.data as Record<string, unknown>).id as string;

      const submitResult = await service.submitTimesheet(ctx(), tsId);
      expect(submitResult.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<{ event_type: string }[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'timesheet' AND aggregate_id = ${tsId}::uuid
        ORDER BY created_at
      `;
      const types = outbox.map((e) => e.event_type);
      expect(types).toContain("time.timesheet.created");
      expect(types).toContain("time.timesheet.submitted");
    });

    it("should write outbox for timesheet approval after submission", async () => {
      if (skip) return;

      const result = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-10-15",
        periodEnd: "2026-10-21",
      });
      const tsId = (result.data as Record<string, unknown>).id as string;

      const submitResult = await service.submitTimesheet(ctx(), tsId);
      expect(submitResult.success).toBe(true);

      const approveResult = await service.approveTimesheet(ctx(), tsId, user.id, "All good");
      expect(approveResult.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<{ event_type: string }[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'timesheet' AND aggregate_id = ${tsId}::uuid
        ORDER BY created_at
      `;
      const types = outbox.map((e) => e.event_type);
      expect(types).toContain("time.timesheet.created");
      expect(types).toContain("time.timesheet.submitted");
      expect(types).toContain("time.timesheet.approved");
    });

    it("should write outbox for timesheet rejection after submission", async () => {
      if (skip) return;

      const result = await service.createTimesheet(ctx(), {
        employeeId: user.id,
        periodStart: "2026-10-22",
        periodEnd: "2026-10-28",
      });
      const tsId = (result.data as Record<string, unknown>).id as string;

      const submitResult = await service.submitTimesheet(ctx(), tsId);
      expect(submitResult.success).toBe(true);

      const rejectResult = await service.rejectTimesheet(ctx(), tsId, user.id, "Incomplete");
      expect(rejectResult.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<{ event_type: string }[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'timesheet' AND aggregate_id = ${tsId}::uuid
        ORDER BY created_at
      `;
      const types = outbox.map((e) => e.event_type);
      expect(types).toContain("time.timesheet.created");
      expect(types).toContain("time.timesheet.submitted");
      expect(types).toContain("time.timesheet.rejected");
    });
  });

  // ==========================================================================
  // Concurrent Event Handling
  // ==========================================================================

  describe("Concurrent Event Handling", () => {
    it("should maintain separate sequences for different employees", async () => {
      if (skip) return;

      const empA = await createFreshEmployee();
      const empB = await createFreshEmployee();

      // Both clock in at the same time
      const rA = await service.createTimeEvent(ctx(), {
        employeeId: empA,
        eventType: "clock_in",
        eventTime: new Date("2026-03-05T09:00:00Z").toISOString(),
      });
      const rB = await service.createTimeEvent(ctx(), {
        employeeId: empB,
        eventType: "clock_in",
        eventTime: new Date("2026-03-05T09:00:00Z").toISOString(),
      });

      expect(rA.success).toBe(true);
      expect(rB.success).toBe(true);

      // Employee A goes on break, Employee B clocks out
      const rA2 = await service.createTimeEvent(ctx(), {
        employeeId: empA,
        eventType: "break_start",
        eventTime: new Date("2026-03-05T12:00:00Z").toISOString(),
      });
      const rB2 = await service.createTimeEvent(ctx(), {
        employeeId: empB,
        eventType: "clock_out",
        eventTime: new Date("2026-03-05T12:00:00Z").toISOString(),
      });

      expect(rA2.success).toBe(true);
      expect(rB2.success).toBe(true);

      // Employee B clocking in again should work even though A is on break
      const rB3 = await service.createTimeEvent(ctx(), {
        employeeId: empB,
        eventType: "clock_in",
        eventTime: new Date("2026-03-05T13:00:00Z").toISOString(),
      });
      expect(rB3.success).toBe(true);
    });
  });

  // ==========================================================================
  // Stats
  // ==========================================================================

  describe("Stats", () => {
    it("should return statistics with all numeric fields", async () => {
      if (skip) return;

      const stats = await service.getStats(ctx());
      expect(stats).toBeDefined();
      expect(typeof stats.pendingApprovals).toBe("number");
      expect(typeof stats.totalHoursThisWeek).toBe("number");
      expect(typeof stats.overtimeHoursThisWeek).toBe("number");
      expect(typeof stats.activeEmployees).toBe("number");
    });

    it("should reflect active employees count", async () => {
      if (skip) return;

      const stats = await service.getStats(ctx());
      // We created at least 1 active employee
      expect(stats.activeEmployees).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Schedule Assignments and Stats
  // ==========================================================================

  describe("Schedule Assignments", () => {
    it("should return schedule assignments data", async () => {
      if (skip) return;

      const result = await service.getScheduleAssignments(ctx());
      expect(result).toBeDefined();
      expect(result.assignments).toBeDefined();
      expect(Array.isArray(result.assignments)).toBe(true);
      expect(typeof result.count).toBe("number");
    });
  });
});
