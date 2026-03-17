/**
 * StafforaBarChart — Reusable bar chart component following the Staffora design system.
 *
 * Wraps Recharts BarChart with consistent styling, dark mode support,
 * accessible defaults, and interactive callbacks.
 *
 * Supports single-series and multi-series (grouped) bar charts.
 * For stacked bars, pass `stacked={true}`.
 */

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "~/lib/utils";
import { useChartTheme } from "./use-chart-theme";
import { getChartColor, CHART_MARGIN, DEFAULT_CHART_HEIGHT } from "./chart-theme";
import type { CartesianChartProps } from "./types";

export interface StafforaBarChartProps extends CartesianChartProps {
  /** Render bars in a stacked layout. Defaults to false. */
  stacked?: boolean;
  /** Border radius for the top corners of each bar. Defaults to [4, 4, 0, 0]. */
  barRadius?: [number, number, number, number];
}

export const StafforaBarChart = React.memo(function StafforaBarChart({
  data,
  xAxisKey,
  yAxisKeys,
  seriesLabels,
  width = "100%",
  height = DEFAULT_CHART_HEIGHT,
  isDark: isDarkOverride,
  showGrid = true,
  showLegend = true,
  showLabels = false,
  title,
  palette,
  className,
  style,
  ariaLabel,
  onDataPointClick,
  stacked = false,
  barRadius = [4, 4, 0, 0],
}: StafforaBarChartProps) {
  const theme = useChartTheme(isDarkOverride);

  const resolveColor = (index: number) =>
    palette?.[index % palette.length] ?? getChartColor(index, theme.isDark);

  const getLabel = (key: string) => seriesLabels?.[key] ?? key;

  return (
    <div
      className={cn("w-full", className)}
      style={style}
      role="img"
      aria-label={ariaLabel ?? title ?? "Bar chart"}
    >
      {title && (
        <h4 className="mb-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </h4>
      )}
      <ResponsiveContainer width={typeof width === "string" ? width as `${number}%` : width} height={height}>
        <BarChart data={data} margin={CHART_MARGIN}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray={theme.grid.strokeDasharray}
              stroke={theme.grid.stroke}
              strokeOpacity={theme.grid.strokeOpacity}
            />
          )}
          <XAxis
            dataKey={xAxisKey}
            tick={theme.axis.tick}
            axisLine={theme.axis.axisLine}
            tickLine={theme.axis.tickLine}
          />
          <YAxis
            tick={theme.axis.tick}
            axisLine={theme.axis.axisLine}
            tickLine={theme.axis.tickLine}
          />
          <Tooltip
            contentStyle={theme.tooltip.contentStyle}
            cursor={theme.tooltip.cursor}
          />
          {showLegend && <Legend {...theme.legend} />}
          {yAxisKeys.map((yKey, i) => (
            <Bar
              key={yKey}
              dataKey={yKey}
              name={getLabel(yKey)}
              fill={resolveColor(i)}
              radius={barRadius}
              stackId={stacked ? "stack" : undefined}
              label={
                showLabels
                  ? { position: "top" as const, fontSize: 10, fill: theme.axis.tick.fill }
                  : undefined
              }
              onClick={
                onDataPointClick
                  ? (data: unknown, index: number) =>
                      onDataPointClick(data as Record<string, unknown>, index)
                  : undefined
              }
              style={{ cursor: onDataPointClick ? "pointer" : undefined }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
