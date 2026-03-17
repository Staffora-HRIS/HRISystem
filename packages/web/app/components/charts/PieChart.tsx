/**
 * StafforaPieChart — Reusable pie/donut chart component following the Staffora design system.
 *
 * Wraps Recharts PieChart with consistent styling, dark mode support,
 * accessible defaults, and interactive callbacks.
 *
 * Set `innerRadius > 0` for a donut chart.
 */

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { cn } from "~/lib/utils";
import { useChartTheme } from "./use-chart-theme";
import { getChartColor, DEFAULT_CHART_HEIGHT } from "./chart-theme";
import type { PieChartProps } from "./types";

export interface StafforaPieChartProps extends PieChartProps {
  /** Whether to show percentage labels on slices. Defaults to true. */
  showPercentageLabels?: boolean;
  /** Whether to show label connector lines. Defaults to true. */
  showLabelLines?: boolean;
  /** Padding angle between slices in degrees. Defaults to 0. */
  paddingAngle?: number;
}

export const StafforaPieChart = React.memo(function StafforaPieChart({
  data,
  nameKey,
  valueKey,
  width = "100%",
  height = DEFAULT_CHART_HEIGHT,
  isDark: isDarkOverride,
  showLegend = true,
  showLabels = true,
  title,
  palette,
  className,
  style,
  ariaLabel,
  onDataPointClick,
  innerRadius = 0,
  outerRadius = 120,
  showPercentageLabels = true,
  showLabelLines = true,
  paddingAngle = 0,
}: StafforaPieChartProps) {
  const theme = useChartTheme(isDarkOverride);

  const resolveColor = (index: number) =>
    palette?.[index % palette.length] ?? getChartColor(index, theme.isDark);

  const renderLabel = showLabels && showPercentageLabels
    ? (props: PieLabelRenderProps) => {
        const name = String(props.name ?? "");
        const percent = Number(props.percent ?? 0);
        return `${name} (${(percent * 100).toFixed(0)}%)`;
      }
    : showLabels
      ? (props: PieLabelRenderProps) => String(props.name ?? "")
      : undefined;

  return (
    <div
      className={cn("w-full", className)}
      style={style}
      role="img"
      aria-label={ariaLabel ?? title ?? "Pie chart"}
    >
      {title && (
        <h4 className="mb-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </h4>
      )}
      <ResponsiveContainer width={typeof width === "string" ? width as `${number}%` : width} height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius={outerRadius}
            innerRadius={innerRadius}
            paddingAngle={paddingAngle}
            label={renderLabel}
            labelLine={showLabels && showLabelLines}
            onClick={
              onDataPointClick
                ? (data: unknown, index: number) =>
                    onDataPointClick(data as Record<string, unknown>, index)
                : undefined
            }
            style={{ cursor: onDataPointClick ? "pointer" : undefined }}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={resolveColor(index)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={theme.tooltip.contentStyle}
          />
          {showLegend && <Legend {...theme.legend} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});
