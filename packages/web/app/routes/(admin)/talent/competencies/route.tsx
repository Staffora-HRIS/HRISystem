export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Award,
  Search,
  X,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface Competency {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CompetenciesResponse {
  items: Competency[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CompetencyFormData {
  code: string;
  name: string;
  category: string;
  description: string;
}

const initialFormState: CompetencyFormData = {
  code: "",
  name: "",
  category: "core",
  description: "",
};

const categoryColors: Record<string, string> = {
  technical: "bg-blue-100 text-blue-800",
  leadership: "bg-purple-100 text-purple-800",
  core: "bg-green-100 text-green-800",
  functional: "bg-yellow-100 text-yellow-800",
  behavioral: "bg-pink-100 text-pink-800",
  management: "bg-indigo-100 text-indigo-800",
};

const categoryLabels: Record<string, string> = {
  technical: "Technical",
  leadership: "Leadership",
  core: "Core",
  functional: "Functional",
  behavioral: "Behavioral",
  management: "Management",
};

export default function CompetenciesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [editingCompetency, setEditingCompetency] = useState<Competency | null>(null);
  const [formData, setFormData] = useState<CompetencyFormData>(initialFormState);

  const { data, isLoading } = useQuery({
    queryKey: ["competencies", search, categoryFilter],
    queryFn: () =>
      api.get<CompetenciesResponse>("/competencies", {
        params: {
          search: search || undefined,
          category: categoryFilter || undefined,
        },
      }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/competencies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competencies"] });
      toast.success("Competency created successfully");
      closeModal();
    },
    onError: () => {
      toast.error("Failed to create competency", {
        message: "Please check your input and try again.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/competencies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competencies"] });
      toast.success("Competency updated successfully");
      closeModal();
    },
    onError: () => {
      toast.error("Failed to update competency", {
        message: "Please check your input and try again.",
      });
    },
  });

  const openCreateModal = () => {
    setEditingCompetency(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const openEditModal = (competency: Competency) => {
    setEditingCompetency(competency);
    setFormData({
      code: competency.code,
      name: competency.name,
      category: competency.category,
      description: competency.description || "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCompetency(null);
    setFormData(initialFormState);
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.warning("Please fill in required fields");
      return;
    }
    const payload = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      category: formData.category,
      description: formData.description.trim() || undefined,
    };

    if (editingCompetency) {
      updateMutation.mutate({ id: editingCompetency.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const categories = ["technical", "leadership", "core", "functional", "behavioral", "management"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Competency Library</h1>
          <p className="text-gray-600">
            Manage your organization's competency framework
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Add Competency
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {categories.map((cat) => {
          const count = data?.items.filter((c) => c.category === cat).length || 0;
          return (
            <Card
              key={cat}
              className={`cursor-pointer transition-all ${
                categoryFilter === cat ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
            >
              <CardBody className="p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-sm text-gray-500 capitalize">{cat}</p>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search competencies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg"
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Competencies List */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" />
              Competencies
            </h3>
            <span className="text-sm text-gray-500">
              {data?.items.length || 0} competencies
            </span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : data?.items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Award className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No competencies found</p>
              <p className="text-sm">Add competencies to build your framework</p>
            </div>
          ) : (
            <div className="divide-y">
              {data?.items.map((competency) => (
                <div
                  key={competency.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => openEditModal(competency)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditModal(competency); } }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900">
                          {competency.name}
                        </h4>
                        <span className="text-xs text-gray-500">
                          ({competency.code})
                        </span>
                      </div>
                      {competency.description && (
                        <p className="text-sm text-gray-600 line-clamp-1">
                          {competency.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          categoryColors[competency.category] || "bg-gray-100"
                        }`}
                      >
                        {categoryLabels[competency.category] || competency.category}
                      </span>
                      <Badge variant={competency.isActive ? "success" : "secondary"}>
                        {competency.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create/Edit Competency Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" role="dialog" aria-modal="true" aria-label={editingCompetency ? "Edit Competency" : "Create Competency"}>
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingCompetency ? "Edit Competency" : "Create Competency"}
              </h3>
              <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!editingCompetency && (
                <div>
                  <label htmlFor="comp-code" className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input
                    id="comp-code"
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    placeholder="TECH-001"
                  />
                </div>
              )}
              <div>
                <label htmlFor="comp-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  id="comp-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Problem Solving"
                />
              </div>
              <div>
                <label htmlFor="comp-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  id="comp-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="comp-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  id="comp-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Describe this competency..."
                />
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t">
              <Button variant="outline" className="flex-1" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={!formData.name.trim() || (!editingCompetency && !formData.code.trim()) || isSaving}
              >
                {isSaving ? "Saving..." : editingCompetency ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
