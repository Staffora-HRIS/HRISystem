import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  FileSpreadsheet,
  Check,
  X,
  Clock,
  Search,
  Download,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Timesheet {
  id: string;
  employeeId: string;
  employeeName?: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  totalRegularHours: number;
  totalOvertimeHours: number;
  submittedAt?: string;
  approvedAt?: string;
  approvedById?: string;
  createdAt: string;
  updatedAt: string;
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function TimesheetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-timesheets", statusFilter, search],
    queryFn: () => api.get<{ items: Timesheet[]; cursor: string | null; hasMore: boolean }>(
      "/time/timesheets",
      {
        params: {
          status: statusFilter || undefined,
          search: search || undefined,
        },
      }
    ),
  });

  const approveMutation = useMutation({
    mutationFn: (timesheetId: string) =>
      api.post(`/time/timesheets/${timesheetId}/approve`, { action: "approve" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-timesheets"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ timesheetId, reason }: { timesheetId: string; reason: string }) =>
      api.post(`/time/timesheets/${timesheetId}/approve`, { action: "reject", comments: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-timesheets"] });
    },
  });

  const timesheets = data?.items || [];

  const handleReject = (timesheetId: string) => {
    const reason = prompt("Enter rejection reason:");
    if (reason) {
      rejectMutation.mutate({ timesheetId, reason });
    }
  };

  const getStatusBadge = (status: string) => (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || "bg-gray-100"}`}>
      {statusLabels[status] || status}
    </span>
  );

  const stats = {
    total: timesheets.length,
    pending: timesheets.filter((t) => t.status === "submitted").length,
    approved: timesheets.filter((t) => t.status === "approved").length,
    rejected: timesheets.filter((t) => t.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/time")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-gray-600">Review and approve employee timesheets</p>
        </div>
        <Button variant="outline" onClick={() => toast.info("Coming Soon", { message: "Timesheet export will be available in a future update." })}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-sm text-gray-500">Total Timesheets</p>
          </CardBody>
        </Card>
        <Card className={stats.pending > 0 ? "border-yellow-300" : ""}>
          <CardBody className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-sm text-gray-500">Pending Approval</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
            <p className="text-sm text-gray-500">Approved</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            <p className="text-sm text-gray-500">Rejected</p>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by employee name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              {["", "submitted", "approved", "rejected"].map((status) => (
                <Button
                  key={status || "all"}
                  variant={statusFilter === status ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "" ? "All" : statusLabels[status]}
                </Button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Timesheets Table */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Timesheets
            </h3>
            <span className="text-sm text-gray-500">{timesheets.length} records</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : timesheets.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Clock className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No timesheets found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Regular Hours
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overtime
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {timesheets.map((timesheet) => (
                    <tr key={timesheet.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">
                          {timesheet.employeeName || "Unknown"}
                        </div>
                        {timesheet.submittedAt && (
                          <div className="text-xs text-gray-400">
                            Submitted {new Date(timesheet.submittedAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(timesheet.periodStart).toLocaleDateString()} -{" "}
                        {new Date(timesheet.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {(timesheet.totalRegularHours ?? 0).toFixed(1)}h
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {(timesheet.totalOvertimeHours ?? 0) > 0 ? (
                          <span className="text-orange-600 font-medium">
                            {(timesheet.totalOvertimeHours ?? 0).toFixed(1)}h
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {((timesheet.totalRegularHours ?? 0) + (timesheet.totalOvertimeHours ?? 0)).toFixed(1)}h
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(timesheet.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {timesheet.status === "submitted" && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => approveMutation.mutate(timesheet.id)}
                                disabled={approveMutation.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleReject(timesheet.id)}
                                disabled={rejectMutation.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/time/timesheets/${timesheet.id}`)}
                          >
                            View
                          </Button>
                        </div>
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
