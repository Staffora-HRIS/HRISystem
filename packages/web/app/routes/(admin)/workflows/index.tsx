import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Play, Pause, Settings, X } from "lucide-react";
import { Card, CardHeader, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  triggerType: "manual" | "event" | "scheduled";
  status: "draft" | "active" | "inactive" | "archived";
  version: number;
  createdAt: string;
}

interface WorkflowFormData {
  code: string;
  name: string;
  description: string;
  category: string;
  triggerType: "manual" | "event" | "scheduled";
}

const initialWorkflowForm: WorkflowFormData = {
  code: "",
  name: "",
  description: "",
  category: "hr",
  triggerType: "manual",
};

export default function WorkflowsAdminPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<WorkflowFormData>(initialWorkflowForm);

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-definitions"],
    queryFn: () => api.get<{ items: WorkflowDefinition[]; nextCursor: string | null; hasMore: boolean }>("/workflows/definitions"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/workflows/definitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-definitions"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all() });
      toast.success("Workflow created successfully");
      setShowCreateModal(false);
      setFormData(initialWorkflowForm);
    },
    onError: () => {
      toast.error("Failed to create workflow", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreate = () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.warning("Please fill in required fields");
      return;
    }
    createMutation.mutate({
      code: formData.code.trim(),
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      category: formData.category,
      triggerType: formData.triggerType,
      steps: [
        {
          stepKey: "start",
          name: "Start",
          type: "approval",
          assigneeType: "role",
          assigneeValue: "admin",
          order: 1,
        },
      ],
    });
  };

  const definitions = data?.items || [];

  const stats = {
    total: definitions.length,
    active: definitions.filter(d => d.status === "active").length,
    draft: definitions.filter(d => d.status === "draft").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="success">Active</Badge>;
      case "draft": return <Badge variant="warning">Draft</Badge>;
      case "inactive": return <Badge variant="secondary">Inactive</Badge>;
      case "archived": return <Badge variant="secondary">Archived</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getTriggerBadge = (trigger: string) => {
    switch (trigger) {
      case "manual": return <Badge variant="info">Manual</Badge>;
      case "event": return <Badge variant="info">Event</Badge>;
      case "scheduled": return <Badge variant="info">Scheduled</Badge>;
      default: return <Badge>{trigger}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Administration</h1>
          <p className="text-gray-600">Manage workflow definitions and automation</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Workflows" value={stats.total} icon={<GitBranch className="h-5 w-5" />} />
        <StatCard title="Active" value={stats.active} icon={<Play className="h-5 w-5" />} />
        <StatCard title="Draft" value={stats.draft} icon={<Pause className="h-5 w-5" />} />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : definitions.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <GitBranch className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No workflows defined</h3>
            <p className="text-gray-500 mb-4">Create your first workflow to automate HR processes.</p>
            <Button onClick={() => setShowCreateModal(true)}>Create Workflow</Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {definitions.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                  <span className="text-xs text-gray-500 font-mono">{workflow.code}</span>
                </div>
                {getStatusBadge(workflow.status)}
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{workflow.description}</p>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="secondary">{workflow.category}</Badge>
                  {getTriggerBadge(workflow.triggerType)}
                  <span className="text-xs text-gray-500">v{workflow.version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Created {new Date(workflow.createdAt).toLocaleDateString()}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => toast.info("Coming Soon", { message: "Workflow configuration will be available in a future update." })}>
                    <Settings className="h-4 w-4 mr-1" />
                    Configure
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" role="dialog" aria-modal="true" aria-label="Create Workflow">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Create Workflow</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="wf-code" className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input
                  id="wf-code"
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="leave-approval"
                />
              </div>
              <div>
                <label htmlFor="wf-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  id="wf-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Leave Approval Workflow"
                />
              </div>
              <div>
                <label htmlFor="wf-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  id="wf-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Describe what this workflow does..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="wf-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    id="wf-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="hr">HR</option>
                    <option value="leave">Leave</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="offboarding">Offboarding</option>
                    <option value="recruitment">Recruitment</option>
                    <option value="performance">Performance</option>
                    <option value="compliance">Compliance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="wf-trigger" className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
                  <select
                    id="wf-trigger"
                    value={formData.triggerType}
                    onChange={(e) => setFormData({ ...formData, triggerType: e.target.value as WorkflowFormData["triggerType"] })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="manual">Manual</option>
                    <option value="event">Event</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={!formData.code.trim() || !formData.name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Workflow"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
