export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useMemo } from "react";
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
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import { Input, Textarea } from "~/components/ui/input";
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const approveMutation = useMutation({
    mutationFn: (timesheetId: string) =>
      api.post(`/time/timesheets/${timesheetId}/approve`, { action: "approve" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-timesheets"] });
      toast.success("Timesheet approved");
    },
    onError: () => {
      toast.error("Failed to approve timesheet", {
        message: "Please try again.",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ timesheetId, reason }: { timesheetId: string; reason: string }) =>
      api.post(`/time/timesheets/${timesheetId}/approve`, { action: "reject", comments: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-timesheets"] });
      toast.success("Timesheet rejected");
    },
    onError: () => {
      toast.error("Failed to reject timesheet", {
        message: "Please try again.",
      });
    },
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          api.post(`/time/timesheets/${id}/approve`, { action: "approve" })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`${failed} of ${ids.length} approvals failed`);
      }
      return results;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["admin-timesheets"] });
      toast.success(`${ids.length} timesheet${ids.length > 1 ? "s" : ""} approved`);
      setSelectedIds(new Set());
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ["admin-timesheets"] });
      toast.error("Some approvals failed", {
        message: error instanceof Error ? error.message : "Please try again.",
      });
      setSelectedIds(new Set());
    },
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      toast.info("Preparing export...");
      const exportData = await api.get<{ items: Timesheet[] }>(
        "/time/timesheets",
        { params: { limit: 10000 } }
      );
      const rows = exportData?.items || [];
      if (rows.length === 0) {
        toast.info("No data to export");
        return;
      }
      const csvHeaders = [
        "Employee",
        "Period Start",
        "Period End",
        "Regular Hours",
        "Overtime Hours",
        "Total Hours",
        "Status",
        "Submitted At",
        "Approved At",
      ];
      const csvRows = rows.map((row) => [
        JSON.stringify(row.employeeName || "Unknown"),
        JSON.stringify(row.periodStart),
        JSON.stringify(row.periodEnd),
        (row.totalRegularHours ?? 0).toFixed(1),
        (row.totalOvertimeHours ?? 0).toFixed(1),
        ((row.totalRegularHours ?? 0) + (row.totalOvertimeHours ?? 0)).toFixed(1),
        JSON.stringify(statusLabels[row.status] || row.status),
        JSON.stringify(row.submittedAt || ""),
        JSON.stringify(row.approvedAt || ""),
      ]);
      const csv = [csvHeaders.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timesheets-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const timesheets = data?.items || [];

  const submittedTimesheets = timesheets.filter((t) => t.status === "submitted");
  const allSubmittedSelected =
    submittedTimesheets.length > 0 &&
    submittedTimesheets.every((t) => selectedIds.has(t.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSubmittedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submittedTimesheets.map((t) => t.id)));
    }
  };

  const handleBulkApprove = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkApproveMutation.mutate(ids);
  };

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleReject = (timesheetId: string) => {
    setRejectTarget(timesheetId);
    setRejectReason("");
  };

  const handleConfirmReject = () => {
    if (!rejectTarget || !rejectReason.trim()) {
      toast.warning("Please enter a rejection reason");
      return;
    }
    rejectMutation.mutate({ timesheetId: rejectTarget, reason: rejectReason.trim() });
    setRejectTarget(null);
    setRejectReason("");
  };

  const getStatusBadge = (status: string) => (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || "bg-gray-100"}`}>
      {statusLabels[status] || status}
    </span>
  );

  const stats = useMemo(() => ({
    total: timesheets.length,
    pending: timesheets.filter((t) => t.status === "submitted").length,
    approved: timesheets.filter((t) => t.status === "approved").length,
    rejected: timesheets.filter((t) => t.status === "rejected").length,
  }), [timesheets]);

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
        {selectedIds.size > 0 && (
          <Button
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
          >
            <Check className="h-4 w-4 mr-2" />
            {bulkApproveMutation.isPending
              ? "Approving..."
              : `Approve ${selectedIds.size} Selected`}
          </Button>
        )}
        <Button variant="outline" onClick={handleExport} disabled={isExporting}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? "Exporting..." : "Export"}
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
              <Input
                placeholder="Search by employee name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                aria-label="Search timesheets by employee name"
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
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSubmittedSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all submitted timesheets"
                        className="rounded border-gray-300"
                        disabled={submittedTimesheets.length === 0}
                      />
                    </th>
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
                      <td className="px-4 py-4 w-10">
                        {timesheet.status === "submitted" && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(timesheet.id)}
                            onChange={() => toggleSelect(timesheet.id)}
                            aria-label={`Select timesheet for ${timesheet.employeeName || "employee"}`}
                            className="rounded border-gray-300"
                          />
                        )}
                      </td>
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

      {/* Rejection Reason Modal */}
      {rejectTarget && (
        <Modal open onClose={() => !rejectMutation.isPending && setRejectTarget(null)}>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900">Reject Timesheet</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Please provide a reason for rejecting this timesheet.
              </p>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Enter rejection reason..."
                label="Rejection Reason"
                required
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejectMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
