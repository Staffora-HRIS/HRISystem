export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, FileText, Edit, Star } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface OnboardingTemplate {
  id: string;
  name: string;
  description?: string;
  templateType: "onboarding" | "offboarding" | "transition";
  isActive: boolean;
  isDefault: boolean;
  taskCount: number;
  createdAt: string;
}

export default function OnboardingTemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OnboardingTemplate | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", templateType: "onboarding" as "onboarding" | "offboarding" | "transition" });
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    templateType: "onboarding" as const,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-onboarding-templates"],
    queryFn: () => api.get<{ checklists: OnboardingTemplate[]; count: number }>("/onboarding/checklists"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newTemplate) => api.post("/onboarding/checklists", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding-templates"] });
      setShowCreateModal(false);
      setNewTemplate({ name: "", description: "", templateType: "onboarding" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (templateId: string) => api.patch(`/onboarding/checklists/${templateId}`, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding-templates"] });
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description: string; templateType: string }) =>
      api.patch(`/onboarding/checklists/${data.id}`, {
        name: data.name,
        description: data.description,
        templateType: data.templateType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding-templates"] });
      setEditingTemplate(null);
    },
  });

  const handleOpenEdit = (template: OnboardingTemplate) => {
    setEditForm({
      name: template.name,
      description: template.description ?? "",
      templateType: template.templateType,
    });
    setEditingTemplate(template);
  };

  const templates = data?.checklists || [];

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "onboarding": return <Badge variant="success">Onboarding</Badge>;
      case "offboarding": return <Badge variant="warning">Offboarding</Badge>;
      case "transition": return <Badge variant="info">Transition</Badge>;
      default: return <Badge>{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/onboarding")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Templates</h1>
          <p className="text-gray-600">Manage onboarding checklist templates</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No templates yet</h3>
            <p className="text-gray-500 mb-4">Create your first onboarding template.</p>
            <Button onClick={() => setShowCreateModal(true)}>Create Template</Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{template.name}</h3>
                    {template.isDefault && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  {getTypeBadge(template.templateType)}
                </div>
                <Badge variant={template.isActive ? "success" : "secondary"}>
                  {template.isActive ? "Active" : "Inactive"}
                </Badge>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-500">
                  {template.description || "No description"}
                </p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{template.taskCount} tasks</span>
                  <span>Created {new Date(template.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenEdit(template)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  {!template.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDefaultMutation.mutate(template.id)}
                      disabled={setDefaultMutation.isPending}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="font-semibold">Create Template</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="New Employee Onboarding"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Standard onboarding checklist for new hires..."
                />
              </div>
              <div>
                <label htmlFor="template-type-select" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  id="template-type-select"
                  value={newTemplate.templateType}
                  onChange={(e) => setNewTemplate({ ...newTemplate, templateType: e.target.value as typeof newTemplate.templateType })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                  <option value="transition">Role Transition</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => createMutation.mutate(newTemplate)}
                  disabled={!newTemplate.name.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="font-semibold">Edit Template</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="New Employee Onboarding"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Standard onboarding checklist for new hires..."
                />
              </div>
              <div>
                <label htmlFor="edit-template-type-select" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  id="edit-template-type-select"
                  value={editForm.templateType}
                  onChange={(e) => setEditForm({ ...editForm, templateType: e.target.value as typeof editForm.templateType })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                  <option value="transition">Role Transition</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingTemplate(null)}
                  disabled={editMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => editMutation.mutate({ id: editingTemplate.id, ...editForm })}
                  disabled={!editForm.name.trim() || editMutation.isPending}
                >
                  {editMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
