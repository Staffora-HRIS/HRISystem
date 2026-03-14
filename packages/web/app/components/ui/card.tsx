/**
 * Card Component
 *
 * A flexible card component with header, body, and footer sections.
 * Supports multiple variants and interactive states.
 */

import React, { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type CardVariant = "default" | "bordered" | "elevated" | "flat";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  hoverable?: boolean;
  clickable?: boolean;
  selected?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-white border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700",
  bordered: "bg-white border-2 border-gray-200 dark:bg-gray-800 dark:border-gray-700",
  elevated: "bg-white shadow-lg dark:bg-gray-800",
  flat: "bg-gray-50 dark:bg-gray-800/50",
};

const paddingStyles: Record<string, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "default",
      padding = "none",
      hoverable = false,
      clickable = false,
      selected = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl overflow-hidden",
          variantStyles[variant],
          paddingStyles[padding],
          hoverable && "cursor-pointer transition-shadow duration-200 hover:shadow-md",
          clickable && "cursor-pointer transition-[shadow,transform] duration-200 hover:shadow-md active:scale-[0.99]",
          selected && "ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

/**
 * CardHeader Component
 */
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, subtitle, action, bordered = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "px-6 py-4",
          bordered && "border-b border-gray-200 dark:border-gray-700",
          className
        )}
        {...props}
      >
        {(title || subtitle || action) ? (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        ) : (
          children
        )}
      </div>
    );
  }
);

CardHeader.displayName = "CardHeader";

/**
 * CardBody Component
 */
export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
}

export const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(
  ({ padding = "md", className, children, ...props }, ref) => {
    const bodyPaddingStyles: Record<string, string> = {
      none: "",
      sm: "px-4 py-3",
      md: "px-6 py-4",
      lg: "px-8 py-6",
    };

    return (
      <div
        ref={ref}
        className={cn(bodyPaddingStyles[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardBody.displayName = "CardBody";

/**
 * CardFooter Component
 */
export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
  justify?: "start" | "end" | "center" | "between";
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ bordered = false, justify = "end", className, children, ...props }, ref) => {
    const justifyStyles: Record<string, string> = {
      start: "justify-start",
      end: "justify-end",
      center: "justify-center",
      between: "justify-between",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 px-6 py-4",
          bordered && "border-t border-gray-200 dark:border-gray-700",
          justifyStyles[justify],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = "CardFooter";

/**
 * StatCard Component - Pre-built card for displaying statistics
 */
export interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: "increase" | "decrease" | "neutral";
  };
  icon?: ReactNode;
  description?: string;
  className?: string;
}

export const StatCard = React.memo(function StatCard({
  title,
  value,
  change,
  icon,
  description,
  className,
}: StatCardProps) {
  return (
    <Card variant="default" className={className}>
      <CardBody padding="md">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {value}
            </p>
            {change && (
              <p
                className={cn(
                  "mt-2 flex items-center text-sm font-medium",
                  change.type === "increase" && "text-success-600",
                  change.type === "decrease" && "text-error-600",
                  change.type === "neutral" && "text-gray-500"
                )}
              >
                <span
                  className={cn(
                    "mr-1",
                    change.type === "increase" && "rotate-0",
                    change.type === "decrease" && "rotate-180"
                  )}
                >
                  {change.type !== "neutral" && (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
                {Math.abs(change.value)}%
              </p>
            )}
            {description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
          {icon && (
            <div className="rounded-lg bg-primary-50 p-3 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400">
              {icon}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
});

/**
 * ListCard Component - Pre-built card for displaying lists
 */
export interface ListCardProps<T> {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  action?: ReactNode;
  className?: string;
  maxItems?: number;
}

export function ListCard<T>({
  title,
  items,
  renderItem,
  emptyMessage = "No items",
  action,
  className,
  maxItems,
}: ListCardProps<T>) {
  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  const hasMore = maxItems && items.length > maxItems;

  return (
    <Card variant="default" className={className}>
      <CardHeader title={title} action={action} bordered />
      <CardBody padding="none">
        {displayItems.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {emptyMessage}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {displayItems.map((item, index) => (
              <li key={index} className="px-6 py-3">
                {renderItem(item, index)}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="border-t border-gray-100 px-6 py-3 text-center dark:border-gray-700">
            <span className="text-sm text-gray-500">
              +{items.length - (maxItems || 0)} more items
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
