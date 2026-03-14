import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Send,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Button,
  Badge,
  type BadgeVariant,
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

interface LetterTemplate {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
  description: string | null;
  updatedAt: string;
  createdAt: string;
}

interface LetterTemplateListResponse {
  items: LetterTemplate[];
  nextCursor: string | null;
  hasMore: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  offer: "Offer Letter",
  confirmation: "Confirmation",
  promotion: "Promotion",
  warning: "Warning",
  termination: "Termination",
  reference: "Reference",
  custom: "Custom",
};

const TYPE_BADGE_VARIANTS: Record<string, string> = {
  offer: "success",
  confirmation: "info",
  promotion: "primary",
  warning: "warning",
  termination: "error",
  reference: "secondary",
  custom: "secondary",
};

const CATEGORY_LABELS: Record<string, string> = {
  hr: "HR",
  legal: "Legal",
  finance: "Finance",
  operations: "Operations",
  general: "General",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

const STATUS_BADGE_VARIANTS: Record<string, string> = {
  active: "success",
  draft: "warning",
  archived: "secondary",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function LetterTemplatesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("custom");
  const [formCategory, setFormCategory] = useState("hr");

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["admin-letter-templates", search, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      params.set("limit", "50");
      return api.get<LetterTemplateListResponse>(
        `/documents/letters?${params}`
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      type: string;
      category: string;
    }) => api.post("/documents/letters", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-letter-templates"],
      });
      toast.success("Letter template created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error("Failed to create letter template");
    },
  });

  const templates = templatesData?.items ?? [];

  const stats = {
    total: templates.length,
    active: templates.filter((t) => t.status === "active").length,
    draft: templates.filter((t) => t.status === "draft").length,
  };

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormType("custom");
    setFormCategory("hr");
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
      type: formType,
      category: formCategory,
    });
  }

  function handleCloseModal() {
    if (!createMutation.isPending) {
      setShowCreateModal(false);
      resetForm();
    }
  }

  const columns: ColumnDef<LetterTemplate>[] = [
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
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={
            (TYPE_BADGE_VARIANTS[row.type] || "secondary") as BadgeVariant
          }
        >
          {TYPE_LABELS[row.type] || row.type}
        </Badge>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {CATEGORY_LABELS[row.category] || row.category}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            (STATUS_BADGE_VARIANTS[row.status] || "secondary") as BadgeVariant
          }
        >
          {STATUS_LABELS[row.status] || row.status}
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toast.info(`Generate letter from "${row.name}" template`);
            }}
            aria-label={`Generate letter from ${row.name}`}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toast.info(`Template: ${row.name}`, {
                message: `Type: ${TYPE_LABELS[row.type] || row.type} | Category: ${CATEGORY_LABELS[row.category] || row.category}`,
              });
            }}
            aria-label={`View details for ${row.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Letter Templates
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage letter templates and generate letters for employees
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
          title="Draft"
          value={stats.draft}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search letter templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "offer", label: "Offer Letter" },
            { value: "confirmation", label: "Confirmation" },
            { value: "promotion", label: "Promotion" },
            { value: "warning", label: "Warning" },
            { value: "termination", label: "Termination" },
            { value: "reference", label: "Reference" },
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
                No letter templates found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || typeFilter
                  ? "Try adjusting your filters"
                  : "Create your first letter template to get started."}
              </p>
              {!search && !typeFilter && (
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
      <Modal open={showCreateModal} onClose={handleCloseModal} size="lg">
        <ModalHeader title="Create Letter Template" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Template Name"
              placeholder="e.g. Standard Offer Letter"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              id="letter-template-name"
            />
            <Textarea
              label="Description"
              placeholder="Describe the purpose of this letter template..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              id="letter-template-description"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Type"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                options={[
                  { value: "offer", label: "Offer Letter" },
                  { value: "confirmation", label: "Confirmation" },
                  { value: "promotion", label: "Promotion" },
                  { value: "warning", label: "Warning" },
                  { value: "termination", label: "Termination" },
                  { value: "reference", label: "Reference" },
                  { value: "custom", label: "Custom" },
                ]}
                id="letter-template-type"
              />
              <Select
                label="Category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                options={[
                  { value: "hr", label: "HR" },
                  { value: "legal", label: "Legal" },
                  { value: "finance", label: "Finance" },
                  { value: "operations", label: "Operations" },
                  { value: "general", label: "General" },
                ]}
                id="letter-template-category"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseModal}
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
    </div>
  );
}
