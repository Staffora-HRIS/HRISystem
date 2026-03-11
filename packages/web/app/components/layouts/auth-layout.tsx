/**
 * Auth Layout Component
 *
 * Layout for authentication pages (login, MFA, forgot password, etc.)
 * Features:
 * - Centered card layout
 * - Logo and branding
 * - Dark mode support
 */

import { type ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";

export interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  maxWidth?: "sm" | "md" | "lg";
}

const maxWidthStyles: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function AuthLayout({
  children,
  title,
  subtitle,
  showLogo = true,
  maxWidth = "md",
}: AuthLayoutProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            "rounded-lg p-2 text-gray-500",
            "hover:bg-gray-100 dark:hover:bg-gray-800",
            "focus:outline-none focus:ring-2 focus:ring-primary-500"
          )}
          aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} mode`}
        >
          {resolvedTheme === "light" ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className={cn("w-full", maxWidthStyles[maxWidth])}>
          {/* Logo */}
          {showLogo && (
            <div className="mb-8 text-center">
              <Link to="/" className="inline-flex items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
                  <svg
                    className="h-8 w-8 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  Staffora
                </span>
              </Link>
            </div>
          )}

          {/* Title and subtitle */}
          {(title || subtitle) && (
            <div className="mb-8 text-center">
              {title && (
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {/* Card */}
          <div className="rounded-xl bg-white px-6 py-8 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 sm:px-10">
            {children}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>&copy; {new Date().getFullYear()} Staffora. All rights reserved.</p>
      </footer>
    </div>
  );
}

/**
 * AuthCard - Standalone card for auth pages
 */
export interface AuthCardProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
}

export function AuthCard({ children, title, subtitle, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white px-6 py-8 shadow-lg ring-1 ring-gray-200",
        "dark:bg-gray-800 dark:ring-gray-700",
        "sm:px-10",
        className
      )}
    >
      {(title || subtitle) && (
        <div className="mb-6 text-center">
          {title && (
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * AuthDivider - Divider with text for auth pages
 */
export interface AuthDividerProps {
  text?: string;
}

export function AuthDivider({ text = "Or continue with" }: AuthDividerProps) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-200 dark:border-gray-700" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-white px-2 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {text}
        </span>
      </div>
    </div>
  );
}

/**
 * SocialLoginButtons - Social login buttons for auth pages
 */
export interface SocialLoginButtonsProps {
  onGoogleClick?: () => void;
  onMicrosoftClick?: () => void;
  disabled?: boolean;
}

export function SocialLoginButtons({
  onGoogleClick,
  onMicrosoftClick,
  disabled,
}: SocialLoginButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {onGoogleClick && (
        <button
          type="button"
          onClick={onGoogleClick}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5",
            "border-gray-300 bg-white text-gray-700",
            "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
            "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="text-sm font-medium">Google</span>
        </button>
      )}

      {onMicrosoftClick && (
        <button
          type="button"
          onClick={onMicrosoftClick}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5",
            "border-gray-300 bg-white text-gray-700",
            "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
            "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#F25022" d="M1 1h10v10H1z" />
            <path fill="#00A4EF" d="M1 13h10v10H1z" />
            <path fill="#7FBA00" d="M13 1h10v10H13z" />
            <path fill="#FFB900" d="M13 13h10v10H13z" />
          </svg>
          <span className="text-sm font-medium">Microsoft</span>
        </button>
      )}
    </div>
  );
}
