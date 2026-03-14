/**
 * ReportBuilder Component
 *
 * A visual report builder for the Staffora HRIS reporting engine.
 * Users can pick fields from a catalog, add filters, configure grouping/sorting,
 * and see a live preview of the report output.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Lock,
  Hash,
  Calendar,
  Type,
  ToggleLeft,
  ListFilter,
  Percent,
  DollarSign,
  Clock,
  Layers,
  Save,
  Play,
  AlertCircle,
  Table2,
  ArrowUpDown,
  Settings2,
} from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  Badge,
  Spinner,
  Checkbox,
  toast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldCatalogEntry {
  fieldKey: string;
  displayName: string;
  description: string | null;
  category: string;
  dataType: string;
  enumValues: string[] | null;
  isFilterable: boolean;
  isSortable: boolean;
  isGroupable: boolean;
  isAggregatable: boolean;
  supportedAggregations: string[];
  filterOperators: string[] | null;
  isPii: boolean;
  isSensitive: boolean;
  isCalculated: boolean;
  displayOrder: number;
  columnWidth: number;
  textAlignment: string;
  isDefaultVisible: boolean;
}

interface Category {
  key: string;
  label: string;
  fieldCount: number;
}

interface ColumnConfig {
  field_key: string;
  alias?: string;
  visible?: boolean;
  order?: number;
  aggregation?:
    | "count"
    | "count_distinct"
    | "sum"
    | "avg"
    | "min"
    | "max"
    | null;
}

interface FilterConfig {
  field_key: string;
  operator: string;
  value: unknown;
  is_parameter?: boolean;
  parameter_label?: string;
}

interface GroupByConfig {
  field_key: string;
  order?: number;
}

interface SortByConfig {
  field_key: string;
  direction?: "ASC" | "DESC";
}

interface ReportConfig {
  columns: ColumnConfig[];
  filters?: FilterConfig[];
  groupBy?: GroupByConfig[];
  sortBy?: SortByConfig[];
  includeTerminated?: boolean;
  distinctEmployees?: boolean;
  limit?: number | null;
}

interface ReportBuilderProps {
  reportId?: string;
  initialConfig?: ReportConfig;
  initialName?: string;
  initialDescription?: string;
  initialReportType?: string;
  initialCategory?: string;
  onSave?: (report: unknown) => void;
}

interface PreviewResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  executionMs: number;
}

interface FieldCatalogResponse {
  fields: FieldCatalogEntry[];
  categories: Category[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_TYPES = [
  { value: "tabular", label: "Tabular" },
  { value: "summary", label: "Summary" },
  { value: "cross_tab", label: "Pivot / Cross-tab" },
  { value: "chart", label: "Chart" },
];

const AGGREGATION_OPTIONS = [
  { value: "", label: "None" },
  { value: "count", label: "Count" },
  { value: "count_distinct", label: "Count Distinct" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

const OPERATOR_LABELS: Record<string, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  gte: "greater than or equal",
  lt: "less than",
  lte: "less than or equal",
  like: "contains",
  not_like: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  in: "is one of",
  not_in: "is not one of",
  is_null: "is empty",
  is_not_null: "is not empty",
  between: "between",
  is_true: "is true",
  is_false: "is false",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a Lucide icon for a given data type */
function dataTypeIcon(dataType: string): ReactNode {
  switch (dataType) {
    case "integer":
    case "decimal":
      return <Hash className="h-3.5 w-3.5" />;
    case "date":
      return <Calendar className="h-3.5 w-3.5" />;
    case "datetime":
      return <Clock className="h-3.5 w-3.5" />;
    case "boolean":
      return <ToggleLeft className="h-3.5 w-3.5" />;
    case "enum":
      return <ListFilter className="h-3.5 w-3.5" />;
    case "currency":
      return <DollarSign className="h-3.5 w-3.5" />;
    case "percentage":
      return <Percent className="h-3.5 w-3.5" />;
    default:
      return <Type className="h-3.5 w-3.5" />;
  }
}

/** Build a lookup map from field key to FieldCatalogEntry */
function buildFieldMap(
  fields: FieldCatalogEntry[]
): Map<string, FieldCatalogEntry> {
  const map = new Map<string, FieldCatalogEntry>();
  for (const f of fields) {
    map.set(f.fieldKey, f);
  }
  return map;
}

/** Swap two items in an array immutably */
function swapItems<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const tmp = next[from];
  next[from] = next[to];
  next[to] = tmp;
  return next;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * FieldCatalogPanel -- left sidebar listing all available fields grouped
 * by category. Fields can be searched and clicked to add as columns.
 */
function FieldCatalogPanel({
  fields,
  categories,
  selectedKeys,
  isLoading,
  isError,
  onAddField,
}: {
  fields: FieldCatalogEntry[];
  categories: Category[];
  selectedKeys: Set<string>;
  isLoading: boolean;
  isError: boolean;
  onAddField: (fieldKey: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.key))
  );

  // Keep all categories expanded when categories change
  useEffect(() => {
    setExpandedCategories(new Set(categories.map((c) => c.key)));
  }, [categories]);

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const normalizedSearch = search.toLowerCase().trim();

  const filteredByCategory = useMemo(() => {
    const grouped = new Map<string, FieldCatalogEntry[]>();
    for (const cat of categories) {
      grouped.set(cat.key, []);
    }
    for (const field of fields) {
      if (
        normalizedSearch &&
        !field.displayName.toLowerCase().includes(normalizedSearch) &&
        !field.fieldKey.toLowerCase().includes(normalizedSearch)
      ) {
        continue;
      }
      const bucket = grouped.get(field.category);
      if (bucket) {
        bucket.push(field);
      }
    }
    return grouped;
  }, [fields, categories, normalizedSearch]);

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
      aria-label="Field catalog"
    >
      {/* Search */}
      <div className="border-b border-gray-200 p-3 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields..."
            className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            aria-label="Search fields"
          />
        </div>
      </div>

      {/* Fields list */}
      <div className="flex-1 overflow-y-auto p-2" role="tree">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-error-600 dark:text-error-400">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load fields</span>
          </div>
        )}

        {!isLoading &&
          !isError &&
          categories.map((cat) => {
            const catFields = filteredByCategory.get(cat.key) ?? [];
            if (normalizedSearch && catFields.length === 0) return null;
            const isExpanded = expandedCategories.has(cat.key);

            return (
              <div key={cat.key} role="treeitem" aria-expanded={isExpanded}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800"
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${cat.label}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{cat.label}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-gray-400">
                    {catFields.length}
                  </span>
                </button>

                {isExpanded && (
                  <ul className="mb-1 space-y-0.5 pl-3" role="group">
                    {catFields.map((field) => {
                      const isSelected = selectedKeys.has(field.fieldKey);
                      return (
                        <li key={field.fieldKey}>
                          <button
                            type="button"
                            disabled={isSelected}
                            onClick={() => onAddField(field.fieldKey)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-200 disabled:cursor-default disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            title={
                              field.description ??
                              `${field.displayName} (${field.dataType})`
                            }
                            aria-label={`Add ${field.displayName} column`}
                          >
                            <span className="shrink-0 text-gray-400">
                              {dataTypeIcon(field.dataType)}
                            </span>
                            <span className="min-w-0 truncate">
                              {field.displayName}
                            </span>
                            {field.isPii && (
                              <Lock
                                className="ml-auto h-3 w-3 shrink-0 text-amber-500"
                                aria-label="PII field"
                              />
                            )}
                            {isSelected && (
                              <span className="ml-auto text-[10px] text-primary-500">
                                added
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                    {catFields.length === 0 && (
                      <li className="px-2 py-1.5 text-xs text-gray-400">
                        No matching fields
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </aside>
  );
}

/**
 * SelectedColumnsSection -- displays the columns the user has chosen,
 * with alias editing, aggregation selection (for summary reports),
 * and reordering / removal controls.
 */
function SelectedColumnsSection({
  columns,
  fieldMap,
  isSummary,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  columns: ColumnConfig[];
  fieldMap: Map<string, FieldCatalogEntry>;
  isSummary: boolean;
  onUpdate: (index: number, patch: Partial<ColumnConfig>) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-600">
        <Table2 className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No columns selected. Click fields in the catalog to add them.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Selected columns">
      {columns.map((col, idx) => {
        const field = fieldMap.get(col.field_key);
        const displayName = field?.displayName ?? col.field_key;
        const aggOptions = field?.supportedAggregations ?? [];

        return (
          <li
            key={col.field_key}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
          >
            <GripVertical
              className="h-4 w-4 shrink-0 text-gray-300"
              aria-hidden="true"
            />

            {/* Display name / alias */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-gray-400">
                  {field ? dataTypeIcon(field.dataType) : null}
                </span>
                <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {displayName}
                </span>
                {field?.isPii && (
                  <Lock className="h-3 w-3 shrink-0 text-amber-500" />
                )}
              </div>
              {/* Editable alias */}
              <input
                type="text"
                value={col.alias ?? ""}
                onChange={(e) =>
                  onUpdate(idx, {
                    alias: e.target.value || undefined,
                  })
                }
                placeholder="Column alias (optional)"
                className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                aria-label={`Alias for ${displayName}`}
              />
            </div>

            {/* Aggregation dropdown (summary reports) */}
            {isSummary && field?.isAggregatable && aggOptions.length > 0 && (
              <select
                value={col.aggregation ?? ""}
                onChange={(e) =>
                  onUpdate(idx, {
                    aggregation:
                      (e.target.value as ColumnConfig["aggregation"]) || null,
                  })
                }
                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                aria-label={`Aggregation for ${displayName}`}
              >
                {AGGREGATION_OPTIONS.filter(
                  (opt) => opt.value === "" || aggOptions.includes(opt.value)
                ).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {/* Reorder buttons */}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => onMoveUp(idx)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-700"
                aria-label={`Move ${displayName} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === columns.length - 1}
                onClick={() => onMoveDown(idx)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 dark:hover:bg-gray-700"
                aria-label={`Move ${displayName} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Remove */}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              aria-label={`Remove ${displayName}`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * FilterRow -- a single filter configuration row with field selector,
 * operator selector, and a value input adapted to the field data type.
 */
function FilterRow({
  filter,
  index,
  fields,
  fieldMap,
  onUpdate,
  onRemove,
}: {
  filter: FilterConfig;
  index: number;
  fields: FieldCatalogEntry[];
  fieldMap: Map<string, FieldCatalogEntry>;
  onUpdate: (index: number, patch: Partial<FilterConfig>) => void;
  onRemove: (index: number) => void;
}) {
  const field = fieldMap.get(filter.field_key);
  const operators = field?.filterOperators ?? [];

  const filterableFields = useMemo(
    () => fields.filter((f) => f.isFilterable),
    [fields]
  );

  // Value input varies by data type
  const renderValueInput = () => {
    if (!field) {
      return (
        <input
          type="text"
          value={String(filter.value ?? "")}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          placeholder="Value"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter value"
        />
      );
    }

    // Operators that don't need a value
    if (
      filter.operator === "is_null" ||
      filter.operator === "is_not_null" ||
      filter.operator === "is_true" ||
      filter.operator === "is_false"
    ) {
      return null;
    }

    if (field.dataType === "enum" && field.enumValues) {
      return (
        <select
          value={String(filter.value ?? "")}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter value"
        >
          <option value="">Select value...</option>
          {field.enumValues.map((val) => (
            <option key={val} value={val}>
              {val}
            </option>
          ))}
        </select>
      );
    }

    if (field.dataType === "boolean") {
      return (
        <select
          value={String(filter.value ?? "")}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter value"
        >
          <option value="">Select...</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    if (field.dataType === "date" || field.dataType === "datetime") {
      return (
        <input
          type="date"
          value={String(filter.value ?? "")}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter value"
        />
      );
    }

    return (
      <input
        type={
          field.dataType === "integer" || field.dataType === "decimal"
            ? "number"
            : "text"
        }
        value={String(filter.value ?? "")}
        onChange={(e) => onUpdate(index, { value: e.target.value })}
        placeholder="Value"
        className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        aria-label="Filter value"
      />
    );
  };

  return (
    <div className="flex flex-wrap items-start gap-2">
      {/* Field selector */}
      <select
        value={filter.field_key}
        onChange={(e) =>
          onUpdate(index, { field_key: e.target.value, operator: "eq", value: "" })
        }
        className="min-w-[160px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        aria-label="Filter field"
      >
        <option value="">Select field...</option>
        {filterableFields.map((f) => (
          <option key={f.fieldKey} value={f.fieldKey}>
            {f.displayName}
          </option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        value={filter.operator}
        onChange={(e) => onUpdate(index, { operator: e.target.value })}
        disabled={!field}
        className="min-w-[140px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        aria-label="Filter operator"
      >
        {operators.length > 0 ? (
          operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op] ?? op}
            </option>
          ))
        ) : (
          <option value="eq">equals</option>
        )}
      </select>

      {/* Value input */}
      {renderValueInput()}

      {/* Runtime parameter checkbox */}
      <label className="flex items-center gap-1.5 self-center text-xs text-gray-500">
        <input
          type="checkbox"
          checked={filter.is_parameter ?? false}
          onChange={(e) =>
            onUpdate(index, { is_parameter: e.target.checked })
          }
          className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        Prompt at runtime
      </label>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="self-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
        aria-label="Remove filter"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * GroupBySection -- lists fields to group by. Only visible for summary reports.
 */
function GroupBySection({
  groupBy,
  fields,
  fieldMap,
  onAdd,
  onRemove,
}: {
  groupBy: GroupByConfig[];
  fields: FieldCatalogEntry[];
  fieldMap: Map<string, FieldCatalogEntry>;
  onAdd: (fieldKey: string) => void;
  onRemove: (index: number) => void;
}) {
  const [addingField, setAddingField] = useState("");
  const groupableFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          f.isGroupable && !groupBy.some((g) => g.field_key === f.fieldKey)
      ),
    [fields, groupBy]
  );

  return (
    <div className="space-y-2">
      {groupBy.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No group-by fields selected.
        </p>
      )}

      <ul className="space-y-1.5" aria-label="Group by fields">
        {groupBy.map((g, idx) => {
          const field = fieldMap.get(g.field_key);
          return (
            <li
              key={g.field_key}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                {field?.displayName ?? g.field_key}
              </span>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="rounded p-0.5 text-gray-400 hover:text-red-500"
                aria-label={`Remove group by ${field?.displayName ?? g.field_key}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Add group-by field */}
      <div className="flex items-center gap-2">
        <select
          value={addingField}
          onChange={(e) => setAddingField(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Select field to group by"
        >
          <option value="">Select field...</option>
          {groupableFields.map((f) => (
            <option key={f.fieldKey} value={f.fieldKey}>
              {f.displayName}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={!addingField}
          onClick={() => {
            if (addingField) {
              onAdd(addingField);
              setAddingField("");
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * SortBySection -- sort-by rules with field + direction.
 */
function SortBySection({
  sortBy,
  fields,
  fieldMap,
  onAdd,
  onUpdate,
  onRemove,
}: {
  sortBy: SortByConfig[];
  fields: FieldCatalogEntry[];
  fieldMap: Map<string, FieldCatalogEntry>;
  onAdd: (fieldKey: string) => void;
  onUpdate: (index: number, patch: Partial<SortByConfig>) => void;
  onRemove: (index: number) => void;
}) {
  const [addingField, setAddingField] = useState("");
  const sortableFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          f.isSortable && !sortBy.some((s) => s.field_key === f.fieldKey)
      ),
    [fields, sortBy]
  );

  return (
    <div className="space-y-2">
      {sortBy.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No sort rules. Data will be returned in default order.
        </p>
      )}

      <ul className="space-y-1.5" aria-label="Sort rules">
        {sortBy.map((s, idx) => {
          const field = fieldMap.get(s.field_key);
          return (
            <li
              key={s.field_key}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                {field?.displayName ?? s.field_key}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdate(idx, {
                    direction: s.direction === "ASC" ? "DESC" : "ASC",
                  })
                }
                className="rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label={`Toggle sort direction for ${field?.displayName ?? s.field_key}`}
              >
                {s.direction === "DESC" ? "DESC" : "ASC"}
              </button>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="rounded p-0.5 text-gray-400 hover:text-red-500"
                aria-label={`Remove sort on ${field?.displayName ?? s.field_key}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Add sort rule */}
      <div className="flex items-center gap-2">
        <select
          value={addingField}
          onChange={(e) => setAddingField(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Select field to sort by"
        >
          <option value="">Select field...</option>
          {sortableFields.map((f) => (
            <option key={f.fieldKey} value={f.fieldKey}>
              {f.displayName}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={!addingField}
          onClick={() => {
            if (addingField) {
              onAdd(addingField);
              setAddingField("");
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * PreviewTable -- renders preview results from the API as a simple table.
 */
function PreviewTable({
  preview,
  isLoading,
  isError,
  errorMessage,
}: {
  preview: PreviewResponse | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-10">
        <Spinner size="sm" />
        <span className="text-sm text-gray-500">Running preview...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <AlertCircle className="h-6 w-6 text-error-500" />
        <p className="text-sm text-error-600 dark:text-error-400">
          {errorMessage || "Preview failed. Please check your report configuration."}
        </p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-400">
        <Table2 className="h-8 w-8" />
        <p className="text-sm">
          Save the report to enable live preview.
        </p>
      </div>
    );
  }

  if (preview.rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-400">
        <Table2 className="h-8 w-8" />
        <p className="text-sm">No rows matched the current configuration.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Metadata */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700">
        <span>
          Showing {preview.rows.length} of {preview.totalRows.toLocaleString()}{" "}
          rows
        </span>
        <span>{preview.executionMs}ms</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
              {preview.columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {preview.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                {preview.columns.map((col) => (
                  <td
                    key={col}
                    className="whitespace-nowrap px-4 py-2 text-gray-700 dark:text-gray-300"
                  >
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Format a cell value for display */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReportBuilder({
  reportId: initialReportId,
  initialConfig,
  initialName = "",
  initialDescription = "",
  initialReportType = "tabular",
  initialCategory = "",
  onSave,
}: ReportBuilderProps) {
  // ---- Report metadata state ----
  const [reportId, setReportId] = useState<string | undefined>(initialReportId);
  const [reportName, setReportName] = useState(initialName);
  const [reportDescription, setReportDescription] = useState(initialDescription);
  const [reportType, setReportType] = useState(initialReportType);
  const [reportCategory, setReportCategory] = useState(initialCategory);

  // ---- Config state ----
  const [columns, setColumns] = useState<ColumnConfig[]>(
    initialConfig?.columns ?? []
  );
  const [filters, setFilters] = useState<FilterConfig[]>(
    initialConfig?.filters ?? []
  );
  const [groupBy, setGroupBy] = useState<GroupByConfig[]>(
    initialConfig?.groupBy ?? []
  );
  const [sortBy, setSortBy] = useState<SortByConfig[]>(
    initialConfig?.sortBy ?? []
  );
  const [includeTerminated, setIncludeTerminated] = useState(
    initialConfig?.includeTerminated ?? false
  );

  const isSummary = reportType === "summary";

  // ---- Fetch field catalog ----
  const fieldsQuery = useQuery<FieldCatalogResponse>({
    queryKey: ["reports", "fields"],
    queryFn: () => api.get<FieldCatalogResponse>("/reports/fields"),
    staleTime: 5 * 60 * 1000,
  });

  const allFields = fieldsQuery.data?.fields ?? [];
  const categories = fieldsQuery.data?.categories ?? [];
  const fieldMap = useMemo(() => buildFieldMap(allFields), [allFields]);

  const selectedKeys = useMemo(
    () => new Set(columns.map((c) => c.field_key)),
    [columns]
  );

  // ---- Preview (debounced) ----
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);

  // Build current config object
  const currentConfig = useMemo<ReportConfig>(
    () => ({
      columns,
      filters: filters.length > 0 ? filters : undefined,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
      sortBy: sortBy.length > 0 ? sortBy : undefined,
      includeTerminated: includeTerminated || undefined,
    }),
    [columns, filters, groupBy, sortBy, includeTerminated]
  );

  // Trigger debounced preview when config changes and report is saved
  useEffect(() => {
    if (!reportId || columns.length === 0) return;

    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    previewDebounceRef.current = setTimeout(() => {
      setPreviewTrigger((t) => t + 1);
    }, 800);

    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
    };
  }, [reportId, columns, filters, groupBy, sortBy, includeTerminated]);

  const previewQuery = useQuery<PreviewResponse>({
    queryKey: ["reports", reportId, "preview", previewTrigger],
    queryFn: () =>
      api.post<PreviewResponse>(
        `/reports/${reportId}/execute/preview`,
        currentConfig
      ),
    enabled: !!reportId && columns.length > 0 && previewTrigger > 0,
    retry: false,
  });

  // ---- Save mutation ----
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: reportName,
        description: reportDescription || null,
        reportType,
        category: reportCategory || null,
        config: currentConfig,
      };

      if (reportId) {
        return api.put<{ data: { id: string } }>(
          `/reports/${reportId}`,
          payload
        );
      }
      return api.post<{ data: { id: string } }>("/reports", payload);
    },
    onSuccess: (result) => {
      const newId = result?.data?.id;
      if (newId && !reportId) {
        setReportId(newId);
      }
      toast.success("Report saved");
      onSave?.(result);
    },
    onError: () => {
      toast.error("Failed to save report");
    },
  });

  // ---- Column actions ----
  const handleAddField = useCallback(
    (fieldKey: string) => {
      if (selectedKeys.has(fieldKey)) return;
      setColumns((prev) => [
        ...prev,
        { field_key: fieldKey, visible: true, order: prev.length },
      ]);
    },
    [selectedKeys]
  );

  const handleUpdateColumn = useCallback(
    (index: number, patch: Partial<ColumnConfig>) => {
      setColumns((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    []
  );

  const handleRemoveColumn = useCallback((index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMoveColumnUp = useCallback((index: number) => {
    setColumns((prev) => swapItems(prev, index, index - 1));
  }, []);

  const handleMoveColumnDown = useCallback((index: number) => {
    setColumns((prev) => swapItems(prev, index, index + 1));
  }, []);

  // ---- Filter actions ----
  const handleAddFilter = useCallback(() => {
    setFilters((prev) => [
      ...prev,
      { field_key: "", operator: "eq", value: "" },
    ]);
  }, []);

  const handleUpdateFilter = useCallback(
    (index: number, patch: Partial<FilterConfig>) => {
      setFilters((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    []
  );

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ---- Group-by actions ----
  const handleAddGroupBy = useCallback((fieldKey: string) => {
    setGroupBy((prev) => [...prev, { field_key: fieldKey, order: prev.length }]);
  }, []);

  const handleRemoveGroupBy = useCallback((index: number) => {
    setGroupBy((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ---- Sort-by actions ----
  const handleAddSortBy = useCallback((fieldKey: string) => {
    setSortBy((prev) => [...prev, { field_key: fieldKey, direction: "ASC" }]);
  }, []);

  const handleUpdateSortBy = useCallback(
    (index: number, patch: Partial<SortByConfig>) => {
      setSortBy((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    []
  );

  const handleRemoveSortBy = useCallback((index: number) => {
    setSortBy((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ---- Save handler ----
  const handleSave = () => {
    if (!reportName.trim()) {
      toast.warning("Please enter a report name");
      return;
    }
    if (columns.length === 0) {
      toast.warning("Please add at least one column");
      return;
    }
    saveMutation.mutate();
  };

  // ---- Render ----
  return (
    <div className="flex h-full flex-col">
      {/* 3-panel layout: left sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Field catalog */}
        <FieldCatalogPanel
          fields={allFields}
          categories={categories}
          selectedKeys={selectedKeys}
          isLoading={fieldsQuery.isLoading}
          isError={fieldsQuery.isError}
          onAddField={handleAddField}
        />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar: report name + type + actions */}
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Report name"
              className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              aria-label="Report name"
              required
            />

            <input
              type="text"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              placeholder="Description (optional)"
              className="min-w-[160px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
              aria-label="Report description"
            />

            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
              aria-label="Report type"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              placeholder="Category"
              className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
              aria-label="Report category"
            />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                loading={saveMutation.isPending}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Save
              </Button>
              {reportId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setPreviewTrigger((t) => t + 1)}
                  disabled={columns.length === 0}
                  leftIcon={<Play className="h-4 w-4" />}
                >
                  Run Preview
                </Button>
              )}
            </div>
          </div>

          {/* Scrollable config area */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-6">
              {/* Selected columns */}
              <section aria-labelledby="columns-heading">
                <div className="mb-2 flex items-center justify-between">
                  <h2
                    id="columns-heading"
                    className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >
                    <Table2 className="h-4 w-4 text-gray-500" />
                    Columns
                    <Badge variant="secondary" size="sm">
                      {columns.length}
                    </Badge>
                  </h2>
                </div>
                <SelectedColumnsSection
                  columns={columns}
                  fieldMap={fieldMap}
                  isSummary={isSummary}
                  onUpdate={handleUpdateColumn}
                  onRemove={handleRemoveColumn}
                  onMoveUp={handleMoveColumnUp}
                  onMoveDown={handleMoveColumnDown}
                />
              </section>

              {/* Filters */}
              <section aria-labelledby="filters-heading">
                <div className="mb-2 flex items-center justify-between">
                  <h2
                    id="filters-heading"
                    className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >
                    <ListFilter className="h-4 w-4 text-gray-500" />
                    Filters
                    {filters.length > 0 && (
                      <Badge variant="secondary" size="sm">
                        {filters.length}
                      </Badge>
                    )}
                  </h2>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleAddFilter}
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Add Filter
                  </Button>
                </div>
                {filters.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No filters applied. All records will be included.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filters.map((filter, idx) => (
                      <FilterRow
                        key={idx}
                        filter={filter}
                        index={idx}
                        fields={allFields}
                        fieldMap={fieldMap}
                        onUpdate={handleUpdateFilter}
                        onRemove={handleRemoveFilter}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Group By (only for summary reports) */}
              {isSummary && (
                <section aria-labelledby="groupby-heading">
                  <h2
                    id="groupby-heading"
                    className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >
                    <Layers className="h-4 w-4 text-gray-500" />
                    Group By
                    {groupBy.length > 0 && (
                      <Badge variant="secondary" size="sm">
                        {groupBy.length}
                      </Badge>
                    )}
                  </h2>
                  <GroupBySection
                    groupBy={groupBy}
                    fields={allFields}
                    fieldMap={fieldMap}
                    onAdd={handleAddGroupBy}
                    onRemove={handleRemoveGroupBy}
                  />
                </section>
              )}

              {/* Sort By */}
              <section aria-labelledby="sortby-heading">
                <h2
                  id="sortby-heading"
                  className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
                >
                  <ArrowUpDown className="h-4 w-4 text-gray-500" />
                  Sort By
                  {sortBy.length > 0 && (
                    <Badge variant="secondary" size="sm">
                      {sortBy.length}
                    </Badge>
                  )}
                </h2>
                <SortBySection
                  sortBy={sortBy}
                  fields={allFields}
                  fieldMap={fieldMap}
                  onAdd={handleAddSortBy}
                  onUpdate={handleUpdateSortBy}
                  onRemove={handleRemoveSortBy}
                />
              </section>

              {/* Options */}
              <section aria-labelledby="options-heading">
                <h2
                  id="options-heading"
                  className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
                >
                  <Settings2 className="h-4 w-4 text-gray-500" />
                  Options
                </h2>
                <div className="flex flex-wrap items-center gap-6">
                  <Checkbox
                    label="Include terminated employees"
                    checked={includeTerminated}
                    onChange={(e) =>
                      setIncludeTerminated(
                        (e.target as HTMLInputElement).checked
                      )
                    }
                  />
                </div>
              </section>
            </div>
          </div>

          {/* Bottom: Preview */}
          <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Play className="h-4 w-4 text-gray-500" />
                Preview
                {previewQuery.data && (
                  <Badge variant="info" size="sm">
                    {previewQuery.data.totalRows.toLocaleString()} total rows
                  </Badge>
                )}
              </h2>
              {!reportId && columns.length > 0 && (
                <span className="text-xs text-gray-400">
                  Save the report to enable live preview
                </span>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              <PreviewTable
                preview={previewQuery.data ?? null}
                isLoading={previewQuery.isFetching}
                isError={previewQuery.isError}
                errorMessage={
                  previewQuery.error instanceof Error
                    ? previewQuery.error.message
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportBuilder;
