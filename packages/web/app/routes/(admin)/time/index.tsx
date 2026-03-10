import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Clock, Calendar, FileSpreadsheet, AlertTriangle, CheckCircle, Shield } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface TimesheetSummary {
  id: string;
  employeeId: string;
  employeeName?: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  totalRegularHours: number;
  totalOvertimeHours: number;
  submittedAt?: string;
}

export default function TimeAdminPage() {
  const { data: timesheetsData, isLoading } = useQuery({
    queryKey: ["admin-timesheets"],
    queryFn: () => api.get<{ items: TimesheetSummary[]; cursor: string | null; hasMore: boolean }>("/time/timesheets"),
  });

  const { data: statsData } = useQuery({
    queryKey: ["admin-time-stats"],
    queryFn: () => api.get<{
      pendingApprovals: number;
      totalHoursThisWeek: number;
      overtimeHoursThisWeek: number;
      activeEmployees: number;
    }>("/time/stats"),
  });

  const timesheets = timesheetsData?.items || [];
  const pendingTimesheets = timesheets.filter(t => t.status === "submitted");

  const stats = statsData || {
    pendingApprovals: pendingTimesheets.length,
    totalHoursThisWeek: 0,
    overtimeHoursThisWeek: 0,
    activeEmployees: 0,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "submitted": return <Badge variant="warning">Pending</Badge>;
      case "approved": return <Badge variant="success">Approved</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time & Attendance</h1>
          <p className="text-gray-600">Manage timesheets and schedules</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/time/policies">
            <Button variant="outline">
              <Shield className="h-4 w-4 mr-2" />
              Policies
            </Button>
          </Link>
          <Link to="/admin/time/schedules">
            <Button variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Schedules
            </Button>
          </Link>
          <Link to="/admin/time/reports">
            <Button variant="outline">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Reports
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Pending Approvals"
          value={stats.pendingApprovals}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Hours This Week"
          value={stats.totalHoursThisWeek.toFixed(1)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Overtime Hours"
          value={stats.overtimeHoursThisWeek.toFixed(1)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Active Employees"
          value={stats.activeEmployees}
          icon={<CheckCircle className="h-5 w-5" />}
        />
      </div>

      <Card>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Timesheets Pending Approval</h2>
          <Link to="/admin/time/timesheets">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>
        <CardBody>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : pendingTimesheets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
              <p>No timesheets pending approval</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Overtime</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingTimesheets.slice(0, 10).map((timesheet) => (
                    <tr key={timesheet.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{timesheet.employeeName || "Unknown"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(timesheet.periodStart).toLocaleDateString()} - {new Date(timesheet.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{((timesheet.totalRegularHours ?? 0) + (timesheet.totalOvertimeHours ?? 0)).toFixed(1)}h</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {(timesheet.totalOvertimeHours ?? 0) > 0 ? (
                          <span className="text-orange-600">{(timesheet.totalOvertimeHours ?? 0).toFixed(1)}h</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(timesheet.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <Link to={`/admin/time/timesheets/${timesheet.id}`}>
                          <Button variant="outline" size="sm">Review</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
