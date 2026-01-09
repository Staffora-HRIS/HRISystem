/**
 * Badge Component
 *
 * A versatile badge/tag component for labels, statuses, and counts.
 */

import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "destructive"
  | "outline";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  rounded?: boolean;
  dot?: boolean;
  dotColor?: string;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: cn(
    "bg-gray-100 text-gray-700",
    "dark:bg-gray-700 dark:text-gray-300"
  ),
  primary: cn(
    "bg-primary-100 text-primary-700",
    "dark:bg-primary-900/30 dark:text-primary-300"
  ),
  secondary: cn(
    "bg-gray-200 text-gray-800",
    "dark:bg-gray-600 dark:text-gray-200"
  ),
  success: cn(
    "bg-success-100 text-success-700",
    "dark:bg-success-900/30 dark:text-success-300"
  ),
  warning: cn(
    "bg-warning-100 text-warning-700",
    "dark:bg-warning-900/30 dark:text-warning-300"
  ),
  error: cn(
    "bg-error-100 text-error-700",
    "dark:bg-error-900/30 dark:text-error-300"
  ),
  info: cn(
    "bg-primary-100 text-primary-700",
    "dark:bg-primary-900/30 dark:text-primary-300"
  ),
  destructive: cn(
    "bg-red-100 text-red-700",
    "dark:bg-red-900/30 dark:text-red-300"
  ),
  outline: cn(
    "bg-transparent text-gray-700 border border-gray-300",
    "dark:text-gray-300 dark:border-gray-600"
  ),
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1 text-sm",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-gray-500",
  primary: "bg-primary-500",
  secondary: "bg-gray-600",
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-error-500",
  info: "bg-primary-500",
  destructive: "bg-red-500",
  outline: "bg-gray-500",
};

export function Badge({
  variant = "default",
  size = "md",
  rounded = false,
  dot = false,
  dotColor,
  removable = false,
  onRemove,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        rounded ? "rounded-full" : "rounded-md",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            dotColor || dotColors[variant]
          )}
        />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "-mr-1 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full",
            "hover:bg-black/10 dark:hover:bg-white/10"
          )}
          aria-label="Remove"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * Status Badge - Pre-configured for common statuses
 */
export interface StatusBadgeProps {
  status:
    | "active"
    | "inactive"
    | "pending"
    | "approved"
    | "rejected"
    | "draft"
    | "published"
    | "archived"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";
  size?: BadgeSize;
  className?: string;
}

const statusConfig: Record<
  StatusBadgeProps["status"],
  { variant: BadgeVariant; label: string }
> = {
  active: { variant: "success", label: "Active" },
  inactive: { variant: "default", label: "Inactive" },
  pending: { variant: "warning", label: "Pending" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "error", label: "Rejected" },
  draft: { variant: "secondary", label: "Draft" },
  published: { variant: "primary", label: "Published" },
  archived: { variant: "default", label: "Archived" },
  processing: { variant: "info", label: "Processing" },
  completed: { variant: "success", label: "Completed" },
  failed: { variant: "error", label: "Failed" },
  cancelled: { variant: "default", label: "Cancelled" },
};

export function StatusBadge({ status, size = "sm", className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} size={size} dot rounded className={className}>
      {config.label}
    </Badge>
  );
}

/**
 * Count Badge - For notification counts
 */
export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

export function CountBadge({
  count,
  max = 99,
  variant = "error",
  size = "sm",
  className,
}: CountBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium",
        variantStyles[variant],
        size === "sm" ? "min-w-[1.25rem] px-1.5 py-0.5 text-xs" : "min-w-[1.5rem] px-2 py-0.5 text-sm",
        className
      )}
    >
      {displayCount}
    </span>
  );
}

/**
 * BadgeGroup - Group of badges
 */
export interface BadgeGroupProps {
  children: ReactNode;
  className?: string;
}

export function BadgeGroup({ children, className }: BadgeGroupProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {children}
    </div>
  );
}

/**
 * Priority Badge - For priority levels
 */
export interface PriorityBadgeProps {
  priority: "low" | "medium" | "high" | "urgent";
  size?: BadgeSize;
  className?: string;
}

const priorityConfig: Record<
  PriorityBadgeProps["priority"],
  { variant: BadgeVariant; label: string }
> = {
  low: { variant: "default", label: "Low" },
  medium: { variant: "info", label: "Medium" },
  high: { variant: "warning", label: "High" },
  urgent: { variant: "error", label: "Urgent" },
};

export function PriorityBadge({ priority, size = "sm", className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <Badge variant={config.variant} size={size} className={className}>
      {config.label}
    </Badge>
  );
}

/**
 * Type Badge - For categorization
 */
export interface TypeBadgeProps {
  type: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export function TypeBadge({
  type,
  variant = "secondary",
  size = "sm",
  className,
}: TypeBadgeProps) {
  return (
    <Badge variant={variant} size={size} rounded className={className}>
      {type}
    </Badge>
  );
}
