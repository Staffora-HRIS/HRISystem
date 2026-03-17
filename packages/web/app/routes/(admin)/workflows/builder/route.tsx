export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, Trash2, GripVertical } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface WorkflowStep {
  id: string;
  name: string;
  stepType: "approval" | "notification" | "task" | "condition" | "delay";
  assigneeType: "user" | "manager" | "role" | "dynamic";
  assigneeValue: string;
  config: Record<string, unknown>;
}

export default function WorkflowBuilderPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("hr");
  const [triggerType, setTriggerType] = useState<"manual" | "event" | "scheduled">("manual");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/workflows/definitions", data),
    onSuccess: () => navigate("/admin/workflows"),
  });

  const addStep = () => {
    setSteps([...steps, {
      id: `step-${Date.now()}`,
      name: `Step ${steps.length + 1}`,
      stepType: "approval",
      assigneeType: "manager",
      assigneeValue: "",
      config: {},
    }]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, updates: Partial<WorkflowStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      code,
      description,
      category,
      triggerType,
      steps: steps.map((s, i) => ({
        stepOrder: i + 1,
        name: s.name,
        stepType: s.stepType,
        assigneeType: s.assigneeType,
        assigneeValue: s.assigneeValue || undefined,
        config: s.config,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/workflows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Workflow</h1>
          <p className="text-gray-600">Design a new automated workflow</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Basic Information</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Leave Approval Workflow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, "_"))}
                  required
                  className="w-full rounded-md border border-gray-300 p-2 font-mono"
                  placeholder="LEAVE_APPROVAL"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 p-2"
                placeholder="Describe what this workflow does..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="wf-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  id="wf-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Workflow category"
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="hr">HR</option>
                  <option value="time">Time & Attendance</option>
                  <option value="leave">Leave Management</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="performance">Performance</option>
                </select>
              </div>
              <div>
                <label htmlFor="wf-trigger" className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
                <select
                  id="wf-trigger"
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as "manual" | "event" | "scheduled")}
                  aria-label="Trigger type"
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="manual">Manual</option>
                  <option value="event">Event-based</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold">Workflow Steps</h3>
            <Button type="button" variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4 mr-1" />
              Add Step
            </Button>
          </CardHeader>
          <CardBody>
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No steps defined. Click "Add Step" to create workflow steps.
              </div>
            ) : (
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-start gap-4 p-4 border rounded-lg bg-gray-50">
                    <GripVertical className="h-5 w-5 text-gray-400 mt-2 cursor-move" />
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                          Step {index + 1}
                        </span>
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => updateStep(step.id, { name: e.target.value })}
                          className="flex-1 rounded-md border border-gray-300 p-1 text-sm"
                          placeholder="Step name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Step Type</label>
                          <select
                            value={step.stepType}
                            onChange={(e) => updateStep(step.id, { stepType: e.target.value as WorkflowStep["stepType"] })}
                            aria-label="Step type"
                            className="w-full rounded-md border border-gray-300 p-1 text-sm"
                          >
                            <option value="approval">Approval</option>
                            <option value="notification">Notification</option>
                            <option value="task">Task</option>
                            <option value="condition">Condition</option>
                            <option value="delay">Delay</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Assignee Type</label>
                          <select
                            value={step.assigneeType}
                            onChange={(e) => updateStep(step.id, { assigneeType: e.target.value as WorkflowStep["assigneeType"] })}
                            aria-label="Assignee type"
                            className="w-full rounded-md border border-gray-300 p-1 text-sm"
                          >
                            <option value="manager">Manager</option>
                            <option value="user">Specific User</option>
                            <option value="role">Role</option>
                            <option value="dynamic">Dynamic</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStep(step.id)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/workflows")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending || steps.length === 0}>
            {createMutation.isPending ? "Creating..." : "Create Workflow"}
          </Button>
        </div>
      </form>
    </div>
  );
}
