/**
 * New Report Builder Page
 *
 * Full-featured report builder with:
 * - Left panel: Field catalog browser
 * - Center: Column configurator, filter builder, sort/group config
 * - Bottom: Live preview with data table
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import {
  ArrowLeft,
  Save,
  Play,
  Settings2,
  Table2,
  BarChart3,
  Grid3X3,
  PieChart,
} from "lucide-react";
import { Button, Card, CardBody, CardHeader, toast } from "~/components/ui";
import { useFieldCatalog, useCreateReport } from "../hooks";
import { api } from "~/lib/api-client";
import type { ReportExecutionResult } from "../types";
import { FieldCatalogPanel } from "../components/FieldCatalogPanel";
import { ColumnConfigurator } from "../components/ColumnConfigurator";
import { FilterBuilder } from "../components/FilterBuilder";
import { SortGroupConfig } from "../components/SortGroupConfig";
import { ReportPreview } from "../components/ReportPreview";
import { ChartBuilder, type ChartConfig } from "../components/ChartBuilder";
import { ChartRenderer } from "../components/ChartRenderer";
import type {
  FieldCatalogEntry,
  ColumnConfig,
  FilterConfig,
  SortByConfig,
  GroupByConfig,
  ReportType,
  ReportConfig,
} from "../types";

const REPORT_TYPES: Array<{
  value: ReportType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    value: "tabular",
    label: "Table",
    icon: Table2,
    description: "Standard row-level data table",
  },
  {
    value: "summary",
    label: "Summary",
    icon: BarChart3,
    description: "Aggregated data with group by",
  },
  {
    value: "cross_tab",
    label: "Pivot",
    icon: Grid3X3,
    description: "Cross-tabulation matrix",
  },
  {
    value: "chart",
    label: "Chart",
    icon: PieChart,
    description: "Visual chart report",
  },
];

export default function NewReportPage() {
  const navigate = useNavigate();

  // Report metadata
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reportType, setReportType] = useState<ReportType>("tabular");
  const [category, setCategory] = useState("");

  // Report config
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [sortBy, setSortBy] = useState<SortByConfig[]>([]);
  const [groupBy, setGroupBy] = useState<GroupByConfig[]>([]);
  const [includeTerminated, setIncludeTerminated] = useState(false);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    chartType: "bar",
    showLegend: true,
    showGrid: true,
  });

  // Preview state
  const [previewColumns, setPreviewColumns] = useState<
    Array<{ key: string; label: string; dataType: string; alignment?: string }>
  >([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewMs, setPreviewMs] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [hasPreview, setHasPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<"columns" | "filters" | "sort" | "chart" | "options">(
    "columns"
  );

  // Data fetching
  const { data: catalogData, isLoading: isCatalogLoading } = useFieldCatalog();
  const createReport = useCreateReport();

  const fields = catalogData?.fields ?? [];
  const categories = catalogData?.categories ?? [];

  const fieldsMap = useMemo(
    () => new Map(fields.map((f) => [f.fieldKey, f])),
    [fields]
  );

  const selectedFieldKeys = useMemo(
    () => new Set(columns.map((c) => c.field_key)),
    [columns]
  );

  // Add a field from the catalog as a column
  const handleAddField = useCallback(
    (field: FieldCatalogEntry) => {
      const newCol: ColumnConfig = {
        field_key: field.fieldKey,
        alias: field.displayName,
        width: field.columnWidth,
        visible: true,
        order: columns.length + 1,
        aggregation: null,
      };
      setColumns((prev) => [...prev, newCol]);
    },
    [columns.length]
  );

  // Build report config
  const buildConfig = useCallback((): ReportConfig => {
    return {
      columns: columns.map((c, i) => ({ ...c, order: i + 1 })),
      filters: filters.length > 0 ? filters : undefined,
      sortBy: sortBy.length > 0 ? sortBy : undefined,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
      includeTerminated,
      distinctEmployees: true,
    };
  }, [columns, filters, sortBy, groupBy, includeTerminated]);

  // Run preview — saves draft first if needed, then runs preview endpoint
  const handlePreview = useCallback(async () => {
    if (columns.length === 0) {
      toast.error("Add at least one column before previewing.");
      return;
    }

    setIsRunning(true);
    setPreviewError(null);

    try {
      const config = buildConfig();
      let reportId = savedReportId;

      // Save or update draft
      if (!reportId) {
        const result = await createReport.mutateAsync({
          name: name || "Untitled Report",
          description: description || undefined,
          report_type: reportType,
          category: category || undefined,
          config,
          is_public: false,
        });
        reportId = result?.data?.id ?? null;
        if (!reportId) throw new Error("Failed to create report draft");
        setSavedReportId(reportId);
      } else {
        await api.put(`/reports/${reportId}`, {
          name: name || "Untitled Report",
          description: description || undefined,
          report_type: reportType,
          category: category || undefined,
          config,
        });
      }

      // Execute preview (limited to 25 rows by backend)
      const previewResult = await api.post<ReportExecutionResult>(
        `/reports/${reportId}/execute/preview`,
        {}
      );

      if (previewResult) {
        const cols = (previewResult.columns ?? []).map((c: any) => ({
          key: c.key ?? c.field_key,
          label: c.label ?? c.alias ?? c.key,
          dataType: c.dataType ?? "string",
          alignment: c.alignment,
        }));
        setPreviewColumns(cols);
        setPreviewRows(previewResult.rows ?? []);
        setPreviewTotal(previewResult.totalRows ?? previewResult.rows?.length ?? 0);
        setPreviewMs(previewResult.executionMs ?? 0);
        setHasPreview(true);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate preview";
      setPreviewError(msg);
    } finally {
      setIsRunning(false);
    }
  }, [columns, buildConfig, createReport, name, description, reportType, category, savedReportId]);

  // Save report
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Please enter a report name.");
      return;
    }
    if (columns.length === 0) {
      toast.error("Add at least one column.");
      return;
    }

    try {
      const config = buildConfig();
      let reportId = savedReportId;

      if (reportId) {
        // Update existing draft
        await api.put(`/reports/${reportId}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          report_type: reportType,
          category: category.trim() || undefined,
          config,
        });
      } else {
        // Create new
        const result = await createReport.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          report_type: reportType,
          category: category.trim() || undefined,
          config,
          is_public: false,
        });
        reportId = result?.data?.id ?? null;
        if (reportId) setSavedReportId(reportId);
      }

      toast.success("Report saved successfully!");
      if (reportId) navigate(`/admin/reports/${reportId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save report";
      toast.error(msg);
    }
  }, [name, description, reportType, category, columns, buildConfig, createReport, navigate, savedReportId]);

  // Export stub — will be wired to backend export endpoints
  const handleExport = useCallback(
    (format: "csv" | "xlsx" | "pdf") => {
      if (previewRows.length === 0) {
        toast.info("No data to export. Run the preview first.");
        return;
      }
      // Client-side CSV export for now
      const headerRow = previewColumns.map((c) => c.label).join(",");
      const dataRows = previewRows.map((row) =>
        previewColumns
          .map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      );
      const csv = [headerRow, ...dataRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "report"}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    },
    [previewRows, previewColumns, name]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <input
              type="text"
              aria-label="Report name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled Report"
              className="text-lg font-semibold bg-transparent border-0 border-b-2 border-transparent focus:border-blue-500 focus:ring-0 focus:outline-none px-0 py-0.5 w-64"
            />
            <div className="flex items-center gap-1">
              {REPORT_TYPES.map((rt) => {
                const Icon = rt.icon;
                return (
                  <button
                    key={rt.value}
                    type="button"
                    title={rt.description}
                    onClick={() => setReportType(rt.value)}
                    className={`px-2 py-1 text-xs rounded-md flex items-center gap-1 transition-colors ${
                      reportType === rt.value
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {rt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={isRunning || columns.length === 0}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {isRunning ? "Running..." : "Preview"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={createReport.isPending || !name.trim() || columns.length === 0}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {createReport.isPending ? "Saving..." : "Save Report"}
          </Button>
        </div>
      </div>

      {/* Main Layout: Left Panel + Right Config + Bottom Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Field Catalog */}
        <div className="w-64 shrink-0 overflow-hidden">
          <FieldCatalogPanel
            fields={fields}
            categories={categories}
            selectedFieldKeys={selectedFieldKeys}
            onAddField={handleAddField}
            isLoading={isCatalogLoading}
          />
        </div>

        {/* Right: Config + Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Config tabs */}
          <div className="border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center px-4">
              {(
                [
                  { key: "columns", label: "Columns" },
                  { key: "filters", label: "Filters" },
                  { key: "sort", label: "Sort & Group" },
                  { key: "chart", label: "Chart" },
                  { key: "options", label: "Options" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                  {tab.key === "columns" && columns.length > 0 && (
                    <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                      {columns.length}
                    </span>
                  )}
                  {tab.key === "filters" && filters.length > 0 && (
                    <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                      {filters.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Config panel */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Columns tab */}
              {activeTab === "columns" && (
                <ColumnConfigurator
                  columns={columns}
                  fieldsMap={fieldsMap}
                  onChange={setColumns}
                />
              )}

              {/* Filters tab */}
              {activeTab === "filters" && (
                <FilterBuilder
                  filters={filters}
                  fields={fields}
                  onChange={setFilters}
                />
              )}

              {/* Sort & Group tab */}
              {activeTab === "sort" && (
                <SortGroupConfig
                  sortBy={sortBy}
                  groupBy={groupBy}
                  fields={fields}
                  selectedFieldKeys={selectedFieldKeys}
                  onSortChange={setSortBy}
                  onGroupChange={setGroupBy}
                />
              )}

              {/* Chart tab */}
              {activeTab === "chart" && (
                <ChartBuilder
                  config={chartConfig}
                  columns={columns}
                  fieldsMap={fieldsMap}
                  onChange={setChartConfig}
                />
              )}

              {/* Options tab */}
              {activeTab === "options" && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-gray-500" />
                        <h3 className="font-semibold text-sm">Report Options</h3>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <div>
                        <label
                          htmlFor="report-description"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Description
                        </label>
                        <textarea
                          id="report-description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={2}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Describe the purpose of this report..."
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="report-category"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Category
                        </label>
                        <input
                          id="report-category"
                          type="text"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="e.g. HR Core, Payroll, Compliance..."
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeTerminated}
                            onChange={(e) => setIncludeTerminated(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600"
                          />
                          Include terminated employees
                        </label>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* Preview section — always visible below config */}
              <div className="border-t border-gray-200 pt-4">
                <ReportPreview
                  columns={previewColumns}
                  rows={previewRows}
                  totalRows={previewTotal}
                  executionMs={previewMs}
                  isRunning={isRunning}
                  hasRun={hasPreview}
                  error={previewError}
                  onRun={handlePreview}
                  onExport={handleExport}
                />

                {/* Chart visualization when axes are configured */}
                {hasPreview && chartConfig.xAxis && chartConfig.yAxis?.length && (
                  <div className="mt-4">
                    <ChartRenderer
                      config={chartConfig}
                      data={previewRows}
                      columnLabels={new Map(previewColumns.map((c) => [c.key, c.label]))}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
