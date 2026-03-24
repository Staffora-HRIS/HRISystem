/**
 * Deduction Types Tab
 *
 * Search/filter bar and DataTable listing all deduction types.
 */

import { Search, Plus, Minus } from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Button,
} from "~/components/ui";
import {
  CATEGORY_LABELS,
  CATEGORY_BADGE_VARIANTS,
  METHOD_LABELS,
} from "./types";
import type { DeductionType } from "./types";

const CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "tax", label: "Tax" },
  { value: "ni", label: "National Insurance" },
  { value: "pension", label: "Pension" },
  { value: "student_loan", label: "Student Loan" },
  { value: "attachment_of_earnings", label: "Attachment of Earnings" },
  { value: "voluntary", label: "Voluntary" },
  { value: "other", label: "Other" },
];

const typeColumns: ColumnDef<DeductionType>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
          <Minus className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <span className="font-medium text-gray-900">{row.name}</span>
          <p className="text-sm text-gray-500 font-mono">{row.code}</p>
        </div>
      </div>
    ),
  },
  {
    id: "category",
    header: "Category",
    cell: ({ row }) => (
      <Badge variant={CATEGORY_BADGE_VARIANTS[row.category] ?? "default"}>
        {CATEGORY_LABELS[row.category] || row.category}
      </Badge>
    ),
  },
  {
    id: "calculation_method",
    header: "Method",
    cell: ({ row }) => (
      <span className="text-sm text-gray-600">
        {METHOD_LABELS[row.calculation_method] || row.calculation_method}
      </span>
    ),
  },
  {
    id: "is_statutory",
    header: "Type",
    cell: ({ row }) => (
      <Badge
        variant={row.is_statutory ? "warning" : "success"}
        dot
        rounded
      >
        {row.is_statutory ? "Statutory" : "Voluntary"}
      </Badge>
    ),
  },
];

interface DeductionTypesTabProps {
  types: DeductionType[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  onCreateClick: () => void;
}

export function DeductionTypesTab({
  types,
  isLoading,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  onCreateClick,
}: DeductionTypesTabProps) {
  const filteredTypes = types.filter((item) => {
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search types..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value)}
          options={CATEGORY_FILTER_OPTIONS}
        />
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          Add Type
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="text-center py-12">
              <Minus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No deduction types found
              </h3>
              <p className="text-gray-500 mb-4">
                Create your first deduction type to get started
              </p>
              <Button onClick={onCreateClick}>
                <Plus className="h-4 w-4 mr-2" />
                Add Type
              </Button>
            </div>
          ) : (
            <DataTable
              data={filteredTypes}
              columns={typeColumns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
