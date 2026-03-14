/**
 * KPI Card Component
 *
 * Displays a key performance indicator with trend indicator.
 * Wrapped with React.memo to prevent unnecessary re-renders in dashboard grids.
 */

import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "~/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "stable";
  trendValue?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const KPICard = React.memo(function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  icon,
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-6 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              {trend === "up" && (
                <TrendingUp className="h-4 w-4 text-green-500" />
              )}
              {trend === "down" && (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              {trend === "stable" && (
                <Minus className="h-4 w-4 text-gray-400" />
              )}
              {trendValue && (
                <span
                  className={cn(
                    "text-sm font-medium",
                    trend === "up" && "text-green-600",
                    trend === "down" && "text-red-600",
                    trend === "stable" && "text-gray-500"
                  )}
                >
                  {trendValue}
                </span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
});

export default KPICard;
