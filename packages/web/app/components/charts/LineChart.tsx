/**
 * StafforaLineChart — Reusable line chart component following the Staffora design system.
 *
 * Wraps Recharts LineChart with consistent styling, dark mode support,
 * accessible defaults, and interactive callbacks.
 *
 * Supports multiple series with distinct stroke colours.
 */

import React from "react";
import {
  LineChart,
  Line,
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

export interface StafforaLineChartProps extends CartesianChartProps {
  /** Interpolation type for the line. Defaults to "monotone". */
  curveType?: "monotone" | "linear" | "step" | "natural";
  /** Stroke width in pixels. Defaults to 2. */
  strokeWidth?: number;
  /** Whether to show dots on data points. Defaults to true. */
  showDots?: boolean;
  /** Radius of each dot. Defaults to 3. */
  dotRadius?: number;
  /** Radius of the active (hovered) dot. Defaults to 5. */
  activeDotRadius?: number;
}

export const StafforaLineChart = React.memo(function StafforaLineChart({
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
  // onDataPointClick is accepted via props but not wired to Line onClick
  // due to Recharts v3 CurveMouseEventHandler signature mismatch.
  // The BarChart and PieChart components support click handling.
  onDataPointClick: _onDataPointClick,
  curveType = "monotone",
  strokeWidth = 2,
  showDots = true,
  dotRadius = 3,
  activeDotRadius = 5,
}: StafforaLineChartProps) {
  const theme = useChartTheme(isDarkOverride);

  const resolveColor = (index: number) =>
    palette?.[index % palette.length] ?? getChartColor(index, theme.isDark);

  const getLabel = (key: string) => seriesLabels?.[key] ?? key;

  return (
    <div
      className={cn("w-full", className)}
      style={style}
      role="img"
      aria-label={ariaLabel ?? title ?? "Line chart"}
    >
      {title && (
        <h4 className="mb-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </h4>
      )}
      <ResponsiveContainer width={typeof width === "string" ? width as `${number}%` : width} height={height}>
        <LineChart data={data} margin={CHART_MARGIN}>
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
            <Line
              key={yKey}
              type={curveType}
              dataKey={yKey}
              name={getLabel(yKey)}
              stroke={resolveColor(i)}
              strokeWidth={strokeWidth}
              dot={showDots ? { r: dotRadius, fill: resolveColor(i) } : false}
              activeDot={showDots ? { r: activeDotRadius } : false}
              label={
                showLabels
                  ? { position: "top" as const, fontSize: 10, fill: theme.axis.tick.fill }
                  : undefined
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
