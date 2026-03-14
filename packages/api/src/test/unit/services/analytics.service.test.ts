/**
 * Analytics Service Unit Tests
 *
 * Tests for Analytics and Reporting business logic including:
 * - Headcount analytics (summary, by department, trend)
 * - Turnover analytics (summary, by department, by reason)
 * - Leave analytics
 * - Recruitment analytics
 * - Dashboard aggregations (executive, manager)
 * - Numeric coercion safety
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AnalyticsService } from "../../../modules/analytics/service";
import type { AnalyticsRepository } from "../../../modules/analytics/repository";
import type { DatabaseClient } from "../../../plugins/db";
import { createMockTenantContext } from "../../helpers/mocks";

// =============================================================================
// Mock Repository Factory
// =============================================================================

function createMockAnalyticsRepository() {
  return {
    getHeadcountSummary: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve({
        total_employees: "150",
        active_employees: "130",
        on_leave_employees: "10",
        pending_employees: "5",
        terminated_employees: "5",
        as_of_date: "2024-03-01",
      })
    ),
    getHeadcountByDepartment: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { org_unit_id: "ou1", org_unit_name: "Engineering", headcount: "50" },
        { org_unit_id: "ou2", org_unit_name: "Sales", headcount: "30" },
        { org_unit_id: "ou3", org_unit_name: "HR", headcount: "20" },
      ])
    ),
    getHeadcountTrend: mock((_ctx: unknown, _start: string, _end: string, _period: string) =>
      Promise.resolve([
        { period: "2024-01", headcount: "145", new_hires: "10", terminations: "5", net_change: "5" },
        { period: "2024-02", headcount: "150", new_hires: "8", terminations: "3", net_change: "5" },
      ])
    ),
    getTurnoverSummary: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve({
        total_terminations: "15",
        voluntary_terminations: "10",
        involuntary_terminations: "5",
        turnover_rate: "10.5",
        avg_tenure_months: "24",
        period: "2024-Q1",
      })
    ),
    getTurnoverByDepartment: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { org_unit_id: "ou1", org_unit_name: "Engineering", terminations: "5", turnover_rate: "10" },
        { org_unit_id: "ou2", org_unit_name: "Sales", terminations: "8", turnover_rate: "15" },
      ])
    ),
    getTurnoverByReason: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { reason: "better_opportunity", count: "6" },
        { reason: "relocation", count: "3" },
        { reason: "performance", count: "2" },
      ])
    ),
    getAttendanceSummary: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve({
        total_days: 2000,
        present_days: 1800,
        absent_days: 100,
        late_days: 50,
        attendance_rate: 90,
      })
    ),
    getLeaveSummary: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve({
        total_requests: "120",
        approved_requests: "100",
        pending_requests: "10",
        rejected_requests: "10",
        total_days_taken: "250",
        avg_days_per_request: "2.5",
        period: "2024-Q1",
      })
    ),
    getLeaveByType: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { leave_type_id: "lt1", leave_type_name: "Annual Leave", requests_count: "60", days_taken: "120" },
        { leave_type_id: "lt2", leave_type_name: "Sick Leave", requests_count: "40", days_taken: "80" },
      ])
    ),
    getRecruitmentSummary: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve({
        open_requisitions: 10,
        total_candidates: 150,
        avg_time_to_fill: 30,
        offer_acceptance_rate: 85,
      })
    ),
    getExecutiveDashboard: mock((_ctx: unknown) =>
      Promise.resolve({
        headcount: { total: 150, active: 130 },
        turnover: { rate: 10.5 },
        recruitment: { openPositions: 10 },
        compliance: { overdue: 3 },
      })
    ),
    getManagerDashboard: mock((_ctx: unknown) =>
      Promise.resolve({
        teamSize: 12,
        pendingApprovals: 3,
        openCases: 2,
        upcomingReviews: 5,
      })
    ),
  };
}

function createMockDb() {
  return {
    withTransaction: mock((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("AnalyticsService", () => {
  let service: AnalyticsService;
  let repository: ReturnType<typeof createMockAnalyticsRepository>;
  let db: ReturnType<typeof createMockDb>;
  let ctx: { tenantId: string; userId: string };

  beforeEach(() => {
    repository = createMockAnalyticsRepository();
    db = createMockDb();
    service = new AnalyticsService(repository as unknown as AnalyticsRepository, db as unknown as DatabaseClient);
    ctx = createMockTenantContext();
  });

  // ===========================================================================
  // Headcount Analytics
  // ===========================================================================

  describe("Headcount Analytics", () => {
    describe("getHeadcountSummary", () => {
      it("should return headcount summary with proper numeric coercion", async () => {
        const result = await service.getHeadcountSummary(ctx);

        expect(result.success).toBe(true);
        expect(result.data?.total_employees).toBe(150);
        expect(result.data?.active_employees).toBe(130);
        expect(result.data?.on_leave_employees).toBe(10);
        expect(result.data?.pending_employees).toBe(5);
        expect(result.data?.terminated_employees).toBe(5);
        expect(typeof result.data?.total_employees).toBe("number");
      });

      it("should default to 0 for null/undefined values", async () => {
        repository.getHeadcountSummary = mock(() =>
          Promise.resolve({
            total_employees: null,
            active_employees: undefined,
            on_leave_employees: null,
            pending_employees: null,
            terminated_employees: null,
            as_of_date: "2024-01-01",
          })
        );

        const result = await service.getHeadcountSummary(ctx);

        expect(result.data?.total_employees).toBe(0);
        expect(result.data?.active_employees).toBe(0);
      });

      it("should pass filters to repository", async () => {
        const filters = { orgUnitId: "ou1" };
        await service.getHeadcountSummary(ctx, filters);

        expect(repository.getHeadcountSummary).toHaveBeenCalledWith(ctx, filters);
      });
    });

    describe("getHeadcountByDepartment", () => {
      it("should return departments with percentage calculation", async () => {
        const result = await service.getHeadcountByDepartment(ctx);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(3);

        // Engineering: 50/100 = 50%
        const eng = result.data?.find((d) => d.org_unit_name === "Engineering");
        expect(eng?.headcount).toBe(50);
        expect(eng?.percentage).toBe(50);

        // Percentages should sum to 100
        const totalPct = result.data?.reduce((sum, d) => sum + d.percentage, 0) ?? 0;
        expect(totalPct).toBe(100);
      });

      it("should handle zero total gracefully", async () => {
        repository.getHeadcountByDepartment = mock(() => Promise.resolve([]));

        const result = await service.getHeadcountByDepartment(ctx);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(0);
      });
    });

    describe("getHeadcountTrend", () => {
      it("should return trend data with proper numeric conversion", async () => {
        const result = await service.getHeadcountTrend(ctx, "2024-01-01", "2024-03-31");

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data?.[0].headcount).toBe(145);
        expect(result.data?.[0].new_hires).toBe(10);
        expect(result.data?.[0].net_change).toBe(5);
        expect(typeof result.data?.[0].headcount).toBe("number");
      });
    });
  });

  // ===========================================================================
  // Turnover Analytics
  // ===========================================================================

  describe("Turnover Analytics", () => {
    describe("getTurnoverSummary", () => {
      it("should return turnover metrics with numeric coercion", async () => {
        const result = await service.getTurnoverSummary(ctx, {
          start_date: "2024-01-01",
          end_date: "2024-03-31",
        });

        expect(result.success).toBe(true);
        expect(result.data?.total_terminations).toBe(15);
        expect(result.data?.voluntary_terminations).toBe(10);
        expect(result.data?.involuntary_terminations).toBe(5);
        expect(result.data?.turnover_rate).toBe(10.5);
        expect(result.data?.avg_tenure_months).toBe(24);
      });
    });

    describe("getTurnoverByDepartment", () => {
      it("should return turnover broken down by department", async () => {
        const result = await service.getTurnoverByDepartment(ctx, {
          start_date: "2024-01-01",
          end_date: "2024-03-31",
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data?.[0].org_unit_name).toBe("Engineering");
      });
    });

    describe("getTurnoverByReason", () => {
      it("should return reasons with percentage calculation", async () => {
        const result = await service.getTurnoverByReason(ctx, {
          start_date: "2024-01-01",
          end_date: "2024-03-31",
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(3);

        // better_opportunity: 6/11 = 54.5%
        const topReason = result.data?.find((d) => d.reason === "better_opportunity");
        expect(topReason?.count).toBe(6);
        expect(topReason?.percentage).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // Leave Analytics
  // ===========================================================================

  describe("Leave Analytics", () => {
    describe("getLeaveSummary", () => {
      it("should return leave summary with proper types", async () => {
        const result = await service.getLeaveSummary(ctx, {
          start_date: "2024-01-01",
          end_date: "2024-03-31",
        });

        expect(result.success).toBe(true);
        expect(result.data?.total_requests).toBe(120);
        expect(result.data?.approved_requests).toBe(100);
        expect(result.data?.total_days_taken).toBe(250);
        expect(typeof result.data?.avg_days_per_request).toBe("number");
      });
    });

    describe("getLeaveByType", () => {
      it("should return leave types with percentages", async () => {
        const result = await service.getLeaveByType(ctx, {
          start_date: "2024-01-01",
          end_date: "2024-03-31",
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);

        const annualLeave = result.data?.find((d) => d.leave_type_name === "Annual Leave");
        expect(annualLeave?.days_taken).toBe(120);
        expect(annualLeave?.percentage).toBe(60); // 120 / 200 * 100
      });
    });
  });

  // ===========================================================================
  // Attendance Analytics
  // ===========================================================================

  describe("Attendance Analytics", () => {
    it("should return attendance summary", async () => {
      const result = await service.getAttendanceSummary(ctx, {
        start_date: "2024-01-01",
        end_date: "2024-03-31",
      });

      expect(result.success).toBe(true);
      expect(result.data?.attendance_rate).toBe(90);
    });
  });

  // ===========================================================================
  // Recruitment Analytics
  // ===========================================================================

  describe("Recruitment Analytics", () => {
    it("should return recruitment summary", async () => {
      const result = await service.getRecruitmentSummary(ctx, {
        start_date: "2024-01-01",
        end_date: "2024-03-31",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  // ===========================================================================
  // Dashboard Aggregations
  // ===========================================================================

  describe("Dashboard Aggregations", () => {
    describe("getExecutiveDashboard", () => {
      it("should return executive dashboard data", async () => {
        const result = await service.getExecutiveDashboard(ctx);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.headcount).toBeDefined();
        expect(result.data?.turnover).toBeDefined();
      });
    });

    describe("getManagerDashboard", () => {
      it("should return manager dashboard data", async () => {
        const result = await service.getManagerDashboard(ctx);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.teamSize).toBe(12);
        expect(result.data?.pendingApprovals).toBe(3);
      });
    });
  });
});
