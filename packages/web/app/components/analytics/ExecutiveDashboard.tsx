/**
 * Executive Dashboard Component
 *
 * Displays high-level HR metrics for executives.
 */

import { useQuery } from "@tanstack/react-query";
import { Users, TrendingDown, Clock, Briefcase } from "lucide-react";
import { cn } from "~/lib/utils";
import { KPICard } from "./KPICard";

interface ExecutiveDashboardData {
  headcount: {
    total_employees: number;
    active_employees: number;
    on_leave_employees: number;
    pending_employees: number;
    terminated_employees: number;
    as_of_date: string;
  };
  turnover: {
    rate: number;
    trend: "up" | "down" | "stable";
    change_percentage: number;
  };
  attendance: {
    rate: number;
    trend: "up" | "down" | "stable";
  };
  leave: {
    pending_requests: number;
    avg_utilization: number;
  };
  recruitment: {
    open_positions: number;
    avg_time_to_fill: number;
  };
}

interface ExecutiveDashboardProps {
  className?: string;
}

export function ExecutiveDashboard({ className }: ExecutiveDashboardProps) {
  const { data, isLoading, error } = useQuery<ExecutiveDashboardData>({
    queryKey: ["analytics", "executive-dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/v1/analytics/dashboard/executive", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("text-center py-8 text-red-500", className)}>
        Failed to load dashboard data
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Headcount"
          value={data.headcount.total_employees}
          subtitle={`${data.headcount.active_employees} active`}
          icon={<Users className="h-6 w-6" />}
        />
        <KPICard
          title="Turnover Rate"
          value={`${data.turnover.rate.toFixed(1)}%`}
          trend={data.turnover.trend}
          trendValue={
            data.turnover.change_percentage !== 0
              ? `${data.turnover.change_percentage > 0 ? "+" : ""}${data.turnover.change_percentage.toFixed(1)}%`
              : undefined
          }
          icon={<TrendingDown className="h-6 w-6" />}
        />
        <KPICard
          title="Attendance Rate"
          value={`${data.attendance.rate.toFixed(1)}%`}
          trend={data.attendance.trend}
          icon={<Clock className="h-6 w-6" />}
        />
        <KPICard
          title="Open Positions"
          value={data.recruitment.open_positions}
          subtitle={
            data.recruitment.avg_time_to_fill > 0
              ? `Avg ${data.recruitment.avg_time_to_fill} days to fill`
              : undefined
          }
          icon={<Briefcase className="h-6 w-6" />}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Employee Status</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active</span>
              <span className="font-medium">{data.headcount.active_employees}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">On Leave</span>
              <span className="font-medium">{data.headcount.on_leave_employees}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Pending</span>
              <span className="font-medium">{data.headcount.pending_employees}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Leave Requests</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Pending Approvals</span>
              <span className="font-medium">{data.leave.pending_requests}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Avg Utilization</span>
              <span className="font-medium">{data.leave.avg_utilization.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Quick Actions</h3>
          <div className="mt-4 space-y-2">
            <a
              href="/admin/hr/employees"
              className="block w-full rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View All Employees
            </a>
            <a
              href="/admin/reports"
              className="block w-full rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Reports
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveDashboard;
