/**
 * ColumnConfigurator — Manages selected report columns with drag-and-drop
 * reordering, alias editing, aggregation selection, and visibility toggles.
 */

import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  X,
  Eye,
  EyeOff,
  Columns3,
} from "lucide-react";
import type { ColumnConfig, FieldCatalogEntry } from "../types";
import { AGGREGATION_LABELS } from "../types";

interface ColumnConfiguratorProps {
  columns: ColumnConfig[];
  fieldsMap: Map<string, FieldCatalogEntry>;
  onChange: (columns: ColumnConfig[]) => void;
}

// Sortable column row component
function SortableColumnRow({
  col,
  index,
  field,
  aggregations,
  onUpdate,
  onRemove,
}: {
  col: ColumnConfig;
  index: number;
  field: FieldCatalogEntry | undefined;
  aggregations: string[];
  onUpdate: (index: number, updates: Partial<ColumnConfig>) => void;
  onRemove: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.field_key + "-" + index });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 bg-white rounded-lg border px-2 py-1.5 group transition-colors ${
        isDragging ? "border-blue-400 shadow-md" : "border-gray-200 hover:border-blue-300"
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Drag to reorder column"
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5 text-gray-300" />
      </button>

      {/* Column alias / name */}
      <div className="flex-1 min-w-0">
        <input
          type="text"
          aria-label="Column alias"
          value={col.alias ?? field?.displayName ?? col.field_key}
          onChange={(e) =>
            onUpdate(index, { alias: e.target.value || undefined })
          }
          className="w-full text-xs font-medium bg-transparent border-0 p-0 focus:ring-0 focus:outline-none text-gray-700 placeholder-gray-400"
          placeholder={field?.displayName ?? col.field_key}
        />
        <span className="text-[10px] text-gray-400 block truncate">
          {col.field_key}
        </span>
      </div>

      {/* Aggregation selector */}
      {aggregations.length > 0 && (
        <select
          aria-label="Column aggregation"
          value={col.aggregation ?? ""}
          onChange={(e) =>
            onUpdate(index, {
              aggregation: (e.target.value || null) as ColumnConfig["aggregation"],
            })
          }
          className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 min-w-[60px]"
        >
          <option value="">Raw</option>
          {aggregations.map((agg) => (
            <option key={agg} value={agg}>
              {AGGREGATION_LABELS[agg] ?? agg}
            </option>
          ))}
        </select>
      )}

      {/* Visibility toggle */}
      <button
        type="button"
        aria-label={col.visible === false ? "Show column" : "Hide column"}
        onClick={() =>
          onUpdate(index, { visible: col.visible === false })
        }
        className={`shrink-0 p-0.5 transition-colors ${
          col.visible === false
            ? "text-gray-300 hover:text-gray-500"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {col.visible === false ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Remove */}
      <button
        type="button"
        aria-label="Remove column"
        onClick={() => onRemove(index)}
        className="shrink-0 text-gray-400 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ColumnConfigurator({
  columns,
  fieldsMap,
  onChange,
}: ColumnConfiguratorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = columns.findIndex(
        (c, i) => c.field_key + "-" + i === active.id
      );
      const newIndex = columns.findIndex(
        (c, i) => c.field_key + "-" + i === over.id
      );
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(columns, oldIndex, newIndex).map(
        (col, i) => ({ ...col, order: i + 1 })
      );
      onChange(reordered);
    },
    [columns, onChange]
  );

  const updateColumn = useCallback(
    (index: number, updates: Partial<ColumnConfig>) => {
      const next = [...columns];
      next[index] = { ...next[index], ...updates };
      onChange(next);
    },
    [columns, onChange]
  );

  const removeColumn = useCallback(
    (index: number) => {
      onChange(
        columns
          .filter((_, i) => i !== index)
          .map((col, i) => ({ ...col, order: i + 1 }))
      );
    },
    [columns, onChange]
  );

  const sortableIds = columns.map((c, i) => c.field_key + "-" + i);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Columns3 className="h-4 w-4" />
          Columns ({columns.length})
        </div>
      </div>

      {columns.length === 0 && (
        <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Columns3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Click fields in the left panel to add columns
          </p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {columns.map((col, index) => {
              const field = fieldsMap.get(col.field_key);
              const aggregations = field?.supportedAggregations ?? [];

              return (
                <SortableColumnRow
                  key={col.field_key + "-" + index}
                  col={col}
                  index={index}
                  field={field}
                  aggregations={aggregations}
                  onUpdate={updateColumn}
                  onRemove={removeColumn}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
