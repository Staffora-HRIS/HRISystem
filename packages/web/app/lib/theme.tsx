/**
 * Theme Provider for dark/light mode support
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "hris-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function parseTheme(value: string | null | undefined): Theme | null {
  if (value === "light" || value === "dark" || value === "system") return value;
  return null;
}

function getCookieTheme(): Theme | null {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie || "";
  const match = cookie.match(/(?:^|;\s*)hris-theme=([^;]+)/);
  const raw = match?.[1] ? decodeURIComponent(match[1]) : null;
  return parseTheme(raw);
}

export function getInitialResolvedTheme(defaultTheme: Theme): ResolvedTheme {
  return defaultTheme === "dark" ? "dark" : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);

  const parsed = parseTheme(stored);
  if (parsed) return parsed;

  return getCookieTheme() ?? "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme = "light" }: ThemeProviderProps) {
  // IMPORTANT: The initial render must match SSR markup to avoid hydration mismatches.
  // We intentionally start with `defaultTheme` even on the client, then read localStorage
  // after mount to apply the user's stored/system preference.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getInitialResolvedTheme(defaultTheme)
  );

  // Load stored theme on the client after mount.
  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  // Update resolved theme when system preference changes
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      setResolvedTheme(getSystemTheme());
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // Update resolved theme when theme changes
  useEffect(() => {
    setResolvedTheme(resolveTheme(theme));
  }, [theme]);

  // Update document class when resolved theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newTheme);

      document.cookie = `${STORAGE_KEY}=${encodeURIComponent(newTheme)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  }, [resolvedTheme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
