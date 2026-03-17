/**
 * Chart Component Exports
 *
 * Reusable chart components for dashboards and reports.
 * All components follow the Staffora design system with dark mode support.
 */

// Chart components
export { StafforaBarChart, type StafforaBarChartProps } from "./BarChart";
export { StafforaLineChart, type StafforaLineChartProps } from "./LineChart";
export { StafforaAreaChart, type StafforaAreaChartProps } from "./AreaChart";
export { StafforaPieChart, type StafforaPieChartProps } from "./PieChart";

// Theme and utilities
export {
  CHART_COLORS,
  CHART_COLORS_DARK,
  CHART_MARGIN,
  DEFAULT_CHART_HEIGHT,
  getChartColor,
  getAxisStyle,
  getGridStyle,
  getTooltipStyle,
  getLegendStyle,
} from "./chart-theme";

// Hook
export { useChartTheme } from "./use-chart-theme";

// Types
export type {
  BaseChartProps,
  CartesianChartProps,
  PieChartProps,
} from "./types";
