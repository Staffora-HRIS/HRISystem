export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  PoundSterling,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  AlertCircle,
  FileText,
  Receipt,
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

export default function ManagerExpenseApprovalsPage() {
  const [confirmAction, setConfirmAction] = useState<{
    approval: PendingApproval;
    action: "approve" | "reject";
  } | null>(null);

  const { approvals, isLoading, error } = usePendingApprovals("expense");
  const { approve, reject, isApproving, isRejecting } = useApprovalActions();
  const queryClient = useQueryClient();

  const handleConfirm = () => {
    if (!confirmAction) return;

    const { approval, action } = confirmAction;
    const mutation = action === "approve" ? approve : reject;

    mutation(
      { id: approval.id, type: "expense" },
      {
        onSuccess: () => {
          toast.success(
            action === "approve"
              ? "Expense claim approved"
              : "Expense claim rejected"
          );
          queryClient.invalidateQueries({ queryKey: queryKeys.manager.approvals() });
          queryClient.invalidateQueries({ queryKey: queryKeys.manager.overview() });
          setConfirmAction(null);
        },
        onError: (err) => {
          const message =
            err instanceof ApiError ? err.message : `Failed to ${action} expense claim`;
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
          : "Unable to load expense claims.";

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/manager/approvals"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            aria-label="Back to all approvals"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expense Approvals</h1>
        </div>
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800 dark:text-red-300">Error loading data</h4>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">{message}</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const pendingCount = approvals.length;
  const totalAmount = approvals.reduce((sum, a) => {
    const metadata = a.metadata as { amount?: number };
    return sum + (metadata.amount ?? 0);
  }, 0);
  const highPriority = approvals.filter((a) => a.priority === "high").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/manager/approvals"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          aria-label="Back to all approvals"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expense Approvals</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review and action submitted expense claims from your team
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Pending Claims"
          value={String(pendingCount)}
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          title="Total Amount"
          value={formatCurrency(totalAmount)}
          icon={<PoundSterling className="h-5 w-5" />}
        />
        <StatCard
          title="High Priority"
          value={String(highPriority)}
          icon={<AlertCircle className="h-5 w-5" />}
        />
      </div>

      {/* Expense Claim Cards */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900 dark:text-white">Submitted Expense Claims</h3>
        </CardHeader>
        <CardBody className="p-0">
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">All caught up</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                No pending expense claims to review.
              </p>
              <Link to="/manager/approvals" className="inline-block mt-4">
                <Button variant="outline" size="sm">
                  View All Approvals
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {approvals.map((approval) => {
                const metadata = approval.metadata as {
                  amount?: number;
                  currency?: string;
                  category?: string;
                  receiptUrl?: string;
                  merchant?: string;
                  expenseDate?: string;
                  items?: Array<{ description: string; amount: number }>;
                };

                return (
                  <div
                    key={approval.id}
                    className="flex items-start justify-between gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {approval.requesterName}
                        </span>
                        <Badge variant={PRIORITY_COLORS[approval.priority] ?? "secondary"}>
                          {PRIORITY_LABELS[approval.priority] ?? approval.priority}
                        </Badge>
                        {metadata.category && (
                          <Badge variant="outline">{metadata.category}</Badge>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                        {approval.title}
                      </p>

                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-1">
                        {metadata.amount !== undefined && (
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatCurrency(metadata.amount)}
                          </span>
                        )}
                        {metadata.merchant && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                            {metadata.merchant}
                          </span>
                        )}
                        {metadata.expenseDate && (
                          <span>
                            {new Date(metadata.expenseDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {metadata.items && metadata.items.length > 0 && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {metadata.items.length} {metadata.items.length === 1 ? "item" : "items"}
                        </div>
                      )}

                      {approval.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {approval.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-gray-400">
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
                        aria-label={`Reject expense claim from ${approval.requesterName}`}
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
                        aria-label={`Approve expense claim from ${approval.requesterName}`}
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
          title={`${confirmAction.action === "approve" ? "Approve" : "Reject"} Expense Claim`}
          message={`Are you sure you want to ${confirmAction.action} the expense claim from ${confirmAction.approval.requesterName}?`}
          confirmLabel={confirmAction.action === "approve" ? "Approve" : "Reject"}
          danger={confirmAction.action === "reject"}
          loading={isApproving || isRejecting}
        />
      )}
    </div>
  );
}
