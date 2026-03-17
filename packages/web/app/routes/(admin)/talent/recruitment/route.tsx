export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Users, MapPin, Calendar, Building, Search, BarChart3, X } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Requisition {
  id: string;
  code: string;
  title: string;
  department?: string;
  orgUnitName?: string;
  location?: string;
  employmentType?: "fullTime" | "partTime" | "contract" | "temporary";
  status: "draft" | "open" | "on_hold" | "filled" | "cancelled";
  candidateCount?: number;
  hiringManagerName?: string;
  createdAt: string;
  deadline?: string;
  openings: number;
  filled: number;
  priority: number;
}

interface RequisitionStats {
  totalRequisitions: number;
  openCount: number;
  onHoldCount: number;
  filledCount: number;
  totalOpenings: number;
  totalFilled: number;
}

interface RequisitionFormData {
  title: string;
  openings: string;
  priority: string;
  employmentType: string;
  jobDescription: string;
  location: string;
  deadline: string;
}

const initialReqForm: RequisitionFormData = {
  title: "",
  openings: "1",
  priority: "3",
  employmentType: "",
  jobDescription: "",
  location: "",
  deadline: "",
};

export default function RecruitmentPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<RequisitionFormData>(initialReqForm);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-requisitions", statusFilter, search],
    queryFn: () => api.get<{ requisitions: Requisition[]; count: number }>(
      `/recruitment/requisitions`,
      {
        params: {
          status: statusFilter !== "all" ? statusFilter : undefined,
          search: search || undefined,
        },
      }
    ),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-requisition-stats"],
    queryFn: () => api.get<RequisitionStats>("/recruitment/requisitions/stats"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/recruitment/requisitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-requisition-stats"] });
      toast.success("Requisition created successfully");
      setShowCreateModal(false);
      setFormData(initialReqForm);
    },
    onError: () => {
      toast.error("Failed to create requisition", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreateRequisition = () => {
    if (!formData.title.trim()) {
      toast.warning("Please enter a job title");
      return;
    }
    const payload: Record<string, unknown> = {
      title: formData.title.trim(),
      openings: Number(formData.openings) || 1,
      priority: Number(formData.priority) || 3,
    };
    if (formData.employmentType) payload.employmentType = formData.employmentType;
    if (formData.jobDescription.trim()) payload.jobDescription = formData.jobDescription.trim();
    if (formData.location.trim()) payload.location = formData.location.trim();
    if (formData.deadline) payload.deadline = formData.deadline;

    createMutation.mutate(payload);
  };

  const requisitions = data?.requisitions || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="success">Open</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "on_hold": return <Badge variant="warning">On Hold</Badge>;
      case "filled": return <Badge variant="info">Filled</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getEmploymentTypeBadge = (type?: string) => {
    switch (type) {
      case "fullTime": return <Badge variant="info">Full-time</Badge>;
      case "partTime": return <Badge variant="secondary">Part-time</Badge>;
      case "contract": return <Badge variant="warning">Contract</Badge>;
      case "temporary": return <Badge variant="secondary">Temporary</Badge>;
      default: return null;
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return <Badge variant="destructive">Urgent</Badge>;
      case 2: return <Badge variant="warning">High</Badge>;
      case 3: return null; // Normal priority, no badge
      case 4: return <Badge variant="secondary">Low</Badge>;
      case 5: return <Badge variant="secondary">Lowest</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Recruitment</h1>
          <p className="text-gray-600">Manage job requisitions and candidates</p>
        </div>
        <Button onClick={() => navigate("/admin/talent/recruitment/candidates")}>
          <Users className="h-4 w-4 mr-2" />
          View Candidates
        </Button>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Requisition
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total Requisitions" value={stats.totalRequisitions} icon={<Building className="h-5 w-5" />} />
          <StatCard title="Open Positions" value={stats.openCount} icon={<Users className="h-5 w-5" />} />
          <StatCard title="On Hold" value={stats.onHoldCount} icon={<Calendar className="h-5 w-5" />} />
          <StatCard title="Filled" value={stats.filledCount} icon={<BarChart3 className="h-5 w-5" />} />
          <StatCard title="Openings Remaining" value={(stats.totalOpenings ?? 0) - (stats.totalFilled ?? 0)} icon={<Users className="h-5 w-5" />} />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search requisitions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <div className="flex gap-2">
              {["all", "open", "draft", "on_hold", "filled"].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "all" ? "All" : status.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                </Button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : requisitions.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No requisitions found</h3>
            <p className="text-gray-500 mb-4">Create your first job requisition to start recruiting.</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Requisition
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {requisitions.map((req) => (
            <Card key={req.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{req.title}</h3>
                    <span className="text-xs text-gray-500">({req.code})</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(req.status)}
                    {getEmploymentTypeBadge(req.employmentType)}
                    {getPriorityLabel(req.priority)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Users className="h-4 w-4" />
                    {req.candidateCount || 0} candidates
                  </div>
                  <div className="text-xs text-gray-400">
                    {req.filled}/{req.openings} filled
                  </div>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(req.orgUnitName || req.department) && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <Building className="h-4 w-4" />
                      {req.orgUnitName || req.department}
                    </div>
                  )}
                  {req.location && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <MapPin className="h-4 w-4" />
                      {req.location}
                    </div>
                  )}
                  {req.deadline && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      Deadline: {new Date(req.deadline).toLocaleDateString()}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    Created: {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {req.hiringManagerName && (
                  <div className="text-sm text-gray-500">
                    Hiring Manager: {req.hiringManagerName}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/admin/talent/recruitment/candidates?requisitionId=${req.id}`)}
                  >
                    View Candidates
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create Requisition Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Create Requisition">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Create Requisition</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="req-title" className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                <input
                  id="req-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Senior Software Engineer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="req-openings" className="block text-sm font-medium text-gray-700 mb-1">Openings</label>
                  <input
                    id="req-openings"
                    type="number"
                    min={1}
                    value={formData.openings}
                    onChange={(e) => setFormData({ ...formData, openings: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  />
                </div>
                <div>
                  <label htmlFor="req-priority" className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    id="req-priority"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="1">Urgent</option>
                    <option value="2">High</option>
                    <option value="3">Normal</option>
                    <option value="4">Low</option>
                    <option value="5">Lowest</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="req-type" className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                  <select
                    id="req-type"
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="">Not specified</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="temporary">Temporary</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="req-deadline" className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <input
                    id="req-deadline"
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="req-location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  id="req-location"
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="London, UK"
                />
              </div>
              <div>
                <label htmlFor="req-desc" className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <textarea
                  id="req-desc"
                  value={formData.jobDescription}
                  onChange={(e) => setFormData({ ...formData, jobDescription: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Describe the role..."
                />
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreateRequisition}
                disabled={!formData.title.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Requisition"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
