import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  Play,
  Download,
  Calendar,
  FileSpreadsheet,
  FileText,
  Clock,
  Filter,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Edit3,
  Copy,
  Star,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  toast,
} from "~/components/ui";
import { ApiError } from "~/lib/api-client";
import {
  useReport,
  useDuplicateReport,
  useAddFavourite,
  useRemoveFavourite,
  useExportReport,
  useExecuteReport,
  useSetSchedule,
  useRemoveSchedule,
} from "../hooks";
import { ScheduleReportDialog } from "../components/ScheduleReportDialog";
import type {
  ReportDefinition as SharedReportDefinition,
  ReportExecutionResult,
} from "../types";

/** Local extension of the shared ReportDefinition that allows legacy config shapes. */
interface ReportDefinition extends Omit<SharedReportDefinition, "config"> {
  config: {
    parameters?: ReportParameter[];
    columns?: ReportColumn[];
    filters?: ReportFilterEntry[];
    [key: string]: unknown;
  };
}

interface ReportFilterEntry {
  field_key: string;
  is_parameter?: boolean;
  parameter_label?: string | null;
  [key: string]: unknown;
}

interface ReportParameter {
  id: string;
  label: string;
  type: "date" | "select" | "text" | "daterange";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}

/** Column shape used for local rendering -- may include alias or header from different sources. */
interface ReportColumn {
  field_key?: string;
  alias?: string;
  header?: string;
  id?: string;
  field?: string;
}

export default function AdminReportPage() {
  const params = useParams();
  const reportId = params.reportId ?? "";
  const navigate = useNavigate();

  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [isFavourited, setIsFavourited] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [resultData, setResultData] = useState<ReportExecutionResult | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  // Fetch the report definition from the backend using the shared hook
  const {
    data: reportResponse,
    isLoading: isLoadingReport,
    isError: isReportError,
    error: reportFetchError,
    refetch: refetchReport,
  } = useReport(reportId);

  const report = reportResponse?.data as unknown as ReportDefinition | undefined;

  // Mutations
  const duplicateReport = useDuplicateReport();
  const addFavourite = useAddFavourite();
  const removeFavourite = useRemoveFavourite();
  const exportReport = useExportReport();
  const executeReport = useExecuteReport(reportId);
  const setSchedule = useSetSchedule(reportId);
  const removeSchedule = useRemoveSchedule(reportId);

  const isRunning = executeReport.isPending;

  // Extract runtime parameters from filters that have is_parameter=true
  const reportParams = report?.config?.parameters ?? [];
  const parameterFilters = (report?.config?.filters ?? []).filter(
    (f) => f.is_parameter
  );
  // Show the legacy parameters UI if defined, or the parameter filters
  const hasParameters = reportParams.length > 0 || parameterFilters.length > 0;

  // Use execution result columns when available
  const resultColumns = resultData?.columns ?? [];
  const resultRows = resultData?.rows ?? [];

  const handleParameterChange = (paramId: string, value: string) => {
    setParameters((prev) => ({ ...prev, [paramId]: value }));
  };

  const handleRunReport = async () => {
    if (!reportId) return;
    setReportError(null);

    try {
      // Build runtime parameters from user-selected values
      const runtimeParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parameters)) {
        if (value && value !== "all") {
          runtimeParams[key] = value;
        }
      }

      const result = await executeReport.mutateAsync({
        parameters: Object.keys(runtimeParams).length > 0 ? runtimeParams : undefined,
      });

      if (result) {
        setResultData(result);
        setHasResults(true);

        if ((result.rows ?? []).length === 0) {
          toast.info("Report completed with no results for the selected parameters.");
        } else {
          toast.success("Report generated successfully");
        }
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to generate report";
      setReportError(message);
      toast.error(message);
      setResultData(null);
      setHasResults(false);
    }
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    const apiFormat = format === "excel" ? "xlsx" : format;
    try {
      await exportReport.mutateAsync({
        id: reportId,
        format: apiFormat as "csv" | "xlsx" | "pdf",
      });
      toast.success(`Report exported as ${format.toUpperCase()}`);
    } catch {
      // Fallback to client-side CSV if server export fails
      if (resultRows.length === 0) {
        toast.info("No data to export. Run the report first.");
        return;
      }
      const headerRow = resultColumns.map((c) => c.label).join(",");
      const dataRows = resultRows.map((row) =>
        resultColumns
          .map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      );
      const csv = [headerRow, ...dataRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report?.name ?? reportId}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported as CSV (client-side fallback)");
    }
  };

  // Loading state for the report definition
  if (isLoadingReport) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Reports
            </Button>
          </Link>
        </div>
        <div className="flex justify-center py-12" role="status">
          <Spinner size="lg" />
          <span className="sr-only">Loading report...</span>
        </div>
      </div>
    );
  }

  // Error state for the report definition
  if (isReportError || !report) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/admin/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Reports
            </Button>
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 font-medium">
            {isReportError ? "Failed to load report" : "Report not found"}
          </p>
          <p className="text-sm text-gray-500">
            {reportFetchError instanceof ApiError
              ? reportFetchError.message
              : "The report you are looking for does not exist or could not be loaded."}
          </p>
          <div className="flex gap-2">
            <Link to="/admin/reports">
              <Button variant="outline">Back to Reports</Button>
            </Link>
            {isReportError && (
              <Button variant="outline" onClick={() => refetchReport()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link to="/admin/reports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Reports
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{report.name}</h1>
          {report.description && (
            <p className="text-gray-600">{report.description}</p>
          )}
          {report.category && (
            <Badge variant="secondary" className="mt-2">
              {report.category}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/reports/${reportId}/edit`}>
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            disabled={duplicateReport.isPending}
            onClick={async () => {
              try {
                const result = await duplicateReport.mutateAsync(reportId);
                toast.success("Report duplicated!");
                if (result?.data?.id) navigate(`/admin/reports/${result.data.id}/edit`);
              } catch {
                toast.error("Failed to duplicate report");
              }
            }}
          >
            <Copy className="h-4 w-4 mr-1" />
            {duplicateReport.isPending ? "Duplicating..." : "Duplicate"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={addFavourite.isPending || removeFavourite.isPending}
            onClick={async () => {
              try {
                if (isFavourited) {
                  await removeFavourite.mutateAsync(reportId);
                  setIsFavourited(false);
                  toast.success("Removed from favourites");
                } else {
                  await addFavourite.mutateAsync(reportId);
                  setIsFavourited(true);
                  toast.success("Added to favourites");
                }
              } catch {
                toast.error("Failed to update favourite");
              }
            }}
          >
            <Star className={`h-4 w-4 mr-1 ${isFavourited ? "fill-yellow-400 text-yellow-500" : ""}`} />
            {isFavourited ? "Unfavourite" : "Favourite"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowScheduleDialog(true)}
          >
            <Calendar className="h-4 w-4 mr-1" />
            {report.isScheduled ? "Edit Schedule" : "Schedule"}
          </Button>
        </div>
      </div>

      {/* Schedule Dialog */}
      {report && (
        <ScheduleReportDialog
          open={showScheduleDialog}
          onClose={() => setShowScheduleDialog(false)}
          report={report as unknown as SharedReportDefinition}
          onSave={async (data) => {
            await setSchedule.mutateAsync(data);
            await refetchReport();
            toast.success(
              report.isScheduled
                ? "Report schedule updated"
                : "Report schedule created"
            );
          }}
          onRemove={
            report.isScheduled
              ? async () => {
                  await removeSchedule.mutateAsync();
                  await refetchReport();
                  toast.success("Report schedule removed");
                }
              : undefined
          }
          loading={setSchedule.isPending || removeSchedule.isPending}
        />
      )}

      {/* Schedule indicator */}
      {report.isScheduled && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <Calendar className="h-4 w-4" />
          <span>
            This report is scheduled to run{" "}
            <strong>{report.scheduleFrequency ?? "periodically"}</strong>
            {report.nextScheduledRun && (
              <>
                . Next run:{" "}
                <strong>
                  {new Date(report.nextScheduledRun).toLocaleString()}
                </strong>
              </>
            )}
          </span>
          <button
            className="ml-auto text-blue-600 underline hover:text-blue-800"
            onClick={() => setShowScheduleDialog(true)}
          >
            Edit
          </button>
        </div>
      )}

      {/* Parameters */}
      {hasParameters && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <h3 className="font-semibold">Report Parameters</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Legacy parameters */}
              {reportParams.map((param) => (
                <div key={param.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {param.label}
                    {param.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {param.type === "select" && param.options ? (
                    <Select
                      value={parameters[param.id] || ""}
                      onChange={(e) => handleParameterChange(param.id, e.target.value)}
                      options={param.options}
                    />
                  ) : (
                    <Input
                      type={param.type === "date" ? "date" : "text"}
                      value={parameters[param.id] || ""}
                      onChange={(e) => handleParameterChange(param.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
              {/* Filter-based parameters from the report builder */}
              {parameterFilters.map((filter) => (
                <div key={filter.field_key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {filter.parameter_label ?? filter.field_key}
                  </label>
                  <Input
                    type="text"
                    value={parameters[filter.field_key] || ""}
                    onChange={(e) => handleParameterChange(filter.field_key, e.target.value)}
                    placeholder={`Enter ${filter.parameter_label ?? filter.field_key}...`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleRunReport} disabled={isRunning}>
                {isRunning ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Report
                  </>
                )}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* No Parameters -- just a run button */}
      {!hasParameters && (
        <div className="flex justify-end">
          <Button onClick={handleRunReport} disabled={isRunning}>
            {isRunning ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Report
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error banner */}
      {reportError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to generate report: {reportError}</span>
          </div>
        </div>
      )}

      {/* Results */}
      {hasResults && !reportError && (
        <>
          {resultRows.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="font-medium text-gray-900 mb-2">No Results</h3>
                <p className="text-gray-500">
                  The report returned no data for the selected parameters. Try
                  adjusting the filters and running again.
                </p>
              </CardBody>
            </Card>
          ) : (
            <>
              {/* Stats + Export Options */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <BarChart3 className="h-4 w-4" />
                    {(resultData?.totalRows ?? resultRows.length).toLocaleString()} row{(resultData?.totalRows ?? resultRows.length) !== 1 ? "s" : ""}
                  </span>
                  {resultData?.executionMs != null && (
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      {resultData.executionMs}ms
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRunReport}
                    disabled={isRunning}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("csv")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("excel")}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("pdf")}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    PDF
                  </Button>
                </div>
              </div>

              {/* Results Table */}
              <Card>
                <CardBody className="p-0 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {resultColumns.map((col) => (
                          <th
                            key={col.key}
                            className={`px-4 py-2.5 font-medium text-gray-500 uppercase tracking-wider text-xs whitespace-nowrap ${
                              col.alignment === "right"
                                ? "text-right"
                                : col.alignment === "center"
                                  ? "text-center"
                                  : "text-left"
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {resultRows.slice(0, 200).map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          {resultColumns.map((col, colIndex) => (
                            <td
                              key={col.key}
                              className={`px-4 py-2 whitespace-nowrap text-gray-700 ${
                                colIndex === 0 ? "font-medium" : ""
                              } ${
                                col.alignment === "right"
                                  ? "text-right tabular-nums"
                                  : col.alignment === "center"
                                    ? "text-center"
                                    : "text-left"
                              }`}
                            >
                              {formatCellValue(row[col.key], col.dataType)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resultRows.length > 200 && (
                    <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 text-center border-t">
                      Showing first 200 of {(resultData?.totalRows ?? resultRows.length).toLocaleString()} rows. Export to see all data.
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}

      {/* Empty State -- before running */}
      {!hasResults && !isRunning && !reportError && (
        <Card>
          <CardBody className="text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="font-medium text-gray-900 mb-2">Ready to Run</h3>
            <p className="text-gray-500">
              {hasParameters
                ? 'Configure your parameters above and click "Run Report" to generate results.'
                : 'Click "Run Report" to generate results.'}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Helper: Format cell values for display
// =============================================================================

function formatCellValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) return "\u2014";
  if (dataType === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString("en-GB");
    } catch {
      return String(value);
    }
  }
  if (dataType === "datetime" && typeof value === "string") {
    try {
      return new Date(value).toLocaleString("en-GB");
    } catch {
      return String(value);
    }
  }
  if (dataType === "boolean") {
    return value ? "Yes" : "No";
  }
  if (dataType === "currency" && typeof value === "number") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(value);
  }
  if (dataType === "percentage" && typeof value === "number") {
    return `${value.toFixed(1)}%`;
  }
  if (
    (dataType === "decimal" || dataType === "integer") &&
    typeof value === "number"
  ) {
    return value.toLocaleString("en-GB");
  }
  return String(value);
}
