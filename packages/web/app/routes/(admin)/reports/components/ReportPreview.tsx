/**
 * ReportPreview — Shows live preview data in a table when the report is executed.
 */

import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button, Card, CardBody, Spinner } from "~/components/ui";

interface ReportColumn {
  key: string;
  label: string;
  dataType: string;
  alignment?: string;
}

interface ReportPreviewProps {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
  executionMs: number;
  isRunning: boolean;
  hasRun: boolean;
  error: string | null;
  onRun: () => void;
  onExport: (format: "csv" | "xlsx" | "pdf") => void;
}

export function ReportPreview({
  columns,
  rows,
  totalRows,
  executionMs,
  isRunning,
  hasRun,
  error,
  onRun,
  onExport,
}: ReportPreviewProps) {
  // Not yet run
  if (!hasRun && !isRunning && !error) {
    return (
      <Card>
        <CardBody className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">Ready to Preview</h3>
          <p className="text-xs text-gray-500 mb-4">
            Configure your columns and filters, then click Preview to see results.
          </p>
          <Button variant="primary" size="sm" onClick={onRun} disabled={isRunning}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Preview Report
          </Button>
        </CardBody>
      </Card>
    );
  }

  // Running
  if (isRunning) {
    return (
      <Card>
        <CardBody className="text-center py-12">
          <Spinner size="lg" />
          <p className="text-sm text-gray-500 mt-3">Generating preview...</p>
        </CardBody>
      </Card>
    );
  }

  // Error
  if (error) {
    return (
      <Card>
        <CardBody className="py-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm font-medium text-gray-900">Preview Failed</p>
            <p className="text-xs text-red-600 max-w-md">{error}</p>
            <Button variant="outline" size="sm" onClick={onRun}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  // No results
  if (rows.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-12">
          <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">No Results</h3>
          <p className="text-xs text-gray-500">
            The report returned no data. Try adjusting the filters.
          </p>
        </CardBody>
      </Card>
    );
  }

  // Results table
  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            {totalRows.toLocaleString()} row{totalRows !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {executionMs}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRun} disabled={isRunning}>
            <Play className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport("csv")}>
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport("xlsx")}>
            <FileSpreadsheet className="h-3 w-3 mr-1" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport("pdf")}>
            <FileText className="h-3 w-3 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Data table */}
      <Card>
        <CardBody className="p-0 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
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
              {rows.slice(0, 100).map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-1.5 whitespace-nowrap text-gray-700 ${
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
          {rows.length > 100 && (
            <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center border-t">
              Showing first 100 of {totalRows.toLocaleString()} rows. Export to see all data.
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function formatCellValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) return "—";
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
