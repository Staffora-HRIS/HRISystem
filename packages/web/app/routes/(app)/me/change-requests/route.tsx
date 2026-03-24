import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
  FileText,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  ConfirmModal,
  useToast,
} from "~/components/ui";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

// =============================================================================
// Types
// =============================================================================

interface ChangeRequest {
  id: string;
  tenant_id: string;
  employee_id: string;
  field_category: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  requires_approval: boolean;
  status: string;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  employee_name?: string;
  reviewer_name?: string;
}

interface ChangeRequestListResponse {
  items: ChangeRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "success" | "error" | "info"; icon: typeof Clock }> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  approved: { label: "Approved", variant: "success", icon: CheckCircle },
  rejected: { label: "Rejected", variant: "error", icon: XCircle },
  cancelled: { label: "Cancelled", variant: "info", icon: X },
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  personal: {
    first_name: "First Name",
    last_name: "Last Name",
    middle_name: "Middle Name",
    preferred_name: "Preferred Name",
    date_of_birth: "Date of Birth",
    gender: "Gender",
    marital_status: "Marital Status",
    nationality: "Nationality",
    ni_number: "NI Number",
  },
  bank_details: {
    account_holder_name: "Account Holder Name",
    sort_code: "Sort Code",
    account_number: "Account Number",
    bank_name: "Bank Name",
    building_society_ref: "Building Society Ref",
  },
  contact: {
    phone: "Phone",
    mobile: "Mobile",
    personal_email: "Personal Email",
  },
  address: {
    address_line_1: "Address Line 1",
    address_line_2: "Address Line 2",
    city: "City",
    county: "County",
    postcode: "Postcode",
    country: "Country",
  },
  emergency_contact: {
    name: "Contact Name",
    relationship: "Relationship",
    phone: "Contact Phone",
    email: "Contact Email",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  personal: "Personal Details",
  bank_details: "Bank Details",
  contact: "Contact Information",
  address: "Address",
  emergency_contact: "Emergency Contact",
};

function getFieldLabel(category: string, fieldName: string): string {
  return FIELD_LABELS[category]?.[fieldName] || fieldName.replace(/_/g, " ");
}

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, " ");
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// Component
// =============================================================================

export default function ChangeRequestsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // Fetch change requests
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["portal", "change-requests", statusFilter],
    queryFn: () =>
      api.get<ChangeRequestListResponse>("/portal/change-requests", {
        params: {
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          limit: 50,
        },
      }),
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/portal/change-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "change-requests"] });
      toast.success("Change request cancelled");
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to cancel request";
      toast.error(message);
    },
  });

  const requests = data?.items ?? [];

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]" role="status">
        <Spinner size="lg" />
        <span className="sr-only">Loading change requests...</span>
      </div>
    );
  }

  // Error
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-700 dark:text-gray-300 font-medium">
          Failed to load change requests
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {error instanceof ApiError ? error.message : "An unexpected error occurred."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Change Requests
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Track the status of your personal details change requests
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
          { value: "cancelled", label: "Cancelled" },
        ].map((tab) => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "primary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Requests list */}
      {requests.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No change requests
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {statusFilter === "all"
                ? "You have not submitted any change requests yet. You can request changes from your profile page."
                : `No ${statusFilter} change requests found.`}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const config = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;

            return (
              <Card key={request.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 ${
                        request.status === "pending" ? "bg-amber-100 dark:bg-amber-900" :
                        request.status === "approved" ? "bg-green-100 dark:bg-green-900" :
                        request.status === "rejected" ? "bg-red-100 dark:bg-red-900" :
                        "bg-gray-100 dark:bg-gray-800"
                      }`}>
                        <StatusIcon className={`h-5 w-5 ${
                          request.status === "pending" ? "text-amber-600 dark:text-amber-400" :
                          request.status === "approved" ? "text-green-600 dark:text-green-400" :
                          request.status === "rejected" ? "text-red-600 dark:text-red-400" :
                          "text-gray-500 dark:text-gray-400"
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {getFieldLabel(request.field_category, request.field_name)}
                          </span>
                          <Badge variant={config.variant}>{config.label}</Badge>
                          {request.requires_approval && (
                            <Badge variant="info">Requires Approval</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {getCategoryLabel(request.field_category)}
                        </p>
                        <div className="mt-2 text-sm">
                          {request.old_value && (
                            <p className="text-gray-500 dark:text-gray-400">
                              From: <span className="line-through">{request.old_value}</span>
                            </p>
                          )}
                          <p className="text-gray-900 dark:text-gray-100">
                            To: <span className="font-medium">{request.new_value}</span>
                          </p>
                        </div>
                        {request.reviewer_notes && (
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
                            Reviewer: {request.reviewer_notes}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">
                          Submitted {formatDate(request.created_at)}
                          {request.reviewed_at && ` / Reviewed ${formatDate(request.reviewed_at)}`}
                        </p>
                      </div>
                    </div>

                    {request.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelConfirmId(request.id)}
                        disabled={cancelMutation.isPending}
                        aria-label="Cancel request"
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={cancelConfirmId !== null}
        onClose={() => setCancelConfirmId(null)}
        onConfirm={() => {
          if (cancelConfirmId) {
            cancelMutation.mutate(cancelConfirmId);
          }
          setCancelConfirmId(null);
        }}
        title="Cancel Change Request"
        message="Are you sure you want to cancel this change request?"
        confirmLabel="Cancel Request"
        danger
        loading={cancelMutation.isPending}
      />
    </div>
  );
}
