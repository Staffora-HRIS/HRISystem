import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, CheckCircle, XCircle, Plus, Filter } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { Button, Badge, Modal, ModalHeader, ModalBody, ModalFooter, Input, Select, toast } from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee: { id: string; firstName: string; lastName: string } | null;
  tenant: { id: string; name: string };
};

type LeaveRequest = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
};

type LeaveRequestsResponse = {
  items: LeaveRequest[];
  cursor: string | null;
  hasMore: boolean;
};

const LEAVE_TYPES = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
];

export default function MyLeavePage() {
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [newRequest, setNewRequest] = useState({
    leaveType: "annual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  const employeeId = me?.employee?.id ?? null;

  const {
    data: requests,
    isLoading: requestsLoading,
    error: requestsError,
  } = useQuery({
    queryKey: ["absence", "requests", { employeeId }],
    enabled: Boolean(employeeId),
    queryFn: () =>
      api.get<LeaveRequestsResponse>("/absence/requests", {
        params: { employeeId: employeeId as string, limit: 20 },
      }),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return false;
      return failureCount < 2;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { leaveTypeId: string; startDate: string; endDate: string; reason?: string }) =>
      api.post("/absence/requests", data),
    onSuccess: () => {
      toast.success("Leave request submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["absence", "requests"] });
      setShowNewRequest(false);
      setNewRequest({ leaveType: "annual", startDate: "", endDate: "", reason: "" });
    },
    onError: () => {
      toast.error("Failed to submit leave request");
    },
  });

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!me) {
    const message =
      meError instanceof ApiError
        ? meError.message
        : meError instanceof Error
          ? meError.message
          : "Unable to load your profile.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Leave</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  if (!me.employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Leave</h1>
        <p className="text-gray-500">No employee profile is linked to your account.</p>
      </div>
    );
  }

  const items = requests?.items ?? [];
  const pending = items.filter((r) => r.status === "pending").length;
  const approved = items.filter((r) => r.status === "approved").length;
  const rejected = items.filter((r) => r.status === "rejected").length;

  const filteredItems = filter === "all" ? items : items.filter((r) => r.status === filter);

  const requestsMessage = (() => {
    if (!requestsError) return null;
    if (requestsError instanceof ApiError && requestsError.status === 403) {
      return "You don't have access to self-service leave requests yet.";
    }
    if (requestsError instanceof ApiError && requestsError.status === 401) {
      return "Please sign in again to view leave requests.";
    }
    return requestsError instanceof Error ? requestsError.message : "Unable to load leave requests.";
  })();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "pending": return <Badge variant="warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSubmitRequest = () => {
    if (!newRequest.startDate || !newRequest.endDate) {
      toast.error("Please select start and end dates");
      return;
    }
    createMutation.mutate({
      leaveTypeId: newRequest.leaveType,
      startDate: newRequest.startDate,
      endDate: newRequest.endDate,
      reason: newRequest.reason || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Leave</h1>
          <p className="text-gray-600">
            {me.employee.firstName} {me.employee.lastName} · Manage your time off requests
          </p>
        </div>
        <Button onClick={() => setShowNewRequest(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Requests" value={String(items.length)} icon={<Calendar className="h-5 w-5" />} />
        <StatCard title="Pending" value={String(pending)} icon={<Clock className="h-5 w-5" />} />
        <StatCard title="Approved" value={String(approved)} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard title="Rejected" value={String(rejected)} icon={<XCircle className="h-5 w-5" />} />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <div className="flex gap-2">
          {["all", "pending", "approved", "rejected"].map((f) => (
            <Button
              key={f}
              variant={filter === f ? "primary" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Request List */}
      {requestsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : requestsMessage ? (
        <Card>
          <CardBody className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">{requestsMessage}</p>
          </CardBody>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No leave requests</h3>
            <p className="text-gray-500 mb-4">You haven't submitted any leave requests yet.</p>
            <Button onClick={() => setShowNewRequest(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Request Time Off
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(r.status)}
                      <Badge variant="outline">{r.totalDays} day{r.totalDays !== 1 ? "s" : ""}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-4 w-4" />
                      {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Submitted {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">View</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      <Modal open={showNewRequest} onClose={() => setShowNewRequest(false)} size="md">
        <ModalHeader>
          <h3 className="text-lg font-semibold">Request Time Off</h3>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
            <Select
              value={newRequest.leaveType}
              onChange={(e) => setNewRequest({ ...newRequest, leaveType: e.target.value })}
              options={LEAVE_TYPES}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <Input
                type="date"
                value={newRequest.startDate}
                onChange={(e) => setNewRequest({ ...newRequest, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <Input
                type="date"
                value={newRequest.endDate}
                onChange={(e) => setNewRequest({ ...newRequest, endDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
            <Input
              placeholder="Enter reason for leave..."
              value={newRequest.reason}
              onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowNewRequest(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmitRequest} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
