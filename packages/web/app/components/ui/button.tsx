/**
 * Button Component
 *
 * A versatile button component with multiple variants, sizes, and states.
 * Supports loading state, icons, and full-width mode.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./spinner";
import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-primary-600 text-white",
    "hover:bg-primary-700",
    "focus:ring-primary-500",
    "disabled:bg-primary-300"
  ),
  secondary: cn(
    "bg-gray-200 text-gray-800",
    "hover:bg-gray-300",
    "focus:ring-gray-500",
    "disabled:bg-gray-100 disabled:text-gray-400",
    "dark:bg-gray-600 dark:text-gray-100",
    "dark:hover:bg-gray-500",
    "dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
  ),
  outline: cn(
    "border border-gray-300 bg-transparent text-gray-700",
    "hover:bg-gray-50",
    "focus:ring-primary-500",
    "disabled:border-gray-200 disabled:text-gray-400",
    "dark:border-gray-600 dark:text-gray-300",
    "dark:hover:bg-gray-800",
    "dark:disabled:border-gray-700 dark:disabled:text-gray-500"
  ),
  ghost: cn(
    "bg-transparent text-gray-700",
    "hover:bg-gray-100",
    "focus:ring-gray-500",
    "disabled:text-gray-400",
    "dark:text-gray-300",
    "dark:hover:bg-gray-800",
    "dark:disabled:text-gray-500"
  ),
  danger: cn(
    "bg-error-600 text-white",
    "hover:bg-error-700",
    "focus:ring-error-500",
    "disabled:bg-error-300"
  ),
  success: cn(
    "bg-success-600 text-white",
    "hover:bg-success-700",
    "focus:ring-success-500",
    "disabled:bg-success-300"
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "px-2 py-1 text-xs rounded",
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-5 py-2.5 text-base rounded-lg",
  xl: "px-6 py-3 text-lg rounded-xl",
};

const iconSizeStyles: Record<ButtonSize, string> = {
  xs: "[&>svg]:w-3 [&>svg]:h-3",
  sm: "[&>svg]:w-4 [&>svg]:h-4",
  md: "[&>svg]:w-5 [&>svg]:h-5",
  lg: "[&>svg]:w-5 [&>svg]:h-5",
  xl: "[&>svg]:w-6 [&>svg]:h-6",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      children,
      className,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center gap-2 font-medium",
          "transition-colors duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          // Dark mode focus offset
          "dark:focus:ring-offset-gray-900",
          // Variant styles
          variantStyles[variant],
          // Size styles
          sizeStyles[size],
          iconSizeStyles[size],
          // Full width
          fullWidth && "w-full",
          // Custom class
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <Spinner size={size === "xs" || size === "sm" ? "sm" : "md"} />
            <span>Loading...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

/**
 * IconButton - Button with only an icon
 */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  "aria-label": string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = "ghost",
      size = "md",
      loading = false,
      disabled = false,
      icon,
      className,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const iconSizeMap: Record<ButtonSize, string> = {
      xs: "w-6 h-6",
      sm: "w-8 h-8",
      md: "w-10 h-10",
      lg: "w-12 h-12",
      xl: "w-14 h-14",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center",
          "transition-colors duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "rounded-lg",
          // Dark mode focus offset
          "dark:focus:ring-offset-gray-900",
          // Variant styles
          variantStyles[variant],
          // Size styles
          iconSizeMap[size],
          iconSizeStyles[size],
          // Custom class
          className
        )}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

/**
 * ButtonGroup - Group of buttons
 */
export interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
}

export function ButtonGroup({ children, className }: ButtonGroupProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg shadow-sm",
        "[&>button]:rounded-none",
        "[&>button:first-child]:rounded-l-lg",
        "[&>button:last-child]:rounded-r-lg",
        "[&>button:not(:first-child)]:-ml-px",
        className
      )}
    >
      {children}
    </div>
  );
}
