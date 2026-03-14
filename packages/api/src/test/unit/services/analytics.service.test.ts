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
        team_headcount: 12,
        pending_approvals: 3,
        team_attendance_rate: 95.0,
        team_on_leave_today: 1,
        upcoming_reviews: 5,
        overdue_timesheets: 0,
      })
    ),
    // Diversity Analytics
    getDiversityByGender: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { gender: "male", count: 70 },
        { gender: "female", count: 55 },
        { gender: "not_specified", count: 5 },
      ])
    ),
    getDiversityByAgeBand: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { age_band: "Under 25", count: 15 },
        { age_band: "25-34", count: 45 },
        { age_band: "35-44", count: 40 },
        { age_band: "45-54", count: 20 },
        { age_band: "55-64", count: 10 },
      ])
    ),
    getDiversityByNationality: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { nationality: "British", count: 80 },
        { nationality: "Polish", count: 20 },
        { nationality: "Indian", count: 15 },
        { nationality: "Unknown", count: 15 },
      ])
    ),
    getDiversityByDepartment: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { org_unit_id: "ou1", org_unit_name: "Engineering", gender: "male", count: 30 },
        { org_unit_id: "ou1", org_unit_name: "Engineering", gender: "female", count: 15 },
        { org_unit_id: "ou2", org_unit_name: "HR", gender: "male", count: 5 },
        { org_unit_id: "ou2", org_unit_name: "HR", gender: "female", count: 10 },
      ])
    ),
    // Compensation Analytics
    getCompensationSummary: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve({
        total_employees: 100,
        avg_salary: 45000,
        median_salary: 42000,
        min_salary: 22000,
        max_salary: 95000,
        total_payroll: 4500000,
        currency: "GBP",
      })
    ),
    getCompensationByBand: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { band: "Under £25k", count: 10, avg_salary: 22000 },
        { band: "£25k-£35k", count: 25, avg_salary: 30000 },
        { band: "£35k-£50k", count: 35, avg_salary: 42000 },
        { band: "£50k-£75k", count: 20, avg_salary: 60000 },
        { band: "£75k-£100k", count: 10, avg_salary: 85000 },
      ])
    ),
    getCompensationByDepartment: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { org_unit_id: "ou1", org_unit_name: "Engineering", headcount: 50, avg_salary: 55000, min_salary: 30000, max_salary: 95000, total_payroll: 2750000 },
        { org_unit_id: "ou2", org_unit_name: "HR", headcount: 15, avg_salary: 38000, min_salary: 25000, max_salary: 60000, total_payroll: 570000 },
      ])
    ),
    getRecentCompensationChanges: mock((_ctx: unknown, _filters: unknown) =>
      Promise.resolve([
        { change_reason: "merit", count: 40, avg_change_percentage: 3.5 },
        { change_reason: "promotion", count: 12, avg_change_percentage: 8.2 },
        { change_reason: "market", count: 5, avg_change_percentage: 5.0 },
      ])
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
        const filters = { org_unit_id: "ou1" };
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
        expect(result.data?.team_headcount).toBeDefined();
        expect(result.data?.pending_approvals).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Diversity Analytics
  // ===========================================================================

  describe("Diversity Analytics", () => {
    describe("getDiversityDashboard", () => {
      it("should return diversity dashboard with all breakdowns", async () => {
        const result = await service.getDiversityDashboard(ctx);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data!.total_employees).toBe(130); // 70+55+5
        expect(result.data!.by_gender).toHaveLength(3);
        expect(result.data!.by_age_band).toHaveLength(5);
        expect(result.data!.by_nationality).toHaveLength(4);
        expect(result.data!.by_department).toHaveLength(2);
        expect(result.data!.as_of_date).toBeDefined();
      });

      it("should calculate gender percentages correctly", async () => {
        const result = await service.getDiversityDashboard(ctx);

        const male = result.data!.by_gender.find((g) => g.gender === "male");
        expect(male?.count).toBe(70);
        // 70/130 = 53.8%
        expect(male?.percentage).toBeCloseTo(53.8, 0);

        const female = result.data!.by_gender.find((g) => g.gender === "female");
        expect(female?.count).toBe(55);
        // 55/130 = 42.3%
        expect(female?.percentage).toBeCloseTo(42.3, 0);
      });

      it("should calculate age band percentages", async () => {
        const result = await service.getDiversityDashboard(ctx);

        const band2534 = result.data!.by_age_band.find((b) => b.age_band === "25-34");
        expect(band2534?.count).toBe(45);
        expect(band2534?.percentage).toBeGreaterThan(0);
      });

      it("should group department rows by org_unit with gender breakdown", async () => {
        const result = await service.getDiversityDashboard(ctx);

        const eng = result.data!.by_department.find((d) => d.org_unit_name === "Engineering");
        expect(eng).toBeDefined();
        expect(eng!.total).toBe(45); // 30 male + 15 female
        expect(eng!.gender_breakdown).toHaveLength(2);

        const engMale = eng!.gender_breakdown.find((g) => g.gender === "male");
        expect(engMale?.count).toBe(30);
        // 30/45 = 66.7%
        expect(engMale?.percentage).toBeCloseTo(66.7, 0);
      });

      it("should handle empty results gracefully", async () => {
        repository.getDiversityByGender = mock(() => Promise.resolve([]));
        repository.getDiversityByAgeBand = mock(() => Promise.resolve([]));
        repository.getDiversityByNationality = mock(() => Promise.resolve([]));
        repository.getDiversityByDepartment = mock(() => Promise.resolve([]));

        const result = await service.getDiversityDashboard(ctx);

        expect(result.success).toBe(true);
        expect(result.data!.total_employees).toBe(0);
        expect(result.data!.by_gender).toHaveLength(0);
        expect(result.data!.by_department).toHaveLength(0);
      });

      it("should pass filters to all repository calls", async () => {
        const filters = { org_unit_id: "ou1" };
        await service.getDiversityDashboard(ctx, filters);

        expect(repository.getDiversityByGender).toHaveBeenCalledWith(ctx, filters);
        expect(repository.getDiversityByAgeBand).toHaveBeenCalledWith(ctx, filters);
        expect(repository.getDiversityByNationality).toHaveBeenCalledWith(ctx, filters);
        expect(repository.getDiversityByDepartment).toHaveBeenCalledWith(ctx, filters);
      });
    });
  });

  // ===========================================================================
  // Compensation Analytics
  // ===========================================================================

  describe("Compensation Analytics", () => {
    describe("getCompensationDashboard", () => {
      it("should return compensation dashboard with all sections", async () => {
        const result = await service.getCompensationDashboard(ctx);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data!.summary).toBeDefined();
        expect(result.data!.by_band).toHaveLength(5);
        expect(result.data!.by_department).toHaveLength(2);
        expect(result.data!.recent_changes).toHaveLength(3);
      });

      it("should return correct summary values", async () => {
        const result = await service.getCompensationDashboard(ctx);

        expect(result.data!.summary.total_employees).toBe(100);
        expect(result.data!.summary.avg_salary).toBe(45000);
        expect(result.data!.summary.median_salary).toBe(42000);
        expect(result.data!.summary.currency).toBe("GBP");
      });

      it("should calculate band percentages correctly", async () => {
        const result = await service.getCompensationDashboard(ctx);

        // Total from bands: 10+25+35+20+10 = 100
        const band35to50 = result.data!.by_band.find((b) => b.band === "\u00a335k-\u00a350k");
        expect(band35to50?.count).toBe(35);
        expect(band35to50?.percentage).toBe(35); // 35/100 = 35%
        expect(band35to50?.avg_salary).toBe(42000);

        // Percentages should sum to 100
        const totalPct = result.data!.by_band.reduce((s, b) => s + b.percentage, 0);
        expect(totalPct).toBe(100);
      });

      it("should return department compensation breakdowns", async () => {
        const result = await service.getCompensationDashboard(ctx);

        const eng = result.data!.by_department.find((d) => d.org_unit_name === "Engineering");
        expect(eng?.headcount).toBe(50);
        expect(eng?.avg_salary).toBe(55000);
        expect(eng?.total_payroll).toBe(2750000);
      });

      it("should return recent compensation changes", async () => {
        const result = await service.getCompensationDashboard(ctx);

        const merit = result.data!.recent_changes.find((c) => c.change_reason === "merit");
        expect(merit?.count).toBe(40);
        expect(merit?.avg_change_percentage).toBe(3.5);

        const promo = result.data!.recent_changes.find((c) => c.change_reason === "promotion");
        expect(promo?.avg_change_percentage).toBe(8.2);
      });

      it("should handle empty results gracefully", async () => {
        repository.getCompensationSummary = mock(() =>
          Promise.resolve({
            total_employees: 0, avg_salary: 0, median_salary: 0,
            min_salary: 0, max_salary: 0, total_payroll: 0, currency: "GBP",
          })
        );
        repository.getCompensationByBand = mock(() => Promise.resolve([]));
        repository.getCompensationByDepartment = mock(() => Promise.resolve([]));
        repository.getRecentCompensationChanges = mock(() => Promise.resolve([]));

        const result = await service.getCompensationDashboard(ctx);

        expect(result.success).toBe(true);
        expect(result.data!.summary.total_employees).toBe(0);
        expect(result.data!.by_band).toHaveLength(0);
        expect(result.data!.by_department).toHaveLength(0);
        expect(result.data!.recent_changes).toHaveLength(0);
      });

      it("should pass filters to all repository calls", async () => {
        const filters = { org_unit_id: "ou1", currency: "USD" };
        await service.getCompensationDashboard(ctx, filters);

        expect(repository.getCompensationSummary).toHaveBeenCalledWith(ctx, filters);
        expect(repository.getCompensationByBand).toHaveBeenCalledWith(ctx, filters);
        expect(repository.getCompensationByDepartment).toHaveBeenCalledWith(ctx, filters);
        expect(repository.getRecentCompensationChanges).toHaveBeenCalledWith(ctx, filters);
      });
    });
  });
});
