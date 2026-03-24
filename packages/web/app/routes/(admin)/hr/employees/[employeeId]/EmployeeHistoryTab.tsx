/**
 * Employee History Tab
 *
 * Timeline view of employment history records across multiple dimensions
 * (position, compensation, contract, personal, manager, status).
 */

import { Clock } from "lucide-react";
import { Card, CardHeader, CardBody, Badge } from "~/components/ui";
import type { HistoryRecord } from "./types";
import { formatDate } from "./types";

const HISTORY_DIMENSIONS = ["position", "compensation", "contract", "personal", "manager", "status"] as const;

interface EmployeeHistoryTabProps {
  records: HistoryRecord[];
  isLoading: boolean;
  dimension: string;
  onDimensionChange: (dim: string) => void;
}

export function EmployeeHistoryTab({
  records,
  isLoading,
  dimension,
  onDimensionChange,
}: EmployeeHistoryTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Employment History</h3>
          <div className="flex gap-2">
            {HISTORY_DIMENSIONS.map((dim) => (
              <button
                key={dim}
                onClick={() => onDimensionChange(dim)}
                className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition-colors ${
                  dimension === dim
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {dim}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No history records</h3>
            <p className="text-gray-500">
              No {dimension} history records found for this employee.
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" aria-hidden="true" />
            <div className="space-y-6">
              {records.map((record) => (
                <div key={record.id} className="relative flex gap-4 pl-10">
                  <div className="absolute left-2.5 top-1 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        Effective {formatDate(record.effectiveFrom)}
                      </span>
                      {record.effectiveTo && (
                        <span className="text-sm text-gray-500">
                          to {formatDate(record.effectiveTo)}
                        </span>
                      )}
                      {!record.effectiveTo && (
                        <Badge variant="success" size="sm">Current</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(record.data).map(([key, value]) => (
                        <div key={key}>
                          <p className="text-xs text-gray-500 capitalize">
                            {key.replace(/_/g, " ")}
                          </p>
                          <p className="text-sm text-gray-900">
                            {value != null ? String(value) : "-"}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Recorded {new Date(record.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
