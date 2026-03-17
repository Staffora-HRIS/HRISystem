/**
 * ChartBuilder — Chart configuration panel for the Report Builder.
 *
 * Allows users to configure chart type, axis mappings, colours, and labels
 * for chart-type reports. Renders a live sample-data preview using the
 * reusable Staffora chart components when both axes are configured.
 */

import { useMemo } from "react";
import {
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  TrendingUp,
  Settings2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "~/components/ui";
import {
  StafforaBarChart,
  StafforaLineChart,
  StafforaAreaChart,
  StafforaPieChart,
} from "~/components/charts";
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
  { value: "line", label: "Line", icon: LineChartIcon },
  { value: "pie", label: "Pie", icon: PieChartIcon },
  { value: "area", label: "Area", icon: TrendingUp },
  { value: "stacked_bar", label: "Stacked Bar", icon: BarChart3 },
  { value: "donut", label: "Donut", icon: PieChartIcon },
];

/**
 * Generate sample data for the chart preview.
 * Creates plausible-looking data points using the configured axis keys.
 */
function useSampleData(config: ChartConfig) {
  return useMemo(() => {
    const { chartType, xAxis, yAxis } = config;
    if (!xAxis || !yAxis?.length) return { cartesian: [], pie: [] };

    const categories = ["Engineering", "Sales", "Marketing", "Support", "Finance"];

    if (chartType === "pie" || chartType === "donut") {
      return {
        cartesian: [],
        pie: categories.map((name, i) => ({
          name,
          value: 30 + ((i * 17 + 11) % 50),
        })),
      };
    }

    const cartesian = categories.map((cat) => {
      const row: Record<string, unknown> = { [xAxis]: cat };
      for (const yKey of yAxis) {
        // Deterministic sample values based on category and key
        const seed = cat.length + yKey.length;
        row[yKey] = 20 + ((seed * 13 + cat.charCodeAt(0)) % 80);
      }
      return row;
    });

    return { cartesian, pie: [] };
  }, [config]);
}

export function ChartBuilder({
  config,
  columns,
  fieldsMap,
  onChange,
}: ChartBuilderProps) {
  const update = (patch: Partial<ChartConfig>) => {
    onChange({ ...config, ...patch });
  };

  const sampleData = useSampleData(config);

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

  const hasAxes = Boolean(config.xAxis && config.yAxis?.length);

  // Build seriesLabels for preview
  const seriesLabels = useMemo(() => {
    if (!config.yAxis) return undefined;
    const labels: Record<string, string> = {};
    for (const key of config.yAxis) {
      labels[key] = getLabel(key);
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.yAxis, fieldsMap, columns]);

  return (
    <div className="space-y-4">
      {/* Chart Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Chart Type
        </label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Chart type">
          {CHART_TYPES.map((ct) => {
            const Icon = ct.icon;
            const isSelected = config.chartType === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => update({ chartType: ct.value })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                  isSelected
                    ? "border-primary-500 bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-400"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
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
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              X Axis (Category)
            </label>
            <select
              id="chart-x-axis"
              value={config.xAxis ?? ""}
              onChange={(e) => update({ xAxis: e.target.value || undefined })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Y Axis (Measure)
            </label>
            <select
              id="chart-y-axis"
              value={config.yAxis?.[0] ?? ""}
              onChange={(e) =>
                update({ yAxis: e.target.value ? [e.target.value] : undefined })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Colour By (optional)
            </label>
            <select
              id="chart-color-field"
              value={config.colorField ?? ""}
              onChange={(e) =>
                update({ colorField: e.target.value || undefined })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Segment Field
            </label>
            <select
              id="chart-segment"
              value={config.xAxis ?? ""}
              onChange={(e) => update({ xAxis: e.target.value || undefined })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Value Field
            </label>
            <select
              id="chart-value"
              value={config.yAxis?.[0] ?? ""}
              onChange={(e) =>
                update({ yAxis: e.target.value ? [e.target.value] : undefined })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
            <Settings2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <h4 className="text-sm font-medium dark:text-gray-200">Display Options</h4>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <label
              htmlFor="chart-title"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Chart Title
            </label>
            <input
              id="chart-title"
              type="text"
              value={config.title ?? ""}
              onChange={(e) => update({ title: e.target.value || undefined })}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              placeholder="Optional chart title"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showLegend ?? true}
                onChange={(e) => update({ showLegend: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
              />
              Show legend
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showLabels ?? false}
                onChange={(e) => update({ showLabels: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
              />
              Show data labels
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showGrid ?? true}
                onChange={(e) => update({ showGrid: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
              />
              Show grid lines
            </label>
          </div>
        </CardBody>
      </Card>

      {/* Chart Preview */}
      <Card>
        <CardHeader>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Chart Preview
          </h4>
        </CardHeader>
        <CardBody>
          {hasAxes ? (
            <ChartPreview
              config={config}
              sampleCartesian={sampleData.cartesian}
              samplePie={sampleData.pie}
              seriesLabels={seriesLabels}
            />
          ) : (
            <div className="text-center py-6">
              <BarChart3 className="h-12 w-12 text-gray-200 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                Configure axes to see preview
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">
                Select X and Y axis fields above to enable the chart preview
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * Renders a live sample-data chart preview based on the current config.
 */
function ChartPreview({
  config,
  sampleCartesian,
  samplePie,
  seriesLabels,
}: {
  config: ChartConfig;
  sampleCartesian: Record<string, unknown>[];
  samplePie: Array<{ name: string; value: number }>;
  seriesLabels?: Record<string, string>;
}) {
  const { chartType, xAxis, yAxis, showLegend, showGrid, showLabels, title, palette } = config;
  const previewHeight = 240;

  if (!xAxis || !yAxis?.length) return null;

  if (chartType === "bar" || chartType === "stacked_bar") {
    return (
      <StafforaBarChart
        data={sampleCartesian}
        xAxisKey={xAxis}
        yAxisKeys={yAxis}
        seriesLabels={seriesLabels}
        height={previewHeight}
        showGrid={showGrid !== false}
        showLegend={showLegend !== false}
        showLabels={showLabels}
        title={title}
        palette={palette}
        stacked={chartType === "stacked_bar"}
        ariaLabel="Sample bar chart preview"
      />
    );
  }

  if (chartType === "line") {
    return (
      <StafforaLineChart
        data={sampleCartesian}
        xAxisKey={xAxis}
        yAxisKeys={yAxis}
        seriesLabels={seriesLabels}
        height={previewHeight}
        showGrid={showGrid !== false}
        showLegend={showLegend !== false}
        showLabels={showLabels}
        title={title}
        palette={palette}
        ariaLabel="Sample line chart preview"
      />
    );
  }

  if (chartType === "area") {
    return (
      <StafforaAreaChart
        data={sampleCartesian}
        xAxisKey={xAxis}
        yAxisKeys={yAxis}
        seriesLabels={seriesLabels}
        height={previewHeight}
        showGrid={showGrid !== false}
        showLegend={showLegend !== false}
        showLabels={showLabels}
        title={title}
        palette={palette}
        ariaLabel="Sample area chart preview"
      />
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    return (
      <StafforaPieChart
        data={samplePie}
        nameKey="name"
        valueKey="value"
        innerRadius={chartType === "donut" ? 40 : 0}
        outerRadius={80}
        height={previewHeight}
        showLegend={showLegend !== false}
        showLabels={showLabels !== false}
        title={title}
        palette={palette}
        ariaLabel={`Sample ${chartType} chart preview`}
      />
    );
  }

  return null;
}
