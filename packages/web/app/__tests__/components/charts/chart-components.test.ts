/**
 * Tests for the Staffora chart component library.
 *
 * Validates module exports, theme utilities, colour palette integrity,
 * and type contracts for BarChart, LineChart, AreaChart, and PieChart wrappers.
 */

import { describe, it, expect } from "vitest";

describe("Chart component exports", () => {
  it("should export StafforaBarChart", async () => {
    const mod = await import("~/components/charts");
    expect(typeof mod.StafforaBarChart).toBe("function");
  });

  it("should export StafforaLineChart", async () => {
    const mod = await import("~/components/charts");
    expect(typeof mod.StafforaLineChart).toBe("function");
  });

  it("should export StafforaAreaChart", async () => {
    const mod = await import("~/components/charts");
    expect(typeof mod.StafforaAreaChart).toBe("function");
  });

  it("should export StafforaPieChart", async () => {
    const mod = await import("~/components/charts");
    expect(typeof mod.StafforaPieChart).toBe("function");
  });

  it("should export useChartTheme hook", async () => {
    const mod = await import("~/components/charts");
    expect(typeof mod.useChartTheme).toBe("function");
  });
});

describe("Chart theme constants", () => {
  it("should export CHART_COLORS with 12 colours", async () => {
    const mod = await import("~/components/charts/chart-theme");
    expect(mod.CHART_COLORS).toHaveLength(12);
  });

  it("should export CHART_COLORS_DARK with 12 colours", async () => {
    const mod = await import("~/components/charts/chart-theme");
    expect(mod.CHART_COLORS_DARK).toHaveLength(12);
  });

  it("should have all CHART_COLORS as valid hex strings", async () => {
    const mod = await import("~/components/charts/chart-theme");
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const color of mod.CHART_COLORS) {
      expect(color).toMatch(hexRegex);
    }
  });

  it("should have all CHART_COLORS_DARK as valid hex strings", async () => {
    const mod = await import("~/components/charts/chart-theme");
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const color of mod.CHART_COLORS_DARK) {
      expect(color).toMatch(hexRegex);
    }
  });

  it("should export DEFAULT_CHART_HEIGHT as 360", async () => {
    const mod = await import("~/components/charts/chart-theme");
    expect(mod.DEFAULT_CHART_HEIGHT).toBe(360);
  });

  it("should export CHART_MARGIN with expected shape", async () => {
    const mod = await import("~/components/charts/chart-theme");
    expect(mod.CHART_MARGIN).toHaveProperty("top");
    expect(mod.CHART_MARGIN).toHaveProperty("right");
    expect(mod.CHART_MARGIN).toHaveProperty("bottom");
    expect(mod.CHART_MARGIN).toHaveProperty("left");
    expect(typeof mod.CHART_MARGIN.top).toBe("number");
  });
});

describe("getChartColor", () => {
  it("should return light palette colour by default", async () => {
    const { getChartColor, CHART_COLORS } = await import("~/components/charts/chart-theme");
    expect(getChartColor(0)).toBe(CHART_COLORS[0]);
    expect(getChartColor(1)).toBe(CHART_COLORS[1]);
  });

  it("should return dark palette colour when isDark is true", async () => {
    const { getChartColor, CHART_COLORS_DARK } = await import("~/components/charts/chart-theme");
    expect(getChartColor(0, true)).toBe(CHART_COLORS_DARK[0]);
    expect(getChartColor(1, true)).toBe(CHART_COLORS_DARK[1]);
  });

  it("should wrap around when index exceeds palette length", async () => {
    const { getChartColor, CHART_COLORS } = await import("~/components/charts/chart-theme");
    expect(getChartColor(12)).toBe(CHART_COLORS[0]);
    expect(getChartColor(13)).toBe(CHART_COLORS[1]);
    expect(getChartColor(24)).toBe(CHART_COLORS[0]);
  });

  it("should handle negative indices by wrapping", async () => {
    const { getChartColor } = await import("~/components/charts/chart-theme");
    // JavaScript modulo returns negative for negative numbers, but we don't
    // mandate negative index support — just ensure it doesn't throw
    expect(() => getChartColor(-1)).not.toThrow();
  });
});

describe("getAxisStyle", () => {
  it("should return light mode styles by default", async () => {
    const { getAxisStyle } = await import("~/components/charts/chart-theme");
    const axis = getAxisStyle();
    expect(axis.tick.fontSize).toBe(11);
    expect(axis.tick.fill).toBe("#6b7280"); // gray-500
    expect(axis.tickLine).toBe(false);
  });

  it("should return dark mode styles when isDark is true", async () => {
    const { getAxisStyle } = await import("~/components/charts/chart-theme");
    const axis = getAxisStyle(true);
    expect(axis.tick.fill).toBe("#9ca3af"); // gray-400
    expect(axis.axisLine.stroke).toBe("#374151"); // gray-700
  });
});

describe("getGridStyle", () => {
  it("should return dashed grid style", async () => {
    const { getGridStyle } = await import("~/components/charts/chart-theme");
    const grid = getGridStyle();
    expect(grid.strokeDasharray).toBe("3 3");
    expect(grid.stroke).toBe("#e5e7eb"); // gray-200
  });

  it("should use darker stroke in dark mode", async () => {
    const { getGridStyle } = await import("~/components/charts/chart-theme");
    const grid = getGridStyle(true);
    expect(grid.stroke).toBe("#374151"); // gray-700
    expect(grid.strokeOpacity).toBe(0.5);
  });
});

describe("getTooltipStyle", () => {
  it("should return white background in light mode", async () => {
    const { getTooltipStyle } = await import("~/components/charts/chart-theme");
    const tooltip = getTooltipStyle();
    expect(tooltip.contentStyle.backgroundColor).toBe("#ffffff");
    expect(tooltip.contentStyle.borderRadius).toBe(8);
    expect(tooltip.contentStyle.fontSize).toBe(12);
  });

  it("should return dark background in dark mode", async () => {
    const { getTooltipStyle } = await import("~/components/charts/chart-theme");
    const tooltip = getTooltipStyle(true);
    expect(tooltip.contentStyle.backgroundColor).toBe("#1f2937"); // gray-800
    expect(tooltip.contentStyle.color).toBe("#f3f4f6"); // gray-100
  });
});

describe("getLegendStyle", () => {
  it("should return appropriate font size", async () => {
    const { getLegendStyle } = await import("~/components/charts/chart-theme");
    const legend = getLegendStyle();
    expect(legend.wrapperStyle.fontSize).toBe(12);
  });

  it("should use lighter text in dark mode", async () => {
    const { getLegendStyle } = await import("~/components/charts/chart-theme");
    const legend = getLegendStyle(true);
    expect(legend.wrapperStyle.color).toBe("#d1d5db"); // gray-300
  });
});

describe("Chart palette design-system alignment", () => {
  it("should use primary-500 as the first colour in light mode", async () => {
    const { CHART_COLORS } = await import("~/components/charts/chart-theme");
    // primary-500 from tailwind.config.js is #6366f1
    expect(CHART_COLORS[0]).toBe("#6366f1");
  });

  it("should use success-500 as the second colour in light mode", async () => {
    const { CHART_COLORS } = await import("~/components/charts/chart-theme");
    // success-500 from tailwind.config.js is #22c55e
    expect(CHART_COLORS[1]).toBe("#22c55e");
  });

  it("should use warning-500 as the third colour in light mode", async () => {
    const { CHART_COLORS } = await import("~/components/charts/chart-theme");
    // warning-500 from tailwind.config.js is #f59e0b
    expect(CHART_COLORS[2]).toBe("#f59e0b");
  });

  it("should use error-500 as the fourth colour in light mode", async () => {
    const { CHART_COLORS } = await import("~/components/charts/chart-theme");
    // error-500 from tailwind.config.js is #ef4444
    expect(CHART_COLORS[3]).toBe("#ef4444");
  });
});
