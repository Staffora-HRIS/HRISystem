import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
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
  DataTable,
  Spinner,
  toast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";
import {
  useDuplicateReport,
  useAddFavourite,
  useRemoveFavourite,
  useExportReport,
} from "../hooks";

interface ReportDefinition {
  id: string;
  name: string;
  description: string | null;
  reportType: string;
  status: string;
  category: string | null;
  config: {
    parameters?: ReportParameter[];
    columns?: ReportColumn[];
  };
  createdAt: string;
  updatedAt: string;
}

interface ReportParameter {
  id: string;
  label: string;
  type: "date" | "select" | "text" | "daterange";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}

interface ReportColumn {
  id: string;
  header: string;
  field: string;
}

interface ReportExecutionResult {
  columns: string[];
  rows: (string | number)[][];
  totalCount: number;
  executionMs: number;
}

export default function AdminReportPage() {
  const params = useParams();
  const reportId = params.reportId ?? "";
  const navigate = useNavigate();

  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [isFavourited, setIsFavourited] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [reportData, setReportData] = useState<(string | number)[][]>([]);
  const [reportColumns, setReportColumns] = useState<string[]>([]);
  const [reportError, setReportError] = useState<string | null>(null);

  // Fetch the report definition from the backend
  const {
    data: report,
    isLoading: isLoadingReport,
    isError: isReportError,
    error: reportFetchError,
    refetch: refetchReport,
  } = useQuery({
    queryKey: queryKeys.reports.report(reportId),
    queryFn: () => api.get<ReportDefinition>(`/api/v1/reports/${reportId}`),
    enabled: !!reportId,
  });

  // Mutations
  const duplicateReport = useDuplicateReport();
  const addFavourite = useAddFavourite();
  const removeFavourite = useRemoveFavourite();
  const exportReport = useExportReport();

  const reportParams = report?.config?.parameters ?? [];
  const configColumns = report?.config?.columns?.map((c) => c.header) ?? [];

  // Build DataTable column definitions from whichever columns we have
  const activeColumns = reportColumns.length > 0 ? reportColumns : configColumns;

  const tableColumns = useMemo(() => {
    return activeColumns.map((col, idx) => ({
      id: col.toLowerCase().replace(/\s+/g, "_"),
      header: col,
      cell: ({ row }: { row: (string | number)[] }) => (
        <span className={idx === 0 ? "font-medium" : ""}>{row[idx]}</span>
      ),
    }));
  }, [activeColumns]);

  const handleParameterChange = (paramId: string, value: string) => {
    setParameters((prev) => ({ ...prev, [paramId]: value }));
  };

  const handleRunReport = async () => {
    if (!reportId) return;

    setIsRunning(true);
    setReportError(null);

    try {
      // Build query params from user-selected parameters
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(parameters)) {
        if (value && value !== "all") {
          queryParams[key] = value;
        }
      }

      const result = await api.get<ReportExecutionResult>(
        `/api/v1/reports/${reportId}/execute`,
        { params: queryParams }
      );

      if (result.columns) {
        setReportColumns(result.columns);
      }
      setReportData(result.rows ?? []);
      setHasResults(true);

      if ((result.rows ?? []).length === 0) {
        toast.info("Report completed with no results for the selected parameters.");
      } else {
        toast.success("Report generated successfully");
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to generate report";
      setReportError(message);
      toast.error(message);
      setReportData([]);
      setHasResults(false);
    } finally {
      setIsRunning(false);
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
      if (reportData.length === 0) {
        toast.info("No data to export. Run the report first.");
        return;
      }
      const headerRow = activeColumns.join(",");
      const dataRows = reportData.map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      );
      const csv = [headerRow, ...dataRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportId}-${new Date().toISOString().split("T")[0]}.csv`;
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
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <Calendar className="h-4 w-4 mr-1" />
            Schedule
          </Button>
        </div>
      </div>

      {/* Parameters */}
      {reportParams.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <h3 className="font-semibold">Report Parameters</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      {reportParams.length === 0 && (
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
          {reportData.length === 0 ? (
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
              {/* Export Options */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-gray-500" />
                  <span className="font-medium text-gray-700">
                    {reportData.length} results found
                  </span>
                </div>
                <div className="flex gap-2">
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
                <CardBody className="p-0">
                  <DataTable
                    columns={tableColumns}
                    data={reportData}
                    totalCount={reportData.length}
                  />
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
              {reportParams.length > 0
                ? 'Configure your parameters above and click "Run Report" to generate results.'
                : 'Click "Run Report" to generate results.'}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
