/**
 * Alert Component
 *
 * Alert messages for success, error, warning, and info states
 */

import { type ReactNode } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type AlertVariant = "success" | "error" | "warning" | "info";

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const variantIcons: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

export function Alert({
  variant = "info",
  title,
  children,
  icon,
  dismissible = false,
  onDismiss,
  className,
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 p-4 rounded-lg border",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex-shrink-0">{icon || variantIcons[variant]}</div>
      <div className="flex-1 min-w-0">
        {title && <h5 className="font-medium mb-1">{title}</h5>}
        <div className="text-sm">{children}</div>
      </div>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export interface AlertBannerProps extends AlertProps {
  action?: ReactNode;
}

export function AlertBanner({
  variant = "info",
  title,
  children,
  icon,
  action,
  dismissible = false,
  onDismiss,
  className,
}: AlertBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex-shrink-0">{icon || variantIcons[variant]}</div>
      <div className="flex-1 min-w-0">
        {title && <span className="font-medium mr-2">{title}</span>}
        <span className="text-sm">{children}</span>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
