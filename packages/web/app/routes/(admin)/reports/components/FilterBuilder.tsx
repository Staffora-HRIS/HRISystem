/**
 * FilterBuilder — Filter configuration panel for the Report Builder.
 *
 * Each filter row has a field selector, operator, value input, and remove button.
 */

import { useState } from "react";
import { Plus, X, SlidersHorizontal } from "lucide-react";
import type { FieldCatalogEntry, FilterConfig } from "../types";
import { FILTER_OPERATORS } from "../types";

interface FilterBuilderProps {
  filters: FilterConfig[];
  fields: FieldCatalogEntry[];
  onChange: (filters: FilterConfig[]) => void;
}

export function FilterBuilder({ filters, fields, onChange }: FilterBuilderProps) {
  const [showAdd, setShowAdd] = useState(false);

  const getField = (key: string) => fields.find((f) => f.fieldKey === key);

  const getOperatorsForField = (field: FieldCatalogEntry | undefined) => {
    if (!field) return [];
    if (field.filterOperators && field.filterOperators.length > 0) {
      return field.filterOperators;
    }
    return Object.entries(FILTER_OPERATORS)
      .filter(([, def]) => def.types.includes(field.dataType))
      .map(([key]) => key);
  };

  const addFilter = (fieldKey: string) => {
    const field = getField(fieldKey);
    if (!field) return;
    const operators = getOperatorsForField(field);
    const defaultOp = operators[0] ?? "equals";

    onChange([
      ...filters,
      {
        field_key: fieldKey,
        operator: defaultOp,
        value: field.dataType === "enum" && field.enumValues ? [] : null,
      },
    ]);
    setShowAdd(false);
  };

  const updateFilter = (index: number, updates: Partial<FilterConfig>) => {
    const next = [...filters];
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </div>
      </div>

      {filters.length === 0 && !showAdd && (
        <p className="text-xs text-gray-500 italic">No filters applied — all employees included</p>
      )}

      {filters.map((filter, index) => {
        const field = getField(filter.field_key);
        const operators = getOperatorsForField(field);

        return (
          <div
            key={`${filter.field_key}-${index}`}
            className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200"
          >
            {/* Field display */}
            <div className="min-w-0 flex-shrink-0">
              <span className="text-xs font-medium text-gray-700 truncate block max-w-[140px]">
                {field?.displayName ?? filter.field_key}
              </span>
            </div>

            {/* Operator selector */}
            <select
              aria-label="Filter operator"
              value={filter.operator}
              onChange={(e) => updateFilter(index, { operator: e.target.value })}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[100px]"
            >
              {operators.map((op) => (
                <option key={op} value={op}>
                  {FILTER_OPERATORS[op]?.label ?? op}
                </option>
              ))}
            </select>

            {/* Value input */}
            {filter.operator !== "is_null" && filter.operator !== "is_not_null" && (
              <FilterValueInput
                field={field}
                filter={filter}
                onValueChange={(value) => updateFilter(index, { value })}
              />
            )}

            {/* Parameter toggle */}
            <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.is_parameter ?? false}
                onChange={(e) =>
                  updateFilter(index, {
                    is_parameter: e.target.checked,
                    parameter_label: e.target.checked
                      ? field?.displayName ?? filter.field_key
                      : null,
                  })
                }
                className="rounded border-gray-300 text-blue-600"
              />
              <span>Param</span>
            </label>

            {/* Remove */}
            <button
              type="button"
              aria-label="Remove filter"
              onClick={() => removeFilter(index)}
              className="text-gray-400 hover:text-red-500 transition-colors shrink-0 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {/* Add filter */}
      {showAdd ? (
        <div className="bg-white border border-gray-200 rounded-lg p-2">
          <p className="text-xs text-gray-500 mb-1">Select a field to filter on:</p>
          <select
            aria-label="Select field to filter"
            autoFocus
            onChange={(e) => {
              if (e.target.value) addFilter(e.target.value);
            }}
            onBlur={() => setShowAdd(false)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            defaultValue=""
          >
            <option value="" disabled>
              Choose field...
            </option>
            {fields
              .filter((f) => f.isFilterable)
              .map((f) => (
                <option key={f.fieldKey} value={f.fieldKey}>
                  {f.displayName}
                </option>
              ))}
          </select>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Filter
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Filter Value Input — context-sensitive by data type
// ============================================================================

function FilterValueInput({
  field,
  filter,
  onValueChange,
}: {
  field: FieldCatalogEntry | undefined;
  filter: FilterConfig;
  onValueChange: (value: unknown) => void;
}) {
  if (!field) {
    return (
      <input
        type="text"
        value={String(filter.value ?? "")}
        onChange={(e) => onValueChange(e.target.value)}
        className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
        placeholder="Value"
      />
    );
  }

  // Enum fields with in/not_in → multi-select checkboxes
  if (
    field.dataType === "enum" &&
    field.enumValues &&
    (filter.operator === "in" || filter.operator === "not_in")
  ) {
    const selected = Array.isArray(filter.value) ? (filter.value as string[]) : [];
    return (
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-1">
          {field.enumValues.map((val) => (
            <label
              key={val}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-pointer border transition-colors ${
                selected.includes(val)
                  ? "bg-blue-100 border-blue-300 text-blue-800"
                  : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected.includes(val)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onValueChange([...selected, val]);
                  } else {
                    onValueChange(selected.filter((v) => v !== val));
                  }
                }}
              />
              {val.replace(/_/g, " ")}
            </label>
          ))}
        </div>
      </div>
    );
  }

  // Enum fields with equals → select
  if (field.dataType === "enum" && field.enumValues) {
    return (
      <select
        aria-label="Filter value"
        value={String(filter.value ?? "")}
        onChange={(e) => onValueChange(e.target.value)}
        className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
      >
        <option value="">Select...</option>
        {field.enumValues.map((val) => (
          <option key={val} value={val}>
            {val.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    );
  }

  // Date fields
  if (field.dataType === "date" || field.dataType === "datetime") {
    if (filter.operator === "between") {
      const arr = Array.isArray(filter.value) ? (filter.value as string[]) : ["", ""];
      return (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            type="date"
            aria-label="Date from"
            value={arr[0] ?? ""}
            onChange={(e) => onValueChange([e.target.value, arr[1] ?? ""])}
            className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            aria-label="Date to"
            value={arr[1] ?? ""}
            onChange={(e) => onValueChange([arr[0] ?? "", e.target.value])}
            className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
          />
        </div>
      );
    }
    return (
      <input
        type="date"
        aria-label="Filter date value"
        value={String(filter.value ?? "")}
        onChange={(e) => onValueChange(e.target.value)}
        className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
      />
    );
  }

  // Number fields
  if (
    field.dataType === "integer" ||
    field.dataType === "decimal" ||
    field.dataType === "currency" ||
    field.dataType === "percentage"
  ) {
    if (filter.operator === "between") {
      const arr = Array.isArray(filter.value) ? (filter.value as (number | string)[]) : ["", ""];
      return (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            type="number"
            value={arr[0] ?? ""}
            onChange={(e) => onValueChange([e.target.value, arr[1] ?? ""])}
            className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
            placeholder="From"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="number"
            value={arr[1] ?? ""}
            onChange={(e) => onValueChange([arr[0] ?? "", e.target.value])}
            className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
            placeholder="To"
          />
        </div>
      );
    }
    return (
      <input
        type="number"
        value={String(filter.value ?? "")}
        onChange={(e) => onValueChange(e.target.value === "" ? null : Number(e.target.value))}
        className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
        placeholder="Value"
      />
    );
  }

  // Boolean
  if (field.dataType === "boolean") {
    return (
      <select
        aria-label="Filter boolean value"
        value={String(filter.value ?? "")}
        onChange={(e) => onValueChange(e.target.value === "true")}
        className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
      >
        <option value="">Select...</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  // Default: text input
  return (
    <input
      type="text"
      value={String(filter.value ?? "")}
      onChange={(e) => onValueChange(e.target.value)}
      className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1"
      placeholder="Value"
    />
  );
}
