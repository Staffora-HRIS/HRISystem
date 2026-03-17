/**
 * Chart Theme — Shared design tokens for all Staffora chart components.
 *
 * Maps Tailwind design tokens to Recharts-compatible values, supporting
 * both light and dark mode. The palette is derived from the Staffora
 * colour system (primary/indigo, success/green, warning/amber, error/red)
 * extended with complementary hues for multi-series charts.
 */

/**
 * Default colour palette for chart series.
 * Ordered for maximum visual distinction; colours are WCAG AA-safe against white.
 */
export const CHART_COLORS = [
  "#6366f1", // primary-500 (indigo)
  "#22c55e", // success-500 (green)
  "#f59e0b", // warning-500 (amber)
  "#ef4444", // error-500 (red)
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#14b8a6", // teal-500
  "#e11d48", // rose-600
  "#7c3aed", // violet-600
] as const;

/**
 * Colour palette tuned for dark backgrounds.
 * Slightly brighter than light-mode palette for readability.
 */
export const CHART_COLORS_DARK = [
  "#818cf8", // primary-400
  "#4ade80", // success-400
  "#fbbf24", // warning-400
  "#f87171", // error-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#22d3ee", // cyan-400
  "#fb923c", // orange-400
  "#a3e635", // lime-400
  "#2dd4bf", // teal-400
  "#fb7185", // rose-400
  "#a78bfa", // violet-400
] as const;

/** Pick a colour from the palette by index (wraps safely). */
export function getChartColor(index: number, isDark = false): string {
  const palette = isDark ? CHART_COLORS_DARK : CHART_COLORS;
  return palette[index % palette.length];
}

/**
 * Shared axis / grid styling that follows the Staffora design system.
 * Returns config objects compatible with Recharts component props.
 */
export function getAxisStyle(isDark = false) {
  return {
    tick: {
      fontSize: 11,
      fill: isDark ? "#9ca3af" : "#6b7280", // gray-400 / gray-500
    },
    axisLine: {
      stroke: isDark ? "#374151" : "#e5e7eb", // gray-700 / gray-200
    },
    tickLine: false as const,
  };
}

export function getGridStyle(isDark = false) {
  return {
    strokeDasharray: "3 3",
    stroke: isDark ? "#374151" : "#e5e7eb", // gray-700 / gray-200
    strokeOpacity: isDark ? 0.5 : 1,
  };
}

export function getTooltipStyle(isDark = false) {
  return {
    contentStyle: {
      fontSize: 12,
      borderRadius: 8,
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      backgroundColor: isDark ? "#1f2937" : "#ffffff", // gray-800 / white
      color: isDark ? "#f3f4f6" : "#111827", // gray-100 / gray-900
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    },
    cursor: {
      fill: isDark ? "rgba(107, 114, 128, 0.15)" : "rgba(107, 114, 128, 0.1)",
    },
  };
}

export function getLegendStyle(isDark = false) {
  return {
    wrapperStyle: {
      fontSize: 12,
      color: isDark ? "#d1d5db" : "#4b5563", // gray-300 / gray-600
    },
  };
}

/** Default chart margins (px). */
export const CHART_MARGIN = {
  top: 8,
  right: 20,
  bottom: 20,
  left: 20,
} as const;

/** Default chart height (px). */
export const DEFAULT_CHART_HEIGHT = 360;
