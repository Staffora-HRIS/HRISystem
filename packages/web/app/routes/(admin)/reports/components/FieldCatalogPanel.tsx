/**
 * FieldCatalogPanel — Left sidebar of the Report Builder.
 *
 * Displays all reportable fields grouped by category with search,
 * collapsible sections, and click-to-add behaviour.
 */

import { useState, useMemo } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Plus,
  Lock,
  Eye,
  Hash,
  Calendar,
  ToggleLeft,
  Type,
  DollarSign,
  Percent,
  Mail,
  Phone,
  Link2,
  Clock,
  List,
} from "lucide-react";
import type { FieldCatalogEntry, FieldCategory } from "../types";
import { CATEGORY_LABELS } from "../types";

interface FieldCatalogPanelProps {
  fields: FieldCatalogEntry[];
  categories: FieldCategory[];
  selectedFieldKeys: Set<string>;
  onAddField: (field: FieldCatalogEntry) => void;
  isLoading?: boolean;
}

const dataTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  string: Type,
  text: Type,
  integer: Hash,
  decimal: Hash,
  date: Calendar,
  datetime: Calendar,
  time: Clock,
  boolean: ToggleLeft,
  enum: List,
  uuid: Hash,
  currency: DollarSign,
  percentage: Percent,
  duration: Clock,
  email: Mail,
  phone: Phone,
  url: Link2,
  json: Type,
};

export function FieldCatalogPanel({
  fields,
  categories,
  selectedFieldKeys,
  onAddField,
  isLoading,
}: FieldCatalogPanelProps) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.map((c) => c.key))
  );

  const filteredFields = useMemo(() => {
    if (!search.trim()) return fields;
    const q = search.toLowerCase();
    return fields.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.fieldKey.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
    );
  }, [fields, search]);

  const groupedFields = useMemo(() => {
    const map = new Map<string, FieldCatalogEntry[]>();
    for (const f of filteredFields) {
      const existing = map.get(f.category) ?? [];
      existing.push(f);
      map.set(f.category, existing);
    }
    return map;
  }, [filteredFields]);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
        <div className="p-3 border-b border-gray-200">
          <div className="h-9 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 p-3 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          {filteredFields.length} field{filteredFields.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Field tree */}
      <div className="flex-1 overflow-y-auto">
        {categories
          .filter((cat) => groupedFields.has(cat.key))
          .map((cat) => {
            const catFields = groupedFields.get(cat.key) ?? [];
            const isExpanded = expandedCategories.has(cat.key);

            return (
              <div key={cat.key} className="border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  )}
                  <span className="flex-1 text-left truncate">
                    {CATEGORY_LABELS[cat.key] ?? cat.label}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {catFields.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="pb-1">
                    {catFields.map((field) => {
                      const isSelected = selectedFieldKeys.has(field.fieldKey);
                      const TypeIcon = dataTypeIcons[field.dataType] ?? Type;

                      return (
                        <button
                          key={field.fieldKey}
                          type="button"
                          onClick={() => !isSelected && onAddField(field)}
                          disabled={isSelected}
                          title={field.description ?? field.fieldKey}
                          className={`w-full flex items-center gap-2 px-3 pl-8 py-1.5 text-sm transition-colors group ${
                            isSelected
                              ? "text-gray-400 cursor-default bg-blue-50/50"
                              : "text-gray-700 hover:bg-blue-50 cursor-pointer"
                          }`}
                        >
                          <TypeIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 text-left truncate text-xs">
                            {field.displayName}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {field.isPii && (
                              <span title="PII field"><Lock className="h-3 w-3 text-amber-500" /></span>
                            )}
                            {field.isSensitive && (
                              <span title="Sensitive field"><Eye className="h-3 w-3 text-red-400" /></span>
                            )}
                            {!isSelected && (
                              <Plus className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        {filteredFields.length === 0 && (
          <div className="px-3 py-8 text-center">
            <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No fields match "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
