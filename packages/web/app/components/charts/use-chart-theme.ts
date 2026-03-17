/**
 * Hook that resolves chart theming (light/dark) from the Staffora ThemeProvider.
 *
 * Provides a safe fallback so chart components can be rendered outside
 * a ThemeProvider during tests or in isolation.
 */

import { useMemo } from "react";
import {
  getAxisStyle,
  getGridStyle,
  getTooltipStyle,
  getLegendStyle,
  CHART_COLORS,
  CHART_COLORS_DARK,
} from "./chart-theme";

/**
 * Attempt to read the resolved theme from the ThemeProvider context.
 * If the provider is not mounted, fall back to checking the DOM class list.
 */
function useResolvedIsDark(override?: boolean): boolean {
  if (override !== undefined) return override;

  // We deliberately avoid importing useTheme to keep charts decoupled from
  // the provider tree. Instead, we check the document class (set by ThemeProvider).
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark");
  }
  return false;
}

/**
 * Returns fully resolved Recharts style objects for the current theme.
 */
export function useChartTheme(isDarkOverride?: boolean) {
  const isDark = useResolvedIsDark(isDarkOverride);

  return useMemo(
    () => ({
      isDark,
      colors: isDark ? [...CHART_COLORS_DARK] : [...CHART_COLORS],
      axis: getAxisStyle(isDark),
      grid: getGridStyle(isDark),
      tooltip: getTooltipStyle(isDark),
      legend: getLegendStyle(isDark),
    }),
    [isDark],
  );
}
