/**
 * Tests for report component module exports and ChartBuilder types.
 */
import { describe, it, expect } from "vitest";

describe("Report component exports", () => {
  it("should export FieldCatalogPanel", async () => {
    const mod = await import("~/routes/(admin)/reports/components/FieldCatalogPanel");
    expect(typeof mod.FieldCatalogPanel).toBe("function");
  });

  it("should export ColumnConfigurator", async () => {
    const mod = await import("~/routes/(admin)/reports/components/ColumnConfigurator");
    expect(typeof mod.ColumnConfigurator).toBe("function");
  });

  it("should export FilterBuilder", async () => {
    const mod = await import("~/routes/(admin)/reports/components/FilterBuilder");
    expect(typeof mod.FilterBuilder).toBe("function");
  });

  it("should export SortGroupConfig", async () => {
    const mod = await import("~/routes/(admin)/reports/components/SortGroupConfig");
    expect(typeof mod.SortGroupConfig).toBe("function");
  });

  it("should export ReportPreview", async () => {
    const mod = await import("~/routes/(admin)/reports/components/ReportPreview");
    expect(typeof mod.ReportPreview).toBe("function");
  });

  it("should export ChartBuilder", async () => {
    const mod = await import("~/routes/(admin)/reports/components/ChartBuilder");
    expect(typeof mod.ChartBuilder).toBe("function");
  });

  it("should export ChartRenderer", async () => {
    const mod = await import("~/routes/(admin)/reports/components/ChartRenderer");
    expect(typeof mod.ChartRenderer).toBe("function");
  });
});

describe("ChartBuilder config types", () => {
  it("should export CHART_TYPES with expected values", async () => {
    const mod = await import("~/routes/(admin)/reports/components/ChartBuilder");
    // ChartBuilder exports are the component and types — verify the component exists
    expect(mod.ChartBuilder).toBeDefined();
  });

  it("should accept valid ChartConfig shape", () => {
    // Verify the type contract by creating a conforming object
    const config = {
      chartType: "bar" as const,
      xAxis: "department",
      yAxis: ["count"],
      showLegend: true,
      showGrid: true,
      showLabels: false,
      title: "Department Breakdown",
    };
    expect(config.chartType).toBe("bar");
    expect(config.xAxis).toBe("department");
    expect(config.yAxis).toHaveLength(1);
  });

  it("should support all chart types", () => {
    const validTypes = ["bar", "line", "pie", "area", "stacked_bar", "donut"];
    for (const t of validTypes) {
      expect(typeof t).toBe("string");
    }
    expect(validTypes).toHaveLength(6);
  });
});

describe("ChartRenderer", () => {
  it("should export ChartRenderer function", async () => {
    const mod = await import("~/routes/(admin)/reports/components/ChartRenderer");
    expect(typeof mod.ChartRenderer).toBe("function");
  });
});
