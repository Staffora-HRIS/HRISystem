/**
 * ChartRenderer — Renders charts using the reusable Staffora chart components
 * based on ChartConfig and report data.
 *
 * This component acts as a bridge between the report module's ChartConfig type
 * and the generic chart components in ~/components/charts/.
 */

import { useMemo } from "react";
import {
  StafforaBarChart,
  StafforaLineChart,
  StafforaAreaChart,
  StafforaPieChart,
} from "~/components/charts";
import type { ChartConfig } from "./ChartBuilder";

interface ChartRendererProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
  columnLabels: Map<string, string>;
}

export function ChartRenderer({ config, data, columnLabels }: ChartRendererProps) {
  const { chartType, xAxis, yAxis, showLegend, showGrid, showLabels, title, palette } = config;

  // Build seriesLabels from the columnLabels map
  const seriesLabels = useMemo(() => {
    if (!yAxis) return undefined;
    const labels: Record<string, string> = {};
    for (const key of yAxis) {
      labels[key] = columnLabels.get(key) ?? key;
    }
    return labels;
  }, [yAxis, columnLabels]);

  // Transform data for pie/donut charts — aggregate by segment field
  const pieData = useMemo(() => {
    if ((chartType !== "pie" && chartType !== "donut") || !xAxis || !yAxis?.length) return [];
    const yField = yAxis[0];
    const grouped = new Map<string, number>();
    for (const row of data) {
      const key = String(row[xAxis] ?? "Unknown");
      const val = Number(row[yField] ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + val);
    }
    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }));
  }, [data, xAxis, yAxis, chartType]);

  // Empty / unconfigured state
  if (!xAxis || !yAxis?.length || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50">
        <p className="text-sm text-gray-400 dark:text-gray-400">
          {data.length === 0
            ? "Run the report to see chart data"
            : "Configure X and Y axes to render chart"}
        </p>
      </div>
    );
  }

  // Bar / Stacked Bar
  if (chartType === "bar" || chartType === "stacked_bar") {
    return (
      <StafforaBarChart
        data={data}
        xAxisKey={xAxis}
        yAxisKeys={yAxis}
        seriesLabels={seriesLabels}
        showGrid={showGrid !== false}
        showLegend={showLegend !== false}
        showLabels={showLabels}
        title={title}
        palette={palette}
        stacked={chartType === "stacked_bar"}
        ariaLabel={title ?? "Report bar chart"}
      />
    );
  }

  // Line
  if (chartType === "line") {
    return (
      <StafforaLineChart
        data={data}
        xAxisKey={xAxis}
        yAxisKeys={yAxis}
        seriesLabels={seriesLabels}
        showGrid={showGrid !== false}
        showLegend={showLegend !== false}
        showLabels={showLabels}
        title={title}
        palette={palette}
        ariaLabel={title ?? "Report line chart"}
      />
    );
  }

  // Area
  if (chartType === "area") {
    return (
      <StafforaAreaChart
        data={data}
        xAxisKey={xAxis}
        yAxisKeys={yAxis}
        seriesLabels={seriesLabels}
        showGrid={showGrid !== false}
        showLegend={showLegend !== false}
        showLabels={showLabels}
        title={title}
        palette={palette}
        ariaLabel={title ?? "Report area chart"}
      />
    );
  }

  // Pie / Donut
  if (chartType === "pie" || chartType === "donut") {
    return (
      <StafforaPieChart
        data={pieData}
        nameKey="name"
        valueKey="value"
        innerRadius={chartType === "donut" ? 60 : 0}
        showLegend={showLegend !== false}
        showLabels={showLabels !== false}
        title={title}
        palette={palette}
        ariaLabel={title ?? `Report ${chartType} chart`}
      />
    );
  }

  // Unsupported chart type fallback
  return (
    <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50">
      <p className="text-sm text-gray-400 dark:text-gray-400">
        Chart type &quot;{chartType}&quot; is not yet supported
      </p>
    </div>
  );
}
