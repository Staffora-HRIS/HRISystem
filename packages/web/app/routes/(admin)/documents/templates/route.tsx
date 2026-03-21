export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Search,
  Pencil,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Button,
  Badge,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  format: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface DocumentTemplateListResponse {
  items: DocumentTemplate[];
  nextCursor: string | null;
  hasMore: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  contract: "Contract",
  policy: "Policy",
  certificate: "Certificate",
  nda: "NDA",
  custom: "Custom",
};

const CATEGORY_BADGE_VARIANTS: Record<string, string> = {
  offer_letter: "info",
  contract: "primary",
  policy: "warning",
  certificate: "success",
  nda: "error",
  custom: "secondary",
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DocumentTemplatesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("custom");
  const [formFormat, setFormFormat] = useState("pdf");

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["admin-document-templates", search, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("limit", "50");
      return api.get<DocumentTemplateListResponse>(
        `/documents/templates?${params}`
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      category: string;
      format: string;
    }) => api.post("/documents/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-document-templates"],
      });
      toast.success("Template created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error("Failed to create template");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      id: string;
      name: string;
      description?: string;
      category: string;
      format: string;
    }) => {
      const { id, ...body } = data;
      return api.put(`/documents/templates/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-document-templates"],
      });
      toast.success("Template updated successfully");
      resetForm();
      setEditingTemplate(null);
    },
    onError: () => {
      toast.error("Failed to update template");
    },
  });

  const templates = templatesData?.items ?? [];

  const stats = useMemo(() => ({
    total: templates.length,
    active: templates.filter((t) => t.isActive).length,
    inactive: templates.filter((t) => !t.isActive).length,
  }), [templates]);

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormCategory("custom");
    setFormFormat("pdf");
  }

  function handleCreate() {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error("Template name is required");
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      description: formDescription.trim() || undefined,
      category: formCategory,
      format: formFormat,
    });
  }

  function handleEdit(template: DocumentTemplate) {
    setFormName(template.name);
    setFormDescription(template.description || "");
    setFormCategory(template.category);
    setFormFormat(template.format);
    setEditingTemplate(template);
  }

  function handleUpdate() {
    const trimmedName = formName.trim();
    if (!trimmedName || !editingTemplate) {
      toast.error("Template name is required");
      return;
    }
    updateMutation.mutate({
      id: editingTemplate.id,
      name: trimmedName,
      description: formDescription.trim() || undefined,
      category: formCategory,
      format: formFormat,
    });
  }

  function handleCloseCreateModal() {
    if (!createMutation.isPending) {
      setShowCreateModal(false);
      resetForm();
    }
  }

  function handleCloseEditModal() {
    if (!updateMutation.isPending) {
      setEditingTemplate(null);
      resetForm();
    }
  }

  const columns = useMemo<ColumnDef<DocumentTemplate>[]>(() => [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.name}
        </div>
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-xs truncate text-sm text-gray-500 dark:text-gray-400">
          {row.description || "-"}
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge
          variant={
            (CATEGORY_BADGE_VARIANTS[row.category] || "secondary") as any
          }
        >
          {CATEGORY_LABELS[row.category] || row.category}
        </Badge>
      ),
    },
    {
      id: "format",
      header: "Format",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400 uppercase">
          {FORMAT_LABELS[row.format] || row.format}
        </div>
      ),
    },
    {
      id: "version",
      header: "Version",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          v{row.version}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.isActive ? "success" : "secondary"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "updatedAt",
      header: "Last Updated",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.updatedAt)}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleEdit(row);
          }}
          aria-label={`Edit ${row.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Document Templates
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage document templates for your organization
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Templates"
          value={stats.total}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Active"
          value={stats.active}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Inactive"
          value={stats.inactive}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[
            { value: "", label: "All Categories" },
            { value: "offer_letter", label: "Offer Letter" },
            { value: "contract", label: "Contract" },
            { value: "policy", label: "Policy" },
            { value: "certificate", label: "Certificate" },
            { value: "nda", label: "NDA" },
            { value: "custom", label: "Custom" },
          ]}
        />
      </div>

      {/* Templates Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No templates found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || categoryFilter
                  ? "Try adjusting your filters"
                  : "Create your first document template to get started."}
              </p>
              {!search && !categoryFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={templates}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Template Modal */}
      <Modal open={showCreateModal} onClose={handleCloseCreateModal} size="lg">
        <ModalHeader title="Create Document Template" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Template Name"
              placeholder="e.g. Standard Employment Contract"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              id="template-name"
            />
            <Textarea
              label="Description"
              placeholder="Describe the purpose of this template..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              id="template-description"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                options={[
                  { value: "offer_letter", label: "Offer Letter" },
                  { value: "contract", label: "Contract" },
                  { value: "policy", label: "Policy" },
                  { value: "certificate", label: "Certificate" },
                  { value: "nda", label: "NDA" },
                  { value: "custom", label: "Custom" },
                ]}
                id="template-category"
              />
              <Select
                label="Format"
                value={formFormat}
                onChange={(e) => setFormFormat(e.target.value)}
                options={[
                  { value: "pdf", label: "PDF" },
                  { value: "docx", label: "DOCX" },
                ]}
                id="template-format"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseCreateModal}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!formName.trim() || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Template"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Template Modal */}
      <Modal open={editingTemplate !== null} onClose={handleCloseEditModal} size="lg">
        <ModalHeader title="Edit Document Template" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Template Name"
              placeholder="e.g. Standard Employment Contract"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              id="edit-template-name"
            />
            <Textarea
              label="Description"
              placeholder="Describe the purpose of this template..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              id="edit-template-description"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                options={[
                  { value: "offer_letter", label: "Offer Letter" },
                  { value: "contract", label: "Contract" },
                  { value: "policy", label: "Policy" },
                  { value: "certificate", label: "Certificate" },
                  { value: "nda", label: "NDA" },
                  { value: "custom", label: "Custom" },
                ]}
                id="edit-template-category"
              />
              <Select
                label="Format"
                value={formFormat}
                onChange={(e) => setFormFormat(e.target.value)}
                options={[
                  { value: "pdf", label: "PDF" },
                  { value: "docx", label: "DOCX" },
                ]}
                id="edit-template-format"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseEditModal}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={!formName.trim() || updateMutation.isPending}
            loading={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
