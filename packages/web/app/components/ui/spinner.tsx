/**
 * Spinner Component
 *
 * A loading spinner with multiple sizes and color variants.
 */

import { cn } from "../../lib/utils";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";
export type SpinnerVariant = "primary" | "white" | "gray";

export interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
  xl: "h-12 w-12 border-[3px]",
};

const variantStyles: Record<SpinnerVariant, string> = {
  primary: "border-primary-200 border-t-primary-600",
  white: "border-white/30 border-t-white",
  gray: "border-gray-200 border-t-gray-600 dark:border-gray-700 dark:border-t-gray-400",
};

export function Spinner({
  size = "md",
  variant = "primary",
  className,
  label = "Loading...",
}: SpinnerProps) {
  return (
    <div
      className={cn(
        "inline-block animate-spin rounded-full",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * FullPageSpinner - Centered spinner for full page loading states
 */
export interface FullPageSpinnerProps {
  label?: string;
}

export function FullPageSpinner({ label = "Loading..." }: FullPageSpinnerProps) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * InlineSpinner - Spinner with text for inline loading states
 */
export interface InlineSpinnerProps {
  label?: string;
  size?: SpinnerSize;
  className?: string;
}

export function InlineSpinner({ label = "Loading...", size = "sm", className }: InlineSpinnerProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Spinner size={size} variant="gray" />
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

/**
 * OverlaySpinner - Spinner overlay for sections
 */
export interface OverlaySpinnerProps {
  label?: string;
}

export function OverlaySpinner({ label = "Loading..." }: OverlaySpinnerProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * ButtonSpinner - Small spinner for buttons
 */
export function ButtonSpinner() {
  return <Spinner size="sm" variant="white" />;
}
