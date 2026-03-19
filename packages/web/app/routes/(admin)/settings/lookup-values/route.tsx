/**
 * Lookup Values Admin Page
 *
 * Two-level drill-down: categories list -> values list within a category.
 * Supports CRUD for both lookup categories and their values.
 */

import { useState } from "react";
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
} from "~/components/ui";
import type { LookupCategory, LookupValue } from "./types";
import { useLookupValues } from "./use-lookup-values";
import { CreateCategoryModal } from "./CreateCategoryModal";
import { EditCategoryModal } from "./EditCategoryModal";
import { CreateValueModal } from "./CreateValueModal";
import { EditValueModal } from "./EditValueModal";

export default function LookupValuesPage() {
  // Navigation state: null = category list, LookupCategory = viewing values
  const [selectedCategory, setSelectedCategory] =
    useState<LookupCategory | null>(null);

  // Category state
  const [catSearch, setCatSearch] = useState("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<LookupCategory | null>(null);

  // Value state
  const [valSearch, setValSearch] = useState("");
  const [showCreateValue, setShowCreateValue] = useState(false);
  const [editingValue, setEditingValue] = useState<LookupValue | null>(null);

  const {
    categoriesQuery,
    valuesQuery,
    categories,
    values,
    stats,
    createCategoryMutation,
    updateCategoryMutation,
    deleteCategoryMutation,
    seedMutation,
    createValueMutation,
    updateValueMutation,
    deleteValueMutation,
  } = useLookupValues({
    catSearch,
    valSearch,
    selectedCategory,
    onCategoryCreated: () => setShowCreateCategory(false),
    onCategoryUpdated: (updated) => {
      setEditingCategory(null);
      if (selectedCategory && selectedCategory.id === updated.id) {
        setSelectedCategory(updated);
      }
    },
    onCategoryDeleted: () => {
      if (selectedCategory) setSelectedCategory(null);
    },
    onValueCreated: () => setShowCreateValue(false),
    onValueUpdated: () => setEditingValue(null),
  });

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
