import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Calendar, Settings, FileText, Clock, CheckCircle, XCircle } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: "pending" | "under_review" | "approved" | "rejected" | "cancelled";
  reason?: string;
  createdAt: string;
}

export default function AbsenceAdminPage() {
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["admin-leave-requests"],
    queryFn: () => api.get<{ items: LeaveRequest[]; nextCursor: string | null; hasMore: boolean }>("/absence/requests"),
  });

  const { data: statsData } = useQuery({
    queryKey: ["admin-absence-stats"],
    queryFn: () => api.get<{
      pendingRequests: number;
      approvedThisMonth: number;
      totalDaysThisMonth: number;
      upcomingLeaves: number;
    }>("/absence/stats"),
  });

  const requests = requestsData?.items || [];
  const pendingRequests = requests.filter(r => r.status === "pending" || r.status === "under_review");

  const stats = statsData || {
    pendingRequests: pendingRequests.length,
    approvedThisMonth: 0,
    totalDaysThisMonth: 0,
    upcomingLeaves: 0,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="warning">Pending</Badge>;
      case "under_review": return <Badge variant="info">Under Review</Badge>;
      case "approved": return <Badge variant="success">Approved</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Absence Management</h1>
          <p className="text-gray-600">Manage leave requests and policies</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/absence/calendar">
            <Button variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Calendar
            </Button>
          </Link>
          <Link to="/admin/absence/policies">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Policies
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Pending Requests"
          value={stats.pendingRequests}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Approved This Month"
          value={stats.approvedThisMonth}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Days Taken (Month)"
          value={stats.totalDaysThisMonth}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Upcoming Leaves"
          value={stats.upcomingLeaves}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      <Card>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Leave Requests Pending Approval</h2>
          <Link to="/admin/absence/requests">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>
        <CardBody>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
              <p>No leave requests pending approval</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingRequests.slice(0, 10).map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{request.employeeName || "Unknown"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{request.leaveTypeName || "Leave"}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{request.totalDays}</td>
                      <td className="px-6 py-4">{getStatusBadge(request.status)}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Button variant="outline" size="sm" className="text-green-600">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600">
                          <XCircle className="h-4 w-4" />
                        </Button>
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
