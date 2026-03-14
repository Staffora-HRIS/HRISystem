/**
 * SortGroupConfig — Configure sorting and grouping for the report.
 */

import { X, ArrowUpDown, Group } from "lucide-react";
import type { FieldCatalogEntry, SortByConfig, GroupByConfig } from "../types";

interface SortGroupConfigProps {
  sortBy: SortByConfig[];
  groupBy: GroupByConfig[];
  fields: FieldCatalogEntry[];
  selectedFieldKeys: Set<string>;
  onSortChange: (sortBy: SortByConfig[]) => void;
  onGroupChange: (groupBy: GroupByConfig[]) => void;
}

export function SortGroupConfig({
  sortBy,
  groupBy,
  fields,
  selectedFieldKeys,
  onSortChange,
  onGroupChange,
}: SortGroupConfigProps) {
  const availableFields = fields.filter((f) => selectedFieldKeys.has(f.fieldKey));

  const addSort = (fieldKey: string) => {
    if (!fieldKey) return;
    onSortChange([...sortBy, { field_key: fieldKey, direction: "ASC" }]);
  };

  const removeSort = (index: number) => {
    onSortChange(sortBy.filter((_, i) => i !== index));
  };

  const updateSortDirection = (index: number, direction: "ASC" | "DESC") => {
    const next = [...sortBy];
    next[index] = { ...next[index], direction };
    onSortChange(next);
  };

  const addGroup = (fieldKey: string) => {
    if (!fieldKey) return;
    onGroupChange([...groupBy, { field_key: fieldKey, order: groupBy.length + 1 }]);
  };

  const removeGroup = (index: number) => {
    onGroupChange(
      groupBy
        .filter((_, i) => i !== index)
        .map((g, i) => ({ ...g, order: i + 1 }))
    );
  };

  const getFieldLabel = (key: string) =>
    fields.find((f) => f.fieldKey === key)?.displayName ?? key;

  return (
    <div className="space-y-4">
      {/* Sort By */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <ArrowUpDown className="h-4 w-4" />
          Sort By
        </div>

        {sortBy.map((s, index) => (
          <div
            key={`${s.field_key}-${index}`}
            className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200"
          >
            <span className="text-xs font-medium text-gray-700 flex-1 truncate">
              {getFieldLabel(s.field_key)}
            </span>
            <select
              aria-label="Sort direction"
              value={s.direction ?? "ASC"}
              onChange={(e) =>
                updateSortDirection(index, e.target.value as "ASC" | "DESC")
              }
              className="text-xs border border-gray-300 rounded px-2 py-0.5 bg-white"
            >
              <option value="ASC">A → Z</option>
              <option value="DESC">Z → A</option>
            </select>
            <button
              type="button"
              aria-label="Remove sort"
              onClick={() => removeSort(index)}
              className="text-gray-400 hover:text-red-500 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {availableFields.length > 0 && (
          <select
            aria-label="Add sort field"
            value=""
            onChange={(e) => addSort(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 w-full bg-white"
          >
            <option value="" disabled>
              + Add sort field...
            </option>
            {availableFields
              .filter((f) => !sortBy.some((s) => s.field_key === f.fieldKey))
              .map((f) => (
                <option key={f.fieldKey} value={f.fieldKey}>
                  {f.displayName}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* Group By */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Group className="h-4 w-4" />
          Group By
        </div>

        {groupBy.map((g, index) => (
          <div
            key={`${g.field_key}-${index}`}
            className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200"
          >
            <span className="text-xs font-medium text-gray-700 flex-1 truncate">
              {getFieldLabel(g.field_key)}
            </span>
            <button
              type="button"
              aria-label="Remove group"
              onClick={() => removeGroup(index)}
              className="text-gray-400 hover:text-red-500 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {availableFields.length > 0 && (
          <select
            aria-label="Add group field"
            value=""
            onChange={(e) => addGroup(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 w-full bg-white"
          >
            <option value="" disabled>
              + Add group field...
            </option>
            {availableFields
              .filter(
                (f) =>
                  f.isGroupable && !groupBy.some((g) => g.field_key === f.fieldKey)
              )
              .map((f) => (
                <option key={f.fieldKey} value={f.fieldKey}>
                  {f.displayName}
                </option>
              ))}
          </select>
        )}
      </div>
    </div>
  );
}
