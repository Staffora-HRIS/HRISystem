/**
 * Shared types for Staffora chart components.
 */

import type { CSSProperties } from "react";

/** Base props common to all chart wrapper components. */
export interface BaseChartProps {
  /** Chart data array. Each object represents one data point. */
  data: Record<string, unknown>[];
  /** Width of the chart. Defaults to "100%". */
  width?: number | string;
  /** Height of the chart in pixels. Defaults to 360. */
  height?: number;
  /** Whether the chart is in dark mode. Auto-detected from DOM if omitted. */
  isDark?: boolean;
  /** Whether to show the Cartesian grid. Defaults to true. */
  showGrid?: boolean;
  /** Whether to show the legend. Defaults to true. */
  showLegend?: boolean;
  /** Whether to show data labels on data points. Defaults to false. */
  showLabels?: boolean;
  /** Chart title displayed above the chart. */
  title?: string;
  /** Custom colour palette (overrides default Staffora palette). */
  palette?: string[];
  /** Additional CSS class name on the wrapper div. */
  className?: string;
  /** Additional inline styles on the wrapper div. */
  style?: CSSProperties;
  /** Accessible description for the chart. */
  ariaLabel?: string;
  /** Callback when a chart element is clicked. */
  onDataPointClick?: (data: Record<string, unknown>, index: number) => void;
}

/** Props for axis-based charts (bar, line, area). */
export interface CartesianChartProps extends BaseChartProps {
  /** The data key used for the X axis (category axis). */
  xAxisKey: string;
  /** The data key(s) used for the Y axis (value axis). */
  yAxisKeys: string[];
  /** Display labels for each Y-axis key. Maps dataKey to label string. */
  seriesLabels?: Record<string, string>;
}

/** Props specific to the PieChart wrapper. */
export interface PieChartProps extends BaseChartProps {
  /** The data key for the segment name. */
  nameKey: string;
  /** The data key for the segment value. */
  valueKey: string;
  /** Inner radius for donut charts. 0 = full pie. Defaults to 0. */
  innerRadius?: number;
  /** Outer radius in pixels. Defaults to 120. */
  outerRadius?: number;
}
