export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState, useCallback } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  AlertCircle,
  FileText,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Checkbox,
  type BadgeVariant,
  Spinner,
  ConfirmModal,
  toast,
} from "~/components/ui";
import { StatCard } from "~/components/ui/card";
import { ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";
import {
  usePendingApprovals,
  useApprovalActions,
  useBulkApprovalActions,
  type PendingApproval,
  type BulkApprovalItem,
  type BulkApprovalResult,
} from "~/hooks/use-manager";

const PRIORITY_COLORS: Record<string, BadgeVariant> = {
  low: "secondary",
  medium: "warning",
  high: "error",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ManagerTimesheetApprovalsPage() {
  const [confirmAction, setConfirmAction] = useState<{
    approval: PendingApproval;
    action: "approve" | "reject";
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkAction, setConfirmBulkAction] = useState<"approve" | "reject" | null>(null);

  const { approvals, isLoading, error } = usePendingApprovals("timesheet");
  const { approve, reject, isApproving, isRejecting } = useApprovalActions();
  const { bulkAction, isPending: isBulkPending } = useBulkApprovalActions();
  const queryClient = useQueryClient();

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = approvals.map((a) => a.id);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, [approvals]);

  const handleConfirm = () => {
    if (!confirmAction) return;

    const { approval, action } = confirmAction;
    const mutation = action === "approve" ? approve : reject;

    mutation(
      { id: approval.id, type: "timesheet" },
      {
        onSuccess: () => {
          toast.success(
            action === "approve"
              ? "Timesheet approved"
              : "Timesheet rejected"
          );
          queryClient.invalidateQueries({ queryKey: queryKeys.manager.approvals() });
          queryClient.invalidateQueries({ queryKey: queryKeys.manager.overview() });
          setConfirmAction(null);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(approval.id);
            return next;
          });
        },
        onError: (err) => {
          const message =
            err instanceof ApiError ? err.message : `Failed to ${action} timesheet`;
          toast.error(message);
        },
      }
    );
  };

  const handleBulkConfirm = useCallback(async () => {
    if (!confirmBulkAction || selectedIds.size === 0) return;

    const items: BulkApprovalItem[] = approvals
      .filter((a) => selectedIds.has(a.id))
      .map((a) => ({
        type: "timesheet" as const,
        id: a.id,
        action: confirmBulkAction,
      }));

    try {
      const result: BulkApprovalResult = await bulkAction(items);
      const approvedCount = result.approved.length;
      const failedCount = result.failed.length;

      if (failedCount === 0) {
        toast.success(
          `${approvedCount} timesheet${approvedCount !== 1 ? "s" : ""} ${confirmBulkAction === "approve" ? "approved" : "rejected"} successfully`
        );
      } else if (approvedCount === 0) {
        toast.error(
          `All ${failedCount} timesheet${failedCount !== 1 ? "s" : ""} failed to ${confirmBulkAction}`
        );
      } else {
        toast.warning(
          `${approvedCount} ${confirmBulkAction === "approve" ? "approved" : "rejected"}, ${failedCount} failed`
        );
      }

      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: queryKeys.manager.approvals() });
      queryClient.invalidateQueries({ queryKey: queryKeys.manager.overview() });
    } catch {
      toast.error(`Failed to ${confirmBulkAction} selected timesheets`);
    } finally {
      setConfirmBulkAction(null);
    }
  }, [confirmBulkAction, selectedIds, approvals, bulkAction, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && approvals.length === 0) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load timesheets.";

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/manager/approvals"
            className="text-gray-500 hover:text-gray-700"
            aria-label="Back to all approvals"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">Timesheet Approvals</h1>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800">Error loading data</h4>
              <p className="text-sm text-red-700 mt-1">{message}</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const pendingCount = approvals.length;
  const totalHoursSubmitted = approvals.reduce((sum, a) => {
    const metadata = a.metadata as { totalHours?: number };
    return sum + (metadata.totalHours ?? 0);
  }, 0);
  const totalOvertimeHours = approvals.reduce((sum, a) => {
    const metadata = a.metadata as { overtimeHours?: number };
    return sum + (metadata.overtimeHours ?? 0);
  }, 0);

  const selectedCount = approvals.filter((a) => selectedIds.has(a.id)).length;
  const allSelected =
    approvals.length > 0 && approvals.every((a) => selectedIds.has(a.id));
  const anyMutationPending = isApproving || isRejecting || isBulkPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/manager/approvals"
          className="text-gray-500 hover:text-gray-700"
          aria-label="Back to all approvals"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheet Approvals</h1>
          <p className="text-gray-600">Review and action submitted timesheets from your team</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Pending Timesheets"
          value={String(pendingCount)}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Total Hours"
          value={formatHours(totalHoursSubmitted)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Overtime Hours"
          value={formatHours(totalOvertimeHours)}
          icon={<AlertCircle className="h-5 w-5" />}
        />
      </div>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-blue-800">
            {selectedCount} timesheet{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            onClick={() => setConfirmBulkAction("approve")}
            disabled={anyMutationPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Bulk Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmBulkAction("reject")}
            disabled={anyMutationPending}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Bulk Reject
          </Button>
        </div>
      )}

      {/* Timesheet Cards */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Submitted Timesheets</h3>
            {approvals.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all timesheets"
                />
                <span className="text-sm text-gray-600">Select all</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">All caught up</h3>
              <p className="text-gray-500 mt-1">
                No pending timesheets to review.
              </p>
              <Link to="/manager/approvals" className="inline-block mt-4">
                <Button variant="outline" size="sm">
                  View All Approvals
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {approvals.map((approval) => {
                const metadata = approval.metadata as {
                  periodStart?: string;
                  periodEnd?: string;
                  totalHours?: number;
                  overtimeHours?: number;
                  regularHours?: number;
                };
                const isSelected = selectedIds.has(approval.id);

                return (
                  <div
                    key={approval.id}
                    className={`flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50/50" : ""}`}
                  >
                    <div className="pt-1 shrink-0">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleSelection(approval.id)}
                        aria-label={`Select timesheet from ${approval.requesterName}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">
                          {approval.requesterName}
                        </span>
                        <Badge variant={PRIORITY_COLORS[approval.priority] ?? "secondary"}>
                          {PRIORITY_LABELS[approval.priority] ?? approval.priority}
                        </Badge>
                      </div>

                      <p className="text-sm text-gray-700 mb-1">{approval.title}</p>

                      {metadata.periodStart && metadata.periodEnd && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                          <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                          <span>
                            Period: {new Date(metadata.periodStart).toLocaleDateString()} –{" "}
                            {new Date(metadata.periodEnd).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {metadata.totalHours !== undefined && (
                          <span className="font-medium">
                            Total: {formatHours(metadata.totalHours)}
                          </span>
                        )}
                        {metadata.regularHours !== undefined && (
                          <span>Regular: {formatHours(metadata.regularHours)}</span>
                        )}
                        {metadata.overtimeHours !== undefined && metadata.overtimeHours > 0 && (
                          <span className="text-amber-600 font-medium">
                            Overtime: {formatHours(metadata.overtimeHours)}
                          </span>
                        )}
                      </div>

                      {approval.description && (
                        <p className="text-sm text-gray-500 mt-1">
                          {approval.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>Submitted {new Date(approval.createdAt).toLocaleString()}</span>
                        {approval.dueDate && (
                          <span
                            className={
                              new Date(approval.dueDate) < new Date()
                                ? "text-red-500 font-medium"
                                : ""
                            }
                          >
                            Due {new Date(approval.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmAction({ approval, action: "reject" })
                        }
                        disabled={anyMutationPending}
                        aria-label={`Reject timesheet from ${approval.requesterName}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setConfirmAction({ approval, action: "approve" })
                        }
                        disabled={anyMutationPending}
                        aria-label={`Approve timesheet from ${approval.requesterName}`}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Single Confirmation Modal */}
      {confirmAction && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirm}
          title={`${confirmAction.action === "approve" ? "Approve" : "Reject"} Timesheet`}
          message={`Are you sure you want to ${confirmAction.action} the timesheet from ${confirmAction.approval.requesterName}?`}
          confirmLabel={confirmAction.action === "approve" ? "Approve" : "Reject"}
          danger={confirmAction.action === "reject"}
          loading={isApproving || isRejecting}
        />
      )}

      {/* Bulk Confirmation Modal */}
      {confirmBulkAction && (
        <ConfirmModal
          open
          onClose={() => setConfirmBulkAction(null)}
          onConfirm={handleBulkConfirm}
          title={`Bulk ${confirmBulkAction === "approve" ? "Approve" : "Reject"} Timesheets`}
          message={`Are you sure you want to ${confirmBulkAction} ${selectedCount} timesheet${selectedCount !== 1 ? "s" : ""}?`}
          confirmLabel={`${confirmBulkAction === "approve" ? "Approve" : "Reject"} ${selectedCount} Timesheet${selectedCount !== 1 ? "s" : ""}`}
          danger={confirmBulkAction === "reject"}
          loading={isBulkPending}
        />
      )}
    </div>
  );
}
