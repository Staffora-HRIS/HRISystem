/**
 * Employee Overview Tab
 *
 * Shows contact information, employment details, and compensation summary
 * in a three-column card layout.
 */

import { Link } from "react-router";
import {
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Building2,
  Users,
  Calendar,
  Clock,
  DollarSign,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui";
import type { EmployeeDetail } from "./types";
import { formatDate, formatCurrency, calculateTenure } from "./types";

interface EmployeeOverviewTabProps {
  employee: EmployeeDetail;
}

export function EmployeeOverviewTab({ employee }: EmployeeOverviewTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Contact Info */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Contact Information</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Work Email</p>
              <p className="font-medium">{employee.email}</p>
            </div>
          </div>
          {employee.workPhone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Work Phone</p>
                <p className="font-medium">{employee.workPhone}</p>
              </div>
            </div>
          )}
          {employee.locationName && (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium">{employee.locationName}</p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Employment Info */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Employment Details</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <Briefcase className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Position</p>
              <p className="font-medium">{employee.positionTitle || "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Department</p>
              <p className="font-medium">{employee.departmentName || "-"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Manager</p>
              <p className="font-medium">
                {employee.managerName ? (
                  <Link
                    to={`/admin/hr/employees/${employee.managerId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {employee.managerName}
                  </Link>
                ) : (
                  "-"
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Hire Date</p>
              <p className="font-medium">{formatDate(employee.hireDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Tenure</p>
              <p className="font-medium">{calculateTenure(employee.hireDate)}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Compensation Summary */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Compensation</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Base Salary</p>
              <p className="font-medium text-lg">
                {formatCurrency(employee.baseSalary, employee.currency)}
              </p>
            </div>
          </div>
          {employee.payFrequency && (
            <div>
              <p className="text-sm text-gray-500">Pay Frequency</p>
              <p className="font-medium capitalize">{employee.payFrequency.replace("_", " ")}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500">Employment Type</p>
            <p className="font-medium capitalize">{employee.employmentType.replace("_", " ")}</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
