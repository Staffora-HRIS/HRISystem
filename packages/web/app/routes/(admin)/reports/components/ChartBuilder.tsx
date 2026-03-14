/**
 * ChartBuilder — Chart configuration panel for the Report Builder.
 *
 * Allows users to configure chart type, axis mappings, colours, and labels
 * for chart-type reports. Renders a placeholder preview when no charting
 * library is loaded yet (Recharts integration wired separately).
 */

import {
  BarChart3,
  PieChart,
  LineChart,
  TrendingUp,
  Settings2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "~/components/ui";
import type { FieldCatalogEntry, ColumnConfig } from "../types";

export type ChartType = "bar" | "line" | "pie" | "area" | "stacked_bar" | "donut";

export interface ChartConfig {
  chartType: ChartType;
  xAxis?: string; // field_key for the X axis (category)
  yAxis?: string[]; // field_keys for the Y axis (values/measures)
  colorField?: string; // field_key used for colour segmentation
  showLegend?: boolean;
  showLabels?: boolean;
  showGrid?: boolean;
  title?: string;
  palette?: string[];
}

interface ChartBuilderProps {
  config: ChartConfig;
  columns: ColumnConfig[];
  fieldsMap: Map<string, FieldCatalogEntry>;
  onChange: (config: ChartConfig) => void;
}

const CHART_TYPES: Array<{
  value: ChartType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: LineChart },
  { value: "pie", label: "Pie", icon: PieChart },
  { value: "area", label: "Area", icon: TrendingUp },
  { value: "stacked_bar", label: "Stacked Bar", icon: BarChart3 },
  { value: "donut", label: "Donut", icon: PieChart },
];

export function ChartBuilder({
  config,
  columns,
  fieldsMap,
  onChange,
}: ChartBuilderProps) {
  const update = (patch: Partial<ChartConfig>) => {
    onChange({ ...config, ...patch });
  };

  // Categorise columns: dimensions vs measures
  const dimensionColumns = columns.filter((col) => {
    const field = fieldsMap.get(col.field_key);
    return (
      field &&
      (field.dataType === "string" ||
        field.dataType === "enum" ||
        field.dataType === "date" ||
        field.dataType === "boolean")
    );
  });

  const measureColumns = columns.filter((col) => {
    const field = fieldsMap.get(col.field_key);
    return (
      field &&
      (field.dataType === "integer" ||
        field.dataType === "decimal" ||
        field.dataType === "currency" ||
        field.dataType === "percentage") ||
      col.aggregation
    );
  });

  const getLabel = (fieldKey: string) =>
    fieldsMap.get(fieldKey)?.displayName ??
    columns.find((c) => c.field_key === fieldKey)?.alias ??
    fieldKey;

  return (
    <div className="space-y-4">
      {/* Chart Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Chart Type
        </label>
        <div className="grid grid-cols-3 gap-2">
          {CHART_TYPES.map((ct) => {
            const Icon = ct.icon;
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => update({ chartType: ct.value })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  config.chartType === ct.value
                    ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {ct.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Axis Configuration */}
      {config.chartType !== "pie" && config.chartType !== "donut" ? (
        <div className="space-y-3">
          {/* X Axis */}
          <div>
            <label
              htmlFor="chart-x-axis"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              X Axis (Category)
            </label>
            <select
              id="chart-x-axis"
              value={config.xAxis ?? ""}
              onChange={(e) => update({ xAxis: e.target.value || undefined })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select field...</option>
              {dimensionColumns.map((col) => (
                <option key={col.field_key} value={col.field_key}>
                  {col.alias ?? getLabel(col.field_key)}
                </option>
              ))}
            </select>
          </div>

          {/* Y Axis */}
          <div>
            <label
              htmlFor="chart-y-axis"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Y Axis (Measure)
            </label>
            <select
              id="chart-y-axis"
              value={config.yAxis?.[0] ?? ""}
              onChange={(e) =>
                update({ yAxis: e.target.value ? [e.target.value] : undefined })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select field...</option>
              {measureColumns.map((col) => (
                <option key={col.field_key} value={col.field_key}>
                  {col.alias ?? getLabel(col.field_key)}
                  {col.aggregation ? ` (${col.aggregation})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Colour Segmentation */}
          <div>
            <label
              htmlFor="chart-color-field"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Colour By (optional)
            </label>
            <select
              id="chart-color-field"
              value={config.colorField ?? ""}
              onChange={(e) =>
                update({ colorField: e.target.value || undefined })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">None</option>
              {dimensionColumns
                .filter((c) => c.field_key !== config.xAxis)
                .map((col) => (
                  <option key={col.field_key} value={col.field_key}>
                    {col.alias ?? getLabel(col.field_key)}
                  </option>
                ))}
            </select>
          </div>
        </div>
      ) : (
        /* Pie / Donut specific */
        <div className="space-y-3">
          <div>
            <label
              htmlFor="chart-segment"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Segment Field
            </label>
            <select
              id="chart-segment"
              value={config.xAxis ?? ""}
              onChange={(e) => update({ xAxis: e.target.value || undefined })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select field...</option>
              {dimensionColumns.map((col) => (
                <option key={col.field_key} value={col.field_key}>
                  {col.alias ?? getLabel(col.field_key)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="chart-value"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Value Field
            </label>
            <select
              id="chart-value"
              value={config.yAxis?.[0] ?? ""}
              onChange={(e) =>
                update({ yAxis: e.target.value ? [e.target.value] : undefined })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select field...</option>
              {measureColumns.map((col) => (
                <option key={col.field_key} value={col.field_key}>
                  {col.alias ?? getLabel(col.field_key)}
                  {col.aggregation ? ` (${col.aggregation})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Display Options */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-gray-500" />
            <h4 className="text-sm font-medium">Display Options</h4>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <label
              htmlFor="chart-title"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Chart Title
            </label>
            <input
              id="chart-title"
              type="text"
              value={config.title ?? ""}
              onChange={(e) => update({ title: e.target.value || undefined })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Optional chart title"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showLegend ?? true}
                onChange={(e) => update({ showLegend: e.target.checked })}
                className="rounded border-gray-300 text-blue-600"
              />
              Show legend
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showLabels ?? false}
                onChange={(e) => update({ showLabels: e.target.checked })}
                className="rounded border-gray-300 text-blue-600"
              />
              Show data labels
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showGrid ?? true}
                onChange={(e) => update({ showGrid: e.target.checked })}
                className="rounded border-gray-300 text-blue-600"
              />
              Show grid lines
            </label>
          </div>
        </CardBody>
      </Card>

      {/* Chart Preview Placeholder */}
      <Card>
        <CardBody className="text-center py-8">
          <BarChart3 className="h-16 w-16 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Chart Preview</p>
          <p className="text-xs text-gray-400 mt-1">
            {config.xAxis && config.yAxis?.length
              ? "Run the report to see your chart rendered with Recharts"
              : "Configure X and Y axes above to enable chart preview"}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
