/**
 * Employee Deductions Tab
 *
 * Employee ID input and DataTable listing employee deduction assignments.
 */

import { Plus, Minus, Percent } from "lucide-react";
import {
  Card,
  CardBody,
  DataTable,
  type ColumnDef,
  Input,
  Button,
} from "~/components/ui";
import type { EmployeeDeduction } from "./types";

const deductionColumns: ColumnDef<EmployeeDeduction>[] = [
  {
    id: "type",
    header: "Deduction Type",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
          <Minus className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <span className="font-medium text-gray-900">
            {row.deduction_type_name || "Unknown"}
          </span>
          <p className="text-sm text-gray-500 font-mono">
            {row.deduction_type_code || row.deduction_type_id}
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="text-sm font-medium text-gray-900">
        {row.amount != null
          ? `\u00A3${Number(row.amount).toFixed(2)}`
          : row.percentage != null
            ? `${Number(row.percentage).toFixed(2)}%`
            : "-"}
      </span>
    ),
  },
  {
    id: "effective_from",
    header: "From",
    cell: ({ row }) => (
      <span className="text-sm text-gray-600">
        {new Date(row.effective_from).toLocaleDateString("en-GB")}
      </span>
    ),
  },
  {
    id: "effective_to",
    header: "To",
    cell: ({ row }) => (
      <span className="text-sm text-gray-600">
        {row.effective_to
          ? new Date(row.effective_to).toLocaleDateString("en-GB")
          : "Current"}
      </span>
    ),
  },
  {
    id: "reference",
    header: "Reference",
    cell: ({ row }) => (
      <span className="text-sm text-gray-500">
        {row.reference || "-"}
      </span>
    ),
  },
];

interface EmployeeDeductionsTabProps {
  deductions: EmployeeDeduction[];
  isLoading: boolean;
  employeeId: string;
  onEmployeeIdChange: (value: string) => void;
  onCreateClick: () => void;
}

export function EmployeeDeductionsTab({
  deductions,
  isLoading,
  employeeId,
  onEmployeeIdChange,
  onCreateClick,
}: EmployeeDeductionsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="min-w-[200px] max-w-xs">
          <Input
            placeholder="Employee ID"
            value={employeeId}
            onChange={(e) => onEmployeeIdChange(e.target.value)}
          />
        </div>
        <Button onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          Add Deduction
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {!employeeId ? (
            <div className="text-center py-12">
              <Percent className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                Enter an Employee ID
              </h3>
              <p className="text-gray-500">
                Enter an employee ID to view their deduction assignments
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : deductions.length === 0 ? (
            <div className="text-center py-12">
              <Minus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No deductions found
              </h3>
              <p className="text-gray-500 mb-4">
                No deductions for this employee yet
              </p>
              <Button onClick={onCreateClick}>
                <Plus className="h-4 w-4 mr-2" />
                Add Deduction
              </Button>
            </div>
          ) : (
            <DataTable
              data={deductions}
              columns={deductionColumns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
