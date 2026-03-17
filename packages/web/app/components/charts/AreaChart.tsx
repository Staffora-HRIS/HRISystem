/**
 * StafforaAreaChart — Reusable area chart component following the Staffora design system.
 *
 * Wraps Recharts AreaChart with consistent styling, dark mode support,
 * accessible defaults, and interactive callbacks.
 *
 * Supports single and multi-series area charts with configurable fill opacity.
 */

import React from "react";
import {
  AreaChart,
  Area,
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

export interface StafforaAreaChartProps extends CartesianChartProps {
  /** Interpolation type for the area boundary. Defaults to "monotone". */
  curveType?: "monotone" | "linear" | "step" | "natural";
  /** Stroke width in pixels. Defaults to 2. */
  strokeWidth?: number;
  /** Opacity of the area fill. Defaults to 0.15. */
  fillOpacity?: number;
  /** Whether to stack areas. Defaults to false. */
  stacked?: boolean;
}

export const StafforaAreaChart = React.memo(function StafforaAreaChart({
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
  // onDataPointClick is accepted via props but not wired to Area onClick
  // due to Recharts v3 CurveMouseEventHandler signature mismatch.
  // The BarChart and PieChart components support click handling.
  onDataPointClick: _onDataPointClick,
  curveType = "monotone",
  strokeWidth = 2,
  fillOpacity = 0.15,
  stacked = false,
}: StafforaAreaChartProps) {
  const theme = useChartTheme(isDarkOverride);

  const resolveColor = (index: number) =>
    palette?.[index % palette.length] ?? getChartColor(index, theme.isDark);

  const getLabel = (key: string) => seriesLabels?.[key] ?? key;

  return (
    <div
      className={cn("w-full", className)}
      style={style}
      role="img"
      aria-label={ariaLabel ?? title ?? "Area chart"}
    >
      {title && (
        <h4 className="mb-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </h4>
      )}
      <ResponsiveContainer width={typeof width === "string" ? width as `${number}%` : width} height={height}>
        <AreaChart data={data} margin={CHART_MARGIN}>
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
            <Area
              key={yKey}
              type={curveType}
              dataKey={yKey}
              name={getLabel(yKey)}
              stroke={resolveColor(i)}
              fill={resolveColor(i)}
              fillOpacity={fillOpacity}
              strokeWidth={strokeWidth}
              stackId={stacked ? "stack" : undefined}
              label={
                showLabels
                  ? { position: "top" as const, fontSize: 10, fill: theme.axis.tick.fill }
                  : undefined
              }
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
