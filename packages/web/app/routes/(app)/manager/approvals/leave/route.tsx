export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
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
  type PendingApproval,
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

export default function ManagerLeaveApprovalsPage() {
  const [confirmAction, setConfirmAction] = useState<{
    approval: PendingApproval;
    action: "approve" | "reject";
  } | null>(null);

  const { approvals, isLoading, error } = usePendingApprovals("leave");
  const { approve, reject, isApproving, isRejecting } = useApprovalActions();
  const queryClient = useQueryClient();

  const handleConfirm = () => {
    if (!confirmAction) return;

    const { approval, action } = confirmAction;
    const mutation = action === "approve" ? approve : reject;

    mutation(
      { id: approval.id, type: "leave" },
      {
        onSuccess: () => {
          toast.success(
            action === "approve"
              ? "Leave request approved"
              : "Leave request rejected"
          );
          queryClient.invalidateQueries({ queryKey: queryKeys.manager.approvals() });
          queryClient.invalidateQueries({ queryKey: queryKeys.manager.overview() });
          setConfirmAction(null);
        },
        onError: (err) => {
          const message =
            err instanceof ApiError ? err.message : `Failed to ${action} request`;
          toast.error(message);
        },
      }
    );
  };

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
          : "Unable to load leave requests.";

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
          <h1 className="text-2xl font-bold">Leave Approvals</h1>
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
  const highPriority = approvals.filter((a) => a.priority === "high").length;
  const overdue = approvals.filter(
    (a) => a.dueDate && new Date(a.dueDate) < new Date()
  ).length;

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
          <h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
          <p className="text-gray-600">Review and action pending leave requests from your team</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Pending Requests"
          value={String(pendingCount)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="High Priority"
          value={String(highPriority)}
          icon={<AlertCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Overdue"
          value={String(overdue)}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Leave Request Cards */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Pending Leave Requests</h3>
        </CardHeader>
        <CardBody className="p-0">
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">All caught up</h3>
              <p className="text-gray-500 mt-1">
                No pending leave requests to review.
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
                  leaveType?: string;
                  startDate?: string;
                  endDate?: string;
                  totalDays?: number;
                  reason?: string;
                };

                return (
                  <div
                    key={approval.id}
                    className="flex items-start justify-between gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">
                          {approval.requesterName}
                        </span>
                        <Badge variant={PRIORITY_COLORS[approval.priority] ?? "secondary"}>
                          {PRIORITY_LABELS[approval.priority] ?? approval.priority}
                        </Badge>
                        {metadata.leaveType && (
                          <Badge variant="outline">{metadata.leaveType}</Badge>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 mb-1">{approval.title}</p>

                      {metadata.startDate && metadata.endDate && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                          <span>
                            {new Date(metadata.startDate).toLocaleDateString()} –{" "}
                            {new Date(metadata.endDate).toLocaleDateString()}
                          </span>
                          {metadata.totalDays !== undefined && (
                            <span className="text-gray-500">
                              ({metadata.totalDays} {metadata.totalDays === 1 ? "day" : "days"})
                            </span>
                          )}
                        </div>
                      )}

                      {metadata.reason && (
                        <p className="text-sm text-gray-500 mt-1">
                          Reason: {metadata.reason}
                        </p>
                      )}

                      {approval.description && !metadata.reason && (
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
                        disabled={isApproving || isRejecting}
                        aria-label={`Reject leave request from ${approval.requesterName}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setConfirmAction({ approval, action: "approve" })
                        }
                        disabled={isApproving || isRejecting}
                        aria-label={`Approve leave request from ${approval.requesterName}`}
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

      {/* Confirmation Modal */}
      {confirmAction && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirm}
          title={`${confirmAction.action === "approve" ? "Approve" : "Reject"} Leave Request`}
          message={`Are you sure you want to ${confirmAction.action} the leave request from ${confirmAction.approval.requesterName}?`}
          confirmLabel={confirmAction.action === "approve" ? "Approve" : "Reject"}
          danger={confirmAction.action === "reject"}
          loading={isApproving || isRejecting}
        />
      )}
    </div>
  );
}
