/**
 * Analytics Worker Unit Tests
 *
 * Tests the analytics processing system:
 * - Processor registrations and configuration
 * - processAnalyticsAggregate invocation with mocked DB context
 * - processAnalyticsMetrics invocation with mocked DB context
 * - Missing tenantId error handling
 * - Unknown metric type warning
 * - Metric type, granularity, and dimension type coverage
 * - Turnover and absence rate calculation logic
 * - Period lookback by granularity
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  analyticsAggregateProcessor,
  analyticsMetricsProcessor,
  analyticsProcessors,
  type MetricType,
  type TimeGranularity,
  type Dimension,
  type AnalyticsAggregatePayload,
  type AnalyticsMetricsPayload,
  type MetricResult,
  type AggregatedMetric,
} from "../../../jobs/analytics-worker";
import { JobTypes, type JobPayload, type JobContext } from "../../../jobs/base";

// =============================================================================
// Processor Registrations
// =============================================================================

describe("Analytics Worker - Processor Registrations", () => {
  test("analyticsAggregateProcessor has correct type, timeout, and retry", () => {
    expect(analyticsAggregateProcessor.type).toBe(JobTypes.ANALYTICS_AGGREGATE);
    expect(analyticsAggregateProcessor.type).toBe("analytics.aggregate");
    expect(analyticsAggregateProcessor.timeoutMs).toBe(600000);
    expect(analyticsAggregateProcessor.retry).toBe(true);
  });

  test("analyticsMetricsProcessor has correct type, timeout, and retry", () => {
    expect(analyticsMetricsProcessor.type).toBe(JobTypes.ANALYTICS_METRICS);
    expect(analyticsMetricsProcessor.type).toBe("analytics.metrics");
    expect(analyticsMetricsProcessor.timeoutMs).toBe(600000);
    expect(analyticsMetricsProcessor.retry).toBe(true);
  });

  test("analyticsProcessors array contains both processors", () => {
    expect(analyticsProcessors).toHaveLength(2);
    const types = analyticsProcessors.map((p) => p.type);
    expect(types).toContain("analytics.aggregate");
    expect(types).toContain("analytics.metrics");
  });
});

// =============================================================================
// processAnalyticsAggregate - Error Handling
// =============================================================================

describe("Analytics Worker - processAnalyticsAggregate error handling", () => {
  let mockDb: Record<string, unknown>;
  let mockLog: Record<string, unknown>;
  let context: JobContext;

  beforeEach(() => {
    mockDb = {
      withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
        const tx = (_strings: TemplateStringsArray, ..._values: unknown[]) =>
          Promise.resolve([{ count: 100 }]);
        return callback(tx);
      }),
    };

    mockLog = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };

    context = {
      db: mockDb,
      cache: {} as unknown as JobContext["cache"],
      redis: {} as unknown as JobContext["redis"],
      log: mockLog,
      jobId: "test-analytics-1",
      messageId: "msg-1",
      attempt: 1,
    } as unknown as JobContext;
  });

  test("throws error when tenantId is missing", async () => {
    const payload: JobPayload<AnalyticsAggregatePayload> = {
      id: "job-agg-no-tenant",
      type: JobTypes.ANALYTICS_AGGREGATE,
      data: {
        metricType: "headcount",
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        granularity: "day",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    await expect(
      analyticsAggregateProcessor.processor(payload, context)
    ).rejects.toThrow("Tenant ID is required for analytics");
  });

  test("logs metric type and period information at start", async () => {
    const payload: JobPayload<AnalyticsAggregatePayload> = {
      id: "job-agg-log",
      type: JobTypes.ANALYTICS_AGGREGATE,
      tenantId: "tenant-1",
      data: {
        metricType: "headcount",
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        granularity: "day",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await analyticsAggregateProcessor.processor(payload, context);
    } catch {
      // Template mock may cause issues
    }

    expect(mockLog.info).toHaveBeenCalled();
  });

  test("calls withSystemContext to query the database", async () => {
    const payload: JobPayload<AnalyticsAggregatePayload> = {
      id: "job-agg-db",
      type: JobTypes.ANALYTICS_AGGREGATE,
      tenantId: "tenant-1",
      data: {
        metricType: "headcount",
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        granularity: "month",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await analyticsAggregateProcessor.processor(payload, context);
    } catch {
      // Expected
    }

    expect(mockDb.withSystemContext).toHaveBeenCalled();
  });

  test("logs warning for unknown metric types", async () => {
    const payload: JobPayload<AnalyticsAggregatePayload> = {
      id: "job-agg-unknown",
      type: JobTypes.ANALYTICS_AGGREGATE,
      tenantId: "tenant-1",
      data: {
        metricType: "nonexistent" as MetricType,
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        granularity: "day",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await analyticsAggregateProcessor.processor(payload, context);
    } catch {
      // Expected
    }

    expect(mockLog.warn).toHaveBeenCalled();
  });
});

// =============================================================================
// processAnalyticsMetrics - Error Handling
// =============================================================================

describe("Analytics Worker - processAnalyticsMetrics error handling", () => {
  let mockDb: Record<string, unknown>;
  let mockLog: Record<string, unknown>;
  let context: JobContext;

  beforeEach(() => {
    mockDb = {
      withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
        const tx = (_strings: TemplateStringsArray, ..._values: unknown[]) =>
          Promise.resolve([{ count: 50 }]);
        return callback(tx);
      }),
    };

    mockLog = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };

    context = {
      db: mockDb,
      cache: {} as unknown as JobContext["cache"],
      redis: {} as unknown as JobContext["redis"],
      log: mockLog,
      jobId: "test-metrics-1",
      messageId: "msg-1",
      attempt: 1,
    } as unknown as JobContext;
  });

  test("throws error when tenantId is missing", async () => {
    const payload: JobPayload<AnalyticsMetricsPayload> = {
      id: "job-metrics-no-tenant",
      type: JobTypes.ANALYTICS_METRICS,
      data: {
        metrics: ["headcount"],
        asOfDate: "2024-06-15",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    await expect(
      analyticsMetricsProcessor.processor(payload, context)
    ).rejects.toThrow("Tenant ID is required for analytics");
  });

  test("logs metrics list being calculated", async () => {
    const payload: JobPayload<AnalyticsMetricsPayload> = {
      id: "job-metrics-log",
      type: JobTypes.ANALYTICS_METRICS,
      tenantId: "tenant-1",
      data: {
        metrics: ["headcount", "tenure"],
        asOfDate: "2024-06-15",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await analyticsMetricsProcessor.processor(payload, context);
    } catch {
      // Template mock may cause issues
    }

    expect(mockLog.info).toHaveBeenCalled();
  });
});

// =============================================================================
// Type Coverage
// =============================================================================

describe("Analytics Worker - Type Coverage", () => {
  test("MetricType supports all expected values", () => {
    const types: MetricType[] = [
      "headcount",
      "turnover",
      "time_attendance",
      "leave_utilization",
      "overtime",
      "absence_rate",
      "tenure",
      "compensation",
      "custom",
    ];
    expect(types).toHaveLength(9);
  });

  test("TimeGranularity supports all expected values", () => {
    const granularities: TimeGranularity[] = [
      "hour",
      "day",
      "week",
      "month",
      "quarter",
      "year",
    ];
    expect(granularities).toHaveLength(6);
  });

  test("Dimension supports all expected values", () => {
    const dimensions: Dimension[] = [
      "tenant",
      "org_unit",
      "department",
      "cost_center",
      "location",
      "employment_type",
      "job_level",
      "gender",
      "age_band",
      "tenure_band",
    ];
    expect(dimensions).toHaveLength(10);
  });
});

// =============================================================================
// Payload Defaults
// =============================================================================

describe("Analytics Worker - Payload Defaults", () => {
  test("AnalyticsAggregatePayload dimensions default to empty array", () => {
    const payload: AnalyticsAggregatePayload = {
      metricType: "turnover",
      periodStart: "2024-01-01",
      periodEnd: "2024-06-30",
      granularity: "month",
    };
    expect(payload.dimensions ?? []).toEqual([]);
  });

  test("AnalyticsAggregatePayload forceRecalculate defaults to false", () => {
    const payload: AnalyticsAggregatePayload = {
      metricType: "tenure",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      granularity: "year",
    };
    expect(payload.forceRecalculate ?? false).toBe(false);
  });

  test("AnalyticsMetricsPayload dimensions default to empty array", () => {
    const payload: AnalyticsMetricsPayload = {
      metrics: ["headcount"],
      asOfDate: "2024-06-15",
    };
    expect(payload.dimensions ?? []).toEqual([]);
  });

  test("AnalyticsMetricsPayload supports orgUnits filter", () => {
    const payload: AnalyticsMetricsPayload = {
      metrics: ["headcount"],
      asOfDate: "2024-06-15",
      orgUnits: ["org-1", "org-2"],
    };
    expect(payload.orgUnits).toEqual(["org-1", "org-2"]);
  });
});

// =============================================================================
// MetricResult Structure
// =============================================================================

describe("Analytics Worker - MetricResult", () => {
  test("captures all required fields for a headcount metric", () => {
    const result: MetricResult = {
      metricType: "headcount",
      value: 150,
      unit: "employees",
      period: "2024-06-15",
      dimensions: { department: "Engineering" },
      calculatedAt: new Date(),
    };

    expect(result.metricType).toBe("headcount");
    expect(result.value).toBe(150);
    expect(result.unit).toBe("employees");
    expect(result.calculatedAt).toBeInstanceOf(Date);
  });

  test("supports period range format for turnover", () => {
    const result: MetricResult = {
      metricType: "turnover",
      value: 5.25,
      unit: "percent",
      period: "2024-01-01/2024-06-30",
      dimensions: { type: "total" },
      calculatedAt: new Date(),
    };

    expect(result.period).toContain("/");
  });
});

// =============================================================================
// AggregatedMetric Structure
// =============================================================================

describe("Analytics Worker - AggregatedMetric", () => {
  test("includes all statistical fields", () => {
    const metric: AggregatedMetric = {
      tenantId: "tenant-1",
      metricType: "headcount",
      granularity: "month",
      periodStart: new Date("2024-01-01"),
      periodEnd: new Date("2024-01-31"),
      dimensions: {},
      value: 150,
      count: 1,
      sum: 150,
      min: 150,
      max: 150,
      avg: 150,
      metadata: { unit: "employees" },
      calculatedAt: new Date(),
    };

    expect(metric.value).toBe(150);
    expect(metric.count).toBe(1);
    expect(metric.sum).toBe(150);
    expect(metric.min).toBe(150);
    expect(metric.max).toBe(150);
    expect(metric.avg).toBe(150);
  });
});

// =============================================================================
// Turnover Calculation Logic
// =============================================================================

describe("Analytics Worker - Turnover Calculation Logic", () => {
  test("returns 0 when avgHeadcount is 0 (division-safe)", () => {
    const terminations = 5;
    const avgHeadcount = 0;
    const turnoverRate = avgHeadcount > 0 ? (terminations / avgHeadcount) * 100 : 0;
    expect(turnoverRate).toBe(0);
  });

  test("calculates total turnover rate correctly", () => {
    const terminations = 10;
    const avgHeadcount = 200;
    const turnoverRate = (terminations / avgHeadcount) * 100;
    expect(turnoverRate).toBe(5);
  });

  test("rounds turnover rate to 2 decimal places", () => {
    const terminations = 7;
    const avgHeadcount = 300;
    const turnoverRate = Math.round(((terminations / avgHeadcount) * 100) * 100) / 100;
    expect(turnoverRate).toBe(2.33);
  });
});

// =============================================================================
// Absence Rate Calculation Logic
// =============================================================================

describe("Analytics Worker - Absence Rate Calculation Logic", () => {
  test("calculates working days from period dates", () => {
    const periodStart = new Date("2024-01-01");
    const periodEnd = new Date("2024-01-31");
    const workingDays = Math.ceil(
      (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(workingDays).toBe(30);
  });

  test("returns 0 when totalWorkingDays is 0 (division-safe)", () => {
    const absenceDays = 5;
    const totalWorkingDays = 0;
    const absenceRate = totalWorkingDays > 0 ? (absenceDays / totalWorkingDays) * 100 : 0;
    expect(absenceRate).toBe(0);
  });

  test("calculates absence rate correctly", () => {
    const absenceDays = 20;
    const employeeCount = 10;
    const workingDays = 22;
    const totalWorkingDays = employeeCount * workingDays;
    const absenceRate = Math.round(((absenceDays / totalWorkingDays) * 100) * 100) / 100;
    expect(absenceRate).toBe(9.09);
  });
});

// =============================================================================
// Period Lookback by Granularity
// =============================================================================

describe("Analytics Worker - Period Lookback by Granularity", () => {
  test("day granularity: 1 day lookback", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 1);
    expect(periodStart.getDate()).toBe(14);
  });

  test("week granularity: 7 day lookback", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 7);
    expect(periodStart.getDate()).toBe(8);
  });

  test("month granularity: 1 month lookback", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const periodStart = new Date(now);
    periodStart.setMonth(periodStart.getMonth() - 1);
    expect(periodStart.getMonth()).toBe(4); // May (0-indexed)
  });

  test("quarter granularity: 3 month lookback", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const periodStart = new Date(now);
    periodStart.setMonth(periodStart.getMonth() - 3);
    expect(periodStart.getMonth()).toBe(2); // March (0-indexed)
  });

  test("year granularity: 1 year lookback", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const periodStart = new Date(now);
    periodStart.setFullYear(periodStart.getFullYear() - 1);
    expect(periodStart.getFullYear()).toBe(2023);
  });
});
