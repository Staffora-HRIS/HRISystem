import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Pencil,
  Trash2,
  Lock,
  ToggleLeft,
  ToggleRight,
  Tag,
  List,
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
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LookupCategory {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  valueCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface LookupValue {
  id: string;
  tenantId: string;
  categoryId: string;
  categoryCode?: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function LookupValuesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Navigation state: null = category list, string = category id (viewing values)
  const [selectedCategory, setSelectedCategory] = useState<LookupCategory | null>(null);

  // Category state
  const [catSearch, setCatSearch] = useState("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LookupCategory | null>(null);

  // Value state
  const [valSearch, setValSearch] = useState("");
  const [showCreateValue, setShowCreateValue] = useState(false);
  const [editingValue, setEditingValue] = useState<LookupValue | null>(null);

  // ===========================================================================
  // Category Queries & Mutations
  // ===========================================================================

  const categoriesQuery = useQuery({
    queryKey: ["lookup-categories", catSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (catSearch) params.set("search", catSearch);
      params.set("limit", "100");
      return api.get<PaginatedResponse<LookupCategory>>(
        `/lookup-values/categories?${params}`
      );
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: { code: string; name: string; description?: string }) =>
      api.post<LookupCategory>("/lookup-values/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Category created successfully");
      setShowCreateCategory(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create category");
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string | null; isActive?: boolean };
    }) => api.patch<LookupCategory>(`/lookup-values/categories/${id}`, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Category updated");
      setEditingCategory(null);
      // If we updated the currently selected category, refresh it
      if (selectedCategory && updated && selectedCategory.id === updated.id) {
        setSelectedCategory(updated);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update category");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/lookup-values/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Category deleted");
      if (selectedCategory) setSelectedCategory(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete category");
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => api.post("/lookup-values/seed", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Default categories seeded successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to seed defaults");
    },
  });

  // ===========================================================================
  // Value Queries & Mutations
  // ===========================================================================

  const valuesQuery = useQuery({
    queryKey: ["lookup-values", selectedCategory?.id, valSearch],
    queryFn: async () => {
      if (!selectedCategory) return { items: [], nextCursor: null, hasMore: false };
      const params = new URLSearchParams();
      if (valSearch) params.set("search", valSearch);
      params.set("limit", "100");
      return api.get<PaginatedResponse<LookupValue>>(
        `/lookup-values/categories/${selectedCategory.id}/values?${params}`
      );
    },
    enabled: !!selectedCategory,
  });

  const createValueMutation = useMutation({
    mutationFn: (data: {
      code: string;
      label: string;
      description?: string;
      sortOrder?: number;
      isDefault?: boolean;
    }) =>
      api.post<LookupValue>(
        `/lookup-values/categories/${selectedCategory!.id}/values`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-values"] });
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Value created successfully");
      setShowCreateValue(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create value");
    },
  });

  const updateValueMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        label?: string;
        description?: string | null;
        sortOrder?: number;
        isDefault?: boolean;
        isActive?: boolean;
      };
    }) => api.patch<LookupValue>(`/lookup-values/values/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-values"] });
      toast.success("Value updated");
      setEditingValue(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update value");
    },
  });

  const deleteValueMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/lookup-values/values/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-values"] });
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Value deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete value");
    },
  });

  // ===========================================================================
  // Computed
  // ===========================================================================

  const categories = categoriesQuery.data?.items ?? [];
  const values = valuesQuery.data?.items ?? [];

  const stats = {
    totalCategories: categories.length,
    activeCategories: categories.filter((c) => c.isActive).length,
    systemCategories: categories.filter((c) => c.isSystem).length,
    totalValues: categories.reduce((sum, c) => sum + (c.valueCount ?? 0), 0),
  };

  // ===========================================================================
  // Category Table Columns
  // ===========================================================================

  const categoryColumns: ColumnDef<LookupCategory>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left w-full"
          onClick={() => {
            setSelectedCategory(row);
            setValSearch("");
          }}
        >
          <div className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
            {row.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {row.code}
          </div>
        </button>
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.description || "--"}
        </span>
      ),
    },
    {
      id: "values",
      header: "Values",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.valueCount ?? 0}</Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.isSystem && (
            <Badge variant="info">
              <Lock className="h-3 w-3 mr-1 inline" />
              System
            </Badge>
          )}
          <Badge variant={row.isActive ? "success" : "secondary"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
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
              setEditingCategory(row);
            }}
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {!row.isSystem && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  confirm(
                    `Delete category "${row.name}"? This will also delete all its values.`
                  )
                ) {
                  deleteCategoryMutation.mutate(row.id);
                }
              }}
              aria-label={`Delete ${row.name}`}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCategory(row);
              setValSearch("");
            }}
            aria-label={`View values for ${row.name}`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // ===========================================================================
  // Value Table Columns
  // ===========================================================================

  const valueColumns: ColumnDef<LookupValue>[] = [
    {
      id: "label",
      header: "Label",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {row.label}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {row.code}
          </div>
        </div>
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.description || "--"}
        </span>
      ),
    },
    {
      id: "sortOrder",
      header: "Order",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.sortOrder}
        </span>
      ),
    },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.isDefault && <Badge variant="primary">Default</Badge>}
          <Badge variant={row.isActive ? "success" : "secondary"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
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
              setEditingValue(row);
            }}
            aria-label={`Edit ${row.label}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete value "${row.label}"?`)) {
                deleteValueMutation.mutate(row.id);
              }
            }}
            aria-label={`Delete ${row.label}`}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              updateValueMutation.mutate({
                id: row.id,
                data: { isActive: !row.isActive },
              });
            }}
            aria-label={row.isActive ? `Deactivate ${row.label}` : `Activate ${row.label}`}
          >
            {row.isActive ? (
              <ToggleRight className="h-4 w-4 text-green-500" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  // ===========================================================================
  // Render: Category List View
  // ===========================================================================

  if (!selectedCategory) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Lookup Values
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Configure dropdown options for employment types, contract types,
              absence reasons and more
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              loading={seedMutation.isPending}
            >
              <Settings className="h-4 w-4 mr-2" />
              {seedMutation.isPending ? "Seeding..." : "Seed Defaults"}
            </Button>
            <Button onClick={() => setShowCreateCategory(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Categories"
            value={stats.totalCategories}
            icon={<Tag className="h-5 w-5" />}
          />
          <StatCard
            title="Active"
            value={stats.activeCategories}
            icon={<ToggleRight className="h-5 w-5" />}
          />
          <StatCard
            title="System"
            value={stats.systemCategories}
            icon={<Lock className="h-5 w-5" />}
          />
          <StatCard
            title="Total Values"
            value={stats.totalValues}
            icon={<List className="h-5 w-5" />}
          />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search categories..."
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Table */}
        <Card>
          <CardBody className="p-0">
            {categoriesQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12">
                <Tag className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  No lookup categories
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {catSearch
                    ? "No categories match your search"
                    : "Seed default categories or create one manually"}
                </p>
                {!catSearch && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => seedMutation.mutate()}
                      disabled={seedMutation.isPending}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Seed Defaults
                    </Button>
                    <Button onClick={() => setShowCreateCategory(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Category
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <DataTable
                data={categories}
                columns={categoryColumns}
                getRowId={(row) => row.id}
              />
            )}
          </CardBody>
        </Card>

        {/* Create Category Modal */}
        <CreateCategoryModal
          open={showCreateCategory}
          onClose={() => setShowCreateCategory(false)}
          onSubmit={(data) => createCategoryMutation.mutate(data)}
          isPending={createCategoryMutation.isPending}
        />

        {/* Edit Category Modal */}
        {editingCategory && (
          <EditCategoryModal
            category={editingCategory}
            open={!!editingCategory}
            onClose={() => setEditingCategory(null)}
            onSubmit={(data) =>
              updateCategoryMutation.mutate({
                id: editingCategory.id,
                data,
              })
            }
            isPending={updateCategoryMutation.isPending}
          />
        )}
      </div>
    );
  }

  // ===========================================================================
  // Render: Values View (selected category)
  // ===========================================================================

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedCategory(null);
              setValSearch("");
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {selectedCategory.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-mono text-sm">{selectedCategory.code}</span>
              {selectedCategory.description
                ? ` -- ${selectedCategory.description}`
                : ""}
            </p>
          </div>
          {selectedCategory.isSystem && (
            <Badge variant="info">
              <Lock className="h-3 w-3 mr-1 inline" />
              System
            </Badge>
          )}
        </div>
        <Button onClick={() => setShowCreateValue(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Value
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search values..."
          value={valSearch}
          onChange={(e) => setValSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Values Table */}
      <Card>
        <CardBody className="p-0">
          {valuesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : values.length === 0 ? (
            <div className="text-center py-12">
              <List className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No values in this category
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {valSearch
                  ? "No values match your search"
                  : "Add values that will appear in dropdowns"}
              </p>
              {!valSearch && (
                <Button onClick={() => setShowCreateValue(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Value
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={values}
              columns={valueColumns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Value Modal */}
      <CreateValueModal
        open={showCreateValue}
        onClose={() => setShowCreateValue(false)}
        onSubmit={(data) => createValueMutation.mutate(data)}
        isPending={createValueMutation.isPending}
      />

      {/* Edit Value Modal */}
      {editingValue && (
        <EditValueModal
          value={editingValue}
          open={!!editingValue}
          onClose={() => setEditingValue(null)}
          onSubmit={(data) =>
            updateValueMutation.mutate({ id: editingValue.id, data })
          }
          isPending={updateValueMutation.isPending}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Create Category Modal
// ===========================================================================

function CreateCategoryModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { code: string; name: string; description?: string }) => void;
  isPending: boolean;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function reset() {
    setCode("");
    setName("");
    setDescription("");
  }

  function handleClose() {
    if (!isPending) {
      reset();
      onClose();
    }
  }

  function handleSubmit() {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();

    if (!trimmedCode) {
      toast.error("Code is required");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmedCode)) {
      toast.error(
        "Code must start with a lowercase letter and contain only lowercase letters, digits, and underscores"
      );
      return;
    }
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }

    onSubmit({
      code: trimmedCode,
      name: trimmedName,
      description: description.trim() || undefined,
    });
    reset();
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title="Add Lookup Category" />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Code"
            placeholder="e.g. employment_type"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            required
            id="cat-code"
          />
          <p className="text-xs text-gray-500 -mt-2">
            Lowercase letters, digits, underscores only. Used as a machine-readable key.
          </p>
          <Input
            label="Name"
            placeholder="e.g. Employment Type"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            id="cat-name"
          />
          <Input
            label="Description"
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="cat-description"
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!code.trim() || !name.trim() || isPending}
          loading={isPending}
        >
          {isPending ? "Creating..." : "Create Category"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Edit Category Modal
// ===========================================================================

function EditCategoryModal({
  category,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  category: LookupCategory;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
  }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || "");
  const [isActive, setIsActive] = useState(category.isActive);

  function handleClose() {
    if (!isPending) onClose();
  }

  function handleSubmit() {
    const changes: Record<string, unknown> = {};
    if (name.trim() !== category.name) changes.name = name.trim();
    if ((description.trim() || null) !== category.description)
      changes.description = description.trim() || null;
    if (isActive !== category.isActive) changes.isActive = isActive;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    onSubmit(changes as any);
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title={`Edit Category: ${category.code}`} />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            id="edit-cat-name"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="edit-cat-description"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              id="edit-cat-active"
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="edit-cat-active" className="text-sm">
              Active
            </label>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending} loading={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Create Value Modal
// ===========================================================================

function CreateValueModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    code: string;
    label: string;
    description?: string;
    sortOrder?: number;
    isDefault?: boolean;
  }) => void;
  isPending: boolean;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isDefault, setIsDefault] = useState(false);

  function reset() {
    setCode("");
    setLabel("");
    setDescription("");
    setSortOrder("0");
    setIsDefault(false);
  }

  function handleClose() {
    if (!isPending) {
      reset();
      onClose();
    }
  }

  function handleSubmit() {
    const trimmedCode = code.trim();
    const trimmedLabel = label.trim();

    if (!trimmedCode) {
      toast.error("Code is required");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmedCode)) {
      toast.error(
        "Code must start with a lowercase letter and contain only lowercase letters, digits, and underscores"
      );
      return;
    }
    if (!trimmedLabel) {
      toast.error("Label is required");
      return;
    }

    onSubmit({
      code: trimmedCode,
      label: trimmedLabel,
      description: description.trim() || undefined,
      sortOrder: Number(sortOrder) || 0,
      isDefault,
    });
    reset();
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title="Add Lookup Value" />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Code"
            placeholder="e.g. full_time"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            required
            id="val-code"
          />
          <p className="text-xs text-gray-500 -mt-2">
            Machine-readable key. Lowercase, digits, underscores.
          </p>
          <Input
            label="Label"
            placeholder="e.g. Full Time"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            id="val-label"
          />
          <Input
            label="Description"
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="val-description"
          />
          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            id="val-sort-order"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              id="val-is-default"
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="val-is-default" className="text-sm">
              Default selection
            </label>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!code.trim() || !label.trim() || isPending}
          loading={isPending}
        >
          {isPending ? "Creating..." : "Add Value"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Edit Value Modal
// ===========================================================================

function EditValueModal({
  value,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  value: LookupValue;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    label?: string;
    description?: string | null;
    sortOrder?: number;
    isDefault?: boolean;
    isActive?: boolean;
  }) => void;
  isPending: boolean;
}) {
  const [label, setLabel] = useState(value.label);
  const [description, setDescription] = useState(value.description || "");
  const [sortOrder, setSortOrder] = useState(String(value.sortOrder));
  const [isDefault, setIsDefault] = useState(value.isDefault);
  const [isActive, setIsActive] = useState(value.isActive);

  function handleClose() {
    if (!isPending) onClose();
  }

  function handleSubmit() {
    const changes: Record<string, unknown> = {};
    if (label.trim() !== value.label) changes.label = label.trim();
    if ((description.trim() || null) !== value.description)
      changes.description = description.trim() || null;
    if (Number(sortOrder) !== value.sortOrder)
      changes.sortOrder = Number(sortOrder) || 0;
    if (isDefault !== value.isDefault) changes.isDefault = isDefault;
    if (isActive !== value.isActive) changes.isActive = isActive;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    onSubmit(changes as any);
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader title={`Edit Value: ${value.code}`} />
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            id="edit-val-label"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            id="edit-val-description"
          />
          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            id="edit-val-sort-order"
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                id="edit-val-default"
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="edit-val-default" className="text-sm">
                Default
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                id="edit-val-active"
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="edit-val-active" className="text-sm">
                Active
              </label>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending} loading={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
